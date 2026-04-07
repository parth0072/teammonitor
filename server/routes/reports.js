// routes/reports.js – comprehensive daily report (punch log, patterns, AI summary)
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// ── helpers ─────────────────────────────────────────────────────────────────

function hourLabel(h) {
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const next = h === 23 ? 12 : (h + 1 > 12 ? h + 1 - 12 : h + 1);
  const nextAmpm = (h + 1) < 12 ? 'AM' : 'PM';
  return `${h12}:00 ${ampm} – ${next}:00 ${nextAmpm}`;
}

function fmtDuration(mins) {
  if (!mins || mins <= 0) return '0m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

function buildRuleSummary({ totalTrackedMinutes, totalActiveSeconds, sessions, topApps, hourBuckets, productivePercent }) {
  const focusScore = Math.min(10, Math.round((productivePercent + Math.min(sessions.length * 5, 20)) / 12));
  const topApp     = topApps[0];
  const peakHour   = hourBuckets.reduce((best, v, i) => v > hourBuckets[best] ? i : best, 0);

  const hrsStr   = fmtDuration(totalTrackedMinutes);
  const sessWord = sessions.length === 1 ? 'session' : 'sessions';
  const summary  = `You tracked ${hrsStr} across ${sessions.length} ${sessWord} today. ` +
    `Your productive ratio was ${productivePercent}%, ` +
    (productivePercent >= 60 ? 'above' : 'below') + ' the typical 60% benchmark.';

  const topAppText = topApp
    ? `Most time was spent in ${topApp.app_name} — ${fmtDuration(Math.round(topApp.total_seconds / 60))} ` +
      `(${totalTrackedMinutes > 0 ? Math.round(topApp.total_seconds / 60 * 100 / totalTrackedMinutes) : 0}% of tracked time).`
    : 'No app usage data recorded.';

  const peakMins    = Math.round(hourBuckets[peakHour] / 60);
  const peakHourStr = hourLabel(peakHour);
  const peakText    = hourBuckets[peakHour] > 0
    ? `Peak hour was ${peakHourStr} with ${peakMins} minutes of activity. Schedule important work in this window.`
    : 'No hourly data available.';

  let insights;
  if (productivePercent >= 75)      insights = 'Excellent focus today! You maintained high activity throughout your sessions.';
  else if (productivePercent >= 50) insights = 'Good productivity. Short breaks may cause natural dips — that\'s normal.';
  else if (productivePercent >= 25) insights = 'Moderate activity today. Consider time-blocking to improve focus.';
  else                               insights = 'Low activity detected. Try the Pomodoro technique: 25 min focus, 5 min break.';

  let pattern = '';
  if (sessions.length > 1) {
    const avg = Math.round(totalTrackedMinutes / sessions.length);
    pattern = `You had ${sessions.length} sessions with an average length of ${fmtDuration(avg)}.`;
  }

  return { focusScore, summary, topAppText, peakText, insights, pattern };
}

async function buildAiSummary(data) {
  const { totalTrackedMinutes, totalActiveSeconds, sessions, topApps, hourBuckets, productivePercent } = data;

  if (!process.env.GROQ_API_KEY) return buildRuleSummary(data);

  const focusScore = Math.min(10, Math.round((productivePercent + Math.min(sessions.length * 5, 20)) / 12));
  const peakHour   = hourBuckets.reduce((best, v, i) => v > hourBuckets[best] ? i : best, 0);

  const context = `
Employee daily work report data:
- Total tracked time: ${fmtDuration(totalTrackedMinutes)}
- Active app usage: ${fmtDuration(Math.round(totalActiveSeconds / 60))}
- Productive ratio: ${productivePercent}% (active time / tracked time)
- Number of sessions: ${sessions.length}
- Focus score: ${focusScore}/10
- Top apps used: ${topApps.map(a => `${a.app_name} (${fmtDuration(Math.round(a.total_seconds / 60))})`).join(', ') || 'none'}
- Peak activity hour: ${hourLabel(peakHour)} (${Math.round(hourBuckets[peakHour] / 60)} minutes active)
`.trim();

  const prompt = `You are a productivity coach analyzing an employee's work day. Based on this data, write a concise, encouraging, and actionable report.

${context}

Respond with a JSON object (no markdown, just raw JSON) with these exact fields:
{
  "summary": "2-3 sentence overview of the day",
  "insights": "1-2 sentence specific observation or tip based on the data",
  "topAppText": "1 sentence about top app usage",
  "peakText": "1 sentence about peak hour with advice"
}

Keep tone professional but friendly. Be specific — use the actual numbers from the data.`;

  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '';
    const parsed = JSON.parse(text);
    return {
      focusScore,
      summary:    parsed.summary    || '',
      insights:   parsed.insights   || '',
      topAppText: parsed.topAppText || '',
      peakText:   parsed.peakText   || '',
      pattern:    '',
    };
  } catch (err) {
    console.warn('[reports] Groq fallback to rule-based:', err.message);
    return buildRuleSummary(data);
  }
}

