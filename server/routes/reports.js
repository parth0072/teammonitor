// routes/reports.js – daily/team reports, AI summaries, chatbot, AI memory
const router = require('express').Router();
const db     = require('../db');
const auth   = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

// ── helpers ──────────────────────────────────────────────────────────────────

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

async function callGroq(prompt, { json = true, maxTokens = 800 } = {}) {
  if (!process.env.GROQ_API_KEY) return null;
  const body = {
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: 'json_object' };
  const res  = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error('[groq] error:', JSON.stringify(data)); return null; }
  const raw  = data.choices?.[0]?.message?.content?.trim() || '';
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

// ── break computation ─────────────────────────────────────────────────────────
// Returns break segments (gaps between consecutive completed sessions).
// A "break" = gap between punch_out of session[i] and punch_in of session[i+1].
// Gaps < 1 min are ignored (likely system glitches).

function computeBreaks(sessions) {
  const completed = sessions
    .filter(s => s.punch_in && s.punch_out)
    .sort((a, b) => new Date(a.punch_in) - new Date(b.punch_in));

  const breaks = [];
  for (let i = 0; i < completed.length - 1; i++) {
    const gapStart = new Date(completed[i].punch_out);
    const gapEnd   = new Date(completed[i + 1].punch_in);
    const gapMins  = Math.round((gapEnd - gapStart) / 60000);
    if (gapMins >= 1) breaks.push({ start: gapStart, end: gapEnd, minutes: gapMins });
  }
  return breaks;
}

// ── rule-based fallback ───────────────────────────────────────────────────────

function calcFocusScore({ productivePercent, totalTrackedMinutes, sessions, breaks = [] }) {
  // Base: productive % scaled to 1–10
  const base = Math.round(productivePercent / 10);
  // Bonus: longer avg sessions = more sustained focus
  const avgSessionMins = sessions.length > 0 ? Math.round(totalTrackedMinutes / sessions.length) : 0;
  const sessionBonus = avgSessionMins >= 90 ? 1 : avgSessionMins >= 45 ? 0 : -1;
  // Penalty: too many breaks = fragmented day (>6 breaks penalised, >9 penalised more)
  const breakCount = breaks.length;
  const breakPenalty = breakCount > 9 ? 2 : breakCount > 6 ? 1 : 0;
  return Math.min(10, Math.max(1, base + sessionBonus - breakPenalty));
}

function buildRuleSummary({ totalTrackedMinutes, sessions, topApps, hourBuckets, productivePercent, breaks = [] }) {
  const focusScore = calcFocusScore({ productivePercent, totalTrackedMinutes, sessions, breaks });
  const topApp     = topApps[0];
  const peakHour   = hourBuckets.reduce((best, v, i) => v > hourBuckets[best] ? i : best, 0);

  const sessWord  = sessions.length === 1 ? 'session' : 'sessions';
  const summary   = `Tracked ${fmtDuration(totalTrackedMinutes)} across ${sessions.length} ${sessWord}. ` +
    `Productive ratio: ${productivePercent}% (${productivePercent >= 60 ? 'above' : 'below'} the 60% benchmark).`;

  const topAppText = topApp
    ? `Most time in ${topApp.app_name} — ${fmtDuration(Math.round(topApp.total_seconds / 60))}.`
    : 'No app usage recorded.';

  const peakText = hourBuckets[peakHour] > 0
    ? `Peak hour: ${hourLabel(peakHour)} with ${Math.round(hourBuckets[peakHour] / 60)} min active.`
    : 'No hourly data available.';

  const insights = productivePercent >= 75 ? 'Excellent focus today!' :
    productivePercent >= 50 ? 'Good productivity. Short breaks are normal.' :
    productivePercent >= 25 ? 'Moderate activity. Try time-blocking.' :
    'Low activity. Try the Pomodoro technique.';

  return { focusScore, summary, topAppText, peakText, insights, pattern: '' };
}

// ── AI summary (individual) ───────────────────────────────────────────────────

