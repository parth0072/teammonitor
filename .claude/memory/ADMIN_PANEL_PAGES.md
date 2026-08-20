---
name: TeamMonitor — Admin Panel Pages & Routing
description: All React pages, their routes, who can access them, and what they do
type: reference
---

# Admin Panel Pages

**Location:** `admin-panel/src/pages/`
**Router:** React Router v6, configured in `admin-panel/src/App.jsx`
**Auth:** `ProtectedRoute` wrapper — redirects to `/login` if no token

---

## Routes

| Route | File | Admin | Employee | Description |
|-------|------|-------|----------|-------------|
| `/login` | `Login.jsx` | ✓ | ✓ | Login form |
| `/setup` | `Setup.jsx` | ✓ | — | First-run bootstrap (create admin) |
| `/` | `Dashboard.jsx` | ✓ | ✓ | KPI cards, 7-day chart, live sessions |
| `/activity` | `Activity.jsx` | ✓ | ✓ | Live session activity (admin: all, employee: own) |
| `/productivity` | `Productivity.jsx` | ✓ | ✓ | Hour logs + productivity KPIs |
| `/projects` | `Projects.jsx` | ✓ | ✓ | Kanban project/task board + Jira integration |
| `/reports` | `Reports.jsx` | ✓ | ✓ | Detailed analytics |
| `/employees` | `Employees.jsx` | ✓ | — | Employee list + CRUD |
| `/employees/:id` | `EmployeeDetail.jsx` | ✓ | ✓ | Individual employee stats |
| `/screenshots` | `Screenshots.jsx` | ✓ | ✓ | Screenshot gallery with filters |
| `/attendance` | `Attendance.jsx` | ✓ | ✓ | Punch-in/out records |
| `/timelines` | `Timelines.jsx` | ✓ | — | Session timeline view |
| `/leaves` | `Leaves.jsx` | ✓ | ✓ | Leave requests + balances |

---

## App.jsx Structure
- `AuthContext` — provides `{ user, token, login, logout }` via `useAuth()` hook
- Sidebar navigation differs by role (admin sees Employees + Timelines; employee doesn't)
- `ProtectedRoute` redirects to `/login` if no `tm_token` in sessionStorage

---

## API Client (`admin-panel/src/api.js`)
- Single `api` export with all methods
- Auto-detects base URL: `localhost:3001` vs `/teammonitor` (cPanel)
- Adds `Authorization: Bearer <token>` to every request
- Auto-redirects to `/login` on 401

---

## Projects Page — Jira Integration (added recently)
- **Jira button** in project header (blue, shows Jira logo)
- Opens `JiraPanel` modal (component at bottom of `Projects.jsx`)
- **Not connected flow:** form for Jira site URL + email + API token → `POST /api/jira/connect`
- **Connected flow:** shows connected badge, Jira project dropdown, assigned issues list, import button
- Import via `POST /api/jira/sync` → creates tasks with `jira_issue_key` set
- Imported task names are prefixed `[KEY-123] Task name`; key shown as blue badge in TaskCard

---

## Styling Conventions
- All styles are inline (`style={{ ... }}`) — no CSS files, no Tailwind, no CSS modules
- Common style objects defined at top of each file: `inputStyle`, `btnPrimary`, `btnSecondary`, `btnDanger`
- Color palette: `#1e293b` (text), `#3b82f6` (primary), `#e2e8f0` (borders), `#f1f5f9` (bg)
