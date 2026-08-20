---
name: TeamMonitor — API Routes
description: All backend API endpoints, their auth requirements, and request/response shapes
type: reference
---

# API Routes Reference

**Base URL (prod):** `https://api.alphabyteinnovation.com/teammonitor/api`
**Base URL (dev):**  `http://localhost:3001/api`

All routes require `Authorization: Bearer <jwt>` unless noted as **public**.

---

## Auth — `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/bootstrap` | public | Create first admin (only works if no employees exist) |
| POST | `/auth/login` | public | Returns `{ token, employee }` |
| POST | `/auth/register` | admin | Create new employee |
| GET | `/auth/me` | any | Returns current employee info |

---

## Employees — `/api/employees`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/employees` | any | List all active employees |
| GET | `/employees/:id` | any | Single employee |
| PUT | `/employees/:id` | admin | Update employee (name, dept, role, tracking config) |
| DELETE | `/employees/:id` | admin | Soft-delete (set is_active=0) |

---

## Sessions — `/api/sessions`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/sessions/punch-in` | any | Start session. 409 if already active |
| PUT | `/sessions/:id/punch-out` | any | End session |
| PUT | `/sessions/:id/heartbeat` | any | Keep session alive |
| GET | `/sessions` | admin | All sessions for a date (`?date=YYYY-MM-DD`) |
| GET | `/sessions/my` | any | My sessions for a date |
| GET | `/sessions/stats` | admin | 7-day KPI stats |
| GET | `/sessions/stats/mine` | any | My 7-day stats |
| GET | `/sessions/stats/employee` | admin | Stats for a specific employee |
| POST | `/sessions/manual` | any | Create manual entry |
| POST | `/sessions/manual/admin` | admin | Create manual entry for any employee |

---

## Activity — `/api/activity`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/activity` | any | Log app activity |
| POST | `/activity/idle` | any | Log idle period |
| GET | `/activity` | admin | All activity for a date/employee |
| GET | `/activity/summary` | admin | App usage summary |
| GET | `/activity/mine` | any | My activity |
| GET | `/activity/mine/summary` | any | My app usage summary |

---

## Screenshots — `/api/screenshots`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/screenshots` | any | Upload screenshot (multipart) |
| GET | `/screenshots` | admin | All screenshots for date/employee |
| GET | `/screenshots/mine` | any | My screenshots |

---

## Projects & Tasks — `/api/projects`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/projects` | any | All active projects with task_count |
| POST | `/projects` | admin | Create project |
| PUT | `/projects/:id` | admin | Update project |
| DELETE | `/projects/:id` | admin | Archive project (soft delete) |
| GET | `/projects/:id/tasks` | any | Tasks for a project |
| GET | `/projects/tasks/mine` | any | Tasks assigned to me (macOS agent) |
| POST | `/projects/:id/tasks` | any | Create task |
| PUT | `/projects/tasks/:taskId` | any | Update task |
| DELETE | `/projects/tasks/:taskId` | admin | Hard delete task |

---

## Jira Integration — `/api/jira`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/jira/status` | any | Is current employee connected? `{ connected, siteUrl, email, displayName }` |
| POST | `/jira/connect` | any | Save + verify credentials `{ siteUrl, email, apiToken }` |
| DELETE | `/jira/disconnect` | any | Remove credentials |
| GET | `/jira/projects` | any | List Jira projects this employee has access to |
| GET | `/jira/issues?projectKey=ABC` | any | Assigned open issues (all projects or filtered) |
| POST | `/jira/sync` | any | Import Jira issues as tasks `{ projectKey, teamMonitorProjectId }` |

---

## Timeline — `/api/timeline`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/timeline` | admin | Session timeline `?startDate=&endDate=&employeeId=` |

---

## Leaves — `/api/leaves`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/leaves/types` | any | Leave types |
| POST | `/leaves/types` | admin | Create leave type |
| PUT | `/leaves/types/:id` | admin | Update leave type |
| DELETE | `/leaves/types/:id` | admin | Delete leave type |
| GET | `/leaves/requests` | any | Leave requests (admin sees all, employee sees own) |
| POST | `/leaves/requests` | any | Submit leave request |
| PUT | `/leaves/requests/:id/approve` | admin | Approve |
| PUT | `/leaves/requests/:id/reject` | admin | Reject |
| PUT | `/leaves/requests/:id/cancel` | any | Cancel own request |
| GET | `/leaves/balances` | any | Leave balances |
| PUT | `/leaves/balances` | admin | Set balances |

---

## Productivity — `/api/productivity`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/productivity` | any | Productivity stats `?days=7&employeeId=` |

---

## Health
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | public | DB connectivity check |
