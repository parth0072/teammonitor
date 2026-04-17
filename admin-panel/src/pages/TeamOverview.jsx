import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { format, subDays, parseISO } from "date-fns";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtMins(m) {
  if (!m || m <= 0) return "0m";
  const h = Math.floor(m / 60), mn = m % 60;
  return h > 0 ? `${h}h ${mn > 0 ? mn + "m" : ""}`.trim() : `${mn}m`;
}

const DATE_OPTIONS = Array.from({ length: 7 }, (_, i) => {
  const d = subDays(new Date(), i);
  return { label: i === 0 ? "Today" : i === 1 ? "Yesterday" : format(d, "EEE, MMM d"), value: format(d, "yyyy-MM-dd") };
});

function productivityColor(p) {
  if (p >= 70) return { bar: "#10b981", text: "#059669", bg: "#d1fae5" };
  if (p >= 40) return { bar: "#f59e0b", text: "#d97706", bg: "#fef3c7" };
  return { bar: "#ef4444", text: "#dc2626", bg: "#fee2e2" };
}

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#f97316","#ec4899","#84cc16","#a855f7"];

// Build task-centric map from employee data
function buildTaskMap(members) {
  const map = {}; // taskName → { taskName, jiraKey, totalMinutes, employees: [{name, minutes, empIdx}] }
  members.forEach((m, empIdx) => {
    m.tasks.forEach(t => {
      const key = t.task_name;
      if (!map[key]) map[key] = { taskName: t.task_name, jiraKey: t.jira_issue_key, taskId: t.task_id, totalMinutes: 0, employees: [] };
      map[key].totalMinutes += Number(t.minutes) || 0;
      map[key].employees.push({ name: m.name, minutes: Number(t.minutes) || 0, empIdx });
    });
  });
  return Object.values(map).sort((a, b) => b.totalMinutes - a.totalMinutes);
}

// ── Task Detail Modal ─────────────────────────────────────────────────────────

function fmt(dt) {
  if (!dt) return "—";
  try { return format(typeof dt === "string" ? parseISO(dt) : new Date(dt), "h:mm a"); }
  catch { return "—"; }
}

