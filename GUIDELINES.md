# TeamMonitor — Developer Guidelines

> **Rule:** Before writing any new helper, formatter, API call, or calculation — check this file first.
> If something already exists here, use it. Only create new logic when it is genuinely missing.

---

## Table of Contents

1. [Time & Duration Formatters](#1-time--duration-formatters)
2. [Date/Time Utilities](#2-datetime-utilities)
3. [API Client](#3-api-client)
4. [Auth & Role Checks](#4-auth--role-checks)
5. [Key Calculations — Frontend](#5-key-calculations--frontend)
6. [Key Calculations — Server](#6-key-calculations--server)
7. [Database Tables Quick Reference](#7-database-tables-quick-reference)
8. [Style Conventions](#8-style-conventions)
9. [Where Things Live](#9-where-things-live)

---

## 1. Time & Duration Formatters

**Single source of truth: `admin-panel/src/tz.js`**
Import from there — never define locally in a page.

```js
import { fmtHM, fmtDur, fmtHMPad, fmtHMdec, fmtTime, fmtTimeSec, fmtDateShort, fmtDateTime } from "../tz";
```

| Function | Input | Output | Use when |
|---|---|---|---|
| `fmtHM(m)` | minutes | `"5h 04m"` or `"45m"` | Primary display everywhere — tracked time, work time, break time |
| `fmtDur(s)` | seconds | `"5h 4m"` or `"4m"` | Activity/app log durations (unpadded, takes seconds) |
| `fmtHMPad(m)` | minutes | `"05:04"` | Timelines summary rows — HH:MM clock format |
| `fmtHMdec(m)` | minutes | `"5.1h"` | Dashboard stat cards — compact decimal |
| `fmtTime(dt)` | datetime | `"4:58 PM"` | Any timestamp shown to user (timezone-aware) |
| `fmtTimeSec(dt)` | datetime | `"4:58:30 PM"` | Timestamps with seconds |
| `fmtDateShort(dt)` | datetime | `"Apr 28, 2026"` | Date labels |
| `fmtDateTime(dt)` | datetime | `"Apr 28, 2026, 4:58 PM"` | Full datetime labels |

**All functions are null-safe and round to nearest minute/second.**

---

## 2. Date/Time Utilities

**File: `admin-panel/src/tz.js`**

```js
import { getTimezone, setTimezone, TIMEZONES } from "../tz";
```

- `getTimezone()` — reads `localStorage['tm_timezone']`, falls back to browser tz
- `setTimezone(tz)` — persists tz to localStorage
- `TIMEZONES` — array of `{ label, value }` for the settings dropdown

**Server-side IST helpers** — `server/routes/sessions.js` (top of file):

```js
todayIST()                  // → "2026-05-13"  (current date in IST, UTC+5:30)
midnightISTofDate(dateStr)  // → Date object at 18:30 UTC = midnight IST for that date
closeStaleSessionsIST(employeeId)  // closes active sessions from previous IST days
```

`closeStaleSessionsIST` is called at the **start of punch-in and heartbeat** so sessions are
always capped at midnight IST when the agent reconnects the next day.

---

## 3. API Client

**File: `admin-panel/src/api.js`**

```js
import { api } from "../api";
```

All HTTP calls go through `api.*`. Never use `fetch` directly in pages.

### Full API method list

**Auth**
```js
api.login(email, password)
api.me()                       // silent — won't redirect on 401
api.bootstrap(name, email, password)
```

**Employees**
```js
api.getEmployees()
api.getEmployee(id)
api.createEmployee(data)       // POST /auth/register
api.updateEmployee(id, data)   // includes tracking_locked, idle_stop_minutes, etc.
api.deleteEmployee(id)
```

**Sessions / Attendance**
```js
api.getSessions(date)                           // all employees, one date
api.getMySessions(date)                         // current user only
api.getSessionStats(days)                       // team stats, last N days
api.getMySessionStats(days)
api.getTaskHours(empId, date)
api.getTeamOverview(date)
api.getTaskSessions(params)                     // { employeeId, projectId, taskId, startDate, endDate }
api.getEmployeeSessions(empId, date)            // filters getSessions by empId
api.getEmployeeStats(empId, days)
api.createManualEntry(data)                     // admin only
```

**Screenshots**
```js
api.getScreenshots(date, empId?)
api.getMyScreenshots(date)
api.getScreenshotDiskUsage()
api.deleteScreenshot(id)
api.deleteScreenshotsBulk(body)
```

**Activity**
```js
api.getActivity(date, empId?)
api.getActivitySummary(date, empId?)
api.getMyActivity(date)
api.getMyActivitySummary(date)
```

**Projects & Tasks**
```js
api.getProjects()
api.createProject(data)
api.updateProject(id, data)
api.deleteProject(id)
api.getProjectTasks(projectId)
api.createTask(projectId, data)
api.updateTask(taskId, data)
api.deleteTask(taskId)
```

**Timeline**
```js
api.getTimeline(startDate, endDate, empId?)
// Returns: { sessions, idleLogs, sessionBreaks, topApps, screenshotCounts, activityGaps }
```

**Leaves**
```js
api.getLeaveTypes()
api.createLeaveType(data)
api.updateLeaveType(id, data)
api.deleteLeaveType(id)
api.getLeaveRequests(params?)           // params: { employeeId, status, year }
api.submitLeaveRequest(data)            // employee submits own request
api.adminAddLeave(data)                 // admin posts with employee_id → auto-approved
api.approveLeave(id, note?)
api.rejectLeave(id, note?)
api.cancelLeave(id)
api.getLeaveBalances(year)
api.setLeaveBalance(data)
```

**Reports**
```js
api.getDailyReport(empId, date)         // full daily report for one employee
api.getTeamReport(date)                 // all employees for a date
api.sendChatMessage(message, date, employeeId?, history)
```

**Productivity**
```js
api.getProductivity(days, empId?, startDate?)
api.getProductivityRules()
api.createProductivityRule(data)
api.updateProductivityRule(id, data)
api.deleteProductivityRule(id)
```

**Jira**
```js
api.getJiraStatus(employeeId?)
api.connectJira(siteUrl, email, apiToken, employeeId?)
api.disconnectJira(employeeId?)
api.getJiraProjects()
api.getJiraIssues(projectKey?)
api.syncJira(projectKey, teamMonitorProjectId)
api.testJiraConnection(data)
```

**Admin Remote Control**
```js
api.sendAdminCommand(data)              // { employeeId, commandType, title, message, action }
api.getAdminCommands(empId?)
api.cancelAdminCommand(id)
api.setTrackingLock(employeeId, locked) // locked = true/false
api.sendSlackDigest(date)
api.previewSlackDigest(date)
api.sendTeamsDigest(date)
```

**Org Settings**
```js
api.getSettings()
api.updateSettings(data)
```

**Bug Reports**
```js
api.getBugReports()
api.updateBugReportStatus(id, status, note)
```

**Auth tokens** (use these, not localStorage directly)
```js
import { saveToken, clearToken, hasToken, saveUser, getCachedUser } from "../api";
// localStorage key is 'tm_token' (not 'token')
```

---

## 4. Auth & Role Checks

```js
import { useAuth } from "../App";

const { user } = useAuth();
const isAdmin = user?.role === "admin";
```

Gate admin-only UI:
```jsx
{user?.role === "admin" && <AdminOnlyThing />}
```

---

## 5. Key Calculations — Frontend

All live in `DayTimeline` inside `admin-panel/src/pages/Reports.jsx`.

### Time breakdown (the canonical formulas)

```js
// Mac agent's tracked timer (excludes breaks AND idle — Mac counts it)
const totalNetMins = sessions.reduce((s, r) => s + (Number(r.total_minutes) || 0), 0);

// Explicit break time from session_breaks table
const totalBrkMins = breaks.reduce((s, b) => s + (Number(b.minutes) || 0), 0);

// Inter-session away gaps (Mac closed between sessions) — NOT a deduction
const awayMins = /* sum of gaps between consecutive sessions' punch_out → punch_in */;

// Work Time = what the employee was "at work" for
// Breaks and away are NOT subtracted — Mac already excluded them from total_minutes
const workTimeMins = totalNetMins + totalBrkMins + awayMins;

// Idle = keyboard/mouse inactivity logged by Mac agent only (from idle_logs table)
// NOT Wall Clock − Work Time
const totalIdleMin = Math.round(
  idleLogs.reduce((s, l) => s + (Number(l.duration_seconds) || 0), 0) / 60
);

// Wall Clock = first punch-in → last punch-out (or last heartbeat if still active)
const effectiveEnd = lastOut ? new Date(lastOut) : lastHeartbeatTs ? new Date(lastHeartbeatTs) : null;
const grossMins = firstIn && effectiveEnd
  ? Math.round((effectiveEnd - new Date(firstIn)) / 60000) : null;
```

### Key rules
| Concept | Definition | Source |
|---|---|---|
| `total_minutes` | Mac's local timer — already excludes breaks and idle | `sessions.total_minutes` |
| Active time | `total_minutes` = net productive time | `sessions.total_minutes` |
| Break time | Explicit on/off-break signals from Mac | `session_breaks` table |
| Away time | Gap between sessions (Mac closed/slept between sessions) | Computed from consecutive `punch_out` → `punch_in` |
| Idle time | Keyboard/mouse inactivity during a session | `idle_logs` table (duration_seconds) |
| Work Time | `totalNetMins + totalBrkMins + awayMins` | Computed in DayTimeline |
| Wall Clock | First `punch_in` → last `punch_out` (or last heartbeat) | `workPattern.first_punch_in` / `last_punch_out` |

### Gantt bar colors
| Color | Meaning |
|---|---|
| Green gradient | Active session (tracked time) |
| Orange/amber (semi-transparent) | Break period |
| Gray (semi-transparent) | Away gap (between sessions or stale heartbeat) |

---

## 6. Key Calculations — Server

**File: `server/routes/sessions.js`**

### Punch-in
- Date always uses `todayIST()` so session date = IST calendar day (not UTC)
- Calls `closeStaleSessionsIST()` first to cap any leftover open sessions

### Heartbeat (PUT `/:id/heartbeat`)
- Calls `closeStaleSessionsIST()` at start
- `total_minutes` stored as `GREATEST(total_minutes, ?)` — only ever goes up, protects against post-restart resets
- Gap detection: if gap from last heartbeat > `idle_stop_minutes + 6 min`, inserts a `session_break` (NOT idle_log — gap = Mac sleeping = break)
- Returns `{ ok, trackingLocked, commands }` for Mac agent to handle remote-control commands

### Break detection
- `reconnect=true` in heartbeat body = Mac syncing its own break records — skip gap detection
- Break opened: `INSERT INTO session_breaks (break_start)` with NULL `break_end`
- Break closed: `UPDATE session_breaks SET break_end=? WHERE break_end IS NULL ORDER BY break_start DESC LIMIT 1`

### Idle vs Break distinction
| Situation | Stored in | Logic |
|---|---|---|
| Keyboard/mouse idle 5+ min (Mac detects it) | `idle_logs` | Mac calls `POST /activity/idle` |
| Mac sleeping / lid closed (heartbeat gap) | `session_breaks` | Server inserts on next heartbeat |
| User explicitly takes break | `session_breaks` | Mac sends break_start in heartbeat body |

---

## 7. Database Tables Quick Reference

| Table | Purpose | Key columns |
|---|---|---|
| `employees` | All users | `id, name, email, role, idle_stop_minutes, tracking_locked, agent_version` |
| `sessions` | Work sessions | `id, employee_id, date, punch_in, punch_out, total_minutes, status, last_heartbeat_at` |
| `session_breaks` | Break periods within a session | `session_id, employee_id, break_start, break_end, date` |
| `idle_logs` | Keyboard/mouse idle events from Mac agent | `employee_id, session_id, idle_start, idle_end, duration_seconds, date` |
| `activity_logs` | App usage logs | `employee_id, session_id, app_name, start_time, end_time, duration_seconds, date` |
| `screenshots` | Screenshot file records | `employee_id, session_id, captured_at, file_path` |
| `leave_requests` | Leave applications | `employee_id, leave_type_id, from_date, to_date, days, status` |
| `leave_types` | Leave categories | `id, name, default_days_per_year` |
| `projects` / `tasks` | Project tracking | linked by `project_id` |
| `admin_commands` | Remote control queue | `employee_id, command_type, payload, status, delivered_at` |

**`employees.idle_stop_minutes`** — the threshold for when idle auto-pause triggers on the Mac (default 5).
Heartbeat gap threshold = `idle_stop_minutes + 6` (accounts for 5-min heartbeat + 1-min grace).

---

## 8. Style Conventions

### Page-level style object (`S`)
Each page defines a local `const S = { ... }` for its styles. Reference as `style={S.card}`.
Common patterns (copy these, don't invent new ones):

```js
const S = {
  card:      { background:"#fff", borderRadius:12, padding:24, border:"1px solid #e2e8f0" },
  cardTitle: { fontSize:15, fontWeight:600, color:"#1e293b", marginBottom:16 },
  table:     { width:"100%", borderCollapse:"collapse" },
  th:        { textAlign:"left", fontSize:12, color:"#64748b", fontWeight:600, padding:"8px 12px 8px 0", borderBottom:"1px solid #e2e8f0" },
  td:        { padding:"10px 12px 10px 0", fontSize:13, borderBottom:"1px solid #f1f5f9", color:"#374151" },
  empty:     { color:"#94a3b8", fontSize:14, textAlign:"center", padding:"40px 0" },
  tag:       (c) => ({ fontSize:11, padding:"3px 8px", borderRadius:20, background:c+"20", color:c, fontWeight:600 }),
};
```

### Color palette (shared across all charts/tags)
```js
const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];
```

### Status colors (semantic)
| Meaning | Color |
|---|---|
| Active / success | `#10b981` (green) |
| In progress / warning | `#f59e0b` (amber) |
| Error / idle deducted | `#ef4444` (red) |
| Away / muted | `#94a3b8` (gray) |
| Tracked / primary | `#3b82f6` (blue) |
| Break time | `#f59e0b` (amber) |
| Wall clock | `#6366f1` (indigo) |

### Half-day leaves
Submitted with `days: 0.5`. Display: check `r.days < 1` → show purple `½ day` badge.

---

## 9. Where Things Live

| What you need | File |
|---|---|
| Time formatters | `admin-panel/src/tz.js` |
| Timezone helpers | `admin-panel/src/tz.js` |
| All API calls | `admin-panel/src/api.js` |
| Auth context / `useAuth` | `admin-panel/src/App.jsx` |
| Day timeline + work-time calculation | `admin-panel/src/pages/Reports.jsx` → `DayTimeline()` |
| IST date helpers + stale session close | `server/routes/sessions.js` (top of file) |
| Heartbeat gap → break logic | `server/routes/sessions.js` → heartbeat route |
| Admin remote commands | `server/routes/admin_commands.js` |
| Productivity scoring | `server/routes/productivity.js` |
| Timeline query (sessions + idle + breaks) | `server/routes/timeline.js` |
| Daily / team reports | `server/routes/reports.js` |
| Employee CRUD + allowed fields | `server/routes/employees.js` → `EMP_COLS` |
| DB schema + migrations | `server/db.js` |

---

*Keep this file updated whenever a new shared utility, calculation, or pattern is added.*
