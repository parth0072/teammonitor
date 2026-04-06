# TeamMonitor

Employee monitoring and time-tracking system with a macOS agent, React admin panel, and Node.js/MySQL backend.

**Production URL:** https://api.alphabyteinnovation.com/teammonitor/

---

## Architecture

```
TeamMonitor/
├── admin-panel/          # React 18 + Vite web app (pre-built into server/public/)
├── server/               # Node.js + Express REST API (MySQL in prod, SQLite in dev)
└── macos-agent/          # Swift/SwiftUI menu bar app for employee machines
```

---

## Components

### macOS Agent
A native menu bar app that runs on employee machines. It:
- Tracks active application usage (NSWorkspace)
- Detects idle time (IOKit HIDIdleTime)
- Captures periodic screenshots (encrypted AES-256-GCM before upload)
- Syncs with Jira for issue-linked time tracking
- Punches in/out sessions via the REST API

Download the latest release from [GitHub Releases](https://github.com/parth0072/teammonitor/releases). The app is ad-hoc signed — right-click → Open on first launch if macOS blocks it.

### Admin Panel
A React web app for admins and employees.

| Page | Access | Description |
|------|--------|-------------|
| Dashboard | All | KPI cards, 7-day chart, live session board |
| Activity | All | Real-time session activity feed |
| Productivity | All | Hour logs, productivity scores, custom policy |
| Projects | All | Kanban board + Jira integration |
| Reports | All | Analytics, app usage, hours by employee |
| Screenshots | All | Filterable screenshot gallery (encrypted) |
| Attendance | All | Punch-in/out records |
| Employees | Admin | Employee list + add/edit/delete |
| Timelines | Admin | Session timeline view |
| Leaves | All | Leave requests and balances |

### Backend (server/)
Express REST API with JWT authentication and MySQL.

- Auth: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`
- Sessions: punch-in/out, heartbeat, task hours, stats
- Screenshots: AES-256-GCM encrypted upload and serve
- Productivity: scores + custom app categorization rules
- Projects/Tasks, Employees, Attendance, Leaves, Jira integration

DB migrations run automatically on server startup — no manual SQL needed when pulling new code.

---

## Setup (Server)

### Requirements
- Node.js 18+
- MySQL database

### Steps

```bash
cd server
npm install
```

Create `server/.env`:
```
JWT_SECRET=your_secret_here
DB_HOST=localhost
DB_USER=your_db_user
DB_PASS=your_db_password
DB_NAME=teammonitor
SCREENSHOT_ENCRYPTION_KEY=64_hex_chars_random_key
BASE_URL=https://yourdomain.com
PORT=3001
```

Generate a screenshot encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the server:
```bash
node index.js
```

On first run, use the `/setup` page in the admin panel to create the initial admin account.

---

## Setup (Admin Panel — local dev)

```bash
cd admin-panel
npm install
npm run dev
# Opens at http://localhost:3000
```

---

## Deployment (cPanel)

The React app is **pre-built and committed** to `server/public/`. cPanel serves it as static files alongside the Node.js API.

```bash
# After editing admin-panel/src/**:
cd admin-panel
npm run build
rm -rf ../server/public/*
cp -r dist/. ../server/public/
cd ..
git add admin-panel/src/ server/public/
git commit -m "feat: description + rebuild admin panel"
git push origin main
```

On the server:
```bash
bash deploy.sh   # runs git pull + npm install
# then restart Node app in cPanel
```

---

## macOS Agent Release

Push a git tag to trigger an automated GitHub Actions build:

```bash
git tag v1.2.0
git push origin v1.2.0
```

The workflow builds `TeamMonitorAgent.app`, zips it, and publishes a GitHub Release at [github.com/parth0072/teammonitor/releases](https://github.com/parth0072/teammonitor/releases) in ~5–10 minutes.

---

## macOS Permissions

The agent requires two permissions (macOS will prompt on first use):
- **Screen Recording** — System Settings → Privacy & Security → Screen Recording
- **Accessibility** — System Settings → Privacy & Security → Accessibility

---

## Resetting the Database

To wipe all data and start fresh, run `server/reset_database.sql` in phpMyAdmin → SQL tab.
Then run `server/schema.sql` to recreate the tables, or just restart the Node app (migrations run automatically).

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access — manage employees, projects, view all data |
| `employee` | Own data only — own sessions, screenshots, tasks, Jira |
