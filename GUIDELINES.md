# TeamMonitor — Developer Guidelines

> **Rule #1:** Before writing any new helper, formatter, API call, or calculation — check this file first.
> If something already exists here, use it. Only create new logic when it is genuinely missing.
>
> **Rule #2:** When you add a new shared utility, API route, DB column, or pattern — update this file.

---

## Table of Contents

1. [Time & Duration Formatters](#1-time--duration-formatters)
2. [Date/Time Utilities](#2-datetime-utilities)
3. [API Client — Full Method List](#3-api-client--full-method-list)
4. [API Usage Rules — What to Call When](#4-api-usage-rules--what-to-call-when)
5. [Auth & Role Checks](#5-auth--role-checks)
6. [Key Calculations — Frontend](#6-key-calculations--frontend)
7. [Key Calculations — Server](#7-key-calculations--server)
8. [Database Tables Quick Reference](#8-database-tables-quick-reference)
9. [Style Conventions](#9-style-conventions)
10. [Where Things Live](#10-where-things-live)

---

## 1. Time & Duration Formatters

**Single source of truth: `admin-panel/src/tz.js`**
Import from there — **never define locally in a page.**

```js
import { fmtHM, fmtDur, fmtHMPad, fmtHMdec, fmtTime, fmtTimeSec, fmtDateShort, fmtDateTime } from "../tz";
```

| Function | Input | Output | Use when |
|---|---|---|---|
| `fmtHM(m)` | minutes | `"5h 04m"` or `"45m"` | Primary display everywhere — tracked time, work time, break time |
| `fmtDur(s)` | **seconds** | `"5h 4m"` or `"4m"` | Activity/app log durations (unpadded, takes **seconds**) |
| `fmtHMPad(m)` | minutes | `"05:04"` | Timelines summary rows — HH:MM clock format |
| `fmtHMdec(m)` | minutes | `"5.1h"` | Dashboard stat cards — compact decimal |
| `fmtTime(dt)` | datetime | `"4:58 PM"` | Any timestamp shown to user (timezone-aware) |
| `fmtTimeSec(dt)` | datetime | `"4:58:30 PM"` | Timestamps with seconds |
| `fmtDateShort(dt)` | datetime | `"Apr 28, 2026"` | Date labels |
| `fmtDateTime(dt)` | datetime | `"Apr 28, 2026, 4:58 PM"` | Full datetime labels |

**All functions are null-safe and round to nearest minute/second.**

❌ Never do this in a page:
```js
const fmtHM = m => `${Math.floor(m/60)}h ${m%60}m`;   // BAD — local duplicate
Math.floor(x / 60) + "h " + (x % 60) + "m"             // BAD — raw inline arithmetic
```

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
todayIST()                       // → "2026-05-13"  (current IST date, UTC+5:30)
midnightISTofDate(dateStr)       // → Date at 18:30 UTC = midnight IST for that date
closeStaleSessionsIST(employeeId) // caps active sessions from previous IST days at midnight IST
```

`closeStaleSessionsIST` is called at the **start of punch-in and heartbeat** so sessions are
always capped at midnight IST when the agent reconnects the next day.

---

## 3. API Client — Full Method List

**File: `admin-panel/src/api.js`**

```js
import { api } from "../api";
```

All HTTP calls go through `api.*`. **Never use `fetch` directly in pages.**

**Auth**
```js
api.login(email, password)
api.me()                        // silent — won't redirect on 401
api.bootstrap(name, email, password)
```

**Employees**
```js
api.getEmployees()
api.getEmployee(id)
api.createEmployee(data)        // POST /auth/register
api.updateEmployee(id, data)    // includes tracking_locked, idle_stop_minutes, etc.
api.deleteEmployee(id)
```

**Sessions / Attendance**
```js
api.getSessions(date)                            // ALL employees, one date
api.getMySessions(date)                          // current user only
api.getEmployeeSessions(empId, date)             // one employee, server-filtered ← prefer over getSessions+filter
api.getSessionStats(days)                        // team-wide stats, last N days
api.getMySessionStats(days)                      // current user stats, last N days
api.getEmployeeStats(empId, days)                // one employee stats, last N days ← use for single-employee charts
api.getTaskHours(empId, date)                    // hours per task for one employee
api.getTeamOverview(date)                        // full team data incl. tasks per employee
api.getTaskSessions(params)                      // { employeeId, projectId, taskId, startDate, endDate }
api.createManualEntry(data)                      // admin only
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
api.getActivity(date, empId?)           // pass empId for one employee, omit for team
api.getActivitySummary(date, empId?)    // pass empId for one employee, omit for team
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
// idleLogs used by DayTimeline for Idle Deducted metric
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

## 4. API Usage Rules — What to Call When

These rules were established after a full deduplication audit (2026-05-13).
Breaking them re-introduces the bugs that were fixed.

### Sessions

| Situation | Use | Do NOT use |
|---|---|---|
| Show one employee's sessions for a date | `api.getEmployeeSessions(empId, date)` | `api.getSessions(date)` + `.filter(s => s.employee_id == empId)` |
| Show all employees' sessions for a date | `api.getSessions(date)` | — |
| Current logged-in user's sessions | `api.getMySessions(date)` | — |

### 7-day history / bar charts

| Situation | Use | Do NOT use |
|---|---|---|
| Single employee 7-day bar chart | `api.getEmployeeStats(empId, 7)` | `api.getSessionStats(7)` (that's team-wide) |
| Team-wide 7-day chart | `api.getSessionStats(days)` | — |
| Current user's 7-day chart | `api.getMySessionStats(days)` | — |

### Activity

| Situation | Use |
|---|---|
| One employee's app usage | `api.getActivity(date, empId)` / `api.getActivitySummary(date, empId)` |
| Team-wide app usage | `api.getActivity(date)` / `api.getActivitySummary(date)` (no empId) |
| Current user's activity | `api.getMyActivity(date)` / `api.getMyActivitySummary(date)` |

### Golden rule
> **Always pass filters to the server. Never fetch all data and filter in JavaScript.**

---

## 5. Auth & Role Checks

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

## 6. Key Calculations — Frontend

All live in `DayTimeline` inside `admin-panel/src/pages/Reports.jsx`.
**Do not re-derive these in other pages — navigate to Reports or extract to a shared hook.**

### Time breakdown (canonical formulas)

```js
// Mac agent's tracked timer — already excludes breaks AND idle
const totalNetMins = sessions.reduce((s, r) => s + (Number(r.total_minutes) || 0), 0);

// Explicit break time (session_breaks table)
const totalBrkMins = breaks.reduce((s, b) => s + (Number(b.minutes) || 0), 0);

// Inter-session away gaps (Mac closed/slept between punch_out → next punch_in)
// These are NOT deducted from Work Time
const sortedSessions = [...sessions].sort((a,b) =>
  new Date(a.punch_in) - new Date(b.punch_in));
const awayGaps = [];
for (let i = 0; i+1 < sortedSessions.length; i++) {
  const prevOut = sortedSessions[i].punch_out;
  const nextIn  = sortedSessions[i+1].punch_in;
  if (prevOut && nextIn) {
    const gapMs = new Date(nextIn) - new Date(prevOut);
    if (gapMs > 0) awayGaps.push({ start:prevOut, end:nextIn, minutes: Math.round(gapMs/60000) });
  }
}
const awayMins = awayGaps.reduce((s, g) => s + g.minutes, 0);

// Work Time = tracked + breaks + away (all three together)
const workTimeMins = totalNetMins + totalBrkMins + awayMins;

// Idle = keyboard/mouse inactivity from idle_logs ONLY (NOT Wall Clock − Work Time)
const totalIdleMin = Math.round(
  idleLogs.reduce((s, l) => s + (Number(l.duration_seconds) || 0), 0) / 60
);

// Wall Clock = first punch-in → last punch-out (or last heartbeat if still active)
const lastHeartbeatTs = sessions.reduce((max, s) => {
  const ts = s.last_heartbeat_at ? new Date(s.last_heartbeat_at).getTime() : 0;
  return ts > max ? ts : max;
}, 0);
const effectiveEnd = lastOut
  ? new Date(lastOut)
  : lastHeartbeatTs ? new Date(lastHeartbeatTs) : null;
const grossMins = firstIn && effectiveEnd
  ? Math.round((effectiveEnd - new Date(firstIn)) / 60000) : null;
```

### Concept definitions

| Concept | Definition | Source |
|---|---|---|
| `total_minutes` | Mac's local timer — already excludes breaks and idle | `sessions.total_minutes` |
| Active time | `total_minutes` = net productive time | `sessions.total_minutes` |
| Break time | Explicit on/off-break signals from Mac | `session_breaks` table |
| Away time | Gap between sessions (Mac closed/slept between sessions) | Computed from `punch_out` → next `punch_in` |
| Idle time | Keyboard/mouse inactivity during a session | `idle_logs.duration_seconds` |
| Work Time | `totalNetMins + totalBrkMins + awayMins` | Computed in DayTimeline |
| Wall Clock | First `punch_in` → last `punch_out` (or last heartbeat) | `workPattern` fields |

### Gantt bar colors

| Color | Meaning |
|---|---|
| Green gradient | Active session (tracked time) |
| Orange/amber 15% opacity | Break period overlay |
| Gray 50% opacity | Away gap (between sessions or stale heartbeat) |

### 7-day bar chart

```js
// When a single employee is selected: derive from empWeekStats (getEmployeeStats)
const chartData = employeeId !== "all"
  ? empWeekStats.map(r => ({
      day:   format(new Date(r.date.slice(0,10)+"T00:00:00"), "EEE M/d"),
      hours: +((Number(r.total_minutes)||0) / 60).toFixed(1),
    }))
  : weekStats;  // weekStats = pre-formatted from getSessionStats (team-wide)
```

---

## 7. Key Calculations — Server

**File: `server/routes/sessions.js`**

### Punch-in
- Date always uses `todayIST()` → session date = IST calendar day (not UTC)
- Calls `closeStaleSessionsIST()` first to cap any leftover open sessions

### Heartbeat (PUT `/:id/heartbeat`)
- Calls `closeStaleSessionsIST()` at start
- `total_minutes` stored as `GREATEST(total_minutes, ?)` — only ever goes up, protects against post-restart resets
- **Gap detection:** if gap from last heartbeat > `idle_stop_minutes + 6 min` → inserts a `session_break` (NOT `idle_log` — a heartbeat gap = Mac sleeping = break, not idle)
- `reconnect=true` in body → skip gap detection (Mac syncing its own break records)
- Returns `{ ok, trackingLocked, commands }` for Mac agent remote-control

### Break open/close
- Opened: `INSERT INTO session_breaks (break_start)` with NULL `break_end`
- Closed: `UPDATE session_breaks SET break_end=? WHERE break_end IS NULL ORDER BY break_start DESC LIMIT 1`

### Idle vs Break — which table

| Situation | Table | Who inserts |
|---|---|---|
| Keyboard/mouse idle ≥ 5 min (Mac detects) | `idle_logs` | Mac → `POST /activity/idle` |
| Mac sleeping / lid closed (heartbeat gap) | `session_breaks` | Server on next heartbeat |
| User clicks "Take Break" on Mac | `session_breaks` | Mac sends `break_start` in heartbeat body |

---

## 8. Database Tables Quick Reference

| Table | Purpose | Key columns |
|---|---|---|
| `employees` | All users | `id, name, email, role, idle_stop_minutes, tracking_locked, agent_version` |
| `sessions` | Work sessions | `id, employee_id, date, punch_in, punch_out, total_minutes, status, last_heartbeat_at` |
| `session_breaks` | Break periods (explicit + sleep gaps) | `session_id, employee_id, break_start, break_end, date` |
| `idle_logs` | Keyboard/mouse idle events from Mac | `employee_id, session_id, idle_start, idle_end, duration_seconds, date` |
| `activity_logs` | App usage logs | `employee_id, session_id, app_name, start_time, end_time, duration_seconds, date` |
| `screenshots` | Screenshot file records | `employee_id, session_id, captured_at, file_path` |
| `leave_requests` | Leave applications | `employee_id, leave_type_id, from_date, to_date, days, status` |
| `leave_types` | Leave categories | `id, name, default_days_per_year` |
| `projects` / `tasks` | Project tracking | linked by `project_id` |
| `admin_commands` | Remote control queue | `employee_id, command_type, payload, status, delivered_at` |

**`employees.idle_stop_minutes`** — threshold for idle auto-pause on Mac (default 5).
Heartbeat gap threshold = `idle_stop_minutes + 6` (5-min heartbeat + 1-min grace).

**`leave_requests.days`** — supports decimals. `days = 0.5` = half day. Display: `r.days < 1 ? "½ day" : r.days`.

---

## 9. Style Conventions

### Page-level style object (`S`)
Each page defines a local `const S = { ... }`. Reference as `style={S.card}`.
Copy these — don't invent new keys:

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

### Shared color palette (charts, tags, avatars)
```js
const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];
```

### Semantic status colors
| Meaning | Hex |
|---|---|
| Active / success / work time | `#10b981` green |
| Warning / in-progress / break | `#f59e0b` amber |
| Error / idle deducted | `#ef4444` red |
| Away / muted / offline | `#94a3b8` gray |
| Tracked time / primary | `#3b82f6` blue |
| Wall clock / indigo | `#6366f1` indigo |

### Half-day leaves
Submitted with `days: 0.5`. Display: `r.days < 1` → show purple `½ day` badge.

---

## 10. Where Things Live

| What you need | File |
|---|---|
| Time formatters (`fmtHM`, `fmtDur`, etc.) | `admin-panel/src/tz.js` |
| Timezone helpers + `TIMEZONES` list | `admin-panel/src/tz.js` |
| All API calls (`api.*`) | `admin-panel/src/api.js` |
| Auth token helpers (`saveToken`, etc.) | `admin-panel/src/api.js` |
| Auth context / `useAuth` hook | `admin-panel/src/App.jsx` |
| Day timeline + canonical work-time formulas | `admin-panel/src/pages/Reports.jsx` → `DayTimeline()` |
| IST date helpers + stale session auto-close | `server/routes/sessions.js` (top of file) |
| Heartbeat gap → session_break logic | `server/routes/sessions.js` → heartbeat route |
| Admin remote commands API | `server/routes/admin_commands.js` |
| Productivity scoring + rules | `server/routes/productivity.js` |
| Timeline query (sessions + idle + breaks + apps) | `server/routes/timeline.js` |
| Daily / team reports + AI summary | `server/routes/reports.js` |
| Employee CRUD + allowed update fields | `server/routes/employees.js` → `EMP_COLS` |
| DB schema + all migrations | `server/db.js` |

---

*Last updated: 2026-05-13 — after formatter consolidation + API deduplication audit.*
*Update this file whenever a new shared utility, route, DB column, or anti-pattern is found.*
