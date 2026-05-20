// routes/sessions.js  – punch in/out + attendance
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// Helper: today's date string in IST (UTC+5:30)
function todayIST() {
  return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
}

// Helper: midnight IST of a given date string (e.g. '2026-05-12') expressed as UTC
function midnightISTofDate(dateStr) {
  // midnight IST = 18:30 UTC of the same calendar date
  return new Date(dateStr + 'T18:30:00.000Z');
}

// Auto-close any stale active sessions from previous IST days for an employee.
// Called on punch-in and on heartbeat so stale sessions are always cleaned up.
async function closeStaleSessionsIST(employeeId) {
  const today = todayIST();
  const [stale] = await db.query(
    `SELECT id, date, last_heartbeat_at, total_minutes FROM sessions
     WHERE employee_id=? AND status='active' AND date < ?`,
    [employeeId, today]
  );
  for (const s of stale) {
    const midnight = midnightISTofDate(s.date);
    // punch_out = midnight IST of that day (caps the session cleanly at day boundary)
    const punchOut = midnight;
    await db.query(
      `UPDATE sessions SET punch_out=?, status='completed' WHERE id=?`,
      [punchOut, s.id]
    );
  }
}

// POST /api/sessions/punch-in
router.post('/punch-in', auth, async (req, res) => {
  try {
    const now    = new Date();
    const date   = todayIST();           // use IST date so session date matches IST calendar day
    const taskId            = req.body.taskId            || null;
    const jiraIssueKey      = req.body.jiraIssueKey      || null;
    const jiraIssueSummary  = req.body.jiraIssueSummary  || null;

    // Close any stale sessions from previous IST days before creating a new one
    await closeStaleSessionsIST(req.user.id).catch(() => {});

    // Check if already punched in today (IST)
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
    const { totalMinutes, screenPermission, agentVersion, isIdle,
            deliveredCommandIds = [], reconnect = false,
            breaks = [], currentBreakStart } = req.body;
    const now = new Date();

    // ── Auto-close stale sessions from previous IST days ─────────────────────
    // If this heartbeat is for a session from a previous IST calendar day,
    // close it now so it shows correctly on the dashboard.
    await closeStaleSessionsIST(req.user.id).catch(() => {});

    // ── Mac-reported breaks (local-first) ────────────────────────────────────
    // The Mac app is the source of truth for breaks. It stores them locally and
    // sends them here via heartbeat. We upsert so re-sends are idempotent.
    if (breaks.length > 0) {
      const sessionDate = new Date().toISOString().slice(0, 10);
      for (const b of breaks) {
        if (!b.start || !b.end) continue;
        try {
          await db.query(
            `INSERT INTO session_breaks (session_id, employee_id, break_start, break_end, date)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE break_end = VALUES(break_end)`,
            [req.params.id, req.user.id, new Date(b.start), new Date(b.end), sessionDate]
          );
        } catch (_) { /* non-fatal */ }
      }
    }

    // ── Open break (currently on break) ──────────────────────────────────────
    // Ensure there is an open session_break row for the current break period.
    if (currentBreakStart) {
      const sessionDate = new Date().toISOString().slice(0, 10);
      try {
        await db.query(
          `INSERT IGNORE INTO session_breaks (session_id, employee_id, break_start, date)
           VALUES (?, ?, ?, ?)`,
          [req.params.id, req.user.id, new Date(currentBreakStart), sessionDate]
        );
      } catch (_) { /* non-fatal */ }
    }

    // ── Heartbeat gap → auto break (away/sleep) ──────────────────────────────
    // A large gap between heartbeats means the Mac was sleeping or the user was
    // away — this is treated as a BREAK (not idle). Idle is only keyboard/mouse
    // inactivity detected by the Mac agent itself and sent via logIdle().
    // Skip when reconnect=true (Mac is actively syncing its own break records).
    if (!reconnect) {
      try {
        const [[sessRow]] = await db.query(
          `SELECT s.last_heartbeat_at, e.idle_stop_minutes
           FROM sessions s JOIN employees e ON e.id = s.employee_id
           WHERE s.id = ? AND s.employee_id = ?`,
          [req.params.id, req.user.id]
        );
        if (sessRow?.last_heartbeat_at) {
          const prevHb     = new Date(sessRow.last_heartbeat_at);
          // Threshold = idle_stop_minutes + heartbeat_interval (5 min) + 1 min grace.
          // This ensures we only log a break when at least one full heartbeat cycle was
          // missed beyond the idle stop point — normal 5-min heartbeats never trigger it.
          const threshold  = (sessRow.idle_stop_minutes || 5) + 6;
          const gapMinutes = (now - prevHb) / 60000;
          if (gapMinutes > threshold) {
            const sessionDate = now.toISOString().slice(0, 10);
            // Insert as a session_break (away/sleep gap), not idle_log.
            // Idle = keyboard/mouse inactivity (from Mac); Break = Mac offline/sleeping.
            await db.query(
              `INSERT INTO session_breaks (session_id, employee_id, break_start, break_end, date)
               VALUES (?, ?, ?, ?, ?)`,
              [req.params.id, req.user.id, prevHb, now, sessionDate]
            );
          }
        }
      } catch (_) { /* non-fatal */ }
    }

    // GREATEST() prevents a post-restart agent (with reset trackedMinutes) from
    // overwriting a higher server value — total_minutes only ever goes up.
    await db.query('UPDATE sessions SET total_minutes=GREATEST(total_minutes, ?), last_heartbeat_at=? WHERE id=? AND employee_id=?',
      [totalMinutes, now, req.params.id, req.user.id]);
    const empUpdates = [];
    const empValues  = [];
    if (screenPermission !== undefined) { empUpdates.push('screen_permission=?'); empValues.push(screenPermission ? 1 : 0); }
    if (agentVersion)                   { empUpdates.push('agent_version=?');     empValues.push(agentVersion); }
    // Always reset idle state on every heartbeat — clears stale is_idle=1 from a
    // previous lid-close/sleep signal as soon as the agent sends a normal heartbeat
    empUpdates.push('is_idle=?');
    empValues.push(isIdle === true ? 1 : 0);
    empUpdates.push('idle_since=?');
    empValues.push(isIdle === true ? new Date() : null);
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
                -- Add heartbeat lag up to the online threshold (6 min) — Mac is source of truth
                THEN COALESCE(s.total_minutes, 0)
                   + CASE WHEN TIMESTAMPDIFF(MINUTE, s.last_heartbeat_at, UTC_TIMESTAMP()) < 6
                           THEN LEAST(COALESCE(TIMESTAMPDIFF(MINUTE, s.last_heartbeat_at, UTC_TIMESTAMP()), 0), 5)
                           ELSE 0 END
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

      // For active sessions with no recorded breaks but a large elapsed/tracked gap,
      // infer breaks from activity log gaps (covers lid-close before server fix was deployed).
      for (const sess of rows) {
        if (sess.breaks.length > 0 || sess.status !== 'active' || !sess.last_heartbeat_at) continue;
        const elapsedMin  = (new Date(sess.last_heartbeat_at) - new Date(sess.punch_in)) / 60000;
        const trackedMin  = Number(sess.total_minutes) || 0;
        if (elapsedMin - trackedMin < 10) continue; // gap is trivial — skip

        const [actLogs] = await db.query(
          `SELECT start_time, end_time FROM activity_logs
           WHERE employee_id = ? AND date = ? AND start_time >= ?
           ORDER BY start_time ASC`,
          [sess.employee_id, date, sess.punch_in]
        ).catch(() => [[]]);

        for (let i = 0; i < actLogs.length - 1; i++) {
          const gapStart = new Date(actLogs[i].end_time);
          const gapEnd   = new Date(actLogs[i + 1].start_time);
          const gapMin   = (gapEnd - gapStart) / 60000;
          if (gapMin >= 6) {
            sess.breaks.push({ start: actLogs[i].end_time, end: actLogs[i + 1].start_time, inferred: true });
          }
        }
      }
    }
    // TIMESTAMPDIFF → BIGINT → mysql2 returns string; coerce to Number
    rows.forEach(r => { r.total_minutes = Number(r.total_minutes) || 0; });
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

// GET /api/sessions/task-totals  – all-time hours per task + per employee (no date filter)
router.get('/task-totals', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         COALESCE(t.name, s.jira_issue_key, 'No Task') AS task_name,
         s.task_id,
         s.jira_issue_key,
         s.employee_id,
         e.name        AS employee_name,
         jc.site_url   AS jira_site_url,
         SUM(COALESCE(s.total_minutes, 0)) AS minutes
       FROM sessions s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN tasks t ON t.id = s.task_id
       LEFT JOIN jira_credentials jc ON jc.employee_id = s.employee_id
       WHERE e.is_active = 1
       GROUP BY s.task_id, s.jira_issue_key, s.employee_id, e.name, t.name, jc.site_url
       ORDER BY SUM(s.total_minutes) DESC`
    );

    // Group by task
    const taskMap = {};
    for (const r of rows) {
      const key = r.task_id != null ? `task:${r.task_id}` : r.jira_issue_key ? `jira:${r.jira_issue_key}` : 'notask';
      if (!taskMap[key]) {
        taskMap[key] = {
          task_name:      r.task_name,
          task_id:        r.task_id,
          jira_issue_key: r.jira_issue_key,
          jira_site_url:  r.jira_site_url || null,
          total_minutes:  0,
          employees:      [],
        };
      }
      if (!taskMap[key].jira_site_url && r.jira_site_url) taskMap[key].jira_site_url = r.jira_site_url;
      taskMap[key].total_minutes += Number(r.minutes) || 0;
      taskMap[key].employees.push({ employee_id: r.employee_id, name: r.employee_name, minutes: Number(r.minutes) || 0 });
    }

    const result = Object.values(taskMap)
      .sort((a, b) => b.total_minutes - a.total_minutes);
    res.json(result);
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

    // Hours + session count per employee (+ real-time idle state from last heartbeat)
    const [hours] = await db.query(
      `SELECT s.employee_id, e.name,
              SUM(LEAST(COALESCE(s.total_minutes,0), 1440)) AS total_minutes,
              COUNT(*)                                       AS session_count,
              e.is_idle, e.idle_since,
              MAX(s.last_heartbeat_at)                       AS last_heartbeat_at
       FROM sessions s
       JOIN employees e ON e.id = s.employee_id
       WHERE s.date = ? AND e.is_active = 1
       GROUP BY s.employee_id, e.name, e.is_idle, e.idle_since
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

    const now = new Date();
    const members = hours.map(h => {
      const activeSec = actMap[h.employee_id] || 0;
      const productive_percent = h.total_minutes > 0
        ? Math.min(100, Math.round(activeSec / (h.total_minutes * 60) * 100)) : 0;
      // Treat as idle if agent reported idle, but only if heartbeat was recent (< 10 min ago)
      const heartbeatAge = h.last_heartbeat_at
        ? (now - new Date(h.last_heartbeat_at)) / 60000 : 999;
      const is_idle   = !!h.is_idle && heartbeatAge < 6;
      const is_online = heartbeatAge < 6;   // heartbeat every 5 min; 6-min window = 1 min grace after missed beat
      return {
        employee_id:        h.employee_id,
        name:               h.name,
        total_minutes:      Number(h.total_minutes) || 0,
        session_count:      Number(h.session_count) || 0,
        productive_percent,
        is_idle,
        is_online,
        idle_since:         is_idle ? h.idle_since : null,
        tasks:              taskMap[h.employee_id] || [],
      };
    });

    // Also include active employees with zero hours so they appear as "not started"
    const [allEmp] = await db.query(`SELECT id, name FROM employees WHERE is_active = 1`);
    const seenIds = new Set(members.map(m => m.employee_id));
    for (const e of allEmp) {
      if (!seenIds.has(e.id)) {
        members.push({ employee_id: e.id, name: e.name, total_minutes: 0, session_count: 0, productive_percent: 0, is_idle: false, is_online: false, idle_since: null, tasks: [] });
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
              THEN COALESCE(total_minutes, 0)
                 + CASE WHEN TIMESTAMPDIFF(MINUTE, last_heartbeat_at, NOW()) < 6
                         THEN LEAST(COALESCE(TIMESTAMPDIFF(MINUTE, last_heartbeat_at, NOW()), 0), 5)
                         ELSE 0 END
              ELSE total_minutes END) AS total_minutes,
        COUNT(*) AS session_count
       FROM sessions
       WHERE date >= ?
       GROUP BY date ORDER BY date ASC`,
      [cutoffStr]
    );
    // TIMESTAMPDIFF → BIGINT → mysql2 returns string; coerce to Number
    rows.forEach(r => { r.total_minutes = Number(r.total_minutes) || 0; });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/sessions/:id/correct-minutes  — admin: manually correct total_minutes
// Used when agent restart caused server to record lower minutes than actually tracked.
router.patch('/:id/correct-minutes', auth, adminOnly, async (req, res) => {
  try {
    const { totalMinutes } = req.body;
    if (typeof totalMinutes !== 'number' || totalMinutes < 0) {
      return res.status(400).json({ error: 'totalMinutes must be a non-negative number' });
    }
    const [result] = await db.query(
      'UPDATE sessions SET total_minutes=? WHERE id=?',
      [totalMinutes, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Session not found' });
    res.json({ ok: true, sessionId: Number(req.params.id), total_minutes: totalMinutes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