function TaskDetailModal({ task, onClose }) {
  const [sessions, setSessions] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = task.taskId
      ? { taskId: task.taskId }
      : task.jiraKey
        ? { jiraKey: task.jiraKey }
        : { noTask: "1" };
    // No date — fetch full history for this task
    api.getTaskSessions(params)
      .then(d => { setSessions(d.sessions); setLoading(false); })
      .catch(() => setLoading(false));
  }, [task]);

  // Close on Escape
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const empNames = sessions ? [...new Set(sessions.map(s => s.employee_name))] : [];
  const empColor = Object.fromEntries(empNames.map((n, i) => [n, COLORS[i % COLORS.length]]));

  // Timeline: earliest start → latest end
  const earliest = sessions?.length ? new Date(Math.min(...sessions.map(s => new Date(s.punch_in)))) : null;
  const latest   = sessions?.length ? new Date(Math.max(...sessions.map(s => s.punch_out ? new Date(s.punch_out) : new Date()))) : null;
  const spanMs   = earliest && latest ? latest - earliest : 0;

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
               display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"#fff", borderRadius:16, width:"100%", maxWidth:680,
                 maxHeight:"85vh", display:"flex", flexDirection:"column",
                 boxShadow:"0 24px 60px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #e2e8f0",
                      display:"flex", alignItems:"flex-start", gap:14 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"#1e293b",
                        color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:18, flexShrink:0 }}>📋</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#1e293b",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {task.taskName}
            </div>
            {task.jiraKey && (
              <span style={{ fontSize:11, color:"#3b82f6", fontWeight:700, background:"#eff6ff",
                             padding:"2px 7px", borderRadius:4, marginTop:4, display:"inline-block" }}>
                {task.jiraKey}
              </span>
            )}
            {task.taskDescription && (
              <div style={{ fontSize:12, color:"#64748b", marginTop:6, lineHeight:1.5 }}>
                {task.taskDescription}
              </div>
            )}
          </div>
          <button onClick={onClose}
            style={{ background:"#f1f5f9", border:"none", borderRadius:8, width:32, height:32,
                     cursor:"pointer", fontSize:16, color:"#64748b", flexShrink:0,
                     display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:"auto", padding:"20px 24px" }}>
          {loading && <div style={{ textAlign:"center", color:"#94a3b8", padding:40 }}>Loading…</div>}

          {!loading && sessions && (
            <>
              {/* Summary KPIs */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                {[
                  { label:"Total Time",    value: fmtMins(sessions.reduce((s,r) => s + r.total_minutes, 0)), icon:"⏱" },
                  { label:"Contributors", value: empNames.length,                                            icon:"👥" },
                  { label:"Sessions",     value: sessions.length,                                            icon:"📋" },
                ].map(k => (
                  <div key={k.label} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px",
                                              border:"1px solid #e2e8f0", textAlign:"center" }}>
                    <div style={{ fontSize:20 }}>{k.icon}</div>
                    <div style={{ fontSize:18, fontWeight:800, color:"#1e293b", marginTop:4 }}>{k.value}</div>
                    <div style={{ fontSize:11, color:"#64748b" }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Visual timeline bar */}
              {spanMs > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase",
                                letterSpacing:"0.06em", marginBottom:10 }}>Timeline</div>
                  <div style={{ position:"relative" }}>
                    {/* Track */}
                    <div style={{ height:8, background:"#f1f5f9", borderRadius:4, marginBottom:6, position:"relative" }}>
                      {sessions.map((s, i) => {
                        const start = ((new Date(s.punch_in) - earliest) / spanMs) * 100;
                        const end   = (((s.punch_out ? new Date(s.punch_out) : new Date()) - earliest) / spanMs) * 100;
                        return (
                          <div key={i} title={`${s.employee_name}: ${fmt(s.punch_in)} – ${fmt(s.punch_out)}`}
                            style={{ position:"absolute", top:0, bottom:0,
                                     left:`${start}%`, width:`${Math.max(end - start, 1)}%`,
                                     background:empColor[s.employee_name], borderRadius:4, opacity:0.85 }} />
                        );
                      })}
                    </div>
                    {/* Time labels */}
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#94a3b8" }}>
                      <span>{fmt(earliest)}</span>
                      <span>{fmt(latest)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Session rows grouped by date */}
              <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase",
                            letterSpacing:"0.06em", marginBottom:10 }}>All Sessions</div>

              {sessions.length === 0 && (
                <div style={{ textAlign:"center", color:"#94a3b8", padding:40 }}>No sessions found for this task</div>
              )}

              {(() => {
                // Group by date
                const byDate = {};
                for (const s of sessions) {
                  const d = s.date || s.punch_in?.slice(0, 10) || "Unknown";
                  if (!byDate[d]) byDate[d] = [];
                  byDate[d].push(s);
                }
                return Object.entries(byDate).map(([d, rows]) => {
                  const dayTotal = rows.reduce((acc, r) => acc + r.total_minutes, 0);
                  let dayLabel;
                  try {
                    const today = format(new Date(), "yyyy-MM-dd");
                    const yest  = format(subDays(new Date(), 1), "yyyy-MM-dd");
                    dayLabel = d === today ? "Today" : d === yest ? "Yesterday"
                      : format(parseISO(d), "EEE, MMM d yyyy");
                  } catch { dayLabel = d; }

                  return (
                    <div key={d} style={{ marginBottom:16 }}>
                      {/* Date header */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                                    marginBottom:8 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#475569" }}>{dayLabel}</div>
                        <div style={{ fontSize:12, fontWeight:700, color:"#1e293b" }}>{fmtMins(dayTotal)} total</div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                        {rows.map((s, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
                                                background:"#f8fafc", borderRadius:10, padding:"11px 14px",
                                                border:"1px solid #e2e8f0" }}>
                            <div style={{ width:32, height:32, borderRadius:"50%", background:empColor[s.employee_name],
                                          color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                                          fontSize:12, fontWeight:700, flexShrink:0 }}>
                              {s.employee_name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ width:100, fontSize:13, fontWeight:600, color:"#1e293b",
                                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}>
                              {s.employee_name}
                            </div>
                            <div style={{ flex:1, fontSize:13, color:"#374151" }}>
                              <span style={{ fontWeight:600 }}>{fmt(s.punch_in)}</span>
                              <span style={{ color:"#94a3b8", margin:"0 6px" }}>→</span>
                              {s.punch_out
                                ? <span style={{ fontWeight:600 }}>{fmt(s.punch_out)}</span>
                                : <span style={{ color:"#10b981", fontWeight:700 }}>Active now</span>}
                            </div>
                            <div style={{ fontSize:14, fontWeight:800, color:"#1e293b", flexShrink:0 }}>
                              {fmtMins(s.total_minutes)}
                            </div>
                            <div style={{ fontSize:10, fontWeight:700, flexShrink:0, padding:"2px 8px", borderRadius:20,
                                          background: s.status === "active" ? "#d1fae5" : "#f1f5f9",
                                          color:      s.status === "active" ? "#059669" : "#64748b" }}>
                              {s.status === "active" ? "● Active" : "Done"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>

        <div style={{ padding:"14px 24px", borderTop:"1px solid #e2e8f0", textAlign:"right" }}>
          <button onClick={onClose}
            style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"8px 20px",
                     cursor:"pointer", fontSize:13, fontWeight:600, color:"#475569" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ members }) {
  const active   = members.filter(m => m.total_minutes > 0);
  const totalMin = active.reduce((s, m) => s + m.total_minutes, 0);
  const avgProd  = active.length ? Math.round(active.reduce((s, m) => s + m.productive_percent, 0) / active.length) : 0;
  const allTasks = [...new Set(active.flatMap(m => m.tasks.map(t => t.task_name)).filter(t => t !== "No Task"))];
  const pc = productivityColor(avgProd);

  const stats = [
    { label: "Active Today",     value: `${active.length} / ${members.length}`, color: "#3b82f6", bg: "#eff6ff" },
    { label: "Total Hours",      value: fmtMins(totalMin),                      color: "#8b5cf6", bg: "#f5f3ff" },
    { label: "Avg Productivity", value: `${avgProd}%`,                          color: pc.text,   bg: pc.bg    },
    { label: "Unique Tasks",     value: allTasks.length,                        color: "#10b981", bg: "#d1fae5" },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:24 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}22`, borderRadius:10, padding:"14px 18px" }}>
          <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Hours bar chart ───────────────────────────────────────────────────────────

function HoursChart({ members }) {
  if (!members.length) return null;
  const sorted = [...members].sort((a, b) => b.total_minutes - a.total_minutes);
  const max = Math.max(...sorted.map(m => m.total_minutes), 1);
  const target = 8 * 60;

  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:"20px 24px", marginBottom:24 }}>
      <div style={{ fontSize:15, fontWeight:700, color:"#1e293b", marginBottom:18 }}>⏱ Hours Comparison</div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {sorted.map((m, i) => {
          const pct = (m.total_minutes / max) * 100;
          const targetPct = Math.min(100, (target / max) * 100);
          const pc = productivityColor(m.productive_percent);
          return (
            <div key={m.employee_id} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:COLORS[i % COLORS.length],
                            color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:11, fontWeight:700, flexShrink:0 }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ width:110, fontSize:13, fontWeight:600, color:"#1e293b",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}>
                {m.name}
              </div>
              <div style={{ flex:1, height:20, background:"#f1f5f9", borderRadius:6, position:"relative" }}>
                <div style={{ position:"absolute", left:`${targetPct}%`, top:-3, bottom:-3, width:1.5, background:"#cbd5e1", zIndex:2 }} />
                {m.total_minutes > 0 && (
                  <div style={{ height:"100%", width:`${pct}%`, borderRadius:6,
                                background:`linear-gradient(90deg,${COLORS[i%COLORS.length]}bb,${COLORS[i%COLORS.length]})` }} />
                )}
              </div>
              <div style={{ width:52, fontSize:13, fontWeight:700, color: m.total_minutes > 0 ? "#1e293b" : "#94a3b8", textAlign:"right", flexShrink:0 }}>
                {fmtMins(m.total_minutes)}
              </div>
              <div style={{ width:50, fontSize:11, fontWeight:700, color:pc.text, background:pc.bg,
                            borderRadius:20, padding:"2px 6px", textAlign:"center", flexShrink:0 }}>
                {m.productive_percent}%
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop:12, fontSize:11, color:"#94a3b8" }}>Dashed line = 8h target</div>
    </div>
  );
}

// ── By Employee view ──────────────────────────────────────────────────────────

function EmployeeCard({ member, rank }) {
  const pc = productivityColor(member.productive_percent);
  const hasData = member.total_minutes > 0;
  return (
    <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden", opacity: hasData ? 1 : 0.55 }}>
      <div style={{ padding:"14px 16px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc",
                    display:"flex", alignItems:"center", gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:"50%", background:COLORS[(rank-1)%COLORS.length],
                      color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:14, fontWeight:700, flexShrink:0 }}>
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:"#1e293b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{member.name}</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:1 }}>{member.session_count} session{member.session_count !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:18, fontWeight:800, color: hasData ? "#1e293b" : "#94a3b8" }}>{fmtMins(member.total_minutes)}</div>
          {hasData && (
            <div style={{ fontSize:11, fontWeight:700, color:pc.text, background:pc.bg,
                          borderRadius:20, padding:"1px 8px", display:"inline-block", marginTop:2 }}>
              {member.productive_percent}% productive
            </div>
          )}
        </div>
      </div>
      <div style={{ padding:"12px 16px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:8 }}>Tasks</div>
        {!member.tasks.length || !hasData ? (
          <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>No tasks recorded</div>
        ) : (
          <>
            {/* Stacked bar */}
            <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", marginBottom:10, gap:1 }}>
              {member.tasks.map((t, i) => (
                <div key={i} title={`${t.task_name} — ${fmtMins(t.minutes)}`}
                  style={{ flex:t.minutes, background:COLORS[i%COLORS.length], minWidth:2 }} />
              ))}
            </div>
            {member.tasks.map((t, i) => {
              const pct = member.total_minutes > 0 ? Math.round((t.minutes / member.total_minutes) * 100) : 0;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:COLORS[i%COLORS.length], flexShrink:0 }} />
                  <div style={{ flex:1, fontSize:12, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {t.task_name}
                    {t.jira_issue_key && <span style={{ marginLeft:5, fontSize:10, color:"#3b82f6", fontWeight:700 }}>{t.jira_issue_key}</span>}
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#1e293b", flexShrink:0 }}>{fmtMins(t.minutes)}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", flexShrink:0, width:30, textAlign:"right" }}>{pct}%</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── By Task view ──────────────────────────────────────────────────────────────

function TaskView({ members, date, onSelectTask }) {
  const tasks = buildTaskMap(members);
  const maxMin = Math.max(...tasks.map(t => t.totalMinutes), 1);

  if (!tasks.length || tasks.every(t => t.taskName === "No Task")) {
    return (
      <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
        <div style={{ fontSize:48 }}>📋</div>
        <div style={{ marginTop:12, fontSize:16, fontWeight:600, color:"#64748b" }}>No tasks recorded for this date</div>
      </div>
    );
  }

  // Build a colour map per employee name
  const empNames = [...new Set(members.map(m => m.name))];
  const empColor = Object.fromEntries(empNames.map((n, i) => [n, COLORS[i % COLORS.length]]));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {tasks.filter(t => t.taskName !== "No Task" || tasks.length === 1).map((task, ti) => (
        <div key={ti}
          onClick={() => onSelectTask(task)}
          style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, overflow:"hidden",
                   cursor:"pointer", transition:"box-shadow 0.15s, border-color 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor="#3b82f6"; e.currentTarget.style.boxShadow="0 4px 16px rgba(59,130,246,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.boxShadow="none"; }}>
          {/* Task header */}
          <div style={{ padding:"14px 20px", borderBottom:"1px solid #f1f5f9", background:"#f8fafc",
                        display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"#1e293b",
                          color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:14, fontWeight:700, flexShrink:0 }}>
              {ti + 1}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#1e293b",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {task.taskName}
              </div>
              {task.jiraKey && (
                <span style={{ fontSize:11, color:"#3b82f6", fontWeight:700, background:"#eff6ff",
                               padding:"1px 6px", borderRadius:4, marginTop:2, display:"inline-block" }}>
                  {task.jiraKey}
                </span>
              )}
            </div>
            <div style={{ textAlign:"right", flexShrink:0 }}>
              <div style={{ fontSize:18, fontWeight:800, color:"#1e293b" }}>{fmtMins(task.totalMinutes)}</div>
              <div style={{ fontSize:11, color:"#64748b" }}>{task.employees.length} contributor{task.employees.length !== 1 ? "s" : ""}</div>
              <div style={{ fontSize:10, color:"#3b82f6", marginTop:3 }}>↗ View details</div>
            </div>
          </div>

          {/* Overall time bar */}
          <div style={{ padding:"14px 20px 0" }}>
            <div style={{ display:"flex", height:10, borderRadius:5, overflow:"hidden", marginBottom:14, gap:1 }}>
              {task.employees.map((e, i) => (
                <div key={i} title={`${e.name}: ${fmtMins(e.minutes)}`}
                  style={{ flex:e.minutes, background:empColor[e.name], minWidth:3 }} />
              ))}
            </div>

            {/* Per-employee breakdown */}
            {task.employees.map((emp, i) => {
              const pct = task.totalMinutes > 0 ? Math.round((emp.minutes / task.totalMinutes) * 100) : 0;
              const barW = (emp.minutes / maxMin) * 100;
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                  {/* Avatar */}
                  <div style={{ width:26, height:26, borderRadius:"50%", background:empColor[emp.name],
                                color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                                fontSize:10, fontWeight:700, flexShrink:0 }}>
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Name */}
                  <div style={{ width:100, fontSize:13, fontWeight:600, color:"#374151",
                                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flexShrink:0 }}>
                    {emp.name}
                  </div>
                  {/* Bar */}
                  <div style={{ flex:1, height:16, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${barW}%`, background:empColor[emp.name],
                                  borderRadius:4, opacity:0.85 }} />
                  </div>
                  {/* Time */}
                  <div style={{ width:52, fontSize:13, fontWeight:700, color:"#1e293b", textAlign:"right", flexShrink:0 }}>
                    {fmtMins(emp.minutes)}
                  </div>
                  {/* Pct */}
                  <div style={{ width:36, fontSize:11, color:"#94a3b8", textAlign:"right", flexShrink:0 }}>
                    {pct}%
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ height:6 }} />
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamOverview() {
  const [date,         setDate]         = useState(DATE_OPTIONS[0].value);
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState("tasks"); // "tasks" | "employees"
  const [selectedTask, setSelectedTask] = useState(null);
  const autoRef = useRef(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    try { setData(await api.getTeamOverview(d)); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  useEffect(() => {
    clearInterval(autoRef.current);
    if (date === DATE_OPTIONS[0].value) autoRef.current = setInterval(() => load(date), 60_000);
    return () => clearInterval(autoRef.current);
  }, [date, load]);

  const members = data?.members || [];
  const active  = members.filter(m => m.total_minutes > 0);

  const tabStyle = (t) => ({
    padding:"8px 20px", fontSize:13, fontWeight:600, border:"none", borderRadius:8,
    cursor:"pointer",
    background: tab === t ? "#1e293b" : "#f1f5f9",
    color:      tab === t ? "#fff"    : "#64748b",
  });

  return (
    <div style={{ width:"100%" }}>
      {/* Top bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:700, color:"#1e293b", margin:0 }}>Team Overview</h1>
          <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>
            Hours & task breakdown per employee
            {date === DATE_OPTIONS[0].value && <span style={{ marginLeft:8, color:"#10b981" }}>· auto-refreshing</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <select value={date} onChange={e => setDate(e.target.value)}
            style={{ padding:"8px 14px", border:"1.5px solid #e2e8f0", borderRadius:8,
                     fontSize:14, background:"#fff", cursor:"pointer" }}>
            {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => load(date)}
            style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:8,
                     padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600 }}>↻</button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>Loading…</div>
      )}

      {data && (
        <>
          <SummaryStrip members={members} />
          <HoursChart members={members} />

          {/* Tabs */}
          <div style={{ display:"flex", gap:8, marginBottom:20 }}>
            <button style={tabStyle("tasks")}     onClick={() => setTab("tasks")}>📋 By Task</button>
            <button style={tabStyle("employees")} onClick={() => setTab("employees")}>👤 By Employee</button>
          </div>

          {active.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
              <div style={{ fontSize:48 }}>📭</div>
              <div style={{ marginTop:12, fontSize:16, fontWeight:600, color:"#64748b" }}>No tracked time for this date</div>
            </div>
          ) : tab === "tasks" ? (
            <TaskView members={active} date={date} onSelectTask={setSelectedTask} />
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
              {[...members].sort((a, b) => b.total_minutes - a.total_minutes).map((m, i) => (
                <EmployeeCard key={m.employee_id} member={m} rank={i + 1} />
              ))}
            </div>
          )}
        </>
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
