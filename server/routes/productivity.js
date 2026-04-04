// routes/productivity.js – productivity stats + custom policy rules
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// ── Productivity Policy Rules (admin only) ────────────────────────────────────

// GET /api/productivity/rules
router.get('/rules', auth, adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, app_name, category, created_at FROM productivity_rules ORDER BY app_name ASC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/productivity/rules  { app_name, category }
router.post('/rules', auth, adminOnly, async (req, res) => {
  try {
    const { app_name, category } = req.body;
    if (!app_name || !category) return res.status(400).json({ error: 'app_name and category required' });
    if (!['productive','neutral','unproductive'].includes(category))
      return res.status(400).json({ error: 'category must be productive, neutral, or unproductive' });

    const [result] = await db.query(
      'INSERT INTO productivity_rules (app_name, category, created_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE category=VALUES(category)',
      [app_name.trim(), category, req.user.id]
    );
    const [rows] = await db.query('SELECT id, app_name, category, created_at FROM productivity_rules WHERE app_name=?', [app_name.trim()]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/productivity/rules/:id  { category }
router.put('/rules/:id', auth, adminOnly, async (req, res) => {
  try {
    const { category } = req.body;
    if (!['productive','neutral','unproductive'].includes(category))
      return res.status(400).json({ error: 'Invalid category' });
    await db.query('UPDATE productivity_rules SET category=? WHERE id=?', [category, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/productivity/rules/:id
router.delete('/rules/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.query('DELETE FROM productivity_rules WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Productivity Stats ────────────────────────────────────────────────────────

// GET /api/productivity?days=7&employeeId=
router.get('/', auth, async (req, res) => {
  try {
    const days       = Math.min(parseInt(req.query.days) || 7, 30);
    const employeeId = req.user.role !== 'admin' ? req.user.id : req.query.employeeId;

    // Date list (today back N days)
    const dateList = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dateList.push(d.toISOString().slice(0, 10));
    }
    const oldest = dateList[dateList.length - 1];

    const empFilter = employeeId ? 'AND s.employee_id=?' : '';

    // Session totals
    const [sessRows] = await db.query(
      `SELECT s.employee_id, s.date, SUM(s.total_minutes) AS tracked_minutes
       FROM sessions s
       WHERE s.date >= ? ${empFilter}
       GROUP BY s.employee_id, s.date`,
      employeeId ? [oldest, employeeId] : [oldest]
    );

    // Idle totals
    const [idleRows] = await db.query(
      `SELECT il.employee_id, il.date, SUM(il.duration_seconds) AS idle_seconds
       FROM idle_logs il
       WHERE il.date >= ? ${employeeId ? 'AND il.employee_id=?' : ''}
       GROUP BY il.employee_id, il.date`,
      employeeId ? [oldest, employeeId] : [oldest]
    );

    // App usage
    const [appRows] = await db.query(
      `SELECT al.employee_id, al.date, al.app_name, SUM(al.duration_seconds) AS secs
       FROM activity_logs al
       WHERE al.date >= ? ${employeeId ? 'AND al.employee_id=?' : ''}
       GROUP BY al.employee_id, al.date, al.app_name`,
      employeeId ? [oldest, employeeId] : [oldest]
    );

    // Custom productivity rules (admin-defined)
    const [rulesRows] = await db.query(
      'SELECT app_name, category FROM productivity_rules'
    );
    const rules = {};
    for (const r of rulesRows) rules[r.app_name.toLowerCase()] = r.category;
    const hasRules = rulesRows.length > 0;

    // Employee list
    const [employees] = await db.query(
      `SELECT id, name, department FROM employees WHERE is_active=1 ${employeeId ? 'AND id=?' : ''} ORDER BY name`,
      employeeId ? [employeeId] : []
    );

    const toDateStr = v => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

    const idleMap = {};
    for (const r of idleRows) {
      idleMap[`${r.employee_id}:${toDateStr(r.date)}`] = Number(r.idle_seconds || 0);
    }
    const appMap = {};
    for (const r of appRows) {
      const key = `${r.employee_id}:${toDateStr(r.date)}`;
      if (!appMap[key]) appMap[key] = [];
      appMap[key].push({ app_name: r.app_name, secs: Number(r.secs || 0) });
    }

    const result = employees.map(emp => {
      const days_data = dateList.map(date => {
        const sess           = sessRows.find(r => String(r.employee_id) === String(emp.id) && toDateStr(r.date) === date);
        const tracked_minutes = sess ? (Number(sess.tracked_minutes) || 0) : 0;
        const idle_seconds    = idleMap[`${emp.id}:${date}`] || 0;
        const tracked_seconds = tracked_minutes * 60;
        const active_seconds  = Math.max(0, tracked_seconds - idle_seconds);
        const apps            = appMap[`${emp.id}:${date}`] || [];

        // Idle-based score (fallback)
        const idle_score = tracked_seconds > 0
          ? Math.round((active_seconds / tracked_seconds) * 100)
          : null;

        // App-rule-based score (when rules are configured)
        let custom_score = null;
        if (hasRules && apps.length > 0) {
          let productive_secs = 0, unproductive_secs = 0;
          for (const a of apps) {
            const cat = rules[a.app_name.toLowerCase()];
            if (cat === 'productive')   productive_secs   += a.secs;
            if (cat === 'unproductive') unproductive_secs += a.secs;
          }
          const classified = productive_secs + unproductive_secs;
          if (classified > 0) {
            custom_score = Math.round((productive_secs / classified) * 100);
          }
        }

        const score = custom_score !== null ? custom_score : idle_score;

        return { date, tracked_minutes, idle_seconds, active_seconds, score, idle_score, custom_score, apps };
      });

      const totalTracked = days_data.reduce((a, d) => a + d.tracked_minutes, 0);
      const totalIdle    = days_data.reduce((a, d) => a + d.idle_seconds, 0);
      const totalActive  = days_data.reduce((a, d) => a + d.active_seconds, 0);
      const scored       = days_data.filter(d => d.score !== null);
      const avgScore     = scored.length > 0
        ? Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length)
        : null;

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

    res.json({ employees: result, dateList, hasCustomPolicy: hasRules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
