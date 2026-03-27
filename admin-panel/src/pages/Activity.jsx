import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];
const fmtDur = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; };
const fmtHM  = m => { const h=Math.floor(m/60),mn=m%60; return `${h}h ${String(mn).padStart(2,"0")}m`; };

const S = {
  page:       { padding: "0 0 40px" },
  header:     { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 },
  title:      { fontSize:26, fontWeight:700, color:"#1e293b", margin:0 },
  sub:        { color:"#64748b", fontSize:14, marginTop:4 },
  refreshBtn: { background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:8 },
  grid:       { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16, marginBottom:28 },
  empCard:    { background:"#fff", borderRadius:12, padding:20, border:"1px solid #e2e8f0", cursor:"pointer", transition:"box-shadow 0.15s" },
  empCardActive:{ boxShadow:"0 0 0 2px #16a34a, 0 4px 12px rgba(22,163,74,0.12)" },
  row2:       { display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:28 },
  card:       { background:"#fff", borderRadius:12, padding:24, border:"1px solid #e2e8f0" },
  cardTitle:  { fontSize:16, fontWeight:600, color:"#1e293b", marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between" },
  badge:      { display:"inline-flex", alignItems:"center", gap:5, fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20 },
  actRow:     { display:"flex", alignItems:"flex-start", gap:12, padding:"10px 0", borderBottom:"1px solid #f1f5f9" },
  dot:        { width:8, height:8, borderRadius:"50%", marginTop:5, flexShrink:0 },
};

function StatusBadge({ status }) {
  if (status !== "active") return <span style={{ ...S.badge, background:"#f1f5f9", color:"#64748b" }}>✓ Done</span>;
  return <span style={{ ...S.badge, background:"#dcfce7", color:"#16a34a" }}>● Active</span>;
}

// ── Screenshot lightbox ──────────────────────────────────────────────────────

function ScreenshotModal({ ss, onClose }) {
  if (!ss) return null;
  return (
    <div
      onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, cursor:"pointer" }}>
      <div onClick={e => e.stopPropagation()} style={{ textAlign:"center" }}>
        <img
          src={ss.file_path}
          alt="Screenshot"
          style={{ maxWidth:"90vw", maxHeight:"82vh", borderRadius:12, display:"block" }}
        />
        <div style={{ color:"#e2e8f0", marginTop:12, fontSize:14 }}>
          <span style={{ fontWeight:600 }}>{ss.employee_name}</span>
          {" · "}
          {ss.captured_at ? format(new Date(ss.captured_at), "MMM d, yyyy h:mm a") : ""}
          {ss.activity_level != null &&
            <span style={{ marginLeft:12, opacity:0.7 }}>{ss.activity_level}% active</span>}
          <span style={{ opacity:0.4, marginLeft:16 }}>Click anywhere to close</span>
        </div>
      </div>
    </div>
  );
}

// ── Recent Screenshots strip ─────────────────────────────────────────────────