async function buildAiSummary(data) {
  const { totalTrackedMinutes, totalActiveSeconds, sessions, topApps, hourBuckets, productivePercent, breaks = [], historyRows = [], idleLogs = [] } = data;
  const focusScore = calcFocusScore({ productivePercent, totalTrackedMinutes, sessions, breaks });
  const peakHour   = hourBuckets.reduce((best, v, i) => v > hourBuckets[best] ? i : best, 0);

  if (!process.env.GROQ_API_KEY) return buildRuleSummary(data);

  // ── Session timeline ──────────────────────────────────────────────────────────
  const sessionLines = sessions.map((s, i) => {
    const pIn  = s.punch_in  ? new Date(s.punch_in).toLocaleTimeString('en-US',  { hour: '2-digit', minute: '2-digit', hour12: true }) : '?';
    const pOut = s.punch_out ? new Date(s.punch_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'ongoing';
    return `  Session ${i + 1}: ${pIn} → ${pOut} (${fmtDuration(s.total_minutes || 0)})${s.task_name ? ', task: ' + s.task_name : ''}`;
  }).join('\n');

  // ── Break analysis ────────────────────────────────────────────────────────────
  const totalBreakMins = breaks.reduce((s, b) => s + b.minutes, 0);
  const avgBreakMins   = breaks.length ? Math.round(totalBreakMins / breaks.length) : 0;
  const shortBreaks    = breaks.filter(b => b.minutes < 5).length;   // micro-breaks (<5 min)
  const longBreaks     = breaks.filter(b => b.minutes > 30).length;  // long breaks (>30 min)
  const breakLines     = breaks.length === 0
    ? '  No breaks detected'
    : breaks.map((b, i) => `  Break ${i + 1}: ${fmtDuration(b.minutes)}`).join('\n');

  // Break frequency: avg minutes of work between breaks
  const avgWorkBetweenBreaks = breaks.length > 0 && sessions.length > 0
    ? Math.round(totalTrackedMinutes / (breaks.length + 1))
    : totalTrackedMinutes;

  // ── Idle / away-from-keyboard analysis ───────────────────────────────────────
  const idleCount      = idleLogs.length;
  const idleTotalSecs  = idleLogs.reduce((s, i) => s + (i.duration_seconds || 0), 0);
  const idleTotalMins  = Math.round(idleTotalSecs / 60);
  const avgIdleMins    = idleCount ? Math.round(idleTotalMins / idleCount) : 0;
  const shortIdles_    = idleLogs.filter(i => i.duration_seconds < 120).length;  // < 2 min
  const longIdles_     = idleLogs.filter(i => i.duration_seconds > 600).length;  // > 10 min
  const idlePercent    = totalTrackedMinutes > 0
    ? Math.round(idleTotalSecs / (totalTrackedMinutes * 60) * 100) : 0;
  // Idle frequency: avg tracked minutes between idle events
  const avgWorkBetweenIdles = idleCount > 0 ? Math.round(totalTrackedMinutes / idleCount) : totalTrackedMinutes;
  const idleLines      = idleCount === 0
    ? '  No idle events recorded'
    : `  ${idleCount} idle event(s) — ${fmtDuration(idleTotalMins)} total, avg ${avgIdleMins}m each`;

  // ── Session pattern ───────────────────────────────────────────────────────────
  const avgSessionMins = sessions.length ? Math.round(totalTrackedMinutes / sessions.length) : 0;
  const longestSession = sessions.reduce((m, s) => Math.max(m, s.total_minutes || 0), 0);
  const shortSessions  = sessions.filter(s => (s.total_minutes || 0) < 15).length; // <15 min sessions

  // ── Hour-by-hour productivity curve ──────────────────────────────────────────
  const activeHours = hourBuckets
    .map((secs, h) => ({ h, mins: Math.round(secs / 60) }))
    .filter(x => x.mins > 0);
  const morningMins   = activeHours.filter(x => x.h >= 6  && x.h < 12).reduce((s, x) => s + x.mins, 0);
  const afternoonMins = activeHours.filter(x => x.h >= 12 && x.h < 17).reduce((s, x) => s + x.mins, 0);
  const eveningMins   = activeHours.filter(x => x.h >= 17 && x.h < 22).reduce((s, x) => s + x.mins, 0);

  // ── Day-to-day fluctuation (7-day history) ────────────────────────────────────
  let fluctuationNote = '';
  if (historyRows.length >= 3) {
    const recentMins = historyRows.map(r => r.total_minutes);
    const avg7       = Math.round(recentMins.reduce((a, b) => a + b, 0) / recentMins.length);
    const maxDev     = Math.max(...recentMins.map(m => Math.abs(m - avg7)));
    const stdDev     = Math.round(Math.sqrt(recentMins.reduce((s, m) => s + Math.pow(m - avg7, 2), 0) / recentMins.length));
    const cvPercent  = avg7 ? Math.round(stdDev / avg7 * 100) : 0; // coefficient of variation
    fluctuationNote  = `7-day avg: ${fmtDuration(avg7)}, today: ${fmtDuration(totalTrackedMinutes)}, ` +
      `consistency score: ${cvPercent < 20 ? 'very consistent' : cvPercent < 40 ? 'moderate variation' : 'high fluctuation'} (CV ${cvPercent}%). ` +
      `Max single-day deviation: ${fmtDuration(maxDev)}.`;
  }

  const prompt = `You are a productivity coach. Analyze this employee's work day — sessions, break habits, time-of-day patterns, and historical consistency — and give concise, specific, actionable feedback.

Work sessions (${sessions.length} total):
${sessionLines || '  (none)'}
- Avg session: ${fmtDuration(avgSessionMins)}, longest: ${fmtDuration(longestSession)}
- Short sessions (<15 min): ${shortSessions}

Breaks (${breaks.length} total):
${breakLines}
- Total break time: ${fmtDuration(totalBreakMins)}, avg break: ${fmtDuration(avgBreakMins)}
- Micro-breaks (<5 min): ${shortBreaks}, long breaks (>30 min): ${longBreaks}
- Avg work between breaks: ${fmtDuration(avgWorkBetweenBreaks)}

Time-of-day productivity:
- Morning (6–12): ${fmtDuration(morningMins)} active
- Afternoon (12–17): ${fmtDuration(afternoonMins)} active
- Evening (17–22): ${fmtDuration(eveningMins)} active
- Peak hour: ${hourLabel(peakHour)} (${Math.round(hourBuckets[peakHour] / 60)} min)

Idle / away-from-keyboard events (${idleCount} total):
${idleLines}
- Short idles (<2 min): ${shortIdles_} (micro-distractions), long idles (>10 min): ${longIdles_} (away from desk)
- Idle as % of tracked time: ${idlePercent}%
- Avg tracked time between idle events: ${fmtDuration(avgWorkBetweenIdles)}

Overall stats:
- Total tracked: ${fmtDuration(totalTrackedMinutes)}, active app time: ${fmtDuration(Math.round(totalActiveSeconds / 60))}
- Productive ratio: ${productivePercent}%
- Top apps: ${topApps.map(a => `${a.app_name} (${fmtDuration(Math.round(a.total_seconds / 60))})`).join(', ') || 'none'}

Historical consistency:
${fluctuationNote || '  (not enough history yet)'}

Flag specifically if:
- Too many breaks (>6 in a day) suggesting distraction or restlessness
- Too few/no breaks (working 3+ hours straight) → burnout risk
- Break frequency too high (avg work between breaks < 30 min) → fragmented focus
- High day-to-day fluctuation → inconsistent work habits
- Heavy afternoon drop-off compared to morning → energy management issue
- Many short sessions (<15 min each) → context switching problem
- High idle count (>10 idle events/day, or going idle more than once every 20 min of tracked time) → frequently stepping away or distracted
- Idle time >30% of tracked time → significant away time, actual focus may be lower than it appears
- Many short idles (<2 min each) → repeatedly getting up and coming back, fragmented attention

Focus score guide (1–10):
- 9–10: long uninterrupted sessions, low idle %, high productivity, good break rhythm
- 7–8: solid work with minor distractions or slightly fragmented sessions
- 5–6: moderate idle, several short sessions, or inconsistent productivity
- 3–4: frequent interruptions, high idle %, many short sessions
- 1–2: very fragmented, high idle, very low productivity

Respond with JSON:
{
  "focusScore": <1-10 integer>,
  "summary": "1-2 sentences max. Describe what the employee worked on and overall performance. Do NOT mention the focus score number — it is shown separately.",
  "insights": "1 sentence max. Single most important observation about breaks, idle, or session patterns with one concrete tip.",
  "topAppText": "1 sentence",
  "peakText": "1 sentence"
}`;

  try {
    const text = await callGroq(prompt);
    if (!text) return buildRuleSummary(data);
    const p = JSON.parse(text);
    console.log('[reports] AI summary OK');
    const str = v => (typeof v === 'string' ? v : '');
    const aiScore = Number.isInteger(p.focusScore) ? Math.min(10, Math.max(1, p.focusScore)) : focusScore;
    return { focusScore: aiScore, summary: str(p.summary), insights: str(p.insights), topAppText: str(p.topAppText), peakText: str(p.peakText), pattern: '' };
  } catch (err) {
    console.error('[reports] AI summary fallback:', err.message);
    return buildRuleSummary(data);
  }
}

// ── save to AI memory ─────────────────────────────────────────────────────────

async function saveMemory(employeeId, date, { totalTrackedMinutes, productivePercent, focusScore, aiNotes }) {
  try {
    await db.query(
      `INSERT INTO employee_daily_memory (employee_id, date, total_minutes, productive_percent, focus_score, ai_notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE total_minutes=VALUES(total_minutes), productive_percent=VALUES(productive_percent),
         focus_score=VALUES(focus_score), ai_notes=VALUES(ai_notes)`,
      [employeeId, date, totalTrackedMinutes, productivePercent, focusScore, aiNotes || null]
    );
  } catch (err) {
    console.warn('[memory] save failed:', err.message);
  }
}

// ── build full report ─────────────────────────────────────────────────────────

async function buildReport(employeeId, date, { saveToMemory = false } = {}) {
  const [sessions] = await db.query(
    `SELECT s.id, s.date, s.punch_in, s.punch_out, s.status,
            -- Cap per-session at 1440 min (24h); active sessions get max 5 min heartbeat lag
            LEAST(
              CASE WHEN s.status = 'active'
                THEN COALESCE(s.total_minutes, 0)
                   + LEAST(COALESCE(TIMESTAMPDIFF(MINUTE, s.last_heartbeat_at, NOW()), 0), 5)
                ELSE COALESCE(s.total_minutes, 0)
              END,
              1440
            ) AS total_minutes,
            COALESCE(t.name, tj.name) AS task_name,
            s.jira_issue_key, s.jira_issue_summary,
            s.last_heartbeat_at
     FROM sessions s
     LEFT JOIN tasks t  ON t.id = s.task_id
     LEFT JOIN tasks tj ON tj.jira_issue_key = s.jira_issue_key AND s.task_id IS NULL
     WHERE s.employee_id = ? AND s.date = ? ORDER BY s.punch_in ASC`,
    [employeeId, date]
  );
  // TIMESTAMPDIFF() returns BIGINT → mysql2 gives back JavaScript strings for BIGINT columns.
  // Force-coerce to Number so downstream reduce/Math operations don't do string concatenation.
  sessions.forEach(s => { s.total_minutes = Number(s.total_minutes) || 0; });

  const [actLogs] = await db.query(
    `SELECT id, app_name, window_title, start_time, end_time, duration_seconds
     FROM activity_logs WHERE employee_id = ? AND date = ? ORDER BY start_time ASC`,
    [employeeId, date]
  );

  const [topApps] = await db.query(
    `SELECT app_name, SUM(duration_seconds) AS total_seconds
     FROM activity_logs WHERE employee_id = ? AND date = ?
     GROUP BY app_name ORDER BY total_seconds DESC LIMIT 5`,
    [employeeId, date]
  );

  const [idleLogs] = await db.query(
    `SELECT idle_start, idle_end, duration_seconds
     FROM idle_logs WHERE employee_id = ? AND date = ? ORDER BY idle_start ASC`,
    [employeeId, date]
  );

  const hourBuckets = new Array(24).fill(0);
  for (const log of actLogs) {
    const h = new Date(log.start_time).getHours();
    if (h >= 0 && h < 24) hourBuckets[h] += log.duration_seconds;
  }

  const productive_hours = hourBuckets.map((seconds, hour) => ({
    hour, label: hourLabel(hour),
    active_seconds: seconds,
    active_minutes: Math.round(seconds / 60),
  }));

  const peak_hours = [...productive_hours]
    .filter(h => h.active_seconds > 0)
    .sort((a, b) => b.active_seconds - a.active_seconds)
    .slice(0, 3)
    .map((h, i) => ({ rank: i + 1, ...h }));

  const totalTrackedMinutes = sessions.reduce((s, r) => s + (r.total_minutes || 0), 0);
  const totalActiveSeconds  = actLogs.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const productivePercent   = totalTrackedMinutes > 0
    ? Math.min(100, Math.round(totalActiveSeconds / (totalTrackedMinutes * 60) * 100)) : 0;

  // Include sessions that have time OR have a punch_out (avoids dropping 0-min completed sessions)
  const activeSessions = sessions.filter(s => s.status === 'active' || s.total_minutes > 0 || s.punch_out);
  const punchInTimes   = activeSessions.map(s => new Date(s.punch_in));
  // last_punch_out: scan ALL sessions that have a punch_out (not just activeSessions)
  const punchOutTimes  = sessions.filter(s => s.punch_out).map(s => new Date(s.punch_out));
  const breaks         = computeBreaks(activeSessions);
  const totalBreakMins = breaks.reduce((s, b) => s + b.minutes, 0);

  const work_pattern = {
    first_punch_in:          punchInTimes.length  ? new Date(Math.min(...punchInTimes))  : null,
    last_punch_out:          punchOutTimes.length ? new Date(Math.max(...punchOutTimes)) : null,
    total_sessions:          sessions.length,
    avg_session_minutes:     activeSessions.length ? Math.round(totalTrackedMinutes / activeSessions.length) : 0,
    longest_session_minutes: activeSessions.reduce((m, s) => Math.max(m, s.total_minutes || 0), 0),
    total_breaks:            breaks.length,
    total_break_minutes:     totalBreakMins,
    avg_break_minutes:       breaks.length ? Math.round(totalBreakMins / breaks.length) : 0,
  };

  // Fetch 7-day history for fluctuation analysis in the AI summary
  const [historyRows] = await db.query(
    `SELECT date, total_minutes, productive_percent, focus_score
     FROM employee_daily_memory
     WHERE employee_id = ? AND date < ? AND date >= DATE_SUB(?, INTERVAL 7 DAY)
     ORDER BY date DESC`,
    [employeeId, date, date]
  );

  const ai_summary = await buildAiSummary({ totalTrackedMinutes, totalActiveSeconds, sessions: activeSessions, topApps, hourBuckets, productivePercent, breaks, historyRows, idleLogs });

  if (saveToMemory) {
    await saveMemory(employeeId, date, {
      totalTrackedMinutes,
      productivePercent,
      focusScore: ai_summary.focusScore,
      aiNotes: ai_summary.insights,
    });
  }

  return {
    date,
    total_tracked_minutes: totalTrackedMinutes,
    total_active_seconds:  totalActiveSeconds,
    productive_percent:    productivePercent,
    punch_log: sessions,
    top_apps:  topApps,
    activity_logs:   actLogs.slice(0, 50),
    productive_hours,
    peak_hours,
    work_pattern,
    breaks,      // array of { start, end, minutes }
    ai_summary,
  };
}

// ── AI pattern analysis (7-day trend) ────────────────────────────────────────

async function buildPatternAnalysis(employeeId, todayReport) {
  if (!process.env.GROQ_API_KEY) return null;

  const [rows] = await db.query(
    `SELECT date, total_minutes, productive_percent, focus_score, ai_notes
     FROM employee_daily_memory
     WHERE employee_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
     ORDER BY date ASC`,
    [employeeId]
  );
  if (rows.length < 2) return null;

  const history = rows.map(r =>
    `${r.date}: ${fmtDuration(r.total_minutes)} tracked, ${r.productive_percent}% productive, focus ${r.focus_score}/10`
  ).join('\n');

  const prompt = `You are a productivity analyst. Based on this employee's last ${rows.length} days of work data, identify patterns and give specific, actionable insights.

Work history:
${history}

Today: ${fmtDuration(todayReport.total_tracked_minutes)} tracked, ${todayReport.productive_percent}% productive, focus ${todayReport.ai_summary?.focusScore ?? 'N/A'}/10.

Respond with JSON: { "trend": "one sentence", "bestDay": "best time/day pattern", "insight": "one actionable tip", "encouragement": "one motivating sentence" }`;

  try {
    const text = await callGroq(prompt, { maxTokens: 400 });
    if (!text) return null;
    const parsed = JSON.parse(text);
    // Ensure all fields are strings — guard against AI returning objects
    const str = v => (typeof v === 'string' ? v : null);
    return {
      trend:         str(parsed.trend),
      bestDay:       str(parsed.bestDay),
      insight:       str(parsed.insight),
      encouragement: str(parsed.encouragement),
    };
  } catch { return null; }
}

// ── routes: individual reports ────────────────────────────────────────────────

router.get('/daily', auth, async (req, res) => {
  try {
    const date   = req.query.date || new Date().toISOString().slice(0, 10);
    const report = await buildReport(req.user.id, date, { saveToMemory: true });
    res.json(report);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/daily/employee', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, date } = req.query;
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const report  = await buildReport(employeeId, targetDate, { saveToMemory: true });
    const pattern = await buildPatternAnalysis(employeeId, report);
    res.json({ ...report, pattern });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /send-slack — admin manually triggers the Slack team digest
router.post('/send-slack', auth, adminOnly, async (req, res) => {
  try {
    const date = req.body.date || new Date().toISOString().slice(0, 10);
    const { sendSlackReport } = require('../utils/slackReport');

    const [employees] = await db.query('SELECT id, name, email FROM employees WHERE is_active = 1');
    const slackReports = [];
    for (const emp of employees) {
      try {
        const report = await buildReport(emp.id, date, { saveToMemory: false });
        if (report.total_tracked_minutes) slackReports.push({ employee: emp, report });
      } catch { /* skip */ }
    }
    await sendSlackReport(date, slackReports);
    res.json({ ok: true, employees: slackReports.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /send-email — admin manually sends the daily report email to one employee
router.post('/send-email', auth, adminOnly, async (req, res) => {
  try {
    const { employeeId, date } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId required' });
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [emps] = await db.query('SELECT id, name, email FROM employees WHERE id = ?', [employeeId]);
    if (!emps.length) return res.status(404).json({ error: 'Employee not found' });
    const emp = emps[0];
    if (!emp.email) return res.status(400).json({ error: 'Employee has no email address' });

    const { sendEmployeeReport } = require('../utils/dailyMail');
    const report = await buildReport(employeeId, targetDate, { saveToMemory: true });
    await sendEmployeeReport(emp, targetDate, report);
    res.json({ ok: true, message: `Report sent to ${emp.email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/weekly', auth, async (req, res) => {
  try {
    const days   = Math.min(parseInt(req.query.days || '7'), 30);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days + 1);
    const [rows] = await db.query(
      `SELECT s.date, SUM(s.total_minutes) AS total_minutes,
              COUNT(DISTINCT s.id) AS session_count,
              COALESCE(SUM(a.duration_seconds), 0) AS active_seconds
       FROM sessions s
       LEFT JOIN activity_logs a ON a.employee_id = s.employee_id AND a.date = s.date
       WHERE s.employee_id = ? AND s.date >= ?
       GROUP BY s.date ORDER BY s.date ASC`,
      [req.user.id, cutoff.toISOString().slice(0, 10)]
    );
    res.json(rows.map(r => ({
      date:               r.date,
      total_minutes:      r.total_minutes || 0,
      session_count:      r.session_count,
      active_seconds:     r.active_seconds || 0,
      productive_percent: r.total_minutes > 0
        ? Math.min(100, Math.round((r.active_seconds / (r.total_minutes * 60)) * 100)) : 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── team report ───────────────────────────────────────────────────────────────

router.get('/team', auth, adminOnly, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    // All active employees
    const [employees] = await db.query(`SELECT id, name FROM employees WHERE is_active = 1`);

    // Per-employee sessions + activity for the date
    const [allSessions] = await db.query(
      `SELECT s.employee_id,
              SUM(LEAST(COALESCE(s.total_minutes, 0), 1440)) AS total_minutes,
              COUNT(*) AS session_count
       FROM sessions s WHERE s.date = ? GROUP BY s.employee_id`, [date]
    );
    const [allActivity] = await db.query(
      `SELECT employee_id, SUM(duration_seconds) AS active_seconds
       FROM activity_logs WHERE date = ? GROUP BY employee_id`, [date]
    );
    const [teamTopApps] = await db.query(
      `SELECT app_name, SUM(duration_seconds) AS total_seconds
       FROM activity_logs WHERE date = ? GROUP BY app_name ORDER BY total_seconds DESC LIMIT 5`, [date]
    );
    const [allIdle] = await db.query(
      `SELECT employee_id, COUNT(*) AS idle_count, SUM(duration_seconds) AS idle_seconds
       FROM idle_logs WHERE date = ? GROUP BY employee_id`, [date]
    );
    // AI-generated focus scores saved by individual daily reports
    const [allMemory] = await db.query(
      `SELECT employee_id, focus_score FROM employee_daily_memory WHERE date = ?`, [date]
    );

    const sessMap   = Object.fromEntries(allSessions.map(r => [r.employee_id, r]));
    const actMap    = Object.fromEntries(allActivity.map(r => [r.employee_id, r]));
    const idleMap   = Object.fromEntries(allIdle.map(r => [r.employee_id, r]));
    const memoryMap = Object.fromEntries(allMemory.map(r => [r.employee_id, r]));

    const members = employees.map(emp => {
      const s  = sessMap[emp.id]   || { total_minutes: 0, session_count: 0 };
      const a  = actMap[emp.id]    || { active_seconds: 0 };
      const il = idleMap[emp.id]   || { idle_count: 0, idle_seconds: 0 };
      const m  = memoryMap[emp.id];
      const productive_percent = s.total_minutes > 0
        ? Math.min(100, Math.round(a.active_seconds / (s.total_minutes * 60) * 100)) : 0;
      // Use AI-generated score from memory if available; fall back to formula
      const focus_score = m?.focus_score != null
        ? m.focus_score
        : calcFocusScore({ productivePercent: productive_percent, totalTrackedMinutes: s.total_minutes, sessions: Array(s.session_count).fill({ total_minutes: s.total_minutes / (s.session_count || 1) }) });
      return {
        employee_id:         emp.id,
        name:                emp.name,
        total_minutes:       s.total_minutes || 0,
        session_count:       s.session_count || 0,
        active_seconds:      a.active_seconds || 0,
        idle_count:          il.idle_count || 0,
        idle_seconds:        il.idle_seconds || 0,
        productive_percent,
        focus_score,
      };
    }).filter(m => m.total_minutes > 0).sort((a, b) => b.total_minutes - a.total_minutes);

    const totalTeamMinutes  = members.reduce((s, m) => s + m.total_minutes, 0);
    const avgFocusScore     = members.length ? Math.round(members.reduce((s, m) => s + m.focus_score, 0) / members.length) : 0;
    const activeCount       = members.length;
    const topContributor    = members[0];

    // Team AI summary
    let team_ai_summary = null;
    if (process.env.GROQ_API_KEY && members.length > 0) {
      const memberLines = members.map(m => {
        const idleNote = m.idle_count > 0
          ? `, ${m.idle_count} idle events (${fmtDuration(Math.round(m.idle_seconds / 60))} idle)` : '';
        return `- ${m.name}: ${fmtDuration(m.total_minutes)}, focus ${m.focus_score}/10, ${m.productive_percent}% productive${idleNote}`;
      }).join('\n');

      const prompt = `You are a team productivity coach. Analyze the team's work day and give an executive summary.

Date: ${date}
Team size tracked today: ${activeCount} employee(s)
Total team hours: ${fmtDuration(totalTeamMinutes)}
Average focus score: ${avgFocusScore}/10
Top apps across team: ${teamTopApps.map(a => a.app_name).join(', ') || 'none'}

Per-employee breakdown (includes idle events = times the employee stepped away from keyboard):
${memberLines}

Flag if any employee has unusually high idle counts (suggests frequent distractions or stepping away repeatedly).

Respond with JSON: {
  "summary": "2-3 sentences about team performance",
  "insights": "1-2 sentences on standout patterns or concerns (mention idle behavior if notable)",
  "recommendation": "1 actionable suggestion for the team tomorrow"
}`;

      try {
        const text = await callGroq(prompt);
        if (text) {
          const p = JSON.parse(text);
          const str = v => (typeof v === 'string' ? v : '');
          team_ai_summary = { summary: str(p.summary), insights: str(p.insights), recommendation: str(p.recommendation) };
        }
      } catch (err) {
        console.warn('[reports/team] AI fallback:', err.message);
      }
    }

    if (!team_ai_summary) {
      team_ai_summary = {
        summary: `${activeCount} team member(s) tracked a total of ${fmtDuration(totalTeamMinutes)} today with an average focus score of ${avgFocusScore}/10.`,
        insights: topContributor ? `${topContributor.name} led the team with ${fmtDuration(topContributor.total_minutes)} tracked.` : 'No tracking data today.',
        recommendation: avgFocusScore < 5 ? 'Consider a team sync to address productivity blockers.' : 'Keep up the good work — maintain consistent check-ins.',
      };
    }

    res.json({ date, total_team_minutes: totalTeamMinutes, avg_focus_score: avgFocusScore, active_count: activeCount, members, team_top_apps: teamTopApps, team_ai_summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── chatbot ───────────────────────────────────────────────────────────────────

router.post('/chat', auth, adminOnly, async (req, res) => {
  try {
    const { message, date, employeeId, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // Load context
    let context = `You are an AI assistant for TeamMonitor, a productivity tracking tool. Today is ${targetDate}.`;

    if (employeeId) {
      const [empRows] = await db.query(`SELECT name FROM employees WHERE id = ?`, [employeeId]);
      const empName   = empRows[0]?.name || 'the employee';
      const [sessions] = await db.query(
        `SELECT SUM(total_minutes) AS total_minutes, COUNT(*) AS sessions FROM sessions WHERE employee_id = ? AND date = ?`,
        [employeeId, targetDate]
      );
      const [apps] = await db.query(
        `SELECT app_name, SUM(duration_seconds) AS secs FROM activity_logs WHERE employee_id = ? AND date = ? GROUP BY app_name ORDER BY secs DESC LIMIT 5`,
        [employeeId, targetDate]
      );
      const s = sessions[0] || {};
      context += `\n\nEmployee: ${empName}\nTracked today: ${fmtDuration(s.total_minutes || 0)} across ${s.sessions || 0} session(s)\nTop apps: ${apps.map(a => `${a.app_name} (${fmtDuration(Math.round(a.secs / 60))})`).join(', ') || 'none'}\n\nAnswer questions about this employee's work data concisely and helpfully.`;
    } else {
      const [teamStats] = await db.query(
        `SELECT e.name, SUM(s.total_minutes) AS mins FROM sessions s JOIN employees e ON e.id = s.employee_id WHERE s.date = ? GROUP BY s.employee_id ORDER BY mins DESC`,
        [targetDate]
      );
      context += `\n\nTeam summary for ${targetDate}:\n${teamStats.map(r => `- ${r.name}: ${fmtDuration(r.mins)}`).join('\n') || 'No tracking data'}\n\nAnswer questions about the team's work data concisely and helpfully.`;
    }

    if (!process.env.GROQ_API_KEY) {
      return res.json({ reply: 'AI chatbot requires a GROQ_API_KEY to be configured on the server.' });
    }

    const messages = [
      { role: 'system', content: context },
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, temperature: 0.6, max_tokens: 400 }),
    });
    const groqData = await groqRes.json();
    const reply = groqData.choices?.[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';
    res.json({ reply });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AI memory reminder ────────────────────────────────────────────────────────
// Called by the macOS agent after punch-out (and optionally on heartbeat).
// Returns a personalised reminder based on today's sessions, breaks, and
// the employee's 7-day historical pattern stored in employee_daily_memory.

router.get('/reminder', auth, async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today      = new Date().toISOString().slice(0, 10);

    // ── Today's sessions ──────────────────────────────────────────────────────
    const [todaySessions] = await db.query(
      `SELECT id, punch_in, punch_out, total_minutes, status,
              (SELECT name FROM tasks WHERE id = s.task_id) AS task_name
       FROM sessions s WHERE employee_id = ? AND date = ? ORDER BY punch_in ASC`,
      [employeeId, today]
    );
    const todayMins   = todaySessions.reduce((s, r) => s + (r.total_minutes || 0), 0);
    const breaks      = computeBreaks(todaySessions);
    const totalBreaks = breaks.length;
    const totalBreakMins = breaks.reduce((s, b) => s + b.minutes, 0);

    // Time since last punch-out (to detect no-break-yet situations)
    const activeSess  = todaySessions.find(s => s.status === 'active');
    const lastPunchIn = activeSess ? new Date(activeSess.punch_in) : null;
    const minsSinceStart = lastPunchIn ? Math.round((Date.now() - lastPunchIn) / 60000) : null;

    // ── 7-day historical pattern ──────────────────────────────────────────────
    const [memRows] = await db.query(
      `SELECT date, total_minutes, productive_percent, focus_score, ai_notes
       FROM employee_daily_memory
       WHERE employee_id = ? AND date < ? AND date >= DATE_SUB(?, INTERVAL 7 DAY)
       ORDER BY date DESC`,
      [employeeId, today, today]
    );
    const avgMins    = memRows.length ? Math.round(memRows.reduce((s, r) => s + r.total_minutes, 0) / memRows.length) : 0;
    const avgFocus   = memRows.length ? Math.round(memRows.reduce((s, r) => s + r.focus_score,   0) / memRows.length) : 0;
    const historyLines = memRows.map(r =>
      `  ${r.date}: ${fmtDuration(r.total_minutes)}, focus ${r.focus_score}/10, ${r.productive_percent}% productive${r.ai_notes ? ' — ' + r.ai_notes : ''}`
    ).join('\n');

    // ── Rule-based fallback (no GROQ_API_KEY) ────────────────────────────────
    if (!process.env.GROQ_API_KEY) {
      let reminder = null;
      if (todayMins === 0) {
        reminder = "You haven't tracked any time today. Don't forget to punch in!";
      } else if (avgMins > 0 && todayMins < avgMins * 0.5) {
        reminder = `You've tracked ${fmtDuration(todayMins)} — well below your ${fmtDuration(avgMins)} daily average. It looks like a slow day.`;
      } else if (avgMins > 0 && todayMins < avgMins * 0.75) {
        reminder = `You've tracked ${fmtDuration(todayMins)}, less than your usual ${fmtDuration(avgMins)}. Keep going!`;
      } else if (totalBreaks === 0 && todayMins >= 90) {
        reminder = "You've been working for a while without a break. Consider stepping away for a few minutes.";
      }
      return res.json({ reminder, today_minutes: todayMins, avg_minutes: avgMins, avg_focus: avgFocus });
    }

    // ── AI-powered reminder ───────────────────────────────────────────────────
    const sessionLines = todaySessions.map((s, i) => {
      const pIn  = s.punch_in  ? new Date(s.punch_in).toLocaleTimeString('en-US',  { hour: '2-digit', minute: '2-digit', hour12: true }) : '?';
      const pOut = s.punch_out ? new Date(s.punch_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'ongoing';
      return `  Session ${i + 1}: ${pIn} → ${pOut} (${fmtDuration(s.total_minutes || 0)})${s.task_name ? ', task: ' + s.task_name : ''}`;
    }).join('\n') || '  (no sessions today)';

    const avgBreakMins = totalBreaks ? Math.round(totalBreakMins / totalBreaks) : 0;
    const shortBreaks  = breaks.filter(b => b.minutes < 5).length;
    const longBreaks   = breaks.filter(b => b.minutes > 30).length;
    const avgWorkBetweenBreaks = totalBreaks > 0
      ? Math.round(todayMins / (totalBreaks + 1)) : todayMins;

    const breakDetail = totalBreaks === 0
      ? 'No breaks taken today'
      : `${totalBreaks} break(s) — total ${fmtDuration(totalBreakMins)}, avg ${fmtDuration(avgBreakMins)}, micro (<5 min): ${shortBreaks}, long (>30 min): ${longBreaks}. Avg work between breaks: ${fmtDuration(avgWorkBetweenBreaks)}.`;

    // Day-to-day fluctuation
    let fluctuationCtx = 'No history yet';
    if (memRows.length >= 3) {
      const mins7   = memRows.map(r => r.total_minutes);
      const avg7    = Math.round(mins7.reduce((a, b) => a + b, 0) / mins7.length);
      const stdDev  = Math.round(Math.sqrt(mins7.reduce((s, m) => s + Math.pow(m - avg7, 2), 0) / mins7.length));
      const cv      = avg7 ? Math.round(stdDev / avg7 * 100) : 0;
      fluctuationCtx = `7-day avg: ${fmtDuration(avg7)}, today: ${fmtDuration(todayMins)}, consistency: ${cv < 20 ? 'very consistent' : cv < 40 ? 'moderate variation' : 'high fluctuation'} (CV ${cv}%)`;
    }

    const prompt = `You are a warm, supportive productivity coach sending a short push notification to an employee.

Today's work (${today}):
${sessionLines}
Sessions: ${todaySessions.length} total

Breaks: ${breakDetail}

${minsSinceStart !== null ? `Currently in active session — ${fmtDuration(minsSinceStart)} since last punch-in` : 'Not currently tracking'}

Historical context:
${historyLines || '  (no history yet)'}
Fluctuation: ${fluctuationCtx}
7-day avg focus: ${avgFocus}/10

Flag the MOST important single issue (pick one):
1. No sessions today → punch-in reminder
2. Active 90+ min with zero breaks → break nudge
3. Too many breaks (>6) with short avg work between them → focus suggestion
4. Only micro-breaks (<5 min each) → suggest a real rest
5. High day-to-day fluctuation (CV>40%) → consistency coaching
6. Significantly below historical average (today < 60% of avg) → encouragement
7. Significantly above historical average (today > 130% of avg) → acknowledge it
8. Nothing notable → return null

Keep it to 1-2 short, direct sentences. No hollow praise.

Respond with JSON: { "reminder": "the message, or null" }`;

    try {
      const text = await callGroq(prompt, { maxTokens: 150 });
      const p    = text ? JSON.parse(text) : {};
      const reminder = typeof p.reminder === 'string' && p.reminder !== 'null' ? p.reminder : null;
      return res.json({ reminder, today_minutes: todayMins, avg_minutes: avgMins, avg_focus: avgFocus });
    } catch (err) {
      console.warn('[reminder] AI fallback:', err.message);
      // Rule-based fallback
      const reminder = todayMins === 0
        ? "You haven't tracked any time today. Don't forget to punch in!"
        : (totalBreaks === 0 && todayMins >= 90 ? "You've been going for a while — a short break could help you focus better." : null);
      return res.json({ reminder, today_minutes: todayMins, avg_minutes: avgMins, avg_focus: avgFocus });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.buildReport = buildReport;
