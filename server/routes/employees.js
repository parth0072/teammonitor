// routes/employees.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encrypt');

const EMP_COLS = `id, name, email, department, role, is_active,
  screenshot_interval, break_enabled, break_interval_minutes,
  idle_warning_minutes, idle_stop_minutes, screenshots_enabled,
  jira_url, jira_email,
  CASE WHEN jira_api_token IS NOT NULL THEN 1 ELSE 0 END AS jira_configured,
  created_at`;

// GET /api/employees  (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT ${EMP_COLS} FROM employees ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/employees/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT ${EMP_COLS} FROM employees WHERE id = ?`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/employees/:id  (admin)
router.put('/:id', auth, adminOnly, async (req, res) => {
  const {
    name, department, role, is_active, password,
    screenshot_interval, break_enabled, break_interval_minutes,
    idle_warning_minutes, idle_stop_minutes, screenshots_enabled,
    jira_url, jira_email, jira_api_token,
    jira_clear,
  } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE employees SET password = ? WHERE id = ?', [hash, req.params.id]);
    }

    // Jira token: only update if a new one is provided, clear if jira_clear=true
    let jiraTokenSql = '';
    let jiraTokenVal = [];
    if (jira_clear) {
      jiraTokenSql = ', jira_url=NULL, jira_email=NULL, jira_api_token=NULL';
    } else if (jira_api_token) {
      jiraTokenSql = ', jira_url=?, jira_email=?, jira_api_token=?';
      jiraTokenVal = [jira_url || null, jira_email || null, encrypt(jira_api_token)];
    } else if (jira_url || jira_email) {
      // Update URL/email without touching the token
      jiraTokenSql = ', jira_url=?, jira_email=?';
      jiraTokenVal = [jira_url || null, jira_email || null];
    }

    await db.query(
      `UPDATE employees SET
        name=?, department=?, role=?, is_active=?,
        screenshot_interval=?,
        break_enabled=?, break_interval_minutes=?,
        idle_warning_minutes=?, idle_stop_minutes=?,
        screenshots_enabled=?
        ${jiraTokenSql}
       WHERE id=?`,
      [
        name, department, role, is_active,
        parseInt(screenshot_interval) || 300,
        break_enabled ? 1 : 0,
        parseInt(break_interval_minutes) || 60,
        parseInt(idle_warning_minutes) || 2,
        parseInt(idle_stop_minutes) || 5,
        screenshots_enabled ? 1 : 0,
        ...jiraTokenVal,
        req.params.id,
      ]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/employees/:id  (admin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('UPDATE employees SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
