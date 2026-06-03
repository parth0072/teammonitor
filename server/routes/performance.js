// routes/performance.js — performance log CRUD
const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { auth, adminOnly } = require('../middleware/auth');

// ── GET /performance — list logs ──────────────────────────────────────────────
// Admin: all employees; Employee: own only
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin   = req.user.role === 'admin';
    const empFilter = isAdmin ? (req.query.employeeId || null) : req.user.id;
    const rating    = req.query.rating    || null;
    const startDate = req.query.startDate || null;
    const endDate   = req.query.endDate   || null;

    let sql = `
      SELECT
        pl.id, pl.employee_id, pl.logged_by, pl.rating, pl.category,
        pl.title, pl.description, pl.event_date, pl.event_time, pl.created_at,
        e.name  AS employee_name,
        lb.name AS logged_by_name
      FROM performance_logs pl
      JOIN employees e  ON e.id  = pl.employee_id
      JOIN employees lb ON lb.id = pl.logged_by
      WHERE 1=1
    `;
    const params = [];

    if (empFilter) { sql += ' AND pl.employee_id = ?'; params.push(empFilter); }
    if (rating)    { sql += ' AND pl.rating = ?';      params.push(rating); }
    if (startDate) { sql += ' AND pl.event_date >= ?'; params.push(startDate); }
    if (endDate)   { sql += ' AND pl.event_date <= ?'; params.push(endDate); }

    sql += ' ORDER BY pl.event_date DESC, pl.event_time DESC, pl.created_at DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[performance] GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /performance — create log (admin only) ───────────────────────────────
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, rating, category, title, description, eventDate, eventTime } = req.body;
    if (!employeeId || !rating || !category || !title || !eventDate) {
      return res.status(400).json({ error: 'employeeId, rating, category, title, eventDate are required' });
    }
    if (!['good', 'bad'].includes(rating)) {
      return res.status(400).json({ error: 'rating must be "good" or "bad"' });
    }
    const [result] = await db.query(
      `INSERT INTO performance_logs
         (employee_id, logged_by, rating, category, title, description, event_date, event_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [employeeId, req.user.id, rating, category, title, description || null, eventDate, eventTime || null]
    );
    const [[row]] = await db.query(
      `SELECT pl.*, e.name AS employee_name, lb.name AS logged_by_name
       FROM performance_logs pl
       JOIN employees e  ON e.id  = pl.employee_id
       JOIN employees lb ON lb.id = pl.logged_by
       WHERE pl.id = ?`,
      [result.insertId]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error('[performance] POST error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /performance/:id — update (admin only) ────────────────────────────────
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rating, category, title, description, eventDate, eventTime } = req.body;
    if (!rating || !category || !title || !eventDate) {
      return res.status(400).json({ error: 'rating, category, title, eventDate are required' });
    }
    if (!['good', 'bad'].includes(rating)) {
      return res.status(400).json({ error: 'rating must be "good" or "bad"' });
    }
    await db.query(
      `UPDATE performance_logs
       SET rating=?, category=?, title=?, description=?, event_date=?, event_time=?
       WHERE id=?`,
      [rating, category, title, description || null, eventDate, eventTime || null, req.params.id]
    );
    const [[row]] = await db.query(
      `SELECT pl.*, e.name AS employee_name, lb.name AS logged_by_name
       FROM performance_logs pl
       JOIN employees e  ON e.id  = pl.employee_id
       JOIN employees lb ON lb.id = pl.logged_by
       WHERE pl.id = ?`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    console.error('[performance] PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /performance/:id (admin only) ──────────────────────────────────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM performance_logs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[performance] DELETE error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
