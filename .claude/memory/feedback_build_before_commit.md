---
name: Always rebuild admin panel before committing frontend changes
description: After editing admin-panel/src/**, must rebuild and commit server/public/ or UI changes won't appear on cPanel
type: feedback
---

Always run `npm run build` in `admin-panel/` and copy the output to `server/public/` before committing any frontend source changes.

**Why:** The React app is pre-built and committed to `server/public/`. cPanel serves these static files directly — it does NOT run a build step. Editing source files without rebuilding means the deployed UI stays on the old version. This was discovered when the Jira button was added to Projects.jsx but users couldn't see it because `server/public/` still had the old build.

**How to apply:**
```bash
cd admin-panel && npm run build
rm -rf ../server/public/*
cp -r dist/. ../server/public/
cd ..
git add admin-panel/src/ server/public/
git commit -m "feat: description + rebuild admin panel"
```
Always include `server/public/` in the same commit as the source changes.
