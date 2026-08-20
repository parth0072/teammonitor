---
name: When to build the admin panel
description: Rules for when to run npm build + copy to server/public/ vs just committing source
type: feedback
---

**Default (commit and push):** Do NOT run npm build automatically. Just stage and commit the source files changed.

**When user asks "yes" to build, or says "build and push" / "deploy":** Run the full sequence:
```bash
cd admin-panel && npm run build
rm -rf ../server/public/*
cp -r dist/. ../server/public/
cd ..
git add server/public/
git commit -m "build: rebuild admin panel"
git push origin main
```

**Why:** cPanel serves the pre-built static files from `server/public/`. If source changes are committed without rebuilding, cPanel never reflects the UI changes — the old build stays live. User discovered this when multiple features weren't showing on cPanel.

**How to apply:**
- `git commit and push` → source only, no build
- User says "yes" to build question, or explicitly asks to build/deploy → full build + copy + commit + push
- If cPanel is not reflecting changes → remind user to build, or offer to do it
