import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// ── Palette for employee avatars ─────────────────────────────────────────────

const AVATAR_COLORS = [
  "#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444",
  "#ec4899","#06b6d4","#84cc16","#f97316","#6366f1",
];

function avatarColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name = "") {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function fmtHM(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

// ── Status Board Card ─────────────────────────────────────────────────────────

function EmployeeCard({ employee, session, lastScreenshot }) {
  const active   = session?.status === "active";
  const done     = session && !active;
  const absent   = !session;
  const color    = avatarColor(employee.name);
  const timeToday = fmtHM(session?.total_minutes || 0);
  const punchInStr = session?.punch_in ? format(new Date(session.punch_in), "h:mm a") : null;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      border: `1px solid ${active ? "#bbf7d0" : "#e2e8f0"}`,
      boxShadow: active ? "0 0 0 2px #86efac" : "0 1px 3px rgba(0,0,0,0.07)",
      overflow: "hidden",
      transition: "box-shadow 0.2s",
    }}>
      {/* Screenshot strip */}
      {lastScreenshot?.file_path ? (
        <div style={{ height: 80, overflow: "hidden", background: "#f1f5f9" }}>
          <img
            src={lastScreenshot.file_path}
            alt="last screenshot"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: active ? 1 : 0.5 }}
          />
        </div>
      ) : (
        <div style={{ height: 80, background: active ? "#f0fdf4" : "#f8fafc",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: color, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 700, color: "#fff",
          }}>
            {initials(employee.name)}
          </div>
        </div>
      )}

      <div style={{ padding: "12px 14px" }}>
        {/* Name + status dot */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
            {employee.name}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
            background: active ? "#dcfce7" : done ? "#f1f5f9" : "#fef9c3",
            color:      active ? "#16a34a" : done ? "#64748b" : "#92400e",
          }}>
            {active ? "● Active" : done ? "✓ Done" : "○ Absent"}
          </span>
        </div>

        {/* Department */}
        {employee.department && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{employee.department}</div>
        )}

        {/* Time + punch-in */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: active ? "#16a34a" : "#64748b" }}>
            {timeToday}
          </span>
          {punchInStr && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>since {punchInStr}</span>
          )}
        </div>

        {/* Current task */}
        {session?.task_name && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#6366f1", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        background: "#ede9fe", borderRadius: 6, padding: "2px 7px", display: "inline-block" }}>
            {session.task_name}
          </div>
        )}

        {/* Last screenshot time */}
        {lastScreenshot?.captured_at && (
          <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 4 }}>
            Screenshot {format(new Date(lastScreenshot.captured_at), "h:mm a")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const S = {
  title:    { fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 },
  sub:      { color: "#64748b", marginTop: 4, fontSize: 14, marginBottom: 28 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 20, marginBottom: 28 },
  statCard: { background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" },
  card:     { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0" },
  cardTitle:{ fontSize: 16, fontWeight: 600, color: "#1e293b", marginBottom: 20 },
};

function StatCard({ label, value, color, icon }) {
  return (
    <div style={S.statCard}>
      <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500, marginBottom: 8 }}>{icon} {label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [sessions,     setSessions]     = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [screenshots,  setScreenshots]  = useState([]);
  const [chartData,    setChartData]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lastRefresh,  setLastRefresh]  = useState(new Date());
  const autoRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [sess, stats, ss, emps] = await Promise.all([
        api.getSessions(today),
        api.getSessionStats(7),
        api.getScreenshots(today),
        api.getEmployees(),
      ]);
      setSessions(sess);
      setScreenshots(ss);
      setEmployees(emps);
      setChartData(stats.map(r => ({
        day: format(new Date(r.date + "T00:00:00"), "EEE"),
        hours: +(r.total_minutes / 60).toFixed(1),
      })));
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    autoRef.current = setInterval(load, 30_000);
    return () => clearInterval(autoRef.current);
  }, [load]);

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading…</div>;

  const activeCount = sessions.filter(s => s.status === "active").length;
  const totalMins   = sessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
  const avgHrs      = sessions.length ? (totalMins / sessions.length / 60).toFixed(1) : 0;

  // Latest session per employee (prefer active, else latest by punch_in)
  const sessionByEmp = {};
  sessions.forEach(s => {
    const prev = sessionByEmp[s.employee_id];
    if (!prev || s.status === "active" || new Date(s.punch_in) > new Date(prev.punch_in)) {
      sessionByEmp[s.employee_id] = s;
    }
  });

  // Latest screenshot per employee (array already sorted DESC)
  const screenshotByEmp = {};
  screenshots.forEach(ss => {
    if (!screenshotByEmp[ss.employee_id]) screenshotByEmp[ss.employee_id] = ss;
  });

  // Sort employees: active first, then done, then absent
  const sortedEmployees = [...employees].sort((a, b) => {
    const sa = sessionByEmp[a.id], sb = sessionByEmp[b.id];
    const rank = s => s?.status === "active" ? 0 : s ? 1 : 2;
    return rank(sa) - rank(sb) || a.name.localeCompare(b.name);
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 0 }}>
        <h1 style={S.title}>Dashboard</h1>
        <div style={{ fontSize: 12, color: "#94a3b8" }}>
          Auto-refreshing · last {format(lastRefresh, "h:mm:ss a")}
        </div>
      </div>
      <p style={S.sub}>{format(new Date(), "EEEE, MMMM d yyyy")}</p>

      {/* Stats */}
      <div style={S.statGrid}>
        <StatCard label="Active Now"        value={activeCount}        color="#10b981" icon="🟢" />
        <StatCard label="Total Employees"   value={employees.length}   color="#3b82f6" icon="👥" />
        <StatCard label="Screenshots Today" value={screenshots.length} color="#8b5cf6" icon="🖼" />
        <StatCard label="Avg Hours Today"   value={`${avgHrs}h`}       color="#f59e0b" icon="⏱" />
      </div>

      {/* Chart */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={S.cardTitle}>Hours Tracked – Last 7 Days</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="day" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={v => `${v}h`} />
            <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Live Status Board */}
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={S.cardTitle}>Live Status Board</div>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {activeCount} active · {employees.length - activeCount} offline
          </span>
        </div>

        {employees.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>No employees yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {sortedEmployees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                session={sessionByEmp[emp.id]}
                lastScreenshot={screenshotByEmp[emp.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
