---
name: Always commit all referenced files — never leave requires() pointing to untracked files
description: If a route or module requires() a file, that file must be committed or the server crashes with 503 on cPanel
type: feedback
---

Before pushing, verify every `require()` in server code points to a committed file.

**Why:** The 503 outage on 2026-04-01 was caused by `server/routes/employees.js` requiring `../utils/encrypt` which existed locally but was never `git add`-ed. cPanel received the route file but not the dependency, causing an immediate MODULE_NOT_FOUND crash on every server startup.

**How to apply:**
- After creating a new utility/helper file, immediately `git add` it — don't assume it'll be picked up later
- Before pushing: run `git status` and check for any untracked `??` files in `server/` that are imported by committed code
- `server/utils/encrypt.js` is now committed — it handles AES-256-GCM encryption for Jira API tokens using `SCREENSHOT_ENCRYPTION_KEY`
