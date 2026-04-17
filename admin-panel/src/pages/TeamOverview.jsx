import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { format, subDays } from "date-fns";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtMins(m) {
  if (!m || m <= 0) return "0h 0m";
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

const TASK_COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#f97316","#ec4899"];

// ── Comparison bar chart ──────────────────────────────────────────────────────

function HoursChart({ members }) {
  if (!members.length) return null;
  const max = Math.max(...members.map(m => m.total_minutes), 1);
  const target = 8 * 60; // 8h reference line

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>⏱ Hours Comparison</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "#64748b" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 28, height: 2, background: "#e2e8f0", display: "inline-block", borderRadius: 1, verticalAlign: "middle" }} />
            8h target
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[...members].sort((a, b) => b.total_minutes - a.total_minutes).map((m, i) => {
          const pct = (m.total_minutes / max) * 100;
          const targetPct = Math.min(100, (target / max) * 100);
          const pc = productivityColor(m.productive_percent);
          return (
            <div key={m.employee_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Avatar */}
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: TASK_COLORS[i % TASK_COLORS.length],
                            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {m.name.charAt(0).toUpperCase()}
              </div>
              {/* Name */}
              <div style={{ width: 110, fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>
                {m.name}
              </div>
              {/* Bar track */}
              <div style={{ flex: 1, height: 20, background: "#f1f5f9", borderRadius: 6, position: "relative", overflow: "visible" }}>
                {/* Target line */}
                <div style={{ position: "absolute", left: `${targetPct}%`, top: -3, bottom: -3, width: 1.5,
                              background: "#cbd5e1", zIndex: 2 }} />
                {/* Fill */}
                {m.total_minutes > 0 && (
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 6,
                                background: `linear-gradient(90deg, ${TASK_COLORS[i % TASK_COLORS.length]}cc, ${TASK_COLORS[i % TASK_COLORS.length]})`,
                                transition: "width 0.5s ease" }} />
                )}
              </div>
              {/* Hours label */}
              <div style={{ width: 54, fontSize: 13, fontWeight: 700, color: m.total_minutes > 0 ? "#1e293b" : "#94a3b8", textAlign: "right", flexShrink: 0 }}>
                {fmtMins(m.total_minutes)}
              </div>
              {/* Productivity badge */}
              <div style={{ width: 50, fontSize: 11, fontWeight: 700, textAlign: "center",
                            color: pc.text, background: pc.bg, borderRadius: 20,
                            padding: "2px 6px", flexShrink: 0 }}>
                {m.productive_percent}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Task donut (mini) ─────────────────────────────────────────────────────────

function TaskBar({ tasks, totalMinutes }) {
  if (!tasks.length || totalMinutes === 0) return (
    <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No tasks recorded</div>
  );
  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10, gap: 1 }}>
        {tasks.map((t, i) => (
          <div key={i} title={`${t.task_name} — ${fmtMins(t.minutes)}`}
            style={{ flex: t.minutes, background: TASK_COLORS[i % TASK_COLORS.length], minWidth: 2 }} />
        ))}
      </div>
      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {tasks.map((t, i) => {
          const pct = totalMinutes > 0 ? Math.round((t.minutes / totalMinutes) * 100) : 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: TASK_COLORS[i % TASK_COLORS.length], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.task_name}
                {t.jira_issue_key && <span style={{ marginLeft: 5, fontSize: 10, color: "#3b82f6", fontWeight: 700 }}>{t.jira_issue_key}</span>}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>{fmtMins(t.minutes)}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, width: 30, textAlign: "right" }}>{pct}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Employee card ─────────────────────────────────────────────────────────────

function EmployeeCard({ member, rank }) {
  const pc = productivityColor(member.productive_percent);
  const hasData = member.total_minutes > 0;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                  overflow: "hidden", opacity: hasData ? 1 : 0.6 }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9",
                    background: hasData ? "#f8fafc" : "#fff",
                    display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%",
                      background: TASK_COLORS[(rank - 1) % TASK_COLORS.length],
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {member.name}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>
            {member.session_count} session{member.session_count !== 1 ? "s" : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: hasData ? "#1e293b" : "#94a3b8" }}>
            {fmtMins(member.total_minutes)}
          </div>
          {hasData && (
            <div style={{ fontSize: 11, fontWeight: 700, color: pc.text,
                          background: pc.bg, borderRadius: 20, padding: "1px 8px",
                          display: "inline-block", marginTop: 2 }}>
              {member.productive_percent}% productive
            </div>
          )}
        </div>
      </div>
      {/* Task breakdown */}
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
                      letterSpacing: "0.06em", marginBottom: 8 }}>
          Tasks
        </div>
        <TaskBar tasks={member.tasks} totalMinutes={member.total_minutes} />
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
    { label: "Active Today",    value: `${active.length} / ${members.length}`, color: "#3b82f6", bg: "#eff6ff" },
    { label: "Total Hours",     value: fmtMins(totalMin),                      color: "#8b5cf6", bg: "#f5f3ff" },
    { label: "Avg Productivity",value: `${avgProd}%`,                          color: pc.text,   bg: pc.bg    },
    { label: "Unique Tasks",    value: allTasks.length,                        color: "#10b981", bg: "#d1fae5" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
      {stats.map(s => (
        <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`,
                                    borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamOverview() {
  const [date,    setDate]    = useState(DATE_OPTIONS[0].value);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const autoRef = useRef(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    try { setData(await api.getTeamOverview(d)); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  // Auto-refresh every 60s on today
  useEffect(() => {
    clearInterval(autoRef.current);
    if (date === DATE_OPTIONS[0].value) autoRef.current = setInterval(() => load(date), 60_000);
    return () => clearInterval(autoRef.current);
  }, [date, load]);

  const members = data?.members || [];

  return (
    <div style={{ width: "100%" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 }}>Team Overview</h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Hours & task breakdown per employee
            {date === DATE_OPTIONS[0].value && <span style={{ marginLeft: 8, color: "#10b981" }}>· auto-refreshing</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select
            value={date} onChange={e => setDate(e.target.value)}
            style={{ padding: "8px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8,
                     fontSize: 14, background: "#fff", cursor: "pointer" }}>
            {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => load(date)}
            style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
                     padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ↻
          </button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>Loading…</div>
      )}

      {data && (
        <>
          <SummaryStrip members={members} />
          <HoursChart members={members} />

          {/* Employee cards grid */}
          {members.filter(m => m.total_minutes > 0).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: 48 }}>📭</div>
              <div style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: "#64748b" }}>No tracked time for this date</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#64748b", marginBottom: 12,
                            textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Employee Breakdown
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16 }}>
                {/* Active first, then not started */}
                {[...members].sort((a, b) => b.total_minutes - a.total_minutes).map((m, i) => (
                  <EmployeeCard key={m.employee_id} member={m} rank={i + 1} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
