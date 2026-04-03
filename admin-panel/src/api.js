// api.js – central API client
// Local dev  → http://localhost:3001/api
// Production → /teammonitor/api  (derived from window.location at runtime)
const BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/teammonitor/api';

function getToken() {
  return sessionStorage.getItem('tm_token');
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
    sessionStorage.removeItem('tm_token');
    window.location.href = (import.meta.env.BASE_URL || '/') + 'login';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login:     (email, password)           => request('POST', '/auth/login',     { email, password }),
  me:        ()                          => request('GET',  '/auth/me'),
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

  // Screenshots
  getScreenshots:    (date, empId) => request('GET', `/screenshots?date=${date}${empId ? `&employeeId=${empId}` : ''}`),
  getMyScreenshots:  (date)        => request('GET', `/screenshots/mine?date=${date}`),

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
  getProductivity: (days, empId)   => request('GET', `/productivity?days=${days}${empId ? `&employeeId=${empId}` : ''}`),

  // Manual entry (admin)
  createManualEntry: (data) => request('POST', '/sessions/manual/admin', data),

  // Employee sessions
  getEmployeeSessions: (empId, date) => request('GET', `/sessions?date=${date}`).then(rows => rows.filter(r => String(r.employee_id) === String(empId))),

  // Session stats per employee (last N days)
  getEmployeeStats: (empId, days) => request('GET', `/sessions/stats/employee?employeeId=${empId}&days=${days}`),
};

export function saveToken(token) { sessionStorage.setItem('tm_token', token); }
export function clearToken()     { sessionStorage.removeItem('tm_token'); }
export function hasToken()       { return !!getToken(); }
