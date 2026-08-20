---
name: TeamMonitor — Project Overview
description: Full project context, architecture, stack, and conventions for any agent working on this codebase
type: context
---

# TeamMonitor — Master Project Reference

## What It Is
TeamMonitor is a **full-stack employee monitoring and time-tracking system** with three components:
1. **macOS native agent** (Swift/SwiftUI) — menu bar app on employee machines
2. **React web admin panel** — management dashboard for admins + employees
3. **Node.js/Express backend** — REST API, deployed on cPanel

---

## Repository
- **GitHub:** https://github.com/parth0072/teammonitor
- **Main branch:** `main`
- **Deployment:** cPanel (auto on push or manual file upload)
- **Production API base:** `https://api.alphabyteinnovation.com/teammonitor/api`
- **Local dev API base:** `http://localhost:3001/api`

## Worktree Location
- Main repo: `/Users/coda/Desktop/worklog/TeamMonitor`
- Active worktree: `/Users/coda/Desktop/worklog/TeamMonitor/.claude/worktrees/epic-taussig`
- Always work inside the worktree directory when on a feature branch

---

## Tech Stack

| Layer | Tech |
|-------|------|
| macOS Agent | Swift 5.9, SwiftUI, Combine, IOKit, NSWorkspace, UserNotifications |
| Admin Panel | React 18, Vite 5, React Router v6, Recharts, date-fns |
| Backend | Node.js, Express 4, MySQL (prod) / SQLite (dev), JWT auth |
| Auth | bcryptjs + jsonwebtoken |
| File uploads | multer 2 |

---

## Directory Structure

```
TeamMonitor/
├── admin-panel/               # React web app
│   ├── vite.config.js         # base: /teammonitor/, dev port 3000
│   └── src/
│       ├── App.jsx            # auth context, sidebar nav, routes
│       ├── api.js             # central API client (all fetch calls)
│       └── pages/             # 13 route pages (see PAGES.md)
│
├── server/                    # Express backend
│   ├── index.js               # app entry, route mounts, migrations, cleanup
│   ├── db.js                  # MySQL/SQLite adapter (auto-detects)
│   ├── schema.sql             # Full SQL schema (run once on fresh DB)
│   ├── middleware/
│   │   └── auth.js            # JWT auth middleware + adminOnly
│   └── routes/                # API route files (see API_ROUTES.md)
│
└── macos-agent/
    └── TeamMonitorAgent/
        ├── Services/          # APIService, TrackingManager, ScreenshotService, etc.
        ├── Views/             # SwiftUI views (split across multiple +Extension files)
        └── Models/            # TrackingModels.swift
```

---

## Key Conventions

### Backend
- All routes mounted under `/api/<resource>` inside an Express router
- Router mounted at both `/teammonitor` (cPanel) and `/` (local dev)
- Auth middleware: `auth` (any logged-in user), `adminOnly` (role=admin)
- DB migrations run on every startup via `runMigrations()` — always idempotent
- Use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- MySQL in production, SQLite in local dev — db.js handles both transparently

### Frontend (admin-panel)
- All API calls go through `src/api.js` — add new methods there
- Auth token stored in `sessionStorage` as `tm_token`
- Role check: `user?.role === "admin"` (from `useAuth()` hook in App.jsx)
- Inline styles only (no CSS files, no Tailwind)
- No local dev server — push to git, user checks on cPanel

### macOS Agent
- `APIService.shared` is the singleton for all network calls
- Credentials stored in `UserDefaults` (not Keychain — avoids unsigned-app prompts)
- All views split into `+Extension` files for maintainability
- `TrackingManager.shared` orchestrates all background services
- Production API URL hardcoded in `APIService.swift`: `https://api.alphabyteinnovation.com/teammonitor/api`

---

## Roles
- `admin` — full access: create/delete employees, projects, tasks, view all data
- `employee` — limited: view own data, manage own tasks, connect own Jira

---

## Deployment Rules
1. **Never** start a local dev server or use preview tools — local environment doesn't work
2. Push changes to `main` branch on GitHub
3. User deploys via cPanel (file manager or git pull)
4. DB migrations run automatically on server restart — no manual SQL needed for new columns/tables
