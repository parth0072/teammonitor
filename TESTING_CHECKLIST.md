# TeamMonitor — Pre-Push Testing Checklist

**Rule: Every checklist item must pass before committing and pushing.**  
Go through the relevant section(s) for what changed. If a section is not affected, mark it as N/A.

---

## 1. Server / API

- [ ] Server starts without error: `node index.js` (or `npm start`)
- [ ] Health check responds OK: `GET /teammonitor/api/health` → `{ status: "ok", db: "connected" }`
- [ ] All migrations run silently (no error logs on startup)
- [ ] Auth: `POST /api/auth/login` with valid credentials returns `token` + `employee`
- [ ] Auth: `POST /api/auth/login` with bad credentials returns `401`
- [ ] Auth: request with no token returns `401 No token provided`
- [ ] Auth: request with deactivated employee returns `401 Account disabled`
- [ ] Token has no `exp` claim (permanent — never expires by time)

---

## 2. Admin Panel

### General
- [ ] App loads without console errors
- [ ] Login page works; invalid creds shows error; valid creds navigates to Dashboard
- [ ] All sidebar nav links load their page without blank screen or crash
- [ ] Non-admin user cannot see admin-only pages (redirected to `/dashboard`)

### Dashboard
- [ ] Stat cards show (Total Time, Active Now, Apps Used, Activity Events)
- [ ] AI Summary section renders

### Reports
- [ ] Day Timeline loads sessions for selected employee + date
- [ ] Sessions show `tracked` + `wall clock` — **no "idle" badge**
- [ ] Session with stale heartbeat (> 8 min) shows `◌ Away`, not `● Active`
- [ ] LAST OUT reflects the latest punch-out across all sessions (not earliest)
- [ ] Times display in the configured org timezone (default: IST)

### Team Overview
- [ ] Members with heartbeat < 8 min ago show green dot (Online)
- [ ] Members with heartbeat > 8 min ago show grey dot (Offline)
- [ ] Members with `is_idle=1` show amber dot (Idle)
- [ ] Closing laptop lid → member transitions to Idle within ~1 min

### Timelines
- [ ] Timeline page loads data (not "No timeline data")
- [ ] Active sessions show `● Active now`; stale sessions show `◌ Away`

### Issues (Bug Reports)
- [ ] Issues tab visible for admin, not visible for employee
- [ ] Issues list loads submitted reports
- [ ] Status can be updated (Open → In Progress → Resolved)
- [ ] Admin note saves correctly

### Settings
- [ ] Timezone dropdown saves and persists
- [ ] Time displays across pages update to selected timezone
- [ ] Work status options can be added, reordered, removed

### Employees
- [ ] Employee list loads
- [ ] Create employee → appears in list
- [ ] Deactivating employee (`is_active=0`) → their token returns `401` on next request

---

## 3. macOS Agent

### Auth
- [ ] Login with valid credentials succeeds and opens dashboard
- [ ] Login with invalid credentials shows error
- [ ] Deactivated account → login returns error; mid-session → auto-logout to login screen
- [ ] Token persists across app restarts (Keychain)

### Tracking
- [ ] "Start Tracking" punches in; timer increments every minute
- [ ] "Punch Out" ends session; dashboard shows final time
- [ ] Heartbeat fires every 5 minutes (check server `last_heartbeat_at`)
- [ ] Auto-punch-out fires when app terminates (check log: `[AutoCheckOut] App terminating`)

### Lid Close / Sleep
- [ ] Closing laptop lid → server shows user as **Idle** within ~30 seconds (check Team Overview)
- [ ] Opening lid → user shows as **Active** again within ~30 seconds (no manual action needed)

### Idle Detection
- [ ] After configured idle period with no input, timer pauses and "idle" overlay shows
- [ ] Resuming activity auto-resumes timer

### Reminders (Timer Not Running)
- [ ] System macOS notification fires after configured interval when timer is stopped
- [ ] Notification shows **"Start Timer"** and **"Don't Remind Me Again"** action buttons
- [ ] Tapping "Don't Remind Me Again" stops all future reminders
- [ ] Reminders can be re-enabled from Settings → Reminders toggle
- [ ] In-app banner also shows "Don't remind me" link when timer is stopped

### Break Reminders (if admin-enabled)
- [ ] Break reminder fires at configured interval
- [ ] "Snooze" snoozes for 15 min; "Dismiss" reschedules at full interval

### Bug Reports
- [ ] "Report Issue" form opens from sidebar
- [ ] Submitting with description sends report to server → appears in admin Issues tab
- [ ] Submitting with "Attach app logs" checked → diagnostics include `app_logs`
- [ ] Server returns `{ ok: true }` (no decode error)

---

## 4. Cross-Cutting

- [ ] All times shown in the admin panel match the configured org timezone
- [ ] No 503/500 errors in server logs after deploying
- [ ] No missing `require()`d files left untracked in git
- [ ] `server/public/` is rebuilt and committed when any `admin-panel/src/**` file changed
- [ ] macOS agent: SourceKit false-positives in Claude are not treated as real build errors — verify by building in Xcode

---

## Quick Smoke Test (run after every push)

1. Open admin panel → Login → Dashboard loads ✓  
2. Reports → pick today → timeline shows sessions ✓  
3. Team Overview → at least one member visible ✓  
4. macOS agent → punch in → heartbeat visible in Team Overview ✓  
5. Close laptop lid → Team Overview shows Idle within 1 min ✓  
6. Open lid → shows Active again ✓  
7. Report Issue → submit → appears in Issues tab ✓  

---

*Last updated: 2026-04-30*
