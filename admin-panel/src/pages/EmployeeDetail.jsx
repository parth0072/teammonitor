import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { format } from "date-fns";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899"];
const S = {
  back:     { background:"none", border:"none", color:"#3b82f6", cursor:"pointer", fontWeight:600, fontSize:14, padding:"0 0 16px", display:"flex", alignItems:"center", gap:6 },
  header:   { background:"#fff", borderRadius:12, padding:24, marginBottom:20, border:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:20 },
  avatar:   { width:64, height:64, borderRadius:"50%", background:"#3b82f6", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:24 },
  tabs:     { display:"flex", gap:4, marginBottom:20, background:"#fff", padding:6, borderRadius:10, border:"1px solid #e2e8f0", width:"fit-content" },
  tab:      { padding:"8px 18px", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:13, border:"none", background:"none", color:"#64748b" },
  tabActive:{ background:"#3b82f6", color:"#fff" },
  card:     { background:"#fff", borderRadius:12, padding:24, border:"1px solid #e2e8f0", marginBottom:20 },
  cardTitle:{ fontSize:16, fontWeight:600, marginBottom:16, color:"#1e293b" },
  ssGrid:   { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 },
  ssCard:   { borderRadius:8, overflow:"hidden", border:"1px solid #e2e8f0" },
  ssImg:    { width:"100%", height:130, objectFit:"cover", background:"#f1f5f9", display:"block" },
  ssTime:   { fontSize:11, color:"#64748b", padding:"6px 10px", background:"#f8fafc" },
  appRow:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f1f5f9" },
};

