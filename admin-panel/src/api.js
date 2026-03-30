// api.js – central API client
// VITE_API_URL  overrides everything (set in .env file at build time)
// Local dev      → http://localhost:3001/api
// Production     → relative path, e.g. /teammonitor/api  (set VITE_BASE_PATH at build time)
const BASE = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : `${import.meta.env.VITE_BASE_PATH || ''}/api`);

function getToken() {
  return localStorage.getItem('tm_token');
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
    window.location.href = '/login';
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
  getSessionStats: (days)   => request('GET',  `/sessions/stats?days=${days}`),

  // Screenshots
  getScreenshots:  (date, empId) => request('GET', `/screenshots?date=${date}${empId ? `&employeeId=${empId}` : ''}`),

  // Activity
  getActivity:        (date, empId) => request('GET', `/activity?date=${date}${empId ? `&employeeId=${empId}` : ''}`),
  getActivitySummary: (date, empId) => request('GET', `/activity/summary?date=${date}${empId ? `&employeeId=${empId}` : ''}`),

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

  // Manual entry (admin)
  createManualEntry: (data) => request('POST', '/sessions/manual/admin', data),

  // Employee sessions
  getEmployeeSessions: (empId, date) => request('GET', `/sessions?date=${date}`).then(rows => rows.filter(r => String(r.employee_id) === String(empId))),

  // Session stats per employee (last N days)
  getEmployeeStats: (empId, days) => request('GET', `/sessions/stats/employee?employeeId=${empId}&days=${days}`),
};

export function saveToken(token) { localStorage.setItem('tm_token', token); }
export function clearToken()     { localStorage.removeItem('tm_token'); }
export function hasToken()       { return !!getToken(); }
