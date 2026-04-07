// utils/dailyMail.js – generate + send daily work reports to each employee
'use strict';

const nodemailer = require('nodemailer');
const db         = require('../db');

// ── SMTP transport ────────────────────────────────────────────────────────────

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtMins(mins) {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`;
}

function fmtTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function scoreColor(score) {
  if (score >= 7) return '#16a34a';
  if (score >= 4) return '#d97706';
  return '#dc2626';
}

function scoreBg(score) {
  if (score >= 7) return '#dcfce7';
  if (score >= 4) return '#fef9c3';
  return '#fee2e2';
}

// ── HTML email template ───────────────────────────────────────────────────────

function buildHtml({ employee, date, report, pattern }) {
  const ai     = report.ai_summary || {};
  const focus  = ai.focusScore ?? 0;
  const topApp = report.top_apps?.[0];

  const punchRows = (report.punch_log || []).map(s => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:13px;color:#374151">${fmtTime(s.punch_in)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:13px;color:#374151">${s.punch_out ? fmtTime(s.punch_out) : '<span style="color:#f59e0b">Active</span>'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#6b7280">${fmtMins(s.duration_minutes)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#6366f1">${s.task_name || s.jira_issue_key || '—'}</td>
    </tr>`).join('');

  const appRows = (report.top_apps || []).slice(0, 5).map((a, i) => {
    const totalSecs = (report.top_apps || []).reduce((s, x) => s + (x.total_seconds || 0), 0) || 1;
    const pct = Math.round((a.total_seconds / totalSecs) * 100);
    const colors = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ec4899'];
    return `
    <tr>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;font-weight:500">${a.app_name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#6b7280">${fmtMins(Math.round(a.total_seconds / 60))}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f1f5f9">
        <div style="background:#f1f5f9;border-radius:3px;height:8px;width:100%;min-width:80px">
          <div style="height:8px;border-radius:3px;background:${colors[i]};width:${pct}%"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const patternBlock = pattern ? `
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#0369a1;margin-bottom:12px">📊 7-Day Pattern Analysis</div>
      ${pattern.trend       ? `<p style="margin:0 0 8px;font-size:14px;color:#1e293b"><strong>Trend:</strong> ${pattern.trend}</p>` : ''}
      ${pattern.bestDay     ? `<p style="margin:0 0 8px;font-size:14px;color:#1e293b"><strong>Your best time:</strong> ${pattern.bestDay}</p>` : ''}
      ${pattern.insight     ? `<p style="margin:0 0 8px;font-size:14px;color:#1e293b"><strong>Tip:</strong> ${pattern.insight}</p>` : ''}
      ${pattern.encouragement ? `<p style="margin:0;font-size:14px;color:#0369a1;font-style:italic">${pattern.encouragement}</p>` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 32px 24px">
    <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Daily Work Report</div>
    <div style="font-size:24px;font-weight:800;color:#ffffff;margin-bottom:4px">${employee.name}</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.8)">${new Date(date + 'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
  </div>

  <!-- Stats row -->
  <div style="display:flex;gap:0;border-bottom:1px solid #f1f5f9">
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #f1f5f9">
      <div style="font-size:22px;font-weight:800;color:#6366f1">${fmtMins(report.total_tracked_minutes)}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:3px;text-transform:uppercase;letter-spacing:.5px">Tracked</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #f1f5f9">
      <div style="font-size:22px;font-weight:800;color:${scoreColor(focus)}">${focus}/10</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:3px;text-transform:uppercase;letter-spacing:.5px">Focus</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center;border-right:1px solid #f1f5f9">
      <div style="font-size:22px;font-weight:800;color:#0f766e">${report.productive_percent}%</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:3px;text-transform:uppercase;letter-spacing:.5px">Productive</div>
    </div>
    <div style="flex:1;padding:20px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#374151">${report.punch_log?.length || 0}</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:3px;text-transform:uppercase;letter-spacing:.5px">Sessions</div>
    </div>
  </div>

  <div style="padding:28px 32px">

    <!-- AI Summary -->
    ${ai.summary ? `
    <div style="background:linear-gradient(135deg,#faf5ff,#f0f9ff);border:1px solid #e9d5ff;border-radius:12px;padding:20px 24px;margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:15px;font-weight:700;color:#7c3aed">✨ AI Summary</div>
        <div style="background:${scoreBg(focus)};color:${scoreColor(focus)};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700">Focus ${focus}/10</div>
      </div>
      <p style="margin:0 0 10px;font-size:14px;color:#1e293b;line-height:1.6">${ai.summary}</p>
      ${ai.insights ? `<p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.6">${ai.insights}</p>` : ''}
      ${ai.topAppText ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">${ai.topAppText}</p>` : ''}
      ${ai.peakText   ? `<p style="margin:0;font-size:13px;color:#64748b">${ai.peakText}</p>` : ''}
    </div>` : ''}

    <!-- Pattern Analysis -->
    ${patternBlock}

    <!-- Punch Log -->
    ${punchRows ? `
    <div style="margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">🕐 Punch Log</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase">In</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase">Out</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase">Duration</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase">Task</th>
          </tr>
        </thead>
        <tbody>${punchRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Top Apps -->
    ${appRows ? `
    <div style="margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">💻 Top Apps</div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${appRows}</tbody>
      </table>
    </div>` : ''}

    <!-- Work Pattern -->
    ${report.work_pattern ? `
    <div style="background:#f8fafc;border-radius:12px;padding:16px 20px;margin-bottom:24px">
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:12px">📈 Work Pattern</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <div><div style="font-size:11px;color:#94a3b8">First Punch</div><div style="font-size:16px;font-weight:700;color:#374151">${fmtTime(report.work_pattern.first_punch_in)}</div></div>
        <div><div style="font-size:11px;color:#94a3b8">Last Punch</div><div style="font-size:16px;font-weight:700;color:#374151">${fmtTime(report.work_pattern.last_punch_out)}</div></div>
        <div><div style="font-size:11px;color:#94a3b8">Avg Session</div><div style="font-size:16px;font-weight:700;color:#374151">${fmtMins(report.work_pattern.avg_session_minutes)}</div></div>
        <div><div style="font-size:11px;color:#94a3b8">Longest</div><div style="font-size:16px;font-weight:700;color:#374151">${fmtMins(report.work_pattern.longest_session_minutes)}</div></div>
      </div>
    </div>` : ''}

  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;border-top:1px solid #f1f5f9;padding:16px 32px;text-align:center">
    <div style="font-size:12px;color:#94a3b8">This report was automatically generated by <strong style="color:#6366f1">TeamMonitor</strong></div>
  </div>

</div>
</body>
</html>`;
}

// ── send one employee's report ────────────────────────────────────────────────
// Exported so the /reports/send-email route can call it directly.

async function sendEmployeeReport(employee, date, report) {
  const transport = createTransport();
  if (!transport) throw new Error('SMTP not configured');

  const { buildPatternAnalysis } = require('../routes/reports');
  const pattern = await buildPatternAnalysis(employee.id, report);
  const html    = buildHtml({ employee, date, report, pattern });
  const from    = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = `Your Daily Work Report — ${new Date(date + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`;

  await transport.sendMail({ from, to: employee.email, subject, html });
  console.log(`[dailyMail] Sent report to ${employee.email}`);
}

// ── main: send reports to all active employees ────────────────────────────────

async function sendDailyReports() {
  // Disabled by default — set DAILY_MAIL_ENABLED=true in .env to activate
  if (process.env.DAILY_MAIL_ENABLED !== 'true') {
    console.log('[dailyMail] Automatic emails disabled (DAILY_MAIL_ENABLED != true)');
    return;
  }

  const transport = createTransport();
  if (!transport) {
    console.warn('[dailyMail] Skipped — SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS)');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[dailyMail] Sending daily reports for ${today}…`);

  const [employees] = await db.query(
    `SELECT id, name, email FROM employees WHERE role = 'employee' AND is_active = 1 AND email IS NOT NULL`
  );
  const { buildReport } = require('../routes/reports');

  let sent = 0, failed = 0;
  for (const emp of employees) {
    try {
      const report = await buildReport(emp.id, today, { saveToMemory: true });
      if (!report.total_tracked_minutes) {
        console.log(`[dailyMail] ${emp.name} — no tracked time, skipping`);
        continue;
      }
      await sendEmployeeReport(emp, today, report);
      sent++;
    } catch (err) {
      console.error(`[dailyMail] Failed for ${emp.email}:`, err.message);
      failed++;
    }
  }

  console.log(`[dailyMail] Done — ${sent} sent, ${failed} failed`);
}

module.exports = { sendDailyReports, sendEmployeeReport };
