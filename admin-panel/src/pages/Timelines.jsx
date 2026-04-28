import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { format, subDays, eachDayOfInterval, parseISO } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtHM = (mins) => {
  const h = Math.floor((mins || 0) / 60), m = (mins || 0) % 60;
  return `${h}h ${String(m).padStart(2,"0")}m`;
};
const fmtHMPad = (mins) => {
  const h = Math.floor((mins || 0) / 60), m = (mins || 0) % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};
const fmtTime = (dt) => dt ? format(new Date(dt), "h:mm a") : "—";

// Convert a datetime to a % position across the 24-hour day bar, offset by reset hour
function toPct(dt, resetHour) {
  if (!dt) return 0;
  const d = new Date(dt);
  const mins = d.getHours() * 60 + d.getMinutes();
  return ((mins - resetHour * 60 + 1440) % 1440) / 1440 * 100;
}
function durPct(mins) { return Math.min(100, (mins || 0) / 1440 * 100); }

// ── Timeline Bar ──────────────────────────────────────────────────────────────

function TimelineBar({ sessions, idleLogs, dayResetHour }) {
  // Build 7 hour tick marks spaced 4 h apart starting from dayResetHour
  const ticks = Array.from({ length: 7 }, (_, i) => {
    const h = (dayResetHour + i * 4) % 24;
    return { pct: (i / 6) * 100, label: `${String(h).padStart(2,"0")}:00` };
  });

  return (
    <div style={{ position:"relative", paddingBottom:18, marginTop:4 }}>
      {/* Bar background */}
      <div style={{ position:"relative", height:44, background:"#f1f5f9", borderRadius:8, overflow:"hidden" }}>

        {/* Hour grid lines */}
        {ticks.slice(1,-1).map(t => (
          <div key={t.pct} style={{
            position:"absolute", left:`${t.pct}%`, top:0, bottom:0,
            borderLeft:"1px solid #e2e8f0", zIndex:1,
          }} />
        ))}

        {/* Session blocks */}
        {sessions.map((s, i) => {
          if (!s.punch_in) return null;
          const left  = toPct(s.punch_in, dayResetHour);
          const width = durPct(s.total_minutes);
          const isActive = !s.punch_out;
          const label = s.total_minutes >= 30 ? fmtHM(s.total_minutes) : null;
          return (
            <div key={i}
              title={`${fmtTime(s.punch_in)} → ${s.punch_out ? fmtTime(s.punch_out) : "ongoing"} · ${fmtHM(s.total_minutes)}`}
              style={{
                position:"absolute", top:4, bottom:4,
                left:`${left}%`, width:`${Math.max(0.5, width)}%`,
                background: isActive
                  ? "linear-gradient(135deg,#f59e0b,#fbbf24)"
                  : "linear-gradient(135deg,#16a34a,#22c55e)",
                borderRadius:5,
                zIndex:2,
                display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden",
              }}>
              {label && (
                <span style={{ fontSize:10, fontWeight:700, color:"#fff", whiteSpace:"nowrap",
                               textShadow:"0 1px 2px rgba(0,0,0,0.3)", padding:"0 4px" }}>
                  {label}
                </span>
              )}
            </div>
          );
        })}

        {/* Idle markers — thin red overlays */}
        {idleLogs.map((il, i) => {
          if (!il.idle_start) return null;
          const left  = toPct(il.idle_start, dayResetHour);
          const width = durPct((il.duration_seconds || 0) / 60);
          return (
            <div key={i}
              title={`Idle ${fmtTime(il.idle_start)} → ${fmtTime(il.idle_end)}`}
              style={{
                position:"absolute", top:0, bottom:0,
                left:`${left}%`, width:`${Math.max(0.2, width)}%`,
                background:"rgba(239,68,68,0.45)",
                zIndex:3,
              }} />
          );
        })}
      </div>

      {/* Hour labels below bar */}
      <div style={{ position:"relative", height:16 }}>
        {ticks.map(t => (
          <div key={t.pct} style={{
            position:"absolute", left:`${t.pct}%`,
            transform:"translateX(-50%)",
            fontSize:9, color:"#94a3b8", whiteSpace:"nowrap", marginTop:3,
          }}>
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Day Row ───────────────────────────────────────────────────────────────────

function DayRow({ date, sessions, idleLogs, dayResetHour }) {
  const totalMins  = sessions.reduce((a, s) => a + (Number(s.total_minutes) || 0), 0);
  const idleSecs   = idleLogs.reduce((a, il) => a + (il.duration_seconds || 0), 0);
  const idleMins   = Math.round(idleSecs / 60);
  const hasWork    = sessions.length > 0;
  const firstIn    = hasWork ? sessions[0].punch_in : null;
  const lastSess   = hasWork ? sessions[sessions.length - 1] : null;
  const lastOut    = lastSess?.punch_out;
  const isWeekend  = [0, 6].includes(parseISO(date).getDay());

  return (
    <div style={{
      borderBottom:"1px solid #f1f5f9",
      padding:"14px 0",
      opacity: isWeekend && !hasWork ? 0.5 : 1,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", marginBottom: hasWork ? 8 : 0 }}>

        {/* Date */}
        <div style={{ minWidth:150 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>
            {format(parseISO(date), "EEE, MMM d")}
          </div>
          {isWeekend && <div style={{ fontSize:10, color:"#94a3b8" }}>Weekend</div>}
        </div>

        {hasWork ? (
          <>
            {/* Worked badge */}
            <div style={{
              background:"#d1fae5", color:"#065f46",
              borderRadius:20, padding:"3px 12px",
              fontSize:12, fontWeight:700,
            }}>
              {fmtHM(totalMins)}
            </div>

            {/* Span */}
            <div style={{ fontSize:12, color:"#64748b", fontFamily:"monospace" }}>
              <span style={{ color:"#16a34a", fontWeight:700 }}>●</span>{" "}
              {fmtTime(firstIn)} → {lastOut ? fmtTime(lastOut) : <span style={{ color:"#f59e0b" }}>ongoing</span>}
            </div>

            {/* Sessions count */}
            <div style={{ fontSize:12, color:"#94a3b8" }}>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </div>

            {/* Idle */}
            {idleMins > 0 && (
              <div style={{
                background:"#fee2e2", color:"#991b1b",
                borderRadius:20, padding:"3px 10px",
                fontSize:11, fontWeight:600,
              }}>
                {idleMins}m idle
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize:12, color:"#cbd5e1" }}>No time logged</div>
        )}
      </div>

      {hasWork && (
        <TimelineBar sessions={sessions} idleLogs={idleLogs} dayResetHour={dayResetHour} />
      )}
    </div>
  );
}

// ── Summary Table ─────────────────────────────────────────────────────────────

function SummaryTable({ employees, sessions, idleLogs }) {
  const rows = employees.map(emp => {
    const empSess  = sessions.filter(s  => String(s.employee_id)  === String(emp.id));
    const empIdle  = idleLogs.filter(il => String(il.employee_id) === String(emp.id));
    const totalMins = empSess.reduce((a, s) => a + (Number(s.total_minutes) || 0), 0);
    const idleMins  = Math.round(empIdle.reduce((a, il) => a + (il.duration_seconds || 0), 0) / 60);
    const activeMins = Math.max(0, totalMins - idleMins);
    const activePct  = totalMins > 0 ? Math.round(activeMins / totalMins * 100) : 0;
    const activeSess = empSess.filter(s => s.punch_in);
    const firstIn    = activeSess.length ? activeSess[0].punch_in : null;
    const lastSess   = activeSess[activeSess.length - 1];
    const lastOut    = lastSess?.punch_out ?? null;
    return { emp, totalMins, idleMins, activeMins, activePct, firstIn, lastOut };
  }).filter(r => r.totalMins > 0);

  if (rows.length === 0) return null;

  const totalAll   = rows.reduce((a, r) => a + r.totalMins, 0);
  const idleAll    = rows.reduce((a, r) => a + r.idleMins, 0);
  const activeAll  = rows.reduce((a, r) => a + r.activeMins, 0);
  const activePctAll = totalAll > 0 ? Math.round(activeAll / totalAll * 100) : 0;

  const TH = ({ children, right }) => (
    <th style={{
      padding:"10px 16px", fontSize:11, fontWeight:700, color:"#64748b",
      textTransform:"uppercase", letterSpacing:.6,
      textAlign: right ? "center" : "left",
      background:"#f8fafc", borderBottom:"2px solid #e2e8f0",
      whiteSpace:"nowrap",
    }}>
      {children}
    </th>
  );

  return (
    <div style={{
      background:"#fff", borderRadius:12, border:"1px solid #e2e8f0",
      overflow:"hidden", marginBottom:28, boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{ padding:"16px 20px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>Period Summary</div>
        <div style={{ fontSize:12, color:"#94a3b8" }}>{rows.length} employee{rows.length !== 1 ? "s" : ""} tracked</div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <TH>Employee</TH>
            <TH>Activity Span</TH>
            <TH right>Total Worked</TH>
            <TH right>Active %</TH>
            <TH right>Idle Deducted</TH>
            <TH right>Incl. Idle</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.emp.id} style={{ borderBottom:"1px solid #f8fafc" }}>
              {/* Name */}
              <td style={{ padding:"13px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{
                    width:32, height:32, borderRadius:"50%", flexShrink:0,
                    background: ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444"][idx % 5],
                    color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                    fontWeight:700, fontSize:13,
                  }}>
                    {r.emp.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{r.emp.name}</div>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>{r.emp.department || "Employee"}</div>
                  </div>
                </div>
              </td>
              {/* Span */}
              <td style={{ padding:"13px 16px", fontSize:12, color:"#374151", fontFamily:"monospace" }}>
                {r.firstIn
                  ? <><span style={{ color:"#16a34a", fontWeight:700 }}>●</span> {fmtTime(r.firstIn)} → {r.lastOut ? fmtTime(r.lastOut) : <span style={{ color:"#f59e0b" }}>ongoing</span>}</>
                  : <span style={{ color:"#cbd5e1" }}>—</span>}
              </td>
              {/* Total */}
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <span style={{
                  background:"#3b82f6", color:"#fff",
                  borderRadius:20, padding:"4px 14px",
                  fontWeight:700, fontSize:13, fontFamily:"monospace",
                }}>
                  {fmtHMPad(r.totalMins)}
                </span>
              </td>
              {/* Active % */}
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                  <span style={{ fontWeight:700, fontSize:13, color: r.activePct >= 80 ? "#16a34a" : r.activePct >= 60 ? "#ca8a04" : "#dc2626" }}>
                    {r.activePct}%
                  </span>
                  <div style={{ width:72, height:6, background:"#f1f5f9", borderRadius:3 }}>
                    <div style={{
                      height:6, borderRadius:3,
                      background: r.activePct >= 80 ? "#10b981" : r.activePct >= 60 ? "#f59e0b" : "#ef4444",
                      width:`${r.activePct}%`, transition:"width .4s",
                    }} />
                  </div>
                </div>
              </td>
              {/* Idle */}
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <span style={{
                  color: r.idleMins > 0 ? "#ef4444" : "#94a3b8",
                  fontWeight:700, fontSize:13, fontFamily:"monospace",
                }}>
                  {fmtHMPad(r.idleMins)}
                </span>
              </td>
              {/* Incl. idle */}
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <span style={{ color:"#6366f1", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>
                  {fmtHMPad(r.activeMins)}
                </span>
              </td>
            </tr>
          ))}

          {/* Totals row */}
          <tr style={{ background:"#f8fafc", borderTop:"2px solid #e2e8f0" }}>
            <td style={{ padding:"13px 16px", fontWeight:700, fontSize:13, color:"#1e293b" }}>
              Total ({rows.length} employee{rows.length !== 1 ? "s" : ""})
            </td>
            <td style={{ padding:"13px 16px", color:"#94a3b8", fontSize:12 }}>—</td>
            <td style={{ padding:"13px 16px", textAlign:"center" }}>
              <span style={{
                background:"#1e40af", color:"#fff",
                borderRadius:20, padding:"4px 14px",
                fontWeight:700, fontSize:13, fontFamily:"monospace",
              }}>
                {fmtHMPad(totalAll)}
              </span>
            </td>
            <td style={{ padding:"13px 16px", textAlign:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                <span style={{ fontWeight:700, fontSize:13 }}>{activePctAll}%</span>
                <div style={{ width:72, height:6, background:"#e2e8f0", borderRadius:3 }}>
                  <div style={{ height:6, background:"#10b981", borderRadius:3, width:`${activePctAll}%` }} />
                </div>
              </div>
            </td>
            <td style={{ padding:"13px 16px", textAlign:"center" }}>
              <span style={{ color: idleAll > 0 ? "#ef4444":"#94a3b8", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>
                {fmtHMPad(idleAll)}
              </span>
            </td>
            <td style={{ padding:"13px 16px", textAlign:"center" }}>
              <span style={{ color:"#6366f1", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>
                {fmtHMPad(activeAll)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Timelines() {
  const { user }       = useAuth();
  const isAdmin        = user?.role === "admin";
  const [employees,    setEmployees]    = useState([]);
  const [employeeId,   setEmployeeId]   = useState("all");
  const [startDate,    setStartDate]    = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [endDate,      setEndDate]      = useState(format(new Date(), "yyyy-MM-dd"));
  const [dayResetHour, setDayResetHour] = useState(0);
  const [sessions,     setSessions]     = useState([]);
  const [idleLogs,     setIdleLogs]     = useState([]);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (isAdmin) api.getEmployees().then(setEmployees).catch(console.error);
  }, [isAdmin]);

  const effectiveEmpId = isAdmin ? employeeId : (user?.id ? String(user.id) : "all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTimeline(startDate, endDate, effectiveEmpId !== "all" ? effectiveEmpId : undefined);
      setSessions(data.sessions || []);
      setIdleLogs(data.idleLogs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [startDate, endDate, effectiveEmpId]);

  useEffect(() => { load(); }, [load]);

  const dateRange = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
    .map(d => format(d, "yyyy-MM-dd"));

  const timelineEmployees = isAdmin
    ? (effectiveEmpId === "all"
        ? employees.filter(e => sessions.some(s => String(s.employee_id) === String(e.id)))
        : employees.filter(e => String(e.id) === effectiveEmpId))
    : (user ? [{ id: user.id, name: user.name, department: user.department }] : []);

  const inp = {
    padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8,
    fontSize:13, background:"#fff", color:"#374151", outline:"none",
  };

  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, color:"#1e293b", margin:0 }}>
        {isAdmin ? "Timelines" : "My Timeline"}
      </h1>
      <p style={{ color:"#64748b", fontSize:14, marginTop:4, marginBottom:24 }}>
        Work history by day — sessions, idle periods and activity spans
      </p>

      {/* ── Filter bar ── */}
      <div style={{
        display:"flex", alignItems:"flex-end", gap:14, marginBottom:28, flexWrap:"wrap",
        background:"#fff", padding:"16px 20px", borderRadius:12,
        border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
      }}>
        {isAdmin && (
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Employee</div>
            <select style={inp} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="all">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Start Date</div>
          <input type="date" style={inp} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>End Date</div>
          <input type="date" style={inp} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#94a3b8", marginBottom:5, textTransform:"uppercase", letterSpacing:.5 }}>Day Reset</div>
          <select style={inp} value={dayResetHour} onChange={e => setDayResetHour(Number(e.target.value))}>
            {Array.from({ length:24 }, (_,i) => (
              <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>
            ))}
          </select>
        </div>
        <button
          onClick={load}
          style={{
            background: loading ? "#94a3b8" : "#6366f1", color:"#fff",
            border:"none", borderRadius:8, padding:"9px 20px",
            cursor: loading ? "default" : "pointer",
            fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6,
          }}
        >
          <span style={{ display:"inline-block", animation: loading ? "spin 1s linear infinite" : "none" }}>↻</span>
          {loading ? "Loading…" : "Refresh"}
        </button>

        {/* Legend */}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:16 }}>
          {[
            { color:"#16a34a", label:"Session" },
            { color:"#f59e0b", label:"Active now" },
            { color:"rgba(239,68,68,0.6)", label:"Idle" },
          ].map(l => (
            <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#64748b" }}>
              <div style={{ width:12, height:12, borderRadius:3, background:l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Summary table ── */}
      <SummaryTable employees={employees} sessions={sessions} idleLogs={idleLogs} />

      {/* ── Per-employee timeline sections ── */}
      {timelineEmployees.map((emp, empIdx) => {
        const empSessions = sessions.filter(s  => String(s.employee_id)  === String(emp.id));
        const empIdle     = idleLogs.filter(il => String(il.employee_id) === String(emp.id));
        const totalMins   = empSessions.reduce((a, s) => a + (Number(s.total_minutes) || 0), 0);
        const daysWorked  = dateRange.filter(date =>
          empSessions.some(s => (s.date || (s.punch_in||"").slice(0,10)) === date)
        ).length;

        return (
          <div key={emp.id} style={{
            background:"#fff", borderRadius:12, border:"1px solid #e2e8f0",
            marginBottom:24, overflow:"hidden",
            boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
          }}>
            {/* Employee header */}
            <div style={{
              padding:"16px 24px", borderBottom:"1px solid #f1f5f9",
              display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12,
              background:"#fafafa",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{
                  width:38, height:38, borderRadius:"50%", flexShrink:0,
                  background: ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444"][empIdx % 5],
                  color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                  fontWeight:700, fontSize:15,
                }}>
                  {emp.name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:"#1e293b" }}>{emp.name}</div>
                  <div style={{ fontSize:12, color:"#94a3b8" }}>{emp.department || "Employee"}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:20 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>Total</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#3b82f6" }}>{fmtHM(totalMins)}</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>Days</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#10b981" }}>{daysWorked}</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>Sessions</div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#6366f1" }}>{empSessions.length}</div>
                </div>
              </div>
            </div>

            {/* Day rows */}
            <div style={{ padding:"0 24px" }}>
              {dateRange.map(date => {
                const daySessions = empSessions.filter(s =>
                  (s.date || (s.punch_in||"").slice(0,10)) === date
                );
                const dayIdle = empIdle.filter(il =>
                  (il.date || (il.idle_start||"").slice(0,10)) === date
                );
                return (
                  <DayRow key={date} date={date}
                    sessions={daySessions} idleLogs={dayIdle}
                    dayResetHour={dayResetHour} />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div style={{ textAlign:"center", padding:"80px 0", color:"#94a3b8" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>📅</div>
          <div style={{ fontSize:16, fontWeight:700, color:"#64748b", marginBottom:8 }}>No timeline data</div>
          <div style={{ fontSize:13 }}>Try a different employee or date range.</div>
        </div>
      )}
    </div>
  );
}
