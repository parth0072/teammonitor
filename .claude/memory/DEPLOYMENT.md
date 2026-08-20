---
name: TeamMonitor — Deployment & Build Process
description: How to build, deploy, and what breaks when skipping steps. Critical for any agent touching frontend or backend.
type: reference
---

# Deployment & Build Process

## Architecture
- **Backend** (Node.js) runs on cPanel as a Node.js app
- **Frontend** (React) is **pre-built and committed** to `server/public/` — cPanel serves it as static files
- Deploy = `git pull` on cPanel + restart Node app

## CRITICAL: Frontend Must Be Rebuilt Before Committing

The React admin panel source is in `admin-panel/src/`. The **compiled output** lives in `server/public/` and is committed directly to git.

**If you edit any file in `admin-panel/src/` you MUST:**
1. Run `npm run build` inside `admin-panel/`
2. Clean and copy the build output: `rm -rf server/public/* && cp -r admin-panel/dist/. server/public/`
3. Commit both the source changes AND the new `server/public/` files together

**Skipping the rebuild means the user sees the old UI even after deployment — source changes have no effect.**

## Build Commands

```bash
# From repo root
cd admin-panel && npm run build
rm -rf ../server/public/*
cp -r dist/. ../server/public/
cd ..
git add admin-panel/src/ server/public/
git commit -m "feat/fix: <description> + rebuild admin panel"
git push origin main
```

## Deploy Script (`deploy.sh`)
- Does NOT rebuild the frontend
- Only does: `git pull origin main` + `npm install --omit=dev` in `server/`
- After pushing, user runs `bash deploy.sh` on cPanel then restarts Node app

## cPanel Specifics
- Production URL: `https://api.alphabyteinnovation.com/teammonitor/`
- Node app must be restarted in cPanel after each deploy
- DB migrations run automatically on server restart (no manual SQL needed)
- Static files served from `server/public/` under `/teammonitor/` path

## What Causes 503

| Cause | Fix |
|-------|-----|
| `require()` of a file not committed to git | Commit the missing file |
| DB column referenced but no migration | Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `runMigrations()` in `server/index.js` |
| Syntax error in any `require()`-d file | Fix before pushing |
| `server/utils/encrypt.js` missing | File exists at `server/utils/encrypt.js` — must be committed |

## Environment Variables (cPanel .env)
- `JWT_SECRET` — required for auth
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` — MySQL credentials
- `SCREENSHOT_ENCRYPTION_KEY` — 32-byte hex key, used by `utils/encrypt.js` for Jira tokens
- `PORT` — defaults to 3001

## Files That Must Always Be In Sync
| Source | Built Output | Action When Changed |
|--------|-------------|---------------------|
| `admin-panel/src/**` | `server/public/**` | Rebuild + commit both |
| `server/routes/*.js` | (runtime) | Commit + push, restart Node |
| `server/index.js` migrations | DB schema | Auto-applied on restart |
