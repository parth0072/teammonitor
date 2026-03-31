import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { format, subDays } from "date-fns";

// App categorization
const PRODUCTIVE_KEYWORDS = [
  "code", "xcode", "visual studio", "intellij", "pycharm", "webstorm", "android studio",
  "sublime", "atom", "vim", "neovim", "emacs", "terminal", "iterm", "hyper", "warp",
  "figma", "sketch", "adobe", "photoshop", "illustrator", "affinity",
  "word", "excel", "powerpoint", "pages", "numbers", "keynote", "notion", "obsidian",
  "slack", "teams", "zoom", "meet", "webex", "mail", "outlook", "spark",
  "jira", "linear", "asana", "trello", "basecamp", "clickup",
  "postman", "insomnia", "tableplus", "sequel", "datagrip", "dbeaver",
  "docker", "github desktop", "sourcetree", "git", "filezilla",
  "safari", "chrome", "firefox", "edge", "arc",
];
const UNPRODUCTIVE_KEYWORDS = [
  "youtube", "netflix", "spotify", "apple music", "twitch", "hulu", "disney",
  "twitter", "facebook", "instagram", "tiktok", "snapchat", "reddit", "pinterest",
  "steam", "epic games", "minecraft", "fortnite", "valorant", "league of legends",
  "whatsapp", "telegram", "signal", "imessage",
];

function categorize(appName = "") {
  const lower = appName.toLowerCase();
  if (UNPRODUCTIVE_KEYWORDS.some(k => lower.includes(k))) return "unproductive";
  if (PRODUCTIVE_KEYWORDS.some(k => lower.includes(k)))   return "productive";
  return "neutral";
}

const CAT = {
  productive:   { label: "Productive",   color: "#16a34a", bg: "#dcfce7" },
  neutral:      { label: "Neutral",      color: "#2563eb", bg: "#dbeafe" },
  unproductive: { label: "Unproductive", color: "#dc2626", bg: "#fee2e2" },
};

const fmtH = m => { m = Math.round(Number(m) || 0); const h = Math.floor(m / 60), mn = m % 60; return h > 0 ? `${h}h ${mn}m` : `${mn}m`; };
const fmtS = s => { s = Math.round(Number(s) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

function ScoreRing({ score, size = 72 }) {
  if (score === null) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#94a3b8" }}>—</div>;
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#f59e0b" : "#dc2626";
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size > 60 ? 16 : 13, fontWeight: 700, color }}>
        {score}%
      </div>
    </div>
  );
}

function MiniBar({ days_data, metric = "score" }) {
  const vals = days_data.slice().reverse();
  const max  = Math.max(...vals.map(d => d[metric] || 0), 1);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 36 }}>
      {vals.map((d, i) => {
        const v = d[metric] || 0;
        const h = metric === "score" ? (v / 100) * 36 : (v / max) * 36;
        const color = metric === "score"
          ? (v >= 75 ? "#16a34a" : v >= 50 ? "#f59e0b" : v > 0 ? "#dc2626" : "#e2e8f0")
          : "#3b82f6";
        return (
          <div key={i} title={`${d.date}: ${metric === "score" ? v + "%" : fmtH(v)}`}
            style={{ flex: 1, minWidth: 6, height: Math.max(h, v > 0 ? 3 : 1), background: color, borderRadius: "2px 2px 0 0" }} />
        );
      })}
    </div>
  );
}

