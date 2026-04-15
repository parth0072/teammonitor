// routes/admin_commands.js – admin remote control commands
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

const VALID_TYPES = ['notify', 'force_punch_out', 'force_break'];
const VALID_ACTIONS = ['none', 'acknowledge', 'take_break', 'punch_out'];

// POST /api/admin/commands  — create a command (admin only)
// body: { employeeId (null=broadcast), commandType, title, message, action }
router.post('/commands', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, commandType, title, message, action = 'none' } = req.body;
    if (!commandType || !VALID_TYPES.includes(commandType))
      return res.status(400).json({ error: `commandType must be one of: ${VALID_TYPES.join(', ')}` });
    if (!VALID_ACTIONS.includes(action))
      return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
    if (commandType === 'notify' && !message)
      return res.status(400).json({ error: 'message required for notify commands' });

    const payload = JSON.stringify({ title: title || null, message: message || null, action });
    const [result] = await db.query(
      `INSERT INTO admin_commands (employee_id, command_type, payload, created_by)
       VALUES (?, ?, ?, ?)`,
      [employeeId || null, commandType, payload, req.user.id]
    );
    res.status(201).json({ id: result.insertId, ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/commands  — list recent commands (admin only)
// query: ?employeeId=X (optional), ?limit=50
router.get('/commands', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, limit = 50 } = req.query;
    const where = employeeId
      ? 'WHERE (c.employee_id=? OR c.employee_id IS NULL)'
      : '';
    const params = employeeId ? [employeeId] : [];
    params.push(Math.min(parseInt(limit) || 50, 200));

    const [rows] = await db.query(
      `SELECT c.id, c.employee_id, c.command_type, c.payload, c.status,
              c.created_at, c.delivered_at,
              e.name AS employee_name,
              a.name AS created_by_name
       FROM admin_commands c
       LEFT JOIN employees e ON e.id = c.employee_id
       LEFT JOIN employees a ON a.id = c.created_by
       ${where}
       ORDER BY c.created_at DESC LIMIT ?`,
      params
    );
    res.json(rows.map(r => ({
      ...r,
      payload: r.payload ? JSON.parse(r.payload) : {},
      employee_name: r.employee_name || 'All employees',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/commands/:id  — cancel a pending command (admin only)
router.delete('/commands/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query(
      `UPDATE admin_commands SET status='cancelled' WHERE id=? AND status='pending'`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/tracking-lock  — lock or unlock tracking for an employee
// body: { employeeId, locked: true/false }
router.put('/tracking-lock', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, locked } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    await db.query('UPDATE employees SET tracking_locked=? WHERE id=?', [locked ? 1 : 0, employeeId]);

    // Also queue a lock/unlock command so the agent reacts on next heartbeat
    const commandType = locked ? 'lock_tracking' : 'unlock_tracking';
    await db.query(
      `INSERT INTO admin_commands (employee_id, command_type, payload, created_by) VALUES (?, ?, ?, ?)`,
      [employeeId, commandType, JSON.stringify({ action: 'none' }), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/slack-report  — send Slack digest for a specific date (admin only)
// body: { date: 'YYYY-MM-DD' }
router.post('/slack-report', auth, adminOnly, async (req, res) => {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return res.status(400).json({ error: 'SLACK_WEBHOOK_URL is not configured on the server' });

    const date = req.body.date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const { sendSlackDigestForDate } = require('../utils/dailyMail');
    const count = await sendSlackDigestForDate(date);
    res.json({ ok: true, date, employees: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
