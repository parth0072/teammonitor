# TeamMonitor

Employee monitoring and time-tracking system with a macOS agent, React admin panel, and Node.js/MySQL backend.

---

## Features

### 🖥 macOS Agent
- Menu bar app — always running, minimal footprint
- **Punch in / out** with task or Jira issue selection
- **Auto session restore** on launch — prompts to resume last session
- **Break management** — manual break + auto-break on idle detection
- **Idle detection** — pauses timer when idle, auto-resumes on activity
- **Day-change detection** — punches out at midnight, reminds at dawn
- **Screenshot capture** — configurable interval (default 5 min), runs in background at low priority
- **App activity tracking** — logs active app + window title every 30s
- **Heartbeat** — keeps session alive on server every 5 min
- **Custom in-app notifications** — floating overlay panel, instant dismiss on resume
- **Jira integration** — connect personal Jira, pick assigned issues as tasks
- **Admin remote commands** — admin can start break, punch out, lock tracking from web
- **Offline queue** — buffers activity logs when network is down
- **Wake from sleep** — auto day-change check, activity detection on resume

### 🌐 Admin Panel

| Page | Access | Description |
|------|--------|-------------|
| Dashboard | All | KPI cards, 7-day trend chart, live session board |
| Activity | All | Per-employee app usage timeline with window drill-down |
| Productivity | All | Hour logs, productive % by app category, custom rules |
| Screenshots | All | Gallery by employee/date, lightbox, disk usage, delete |
| Attendance | All | Punch-in/out records, session durations, break log |
| Timelines | Admin | Visual session timeline across employees and date ranges |
| Reports | All | Daily AI report, team report, Slack & Teams digest sender |
| Projects & Tasks | All | Kanban board, task assignment, Jira project sync |
| Employees | Admin | Create/edit/deactivate, set tracking config per employee |
| Employee Detail | All | Individual stats, session history, productivity over time |
| Leaves | All | Request/approve/reject leaves, leave types, balances |
| Org Settings | Admin | Company name, work status options, daily report time |

### 🔗 Integrations
- **Jira** — per-employee connection (site URL + API token), sync issues as tasks, key badges on cards
- **Slack** — daily AI team digest via incoming webhook, manual trigger from admin panel
- **Microsoft Teams** — daily AI team digest via Adaptive Cards webhook, manual trigger from admin panel

### 🤖 AI Features
- **Daily report** — AI-generated summary per employee (focus score, key apps, insights)
- **Team digest** — AI-written per-employee summaries sent to Slack or Teams
- **AI chatbot** — ask questions about team productivity in natural language

### 🔐 Security
- JWT auth, bcrypt passwords
- Two roles: **admin** (full access) and **employee** (own data only)
- AES-256-GCM encrypted screenshot storage on disk
- Admin tracking lock — prevent employee from stopping tracker
- Screenshot URLs are token-gated

---

## Architecture

```
TeamMonitor/
├── admin-panel/          # React 18 + Vite web app (pre-built into server/public/)
├── server/               # Node.js + Express REST API (MySQL in prod, SQLite in dev)
└── macos-agent/          # Swift/SwiftUI menu bar app for employee machines
```

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

# Optional integrations
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TEAMS_WEBHOOK_URL=https://your-org.webhook.office.com/...
OPENAI_API_KEY=sk-...
```

Generate a screenshot encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the server:
```bash
node index.js
```

On first run, use the `/setup` page in the admin panel to create the initial admin account. DB migrations run automatically on every startup — no manual SQL needed.

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

Download the latest release from [GitHub Releases](https://github.com/parth0072/teammonitor/releases). The app is ad-hoc signed — right-click → Open on first launch if macOS blocks it.

---

## macOS Permissions

The agent requires two permissions (macOS will prompt on first use):
- **Screen Recording** — System Settings → Privacy & Security → Screen Recording
- **Accessibility** — System Settings → Privacy & Security → Accessibility

---

## Roles

| Role | Access |
|------|--------|
| `admin` | Full access — manage employees, projects, view all data |
| `employee` | Own data only — own sessions, screenshots, tasks, Jira |

---

## Resetting the Database

To wipe all data and start fresh, run `server/reset_database.sql` in phpMyAdmin → SQL tab. Then restart the Node app — migrations recreate all tables automatically.