function AppCategoryBar({ topApps }) {
  const cats = { productive: 0, neutral: 0, unproductive: 0 };
  for (const a of topApps) cats[categorize(a.app_name)] += a.secs;
  const total = cats.productive + cats.neutral + cats.unproductive || 1;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
        {Object.entries(cats).map(([cat, secs]) => secs > 0 && (
          <div key={cat} style={{ flex: secs, background: CAT[cat].color }} title={`${CAT[cat].label}: ${fmtS(secs)}`} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        {Object.entries(cats).map(([cat, secs]) => (
          <div key={cat} style={{ fontSize: 11, color: "#64748b" }}>
            <span style={{ color: CAT[cat].color, fontWeight: 700 }}>{Math.round((secs / total) * 100)}%</span> {CAT[cat].label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Productivity() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === "admin";
  const [days,       setDays]       = useState(7);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState(null);
  const [sortBy,     setSortBy]     = useState("score"); // score | hours

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Employees always get their own data; admins get all
      setData(await api.getProductivity(days, isAdmin ? undefined : user?.id));
    }
    catch (e) { console.error(e); }
    setLoading(false);
  }, [days, isAdmin, user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color: "#64748b", padding: 40 }}>Loading…</div>;
  if (!data)   return <div style={{ color: "#ef4444", padding: 40 }}>Failed to load productivity data.</div>;

  const { employees, dateList } = data;

  const sorted = [...employees].sort((a, b) => {
    if (sortBy === "score") return (b.avgScore ?? -1) - (a.avgScore ?? -1);
    return b.totalTracked - a.totalTracked;
  });

  const teamAvgScore = (() => {
    const scored = employees.filter(e => e.avgScore !== null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s, e) => s + e.avgScore, 0) / scored.length);
  })();

  const teamTotalHours = employees.reduce((s, e) => s + e.totalTracked, 0);

  return (
    <div style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 }}>{isAdmin ? "Productivity Monitor" : "My Productivity"}</h1>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
            {isAdmin ? "Activity & productivity scores" : "Your activity & productivity scores"} for last {days} days
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: days === d ? "#3b82f6" : "#f1f5f9", color: days === d ? "#fff" : "#374151" }}>
              {d}d
            </button>
          ))}
          <button onClick={load} style={{ padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: "#f1f5f9", color: "#374151" }}>↻</button>
        </div>
      </div>

      {/* Team summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Team Avg Score",     value: teamAvgScore !== null ? `${teamAvgScore}%` : "—", color: teamAvgScore >= 75 ? "#16a34a" : teamAvgScore >= 50 ? "#f59e0b" : "#dc2626", bg: "#f0fdf4", icon: "📈" },
          { label: "Total Hours Tracked",value: fmtH(teamTotalHours),                             color: "#2563eb", bg: "#eff6ff", icon: "⏱" },
          { label: "Employees Tracked",  value: employees.filter(e => e.totalTracked > 0).length, color: "#7c3aed", bg: "#f5f3ff", icon: "👥" },
          { label: "Period",             value: `${days} days`,                                    color: "#0f766e", bg: "#f0fdfa", icon: "📅" },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: 12, padding: "18px 20px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>{c.icon}</span>{c.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color, letterSpacing: -0.5 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>Sort by:</span>
        {[{ key: "score", label: "Productivity Score" }, { key: "hours", label: "Hours Tracked" }].map(s => (
          <button key={s.key} onClick={() => setSortBy(s.key)}
            style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: sortBy === s.key ? "#3b82f6" : "#f1f5f9", color: sortBy === s.key ? "#fff" : "#374151" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Employee cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sorted.map((emp, rank) => {
          const isOpen = expanded === emp.id;
          const scoreColor = emp.avgScore >= 75 ? "#16a34a" : emp.avgScore >= 50 ? "#f59e0b" : "#dc2626";
          return (
            <div key={emp.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {/* Summary row */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", cursor: "pointer" }}
                onClick={() => setExpanded(isOpen ? null : emp.id)}>

                {/* Rank */}
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: rank === 0 ? "#fbbf24" : rank === 1 ? "#94a3b8" : rank === 2 ? "#cd7c2f" : "#e2e8f0",
                  color: rank < 3 ? "#fff" : "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {rank + 1}
                </div>

                {/* Avatar */}
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#3b82f6", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                  {(emp.name || "?").split(" ").map(x => x[0]).join("").toUpperCase().slice(0, 2)}
                </div>

                {/* Name + dept */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{emp.name}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{emp.department || "—"}</div>
                </div>

                {/* Hours bar */}
                <div style={{ width: 120, display: "none" }}>
                  <MiniBar days_data={emp.days_data} metric="tracked_minutes" />
                </div>

                {/* Stats */}
                <div style={{ display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#2563eb" }}>{fmtH(emp.totalTracked)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>Tracked</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>{fmtS(emp.totalIdle)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>Idle</div>
                  </div>
                  <ScoreRing score={emp.avgScore} size={60} />
                  <div style={{ width: 70, flexShrink: 0 }}>
                    <MiniBar days_data={emp.days_data} metric="score" />
                    <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 2, textAlign: "center" }}>trend</div>
                  </div>
                </div>

                <div style={{ color: "#94a3b8", fontSize: 18 }}>{isOpen ? "▲" : "▼"}</div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 20px 20px", background: "#fafafa" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>

                    {/* Daily breakdown */}
                    <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b", marginBottom: 12 }}>Daily Breakdown</div>
                      {emp.days_data.filter(d => d.tracked_minutes > 0).length === 0
                        ? <div style={{ color: "#94a3b8", fontSize: 13 }}>No activity in this period.</div>
                        : emp.days_data.slice().reverse().filter(d => d.tracked_minutes > 0).map(d => (
                          <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <div style={{ fontSize: 12, color: "#64748b", width: 72, flexShrink: 0 }}>
                              {format(new Date(d.date + "T00:00:00"), "EEE, MMM d")}
                            </div>
                            <div style={{ flex: 1, height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${d.score || 0}%`,
                                background: (d.score || 0) >= 75 ? "#16a34a" : (d.score || 0) >= 50 ? "#f59e0b" : "#ef4444",
                                borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", width: 34, textAlign: "right" }}>
                              {d.score !== null ? `${d.score}%` : "—"}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", width: 40, textAlign: "right" }}>
                              {fmtH(d.tracked_minutes)}
                            </div>
                          </div>
                        ))
                      }
                    </div>

                    {/* Top apps + category */}
                    <div style={{ background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b", marginBottom: 4 }}>Top Apps Used</div>
                      <AppCategoryBar topApps={emp.topApps} />
                      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                        {emp.topApps.length === 0
                          ? <div style={{ color: "#94a3b8", fontSize: 13 }}>No app data.</div>
                          : emp.topApps.map((a, i) => {
                            const cat = categorize(a.app_name);
                            const maxS = emp.topApps[0].secs;
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ fontSize: 12, color: "#374151", width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.app_name}</div>
                                <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${(a.secs / maxS) * 100}%`, background: CAT[cat].color, borderRadius: 3 }} />
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b", width: 40, textAlign: "right" }}>{fmtS(a.secs)}</div>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: CAT[cat].bg, color: CAT[cat].color }}>{CAT[cat].label}</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: 48 }}>📊</div>
            <div style={{ marginTop: 12, fontWeight: 600, fontSize: 16 }}>No productivity data yet</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>Data appears here once employees start tracking time.</div>
          </div>
        )}
      </div>
    </div>
  );
}
