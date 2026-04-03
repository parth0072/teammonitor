// routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');
const auth    = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM employees WHERE email = ?',
      [email]
    );
    const emp = rows[0];
    if (!emp) return res.status(401).json({ error: 'Invalid credentials' });
    if (!emp.is_active) return res.status(403).json({ error: 'Account is deactivated' });

    const valid = await bcrypt.compare(password, emp.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Check Jira in a separate query so a missing table never breaks login
    let jira_enabled = 0;
    try {
      const [jr] = await db.query(
        'SELECT id FROM jira_credentials WHERE employee_id = ? LIMIT 1', [emp.id]
      );
      jira_enabled = jr.length > 0 ? 1 : 0;
    } catch (_) { /* table may not exist yet — default to 0 */ }

    const token = jwt.sign(
      { id: emp.id, email: emp.email, role: emp.role, name: emp.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({
      token,
      employee: {
        id:                    emp.id,
        name:                  emp.name,
        email:                 emp.email,
        role:                  emp.role,
        department:            emp.department,
        screenshot_interval:   emp.screenshot_interval   ?? 300,
        break_enabled:         emp.break_enabled         ?? 0,
        break_interval_minutes:emp.break_interval_minutes?? 60,
        idle_warning_minutes:  emp.idle_warning_minutes  ?? 2,
        idle_stop_minutes:     emp.idle_stop_minutes     ?? 5,
        screenshots_enabled:   emp.screenshots_enabled   ?? 1,
        jira_enabled,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/bootstrap  — create an admin account (always open, email must be unique)
router.post('/bootstrap', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, 'admin')",
      [name, email, hash]
    );
    res.status(201).json({ id: result.insertId, name, email, role: 'admin' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register  (admin only — create employees)
router.post('/register', auth, adminOnly, async (req, res) => {
  const { name, email, password, department, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO employees (name, email, password, department, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, hash, department || '', role || 'employee']
    );
    res.status(201).json({ id: result.insertId, name, email, department, role: role || 'employee' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, name, email, role, department,
            screenshot_interval, break_enabled, break_interval_minutes,
            idle_warning_minutes, idle_stop_minutes, screenshots_enabled
     FROM employees WHERE id = ?`,
    [req.user.id]
  );
  res.json(rows[0] || {});
});

module.exports = router;
