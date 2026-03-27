// routes/employees.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// GET /api/employees  (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, department, role, is_active, screenshot_interval, created_at FROM employees ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/employees/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, department, role, is_active, screenshot_interval, created_at FROM employees WHERE id = ?',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/employees/:id  (admin)
router.put('/:id', auth, adminOnly, async (req, res) => {
  const { name, department, role, is_active, password, screenshot_interval } = req.body;
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE employees SET password = ? WHERE id = ?', [hash, req.params.id]);
    }
    const interval = parseInt(screenshot_interval) || 300;
    await db.query(
      'UPDATE employees SET name=?, department=?, role=?, is_active=?, screenshot_interval=? WHERE id=?',
      [name, department, role, is_active, interval, req.params.id]
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
