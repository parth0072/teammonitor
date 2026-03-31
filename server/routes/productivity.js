// routes/productivity.js – productivity stats per employee
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// GET /api/productivity?days=7&employeeId=  (admin)
// Returns per-employee per-day productivity stats
router.get('/', auth, adminOnly, async (req, res) => {
  try {
  const days       = Math.min(parseInt(req.query.days) || 7, 30);
  const employeeId = req.query.employeeId;

  // Build date list (today back N days)
  const dateList = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dateList.push(d.toISOString().slice(0, 10));
  }
  const oldest = dateList[dateList.length - 1];

  // Session totals per employee per day
  const empFilter = employeeId ? 'AND s.employee_id=?' : '';
  const sParams   = employeeId ? [oldest, employeeId] : [oldest];
  const [sessRows] = await db.query(
    `SELECT s.employee_id, s.date, SUM(s.total_minutes) AS tracked_minutes
     FROM sessions s
     WHERE s.date >= ? ${empFilter}
     GROUP BY s.employee_id, s.date`,
    sParams
  );

  // Idle totals per employee per day
  const iParams = employeeId ? [oldest, employeeId] : [oldest];
  const [idleRows] = await db.query(
    `SELECT il.employee_id, il.date, SUM(il.duration_seconds) AS idle_seconds
     FROM idle_logs il
     WHERE il.date >= ? ${employeeId ? 'AND il.employee_id=?' : ''}
     GROUP BY il.employee_id, il.date`,
    iParams
  );

  // App usage breakdown per employee per day
  const [appRows] = await db.query(
    `SELECT al.employee_id, al.date, al.app_name, SUM(al.duration_seconds) AS secs
     FROM activity_logs al
     WHERE al.date >= ? ${employeeId ? 'AND al.employee_id=?' : ''}
     GROUP BY al.employee_id, al.date, al.app_name`,
    employeeId ? [oldest, employeeId] : [oldest]
  );

  // Employee list
  const eParams = employeeId ? [employeeId] : [];
  const [employees] = await db.query(
    `SELECT id, name, department FROM employees WHERE is_active=1 ${employeeId ? 'AND id=?' : ''} ORDER BY name`,
    eParams
  );

  // Build productivity map
  const idleMap = {};
  for (const r of idleRows) {
    const key = `${r.employee_id}:${r.date.slice(0,10)}`;
    idleMap[key] = (r.idle_seconds || 0);
  }
  const appMap = {};
  for (const r of appRows) {
    const key = `${r.employee_id}:${r.date.slice(0,10)}`;
    if (!appMap[key]) appMap[key] = [];
    appMap[key].push({ app_name: r.app_name, secs: r.secs });
  }

  const result = employees.map(emp => {
    const days_data = dateList.map(date => {
      const sess = sessRows.find(r => String(r.employee_id) === String(emp.id) && r.date.slice(0,10) === date);
      const tracked_minutes = sess ? (sess.tracked_minutes || 0) : 0;
      const idle_seconds    = idleMap[`${emp.id}:${date}`] || 0;
      const tracked_seconds = tracked_minutes * 60;
      const active_seconds  = Math.max(0, tracked_seconds - idle_seconds);
      const score = tracked_seconds > 0 ? Math.round((active_seconds / tracked_seconds) * 100) : null;
      const apps  = appMap[`${emp.id}:${date}`] || [];
      return { date, tracked_minutes, idle_seconds, active_seconds, score, apps };
    });

    // Aggregate totals
    const totalTracked = days_data.reduce((a, d) => a + d.tracked_minutes, 0);
    const totalIdle    = days_data.reduce((a, d) => a + d.idle_seconds, 0);
    const totalActive  = days_data.reduce((a, d) => a + d.active_seconds, 0);
    const avgScore = totalTracked > 0
      ? Math.round((totalActive / (totalTracked * 60)) * 100)
      : null;

    // Top apps across period
    const allApps = {};
    for (const d of days_data) {
      for (const a of d.apps) {
        allApps[a.app_name] = (allApps[a.app_name] || 0) + a.secs;
      }
    }
    const topApps = Object.entries(allApps)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([app_name, secs]) => ({ app_name, secs }));

    return { ...emp, days_data, totalTracked, totalIdle, totalActive, avgScore, topApps };
  });

  res.json({ employees: result, dateList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
