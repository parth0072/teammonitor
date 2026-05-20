// api.js – central API client
// Local dev  → http://localhost:3001/api
// Production → /teammonitor/api  (derived from window.location at runtime)
const BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/teammonitor/api';

// Cookie helpers — fallback for browsers (e.g. Arc) that clear localStorage on close
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
function getCookieToken() {
  const m = document.cookie.match(/(?:^|;\s*)tm_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookieToken(token) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `tm_token=${encodeURIComponent(token)}; max-age=${COOKIE_MAX_AGE}; path=/${secure}; SameSite=Strict`;
}
function clearCookieToken() {
  document.cookie = 'tm_token=; max-age=0; path=/; SameSite=Strict';
}

function getToken() {
  return localStorage.getItem('tm_token') || getCookieToken();
}

async function request(method, path, body, isForm = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401) {
    // Retry once after a short delay before logging out.
    // On cPanel shared hosting, DB connections drop after idle periods and can
    // produce a false 401. A single retry almost always succeeds in that case.
    await new Promise(r => setTimeout(r, 1500));
    const retry = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: isForm ? body : (body ? JSON.stringify(body) : undefined),
    });
    if (retry.status !== 401) {
      const retryData = await retry.json().catch(() => ({}));
      if (!retry.ok) throw new Error(retryData.error || `HTTP ${retry.status}`);
      return retryData;
    }
    // Still 401 after retry — session is genuinely invalid
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_user');
    window.location.href = (import.meta.env.BASE_URL || '/') + 'login';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Like request() but never auto-redirects on 401 — throws instead so the