async function buildReport(employeeId, date) {
  // 1. Punch log — sessions with task/jira info
  const [sessions] = await db.query(
    `SELECT s.id, s.punch_in, s.punch_out, s.total_minutes, s.status,
            t.name AS task_name, s.jira_issue_key
     FROM sessions s
     LEFT JOIN tasks t ON s.task_id = t.id
     WHERE s.employee_id = ? AND s.date = ?
     ORDER BY s.punch_in ASC`,
    [employeeId, date]
  );

  // 2. Activity per hour
  const [actLogs] = await db.query(
    `SELECT app_name, window_title, start_time, end_time, duration_seconds
     FROM activity_logs WHERE employee_id = ? AND date = ? ORDER BY start_time ASC`,
    [employeeId, date]
  );

  // 3. App usage summary
  const [topApps] = await db.query(
    `SELECT app_name, SUM(duration_seconds) AS total_seconds
     FROM activity_logs WHERE employee_id = ? AND date = ?
     GROUP BY app_name ORDER BY total_seconds DESC LIMIT 5`,
    [employeeId, date]
  );

  // Build 24-bucket hourly breakdown
  const hourBuckets = new Array(24).fill(0);
  for (const log of actLogs) {
    const h = new Date(log.start_time).getHours();
    if (h >= 0 && h < 24) hourBuckets[h] += log.duration_seconds;
  }

  const productive_hours = hourBuckets.map((seconds, hour) => ({
    hour,
    label: hourLabel(hour),
    active_seconds: seconds,
    active_minutes: Math.round(seconds / 60),
  }));

  // Peak hours — top 3
  const peak_hours = [...productive_hours]
    .filter(h => h.active_seconds > 0)
    .sort((a, b) => b.active_seconds - a.active_seconds)
    .slice(0, 3)
    .map((h, i) => ({ rank: i + 1, ...h }));

  // Work pattern
  const totalTrackedMinutes = sessions.reduce((s, r) => s + (r.total_minutes || 0), 0);
  const totalActiveSeconds  = actLogs.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const productivePercent   = totalTrackedMinutes > 0
    ? Math.min(100, Math.round(totalActiveSeconds / (totalTrackedMinutes * 60) * 100))
    : 0;

  const activeSessions  = sessions.filter(s => s.status === 'active' || s.total_minutes > 0);
  const punchInTimes    = activeSessions.map(s => new Date(s.punch_in));
  const punchOutTimes   = activeSessions.filter(s => s.punch_out).map(s => new Date(s.punch_out));
  const firstPunchIn    = punchInTimes.length  ? new Date(Math.min(...punchInTimes))  : null;
  const lastPunchOut    = punchOutTimes.length ? new Date(Math.max(...punchOutTimes)) : null;
  const avgSessionMins  = activeSessions.length ? Math.round(totalTrackedMinutes / activeSessions.length) : 0;
  const longestSession  = activeSessions.reduce((m, s) => s.total_minutes > (m?.total_minutes || 0) ? s : m, null);

  const work_pattern = {
    first_punch_in:         firstPunchIn,
    last_punch_out:         lastPunchOut,
    total_sessions:         sessions.length,
    avg_session_minutes:    avgSessionMins,
    longest_session_minutes: longestSession?.total_minutes || 0,
  };

  // AI summary
  const ai_summary = await buildAiSummary({
    totalTrackedMinutes,
    totalActiveSeconds,
    sessions: activeSessions,
    topApps,
    hourBuckets,
    productivePercent,
  });

  return {
    date,
    total_tracked_minutes: totalTrackedMinutes,
    total_active_seconds:  totalActiveSeconds,
    productive_percent:    productivePercent,
    punch_log:       sessions,
    top_apps:        topApps,
    activity_logs:   actLogs.slice(0, 50),   // capped for payload size
    productive_hours,
    peak_hours,
    work_pattern,
    ai_summary,
  };
}

// GET /api/reports/daily?date=YYYY-MM-DD  (employee — own report)
router.get('/daily', auth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const report = await buildReport(req.user.id, date);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/daily/employee?employeeId=&date=  (admin)
router.get('/daily/employee', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, date } = req.query;
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const report = await buildReport(employeeId, targetDate);
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/weekly?days=7  (employee — own week summary)
router.get('/weekly', auth, async (req, res) => {
  try {
    const days   = Math.min(parseInt(req.query.days || '7'), 30);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days + 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const [rows] = await db.query(
      `SELECT
         s.date,
         SUM(s.total_minutes) AS total_minutes,
         COUNT(DISTINCT s.id) AS session_count,
         COALESCE(SUM(a.duration_seconds), 0) AS active_seconds
       FROM sessions s
       LEFT JOIN activity_logs a ON a.employee_id = s.employee_id AND a.date = s.date
       WHERE s.employee_id = ? AND s.date >= ?
       GROUP BY s.date ORDER BY s.date ASC`,
      [req.user.id, cutoffStr]
    );

    // Productive percent per day
    const result = rows.map(r => ({
      date:              r.date,
      total_minutes:     r.total_minutes || 0,
      session_count:     r.session_count,
      active_seconds:    r.active_seconds || 0,
      productive_percent: r.total_minutes > 0
        ? Math.min(100, Math.round((r.active_seconds / (r.total_minutes * 60)) * 100))
        : 0,
    }));

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
