// utils/teamsReport.js — send daily team digest to MS Teams via Incoming Webhook
// Uses Adaptive Cards (supported by all modern Teams webhooks)
'use strict';

const https = require('https');
const { URL } = require('url');

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtMins(mins) {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? m + 'm' : ''}`.trim() : `${m}m`;
}

function focusBar(score) {
  const filled = Math.round((score / 10) * 8);
  return '█'.repeat(filled) + '░'.repeat(8 - filled);
}

function focusColor(score) {
  if (score >= 8) return 'good';    // green
  if (score >= 5) return 'warning'; // yellow
  return 'attention';               // red
}

// POST JSON to a Teams incoming webhook URL
function postToTeams(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const u    = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const req  = https.request({
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        // Teams returns "1" on success
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Teams webhook returned ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── build Adaptive Card payload ───────────────────────────────────────────────

function buildTeamsPayload(date, employeeReports) {
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const totalMins = employeeReports.reduce((s, r) => s + (r.report.total_tracked_minutes || 0), 0);
  const avgFocus  = employeeReports.length
    ? Math.round(employeeReports.reduce((s, r) => s + (r.report.ai_summary?.focusScore || 0), 0) / employeeReports.length)
    : 0;

  // Adaptive Card body
  const cardBody = [
    // Header
    {
      type: 'TextBlock',
      text: `📊 Daily Team Report — ${dateLabel}`,
      weight: 'Bolder',
      size: 'Large',
      color: 'Accent',
      wrap: true,
    },
    {
      type: 'TextBlock',
      text: `**${employeeReports.length} active** · Team total **${fmtMins(totalMins)}** · Avg focus **${avgFocus}/10**`,
      spacing: 'Small',
      wrap: true,
      size: 'Small',
      color: 'Default',
    },
    { type: 'Separator' },
  ];

  // Per-employee sections
  for (const { employee, report } of employeeReports) {
    const ai      = report.ai_summary || {};
    const focus   = ai.focusScore ?? 0;
    const tracked = fmtMins(report.total_tracked_minutes);

    const breaks    = report.breaks || [];
    const breakMins = breaks.reduce((s, b) => s + (b.minutes || 0), 0);
    const breakLine = breaks.length > 0
      ? `☕ ${breaks.length} break${breaks.length > 1 ? 's' : ''} · ${fmtMins(breakMins)}`
      : '☕ No breaks';

    const punchLog     = report.punch_log || [];
    const sessionCount = punchLog.length;
    const taskNames    = [...new Set(punchLog.map(s => s.task_name || null).filter(Boolean))];
    const jiraItems    = [...new Map(
      punchLog
        .filter(s => !s.task_name && s.jira_issue_key)
        .map(s => [s.jira_issue_summary || s.jira_issue_key, true])
    ).keys()];
    const tasks = [...taskNames, ...jiraItems];
    const taskText = tasks.length ? tasks.map(t => `• ${t}`).join('\n') : '• No task assigned';

    const summary = (ai.summary  || '').split(/(?<=[.!?])\s+/)[0] || ai.summary || '';
    const insight = (ai.insights || '').split(/(?<=[.!?])\s+/)[0] || ai.insights || '';

    const emoji = focus >= 8 ? '🟢' : focus >= 5 ? '🟡' : '🔴';

    cardBody.push(
      // Name + time row
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [{
              type: 'TextBlock',
              text: `${emoji} **${employee.name}**`,
              weight: 'Bolder',
              size: 'Medium',
              wrap: false,
            }],
          },
          {
            type: 'Column',
            width: 'auto',
            items: [{
              type: 'TextBlock',
              text: `\`${tracked}\`  Focus **${focus}/10**`,
              horizontalAlignment: 'Right',
              color: focusColor(focus),
              weight: 'Bolder',
              wrap: false,
            }],
          },
        ],
      },
      // Focus bar
      {
        type: 'TextBlock',
        text: `\`${focusBar(focus)}\``,
        spacing: 'None',
        size: 'Small',
        color: focusColor(focus),
        fontType: 'Monospace',
      },
      // Tasks + summary two-col
      {
        type: 'ColumnSet',
        spacing: 'Small',
        columns: [
          {
            type: 'Column',
            width: 1,
            items: [
              { type: 'TextBlock', text: '**Tasks**', weight: 'Bolder', size: 'Small', spacing: 'None' },
              { type: 'TextBlock', text: taskText, size: 'Small', wrap: true, spacing: 'None', color: 'Default' },
            ],
          },
          {
            type: 'Column',
            width: 1,
            items: [
              { type: 'TextBlock', text: '**Summary**', weight: 'Bolder', size: 'Small', spacing: 'None' },
              { type: 'TextBlock', text: summary ? `_${summary}_` : '_No summary_', size: 'Small', wrap: true, spacing: 'None', isSubtle: true },
            ],
          },
        ],
      },
      // Meta row
      {
        type: 'TextBlock',
        text: [
          `📋 ${sessionCount} session${sessionCount !== 1 ? 's' : ''}`,
          breakLine,
          `⚡ ${report.productive_percent ?? 0}% productive`,
          ...(insight ? [`💡 ${insight}`] : []),
        ].join('   '),
        size: 'Small',
        isSubtle: true,
        wrap: true,
        spacing: 'Small',
      },
      { type: 'Separator' }
    );
  }

  // Footer
  cardBody.push({
    type: 'TextBlock',
    text: `Generated by **TeamMonitor** · ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    size: 'Small',
    isSubtle: true,
    spacing: 'None',
  });

  // MS Teams Adaptive Card message envelope
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: cardBody,
        },
      },
    ],
  };
}

// ── main export ───────────────────────────────────────────────────────────────

async function sendTeamsReport(date, employeeReports) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[teams] TEAMS_WEBHOOK_URL not set — skipping');
    return 0;
  }
  if (!employeeReports.length) {
    console.log('[teams] No reports to send');
    return 0;
  }

  const payload = buildTeamsPayload(date, employeeReports);
  await postToTeams(webhookUrl, payload);
  console.log(`[teams] Team digest sent for ${date} (${employeeReports.length} employees)`);
  return employeeReports.length;
}

module.exports = { sendTeamsReport };
