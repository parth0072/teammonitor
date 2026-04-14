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
    const taskId       = req.body.taskId       || null;
    const jiraIssueKey = req.body.jiraIssueKey || null;

    // Check if already punched in today
    const [existing] = await db.query(
      "SELECT id, task_id FROM sessions WHERE employee_id=? AND date=? AND status='active'",
      [req.user.id, date]
    );
    if (existing.length) {
      if (taskId && existing[0].task_id !== taskId) {
        await db.query('UPDATE sessions SET task_id=?, jira_issue_key=? WHERE id=?',
          [taskId, jiraIssueKey, existing[0].id]);
      }
      return res.status(409).json({ error: 'Already punched in', sessionId: existing[0].id });
    }

    const [result] = await db.query(
      "INSERT INTO sessions (employee_id, task_id, jira_issue_key, punch_in, status, date) VALUES (?,?,?,?,'active',?)",
      [req.user.id, taskId, jiraIssueKey, now, date]
    );

    // Mark task as in_progress when punching in to it
    if (taskId) {
      await db.query("UPDATE tasks SET status='in_progress' WHERE id=?", [taskId]);
    }

    res.status(201).json({ sessionId: result.insertId, punchIn: now });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/sessions/:id/break/start
router.post('/:id/break/start', auth, async (req, res) => {
  try {
    const now  = new Date();
    const date = now.toISOString().slice(0, 10);
    const [r] = await db.query(
      'INSERT INTO session_breaks (session_id, employee_id, break_start, date) VALUES (?,?,?,?)',
      [req.params.id, req.user.id, now, date]
    );
    res.json({ breakId: r.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/sessions/:id/break/end
router.put('/:id/break/end', auth, async (req, res) => {
  try {
    const now = new Date();
    // Close the most recent open break for this session
    await db.query(
      `UPDATE session_breaks SET break_end=? WHERE session_id=? AND employee_id=? AND break_end IS NULL ORDER BY break_start DESC LIMIT 1`,
      [now, req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/sessions/:id/punch-out
router.put('/:id/punch-out', auth, async (req, res) => {
  try {
    const now = new Date();
    const [rows] = await db.query('SELECT * FROM sessions WHERE id=? AND employee_id=?', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Session not found' });

    // Prefer client-reported totalMinutes (already excludes break/idle time).
    // Fall back to wall-clock diff only when client sends nothing (e.g. admin force-close).
    const clientMins = req.body?.totalMinutes;
    const mins = (clientMins != null && clientMins >= 0)
      ? clientMins
      : Math.round((now - new Date(rows[0].punch_in)) / 60000);
    await db.query(
      "UPDATE sessions SET punch_out=?, total_minutes=?, status='completed' WHERE id=?",
      [now, mins, req.params.id]
    );
    res.json({ totalMinutes: mins });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/sessions/:id/heartbeat  – update running minutes; return pending admin commands
router.put('/:id/heartbeat', auth, async (req, res) => {
  try {
    const { totalMinutes, screenPermission, agentVersion, deliveredCommandIds = [] } = req.body;
    await db.query('UPDATE sessions SET total_minutes=?, last_heartbeat_at=NOW() WHERE id=? AND employee_id=?',
      [totalMinutes, req.params.id, req.user.id]);
    const empUpdates = [];
    const empValues  = [];
    if (screenPermission !== undefined) { empUpdates.push('screen_permission=?'); empValues.push(screenPermission ? 1 : 0); }
    if (agentVersion)                   { empUpdates.push('agent_version=?');     empValues.push(agentVersion); }
    if (empUpdates.length) {
      empValues.push(req.user.id);
      await db.query(`UPDATE employees SET ${empUpdates.join(', ')} WHERE id=?`, empValues);
    }

    // Mark delivered commands (graceful — table may not exist yet)
    if (Array.isArray(deliveredCommandIds) && deliveredCommandIds.length > 0) {
      const placeholders = deliveredCommandIds.map(() => '?').join(',');
      await db.query(
        `UPDATE admin_commands SET status='delivered', delivered_at=NOW() WHERE id IN (${placeholders}) AND status='pending'`,
        deliveredCommandIds
      ).catch(() => {});
    }

    // Fetch pending commands for this employee (graceful — table may not exist yet)
    let commands = [];
    try {
      const [cmdRows] = await db.query(
        `SELECT id, command_type, payload FROM admin_commands
         WHERE status='pending' AND (employee_id=? OR employee_id IS NULL)
         ORDER BY created_at ASC LIMIT 20`,
        [req.user.id]
      );
      commands = cmdRows.map(r => {
        const p = r.payload ? JSON.parse(r.payload) : {};
        return { id: r.id, type: r.command_type, title: p.title || null, message: p.message || null, action: p.action || 'none' };
      });
    } catch (_) { /* admin_commands table may not exist yet — return empty list */ }

    // Fetch tracking_locked state (graceful — column may not exist yet)
    let trackingLocked = false;
    try {
      const [[emp]] = await db.query('SELECT tracking_locked FROM employees WHERE id=?', [req.user.id]);
      trackingLocked = !!(emp?.tracking_locked);
    } catch (_) { /* tracking_locked column may not exist yet */ }

    res.json({ ok: true, trackingLocked, commands });
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
       WHERE s.date = ? ORDER BY s.punch_in ASC`,
      [date]
    );
    // Attach breaks to each session
    if (rows.length) {
      const sessionIds = rows.map(r => r.id);
      const [breaks] = await db.query(
        `SELECT * FROM session_breaks WHERE session_id IN (?) AND date = ? ORDER BY break_start ASC`,
        [sessionIds, date]
      );
      const breakMap = {};
      for (const b of breaks) {
        if (!breakMap[b.session_id]) breakMap[b.session_id] = [];
        breakMap[b.session_id].push({ start: b.break_start, end: b.break_end });
      }
      rows.forEach(r => { r.breaks = breakMap[r.id] || []; });
    }
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

// GET /api/sessions/stats/mine?days=7  – own daily hours (employee)
router.get('/stats/mine', auth, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT date, SUM(total_minutes) AS total_minutes FROM sessions WHERE employee_id=? AND date >= ? GROUP BY date ORDER BY date ASC`,
      [req.user.id, cutoffStr]
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

// GET /api/sessions/task-hours?employeeId=&date=YYYY-MM-DD  – hours grouped by task
router.get('/task-hours', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, date } = req.query;
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const [rows] = await db.query(
      `SELECT
         CASE
           WHEN t.name IS NOT NULL THEN t.name
           WHEN s.jira_issue_key IS NOT NULL THEN s.jira_issue_key
           ELSE 'No Task'
         END AS task_name,
         s.task_id,
         s.jira_issue_key,
         SUM(COALESCE(s.total_minutes, 0)) AS total_minutes,
         COUNT(*) AS session_count
       FROM sessions s
       LEFT JOIN tasks t ON s.task_id = t.id
       WHERE s.employee_id = ? AND s.date = ?
       GROUP BY s.task_id, s.jira_issue_key, t.name
       ORDER BY total_minutes DESC`,
      [employeeId, targetDate]
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
        SUM(CASE WHEN status = 'active'
              THEN COALESCE(NULLIF(total_minutes, 0), TIMESTAMPDIFF(MINUTE, punch_in, NOW()))
              ELSE total_minutes END) AS total_minutes,
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
