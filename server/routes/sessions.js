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
    const taskId            = req.body.taskId            || null;
    const jiraIssueKey      = req.body.jiraIssueKey      || null;
    const jiraIssueSummary  = req.body.jiraIssueSummary  || null;

    // Check if already punched in today
    const [existing] = await db.query(
      "SELECT id, task_id FROM sessions WHERE employee_id=? AND date=? AND status='active'",
      [req.user.id, date]
    );
    if (existing.length) {
      if (taskId && existing[0].task_id !== taskId) {
        await db.query('UPDATE sessions SET task_id=?, jira_issue_key=?, jira_issue_summary=? WHERE id=?',
          [taskId, jiraIssueKey, jiraIssueSummary, existing[0].id]);
      }
      return res.status(409).json({ error: 'Already punched in', sessionId: existing[0].id });
    }

    const [result] = await db.query(
      "INSERT INTO sessions (employee_id, task_id, jira_issue_key, jira_issue_summary, punch_in, status, date) VALUES (?,?,?,?,?,'active',?)",
      [req.user.id, taskId, jiraIssueKey, jiraIssueSummary, now, date]
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
      `SELECT s.*,
              CASE WHEN s.status='active'
                -- Only add heartbeat lag up to 5 min; beyond that treat as offline (stale session)
                THEN COALESCE(s.total_minutes, 0)
                   + LEAST(COALESCE(TIMESTAMPDIFF(MINUTE, s.last_heartbeat_at, NOW()), 0), 5)
                ELSE COALESCE(s.total_minutes, 0)
              END AS total_minutes,
              e.name AS employee_name, e.department, t.name AS task_name
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

// GET /api/sessions/task-sessions?taskId=N|&jiraKey=X|&noTask=1[&date=YYYY-MM-DD]
// Returns every session for a task. Date is optional — omit to get full history.
router.get('/task-sessions', auth, adminOnly, async (req, res) => {
  try {
    const { date, taskId, jiraKey, noTask } = req.query;

    let where = '1=1';
    const params = [];

    if (date) { where += ' AND s.date = ?'; params.push(date); }

    if (noTask === '1') {
      where += ' AND s.task_id IS NULL AND (s.jira_issue_key IS NULL OR s.jira_issue_key = "")';
    } else if (taskId) {
      where += ' AND s.task_id = ?';
      params.push(taskId);
    } else if (jiraKey) {
      where += ' AND s.jira_issue_key = ? AND s.task_id IS NULL';
      params.push(jiraKey);
    } else {
      return res.status(400).json({ error: 'taskId, jiraKey, or noTask=1 required' });
    }

    const [rows] = await db.query(
      `SELECT
         s.id,
         e.name        AS employee_name,
         e.id          AS employee_id,
         s.punch_in,
         s.punch_out,
         s.status,
         LEAST(COALESCE(s.total_minutes, 0), 1440) AS total_minutes,
         COALESCE(t.name, s.jira_issue_key, 'No Task') AS task_name,
         s.task_id,
         s.jira_issue_key,
         s.date,
         t.description  AS task_description,
         t.status       AS task_status
       FROM sessions s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN tasks t ON t.id = s.task_id
       WHERE ${where}
       ORDER BY s.date DESC, s.punch_in ASC`,
      params
    );

    // For active sessions use stored total_minutes (kept current by heartbeats) + max 5 min lag
    const now = new Date();
    const sessions = rows.map(r => {
      let minutes = Number(r.total_minutes) || 0;
      if (r.status === 'active' && r.punch_in) {
        const lagMins = r.last_heartbeat_at
          ? Math.min(5, Math.round((now - new Date(r.last_heartbeat_at)) / 60000))
          : 0;
        minutes = (Number(r.total_minutes) || 0) + lagMins;
      }
      return { ...r, total_minutes: minutes };
    });

    res.json({ date: date || null, sessions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/sessions/team-overview?date=YYYY-MM-DD
// Returns every active employee with their hours + task breakdown for the date.
router.get('/team-overview', auth, adminOnly, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // Hours + session count per employee
    const [hours] = await db.query(
      `SELECT s.employee_id, e.name,
              SUM(LEAST(COALESCE(s.total_minutes,0), 1440)) AS total_minutes,
              COUNT(*)                                       AS session_count
       FROM sessions s
       JOIN employees e ON e.id = s.employee_id
       WHERE s.date = ? AND e.is_active = 1
       GROUP BY s.employee_id, e.name
       ORDER BY total_minutes DESC`, [date]
    );

    // Tasks per employee for the date (include Jira site_url so frontend can build browse links)
    const [tasks] = await db.query(
      `SELECT s.employee_id,
              COALESCE(t.name, s.jira_issue_key, 'No Task') AS task_name,
              s.task_id,
              s.jira_issue_key,
              jc.site_url                                    AS jira_site_url,
              SUM(COALESCE(s.total_minutes, 0))             AS minutes
       FROM sessions s
       LEFT JOIN tasks t ON t.id = s.task_id
       LEFT JOIN jira_credentials jc ON jc.employee_id = s.employee_id
       WHERE s.date = ?
       GROUP BY s.employee_id, s.task_id, s.jira_issue_key, t.name, jc.site_url
       ORDER BY s.employee_id, minutes DESC`, [date]
    );

    // Productivity (active seconds vs tracked minutes)
    const [activity] = await db.query(
      `SELECT employee_id, SUM(duration_seconds) AS active_seconds
       FROM activity_logs WHERE date = ? GROUP BY employee_id`, [date]
    );

    const taskMap = {};
    for (const t of tasks) {
      if (!taskMap[t.employee_id]) taskMap[t.employee_id] = [];
      taskMap[t.employee_id].push({
        task_name:     t.task_name,
        task_id:       t.task_id,
        jira_issue_key: t.jira_issue_key,
        jira_site_url: t.jira_site_url || null,
        minutes:       t.minutes,
      });
    }
    const actMap = Object.fromEntries(activity.map(a => [a.employee_id, a.active_seconds]));

    const members = hours.map(h => {
      const activeSec = actMap[h.employee_id] || 0;
      const productive_percent = h.total_minutes > 0
        ? Math.min(100, Math.round(activeSec / (h.total_minutes * 60) * 100)) : 0;
      return {
        employee_id:        h.employee_id,
        name:               h.name,
        total_minutes:      Number(h.total_minutes) || 0,
        session_count:      Number(h.session_count) || 0,
        productive_percent,
        tasks:              taskMap[h.employee_id] || [],
      };
    });

    // Also include active employees with zero hours so they appear as "not started"
    const [allEmp] = await db.query(`SELECT id, name FROM employees WHERE is_active = 1`);
    const seenIds = new Set(members.map(m => m.employee_id));
    for (const e of allEmp) {
      if (!seenIds.has(e.id)) {
        members.push({ employee_id: e.id, name: e.name, total_minutes: 0, session_count: 0, productive_percent: 0, tasks: [] });
      }
    }

    res.json({ date, members });
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
              THEN COALESCE(total_minutes, 0) + LEAST(COALESCE(TIMESTAMPDIFF(MINUTE, last_heartbeat_at, NOW()), 0), 5)
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
