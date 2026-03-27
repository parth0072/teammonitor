// routes/timeline.js – per-employee timeline data
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// GET /api/timeline?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&employeeId=
router.get('/', auth, adminOnly, async (req, res) => {
  const { startDate, endDate, employeeId } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

  try {
    const empFilter  = employeeId && employeeId !== 'all';

    // Sessions
    let sessSql = `
      SELECT s.id, s.employee_id, s.punch_in, s.punch_out, s.total_minutes, s.status, s.date,
             e.name AS employee_name
      FROM sessions s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.date BETWEEN ? AND ?
    `;
    const sessParams = [startDate, endDate];
    if (empFilter) { sessSql += ' AND s.employee_id = ?'; sessParams.push(employeeId); }
    sessSql += ' ORDER BY s.employee_id, s.date, s.punch_in';

    // Idle logs
    let idleSql = `
      SELECT id, employee_id, session_id, idle_start, idle_end, duration_seconds, date
      FROM idle_logs
      WHERE date BETWEEN ? AND ?
    `;
    const idleParams = [startDate, endDate];
    if (empFilter) { idleSql += ' AND employee_id = ?'; idleParams.push(employeeId); }
    idleSql += ' ORDER BY employee_id, date, idle_start';

    const [[sessions], [idleLogs]] = await Promise.all([
      db.query(sessSql, sessParams),
      db.query(idleSql, idleParams),
    ]);

    res.json({ sessions, idleLogs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
