# TeamMonitor — Claude Code Instructions

## Memory

All project memory lives in `.claude/memory/`. Read `MEMORY.md` there for the full index.
Key files to load at the start of every session:
- `.claude/memory/PROJECT_OVERVIEW.md` — stack, repo, roles
- `.claude/memory/DEPLOYMENT.md` — how to build and deploy (CRITICAL)
- `.claude/memory/DATABASE_SCHEMA.md` — all tables and columns
- `.claude/memory/API_ROUTES.md` — all server endpoints
- `.claude/memory/ADMIN_PANEL_PAGES.md` — React routes and access rules
- `.claude/memory/MACOS_AGENT.md` — Swift agent structure

## Behaviour Rules (MUST follow)

- **When asked a question or to investigate — explain what is happening and wait for the user to decide. Do NOT start fixing or implementing unless explicitly told to.**
- Never commit or push until the user explicitly says to.
- Never start a dev server or use browser preview tools. Push to git; user checks on cPanel.
- Always work on `main` branch only.
- Default for admin panel changes: commit source only. Build + copy to `server/public/` only when user says "yes/deploy/build".
- Always check `GUIDELINES.md` before creating new formatters, API calls, or calculations.
- Never leave `require()`d files untracked — caused a 503 outage.

## Build Process (when instructed to build)

```bash
cd admin-panel && npm run build
rm -rf ../server/public/*
cp -r dist/. ../server/public/
cd ..
git add admin-panel/src/ server/public/
git commit -m "feat/fix: description + rebuild admin panel"
git push origin main
```

## Tech Stack

- **Backend**: Node.js + Express, MySQL (via mysql2), runs on cPanel
- **Frontend**: React (Vite), pre-built and committed to `server/public/`
- **macOS Agent**: Swift (SwiftUI + AppKit), menu bar app
- **Windows Agent**: Electron (separate codebase in `windows-agent/`)
- **Production**: `https://api.alphabyteinnovation.com/teammonitor/`

## macOS Agent Releases

Push a git tag `v*` → GitHub Actions builds the `.app` and creates a GitHub Release automatically.

## Key Paths

- Server routes: `server/routes/`
- Admin panel source: `admin-panel/src/`
- Admin panel built output (committed): `server/public/`
- macOS agent: `macos-agent/TeamMonitorAgent/`
- Windows agent: `windows-agent/`
- Shared timezone/duration formatters: `admin-panel/src/tz.js`
- Shared API client: `admin-panel/src/api.js`
- DB schema + migrations: `server/db.js`
- Shared utilities reference: `GUIDELINES.md`
