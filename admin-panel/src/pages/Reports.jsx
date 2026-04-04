import React, { useState, useEffect } from "react";
import { api } from "../api";
import { format, subDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];
const fmtDur = s => { s = Math.round(Number(s)||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const fmtHM  = m => { m = Math.round(Number(m)||0); const h=Math.floor(m/60),mn=m%60; return `${h}h ${String(mn).padStart(2,"0")}m`; };
const fmtTime = dt => dt ? format(new Date(dt), "h:mm a") : "—";

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

export default function Reports() {
  const [date,       setDate]       = useState(format(new Date(), "yyyy-MM-dd"));
  const [employeeId, setEmployeeId] = useState("all");
  const [employees,  setEmployees]  = useState([]);
  const [sessions,   setSessions]   = useState([]);
  const [appSummary, setAppSummary] = useState([]);
  const [activity,   setActivity]   = useState([]);
  const [weekStats,  setWeekStats]  = useState([]);
  const [loading,    setLoading]    = useState(false);

  const [showManual, setShowManual] = useState(false);
  const [manualEmpId,setManualEmpId]= useState("");
  const [manualForm, setManualForm] = useState({ date:"", startTime:"09:00", endTime:"10:00", note:"" });
  const [manualMsg,  setManualMsg]  = useState("");

  useEffect(() => { api.getEmployees().then(setEmployees); }, []);
  useEffect(() => { loadData(); }, [date, employeeId]);

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
          <table style={S.table}>
            <thead>
              <tr>{["Employee","In","Out","Duration","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const emp = employees.find(e => String(e.id) === String(s.employee_id));
                return (
                  <tr key={s.id}>
                    <td style={S.td}>{s.employee_name || emp?.name || "—"}</td>
                    <td style={{ ...S.td, fontFamily:"monospace", fontSize:12 }}>{fmtTime(s.punch_in)}</td>
                    <td style={{ ...S.td, fontFamily:"monospace", fontSize:12 }}>{fmtTime(s.punch_out)}</td>
                    <td style={S.td}>{fmtHM(s.total_minutes)}</td>
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
    </div>
  );
}
