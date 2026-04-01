import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { format } from "date-fns";
import { useAuth } from "../App";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from "recharts";

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  blue:    "#4F6EF7",
  green:   "#12B76A",
  amber:   "#F79009",
  red:     "#F04438",
  purple:  "#8B5CF6",
  indigo:  "#6366F1",
  bg:      "#F7F8FA",
  card:    "#FFFFFF",
  border:  "#E2E8F0",
  text:    "#101828",
  sub:     "#344054",
  muted:   "#667085",
  light:   "#F9FAFB",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  C.blue, C.purple, C.green, C.amber, C.red,
  "#EC4899","#06B6D4","#84CC16","#F97316", C.indigo,
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

function fmtHMdec(mins) {
  return (mins / 60).toFixed(1) + "h";
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

const pulse = `
  @keyframes tm-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
  @keyframes tm-ring {
    0%   { box-shadow: 0 0 0 0   rgba(18,182,106,0.5); }
    70%  { box-shadow: 0 0 0 8px rgba(18,182,106,0);   }
    100% { box-shadow: 0 0 0 0   rgba(18,182,106,0);   }
  }
`;

function SkeletonBlock({ w = "100%", h = 16, r = 6, mb = 0 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "#E2E8F0", marginBottom: mb,
      animation: "tm-pulse 1.5s ease-in-out infinite",
    }} />
  );
}

function SkeletonDashboard() {
  return (
    <div>
      <style>{pulse}</style>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 24 }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
            <SkeletonBlock w={80} h={12} mb={12} />
            <SkeletonBlock w={60} h={28} mb={8} />
            <SkeletonBlock w={100} h={10} />
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 20 }}>
        <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, height: 240 }}>
          <SkeletonBlock w={180} h={14} mb={20} />
          <SkeletonBlock h={160} r={8} />
        </div>
        <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
          <SkeletonBlock w={120} h={14} mb={20} />
          {[...Array(3)].map((_, i) => <SkeletonBlock key={i} h={40} r={8} mb={10} />)}
        </div>
      </div>
      <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
        <SkeletonBlock w={140} h={14} mb={20} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
          {[...Array(4)].map((_, i) => <SkeletonBlock key={i} h={160} r={12} />)}
        </div>
      </div>
    </div>
  );
}

// ── KPI Stat Card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "20px 22px",
      border: `1px solid ${C.border}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      display: "flex", alignItems: "flex-start", gap: 14,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: color + "1A",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 500, marginBottom: 4, whiteSpace: "nowrap" }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

// ── Team split widget ─────────────────────────────────────────────────────────

function TeamSplitWidget({ active, done, absent, total }) {
  const rows = [
    { label: "Active",  count: active,  color: C.green,  dot: "●" },
    { label: "Done",    count: done,    color: C.muted,  dot: "✓" },
    { label: "Absent",  count: absent,  color: C.amber,  dot: "○" },
  ];
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6 }}>Team Overview</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>{total} employees total</div>

      {rows.map(({ label, count, color, dot }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ width: 28, fontSize: 14, color, fontWeight: 700 }}>{dot}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{count}</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: C.border, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 4, background: color,
                width: total ? `${(count / total) * 100}%` : "0%",
                transition: "width 0.6s ease",
              }} />
            </div>
          </div>
        </div>
      ))}

      {/* Activity score ring placeholder */}
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Tracking rate</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: `conic-gradient(${C.green} ${total ? (active / total) * 360 : 0}deg, ${C.border} 0deg)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.card,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, color: C.text }}>
              {total ? Math.round((active / total) * 100) : 0}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{total ? Math.round((active / total) * 100) : 0}% online</div>
            <div style={{ fontSize: 11, color: C.muted }}>right now</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Top Apps Widget ───────────────────────────────────────────────────────────

