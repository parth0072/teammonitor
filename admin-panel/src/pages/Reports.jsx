import React, { useState, useEffect } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { format, subDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];
const fmtDur = s => { s = Math.round(Number(s)||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const fmtHM  = m => { m = Math.round(Number(m)||0); const h=Math.floor(m/60),mn=m%60; return `${h}h ${String(mn).padStart(2,"0")}m`; };
import { fmtTime } from "../tz";

const PRESETS = [
  { label:"Today",      days:0 },
  { label:"Yesterday",  days:1 },
  { label:"Last 7 days",days:7 },
];

const S = {
  title:    { fontSize:26, fontWeight:700, color:"#1e293b", margin:0 },
  sub:      { color:"#64748b", fontSize:14, marginTop:4, marginBottom:28 },
  toolbar:  { display:"flex", alignItems:"center", gap:12, marginBottom:24, flexWrap:"wrap" },
  dateInput:{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#374151", background:"#fff" },
  select:   { border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#374151", background:"#fff" },
  preset:   (a) => ({ background:a?"#3b82f6":"#fff", color:a?"#fff":"#374151", border:"1px solid "+(a?"#3b82f6":"#e2e8f0"), borderRadius:8, padding:"8px 14px", cursor:"pointer", fontSize:13, fontWeight:500 }),
  grid4:    { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 },
  row2:     { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 },
  card:     { background:"#fff", borderRadius:12, padding:24, border:"1px solid #e2e8f0" },
  cardTitle:{ fontSize:15, fontWeight:600, color:"#1e293b", marginBottom:16 },
  table:    { width:"100%", borderCollapse:"collapse" },
  th:       { textAlign:"left", fontSize:12, color:"#64748b", fontWeight:600, padding:"8px 12px 8px 0", borderBottom:"1px solid #e2e8f0" },
  td:       { padding:"10px 12px 10px 0", fontSize:13, borderBottom:"1px solid #f1f5f9", color:"#374151" },
  tag:      (c) => ({ fontSize:11, padding:"3px 8px", borderRadius:20, background:c+"20", color:c, fontWeight:600 }),
  empty:    { color:"#94a3b8", fontSize:14, textAlign:"center", padding:"40px 0" },
};

function StatCard({ label, value, color, icon, sub }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize:13, color:"#64748b", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{ fontSize:18 }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize:28, fontWeight:700, color }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:"#9ca3af", marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// Custom pie label renderer - shows inside or as external label safely
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 24;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#374151" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={11}>
      {name.length > 12 ? name.slice(0,12) + "…" : name} {(percent * 100).toFixed(0)}%
    </text>
  );
};

// ── Day Timeline ──────────────────────────────────────────────────────────────
function DayTimeline({ sessions = [], breaks = [], workPattern }) {
  const totalNetMins = sessions.reduce((s, r) => s + (Number(r.total_minutes) || 0), 0);
  const totalBrkMins = breaks.reduce((s, b) => s + (Number(b.minutes) || 0), 0);
  const firstIn  = workPattern?.first_punch_in;
  const lastOut  = workPattern?.last_punch_out;
  const grossMins = firstIn && lastOut
    ? Math.round((new Date(lastOut) - new Date(firstIn)) / 60000) : null;

  // Build sorted interleaved list
  const items = [
    ...sessions.map(s => ({ type:"session", sort: s.punch_in ? new Date(s.punch_in).getTime() : 0, data:s })),
    ...breaks.map(b  => ({ type:"break",   sort: b.start    ? new Date(b.start).getTime()    : 0, data:b })),
  ].sort((a, b) => a.sort - b.sort);

  if (items.length === 0) {
    return (
      <div style={{ ...S.card, marginBottom:24, overflow:"hidden" }}>
        <div style={{ padding:"20px 24px", borderBottom:"1px solid #f1f5f9" }}>
          <div style={S.cardTitle}>Day Timeline</div>
        </div>
        <div style={S.empty}>No sessions recorded for this day.</div>
      </div>
    );
  }

  // Gantt bar helpers
  const spanStart = firstIn  ? new Date(firstIn).getTime()  : null;
  const spanEnd   = lastOut  ? new Date(lastOut).getTime()
    : sessions.find(s => !s.punch_out) ? Date.now() : null;
  const spanMs = spanStart && spanEnd ? spanEnd - spanStart : null;
  const toPct  = ts  => spanMs ? ((new Date(ts).getTime() - spanStart) / spanMs * 100) : 0;
  const durPct = (a, b) => spanMs ? ((new Date(b).getTime() - new Date(a).getTime()) / spanMs * 100) : 0;

  return (
    <div style={{ ...S.card, marginBottom:24, padding:0, overflow:"hidden" }}>

      {/* ── Header + summary metrics ── */}
      <div style={{ padding:"20px 24px 18px", borderBottom:"1px solid #f1f5f9" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#1e293b" }}>Day Timeline</div>
          <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
            {[
              { label:"Net Tracked", value: fmtHM(totalNetMins), color:"#10b981" },
              breaks.length > 0 ? { label:`${breaks.length} Break${breaks.length>1?"s":""}`, value: fmtHM(totalBrkMins), color:"#f59e0b" } : null,
              grossMins != null ? { label:"Wall Clock", value: fmtHM(grossMins), color:"#6366f1" } : null,
              firstIn  ? { label:"First In",  value: format(new Date(firstIn),  "h:mm a"), color:"#3b82f6" } : null,
              lastOut  ? { label:"Last Out",  value: format(new Date(lastOut),  "h:mm a"), color:"#64748b" } : null,
            ].filter(Boolean).map(m => (
              <div key={m.label} style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>{m.label}</div>
                <div style={{ fontSize:15, fontWeight:700, color:m.color }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Proportional Gantt bar ── */}
      {spanMs && (
        <div style={{ padding:"14px 24px 10px", background:"#f8fafc", borderBottom:"1px solid #f1f5f9" }}>
          <div style={{ position:"relative", height:22, background:"#e2e8f0", borderRadius:6, overflow:"hidden" }}>
            {/* Break gaps (render first so sessions sit on top) */}
            {breaks.map((b, i) => b.start && b.end && (
              <div key={"bg"+i} style={{
                position:"absolute", top:0, height:"100%",
                left:`${toPct(b.start)}%`,
                width:`${Math.max(durPct(b.start, b.end), 0.3)}%`,
                background:"rgba(245,158,11,0.15)",
              }} />
            ))}
            {/* Session blocks — green bar ends at last_heartbeat_at for active sessions */}
            {sessions.map((s, i) => {
              if (!s.punch_in) return null;
              const isActive = !s.punch_out;
              const left = toPct(s.punch_in);
              // For active sessions stop the coloured bar at last heartbeat (not "now"),
              // so the lid-close gap shows as amber below rather than solid orange.
              const workedEnd = isActive && s.last_heartbeat_at
                ? toPct(s.last_heartbeat_at)
                : s.punch_out ? toPct(s.punch_out) : 100;
              const w = Math.max(workedEnd - left, 0.4);
              return (
                <div key={i} style={{
                  position:"absolute", top:0, height:"100%",
                  left:`${left}%`, width:`${w}%`,
                  background: isActive
                    ? "linear-gradient(90deg,#10b981,#34d399)"
                    : "linear-gradient(90deg,#10b981,#34d399)",
                  borderRadius:4,
                  cursor:"default",
                  zIndex:1,
                }}
                  title={`${s.punch_in ? format(new Date(s.punch_in),"h:mm a") : "?"} → ${s.punch_out ? format(new Date(s.punch_out),"h:mm a") : "now"} · ${fmtHM(Number(s.total_minutes)||0)} tracked`}
                />
              );
            })}
            {/* Lid-close / away segments — amber from last_heartbeat_at → now */}
            {sessions.map((s, i) => {
              if (!s.punch_in || s.punch_out || !s.last_heartbeat_at) return null;
              const hbAge = (Date.now() - new Date(s.last_heartbeat_at).getTime()) / 60000;
              if (hbAge < 6) return null; // heartbeat is fresh — normal 5-min interval, no away segment
              const left = toPct(s.last_heartbeat_at);
              const w    = Math.max(100 - left, 0.4);
              return (
                <div key={`away-${i}`} style={{
                  position:"absolute", top:0, height:"100%",
                  left:`${left}%`, width:`${w}%`,
                  background:"linear-gradient(90deg,#fcd34d,#fbbf24)",
                  borderRadius:4,
                  cursor:"default",
                  zIndex:1,
                }}
                  title={`Lid closed / away since ${format(new Date(s.last_heartbeat_at),"h:mm a")} (${Math.round(hbAge)}m ago)`}
                />
              );
            })}
          </div>
          {/* Axis labels */}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
            {firstIn && <span style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{format(new Date(firstIn),"h:mm a")}</span>}
            {spanEnd  && <span style={{ fontSize:10, color:"#94a3b8", fontFamily:"monospace" }}>{format(new Date(spanEnd), "h:mm a")}</span>}
          </div>
        </div>
      )}

      {/* ── Session / break list ── */}
      <div>
        {items.map((item, i) => {
          if (item.type === "session") {
            const s        = item.data;
            const netMins  = Number(s.total_minutes) || 0;
            const wallMins = s.punch_in && s.punch_out
              ? Math.round((new Date(s.punch_out) - new Date(s.punch_in)) / 60000) : null;
            // idleMins removed — wall−tracked ≠ idle (includes lunch, pauses, etc.)
            const isActive = !s.punch_out;
            const heartbeatAgeMin = s.last_heartbeat_at
              ? (Date.now() - new Date(s.last_heartbeat_at).getTime()) / 60000 : 999;
            // Away = no heartbeat for 2+ min OR agent explicitly flagged idle (e.g. lid close)
            const isAway   = isActive && (heartbeatAgeMin > 2 || !!s.is_idle);
            const hbAgoStr = s.last_heartbeat_at
              ? heartbeatAgeMin < 1   ? "just now"
              : heartbeatAgeMin < 60  ? `${Math.round(heartbeatAgeMin)}m ago`
              : `${Math.round(heartbeatAgeMin / 60)}h ago`
              : null;
            const brkList  = Array.isArray(s.breaks) ? s.breaks : [];
            const brkMins  = brkList.reduce((acc, b) => {
              if (!b.start || !b.end) return acc;
              return acc + Math.round((new Date(b.end) - new Date(b.start)) / 60000);
            }, 0);

            return (
              <div key={i} style={{
                display:"flex", gap:0,
                borderBottom:"1px solid #f8fafc",
                borderLeft:`3px solid ${isAway ? "#94a3b8" : isActive ? "#f59e0b" : "#10b981"}`,
              }}>
                {/* Time column */}
                <div style={{ width:120, flexShrink:0, padding:"14px 12px 14px 16px", borderRight:"1px solid #f1f5f9" }}>
                  <div style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#1e293b" }}>
                    {s.punch_in ? format(new Date(s.punch_in), "h:mm a") : "?"}
                  </div>
                  <div style={{ fontSize:10, color:"#94a3b8", margin:"2px 0 0" }}>↓</div>
                  <div style={{ fontFamily:"monospace", fontSize:12, color: isAway ? "#94a3b8" : isActive ? "#f59e0b" : "#64748b", fontWeight: isActive ? 600 : 400 }}>
                    {isAway ? "◌ away" : isActive ? "● now" : s.punch_out ? format(new Date(s.punch_out), "h:mm a") : "—"}
                  </div>
                </div>

                {/* Main content */}
                <div style={{ flex:1, padding:"14px 20px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                    <span style={{ fontSize:14, fontWeight:700, color: isActive ? "#f59e0b" : "#10b981" }}>
                      {fmtHM(netMins)}
                    </span>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>tracked</span>
                    {wallMins != null && wallMins !== netMins && (
                      <span style={{ fontSize:11, color:"#cbd5e1" }}>·</span>
                    )}
                    {wallMins != null && wallMins !== netMins && (
                      <span style={{ fontSize:11, color:"#94a3b8" }}>{fmtHM(wallMins)} wall</span>
                    )}
                    {brkList.length > 0 && (
                      <span style={{ fontSize:11, background:"#fff7ed", color:"#c2410c", borderRadius:20, padding:"1px 8px", fontWeight:600 }}>
                        {brkList.length} break{brkList.length > 1 ? "s" : ""}{brkMins > 0 ? ` · ${brkMins}m` : ""}
                      </span>
                    )}
                    {isActive && (
                      isAway
                        ? <span style={{ fontSize:11, background:"#f1f5f9", color:"#64748b", borderRadius:20, padding:"1px 8px", fontWeight:700 }}>◌ Away</span>
                        : <span style={{ fontSize:11, background:"#fef9c3", color:"#854d0e", borderRadius:20, padding:"1px 8px", fontWeight:700 }}>● Active</span>
                    )}
                  </div>

                  {(s.task_name || s.jira_issue_key) && (
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {s.task_name      && <span style={{ background:"#eff6ff", color:"#1d4ed8", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{s.task_name}</span>}
                      {s.jira_issue_key && <span style={{ background:"#f0f9ff", color:"#0369a1", borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:600 }}>{s.jira_issue_key}</span>}
                    </div>
                  )}
                  {/* Last heartbeat — only shown on active session for connectivity debugging */}
                  {isActive && hbAgoStr && (
                    <div style={{ marginTop:4, fontSize:10, color: heartbeatAgeMin > 6 ? "#ef4444" : "#94a3b8" }}>
                      ⟳ last heartbeat {format(new Date(s.last_heartbeat_at), "h:mm a")} ({hbAgoStr}){s.is_idle ? " · idle" : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // Inter-session break row
          const b = item.data;
          return (
            <div key={i} style={{
              display:"flex", gap:0,
              background:"#fffbeb",
              borderBottom:"1px solid #fef3c7",
              borderLeft:"3px solid #fde68a",
            }}>
              <div style={{ width:120, flexShrink:0, padding:"8px 12px 8px 16px", borderRight:"1px solid #fef3c7" }}>
                {b.start && (
                  <div style={{ fontFamily:"monospace", fontSize:11, color:"#b45309" }}>
                    {format(new Date(b.start), "h:mm a")}
                  </div>
                )}
                {b.end && (
                  <div style={{ fontFamily:"monospace", fontSize:11, color:"#b45309" }}>
                    {format(new Date(b.end), "h:mm a")}
                  </div>
                )}
              </div>
              <div style={{ flex:1, padding:"8px 20px", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:14 }}>☕</span>
                <span style={{ fontSize:12, fontWeight:600, color:"#92400e" }}>Break</span>
                <span style={{ fontSize:12, color:"#b45309" }}>{Number(b.minutes) || 0} min</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Reports() {
  const [date,       setDate]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [employeeId, setEmployeeId] = useState("all");
  const [employees,  setEmployees]  = useState([]);
  const [sessions,   setSessions]   = useState([]);
  const [appSummary, setAppSummary] = useState([]);
  const [activity,   setActivity]   = useState([]);
  const [weekStats,  setWeekStats]  = useState([]);
  const [loading,    setLoading]    = useState(false);

  const [dailyReport,    setDailyReport]    = useState(null);
  const [reportLoading,  setReportLoading]  = useState(false);
  const [empWeekStats,   setEmpWeekStats]   = useState([]);
  const [teamReport,     setTeamReport]     = useState(null);
  const [teamLoading,    setTeamLoading]    = useState(false);

  // Chatbot
  const [chatOpen,    setChatOpen]    = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput,   setChatInput]   = useState("");
  const [chatSending, setChatSending] = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [manualEmpId,setManualEmpId]= useState("");
  const [manualForm, setManualForm] = useState({ date:"", startTime:"09:00", endTime:"10:00", note:"" });
  const [manualMsg,  setManualMsg]  = useState("");

  // Slack digest
  const { user } = useAuth();
  const [slackDate,       setSlackDate]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [slackSending,    setSlackSending]    = useState(false);
  const [slackResult,     setSlackResult]     = useState(null);
  const [slackPreview,    setSlackPreview]    = useState(null);  // { date, previews[] }
  const [previewLoading,  setPreviewLoading]  = useState(false);

  // Teams digest
  const [teamsDate,    setTeamsDate]    = useState(format(new Date(), "yyyy-MM-dd"));
  const [teamsSending, setTeamsSending] = useState(false);
  const [teamsResult,  setTeamsResult]  = useState(null);

  useEffect(() => { api.getEmployees().then(setEmployees); }, []);
  useEffect(() => { loadData(); }, [date, employeeId]);
  useEffect(() => {
    if (employeeId === "all") { setDailyReport(null); setEmpWeekStats([]); return; }
    setReportLoading(true); setDailyReport(null);
    Promise.all([
      api.getDailyReport(employeeId, date),
      api.getEmployeeStats(employeeId, 7).catch(() => []),
    ]).then(([rpt, stats]) => {
      setDailyReport(rpt);
      setEmpWeekStats(Array.isArray(stats) ? stats : []);
    }).catch(() => {}).finally(() => setReportLoading(false));
  }, [employeeId, date]);

  useEffect(() => {
    if (employeeId !== "all") { setTeamReport(null); return; }
    setTeamLoading(true); setTeamReport(null);
    api.getTeamReport(date)
      .then(setTeamReport).catch(() => {}).finally(() => setTeamLoading(false));
  }, [employeeId, date]);

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    const newHistory = [...chatHistory, { role: "user", content: msg }];
    setChatHistory(newHistory);
    setChatInput("");
    setChatSending(true);
    try {
      const empId = employeeId === "all" ? null : employeeId;
      const { reply } = await api.sendChatMessage(msg, date, empId, chatHistory);
      setChatHistory([...newHistory, { role: "assistant", content: reply }]);
    } catch { setChatHistory([...newHistory, { role: "assistant", content: "Sorry, something went wrong." }]); }
    setChatSending(false);
  }

  async function loadData() {
    setLoading(true);
    try {
      const empId = employeeId === "all" ? undefined : employeeId;
      const [sess, apps, act, stats] = await Promise.all([
        api.getSessions(date),
        api.getActivitySummary(date, empId),
        api.getActivity(date, empId),
        api.getSessionStats(7),
      ]);
      setSessions(empId ? sess.filter(s => String(s.employee_id) === empId) : sess);
      // Cast SUM() strings to numbers to fix MySQL string concatenation bug
      setAppSummary(apps.map(a => ({ ...a, total_seconds: Number(a.total_seconds) || 0 })));
      setActivity(act);
      setWeekStats(stats.map(r => ({
        day:   format(new Date(r.date.slice(0,10)+"T00:00:00"), "EEE M/d"),
        hours: +((Number(r.total_minutes)||0) / 60).toFixed(1),
      })));
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  const totalMins = sessions.reduce((a, s) => a + (Number(s.total_minutes) || 0), 0);
  const totalSecs = appSummary.reduce((a, r) => a + r.total_seconds, 0);
  const activeNow = sessions.filter(s => s.status === "active").length;
  const activeSess = sessions.filter(s => s.total_minutes > 0);
  const avgSession = activeSess.length > 0 ? Math.round(activeSess.reduce((a,s) => a + (Number(s.total_minutes)||0), 0) / activeSess.length) : 0;
  const longestSess = sessions.reduce((max, s) => Math.max(max, Number(s.total_minutes)||0), 0);

  // Hours per employee (for all-employees view)
  const empHours = employees.map(emp => {
    const mins = sessions.filter(s => String(s.employee_id) === String(emp.id))
                         .reduce((a, s) => a + (Number(s.total_minutes)||0), 0);
    return { name: emp.name.split(" ")[0], mins, hours: +(mins/60).toFixed(1) };
  }).filter(e => e.mins > 0).sort((a,b) => b.mins - a.mins);

  // Hourly buckets
  const hourBuckets = Array.from({ length: 24 }, (_, h) => {
    const secs = activity.filter(a => a.start_time && new Date(a.start_time).getHours() === h)
                         .reduce((sum, a) => sum + (Number(a.duration_seconds)||0), 0);
    return { hour: `${String(h).padStart(2,"0")}:00`, secs };
  });

  // Top 6 apps for pie chart
  const pieData = appSummary.slice(0,7).map(a => ({ name: a.app_name, value: a.total_seconds }));

  async function submitManual(e) {
    e.preventDefault(); setManualMsg("");
    try {
      await api.createManualEntry({ employeeId: manualEmpId, ...manualForm });
      setManualMsg("✓ Entry saved");
      setTimeout(() => { setShowManual(false); setManualMsg(""); loadData(); }, 1200);
    } catch(err) { setManualMsg("✗ " + err.message); }
  }

  return (
    <div>
      <h1 style={S.title}>Reports</h1>
      <p style={S.sub}>Activity, time tracking and app usage reports</p>

      {/* Toolbar */}
      <div style={S.toolbar}>
        {PRESETS.map(p => (
          <button key={p.label} style={S.preset(date === format(subDays(new Date(), p.days), "yyyy-MM-dd"))}
            onClick={() => setDate(format(subDays(new Date(), p.days), "yyyy-MM-dd"))}>
            {p.label}
          </button>
        ))}
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.dateInput} />
        <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={S.select}>
          <option value="all">All Employees</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <button onClick={() => { setManualForm({ ...manualForm, date }); setManualEmpId(employees[0]?.id || ""); setShowManual(true); }}
          style={{ background:"#1e293b", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:600 }}>
          + Manual Entry
        </button>
        {loading && <span style={{ color:"#94a3b8", fontSize:13 }}>Loading…</span>}
      </div>

      {/* Stat cards */}
      <div style={S.grid4}>
        <StatCard label="Total Time"      value={fmtHM(totalMins)}    color="#3b82f6" icon="⏱" sub={`${sessions.length} session${sessions.length !== 1?"s":""}`} />
        <StatCard label="Active Now"      value={activeNow}            color="#16a34a" icon="🟢" />
        <StatCard label="Apps Used"       value={appSummary.length}    color="#8b5cf6" icon="💻" />
        <StatCard label="Activity Events" value={activity.length}      color="#f59e0b" icon="📊" />
      </div>

      {/* Session metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Avg Session"   value={fmtHM(avgSession)}    color="#0f766e" icon="⏲" sub="per session today" />
        <StatCard label="Longest Session" value={fmtHM(longestSess)} color="#7c3aed" icon="🏆" sub="today's peak" />
        <StatCard label="Total App Time"  value={fmtDur(totalSecs)}  color="#be185d" icon="🖥" sub="from activity logs" />
      </div>

      {/* ── Daily Report (single-employee view) ── */}
      {employeeId !== "all" && (
        reportLoading
          ? <div style={{ color:"#94a3b8", fontSize:13, marginBottom:24 }}>Loading report…</div>
          : dailyReport && (
            <>
              {/* AI Summary */}
              {dailyReport.ai_summary && (
                <div style={{ ...S.card, marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                    <div style={S.cardTitle}>✨ AI Summary</div>
                    <div style={{
                      background: dailyReport.ai_summary.focusScore >= 7 ? "#d1fae5" : dailyReport.ai_summary.focusScore >= 4 ? "#fef9c3" : "#fee2e2",
                      color:      dailyReport.ai_summary.focusScore >= 7 ? "#065f46" : dailyReport.ai_summary.focusScore >= 4 ? "#854d0e" : "#991b1b",
                      borderRadius:20, padding:"4px 14px", fontSize:13, fontWeight:700
                    }}>Focus {dailyReport.ai_summary.focusScore}/10</div>
                  </div>
                  <p style={{ fontSize:14, color:"#1e293b", marginBottom:12, lineHeight:1.6 }}>{dailyReport.ai_summary.summary}</p>
                  {dailyReport.ai_summary.insights && (
                    <p style={{ fontSize:13, color:"#475569", lineHeight:1.7, marginBottom:8 }}>{dailyReport.ai_summary.insights}</p>
                  )}
                  <div style={{ display:"flex", gap:16, marginTop:4, flexWrap:"wrap" }}>
                    {dailyReport.ai_summary.topAppText && <span style={{ fontSize:13, color:"#64748b" }}>{dailyReport.ai_summary.topAppText}</span>}
                    {dailyReport.ai_summary.peakText   && <span style={{ fontSize:13, color:"#64748b" }}>{dailyReport.ai_summary.peakText}</span>}
                  </div>
                </div>
              )}

              {/* 7-Day Pattern Analysis */}
              {dailyReport.pattern && typeof dailyReport.pattern === 'object' &&
               typeof dailyReport.pattern.trend === 'string' && (
                <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:12, padding:"20px 24px", marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:"#0369a1" }}>📊 7-Day Pattern Analysis</div>
                    <div style={{ fontSize:11, color:"#7dd3fc", background:"#e0f2fe", borderRadius:20, padding:"2px 10px", fontWeight:600 }}>AI</div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    {typeof dailyReport.pattern.trend === 'string' && dailyReport.pattern.trend && (
                      <div style={{ background:"#fff", borderRadius:8, padding:"12px 16px", border:"1px solid #e0f2fe" }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#7dd3fc", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>Weekly Trend</div>
                        <div style={{ fontSize:13, color:"#1e293b", lineHeight:1.5 }}>{dailyReport.pattern.trend}</div>
                      </div>
                    )}
                    {typeof dailyReport.pattern.bestDay === 'string' && dailyReport.pattern.bestDay && (
                      <div style={{ background:"#fff", borderRadius:8, padding:"12px 16px", border:"1px solid #e0f2fe" }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#7dd3fc", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>Best Time</div>
                        <div style={{ fontSize:13, color:"#1e293b", lineHeight:1.5 }}>{dailyReport.pattern.bestDay}</div>
                      </div>
                    )}
                    {typeof dailyReport.pattern.insight === 'string' && dailyReport.pattern.insight && (
                      <div style={{ background:"#fff", borderRadius:8, padding:"12px 16px", border:"1px solid #e0f2fe" }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#7dd3fc", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>💡 Tip</div>
                        <div style={{ fontSize:13, color:"#1e293b", lineHeight:1.5 }}>{dailyReport.pattern.insight}</div>
                      </div>
                    )}
                    {typeof dailyReport.pattern.encouragement === 'string' && dailyReport.pattern.encouragement && (
                      <div style={{ background:"#eff6ff", borderRadius:8, padding:"12px 16px", border:"1px solid #bfdbfe" }}>
                        <div style={{ fontSize:11, fontWeight:600, color:"#7dd3fc", textTransform:"uppercase", letterSpacing:.5, marginBottom:5 }}>✨ Note</div>
                        <div style={{ fontSize:13, color:"#0369a1", fontStyle:"italic", lineHeight:1.5 }}>{dailyReport.pattern.encouragement}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Day Timeline — full-width vertical punch log */}
              <DayTimeline
                sessions={dailyReport.punch_log || []}
                breaks={dailyReport.breaks || []}
                workPattern={dailyReport.work_pattern}
              />

              {/* Work Pattern + Productive Hours — side by side */}
              <div style={{ ...S.row2, marginBottom:24 }}>
                {/* Work Pattern */}
                {dailyReport.work_pattern && (
                  <div style={S.card}>
                    <div style={S.cardTitle}>📈 Work Pattern</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                      {[
                        { label:"First Punch",     value: dailyReport.work_pattern.first_punch_in             ? format(new Date(dailyReport.work_pattern.first_punch_in),  "h:mm a") : "—" },
                        { label:"Last Punch",      value: dailyReport.work_pattern.last_punch_out             ? format(new Date(dailyReport.work_pattern.last_punch_out), "h:mm a") : "—" },
                        { label:"Avg Session",     value: dailyReport.work_pattern.avg_session_minutes        ? `${dailyReport.work_pattern.avg_session_minutes}m`           : "—" },
                        { label:"Longest Session", value: dailyReport.work_pattern.longest_session_minutes    ? `${Math.floor(dailyReport.work_pattern.longest_session_minutes/60)}h ${dailyReport.work_pattern.longest_session_minutes%60}m` : "—" },
                        { label:"Total Sessions",  value: dailyReport.work_pattern.total_sessions ?? "—" },
                      ].map(stat => (
                        <div key={stat.label} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 14px" }}>
                          <div style={{ fontSize:11, color:"#64748b", marginBottom:3 }}>{stat.label}</div>
                          <div style={{ fontSize:18, fontWeight:700, color:"#1e293b" }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    {dailyReport.peak_hours?.length > 0 && (
                      <div style={{ marginTop:16 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>Peak Hours</div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {dailyReport.peak_hours.map((p, i) => (
                            <span key={i} style={{ background:"#eff6ff", color:"#1d4ed8", borderRadius:6, padding:"4px 12px", fontSize:12, fontWeight:600 }}>
                              {String(p.hour).padStart(2,"0")}:00 · {p.active_minutes}m
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Productive Hours bar */}
                {dailyReport.productive_hours && (
                  <div style={S.card}>
                    <div style={S.cardTitle}>📊 Productive Hours — 24h</div>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:2, height:110, overflow:"hidden" }}>
                      {dailyReport.productive_hours.map((h, i) => {
                        const mins = Math.min(h.active_minutes ?? 0, 60);
                        return (
                          <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
                            <div style={{
                              width:"100%",
                              background: mins > 30 ? "#3b82f6" : mins > 0 ? "#bfdbfe" : "#f1f5f9",
                              height: Math.max(2, (mins / 60) * 96),
                              borderRadius:"3px 3px 0 0",
                            }} />
                            {i % 6 === 0 && <div style={{ fontSize:9, color:"#94a3b8", marginTop:2 }}>{String(i).padStart(2,"0")}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Patterns */}
              {(dailyReport.breaks || dailyReport.productive_hours) && (() => {
                const breaks      = dailyReport.breaks || [];
                const hours       = dailyReport.productive_hours || [];
                const totalBreaks = breaks.length;
                const totalBrkMin = breaks.reduce((s, b) => s + b.minutes, 0);
                const avgBrkMin   = totalBreaks ? Math.round(totalBrkMin / totalBreaks) : 0;
                const microBreaks = breaks.filter(b => b.minutes < 5).length;
                const longBreaks  = breaks.filter(b => b.minutes > 30).length;
                const totalActive = hours.reduce((s, h) => s + (h.active_minutes||0), 0);
                const avgWorkSlot = Math.round(totalActive / (totalBreaks + 1));
                const morning     = hours.slice(6,  12).reduce((s, h) => s + (h.active_minutes||0), 0);
                const afternoon   = hours.slice(12, 17).reduce((s, h) => s + (h.active_minutes||0), 0);
                const evening     = hours.slice(17, 22).reduce((s, h) => s + (h.active_minutes||0), 0);
                const todMax      = Math.max(morning, afternoon, evening, 1);
                let cvPct = null;
                if (empWeekStats.length >= 2) {
                  const mins = empWeekStats.map(r => Number(r.total_minutes)||0).filter(m => m > 0);
                  if (mins.length >= 2) {
                    const avg = mins.reduce((s,m)=>s+m,0)/mins.length;
                    const sd  = Math.sqrt(mins.reduce((s,m)=>s+(m-avg)**2,0)/mins.length);
                    cvPct = Math.round(sd/avg*100);
                  }
                }
                const consistencyLabel = cvPct === null ? null
                  : cvPct < 15 ? { text:"Very consistent", color:"#d1fae5", fg:"#065f46" }
                  : cvPct < 30 ? { text:"Moderate fluctuation", color:"#fef9c3", fg:"#854d0e" }
                  :              { text:"High fluctuation", color:"#fee2e2", fg:"#991b1b" };
                const shortSessions = (dailyReport.punch_log||[]).filter(s =>
                  s.duration_minutes && s.duration_minutes < 15 && s.punch_out
                ).length;
                return (
                  <div style={{ ...S.card, marginBottom:24 }}>
                    <div style={S.cardTitle}>🔍 Patterns</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:12, marginBottom:20 }}>
                      {[
                        { label:"Total Breaks",      value: totalBreaks || "—" },
                        { label:"Avg Break",          value: avgBrkMin ? `${avgBrkMin}m` : "—" },
                        { label:"Total Break Time",   value: totalBrkMin ? fmtHM(totalBrkMin) : "—" },
                        { label:"Micro-breaks (<5m)", value: microBreaks || "—" },
                        { label:"Long breaks (>30m)", value: longBreaks || "—" },
                        { label:"Avg Work / Break",   value: avgWorkSlot ? `${avgWorkSlot}m` : "—" },
                      ].map(stat => (
                        <div key={stat.label} style={{ background:"#f8fafc", borderRadius:8, padding:"12px 14px" }}>
                          <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>{stat.label}</div>
                          <div style={{ fontSize:17, fontWeight:700, color:"#1e293b" }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom:20 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"#64748b", marginBottom:10 }}>Time of Day</div>
                      {[
                        { label:"🌅 Morning (6–12)",     mins: morning },
                        { label:"☀️ Afternoon (12–17)",  mins: afternoon },
                        { label:"🌆 Evening (17–22)",    mins: evening },
                      ].map(row => (
                        <div key={row.label} style={{ marginBottom:8 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#374151", marginBottom:3 }}>
                            <span>{row.label}</span>
                            <span style={{ fontWeight:600 }}>{row.mins ? fmtHM(row.mins) : "—"}</span>
                          </div>
                          <div style={{ background:"#f1f5f9", borderRadius:4, height:8 }}>
                            <div style={{ background:"#3b82f6", borderRadius:4, height:8, width:`${Math.round(row.mins/todMax*100)}%`, transition:"width 0.3s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {consistencyLabel && (
                        <span style={{ background:consistencyLabel.color, color:consistencyLabel.fg, borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:600 }}>
                          {consistencyLabel.text} (CV {cvPct}%)
                        </span>
                      )}
                      {shortSessions > 0 && (
                        <span style={{ background:"#fef3c7", color:"#92400e", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:600 }}>
                          ⚡ {shortSessions} short session{shortSessions>1?"s":""} (&lt;15m)
                        </span>
                      )}
                      {microBreaks > 0 && microBreaks === totalBreaks && (
                        <span style={{ background:"#f0f9ff", color:"#0369a1", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:600 }}>
                          Only micro-breaks today
                        </span>
                      )}
                      {totalBreaks > 8 && (
                        <span style={{ background:"#fce7f3", color:"#9d174d", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:600 }}>
                          🔁 High break count ({totalBreaks})
                        </span>
                      )}
                      {totalBreaks === 0 && (
                        <span style={{ background:"#f0fdf4", color:"#166534", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:600 }}>
                          ✅ No breaks recorded
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )
      )}

      {/* ── Team Report (all-employees view) ── */}
      {employeeId === "all" && (
        teamLoading
          ? <div style={{ color:"#94a3b8", fontSize:13, marginBottom:24 }}>Loading team report…</div>
          : teamReport && (
            <>
              {/* Team AI Summary */}
              <div style={{ ...S.card, marginBottom:24 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                  <div style={S.cardTitle}>✨ Team AI Summary</div>
                  <div style={{ display:"flex", gap:10 }}>
                    <div style={{ background:"#eff6ff", color:"#1d4ed8", borderRadius:20, padding:"4px 14px", fontSize:13, fontWeight:700 }}>
                      {teamReport.active_count} active
                    </div>
                    <div style={{
                      background: teamReport.avg_focus_score >= 7 ? "#d1fae5" : teamReport.avg_focus_score >= 4 ? "#fef9c3" : "#fee2e2",
                      color:      teamReport.avg_focus_score >= 7 ? "#065f46" : teamReport.avg_focus_score >= 4 ? "#854d0e" : "#991b1b",
                      borderRadius:20, padding:"4px 14px", fontSize:13, fontWeight:700
                    }}>Team Focus {teamReport.avg_focus_score}/10</div>
                  </div>
                </div>
                <p style={{ fontSize:14, color:"#1e293b", marginBottom:10, lineHeight:1.6 }}>{teamReport.team_ai_summary?.summary}</p>
                {teamReport.team_ai_summary?.insights && <p style={{ fontSize:13, color:"#475569", marginBottom:8 }}>{teamReport.team_ai_summary.insights}</p>}
                {teamReport.team_ai_summary?.recommendation && (
                  <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"10px 14px", fontSize:13, color:"#0369a1" }}>
                    💡 {teamReport.team_ai_summary.recommendation}
                  </div>
                )}
              </div>

              {/* Per-employee cards */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:14, marginBottom:24 }}>
                {teamReport.members.map((m, i) => (
                  <div key={m.employee_id} style={{ ...S.card, padding:16 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ width:32, height:32, borderRadius:"50%", background:COLORS[i%COLORS.length], color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13 }}>
                        {m.name[0].toUpperCase()}
                      </div>
                      <span style={{ background: m.focus_score >= 7 ? "#d1fae5" : m.focus_score >= 4 ? "#fef9c3" : "#fee2e2",
                                     color:      m.focus_score >= 7 ? "#065f46" : m.focus_score >= 4 ? "#854d0e" : "#991b1b",
                                     borderRadius:12, padding:"2px 10px", fontSize:11, fontWeight:700 }}>
                        {m.focus_score}/10
                      </span>
                    </div>
                    <div style={{ fontSize:13, fontWeight:600, color:"#1e293b", marginBottom:4 }}>{m.name}</div>
                    <div style={{ fontSize:20, fontWeight:700, color:"#3b82f6" }}>{fmtHM(m.total_minutes)}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{m.session_count} session(s) · {m.productive_percent}% productive</div>
                    <div style={{ marginTop:8, background:"#f1f5f9", borderRadius:4, height:5 }}>
                      <div style={{ height:5, borderRadius:4, background:COLORS[i%COLORS.length],
                        width: teamReport.members[0]?.total_minutes > 0 ? `${(m.total_minutes/teamReport.members[0].total_minutes)*100}%` : "0%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
      )}

      {/* Week chart + Pie */}
      <div style={S.row2}>
        <div style={S.card}>
          <div style={S.cardTitle}>Hours Tracked — Last 7 Days</div>
          {weekStats.length === 0
            ? <div style={S.empty}>No data for this period.</div>
            : (() => {
                const maxH = Math.max(...weekStats.map(w => w.hours), 0.1);
                return (
                  <div style={{ display:"flex", alignItems:"flex-end", gap:6, height:160, paddingTop:8 }}>
                    {weekStats.map((d, i) => (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        {d.hours > 0 && <div style={{ fontSize:10, color:"#64748b" }}>{d.hours}h</div>}
                        <div style={{ width:"100%", background: d.hours > 0 ? "#3b82f6" : "#e2e8f0",
                          height: d.hours > 0 ? Math.max((d.hours / maxH) * 110, 6) : 4, borderRadius:"4px 4px 0 0" }} />
                        <div style={{ fontSize:10, color:"#94a3b8", textAlign:"center", lineHeight:1.3 }}>{d.day}</div>
                      </div>
                    ))}
                  </div>
                );
              })()
          }
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>App Usage Breakdown</div>
          {pieData.length === 0
            ? <div style={S.empty}>No app data for this day.</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="45%"
                    cy="50%"
                    outerRadius={75}
                    labelLine={false}
                    label={renderPieLabel}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmtDur(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          {/* Legend below pie */}
          {pieData.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginTop:8 }}>
              {pieData.map((d, i) => (
                <div key={d.name} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#64748b" }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:COLORS[i%COLORS.length], flexShrink:0 }} />
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:90 }}>{d.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Employee hours comparison (all-employees view only) */}
      {employeeId === "all" && empHours.length > 0 && (
        <div style={{ ...S.card, marginBottom:24 }}>
          <div style={S.cardTitle}>Hours by Employee — Today</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {empHours.map((e, i) => (
              <div key={e.name} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:90, fontSize:13, fontWeight:500, color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.name}</div>
                <div style={{ flex:1, background:"#f1f5f9", borderRadius:6, height:20, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${(e.mins / empHours[0].mins) * 100}%`,
                    background: COLORS[i % COLORS.length], borderRadius:6, transition:"width 0.4s" }} />
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:"#1e293b", width:52, textAlign:"right" }}>{fmtHM(e.mins)}</div>
                <div style={{ fontSize:11, color:"#94a3b8", width:36, textAlign:"right" }}>
                  {totalMins > 0 ? `${Math.round(e.mins/totalMins*100)}%` : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hourly timeline */}
      <div style={{ ...S.card, marginBottom:24 }}>
        <div style={S.cardTitle}>Hourly Activity Timeline</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={hourBuckets} margin={{ top:0, bottom:0 }}>
            <XAxis dataKey="hour" tick={{ fontSize:10 }} interval={2} />
            <YAxis hide />
            <Tooltip formatter={v => fmtDur(v)} />
            <Bar dataKey="secs" radius={[2,2,0,0]}>
              {hourBuckets.map((b,i) => <Cell key={i} fill={b.secs > 0 ? "#3b82f6" : "#e5e7eb"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* App usage + Sessions */}
      <div style={S.row2}>
        <div style={S.card}>
          <div style={S.cardTitle}>App Usage — Detailed</div>
          {appSummary.length === 0 && <div style={{ color:"#94a3b8", fontSize:14 }}>No data.</div>}
          {appSummary.map((a, i) => (
            <div key={a.app_name} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:13, fontWeight:500, color:"#374151" }}>{a.app_name}</span>
                <span style={{ fontSize:12, color:"#6b7280" }}>
                  {fmtDur(a.total_seconds)} &nbsp;
                  <span style={{ fontWeight:600, color: COLORS[i%COLORS.length] }}>
                    {totalSecs > 0 ? Math.round(a.total_seconds/totalSecs*100) : 0}%
                  </span>
                </span>
              </div>
              <div style={{ background:"#f3f4f6", borderRadius:4, height:6 }}>
                <div style={{ height:6, borderRadius:4, background:COLORS[i%COLORS.length],
                  width: totalSecs > 0 ? `${(a.total_seconds/totalSecs*100).toFixed(1)}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Sessions</div>
          {sessions.length === 0 && <div style={{ color:"#94a3b8", fontSize:14 }}>No sessions for this day.</div>}
          <div style={{ overflowX:"auto" }}>
            <table style={{ ...S.table, minWidth:640 }}>
              <thead>
                <tr>{["Employee","In","Out","Net Time","Wall Time","Breaks","Task","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const emp = employees.find(e => String(e.id) === String(s.employee_id));
                  const netMins  = Number(s.total_minutes) || 0;
                  const wallMins = s.punch_in && s.punch_out
                    ? Math.round((new Date(s.punch_out) - new Date(s.punch_in)) / 60000) : null;
                  const brkList  = Array.isArray(s.breaks) ? s.breaks : [];
                  const brkCount = brkList.length;
                  const brkMins  = brkList.reduce((acc, b) => {
                    if (!b.start || !b.end) return acc;
                    return acc + Math.round((new Date(b.end) - new Date(b.start)) / 60000);
                  }, 0);
                  return (
                    <tr key={s.id}>
                      <td style={S.td}>{s.employee_name || emp?.name || "—"}</td>
                      <td style={{ ...S.td, fontFamily:"monospace", fontSize:12 }}>{fmtTime(s.punch_in)}</td>
                      <td style={{ ...S.td, fontFamily:"monospace", fontSize:12 }}>{s.punch_out ? fmtTime(s.punch_out) : <span style={{ color:"#f59e0b" }}>Active</span>}</td>
                      <td style={{ ...S.td, fontWeight:600, color:"#10b981" }}>{fmtHM(netMins)}</td>
                      <td style={{ ...S.td, color:"#64748b" }}>{wallMins != null ? fmtHM(wallMins) : "—"}</td>
                      <td style={S.td}>
                        {brkCount > 0
                          ? <span style={{ color:"#f97316", fontWeight:500 }}>{brkCount}× {brkMins > 0 ? `(${brkMins}m)` : ""}</span>
                          : <span style={{ color:"#cbd5e1" }}>—</span>}
                      </td>
                      <td style={{ ...S.td, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {s.task_name && <span style={{ background:"#eff6ff", color:"#1d4ed8", borderRadius:4, padding:"2px 7px", fontSize:11, fontWeight:600 }}>{s.task_name}</span>}
                        {s.jira_issue_key && <span style={{ background:"#f0f9ff", color:"#0369a1", borderRadius:4, padding:"2px 7px", fontSize:11, fontWeight:600, marginLeft:4 }}>{s.jira_issue_key}</span>}
                        {!s.task_name && !s.jira_issue_key && <span style={{ color:"#cbd5e1" }}>—</span>}
                      </td>
                      <td style={S.td}>
                        <span style={S.tag(s.status === "active" ? "#16a34a" : "#64748b")}>
                          {s.status === "active" ? "● Active" : "✓ Done"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Activity log */}
      <div style={S.card}>
        <div style={S.cardTitle}>Activity Log ({activity.length} events)</div>
        {activity.length === 0 && <div style={{ color:"#94a3b8", fontSize:14 }}>No activity for this day.</div>}
        <table style={S.table}>
          <thead>
            <tr>{["Time","Employee","App","Window Title","Duration"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {activity.slice(0, 100).map(log => {
              const emp = employees.find(e => String(e.id) === String(log.employee_id));
              return (
                <tr key={log.id}>
                  <td style={{ ...S.td, fontFamily:"monospace", fontSize:12, color:"#9ca3af" }}>{fmtTime(log.start_time)}</td>
                  <td style={S.td}>{log.employee_name || emp?.name || "—"}</td>
                  <td style={{ ...S.td, fontWeight:500 }}>{log.app_name}</td>
                  <td style={{ ...S.td, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"#6b7280" }}>{log.window_title || "—"}</td>
                  <td style={S.td}>{fmtDur(log.duration_seconds)}</td>
                </tr>
              );
            })}
            {activity.length > 100 && (
              <tr><td colSpan={5} style={{ ...S.td, color:"#94a3b8", fontSize:12 }}>Showing first 100 of {activity.length} events.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manual Entry Modal */}
      {showManual && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:"#fff", borderRadius:16, padding:32, width:420, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Manual Time Entry</div>
            <div style={{ color:"#6b7280", fontSize:13, marginBottom:20 }}>Add time that wasn't tracked automatically</div>
            <form onSubmit={submitManual}>
              {[
                { label:"Employee", field: <select value={manualEmpId} onChange={e=>setManualEmpId(e.target.value)} style={{ ...S.select, width:"100%" }} required>
                    <option value="">Select employee…</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select> },
                { label:"Date",       field: <input type="date" value={manualForm.date} onChange={e=>setManualForm({...manualForm,date:e.target.value})} style={{ ...S.dateInput, width:"100%", boxSizing:"border-box" }} required /> },
                { label:"Start Time", field: <input type="time" value={manualForm.startTime} onChange={e=>setManualForm({...manualForm,startTime:e.target.value})} style={{ ...S.dateInput, width:"100%", boxSizing:"border-box" }} required /> },
                { label:"End Time",   field: <input type="time" value={manualForm.endTime} onChange={e=>setManualForm({...manualForm,endTime:e.target.value})} style={{ ...S.dateInput, width:"100%", boxSizing:"border-box" }} required /> },
                { label:"Note",       field: <input type="text" value={manualForm.note} onChange={e=>setManualForm({...manualForm,note:e.target.value})} placeholder="Task description (optional)" style={{ ...S.dateInput, width:"100%", boxSizing:"border-box" }} /> },
              ].map(row => (
                <div key={row.label} style={{ marginBottom:14 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:5 }}>{row.label}</label>
                  {row.field}
                </div>
              ))}
              {manualMsg && <div style={{ marginBottom:12, fontSize:13, color: manualMsg.startsWith("✓") ? "#16a34a" : "#ef4444" }}>{manualMsg}</div>}
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" onClick={() => setShowManual(false)} style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"9px 18px", cursor:"pointer", fontSize:13 }}>Cancel</button>
                <button type="submit" style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", cursor:"pointer", fontSize:13, fontWeight:600 }}>Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Send Slack Digest ─────────────────────────────────────────────── */}
      {user?.role === "admin" && (
        <div style={{ ...S.card, marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <span style={{ fontSize:20 }}>💬</span>
            <div style={S.cardTitle}>Send Slack Digest</div>
          </div>
          <div style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
            Preview the daily team summary before sending to Slack.
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <input
              type="date"
              value={slackDate}
              onChange={e => { setSlackDate(e.target.value); setSlackResult(null); setSlackPreview(null); }}
              style={S.dateInput}
            />
            <button
              disabled={previewLoading}
              onClick={async () => {
                setPreviewLoading(true); setSlackPreview(null); setSlackResult(null);
                try { setSlackPreview(await api.previewSlackDigest(slackDate)); }
                catch (err) { setSlackResult({ error: err.message || "Preview failed" }); }
                finally { setPreviewLoading(false); }
              }}
              style={{ background: previewLoading ? "#94a3b8" : "#0f172a", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor: previewLoading ? "default" : "pointer", fontSize:13, fontWeight:600 }}
            >
              {previewLoading ? "Loading…" : "Preview"}
            </button>
            {slackResult && (
              slackResult.error
                ? <span style={{ fontSize:13, color:"#ef4444" }}>⚠ {slackResult.error}</span>
                : <span style={{ fontSize:13, color:"#16a34a" }}>✓ Sent — {slackResult.employees} employee{slackResult.employees !== 1 ? "s" : ""} included</span>
            )}
          </div>

          {/* Preview panel */}
          {slackPreview && (
            <div style={{ marginTop:20, border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
              {/* Mock Slack header */}
              <div style={{ background:"#4a154b", padding:"14px 18px", display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:18 }}>📊</span>
                <div>
                  <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>Daily Team Report — {new Date(slackPreview.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}</div>
                  <div style={{ color:"rgba(255,255,255,0.7)", fontSize:12, marginTop:2 }}>
                    {slackPreview.previews.length} active · Team total {Math.floor(slackPreview.previews.reduce((s,p) => s+p.total_minutes,0)/60)}h {slackPreview.previews.reduce((s,p) => s+p.total_minutes,0)%60}m
                  </div>
                </div>
              </div>

              {slackPreview.previews.length === 0 && (
                <div style={{ padding:"24px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>No tracked time for this date.</div>
              )}

              {slackPreview.previews.map((p, i) => {
                const fmtM = m => { const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h ${mn>0?mn+"m":""}`.trim():`${mn}m`; };
                const focusEmoji = p.focus_score >= 8 ? "🟢" : p.focus_score >= 5 ? "🟡" : "🔴";
                const bar = "█".repeat(Math.round((p.focus_score/10)*8)) + "░".repeat(8-Math.round((p.focus_score/10)*8));
                const breakLine = p.breaks > 0 ? `☕ ${p.breaks} break${p.breaks!==1?"s":""} · ${fmtM(p.break_minutes)}` : "☕ No breaks";
                const firstSentence = s => (s||"").split(/(?<=[.!?])\s+/)[0] || s || "";
                return (
                  <div key={i} style={{ padding:"14px 18px", borderTop:"1px solid #e2e8f0", background:"#fff" }}>
                    {/* Row 1: name + time + focus bar */}
                    <div style={{ fontSize:13, color:"#1d1c1d", marginBottom:8 }}>
                      {focusEmoji}&nbsp; <strong>{p.employee.name}</strong>&nbsp;&nbsp;
                      <code style={{ background:"#f1f5f9", padding:"1px 6px", borderRadius:3, fontSize:12 }}>{fmtM(p.total_minutes)}</code>&nbsp;&nbsp;
                      Focus <strong>{p.focus_score}/10</strong>&nbsp;
                      <code style={{ background:"#f1f5f9", padding:"1px 6px", borderRadius:3, fontSize:12 }}>{bar}</code>
                    </div>
                    {/* Row 2: tasks | summary */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:8 }}>
                      <div style={{ fontSize:12, color:"#374151" }}>
                        <div style={{ fontWeight:700, marginBottom:3 }}>Tasks</div>
                        {p.tasks.length ? p.tasks.map((t,j) => <div key={j}>• {t}</div>) : <div style={{ color:"#94a3b8" }}>• No task assigned</div>}
                      </div>
                      <div style={{ fontSize:12, color:"#374151" }}>
                        <div style={{ fontWeight:700, marginBottom:3 }}>Summary</div>
                        <div style={{ color:"#64748b", fontStyle:"italic", lineHeight:1.5 }}>{firstSentence(p.summary) || "No summary available"}</div>
                      </div>
                    </div>
                    {/* Row 3: compact meta + insight */}
                    <div style={{ fontSize:11, color:"#94a3b8" }}>
                      📋 {p.sessions} session{p.sessions!==1?"s":""}
                      &nbsp;&nbsp;&nbsp;{breakLine}
                      &nbsp;&nbsp;&nbsp;⚡ {p.productive_percent}% productive
                      {p.insights && <>&nbsp;&nbsp;&nbsp;💡 <em>{firstSentence(p.insights)}</em></>}
                    </div>
                  </div>
                );
              })}

              {/* Send button */}
              {slackPreview.previews.length > 0 && (
                <div style={{ padding:"14px 18px", borderTop:"1px solid #e2e8f0", background:"#f8fafc", display:"flex", justifyContent:"flex-end", gap:10 }}>
                  <button onClick={() => { setSlackPreview(null); setSlackResult(null); }} style={{ background:"#f1f5f9", border:"none", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:13 }}>Cancel</button>
                  <button
                    disabled={slackSending}
                    onClick={async () => {
                      setSlackSending(true);
                      try { setSlackResult(await api.sendSlackDigest(slackDate)); setSlackPreview(null); }
                      catch (err) { setSlackResult({ error: err.message || "Failed to send" }); }
                      finally { setSlackSending(false); }
                    }}
                    style={{ background: slackSending ? "#94a3b8" : "#4f46e5", color:"#fff", border:"none", borderRadius:8, padding:"8px 20px", cursor: slackSending ? "default" : "pointer", fontSize:13, fontWeight:600 }}
                  >
                    {slackSending ? "Sending…" : "Send to Slack ✈"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Send Teams Digest ─────────────────────────────────────────────── */}
      {user?.role === "admin" && (
        <div style={{ ...S.card, marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <span style={{ fontSize:20 }}>🟦</span>
            <div style={S.cardTitle}>Send Microsoft Teams Digest</div>
          </div>
          <div style={{ fontSize:13, color:"#64748b", marginBottom:16 }}>
            Send the daily team summary to your Microsoft Teams channel via incoming webhook.
            Configure <code style={{ background:"#f1f5f9", padding:"1px 5px", borderRadius:3 }}>TEAMS_WEBHOOK_URL</code> in your server <code style={{ background:"#f1f5f9", padding:"1px 5px", borderRadius:3 }}>.env</code> to enable.
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <input
              type="date"
              value={teamsDate}
              onChange={e => { setTeamsDate(e.target.value); setTeamsResult(null); }}
              style={S.dateInput}
            />
            <button
              disabled={teamsSending}
              onClick={async () => {
                setTeamsSending(true); setTeamsResult(null);
                try { setTeamsResult(await api.sendTeamsDigest(teamsDate)); }
                catch (err) { setTeamsResult({ error: err.message || "Failed to send" }); }
                finally { setTeamsSending(false); }
              }}
              style={{ background: teamsSending ? "#94a3b8" : "#5558af", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor: teamsSending ? "default" : "pointer", fontSize:13, fontWeight:600 }}
            >
              {teamsSending ? "Sending…" : "Send to Teams ✈"}
            </button>
            {teamsResult && (
              teamsResult.error
                ? <span style={{ fontSize:13, color:"#ef4444" }}>⚠ {teamsResult.error}</span>
                : <span style={{ fontSize:13, color:"#16a34a" }}>✓ Sent — {teamsResult.employees} employee{teamsResult.employees !== 1 ? "s" : ""} included</span>
            )}
          </div>
        </div>
      )}

      {/* ── Chatbot (hidden) ── */}
    </div>
  );
}
