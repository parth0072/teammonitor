// routes/activity.js – app usage + idle logs
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// POST /api/activity  – log an app usage entry
router.post('/', auth, async (req, res) => {
  const { sessionId, appName, windowTitle, startTime, endTime, durationSeconds } = req.body;
  if (!sessionId || !appName) return res.status(400).json({ error: 'sessionId and appName required' });
  try {
    const date = new Date(startTime).toISOString().slice(0, 10);
    await db.query(
      'INSERT INTO activity_logs (employee_id, session_id, app_name, window_title, start_time, end_time, duration_seconds, date) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, sessionId, appName, windowTitle || '', new Date(startTime), new Date(endTime), durationSeconds || 0, date]
    );
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/activity/idle  – log an idle period
router.post('/idle', auth, async (req, res) => {
  const { sessionId, idleStart, idleEnd, durationSeconds } = req.body;
  try {
    const date = new Date(idleStart).toISOString().slice(0, 10);
    await db.query(
      'INSERT INTO idle_logs (employee_id, session_id, idle_start, idle_end, duration_seconds, date) VALUES (?,?,?,?,?,?)',
      [req.user.id, sessionId, new Date(idleStart), new Date(idleEnd), durationSeconds || 0, date]
    );
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/activity/mine?date=   – employee's own activity logs
router.get('/mine', auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      'SELECT * FROM activity_logs WHERE employee_id=? AND date=? ORDER BY start_time ASC',
      [req.user.id, date]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/activity/mine/summary?date=  – employee's own activity grouped by app
router.get('/mine/summary', auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      'SELECT app_name, SUM(duration_seconds) AS total_seconds FROM activity_logs WHERE employee_id=? AND date=? GROUP BY app_name ORDER BY total_seconds DESC',
      [req.user.id, date]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/activity?employeeId=&date=   (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const empId = req.query.employeeId;
    let sql = 'SELECT a.*, e.name AS employee_name FROM activity_logs a JOIN employees e ON a.employee_id=e.id WHERE a.date=?';
    const params = [date];
    if (empId) { sql += ' AND a.employee_id=?'; params.push(empId); }
    sql += ' ORDER BY a.start_time DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/activity/summary?employeeId=&date=  – grouped by app
router.get('/summary', auth, adminOnly, async (req, res) => {
  try {
    const date  = req.query.date || new Date().toISOString().slice(0, 10);
    const empId = req.query.employeeId;
    let sql = 'SELECT app_name, SUM(duration_seconds) AS total_seconds FROM activity_logs WHERE date=?';
    const params = [date];
    if (empId) { sql += ' AND employee_id=?'; params.push(empId); }
    sql += ' GROUP BY app_name ORDER BY total_seconds DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
