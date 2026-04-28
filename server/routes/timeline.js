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
    const empFilter = employeeId && employeeId !== 'all';

    // ── Sessions + task/jira info ─────────────────────────────────────────────
    let sessSql = `
      SELECT s.id, s.employee_id, s.punch_in, s.punch_out, s.total_minutes, s.status, s.date,
             e.name       AS employee_name,
             e.department,
             s.jira_issue_key,
             s.jira_issue_summary,
             COALESCE(t.name, s.jira_issue_summary, s.jira_issue_key) AS task_name
      FROM   sessions  s
      JOIN   employees e ON e.id = s.employee_id
      LEFT JOIN tasks  t ON t.id = s.task_id
      WHERE  s.date BETWEEN ? AND ?
    `;
    const sessParams = [startDate, endDate];
    if (empFilter) { sessSql += ' AND s.employee_id = ?'; sessParams.push(employeeId); }
    sessSql += ' ORDER BY s.employee_id, s.date, s.punch_in';

    // ── Idle logs ─────────────────────────────────────────────────────────────
    let idleSql = `
      SELECT id, employee_id, session_id, idle_start, idle_end, duration_seconds, date
      FROM   idle_logs
      WHERE  date BETWEEN ? AND ?
    `;
    const idleParams = [startDate, endDate];
    if (empFilter) { idleSql += ' AND employee_id = ?'; idleParams.push(employeeId); }
    idleSql += ' ORDER BY employee_id, date, idle_start';

    // ── In-session breaks ─────────────────────────────────────────────────────
    let brkSql = `
      SELECT sb.id, sb.session_id,
             sb.break_start AS start_time,
             sb.break_end   AS end_time,
             ROUND(TIMESTAMPDIFF(MINUTE, sb.break_start, COALESCE(sb.break_end, NOW()))) AS duration_minutes,
             sb.employee_id, sb.date
      FROM   session_breaks sb
      WHERE  sb.date BETWEEN ? AND ?
    `;
    const brkParams = [startDate, endDate];
    if (empFilter) { brkSql += ' AND sb.employee_id = ?'; brkParams.push(employeeId); }
    brkSql += ' ORDER BY sb.session_id, sb.break_start';

    // ── Top apps per employee per day ─────────────────────────────────────────
    let appSql = `
      SELECT employee_id, date,
             app_name,
             SUM(duration_seconds) AS total_seconds
      FROM   activity_logs
      WHERE  date BETWEEN ? AND ?
    `;
    const appParams = [startDate, endDate];
    if (empFilter) { appSql += ' AND employee_id = ?'; appParams.push(employeeId); }
    appSql += ' GROUP BY employee_id, date, app_name ORDER BY employee_id, date, total_seconds DESC';

    // ── Screenshot count per employee per day ─────────────────────────────────
    let ssSql = `
      SELECT employee_id, date, COUNT(*) AS count
      FROM   screenshots
      WHERE  date BETWEEN ? AND ?
    `;
    const ssParams = [startDate, endDate];
    if (empFilter) { ssSql += ' AND employee_id = ?'; ssParams.push(employeeId); }
    ssSql += ' GROUP BY employee_id, date';

    // Run all queries independently — a failure in breaks/apps won't kill sessions
    const results = await Promise.allSettled([
      db.query(sessSql,  sessParams),
      db.query(idleSql,  idleParams),
      db.query(brkSql,   brkParams),
      db.query(appSql,   appParams),
      db.query(ssSql,    ssParams),
    ]);

    const pick = (r) => r.status === 'fulfilled' ? (r.value[0] || []) : [];

    const sessions        = pick(results[0]);
    const idleLogs        = pick(results[1]);
    const sessionBreaks   = pick(results[2]);
    const appLogs         = pick(results[3]);
    const screenshotCounts= pick(results[4]);

    // Log any query errors for server-side debugging
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[timeline] query[${i}] failed:`, r.reason?.message);
    });

    // Group top 4 apps per employee+date
    const topApps = {};
    for (const row of appLogs) {
      const key = `${row.employee_id}__${String(row.date).slice(0,10)}`;
      if (!topApps[key]) topApps[key] = [];
      if (topApps[key].length < 4) topApps[key].push({ app: row.app_name, secs: Number(row.total_seconds) });
    }

    res.json({ sessions, idleLogs, sessionBreaks, topApps, screenshotCounts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
