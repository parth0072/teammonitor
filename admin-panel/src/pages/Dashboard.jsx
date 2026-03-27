import React, { useState, useEffect } from "react";
import { api } from "../api";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const S = {
  title: { fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 },
  sub:   { color: "#64748b", marginTop: 4, fontSize: 14, marginBottom: 28 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 28 },
  statCard: { background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" },
  statLabel: { fontSize: 13, color: "#64748b", fontWeight: 500, marginBottom: 8 },
  statValue: { fontSize: 32, fontWeight: 700 },
  row:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  card: { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" },
  cardTitle: { fontSize: 16, fontWeight: 600, color: "#1e293b", marginBottom: 20 },
  empRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
  badge:  { fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 600 },
};

function StatCard({ label, value, color, icon }) {
  return (
    <div style={S.statCard}>
      <div style={S.statLabel}>{icon} {label}</div>
      <div style={{ ...S.statValue, color }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [sessions, setSessions]   = useState([]);
  const [chartData, setChartData] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([
      api.getSessions(today),
      api.getSessionStats(7),
      api.getScreenshots(today),
      api.getEmployees(),
    ]).then(([sess, stats, ss, emps]) => {
      setSessions(sess);
      setScreenshots(ss);
      setEmployees(emps);
      setChartData(stats.map(r => ({
        day: format(new Date(r.date + "T00:00:00"), "EEE"),
        hours: +(r.total_minutes / 60).toFixed(1),
      })));
    }).catch(console.error).finally(() => setLoading(false));
  }, [today]);

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading…</div>;

  const activeCount = sessions.filter(s => s.status === "active").length;
  const totalMins   = sessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
  const avgHrs      = sessions.length ? (totalMins / sessions.length / 60).toFixed(1) : 0;

  return (
    <div>
      <h1 style={S.title}>Dashboard</h1>
      <p style={S.sub}>{format(new Date(), "EEEE, MMMM d yyyy")}</p>

      <div style={S.statGrid}>
        <StatCard label="Active Now"        value={activeCount}        color="#10b981" icon="🟢" />
        <StatCard label="Total Employees"   value={employees.length}   color="#3b82f6" icon="👥" />
        <StatCard label="Screenshots Today" value={screenshots.length} color="#8b5cf6" icon="🖼" />
        <StatCard label="Avg Hours Today"   value={`${avgHrs}h`}       color="#f59e0b" icon="⏱" />
      </div>

      <div style={S.row}>
        <div style={S.card}>
          <div style={S.cardTitle}>Hours Tracked – Last 7 Days</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="hours" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Today's Sessions</div>
          {sessions.length === 0 && <div style={{ color: "#94a3b8", fontSize: 14 }}>No sessions today.</div>}
          {sessions.slice(0, 8).map(s => (
            <div key={s.id} style={S.empRow}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{s.employee_name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {s.punch_in ? format(new Date(s.punch_in), "h:mm a") : "—"} →{" "}
                  {s.punch_out ? format(new Date(s.punch_out), "h:mm a") : "ongoing"}
                </div>
              </div>
              <span style={{ ...S.badge, background: s.status === "active" ? "#dcfce7" : "#f1f5f9", color: s.status === "active" ? "#16a34a" : "#64748b" }}>
                {s.status === "active" ? "● Active" : "✓ Done"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
