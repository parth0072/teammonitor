const https = require('https');
const http  = require('http');
const store = require('./store');

const API_BASE = 'https://api.alphabyteinnovation.com/teammonitor/api';

function request(method, path, body = null, auth = true) {
  return new Promise((resolve, reject) => {
    const url  = new URL(API_BASE + path);
    const mod  = url.protocol === 'https:' ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const token = store.getToken();

    const headers = { 'Content-Type': 'application/json' };
    if (auth && token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = mod.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers,
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode === 401) return reject(Object.assign(new Error('Unauthorized'), { status: 401 }));
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let msg = `HTTP ${res.statusCode}`;
          try { msg = JSON.parse(raw).error || msg; } catch (_) {}
          return reject(new Error(msg));
        }
        try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function uploadScreenshot(imageBuffer, sessionId, activityLevel) {
  const token = store.getToken();
  if (!token) throw new Error('No token');

  const url      = new URL(API_BASE + '/screenshots');
  const boundary = `----TM${Date.now()}`;
  const mod      = url.protocol === 'https:' ? https : http;

  const parts = [];
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="screenshot"; filename="screenshot.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  );
  const body = Buffer.concat([
    Buffer.from(parts[0]),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="sessionId"\r\n\r\n${sessionId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="activityLevel"\r\n\r\n${activityLevel}\r\n`),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

  return new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: url.hostname,
      port:     url.port || 443,
      path:     url.pathname,
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Upload failed: ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); } catch (_) { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Upload timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = {
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }, false),

  me: () => request('GET', '/auth/me'),

  punchIn: (taskId, jiraIssueKey, jiraIssueSummary) => {
    const body = {};
    if (taskId)          body.taskId           = taskId;
    if (jiraIssueKey)    body.jiraIssueKey     = jiraIssueKey;
    if (jiraIssueSummary) body.jiraIssueSummary = jiraIssueSummary;
    return request('POST', '/sessions/punch-in', body);
  },

  punchOut: (sessionId, totalMinutes) =>
    request('PUT', `/sessions/${sessionId}/punch-out`, { totalMinutes }),

  heartbeat: (sessionId, totalMinutes, opts = {}) => {
    const body = {
      totalMinutes,
      screenPermission:    opts.screenPermission ?? true,
      agentVersion:        opts.agentVersion      ?? '1.0.0',
      isIdle:              opts.isIdle            ?? false,
      deliveredCommandIds: opts.deliveredCommandIds ?? [],
    };
    if (opts.breaks?.length)     body.breaks           = opts.breaks;
    if (opts.currentBreakStart)  body.currentBreakStart = opts.currentBreakStart;
    if (opts.reconnect)          body.reconnect         = true;
    return request('PUT', `/sessions/${sessionId}/heartbeat`, body);
  },

  breakStart: (sessionId) => request('POST', `/sessions/${sessionId}/break/start`, {}),
  breakEnd:   (sessionId) => request('PUT',  `/sessions/${sessionId}/break/end`,   {}),

  logActivity: (sessionId, appName, windowTitle, startTime, endTime, durationSeconds) =>
    request('POST', '/activity', { sessionId, appName, windowTitle,
      startTime: startTime.toISOString(), endTime: endTime.toISOString(), durationSeconds }),

  logIdle: (sessionId, idleStart, idleEnd) =>
    request('POST', '/activity/idle', {
      sessionId,
      idleStart:       idleStart.toISOString(),
      idleEnd:         idleEnd.toISOString(),
      durationSeconds: Math.round((idleEnd - idleStart) / 1000),
    }),

  getMySessions: (date) => request('GET', `/sessions/my?date=${date}`),
  getMyTasks:    ()     => request('GET', '/projects/tasks/mine'),
  getProjects:   ()     => request('GET', '/projects'),

  getTodayMinutes: async () => {
    try {
      const r = await request('GET', '/reports/reminder');
      return r.today_minutes ?? null;
    } catch (_) { return null; }
  },

  uploadScreenshot,
};
