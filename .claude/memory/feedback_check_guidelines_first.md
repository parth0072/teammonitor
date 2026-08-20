# Always Check GUIDELINES.md Before Implementing Anything New

Before writing any new helper function, API call, calculation, formatter, or UI pattern:

1. **Check `/Users/coda/Desktop/worklog/TeamMonitor/GUIDELINES.md` first**
2. If it already exists there → use the existing one, never duplicate
3. If it doesn't exist → implement it, then add it to GUIDELINES.md

This applies to:
- Time/duration formatters (all live in `tz.js` — never define locally in a page)
- API calls (all live in `api.js` — never use raw `fetch` in pages)
- Session/time calculations (canonical formulas in `Reports.jsx → DayTimeline`)
- Server-side date helpers (in `sessions.js` top of file)
- Style patterns (use the `S` object convention)

## Specific API call rules (from deduplication audit, 2026-05-13)

- **Single employee sessions** → `api.getEmployeeSessions(empId, date)` — NOT `api.getSessions(date)` + client-side filter
- **Single employee 7-day bar chart** → `api.getEmployeeStats(empId, 7)` — NOT `api.getSessionStats(7)` (that's team-wide)
- **Team-wide sessions** → `api.getSessions(date)` (no empId filter)
- **Team-wide 7-day stats** → `api.getSessionStats(days)`
- **Current user sessions** → `api.getMySessions(date)` / `api.getMySessionStats(days)`

Never load all sessions and filter by `employee_id` in JavaScript — pass the filter to the server.

## When to update GUIDELINES.md

Update it whenever:
- A new shared utility or helper is added to `tz.js`, `api.js`, or `App.jsx`
- A new canonical calculation pattern is established
- A new DB table or column is added (update Section 7)
- A new API route is created (update Section 3)
- A new "don't do X, do Y instead" rule is discovered (add to relevant section)