function RecentScreenshots({ date }) {
  const [screenshots, setScreenshots] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getScreenshots(date);
      setScreenshots(data.slice(0, 12)); // latest 12
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div style={{ ...S.card, marginBottom:28 }}>
      <div style={S.cardTitle}>
        <span>📸 Recent Screenshots</span>
        <span style={{ fontSize:12, color:"#94a3b8", fontWeight:400 }}>Auto-refreshes · click to enlarge</span>
      </div>

      {loading && <div style={{ color:"#94a3b8", fontSize:14 }}>Loading…</div>}

      {!loading && screenshots.length === 0 && (
        <div style={{ textAlign:"center", padding:"32px 0", color:"#94a3b8" }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🖼</div>
          <div style={{ fontSize:13 }}>No screenshots yet today.</div>
          <div style={{ fontSize:11, marginTop:4 }}>Screenshots are captured every 5 minutes while employees are tracked.</div>
        </div>
      )}

      {screenshots.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:12 }}>
          {screenshots.map(ss => (
            <div
              key={ss.id}
              onClick={() => setSelected(ss)}
              style={{ borderRadius:8, overflow:"hidden", border:"1px solid #e2e8f0", cursor:"pointer",
                       boxShadow:"0 1px 3px rgba(0,0,0,0.07)", transition:"transform 0.15s, box-shadow 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.07)"; }}>
              {ss.file_path
                ? <img src={ss.file_path} alt="ss" style={{ width:"100%", height:100, objectFit:"cover", display:"block", background:"#f1f5f9" }} />
                : <div style={{ width:"100%", height:100, background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🖥</div>}
              <div style={{ padding:"8px 10px" }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#1e293b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {ss.employee_name}
                </div>
                <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                  {ss.captured_at ? format(new Date(ss.captured_at), "h:mm a") : "—"}
                </div>
                {ss.activity_level != null && (
                  <div style={{ marginTop:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:10,
                                   background: ss.activity_level > 50 ? "#dcfce7" : "#fef9c3",
                                   color: ss.activity_level > 50 ? "#16a34a" : "#92400e" }}>
                      {ss.activity_level}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ScreenshotModal ss={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ── Main Activity page ───────────────────────────────────────────────────────

export default function Activity() {
  const navigate  = useNavigate();
  const today     = format(new Date(), "yyyy-MM-dd");
  const [sessions,   setSessions]   = useState([]);
  const [appSummary, setAppSummary] = useState([]);
  const [activity,   setActivity]   = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    try {
      const [sess, apps, act, emps] = await Promise.all([
        api.getSessions(today),
        api.getActivitySummary(today),
        api.getActivity(today),
        api.getEmployees(),
      ]);
      setSessions(sess);
      setAppSummary(apps.slice(0, 8));
      setActivity(act.slice(-50).reverse());
      setEmployees(emps);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const empCards = employees.map(emp => {
    const empSessions   = sessions.filter(s => String(s.employee_id) === String(emp.id));
    const activeSession = empSessions.find(s => s.status === "active");
    const totalMins     = empSessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
    const latestApp     = activity.find(a => String(a.employee_id) === String(emp.id))?.app_name || "";
    return { ...emp, activeSession, totalMins, latestApp, empSessions };
  });

  const activeCount = empCards.filter(e => e.activeSession).length;

  if (loading) return <div style={{ color:"#64748b", padding:40 }}>Loading…</div>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Live Activity</h1>
          <p style={S.sub}>{format(new Date(), "EEEE, MMMM d")} · Last updated {format(lastRefresh, "h:mm:ss a")}</p>
        </div>
        <button style={S.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      {/* Summary strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        {[
          { label:"Active Now",    value:activeCount,        color:"#16a34a", bg:"#dcfce7", icon:"🟢" },
          { label:"Total Online",  value:sessions.length,    color:"#3b82f6", bg:"#eff6ff", icon:"👥" },
          { label:"Apps Tracked",  value:appSummary.length,  color:"#8b5cf6", bg:"#f5f3ff", icon:"💻" },
          { label:"Events Today",  value:activity.length,    color:"#f59e0b", bg:"#fffbeb", icon:"📊" },
        ].map(c => (
          <div key={c.label} style={{ background:"#fff", borderRadius:12, padding:"16px 20px", border:"1px solid #e2e8f0", display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:44, height:44, borderRadius:10, background:c.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize:26, fontWeight:700, color:c.color }}>{c.value}</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Employee cards */}
      <div style={S.grid}>
        {empCards.map(emp => (
          <div key={emp.id}
            style={{ ...S.empCard, ...(emp.activeSession ? S.empCardActive : {}) }}
            onClick={() => navigate(`/employees/${emp.id}`)}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background: emp.activeSession ? "#3b82f6" : "#e2e8f0",
                              color: emp.activeSession ? "#fff" : "#64748b", display:"flex", alignItems:"center",
                              justifyContent:"center", fontWeight:700, fontSize:14 }}>
                  {(emp.name||"?").split(" ").map(x=>x[0]).join("").toUpperCase().slice(0,2)}
                </div>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:"#1e293b" }}>{emp.name}</div>
                  <div style={{ fontSize:11, color:"#9ca3af" }}>{emp.department||"—"}</div>
                </div>
              </div>
              <StatusBadge status={emp.activeSession ? "active" : "done"} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#64748b" }}>
              <div>
                <span style={{ color:"#9ca3af" }}>Today</span><br/>
                <span style={{ fontWeight:600, color:"#374151", fontSize:14 }}>{fmtHM(emp.totalMins)}</span>
              </div>
              {emp.latestApp && (
                <div style={{ textAlign:"right" }}>
                  <span style={{ color:"#9ca3af" }}>Last app</span><br/>
                  <span style={{ fontWeight:500, color:"#374151", fontSize:13 }}>{emp.latestApp}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={S.row2}>
        {/* App usage bar chart */}
        <div style={S.card}>
          <div style={S.cardTitle}><span>App Usage Today (All Employees)</span></div>
          {appSummary.length === 0
            ? <div style={{ color:"#94a3b8", fontSize:14 }}>No app data yet.</div>
            : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={appSummary.map(a => ({ name: a.app_name.slice(0,14), secs: a.total_seconds }))} layout="vertical" margin={{ left:0, right:20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtDur(v)} tick={{ fontSize:11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize:12 }} />
                  <Tooltip formatter={v => fmtDur(v)} />
                  <Bar dataKey="secs" radius={[0,4,4,0]}>
                    {appSummary.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
        </div>

        {/* Live activity feed */}
        <div style={S.card}>
          <div style={S.cardTitle}><span>Recent Activity Feed</span></div>
          <div style={{ maxHeight:220, overflowY:"auto" }}>
            {activity.length === 0 && <div style={{ color:"#94a3b8", fontSize:14 }}>No activity recorded yet.</div>}
            {activity.slice(0, 20).map(log => {
              const emp = employees.find(e => String(e.id) === String(log.employee_id));
              return (
                <div key={log.id} style={S.actRow}>
                  <div style={{ ...S.dot, background: COLORS[Math.abs((log.app_name||"").charCodeAt(0) % COLORS.length)] }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:"#1e293b" }}>
                      {emp?.name || "Unknown"} — <span style={{ color:"#3b82f6" }}>{log.app_name}</span>
                    </div>
                    {log.window_title && <div style={{ fontSize:11, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{log.window_title}</div>}
                  </div>
                  <div style={{ fontSize:11, color:"#9ca3af", flexShrink:0 }}>
                    {log.start_time ? format(new Date(log.start_time), "h:mm a") : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Screenshots */}
      <RecentScreenshots date={today} />
    </div>
  );
}
