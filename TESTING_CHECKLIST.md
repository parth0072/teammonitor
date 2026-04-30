# TeamMonitor — Pre-Push Checklist
Things that keep breaking — verify these before every push.

---

## Recurring Issues to Always Test

- [ ] **Lid close → shows Idle** — close laptop, check Team Overview within 30s, must show amber/Idle not green/Active
- [ ] **Lid open → shows Active again** — open lid, check Team Overview within 30s, must clear Idle
- [ ] **No heartbeat → shows Offline not Active** — kill agent or disconnect, after 8 min must show grey/Offline
- [ ] **Bug report submits without error** — submit from macOS app, must show in admin Issues tab, no "data not in correct format" error
- [ ] **Timeline loads** — Reports → Day Timeline must show sessions, not "No timeline data"
- [ ] **LAST OUT is correct** — must show the last punch-out of the day, not an earlier one
- [ ] **No idle badge** — Day Timeline sessions must NOT show "Xm idle" badge (was wall−tracked, misleading)
- [ ] **Times show in IST** — all times in admin panel must display in configured org timezone
- [ ] **Token never expires** — user stays logged in across days without being kicked out
- [ ] **Deactivated user gets 401** — set `is_active=0`, their next API call must fail immediately

---

*Last updated: 2026-04-30*
