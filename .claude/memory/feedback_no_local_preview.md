---
name: No local preview/testing
description: Don't run the app locally or use preview tools — the local dev server doesn't work for this project
type: feedback
---

Do not start a local dev server or use preview_* tools to verify changes for this project. The local environment doesn't work.

**Why:** User explicitly stated the local app does not work and running locally is pointless for this stack.

**How to apply:** After making and building changes, push directly to git. Skip all preview_start / preview_screenshot / preview_snapshot verification steps entirely. If visual verification is truly needed, ask the user to check on the live cPanel site — never attempt to run it locally. Do not run `npm run dev`, `node index.js`, or any equivalent server start command.

A stop hook fires after every edit asking "is a dev server running?" — the correct response is to silently end the turn without calling preview_start or mentioning the check. This project edits Node.js server routes and Swift macOS code, neither of which are observable in a browser preview.
