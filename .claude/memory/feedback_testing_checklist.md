# Testing Checklist — Must Pass Before Push

A full testing checklist lives at:
`/Users/coda/Desktop/worklog/TeamMonitor/TESTING_CHECKLIST.md`

**Rule:** Before every commit + push, mentally verify all checklist items relevant to the changed files pass. If a section is unaffected by the change, it can be marked N/A.

Key things ALWAYS checked regardless of what changed:
- No 503/500 errors after deploy (server starts, health check OK)
- No missing require()d files left untracked
- server/public/ rebuilt if admin-panel/src/** was edited
- Token auth works (login succeeds, deactivated account returns 401)
- No "idle" badge in Day Timeline (was removed — wall−tracked ≠ idle)
- Times display in org timezone (IST default)