// caller can decide whether to log out or silently keep the cached session.
async function requestSilent(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  // Auth
  login:     (email, password)           => request('POST', '/auth/login',     { email, password }),
  me:        ()                          => requestSilent('GET', '/auth/me'),
  bootstrap: (name, email, password)     => request('POST', '/auth/bootstrap', { name, email, password }),

  // Employees
  getEmployees:    ()       => request('GET',  '/employees'),
  getEmployee:     (id)     => request('GET',  `/employees/${id}`),
  createEmployee:  (data)   => request('POST', '/auth/register', data),
  updateEmployee:  (id, d)  => request('PUT',  `/employees/${id}`, d),
  deleteEmployee:  (id)     => request('DELETE',`/employees/${id}`),

  // Sessions / Attendance
  getSessions:     (date)   => request('GET',  `/sessions?date=${date}`),
  getMySessions:   (date)   => request('GET',  `/sessions/my?date=${date}`),
  getSessionStats:     (days) => request('GET', `/sessions/stats?days=${days}`),
  getMySessionStats:   (days) => request('GET', `/sessions/stats/mine?days=${days}`),
  getTaskHours:     (empId, date) => request('GET', `/sessions/task-hours?employeeId=${empId}&date=${date}`),
  getTeamOverview:  (date)        => request('GET', `/sessions/team-overview?date=${date}`),
  getTaskTotals:    ()       => request('GET', '/sessions/task-totals'),
  getTaskSessions:  (params) => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/sessions/task-sessions?${q}`);
  },

  // Screenshots
  getScreenshots:         (date, empId) => request('GET',    `/screenshots?date=${date}${empId ? `&employeeId=${empId}` : ''}`),
  getMyScreenshots:       (date)        => request('GET',    `/screenshots/mine?date=${date}`),
  getScreenshotDiskUsage: ()            => request('GET',    '/screenshots/disk-usage'),
  deleteScreenshot:       (id)          => request('DELETE', `/screenshots/${id}`),
  deleteScreenshotsBulk:  (body)        => request('DELETE', '/screenshots', body),

  // Activity
  getActivity:        (date, empId) => request('GET', `/activity?date=${date}${empId ? `&employeeId=${empId}` : ''}`),
  getActivitySummary: (date, empId) => request('GET', `/activity/summary?date=${date}${empId ? `&employeeId=${empId}` : ''}`),
  getMyActivity:        (date)      => request('GET', `/activity/mine?date=${date}`),
  getMyActivitySummary: (date)      => request('GET', `/activity/mine/summary?date=${date}`),

  // Projects & Tasks
  getProjects:    ()                       => request('GET',    '/projects'),
  createProject:  (data)                   => request('POST',   '/projects', data),
  updateProject:  (id, data)               => request('PUT',    `/projects/${id}`, data),
  deleteProject:  (id)                     => request('DELETE', `/projects/${id}`),
  getProjectTasks:(projectId)              => request('GET',    `/projects/${projectId}/tasks`),
  createTask:     (projectId, data)        => request('POST',   `/projects/${projectId}/tasks`, data),
  updateTask:     (taskId, data)           => request('PUT',    `/projects/tasks/${taskId}`, data),
  deleteTask:     (taskId)                 => request('DELETE', `/projects/tasks/${taskId}`),

  // Timeline
  getTimeline: (startDate, endDate, empId) =>
    request('GET', `/timeline?startDate=${startDate}&endDate=${endDate}${empId ? `&employeeId=${empId}` : ''}`),

  // Leaves
  getLeaveTypes:    ()             => request('GET',    '/leaves/types'),
  createLeaveType:  (data)         => request('POST',   '/leaves/types', data),
  updateLeaveType:  (id, data)     => request('PUT',    `/leaves/types/${id}`, data),
  deleteLeaveType:  (id)           => request('DELETE', `/leaves/types/${id}`),
  getLeaveRequests: (params = {})  => {
    const q = new URLSearchParams(params).toString();
    return request('GET', `/leaves/requests${q ? '?'+q : ''}`);
  },
  submitLeaveRequest:  (data)      => request('POST', '/leaves/requests', data),
  adminAddLeave:       (data)      => request('POST', '/leaves/requests', data),   // admin posts with employee_id → auto-approved
  approveLeave:  (id, note)        => request('PUT', `/leaves/requests/${id}/approve`, { note }),
  rejectLeave:   (id, note)        => request('PUT', `/leaves/requests/${id}/reject`,  { note }),
  cancelLeave:   (id)              => request('PUT', `/leaves/requests/${id}/cancel`),
  getLeaveBalances: (year)         => request('GET', `/leaves/balances?year=${year}`),
  setLeaveBalance:  (data)         => request('PUT', '/leaves/balances', data),

  // Jira integration (per-employee)
  getJiraStatus:    (employeeId)                          => request('GET',    `/jira/status${employeeId ? `?employeeId=${employeeId}` : ''}`),
  connectJira:      (siteUrl, email, apiToken, employeeId) => request('POST',   '/jira/connect', { siteUrl, email, apiToken, ...(employeeId ? { employeeId } : {}) }),
  disconnectJira:   (employeeId)                          => request('DELETE', `/jira/disconnect${employeeId ? `?employeeId=${employeeId}` : ''}`),
  getJiraProjects:  ()                          => request('GET',    '/jira/projects'),
  getJiraIssues:    (projectKey)                => request('GET',    `/jira/issues${projectKey ? `?projectKey=${projectKey}` : ''}`),
  syncJira:         (projectKey, teamMonitorProjectId) =>
    request('POST', '/jira/sync', { projectKey, teamMonitorProjectId }),

  testJiraConnection: (data)  => request('POST', '/jira/test', data),

  // Productivity
  getProductivity: (days, empId, startDate) => request('GET', `/productivity?days=${days}${empId ? `&employeeId=${empId}` : ''}${startDate ? `&startDate=${startDate}` : ''}`),
  getProductivityRules:    ()             => request('GET',    '/productivity/rules'),
  createProductivityRule:  (data)         => request('POST',   '/productivity/rules', data),
  updateProductivityRule:  (id, data)     => request('PUT',    `/productivity/rules/${id}`, data),
  deleteProductivityRule:  (id)           => request('DELETE', `/productivity/rules/${id}`),

  // Manual entry (admin)
  createManualEntry: (data) => request('POST', '/sessions/manual/admin', data),

  // Employee sessions
  getEmployeeSessions: (empId, date) => request('GET', `/sessions?date=${date}`).then(rows => rows.filter(r => String(r.employee_id) === String(empId))),

  // Session stats per employee (last N days)
  getEmployeeStats: (empId, days) => request('GET', `/sessions/stats/employee?employeeId=${empId}&days=${days}`),

  // Daily report (admin view for any employee)
  getDailyReport: (empId, date) => request('GET', `/reports/daily/employee?employeeId=${empId}&date=${date}`),

  // Team report (all employees for a date)
  getTeamReport: (date) => request('GET', `/reports/team?date=${date}`),

  // Chatbot
  sendChatMessage: (message, date, employeeId, history) =>
    request('POST', '/reports/chat', { message, date, employeeId: employeeId || null, history }),

  // Org settings
  getSettings:    ()       => request('GET',  '/settings'),
  updateSettings: (data)   => request('PUT',  '/settings', data),

  // Admin remote commands
  sendAdminCommand:   (data)  => request('POST',   '/admin/commands', data),
  getAdminCommands:   (empId) => request('GET',    `/admin/commands${empId ? '?employeeId=' + empId : ''}`),
  cancelAdminCommand: (id)    => request('DELETE', `/admin/commands/${id}`),
  setTrackingLock:    (employeeId, locked) => request('PUT', '/admin/tracking-lock', { employeeId, locked }),
  sendSlackDigest:    (date)               => request('POST',  '/admin/slack-report',          { date }),
  previewSlackDigest: (date)               => request('GET',   `/admin/slack-report/preview?date=${date}`),
  sendTeamsDigest:    (date)               => request('POST',  '/admin/teams-report',           { date }),

  // Bug / issue reports (from macOS agent)
  getBugReports:          ()           => request('GET',  '/bug-reports'),
  updateBugReportStatus:  (id, status, note) => request('PUT', `/bug-reports/${id}/status`, { status, note }),
};

export function saveToken(token)  { localStorage.setItem('tm_token', token); setCookieToken(token); }
export function clearToken()      { localStorage.removeItem('tm_token'); localStorage.removeItem('tm_user'); clearCookieToken(); }
export function hasToken()        { return !!getToken(); }
export function saveUser(user)    { localStorage.setItem('tm_user', JSON.stringify(user)); }
export function getCachedUser()   { try { return JSON.parse(localStorage.getItem('tm_user')); } catch { return null; } }
