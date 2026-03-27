import React, { useState, useEffect } from "react";
import { api } from "../api";
import { format, subDays } from "date-fns";

const S = {
  title:   { fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 },
  sub:     { color: "#64748b", margin: "4px 0 20px", fontSize: 14 },
  filters: { display: "flex", gap: 12, marginBottom: 24 },
  select:  { padding: "8px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, background: "#fff", fontFamily: "Inter,sans-serif" },
  sumGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 },
  sumCard: { background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0", textAlign: "center" },
  table:   { background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0", width: "100%" },
  th:      { background: "#f8fafc", padding: "12px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0" },
  td:      { padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontSize: 14, color: "#374151" },
  badge:   { fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 },
};

const DATE_OPTIONS = Array.from({ length: 7 }, (_, i) => {
  const d = subDays(new Date(), i);
  return { label: i===0?"Today":i===1?"Yesterday":format(d,"EEE, MMM d"), value: format(d,"yyyy-MM-dd") };
});

const fmtDur = m => { if (!m) return "—"; const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h ${mn}m`:`${mn}m`; };

export default function Attendance() {
  const [sessions, setSessions]   = useState([]);
  const [filterDate, setFilterDate] = useState(DATE_OPTIONS[0].value);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getSessions(filterDate).then(setSessions).catch(console.error).finally(() => setLoading(false));
  }, [filterDate]);

  const totalMins  = sessions.reduce((a,s) => a + (s.total_minutes||0), 0);
  const activeNow  = sessions.filter(s => s.status === "active").length;
  const avgMins    = sessions.length ? Math.round(totalMins / sessions.length) : 0;

  return (
    <div>
      <h1 style={S.title}>Attendance</h1>
      <p style={S.sub}>Punch-in/out records by day</p>

      <div style={S.sumGrid}>
        {[{ label:"Total Sessions", value:sessions.length, color:"#3b82f6" },
          { label:"Active Now",     value:activeNow,       color:"#10b981" },
          { label:"Total Hours",    value:fmtDur(totalMins),color:"#8b5cf6" },
          { label:"Avg Session",    value:fmtDur(avgMins),  color:"#f59e0b" },
        ].map(s => (
          <div key={s.label} style={S.sumCard}>
            <div style={{ fontSize:26, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={S.filters}>
        <select style={S.select} value={filterDate} onChange={e => setFilterDate(e.target.value)}>
          {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <table style={S.table} cellSpacing={0}>
        <thead><tr>{["Employee","Punch In","Punch Out","Duration","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {loading && <tr><td colSpan={5} style={{ ...S.td, textAlign:"center", color:"#94a3b8" }}>Loading…</td></tr>}
          {!loading && sessions.length === 0 && <tr><td colSpan={5} style={{ ...S.td, textAlign:"center", color:"#94a3b8", padding:40 }}>No sessions for this date.</td></tr>}
          {sessions.map(s => (
            <tr key={s.id}>
              <td style={S.td}><span style={{ fontWeight:600 }}>{s.employee_name}</span>{s.department && <span style={{ color:"#94a3b8", fontSize:12, marginLeft:6 }}>{s.department}</span>}</td>
              <td style={S.td}>{s.punch_in ? format(new Date(s.punch_in),"h:mm a") : "—"}</td>
              <td style={S.td}>{s.punch_out ? format(new Date(s.punch_out),"h:mm a") : <span style={{ color:"#10b981" }}>Active</span>}</td>
              <td style={S.td}>{fmtDur(s.total_minutes)}</td>
              <td style={S.td}><span style={{ ...S.badge, background: s.status==="active"?"#dcfce7":"#f1f5f9", color: s.status==="active"?"#16a34a":"#64748b" }}>{s.status==="active"?"● Working":"✓ Done"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
