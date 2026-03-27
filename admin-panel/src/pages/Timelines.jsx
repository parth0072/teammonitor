import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { format, subDays, eachDayOfInterval, parseISO } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtHM = (mins) => {
  if (!mins) return "0h 0";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h}h ${m}`;
};

const fmtHMPad = (mins) => {
  const h = Math.floor((mins || 0) / 60), m = (mins || 0) % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
};

const fmtTime = (dt) => dt ? format(new Date(dt), "HH:mm") : "—";

// Minutes since midnight for a given datetime, offset by dayResetHour
function timeToBarPct(dt, dayResetHour) {
  if (!dt) return 0;
  const d = new Date(dt);
  const totalMins = d.getHours() * 60 + d.getMinutes();
  const resetMins = dayResetHour * 60;
  return ((totalMins - resetMins + 1440) % 1440) / 1440 * 100;
}

function durationBarPct(mins) {
  return Math.min(100, (mins || 0) / 1440 * 100);
}

// ── Timeline Bar ──────────────────────────────────────────────────────────────

const HOUR_LABELS = Array.from({ length: 7 }, (_, i) => i * 4); // 0,4,8,12,16,20,24... only show 6

function TimelineBar({ sessions, idleLogs, dayResetHour }) {
  const hourTicks = Array.from({ length: 7 }, (_, i) => {
    const h = (dayResetHour + i * 4) % 24;
    return { pct: (i * 4 / 24) * 100, label: `${String(h).padStart(2,"0")}:00` };
  });

  return (
    <div style={{ position:"relative", height:28, background:"#f3f4f6", borderRadius:4, overflow:"hidden", marginTop:8 }}>
      {/* Hour tick marks */}
      {hourTicks.map(t => (
        <div key={t.pct} style={{ position:"absolute", left:`${t.pct}%`, top:0, bottom:0, borderLeft:"1px solid #e5e7eb", zIndex:1 }}>
          <span style={{ position:"absolute", top:-16, left:2, fontSize:9, color:"#9ca3af", whiteSpace:"nowrap" }}>{t.label}</span>
        </div>
      ))}

      {/* Session blocks (green) */}
      {sessions.map((s, i) => {
        if (!s.punch_in) return null;
        const left  = timeToBarPct(s.punch_in, dayResetHour);
        const width = durationBarPct(s.total_minutes);
        return (
          <div key={i} title={`${fmtTime(s.punch_in)} → ${s.punch_out ? fmtTime(s.punch_out) : "ongoing"}`}
            style={{ position:"absolute", left:`${left}%`, width:`${Math.max(0.3, width)}%`,
                     top:0, bottom:0, background:"#16a34a", zIndex:2 }} />
        );
      })}

      {/* Idle blocks (red) */}
      {idleLogs.map((il, i) => {
        if (!il.idle_start) return null;
        const left  = timeToBarPct(il.idle_start, dayResetHour);
        const width = durationBarPct((il.duration_seconds || 0) / 60);
        return (
          <div key={i} title={`Idle ${fmtTime(il.idle_start)} → ${fmtTime(il.idle_end)}`}
            style={{ position:"absolute", left:`${left}%`, width:`${Math.max(0.15, width)}%`,
                     top:0, bottom:0, background:"#ef4444", zIndex:3 }} />
        );
      })}
    </div>
  );
}

// ── Per-day row ───────────────────────────────────────────────────────────────

function DayRow({ date, sessions, idleLogs, dayResetHour }) {
  const totalMins  = sessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
  const idleSecs   = idleLogs.reduce((a, il) => a + (il.duration_seconds || 0), 0);
  const activeMins = Math.max(0, totalMins - Math.round(idleSecs / 60));
  const hasWork    = sessions.length > 0;

  const dateObj = parseISO(date);

  return (
    <div style={{ borderBottom:"1px solid #f1f5f9", padding:"14px 0" }}>
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
        <div style={{ minWidth:130, fontWeight:700, fontSize:13, color:"#1e293b" }}>
          {format(dateObj, "EEE, MMM d, yyyy")}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#64748b" }}>
          <span>Time worked</span>
          <span style={{ background: hasWork ? "#dcfce7":"#f1f5f9", color: hasWork ? "#16a34a":"#9ca3af",
                         fontWeight:700, padding:"2px 10px", borderRadius:20, fontSize:12 }}>
            {fmtHM(totalMins)}
          </span>
        </div>
        <div style={{ fontSize:12, color:"#64748b" }}>
          Idle Deduction <span style={{ fontWeight:700, color:"#ef4444" }}>{fmtHM(Math.round(idleSecs/60))}</span>
        </div>
        <div style={{ fontSize:12, color:"#64748b" }}>
          Total Inc. Idle <span style={{ fontWeight:700, color:"#3b82f6" }}>{fmtHM(activeMins)}</span>
        </div>
        {hasWork && (
          <div style={{ fontSize:12, color:"#64748b" }}>
            {fmtTime(sessions[0].punch_in)} → {sessions[sessions.length-1].punch_out ? fmtTime(sessions[sessions.length-1].punch_out) : "ongoing"}
          </div>
        )}
      </div>

      {/* Timeline bar */}
      {hasWork ? (
        <div style={{ marginTop:20 }}>
          <TimelineBar sessions={sessions} idleLogs={idleLogs} dayResetHour={dayResetHour} />
        </div>
      ) : (
        <div style={{ color:"#9ca3af", fontSize:13, marginTop:6 }}>User has not logged time</div>
      )}
    </div>
  );
}

// ── Summary Table ─────────────────────────────────────────────────────────────

function SummaryTable({ employees, sessions, idleLogs }) {
  const rows = employees.map(emp => {
    const empSessions = sessions.filter(s => String(s.employee_id) === String(emp.id));
    const empIdle     = idleLogs.filter(il => String(il.employee_id) === String(emp.id));

    const totalMins  = empSessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
    const idleSecs   = empIdle.reduce((a, il) => a + (il.duration_seconds || 0), 0);
    const idleMins   = Math.round(idleSecs / 60);
    const activeMins = Math.max(0, totalMins - idleMins);
    const activePct  = totalMins > 0 ? Math.round(activeMins / totalMins * 100) : 0;

    const activeSess  = empSessions.filter(s => s.punch_in);
    const firstIn     = activeSess.length ? fmtTime(activeSess[0].punch_in) : null;
    const lastSess    = activeSess[activeSess.length - 1];
    const lastOut     = lastSess?.punch_out ? fmtTime(lastSess.punch_out) : lastSess ? "ongoing" : null;

    return { emp, totalMins, idleMins, activeMins, activePct, firstIn, lastOut };
  }).filter(r => r.totalMins > 0);

  if (rows.length === 0) return null;

  const totalAll   = rows.reduce((a,r) => a + r.totalMins, 0);
  const idleAll    = rows.reduce((a,r) => a + r.idleMins, 0);
  const activeAll  = rows.reduce((a,r) => a + r.activeMins, 0);
  const activePctAll = totalAll > 0 ? Math.round(activeAll / totalAll * 100) : 0;

  const TH = ({ children, align="left" }) => (
    <th style={{ padding:"10px 16px", fontSize:11, fontWeight:600, color:"#64748b",
                 textTransform:"uppercase", letterSpacing:"0.05em", textAlign:align,
                 background:"#f8fafc", borderBottom:"1px solid #e2e8f0", whiteSpace:"nowrap" }}>
      {children}
    </th>
  );

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"auto", marginBottom:32 }}>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <TH>Employee</TH>
            <TH>Activity Span</TH>
            <TH align="center">Total Time Worked</TH>
            <TH align="center">% Active Minutes</TH>
            <TH align="center">Idle Deduction</TH>
            <TH align="center">Incl. Idle</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.emp.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
              <td style={{ padding:"12px 16px", fontWeight:700, fontSize:13, color:"#1e293b" }}>
                {r.emp.name}
                <div style={{ fontSize:11, color:"#94a3b8", fontWeight:400 }}>AUTO</div>
              </td>
              <td style={{ padding:"12px 16px", fontSize:12, color:"#374151" }}>
                {r.firstIn && r.lastOut
                  ? <><span style={{ color:"#10b981", fontWeight:700 }}>●</span> {r.firstIn} → {r.lastOut}</>
                  : <span style={{ color:"#9ca3af" }}>—</span>}
              </td>
              <td style={{ padding:"12px 16px", textAlign:"center" }}>
                <span style={{ background:"#3b82f6", color:"#fff", borderRadius:20, padding:"4px 14px", fontWeight:700, fontSize:13 }}>
                  {fmtHMPad(r.totalMins)}
                </span>
              </td>
              <td style={{ padding:"12px 16px", textAlign:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                  <span style={{ fontWeight:600, fontSize:13 }}>{r.activePct}%</span>
                  <div style={{ width:80, height:6, background:"#e5e7eb", borderRadius:3 }}>
                    <div style={{ height:6, background:"#10b981", borderRadius:3, width:`${r.activePct}%` }} />
                  </div>
                </div>
              </td>
              <td style={{ padding:"12px 16px", textAlign:"center" }}>
                <span style={{ color: r.idleMins > 0 ? "#ef4444":"#9ca3af", fontWeight:700, fontSize:13 }}>
                  {fmtHMPad(r.idleMins)}
                </span>
              </td>
              <td style={{ padding:"12px 16px", textAlign:"center" }}>
                <span style={{ color:"#6366f1", fontWeight:700, fontSize:13 }}>
                  {fmtHMPad(r.activeMins)}
                </span>
              </td>
            </tr>
          ))}

          {/* Total row */}
          <tr style={{ background:"#f8fafc", fontWeight:700 }}>
            <td style={{ padding:"12px 16px", fontSize:13, color:"#1e293b" }}>TOTAL ({rows.length} employees)</td>
            <td style={{ padding:"12px 16px", fontSize:12, color:"#9ca3af" }}>—</td>
            <td style={{ padding:"12px 16px", textAlign:"center" }}>
              <span style={{ background:"#1e40af", color:"#fff", borderRadius:20, padding:"4px 14px", fontWeight:700, fontSize:13 }}>
                {fmtHMPad(totalAll)}
              </span>
            </td>
            <td style={{ padding:"12px 16px", textAlign:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                <span style={{ fontWeight:600, fontSize:13 }}>{activePctAll}%</span>
                <div style={{ width:80, height:6, background:"#e5e7eb", borderRadius:3 }}>
                  <div style={{ height:6, background:"#10b981", borderRadius:3, width:`${activePctAll}%` }} />
                </div>
              </div>
            </td>
            <td style={{ padding:"12px 16px", textAlign:"center" }}>
              <span style={{ color: idleAll > 0 ? "#ef4444":"#9ca3af", fontWeight:700, fontSize:13 }}>
                {fmtHMPad(idleAll)}
              </span>
            </td>
            <td style={{ padding:"12px 16px", textAlign:"center" }}>
              <span style={{ color:"#6366f1", fontWeight:700, fontSize:13 }}>
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
  const [employees,    setEmployees]    = useState([]);
  const [employeeId,   setEmployeeId]   = useState("all");
  const [startDate,    setStartDate]    = useState(format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [endDate,      setEndDate]      = useState(format(new Date(), "yyyy-MM-dd"));
  const [dayResetHour, setDayResetHour] = useState(0);
  const [sessions,     setSessions]     = useState([]);
  const [idleLogs,     setIdleLogs]     = useState([]);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => { api.getEmployees().then(setEmployees).catch(console.error); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTimeline(startDate, endDate, employeeId !== "all" ? employeeId : undefined);
      setSessions(data.sessions || []);
      setIdleLogs(data.idleLogs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [startDate, endDate, employeeId]);

  useEffect(() => { load(); }, [load]);

  // Build date range array
  const dateRange = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
    .map(d => format(d, "yyyy-MM-dd"));

  // Which employees to show in timeline section
  const timelineEmployees = employeeId === "all"
    ? employees.filter(e => sessions.some(s => String(s.employee_id) === String(e.id)))
    : employees.filter(e => String(e.id) === employeeId);

  const DAY_RESET_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
    value: i, label: `${String(i).padStart(2,"0")}:00`
  }));

  const S = {
    select: { padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff", color:"#374151" },
    btn:    { background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 },
  };

  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, color:"#1e293b", margin:0 }}>Timelines</h1>
      <p style={{ color:"#64748b", fontSize:14, marginTop:4, marginBottom:24 }}>Employee History</p>

      {/* Filter bar */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28, flexWrap:"wrap",
                    background:"#fff", padding:"16px 20px", borderRadius:12, border:"1px solid #e2e8f0" }}>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#9ca3af", marginBottom:4 }}>Employee</div>
          <select style={S.select} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="all">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#9ca3af", marginBottom:4 }}>Start Date</div>
          <input type="date" style={S.select} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#9ca3af", marginBottom:4 }}>End Date</div>
          <input type="date" style={S.select} value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:600, color:"#9ca3af", marginBottom:4 }}>Day reset</div>
          <select style={S.select} value={dayResetHour} onChange={e => setDayResetHour(Number(e.target.value))}>
            {DAY_RESET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ marginTop:18 }}>
          <button style={S.btn} onClick={load}>
            {loading ? "↻" : "↻"} Refresh
          </button>
        </div>
        {loading && <span style={{ color:"#94a3b8", fontSize:13, marginTop:18 }}>Loading…</span>}
      </div>

      {/* Summary table */}
      <SummaryTable employees={employees} sessions={sessions} idleLogs={idleLogs} />

      {/* Per-employee timeline sections */}
      {timelineEmployees.map(emp => {
        const empSessions = sessions.filter(s => String(s.employee_id) === String(emp.id));
        const empIdle     = idleLogs.filter(il => String(il.employee_id) === String(emp.id));

        return (
          <div key={emp.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"20px 24px", marginBottom:20 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b", marginBottom:16, borderBottom:"1px solid #f1f5f9", paddingBottom:12 }}>
              Timelines: {emp.name}
            </div>

            {dateRange.map(date => {
              const daySessions = empSessions.filter(s => s.date === date || (s.punch_in && s.punch_in.slice(0,10) === date));
              const dayIdle     = empIdle.filter(il => il.date === date || (il.idle_start && il.idle_start.slice(0,10) === date));
              return (
                <DayRow key={date} date={date}
                  sessions={daySessions} idleLogs={dayIdle} dayResetHour={dayResetHour} />
              );
            })}
          </div>
        );
      })}

      {!loading && sessions.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
          <div style={{ fontSize:15, fontWeight:600, color:"#64748b" }}>No timeline data for this range</div>
          <div style={{ fontSize:13, marginTop:6 }}>Try selecting a different employee or date range.</div>
        </div>
      )}
    </div>
  );
}