function TopAppsWidget({ apps }) {
  if (!apps || apps.length === 0) return null;
  const maxSecs = apps[0]?.total_seconds || 1;

  const APP_COLORS = [C.blue, C.purple, C.green, C.amber, C.indigo];

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: 24,
      border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Top Apps Today</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Most used across the team</div>
      {apps.slice(0, 5).map((app, i) => {
        const mins = Math.round((app.total_seconds || app.duration_seconds || 0) / 60);
        const pct  = ((app.total_seconds || app.duration_seconds || 0) / maxSecs) * 100;
        return (
          <div key={app.app_name} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: APP_COLORS[i % APP_COLORS.length] + "20",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12,
                }}>
                  💻
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.sub,
                               maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {app.app_name}
                </span>
              </div>
              <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>
                {fmtHM(mins)}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: C.border }}>
              <div style={{
                height: "100%", borderRadius: 4,
                background: APP_COLORS[i % APP_COLORS.length],
                width: `${pct}%`, transition: "width 0.8s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.text, color: "#fff", borderRadius: 8, padding: "8px 14px",
      fontSize: 12, fontWeight: 500, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    }}>
      <div style={{ color: "#9CA3AF", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{payload[0].value}h</div>
    </div>
  );
}

// ── Enhanced Employee Card ────────────────────────────────────────────────────

function EmployeeCard({ employee, session, lastScreenshot }) {
  const active  = session?.status === "active";
  const done    = session && !active;
  const color   = avatarColor(employee.name);
  const timeToday   = fmtHM(session?.total_minutes || 0);
  const punchInStr  = session?.punch_in ? format(new Date(session.punch_in), "h:mm a") : null;

  const statusColor = active ? C.green : done ? C.muted : C.amber;
  const statusLabel = active ? "Active" : done ? "Done" : "Absent";
  const statusBg    = active ? "#ECFDF5" : done ? "#F8FAFC" : "#FFFBEB";

  return (
    <div style={{
      background: C.card,
      borderRadius: 14,
      border: `1.5px solid ${active ? "#A7F3D0" : C.border}`,
      boxShadow: active
        ? "0 0 0 3px rgba(18,182,106,0.12), 0 2px 8px rgba(0,0,0,0.06)"
        : "0 1px 4px rgba(0,0,0,0.06)",
      overflow: "hidden",
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = active ? "0 0 0 3px rgba(18,182,106,0.12),0 2px 8px rgba(0,0,0,0.06)" : "0 1px 4px rgba(0,0,0,0.06)"; }}
    >
      {/* Screenshot / Avatar strip */}
      <div style={{ position: "relative", height: 90, background: active ? "#F0FDF4" : C.light, overflow: "hidden" }}>
        {lastScreenshot?.file_path ? (
          <img
            src={lastScreenshot.file_path}
            alt="screenshot"
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: active ? 1 : 0.55 }}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, color: "#fff",
              animation: active ? "tm-ring 2s infinite" : "none",
            }}>
              {initials(employee.name)}
            </div>
          </div>
        )}

        {/* Status badge overlay */}
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: statusBg, color: statusColor,
          fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
          backdropFilter: "blur(4px)",
        }}>
          {active ? "● " : done ? "✓ " : "○ "}{statusLabel}
        </div>

        {/* Screen permission warning */}
        {employee.screen_permission === 0 && (
          <div style={{
            position: "absolute", top: 8, left: 8,
            background: "#fef3c7", color: "#92400e",
            fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 20,
            display: "flex", alignItems: "center", gap: 3,
          }} title="Screen recording permission denied — screenshots disabled">
            📵 No Screenshots
          </div>
        )}
      </div>

      <div style={{ padding: "12px 14px" }}>
        {/* Name */}
        <div style={{
          fontWeight: 700, fontSize: 13, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 2,
        }}>
          {employee.name}
        </div>

        {/* Department */}
        {employee.department && (
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{employee.department}</div>
        )}

        {/* Time tracked */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{
            fontSize: 15, fontWeight: 700,
            color: active ? C.green : C.muted,
          }}>
            {timeToday}
          </span>
          {punchInStr && (
            <span style={{ fontSize: 10, color: C.muted }}>since {punchInStr}</span>
          )}
        </div>

        {/* Task chip */}
        {session?.task_name && (
          <div style={{
            fontSize: 11, color: C.indigo, fontWeight: 500,
            background: "#EEF2FF", borderRadius: 6, padding: "3px 8px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            marginBottom: 4,
          }}>
            📌 {session.task_name}
          </div>
        )}

        {/* Screenshot time */}
        {lastScreenshot?.captured_at && (
          <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>
            📷 {format(new Date(lastScreenshot.captured_at), "h:mm a")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Employee Personal Dashboard ───────────────────────────────────────────────

function EmployeeDashboard({ user }) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [sessions,    setSessions]    = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [chartData,   setChartData]   = useState([]);
  const [topApps,     setTopApps]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const autoRef = useRef(null);

  const load = useCallback(async () => {
    const [sess, stats, ss, apps] = await Promise.all([
      api.getMySessions(today).catch(() => []),
      api.getMySessionStats(7).catch(() => []),
      api.getMyScreenshots(today).catch(() => []),
      api.getMyActivitySummary(today).catch(() => []),
    ]);

    setSessions(sess);
    setScreenshots(ss);

    const statsByDate = Object.fromEntries((stats || []).map(r => [r.date.slice(0, 10), r]));
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().slice(0, 10);
      const row     = statsByDate[dateStr];
      return {
        date:  dateStr,
        day:   format(new Date(dateStr + "T00:00:00"), "EEE"),
        hours: +(((row?.total_minutes || 0)) / 60).toFixed(1),
      };
    });
    setChartData(last7);

    const appList = Array.isArray(apps) ? apps : (apps?.apps || apps?.data || []);
    setTopApps([...appList].sort((a, b) =>
      (b.total_seconds || b.duration_seconds || 0) - (a.total_seconds || a.duration_seconds || 0)
    ));
    setLastRefresh(new Date());
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    autoRef.current = setInterval(load, 30_000);
    return () => clearInterval(autoRef.current);
  }, [load]);

  if (loading) return <SkeletonDashboard />;

  const activeSession = sessions.find(s => s.status === "active");
  const totalMins     = sessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
  const todayLabel    = format(new Date(), "EEE");

  return (
    <div style={{ maxWidth: 1280 }}>
      <style>{pulse}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0 }}>
            My Dashboard
          </h1>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
            {format(new Date(), "EEEE, MMMM d yyyy")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: activeSession ? C.green : C.muted,
                        animation: activeSession ? "tm-ring 2s infinite" : "none" }} />
          <span style={{ fontSize: 12, color: C.muted }}>
            {activeSession ? "Tracking · " : ""}refreshed {format(lastRefresh, "h:mm:ss a")}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Status"           value={activeSession ? "Active" : "Offline"} color={activeSession ? C.green : C.muted} icon={activeSession ? "🟢" : "⚫"} sub={activeSession ? `since ${format(new Date(activeSession.punch_in), "h:mm a")}` : "not tracking"} />
        <StatCard label="Hours Today"      value={fmtHMdec(totalMins)}  color={C.blue}   icon="⏱" sub={`${sessions.length} session${sessions.length !== 1 ? "s" : ""}`} />
        <StatCard label="Screenshots"      value={screenshots.length}   color={C.purple} icon="📷" sub="captured today" />
        <StatCard label="This Week"        value={fmtHMdec(chartData.reduce((a, d) => a + d.hours * 60, 0))} color={C.indigo} icon="📊" sub="total tracked" />
      </div>

      {/* Chart row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>My Hours</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Last 7 days</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9", radius: 6 }} />
              <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.day === todayLabel ? C.blue : "#BFDBFE"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent screenshots */}
        <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Recent Screenshots</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Today</div>
          {screenshots.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", paddingTop: 20 }}>No screenshots yet today</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {screenshots.slice(0, 4).map(ss => (
                <div key={ss.id} style={{ borderRadius: 8, overflow: "hidden", background: C.light, aspectRatio: "16/10" }}>
                  {ss.file_path
                    ? <img src={`${ss.file_path}?token=${encodeURIComponent(sessionStorage.getItem("tm_token") || "")}`} alt="screenshot"
                           style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🖥</div>
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {topApps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <TopAppsWidget apps={topApps} />
        </div>
      )}
    </div>
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────

function AdminDashboard() {
  const today = format(new Date(), "yyyy-MM-dd");

  const [sessions,    setSessions]    = useState([]);
  const [employees,   setEmployees]   = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [chartData,   setChartData]   = useState([]);
  const [topApps,     setTopApps]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const autoRef = useRef(null);

  const load = useCallback(async () => {
    const [sess, stats, ss, emps, apps] = await Promise.all([
      api.getSessions(today).catch(() => []),
      api.getSessionStats(7).catch(() => []),
      api.getScreenshots(today).catch(() => []),
      api.getEmployees().catch(() => []),
      api.getActivitySummary(today).catch(() => []),
    ]);

    setSessions(sess);
    setScreenshots(ss);
    setEmployees(emps.filter(e => e.is_active !== 0));

    const statsByDate = Object.fromEntries((stats || []).map(r => [r.date.slice(0, 10), r]));
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().slice(0, 10);
      const row     = statsByDate[dateStr];
      return {
        date:  dateStr,
        day:   format(new Date(dateStr + "T00:00:00"), "EEE"),
        hours: +(((row?.total_minutes || 0)) / 60).toFixed(1),
      };
    });
    setChartData(last7);

    const appList = Array.isArray(apps) ? apps : (apps?.apps || apps?.data || []);
    const sorted  = [...appList].sort((a, b) =>
      (b.total_seconds || b.duration_seconds || 0) - (a.total_seconds || a.duration_seconds || 0)
    );
    setTopApps(sorted);
    setLastRefresh(new Date());
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    autoRef.current = setInterval(load, 30_000);
    return () => clearInterval(autoRef.current);
  }, [load]);

  if (loading) return <SkeletonDashboard />;

  const activeCount  = sessions.filter(s => s.status === "active").length;
  const doneCount    = sessions.filter(s => s.status !== "active").length;
  const absentCount  = Math.max(0, employees.length - sessions.length);
  const totalMins    = sessions.reduce((a, s) => a + (s.total_minutes || 0), 0);
  const avgMins      = sessions.length ? totalMins / sessions.length : 0;

  const sessionByEmp = {};
  sessions.forEach(s => {
    const prev = sessionByEmp[s.employee_id];
    if (!prev || s.status === "active" || new Date(s.punch_in) > new Date(prev.punch_in)) {
      sessionByEmp[s.employee_id] = s;
    }
  });

  const screenshotByEmp = {};
  screenshots.forEach(ss => {
    if (!screenshotByEmp[ss.employee_id]) screenshotByEmp[ss.employee_id] = ss;
  });

  const sortedEmployees = [...employees].sort((a, b) => {
    const sa = sessionByEmp[a.id], sb = sessionByEmp[b.id];
    const rank = s => s?.status === "active" ? 0 : s ? 1 : 2;
    return rank(sa) - rank(sb) || a.name.localeCompare(b.name);
  });

  const todayLabel = format(new Date(), "EEE");

  return (
    <div style={{ maxWidth: 1280 }}>
      <style>{pulse}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0 }}>Dashboard</h1>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
            {format(new Date(), "EEEE, MMMM d yyyy")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green,
                        animation: "tm-ring 2s infinite" }} />
          <span style={{ fontSize: 12, color: C.muted }}>
            Live · refreshed {format(lastRefresh, "h:mm:ss a")}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Active Now"         value={activeCount}             color={C.green}  icon="🟢" sub={`of ${employees.length} employees`} />
        <StatCard label="Total Employees"    value={employees.length}        color={C.blue}   icon="👥" sub="registered" />
        <StatCard label="Screenshots Today"  value={screenshots.length}      color={C.purple} icon="📷" sub="captured today" />
        <StatCard label="Avg Hours Today"    value={fmtHMdec(avgMins)}       color={C.amber}  icon="⏱" sub="per active employee" />
        <StatCard label="Total Hours Today"  value={fmtHMdec(totalMins)}     color={C.indigo} icon="📊" sub="across team" />
      </div>

      {/* Chart row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>

        {/* Hours bar chart */}
        <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Hours Tracked</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Last 7 days</div>
            </div>
            <div style={{ fontSize: 12, color: C.muted, background: C.light, padding: "4px 10px", borderRadius: 6 }}>
              Total: {fmtHMdec(chartData.reduce((a, d) => a + d.hours * 60, 0))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={chartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: C.muted }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F1F5F9", radius: 6 }} />
              <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.day === todayLabel ? C.blue : "#BFDBFE"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Team split */}
        <TeamSplitWidget
          active={activeCount}
          done={doneCount}
          absent={absentCount}
          total={employees.length}
        />
      </div>

      {/* Top apps + second row */}
      {topApps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <TopAppsWidget apps={topApps} />
        </div>
      )}

      {/* Live Status Board */}
      <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Live Status Board</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Real-time employee activity</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: "#ECFDF5", color: C.green, fontWeight: 600 }}>
              ● {activeCount} active
            </span>
            <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: C.light, color: C.muted, fontWeight: 500 }}>
              ○ {absentCount} absent
            </span>
          </div>
        </div>

        {employees.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "40px 0" }}>
            No employees yet. Add employees to see them here.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
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

// ── Dashboard (role-aware entry point) ───────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminDashboard />;
  return <EmployeeDashboard user={user} />;
}
