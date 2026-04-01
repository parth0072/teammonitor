// routes/jira.js  – per-employee Jira integration (API token auth)
const router             = require('express').Router();
const https              = require('https');
const http               = require('http');
const { URL }            = require('url');
const db                 = require('../db');
const auth               = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encrypt');

// ── Jira REST API v3 helper ───────────────────────────────────────────────────
// Uses Node's built-in https so no extra dependencies needed.

function jiraFetch(siteUrl, email, apiToken, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(`${siteUrl.replace(/\/$/, '')}/rest/api/3${path}`);
    const creds    = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const bodyStr  = body ? JSON.stringify(body) : null;

    const options = {
      hostname: endpoint.hostname,
      port:     endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
      path:     endpoint.pathname + endpoint.search,
      method,
      headers: {
        Authorization:   `Basic ${creds}`,
        Accept:          'application/json',
        'Content-Type':  'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const mod = endpoint.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Jira ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getCreds(employeeId) {
  const [rows] = await db.query(
    'SELECT * FROM jira_credentials WHERE employee_id = ?', [employeeId]
  );
  if (!rows[0]) return null;
  // Decrypt the stored token before returning so all callers get the plain value
  const row = { ...rows[0] };
  try { row.api_token = decrypt(row.api_token); } catch { return null; }
  return row;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/jira/status  – is this employee connected?
router.get('/status', auth, async (req, res) => {
  try {
    const c = await getCreds(req.user.id);
    if (!c) return res.json({ connected: false });
    res.json({
      connected:   true,
      siteUrl:     c.site_url,
      email:       c.email,
      displayName: c.display_name,
      accountId:   c.jira_account_id,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jira/connect  – save + verify credentials
router.post('/connect', auth, async (req, res) => {
  try {
    const { siteUrl, email, apiToken } = req.body;
    if (!siteUrl || !email || !apiToken)
      return res.status(400).json({ error: 'siteUrl, email and apiToken are required' });

    // Verify by calling /myself
    let myself;
    try {
      myself = await jiraFetch(siteUrl, email, apiToken, '/myself');
    } catch (err) {
      return res.status(401).json({ error: 'Could not connect to Jira: ' + err.message });
    }

    const cleanUrl      = siteUrl.replace(/\/$/, '');
    const encryptedToken = encrypt(apiToken);

    // Upsert: check if row exists first (works for both MySQL and SQLite)
    const [existing] = await db.query(
      'SELECT id FROM jira_credentials WHERE employee_id = ?', [req.user.id]
    );
    if (existing.length > 0) {
      await db.query(
        `UPDATE jira_credentials
            SET site_url=?, email=?, api_token=?, jira_account_id=?, display_name=?,
                connected_at=CURRENT_TIMESTAMP
          WHERE employee_id=?`,
        [cleanUrl, email, encryptedToken, myself.accountId, myself.displayName, req.user.id]
      );
    } else {
      await db.query(
        `INSERT INTO jira_credentials
           (employee_id, site_url, email, api_token, jira_account_id, display_name)
         VALUES (?,?,?,?,?,?)`,
        [req.user.id, cleanUrl, email, encryptedToken, myself.accountId, myself.displayName]
      );
    }

    res.json({ connected: true, displayName: myself.displayName, accountId: myself.accountId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/jira/disconnect
router.delete('/disconnect', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM jira_credentials WHERE employee_id = ?', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jira/projects  – list Jira projects this user has access to
router.get('/projects', auth, async (req, res) => {
  try {
    const c = await getCreds(req.user.id);
    if (!c) return res.status(400).json({ error: 'Jira not connected' });

    const data = await jiraFetch(
      c.site_url, c.email, c.api_token,
      '/project/search?maxResults=50&orderBy=name&expand=description'
    );

    res.json((data.values || []).map(p => ({
      key:       p.key,
      id:        p.id,
      name:      p.name,
      type:      p.projectTypeKey,
      avatarUrl: p.avatarUrls?.['32x32'] || null,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jira/issues?projectKey=ABC
// Returns issues assigned to the current user (not done)
router.get('/issues', auth, async (req, res) => {
  try {
    const c = await getCreds(req.user.id);
    if (!c) return res.status(400).json({ error: 'Jira not connected' });

    const { projectKey } = req.query;
    const jql = projectKey
      ? `project = "${projectKey}" AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`
      : `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;

    const data = await jiraFetch(c.site_url, c.email, c.api_token, '/search', 'POST', {
      jql,
      maxResults: 50,
      fields: ['summary', 'status', 'priority', 'project', 'issuetype', 'assignee', 'description'],
    });

    res.json((data.issues || []).map(i => ({
      key:            i.key,
      id:             i.id,
      summary:        i.fields.summary,
      status:         i.fields.status?.name || 'Unknown',
      statusCategory: i.fields.status?.statusCategory?.key || 'new',  // new | indeterminate | done
      priority:       i.fields.priority?.name || 'Medium',
      issueType:      i.fields.issuetype?.name || 'Task',
      projectKey:     i.fields.project?.key,
      projectName:    i.fields.project?.name,
      url:            `${c.site_url}/browse/${i.key}`,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jira/sync  – import Jira issues as TeamMonitor tasks
// Body: { projectKey, teamMonitorProjectId }
router.post('/sync', auth, async (req, res) => {
  try {
    const c = await getCreds(req.user.id);
    if (!c) return res.status(400).json({ error: 'Jira not connected' });

    const { projectKey, teamMonitorProjectId } = req.body;
    if (!projectKey || !teamMonitorProjectId)
      return res.status(400).json({ error: 'projectKey and teamMonitorProjectId required' });

    const jql = `project = "${projectKey}" AND assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;
    const data = await jiraFetch(c.site_url, c.email, c.api_token, '/search', 'POST', {
      jql,
      maxResults: 50,
      fields: ['summary', 'status', 'description'],
    });

    let created = 0, skipped = 0;

    for (const issue of (data.issues || [])) {
      // Skip if already imported
      const [existing] = await db.query(
        'SELECT id FROM tasks WHERE jira_issue_key = ?', [issue.key]
      );
      if (existing.length > 0) { skipped++; continue; }

      // Map Jira status category → TeamMonitor status
      const cat    = issue.fields.status?.statusCategory?.key || 'new';
      const status = cat === 'done'          ? 'done'
                   : cat === 'indeterminate' ? 'in_progress'
                   : 'todo';

      const desc = typeof issue.fields.description === 'string'
        ? issue.fields.description
        : (issue.fields.description ? '[Jira rich-text description]' : '');

      await db.query(
        `INSERT INTO tasks
           (project_id, name, description, status, assigned_to, created_by, jira_issue_key)
         VALUES (?,?,?,?,?,?,?)`,
        [
          teamMonitorProjectId,
          `[${issue.key}] ${issue.fields.summary}`,
          desc,
          status,
          req.user.id,
          req.user.id,
          issue.key,
        ]
      );
      created++;
    }

    res.json({ created, skipped, total: (data.issues || []).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
