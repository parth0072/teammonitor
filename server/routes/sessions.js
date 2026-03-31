// routes/sessions.js  – punch in/out + attendance
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// POST /api/sessions/punch-in
router.post('/punch-in', auth, async (req, res) => {
  try {
    const now    = new Date();
    const date   = now.toISOString().slice(0, 10);
    const taskId = req.body.taskId || null;

    // Check if already punched in today
    const [existing] = await db.query(
      "SELECT id, task_id FROM sessions WHERE employee_id=? AND date=? AND status='active'",
      [req.user.id, date]
    );
    if (existing.length) {
      // If switching task, update the active session's task
      if (taskId && existing[0].task_id !== taskId) {
        await db.query('UPDATE sessions SET task_id=? WHERE id=?', [taskId, existing[0].id]);
      }
      return res.status(409).json({ error: 'Already punched in', sessionId: existing[0].id });
    }

    const [result] = await db.query(
      "INSERT INTO sessions (employee_id, task_id, punch_in, status, date) VALUES (?,?,?,'active',?)",
      [req.user.id, taskId, now, date]
    );

    // Mark task as in_progress when punching in to it
    if (taskId) {
      await db.query("UPDATE tasks SET status='in_progress' WHERE id=?", [taskId]);
    }

    res.status(201).json({ sessionId: result.insertId, punchIn: now });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/sessions/:id/punch-out
router.put('/:id/punch-out', auth, async (req, res) => {
  try {
    const now = new Date();
    const [rows] = await db.query('SELECT * FROM sessions WHERE id=? AND employee_id=?', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Session not found' });

    const mins = Math.round((now - new Date(rows[0].punch_in)) / 60000);
    await db.query(
      "UPDATE sessions SET punch_out=?, total_minutes=?, status='completed' WHERE id=?",
      [now, mins, req.params.id]
    );
    res.json({ totalMinutes: mins });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/sessions/:id/heartbeat  – update running minutes
router.put('/:id/heartbeat', auth, async (req, res) => {
  try {
    const { totalMinutes, screenPermission } = req.body;
    await db.query('UPDATE sessions SET total_minutes=? WHERE id=? AND employee_id=?',
      [totalMinutes, req.params.id, req.user.id]);
    // Store screen recording permission status on the employee record
    if (screenPermission !== undefined) {
      await db.query('UPDATE employees SET screen_permission=? WHERE id=?',
        [screenPermission ? 1 : 0, req.user.id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/sessions/manual – create a manual time entry
router.post('/manual', auth, async (req, res) => {
  try {
    const { date, startTime, endTime, note } = req.body;
    if (!date || !startTime || !endTime) return res.status(400).json({ error: 'date, startTime, endTime required' });
    const start = new Date(`${date}T${startTime}:00`);
    const end   = new Date(`${date}T${endTime}:00`);
    const totalMinutes = Math.round((end - start) / 60000);
    if (totalMinutes <= 0) return res.status(400).json({ error: 'End time must be after start time' });

    const [result] = await db.query(
      "INSERT INTO sessions (employee_id, punch_in, punch_out, total_minutes, status, date) VALUES (?,?,?,?,'completed',?)",
      [req.user.id, start, end, totalMinutes, date]
    );
    if (note) {
      await db.query(
        'INSERT INTO activity_logs (employee_id, session_id, app_name, window_title, start_time, end_time, duration_seconds, date) VALUES (?,?,?,?,?,?,?,?)',
        [req.user.id, result.insertId, 'Manual Entry', note || '', start, end, totalMinutes * 60, date]
      );
    }
    res.status(201).json({ sessionId: result.insertId, totalMinutes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/sessions/manual/admin – admin creates manual entry for any employee
router.post('/manual/admin', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, date, startTime, endTime, note } = req.body;
    if (!employeeId || !date || !startTime || !endTime) return res.status(400).json({ error: 'employeeId, date, startTime, endTime required' });
    const start = new Date(`${date}T${startTime}:00`);
    const end   = new Date(`${date}T${endTime}:00`);
    const totalMinutes = Math.round((end - start) / 60000);
    if (totalMinutes <= 0) return res.status(400).json({ error: 'End time must be after start time' });
    const [result] = await db.query(
      "INSERT INTO sessions (employee_id, punch_in, punch_out, total_minutes, status, date) VALUES (?,?,?,?,'completed',?)",
      [employeeId, start, end, totalMinutes, date]
    );
    if (note) {
      await db.query(
        'INSERT INTO activity_logs (employee_id, session_id, app_name, window_title, start_time, end_time, duration_seconds, date) VALUES (?,?,?,?,?,?,?,?)',
        [employeeId, result.insertId, 'Manual Entry', note || '', start, end, totalMinutes * 60, date]
      );
    }
    res.status(201).json({ sessionId: result.insertId, totalMinutes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sessions?date=YYYY-MM-DD  (admin – all employees)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT s.*, e.name AS employee_name, e.department, t.name AS task_name
       FROM sessions s
       JOIN employees e ON s.employee_id = e.id
       LEFT JOIN tasks t ON s.task_id = t.id
       WHERE s.date = ? ORDER BY s.punch_in DESC`,
      [date]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sessions/my?date=YYYY-MM-DD  (employee – own sessions)
router.get('/my', auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      'SELECT * FROM sessions WHERE employee_id=? AND date=? ORDER BY punch_in DESC',
      [req.user.id, date]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sessions/stats/employee?employeeId=&days=7
router.get('/stats/employee', auth, adminOnly, async (req, res) => {
  try {
    const days  = parseInt(req.query.days || '7');
    const empId = req.query.employeeId;
    if (!empId) return res.status(400).json({ error: 'employeeId required' });
    // SQLite date math: compute cutoff in JS
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT date, SUM(total_minutes) AS total_minutes FROM sessions WHERE employee_id=? AND date >= ? GROUP BY date ORDER BY date ASC`,
      [empId, cutoffStr]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sessions/stats?days=7  – daily hours for chart
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT date,
        SUM(CASE WHEN status='active'
              THEN TIMESTAMPDIFF(MINUTE, punch_in, NOW())
              ELSE COALESCE(total_minutes, 0)
            END) AS total_minutes,
        COUNT(*) AS session_count
       FROM sessions
       WHERE date >= ?
       GROUP BY date ORDER BY date ASC`,
      [cutoffStr]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