const fmtDur = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const initials = n => (n||"?").split(" ").map(x=>x[0]).join("").toUpperCase().slice(0,2);
const fmtHM  = m => { const h=Math.floor(m/60),mn=m%60; return `${h}h ${String(mn).padStart(2,"0")}m`; };
const fmtInterval = s => { const secs = s||300; if(secs<120) return `${secs}s`; return `${Math.round(secs/60)} min`; };
const INTERVAL_OPTIONS = [
  { value:60,   label:"Every 1 minute" },
  { value:120,  label:"Every 2 minutes" },
  { value:300,  label:"Every 5 minutes (default)" },
  { value:600,  label:"Every 10 minutes" },
  { value:900,  label:"Every 15 minutes" },
  { value:1800, label:"Every 30 minutes" },
];
const TABS = ["Overview","Screenshots","App Usage","Activity Log","Timeline","Settings","Manual Entry"];

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");
  const [emp, setEmp]           = useState(null);
  const [tab, setTab]           = useState(0);
  const [screenshots, setScreenshots] = useState([]);
  const [appSummary, setAppSummary]   = useState([]);
  const [activity, setActivity]       = useState([]);
  const [sessions, setSessions]       = useState([]);

  useEffect(() => {
    api.getEmployee(id).then(setEmp);
    api.getScreenshots(today, id).then(setScreenshots);
    api.getActivitySummary(today, id).then(setAppSummary);
    api.getActivity(today, id).then(setActivity);
    api.getSessions(today).then(rows => setSessions(rows.filter(s => String(s.employee_id) === String(id))));
  }, [id, today]);

  const totalSecs = appSummary.reduce((a, r) => a + (r.total_seconds||0), 0);

  // Hourly timeline buckets
  const hourBuckets = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2,"0")}:00`,
    secs: activity.filter(a => a.start_time && new Date(a.start_time).getHours() === h)
                  .reduce((sum, a) => sum + (a.duration_seconds||0), 0),
  }));

  // Settings state
  const [settingsInterval, setSettingsInterval] = useState(300);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  useEffect(() => { if (emp) setSettingsInterval(emp.screenshot_interval || 300); }, [emp]);

  async function saveSettings() {
    setSettingsSaving(true); setSettingsMsg("");
    try {
      await api.updateEmployee(id, {
        name: emp.name, department: emp.department, role: emp.role,
        is_active: emp.is_active, screenshot_interval: settingsInterval
      });
      setSettingsMsg("✓ Settings saved");
      setTimeout(() => setSettingsMsg(""), 3000);
    } catch(err) { setSettingsMsg("✗ " + err.message); }
    setSettingsSaving(false);
  }

  // Manual entry state
  const [manualForm, setManualForm] = useState({ date: today, startTime:"09:00", endTime:"10:00", note:"" });
  const [manualMsg,  setManualMsg]  = useState("");
  const manualMins = Math.max(0, (() => { try { return Math.round((new Date(`${manualForm.date}T${manualForm.endTime}`) - new Date(`${manualForm.date}T${manualForm.startTime}`)) / 60000); } catch { return 0; } })());

  async function submitManual(e) {
    e.preventDefault(); setManualMsg("");
    try {
      await api.createManualEntry({ employeeId: id, ...manualForm });
      setManualMsg("✓ Entry saved successfully");
      setTimeout(() => setManualMsg(""), 3000);
    } catch(err) { setManualMsg("✗ " + err.message); }
  }

  if (!emp) return <div style={{ color:"#64748b", padding:40 }}>Loading…</div>;

  return (
    <div>
      <button style={S.back} onClick={() => navigate("/employees")}>← Back to Employees</button>
      <div style={S.header}>
        <div style={S.avatar}>{initials(emp.name)}</div>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:"#1e293b" }}>{emp.name}</div>
          <div style={{ color:"#64748b", fontSize:14, marginTop:4 }}>{emp.email} · {emp.department||"No dept"}</div>
          {sessions.some(s => s.status==="active") && (
            <span style={{ background:"#dcfce7", color:"#16a34a", fontSize:12, fontWeight:600, padding:"3px 10px", borderRadius:20, display:"inline-block", marginTop:8 }}>● Active Now</span>
          )}
        </div>
      </div>

      <div style={S.tabs}>
        {TABS.map((t,i) => <button key={t} style={{ ...S.tab, ...(tab===i?S.tabActive:{}) }} onClick={()=>setTab(i)}>{t}</button>)}
      </div>

      {tab===0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Today's Overview</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {[{ label:"Sessions", value:sessions.length },{ label:"Screenshots", value:screenshots.length },{ label:"Time Tracked", value:fmtDur(sessions.reduce((a,s)=>a+(s.total_minutes||0),0)*60) }].map(s => (
              <div key={s.label} style={{ background:"#f8fafc", borderRadius:10, padding:"16px 20px", textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:700, color:"#1e293b" }}>{s.value}</div>
                <div style={{ fontSize:13, color:"#64748b" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab===1 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Screenshots Today ({screenshots.length})</div>
          {screenshots.length===0 && <div style={{ color:"#94a3b8" }}>No screenshots today.</div>}
          <div style={S.ssGrid}>
            {screenshots.map(ss => (
              <div key={ss.id} style={S.ssCard}>
                <img style={S.ssImg} src={ss.file_path} alt="Screenshot" />
                <div style={S.ssTime}>{ss.captured_at ? format(new Date(ss.captured_at),"h:mm a") : "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab===2 && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div style={S.card}>
            <div style={S.cardTitle}>App Usage</div>
            {appSummary.slice(0,8).map((a,i) => (
              <div key={a.app_name} style={S.appRow}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{a.app_name}</div>
                  <div style={{ marginTop:5, background:"#f1f5f9", borderRadius:3, height:6 }}>
                    <div style={{ height:6, borderRadius:3, background:COLORS[i%COLORS.length], width:`${Math.round((a.total_seconds/totalSecs)*100)}%` }} />
                  </div>
                </div>
                <div style={{ fontSize:13, color:"#64748b", marginLeft:16 }}>{fmtDur(a.total_seconds)}</div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.cardTitle}>Chart</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={appSummary.slice(0,5).map(a=>({ name:a.app_name, value:a.total_seconds }))} dataKey="value" cx="50%" cy="50%" outerRadius={90} label={({name})=>name.slice(0,10)}>
                  {appSummary.slice(0,5).map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtDur(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab===3 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Activity Log</div>
          {activity.length===0 && <div style={{ color:"#94a3b8" }}>No activity today.</div>}
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>{["Time","App","Window Title","Duration"].map(h => <th key={h} style={{ textAlign:"left", fontSize:12, color:"#64748b", fontWeight:600, padding:"8px 0", borderBottom:"1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
            <tbody>
              {activity.map(log => (
                <tr key={log.id}>
                  <td style={{ padding:"10px 0", fontSize:13, color:"#64748b", borderBottom:"1px solid #f1f5f9" }}>{log.start_time ? format(new Date(log.start_time),"h:mm a") : "—"}</td>
                  <td style={{ padding:"10px 12px 10px 0", fontSize:14, fontWeight:500, borderBottom:"1px solid #f1f5f9" }}>{log.app_name}</td>
                  <td style={{ padding:"10px 12px 10px 0", fontSize:13, color:"#64748b", borderBottom:"1px solid #f1f5f9", maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.window_title}</td>
                  <td style={{ padding:"10px 0", fontSize:13, color:"#64748b", borderBottom:"1px solid #f1f5f9" }}>{fmtDur(log.duration_seconds||0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab===4 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Hourly Activity Timeline</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourBuckets} margin={{ top:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="hour" tick={{ fontSize:10 }} interval={2} />
              <YAxis hide />
              <Tooltip formatter={v => fmtDur(v)} />
              <Bar dataKey="secs" radius={[3,3,0,0]}>
                {hourBuckets.map((b,i) => (
                  <Cell key={i} fill={b.secs > 0 ? COLORS[i % COLORS.length] : "#e5e7eb"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop:24 }}>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:12, color:"#374151" }}>Activity by Hour</div>
            {hourBuckets.filter(b => b.secs > 0).map(b => (
              <div key={b.hour} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
                <div style={{ width:50, fontSize:12, color:"#6b7280", fontFamily:"monospace" }}>{b.hour}</div>
                <div style={{ flex:1, background:"#f3f4f6", borderRadius:4, height:8 }}>
                  <div style={{ height:8, borderRadius:4, background:"#3b82f6", width:`${Math.round(b.secs/Math.max(...hourBuckets.map(x=>x.secs))*100)}%` }} />
                </div>
                <div style={{ width:60, fontSize:12, color:"#374151", textAlign:"right" }}>{fmtDur(b.secs)}</div>
              </div>
            ))}
            {hourBuckets.every(b => b.secs === 0) && <div style={{ color:"#94a3b8", fontSize:14 }}>No activity today.</div>}
          </div>
        </div>
      )}

      {tab===5 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Screenshot Settings</div>
          <p style={{ color:"#64748b", fontSize:14, marginBottom:20 }}>
            Control how frequently screenshots are captured when this employee is being tracked.
          </p>
          <label style={{ display:"block", fontSize:13, fontWeight:600, color:"#374151", marginBottom:8 }}>Screenshot Interval</label>
          <select
            value={settingsInterval}
            onChange={e => setSettingsInterval(Number(e.target.value))}
            style={{ padding:"10px 14px", border:"1.5px solid #e2e8f0", borderRadius:8, fontSize:14, background:"#fff", marginBottom:16, minWidth:260 }}
          >
            {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"10px 16px", fontSize:13, color:"#0369a1", marginBottom:20, display:"inline-flex", alignItems:"center", gap:8 }}>
            📸 Screenshots every <strong style={{ margin:"0 4px" }}>{fmtInterval(settingsInterval)}</strong> — approx. <strong style={{ margin:"0 4px" }}>{Math.round(480/(settingsInterval/60))}</strong> per 8-hour day
          </div>
          {settingsMsg && <div style={{ marginBottom:12, fontSize:13, fontWeight:600, color: settingsMsg.startsWith("✓")?"#16a34a":"#ef4444" }}>{settingsMsg}</div>}
          <div>
            <button onClick={saveSettings} disabled={settingsSaving} style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"10px 24px", cursor:"pointer", fontSize:14, fontWeight:600, opacity: settingsSaving?0.7:1 }}>
              {settingsSaving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {tab===6 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Add Manual Time Entry</div>
          <form onSubmit={submitManual} style={{ maxWidth:400 }}>
            {[
              { label:"Date",       field:<input type="date" value={manualForm.date} onChange={e=>setManualForm({...manualForm,date:e.target.value})} style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, width:"100%", boxSizing:"border-box" }} required /> },
              { label:"Start Time", field:<input type="time" value={manualForm.startTime} onChange={e=>setManualForm({...manualForm,startTime:e.target.value})} style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, width:"100%", boxSizing:"border-box" }} required /> },
              { label:"End Time",   field:<input type="time" value={manualForm.endTime} onChange={e=>setManualForm({...manualForm,endTime:e.target.value})} style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, width:"100%", boxSizing:"border-box" }} required /> },
              { label:"Note",       field:<input type="text" value={manualForm.note} onChange={e=>setManualForm({...manualForm,note:e.target.value})} placeholder="Task description (optional)" style={{ border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, width:"100%", boxSizing:"border-box" }} /> },
            ].map(row => (
              <div key={row.label} style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#374151", marginBottom:5 }}>{row.label}</label>
                {row.field}
              </div>
            ))}
            {manualMins > 0 && (
              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:13, color:"#16a34a", fontWeight:600 }}>
                Duration: {fmtHM(manualMins)}
              </div>
            )}
            {manualMsg && (
              <div style={{ marginBottom:14, fontSize:13, color: manualMsg.startsWith("✓") ? "#16a34a" : "#ef4444", fontWeight:500 }}>{manualMsg}</div>
            )}
            <button type="submit" style={{ background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"10px 24px", cursor:"pointer", fontSize:14, fontWeight:600 }}>
              Save Entry
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
