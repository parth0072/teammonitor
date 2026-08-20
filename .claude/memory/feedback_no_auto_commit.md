---
name: Don't commit and push automatically
description: Never commit or push changes until the user explicitly says to
type: feedback
---

Do not run `git add`, `git commit`, or `git push` automatically after making code changes.

**Why:** User wants to review changes before they go to the repo.

**How to apply:** Make the code edits, then stop and wait. Only commit and push when the user explicitly says so (e.g. "commit", "push", "deploy"). When done editing, just summarize what was changed and wait for the go-ahead.
