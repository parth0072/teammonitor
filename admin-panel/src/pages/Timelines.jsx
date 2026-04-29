import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { format, subDays, eachDayOfInterval, parseISO } from "date-fns";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtHM  = m => { const h=Math.floor((m||0)/60),mn=(m||0)%60; return `${h}h ${String(mn).padStart(2,"0")}m`; };
const fmtHMPad = m => { const h=Math.floor((m||0)/60),mn=(m||0)%60; return `${String(h).padStart(2,"0")}:${String(mn).padStart(2,"0")}`; };
const fmtTime  = dt => dt ? format(new Date(dt), "h:mm a") : "—";
const fmtDur   = s  => { s=Math.round(Number(s)||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const sessionDate = s => String(s.date||"").slice(0,10) || String(s.punch_in||"").slice(0,10);

function toPct(dt, resetHour) {
  if (!dt) return 0;
  const d = new Date(dt);
  const mins = d.getHours()*60 + d.getMinutes();
  return ((mins - resetHour*60 + 1440) % 1440) / 1440 * 100;
}
function durPct(mins) { return Math.min(100, (mins||0)/1440*100); }

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];

// ── Timeline Gantt Bar ────────────────────────────────────────────────────────

function TimelineBar({ sessions, idleLogs, sessionBreaks, dayResetHour }) {
  const ticks = Array.from({ length:7 }, (_,i) => ({
    pct: (i/6)*100,
    label: `${String((dayResetHour + i*4) % 24).padStart(2,"0")}:00`,
  }));

  return (
    <div style={{ position:"relative", paddingBottom:20, marginTop:6 }}>
      <div style={{ position:"relative", height:48, background:"#f1f5f9", borderRadius:8, overflow:"hidden" }}>
        {/* Grid lines */}
        {ticks.slice(1,-1).map(t => (
          <div key={t.pct} style={{ position:"absolute", left:`${t.pct}%`, top:0, bottom:0, borderLeft:"1px solid #e2e8f0", zIndex:1 }} />
        ))}
        {/* Session blocks */}
        {sessions.map((s,i) => {
          if (!s.punch_in) return null;
          const left  = toPct(s.punch_in, dayResetHour);
          const width = durPct(s.total_minutes);
          const isActive = !s.punch_out;
          const label = s.total_minutes >= 30 ? fmtHM(s.total_minutes) : null;
          return (
            <div key={i}
              title={`${fmtTime(s.punch_in)} → ${s.punch_out ? fmtTime(s.punch_out) : "ongoing"} · ${fmtHM(s.total_minutes)}${s.task_name ? " · "+s.task_name : ""}`}
              style={{
                position:"absolute", top:4, bottom:4,
                left:`${left}%`, width:`${Math.max(0.5,width)}%`,
                background: isActive ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "linear-gradient(135deg,#16a34a,#22c55e)",
                borderRadius:5, zIndex:2,
                display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden",
              }}>
              {label && <span style={{ fontSize:10, fontWeight:700, color:"#fff", textShadow:"0 1px 2px rgba(0,0,0,0.3)", padding:"0 4px", whiteSpace:"nowrap" }}>{label}</span>}
            </div>
          );
        })}
        {/* Idle overlays */}
        {idleLogs.map((il,i) => il.idle_start && (
          <div key={i}
            title={`Idle: ${fmtTime(il.idle_start)} → ${fmtTime(il.idle_end)} (${Math.round((il.duration_seconds||0)/60)}m)`}
            style={{
              position:"absolute", top:0, bottom:0,
              left:`${toPct(il.idle_start, dayResetHour)}%`,
              width:`${Math.max(0.2, durPct((il.duration_seconds||0)/60))}%`,
              background:"rgba(239,68,68,0.4)", zIndex:3,
            }} />
        ))}
        {/* Break markers */}
        {sessionBreaks.map((b,i) => b.start_time && (
          <div key={i}
            title={`Break: ${fmtTime(b.start_time)} → ${fmtTime(b.end_time)} (${b.duration_minutes}m)`}
            style={{
              position:"absolute", top:0, bottom:0,
              left:`${toPct(b.start_time, dayResetHour)}%`,
              width:`${Math.max(0.3, durPct(b.duration_minutes))}%`,
              background:"rgba(245,158,11,0.5)", zIndex:3,
            }} />
        ))}
      </div>
      {/* Hour labels */}
      <div style={{ position:"relative", height:16 }}>
        {ticks.map(t => (
          <div key={t.pct} style={{ position:"absolute", left:`${t.pct}%`, transform:"translateX(-50%)", fontSize:9, color:"#94a3b8", marginTop:3, whiteSpace:"nowrap" }}>
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Session Card ──────────────────────────────────────────────────────────────

function SessionCard({ session, breaks }) {
  const isActive = !session.punch_out;
  const heartbeatAgeMin = session.last_heartbeat_at
    ? (Date.now() - new Date(session.last_heartbeat_at).getTime()) / 60000 : 999;
  const isAway  = isActive && heartbeatAgeMin > 8;   // lid closed / asleep
  const wallMins = session.punch_in && session.punch_out
    ? Math.round((new Date(session.punch_out) - new Date(session.punch_in)) / 60000) : null;
  const netMins  = Number(session.total_minutes) || 0;
  const idleMins = wallMins != null ? Math.max(0, wallMins - netMins) : null;
  const totalBrkMins = breaks.reduce((a,b) => a+(Number(b.duration_minutes)||0), 0);

  return (
    <div style={{
      border:"1px solid #f1f5f9",
      borderLeft:`3px solid ${isActive ? "#f59e0b" : "#10b981"}`,
      borderRadius:8, marginBottom:8, overflow:"hidden",
    }}>
      {/* Session header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", flexWrap:"wrap", background: isActive ? "#fffbeb" : "#f0fdf4" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background: isActive ? "#f59e0b" : "#10b981", flexShrink:0 }} />
          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#1e293b" }}>
            {fmtTime(session.punch_in)}
          </span>
          <span style={{ fontSize:11, color:"#94a3b8" }}>→</span>
          <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color: isActive ? "#f59e0b" : "#1e293b" }}>
            {isActive ? "ongoing" : fmtTime(session.punch_out)}
          </span>
        </div>

        {/* Net time badge */}
        <span style={{ background: isActive ? "#fef3c7" : "#dcfce7", color: isActive ? "#92400e" : "#166534", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
          {fmtHM(netMins)}
        </span>

        {/* Wall time */}
        {wallMins != null && wallMins !== netMins && (
          <span style={{ fontSize:11, color:"#94a3b8" }}>wall {fmtHM(wallMins)}</span>
        )}

        {/* Idle */}
        {idleMins != null && idleMins > 1 && (
          <span style={{ background:"#fee2e2", color:"#991b1b", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
            {idleMins}m idle
          </span>
        )}

        {/* Breaks */}
        {breaks.length > 0 && (
          <span style={{ background:"#fff7ed", color:"#c2410c", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
            ☕ {breaks.length} break{breaks.length>1?"s":""} · {totalBrkMins}m
          </span>
        )}

        {/* Active / Away badge */}
        {isActive && (
          isAway
            ? <span style={{ background:"#f1f5f9", color:"#64748b", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700, marginLeft:"auto" }}>
                ◌ Away
              </span>
            : <span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700, marginLeft:"auto" }}>
                ● Active now
              </span>
        )}
      </div>

      {/* Task / Jira / break details */}
      {(session.task_name || session.jira_issue_key || session.jira_issue_summary || breaks.length > 0) && (
        <div style={{ padding:"8px 14px", background:"#fff", display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-start" }}>
          {/* Task/Jira */}
          {(session.task_name || session.jira_issue_key) && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {session.task_name && (
                <span style={{ background:"#eff6ff", color:"#1d4ed8", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                  📋 {session.task_name}
                </span>
              )}
              {session.jira_issue_key && (
                <span style={{ background:"#f0f9ff", color:"#0369a1", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>
                  🔗 {session.jira_issue_key}{session.jira_issue_summary ? ` — ${session.jira_issue_summary}` : ""}
                </span>
              )}
            </div>
          )}
          {/* Break list */}
          {breaks.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {breaks.map((b,i) => (
                <span key={i} style={{ background:"#fff7ed", color:"#92400e", borderRadius:4, padding:"2px 8px", fontSize:11 }}>
                  {fmtTime(b.start_time)} → {b.end_time ? fmtTime(b.end_time) : "ongoing"} ({b.duration_minutes}m)
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Day Row ───────────────────────────────────────────────────────────────────

function DayRow({ date, sessions, idleLogs, sessionBreaks, dayResetHour, topApps, screenshotCount }) {
  const [expanded, setExpanded] = useState(true);

  const totalMins  = sessions.reduce((a,s) => a+(Number(s.total_minutes)||0), 0);
  const idleSecs   = idleLogs.reduce((a,il) => a+(il.duration_seconds||0), 0);
  const idleMins   = Math.round(idleSecs/60);
  const totalBrks  = sessionBreaks.length;
  const brkMins    = sessionBreaks.reduce((a,b) => a+(Number(b.duration_minutes)||0), 0);
  const hasWork    = sessions.length > 0;
  const firstIn    = hasWork ? sessions[0].punch_in : null;
  const lastSess   = hasWork ? sessions[sessions.length-1] : null;
  const lastOut    = lastSess?.punch_out;
  const isActive   = hasWork && !lastOut;
  const isWeekend  = [0,6].includes(parseISO(date).getDay());
  const activePct  = totalMins > 0 ? Math.round(Math.max(0, totalMins - idleMins) / totalMins * 100) : 0;

  return (
    <div style={{
      borderBottom:"1px solid #f1f5f9",
      opacity: isWeekend && !hasWork ? 0.45 : 1,
    }}>
      {/* Day header — always visible, clickable to expand/collapse */}
      <div
        onClick={() => hasWork && setExpanded(e => !e)}
        style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 0", flexWrap:"wrap", cursor: hasWork ? "pointer" : "default" }}
      >
        {/* Date */}
        <div style={{ minWidth:140, flexShrink:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>
            {format(parseISO(date), "EEE, MMM d")}
          </div>
          {isWeekend && <div style={{ fontSize:10, color:"#94a3b8" }}>Weekend</div>}
        </div>

        {hasWork ? (
          <>
            {/* Worked */}
            <div style={{ background:"#d1fae5", color:"#065f46", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>
              {fmtHM(totalMins)}
            </div>

            {/* Span */}
            <div style={{ fontSize:12, color:"#374151", fontFamily:"monospace" }}>
              <span style={{ color:"#16a34a" }}>●</span>{" "}
              {fmtTime(firstIn)} → {isActive ? <span style={{ color:"#f59e0b", fontWeight:700 }}>ongoing</span> : fmtTime(lastOut)}
            </div>

            {/* Sessions */}
            <div style={{ fontSize:11, color:"#64748b", background:"#f8fafc", borderRadius:20, padding:"2px 10px" }}>
              {sessions.length} session{sessions.length!==1?"s":""}
            </div>

            {/* Idle */}
            {idleMins > 0 && (
              <div style={{ background:"#fee2e2", color:"#991b1b", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>
                {idleMins}m idle
              </div>
            )}

            {/* Breaks */}
            {totalBrks > 0 && (
              <div style={{ background:"#fff7ed", color:"#c2410c", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>
                ☕ {totalBrks} break{totalBrks!==1?"s":""} · {brkMins}m
              </div>
            )}

            {/* Active % */}
            {activePct > 0 && activePct < 100 && (
              <div style={{ fontSize:11, color:"#64748b" }}>{activePct}% active</div>
            )}

            {/* Screenshots */}
            {screenshotCount > 0 && (
              <div style={{ fontSize:11, color:"#64748b" }}>📸 {screenshotCount}</div>
            )}

            {/* Top apps */}
            {topApps.length > 0 && (
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginLeft:"auto" }}>
                {topApps.slice(0,3).map((a,i) => (
                  <span key={i} style={{
                    fontSize:10, background:"#f8fafc", border:"1px solid #e2e8f0",
                    borderRadius:4, padding:"1px 7px", color:"#64748b",
                  }}>
                    <span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:COLORS[i], marginRight:4, verticalAlign:"middle" }} />
                    {a.app.length > 16 ? a.app.slice(0,16)+"…" : a.app} · {fmtDur(a.secs)}
                  </span>
                ))}
              </div>
            )}

            {/* Expand toggle */}
            <div style={{ marginLeft: topApps.length > 0 ? 0 : "auto", fontSize:12, color:"#94a3b8" }}>
              {expanded ? "▲" : "▼"}
            </div>
          </>
        ) : (
          <div style={{ fontSize:12, color:"#cbd5e1" }}>No time logged</div>
        )}
      </div>

      {/* Expanded: gantt bar + session cards */}
      {hasWork && expanded && (
        <div style={{ paddingBottom:16 }}>
          <TimelineBar
            sessions={sessions}
            idleLogs={idleLogs}
            sessionBreaks={sessionBreaks}
            dayResetHour={dayResetHour}
          />

          {/* Session cards */}
          <div style={{ marginTop:12 }}>
            {sessions.map(s => {
              const sBreaks = sessionBreaks.filter(b => b.session_id === s.id);
              return <SessionCard key={s.id} session={s} breaks={sBreaks} />;
            })}
          </div>

          {/* Day stats footer */}
          <div style={{
            display:"flex", gap:16, flexWrap:"wrap",
            marginTop:10, padding:"10px 14px",
            background:"#f8fafc", borderRadius:8,
            border:"1px solid #f1f5f9",
          }}>
            {[
              { label:"Net Tracked",   value: fmtHM(totalMins),           color:"#10b981" },
              { label:"Idle Paused",   value: fmtHM(idleMins),            color: idleMins>0?"#ef4444":"#94a3b8" },
              { label:"Break Time",    value: brkMins>0?fmtHM(brkMins):"—", color: brkMins>0?"#f59e0b":"#94a3b8" },
              { label:"Active %",      value: activePct+"%",               color: activePct>=80?"#10b981":activePct>=60?"#f59e0b":"#ef4444" },
              { label:"Sessions",      value: sessions.length,             color:"#3b82f6" },
              screenshotCount>0 ? { label:"Screenshots", value: screenshotCount, color:"#6366f1" } : null,
            ].filter(Boolean).map(stat => (
              <div key={stat.label} style={{ textAlign:"center", minWidth:70 }}>
                <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.4, marginBottom:2 }}>{stat.label}</div>
                <div style={{ fontSize:14, fontWeight:700, color:stat.color }}>{stat.value}</div>
              </div>
            ))}
            {/* Top apps detail */}
            {topApps.length > 0 && (
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.4 }}>Top Apps</span>
                {topApps.map((a,i) => (
                  <span key={i} style={{ fontSize:11, color:"#374151", display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:COLORS[i], display:"inline-block" }} />
                    {a.app} <span style={{ color:"#94a3b8" }}>({fmtDur(a.secs)})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Table ─────────────────────────────────────────────────────────────

function SummaryTable({ employees, sessions, idleLogs }) {
  const rows = employees.map(emp => {
    const empSess = sessions.filter(s  => String(s.employee_id)  === String(emp.id));
    const empIdle = idleLogs.filter(il => String(il.employee_id) === String(emp.id));
    const totalMins  = empSess.reduce((a,s) => a+(Number(s.total_minutes)||0), 0);
    const idleMins   = Math.round(empIdle.reduce((a,il) => a+(il.duration_seconds||0), 0)/60);
    const activeMins = Math.max(0, totalMins - idleMins);
    const activePct  = totalMins>0 ? Math.round(activeMins/totalMins*100) : 0;
    const activeSess = empSess.filter(s => s.punch_in);
    const firstIn    = activeSess.length ? activeSess[0].punch_in : null;
    const lastSess   = activeSess[activeSess.length-1];
    const lastOut    = lastSess?.punch_out ?? null;
    return { emp, totalMins, idleMins, activeMins, activePct, firstIn, lastOut };
  }).filter(r => r.totalMins > 0);

  if (rows.length === 0) return null;

  const totalAll    = rows.reduce((a,r) => a+r.totalMins, 0);
  const idleAll     = rows.reduce((a,r) => a+r.idleMins, 0);
  const activeAll   = rows.reduce((a,r) => a+r.activeMins, 0);
  const activePctAll = totalAll>0 ? Math.round(activeAll/totalAll*100) : 0;

  const TH = ({ children, right }) => (
    <th style={{
      padding:"10px 16px", fontSize:11, fontWeight:700, color:"#64748b",
      textTransform:"uppercase", letterSpacing:.6, textAlign: right?"center":"left",
      background:"#f8fafc", borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap",
    }}>{children}</th>
  );

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom:28, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ padding:"16px 20px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#1e293b" }}>Period Summary</div>
        <div style={{ fontSize:12, color:"#94a3b8" }}>{rows.length} employee{rows.length!==1?"s":""} tracked</div>
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
          {rows.map((r,idx) => (
            <tr key={r.emp.id} style={{ borderBottom:"1px solid #f8fafc" }}>
              <td style={{ padding:"13px 16px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, background:COLORS[idx%COLORS.length], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13 }}>
                    {r.emp.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{r.emp.name}</div>
                    <div style={{ fontSize:11, color:"#94a3b8" }}>{r.emp.department || "Employee"}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding:"13px 16px", fontSize:12, color:"#374151", fontFamily:"monospace" }}>
                {r.firstIn ? <><span style={{ color:"#16a34a", fontWeight:700 }}>●</span> {fmtTime(r.firstIn)} → {r.lastOut ? fmtTime(r.lastOut) : <span style={{ color:"#f59e0b" }}>ongoing</span>}</> : <span style={{ color:"#cbd5e1" }}>—</span>}
              </td>
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <span style={{ background:"#3b82f6", color:"#fff", borderRadius:20, padding:"4px 14px", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>
                  {fmtHMPad(r.totalMins)}
                </span>
              </td>
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                  <span style={{ fontWeight:700, fontSize:13, color: r.activePct>=80?"#16a34a":r.activePct>=60?"#ca8a04":"#dc2626" }}>{r.activePct}%</span>
                  <div style={{ width:72, height:6, background:"#f1f5f9", borderRadius:3 }}>
                    <div style={{ height:6, borderRadius:3, background: r.activePct>=80?"#10b981":r.activePct>=60?"#f59e0b":"#ef4444", width:`${r.activePct}%` }} />
                  </div>
                </div>
              </td>
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <span style={{ color: r.idleMins>0?"#ef4444":"#94a3b8", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>
                  {fmtHMPad(r.idleMins)}
                </span>
              </td>
              <td style={{ padding:"13px 16px", textAlign:"center" }}>
                <span style={{ color:"#6366f1", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>
                  {fmtHMPad(r.activeMins)}
                </span>
              </td>
            </tr>
          ))}
          <tr style={{ background:"#f8fafc", borderTop:"2px solid #e2e8f0" }}>
            <td style={{ padding:"13px 16px", fontSize:13, fontWeight:700, color:"#1e293b" }}>Total ({rows.length} employee{rows.length!==1?"s":""})</td>
            <td style={{ padding:"13px 16px", color:"#94a3b8", fontSize:12 }}>—</td>
            <td style={{ padding:"13px 16px", textAlign:"center" }}>
              <span style={{ background:"#1e40af", color:"#fff", borderRadius:20, padding:"4px 14px", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>{fmtHMPad(totalAll)}</span>
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
              <span style={{ color: idleAll>0?"#ef4444":"#94a3b8", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>{fmtHMPad(idleAll)}</span>
            </td>
            <td style={{ padding:"13px 16px", textAlign:"center" }}>
              <span style={{ color:"#6366f1", fontWeight:700, fontSize:13, fontFamily:"monospace" }}>{fmtHMPad(activeAll)}</span>
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
  const [sessionBreaks,setSessionBreaks]= useState([]);
  const [topApps,      setTopApps]      = useState({});
  const [screenshots,  setScreenshots]  = useState([]);
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
      setSessionBreaks(data.sessionBreaks || []);
      setTopApps(data.topApps || {});
      setScreenshots(data.screenshotCounts || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [startDate, endDate, effectiveEmpId]);

  useEffect(() => { load(); }, [load]);

  const dateRange = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
    .map(d => format(d, "yyyy-MM-dd"))
    .reverse();

  const timelineEmployees = isAdmin
    ? (effectiveEmpId === "all"
        ? employees.filter(e => sessions.some(s => String(s.employee_id) === String(e.id)))
        : employees.filter(e => String(e.id) === effectiveEmpId))
    : (user ? [{ id: user.id, name: user.name, department: user.department }] : []);

  const inp = { padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff", color:"#374151" };

  return (
    <div>
      <h1 style={{ fontSize:26, fontWeight:700, color:"#1e293b", margin:0 }}>
        {isAdmin ? "Timelines" : "My Timeline"}
      </h1>
      <p style={{ color:"#64748b", fontSize:14, marginTop:4, marginBottom:24 }}>
        Full session detail — punch in/out, breaks, idle, tasks and app usage per day
      </p>

      {/* Filter bar */}
      <div style={{ display:"flex", alignItems:"flex-end", gap:14, marginBottom:28, flexWrap:"wrap", background:"#fff", padding:"16px 20px", borderRadius:12, border:"1px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
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
            {Array.from({ length:24 }, (_,i) => <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}
          </select>
        </div>
        <button onClick={load} style={{ background: loading?"#94a3b8":"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor: loading?"default":"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
          <span>↻</span>{loading ? "Loading…" : "Refresh"}
        </button>
        {/* Legend */}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:14 }}>
          {[
            { color:"#16a34a",            label:"Session" },
            { color:"#f59e0b",            label:"Active" },
            { color:"rgba(239,68,68,.5)", label:"Idle" },
            { color:"rgba(245,158,11,.5)",label:"Break" },
          ].map(l => (
            <div key={l.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#64748b" }}>
              <div style={{ width:10, height:10, borderRadius:2, background:l.color }} />{l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Summary table */}
      <SummaryTable employees={employees} sessions={sessions} idleLogs={idleLogs} />

      {/* Per-employee sections */}
      {timelineEmployees.map((emp, empIdx) => {
        const empSessions = sessions.filter(s  => String(s.employee_id)  === String(emp.id));
        const empIdle     = idleLogs.filter(il => String(il.employee_id) === String(emp.id));
        const empBreaks   = sessionBreaks.filter(b => String(b.employee_id) === String(emp.id));
        const totalMins   = empSessions.reduce((a,s) => a+(Number(s.total_minutes)||0), 0);
        const daysWorked  = dateRange.filter(d => empSessions.some(s => sessionDate(s) === d)).length;

        return (
          <div key={emp.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", marginBottom:24, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            {/* Employee header */}
            <div style={{ padding:"16px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12, background:"#fafafa" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", flexShrink:0, background:COLORS[empIdx%COLORS.length], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:15 }}>
                  {emp.name[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:"#1e293b" }}>{emp.name}</div>
                  <div style={{ fontSize:12, color:"#94a3b8" }}>{emp.department || "Employee"}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:24 }}>
                {[
                  { label:"Total",    value: fmtHM(totalMins),     color:"#3b82f6" },
                  { label:"Days",     value: daysWorked,            color:"#10b981" },
                  { label:"Sessions", value: empSessions.length,    color:"#6366f1" },
                ].map(m => (
                  <div key={m.label} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>{m.label}</div>
                    <div style={{ fontSize:16, fontWeight:700, color:m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Day rows */}
            <div style={{ padding:"0 24px" }}>
              {dateRange.map(date => {
                const daySessions = empSessions.filter(s => sessionDate(s) === date);
                const dayIdle     = empIdle.filter(il => String(il.date||"").slice(0,10) === date || String(il.idle_start||"").slice(0,10) === date);
                const dayBreaks   = empBreaks.filter(b  => String(b.date||"").slice(0,10) === date);
                const appKey      = `${emp.id}__${date}`;
                const dayTopApps  = topApps[appKey] || [];
                const ssRow       = screenshots.find(r => String(r.employee_id)===String(emp.id) && String(r.date||"").slice(0,10)===date);
                return (
                  <DayRow key={date} date={date}
                    sessions={daySessions} idleLogs={dayIdle}
                    sessionBreaks={dayBreaks} dayResetHour={dayResetHour}
                    topApps={dayTopApps} screenshotCount={ssRow?.count || 0}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

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
