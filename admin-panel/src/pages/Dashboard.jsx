import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { format } from "date-fns";
import { fmtTime } from "../tz";
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

// A session is "stale" if active but no heartbeat for >6 minutes.
// Heartbeat fires every 5 min; 6-min window = 1 min grace after a missed beat.
function isStaleSession(s) {
  if (s?.status !== "active") return false;
  if (s.last_heartbeat_at) {
    return Date.now() > new Date(s.last_heartbeat_at).getTime() + 6 * 60000;
  }
  // Fallback: punch_in + tracked time + 6 min buffer
  const punchIn    = new Date(s.punch_in).getTime();
  const trackedMs  = (s.total_minutes || 0) * 60000;
  return Date.now() > punchIn + trackedMs + 6 * 60000;
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

// ── Employee Timeline ─────────────────────────────────────────────────────────

function EmployeeTimeline({ employee, sessions, idleLogs = [] }) {
  const color = avatarColor(employee.name);
  const now   = new Date();

  // Determine span: earliest punch-in to now, minimum 8h window starting at 8 AM
  const sorted  = [...sessions].sort((a, b) => new Date(a.punch_in) - new Date(b.punch_in));
  const first   = sorted[0] ? new Date(sorted[0].punch_in) : now;
  const spanStart = new Date(first);
  spanStart.setHours(Math.min(spanStart.getHours(), 8), 0, 0, 0);
  const spanEnd   = new Date(Math.max(now, new Date(spanStart.getTime() + 8 * 60 * 60 * 1000)));
  const spanMs    = spanEnd - spanStart;

  function xPct(date) {
    return Math.min(100, Math.max(0, ((new Date(date) - spanStart) / spanMs) * 100));
  }
  function widthPct(start, end) {
    return Math.max(0.4, xPct(end) - xPct(start));
  }

  // Hour tick labels
  const ticks = [];
  for (let h = spanStart.getHours(); h <= spanEnd.getHours(); h++) {
    const d = new Date(spanStart); d.setHours(h, 0, 0, 0);
    ticks.push({ label: h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`, pct: xPct(d) });
  }

  const nowPct = xPct(now);

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Name row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 22, height: 22, borderRadius: "50%", background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0,
        }}>
          {initials(employee.name)}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.sub }}>{employee.name}</span>
        <span style={{ fontSize: 11, color: C.muted }}>
          {(() => {
            const trackedMins = sessions.reduce((a, s) => a + (Number(s.total_minutes) || 0), 0);
            const firstIn = sorted[0]?.punch_in;
            const wallMins = firstIn ? Math.round((now - new Date(firstIn)) / 60000) : 0;
            // Show tracked time; if lid-close gap makes wall clock much larger, show both
            if (wallMins > trackedMins + 10) {
              return <>{fmtHM(trackedMins)} tracked · {fmtHM(wallMins)} elapsed</>;
            }
            return <>{fmtHM(trackedMins)} today</>;
          })()}
        </span>
        {sessions.some(s => s.status === "active" && !isStaleSession(s)) && (
          <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: "#ECFDF5", padding: "1px 7px", borderRadius: 20 }}>● LIVE</span>
        )}
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 20 }}>
        {/* Track */}
        <div style={{ position: "absolute", top: 4, left: 0, right: 0, height: 12, background: C.border, borderRadius: 6 }} />

        {/* Inactive gaps — periods between sessions where employee was punched out */}
        {sorted.slice(0, -1).map((s, i) => {
          const gapStart = s.punch_out;
          const gapEnd   = sorted[i + 1]?.punch_in;
          if (!gapStart || !gapEnd) return null;
          const gapMins = Math.round((new Date(gapEnd) - new Date(gapStart)) / 60000);
          if (gapMins < 2) return null;
          const x = xPct(gapStart);
          const w = widthPct(gapStart, gapEnd);
          return (
            <div key={`gap-${i}`}
              title={`Inactive · ${fmtTime(gapStart)} → ${fmtTime(gapEnd)} (${gapMins}m)`}
              style={{
                position: "absolute", top: 4, height: 12, borderRadius: 4,
                left: `${x}%`, width: `${Math.max(w, 0.6)}%`,
                background: "#FEE2E2",
                border: "1px solid #FCA5A5",
                cursor: "default",
                zIndex: 1,
              }}
            />
          );
        })}

        {/* Break segments — from session.breaks (recorded by macOS agent) */}
        {sorted.flatMap((s, si) =>
          (s.breaks || []).map((b, bi) => {
            const bEnd = b.end ? new Date(b.end) : (s.status === "active" ? now : null);
            if (!bEnd) return null;
            const breakMins = Math.round((bEnd - new Date(b.start)) / 60000);
            if (breakMins < 2) return null;  // filter sub-2-min noise / old false breaks
            const x = xPct(b.start);
            const w = widthPct(b.start, bEnd);
            return (
              <div key={`break-${si}-${bi}`}
                title={`Break · ${fmtTime(b.start)} → ${b.end ? fmtTime(bEnd) : "ongoing"} (${breakMins}m)`}
                style={{
                  position: "absolute", top: 4, height: 12, borderRadius: 4,
                  left: `${x}%`, width: `${Math.max(w, 0.6)}%`,
                  background: "#FCD34D",
                  border: "1px solid #D97706",
                  cursor: "default",
                  zIndex: 3,
                }}
              />
            );
          })
        )}

        {/* Idle segments — from idle_logs (app idle detection by macOS agent) */}
        {idleLogs.map((il, i) => {
          if (!il.idle_start) return null;
          const idleMins = Math.round((il.duration_seconds || 0) / 60);
          if (idleMins < 1) return null;
          const x = xPct(il.idle_start);
          const w = widthPct(il.idle_start, il.idle_end || new Date(new Date(il.idle_start).getTime() + (il.duration_seconds || 0) * 1000));
          return (
            <div key={`idle-${i}`}
              title={`Idle · ${fmtTime(il.idle_start)} → ${il.idle_end ? fmtTime(il.idle_end) : "?"} (${idleMins}m)`}
              style={{
                position: "absolute", top: 4, height: 12, borderRadius: 4,
                left: `${x}%`, width: `${Math.max(w, 0.4)}%`,
                background: "rgba(239,68,68,0.35)",
                border: "1px solid rgba(239,68,68,0.6)",
                cursor: "default",
                zIndex: 4,
              }}
            />
          );
        })}

        {/* Session segments — z-index 2 so they sit above the track but below breaks */}
        {sorted.map((s, i) => {
          const isActive  = s.status === "active";
          const hbAge     = s.last_heartbeat_at ? (now - new Date(s.last_heartbeat_at)) / 60000 : 999;
          const isStale   = isActive && hbAge >= 6;
          // Fresh heartbeat → extend green to now. Stale → stop at last_heartbeat_at so
          // the amber "away" bar covers the gap. Completed → stop at punch_out.
          const workedEnd = isActive
            ? (isStale ? s.last_heartbeat_at : now.toISOString())
            : (s.punch_out || s.punch_in);
          const x = xPct(s.punch_in);
          const w = widthPct(s.punch_in, workedEnd);
          return (
            <div key={i} title={`${s.task_name || s.jira_issue_key || "No task"} · ${fmtTime(s.punch_in)} → ${s.punch_out ? fmtTime(s.punch_out) : "now"} (${s.total_minutes || 0}m tracked)`}
              style={{
                position: "absolute", top: 4, height: 12, borderRadius: 4,
                left: `${x}%`, width: `${w}%`,
                background: isActive ? C.green : C.blue,
                opacity: isActive ? 1 : 0.85,
                cursor: "default",
                zIndex: 2,
              }}
            />
          );
        })}

        {/* Lid-close / away segments — amber from last_heartbeat_at → now when stale (>6 min) */}
        {sorted.map((s, i) => {
          if (s.status !== "active" || !s.last_heartbeat_at) return null;
          const hbAge = (now - new Date(s.last_heartbeat_at)) / 60000;
          if (hbAge < 6) return null; // fresh heartbeat — no away segment
          const x = xPct(s.last_heartbeat_at);
          const w = widthPct(s.last_heartbeat_at, now);
          return (
            <div key={`away-${i}`}
              title={`Lid closed / away · ${fmtTime(s.last_heartbeat_at)} → now (${Math.round(hbAge)}m)`}
              style={{
                position: "absolute", top: 4, height: 12, borderRadius: 4,
                left: `${x}%`, width: `${Math.max(w, 0.6)}%`,
                background: "#FCD34D", border: "1px solid #D97706",
                cursor: "default", zIndex: 2,
              }}
            />
          );
        })}

        {/* Now indicator */}
        <div style={{
          position: "absolute", top: 0, left: `${nowPct}%`,
          width: 2, height: 20, background: C.amber, borderRadius: 1,
          transform: "translateX(-50%)",
        }} />
      </div>

      {/* Time labels */}
      <div style={{ position: "relative", height: 14, marginTop: 2 }}>
        {ticks.filter((_, i) => i % 2 === 0).map((t, i) => (
          <span key={i} style={{
            position: "absolute", left: `${t.pct}%`,
            transform: "translateX(-50%)",
            fontSize: 9, color: C.muted,
          }}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}

// ── Team split widget ─────────────────────────────────────────────────────────

function TeamSplitWidget({ active, idle, done, absent, total }) {
  const rows = [
    { label: "Active",  count: active,  color: C.green,  dot: "●" },
    ...(idle > 0 ? [{ label: "Idle",    count: idle,    color: C.amber,  dot: "◌" }] : []),
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

function EmployeeCard({ employee, session, totalMinsToday = 0, lastScreenshot }) {
  const stale   = isStaleSession(session);
  const active  = session?.status === "active" && !stale;
  const idle    = session?.status === "active" && stale;
  const done    = session && !active && !idle;
  const color   = avatarColor(employee.name);
  const timeToday   = fmtHM(totalMinsToday);
  const punchInStr  = session?.punch_in ? fmtTime(session.punch_in) : null;

  const statusColor = active ? C.green : idle ? C.amber : done ? C.muted : C.amber;
  const statusLabel = active ? "Active" : idle ? "Idle" : done ? "Done" : "Absent";
  const statusBg    = active ? "#ECFDF5" : idle ? "#FFFBEB" : done ? "#F8FAFC" : "#FFFBEB";

  return (
    <div style={{
      background: C.card,
      borderRadius: 14,
      border: `1.5px solid ${active ? "#A7F3D0" : idle ? "#FDE68A" : C.border}`,
      boxShadow: active
        ? "0 0 0 3px rgba(18,182,106,0.12), 0 2px 8px rgba(0,0,0,0.06)"
        : "0 1px 4px rgba(0,0,0,0.06)",
      overflow: "hidden",
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = active ? "0 0 0 3px rgba(18,182,106,0.12),0 2px 8px rgba(0,0,0,0.06)" : idle ? "0 0 0 3px rgba(247,144,9,0.12),0 2px 8px rgba(0,0,0,0.06)" : "0 1px 4px rgba(0,0,0,0.06)"; }}
    >
      {/* Screenshot / Avatar strip */}
      <div style={{ position: "relative", height: 90, background: active ? "#F0FDF4" : idle ? "#FFFBEB" : C.light, overflow: "hidden" }}>
        {lastScreenshot?.file_path ? (
          <img
            src={`${lastScreenshot.file_path}?token=${encodeURIComponent(localStorage.getItem("tm_token") || "")}`}
            alt="screenshot"
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: active ? 1 : idle ? 0.6 : 0.55 }}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, color: "#fff",
              animation: "none",
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
          {active ? "● " : idle ? "◌ " : done ? "✓ " : "○ "}{statusLabel}
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
            color: active ? C.green : idle ? C.amber : C.muted,
          }}>
            {timeToday}
          </span>
          {punchInStr && (
            <span style={{ fontSize: 10, color: C.muted }}>since {punchInStr}</span>
          )}
        </div>

        {/* Task / Jira chip */}
        {(session?.task_name || session?.jira_issue_key) && (
          <div style={{
            fontSize: 11, fontWeight: 500,
            color:      session?.task_name ? C.indigo : "#0052CC",
            background: session?.task_name ? "#EEF2FF" : "#DBEAFE",
            borderRadius: 6, padding: "3px 8px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            marginBottom: 4,
          }}>
            {session?.task_name ? `📌 ${session.task_name}` : `🔗 ${session.jira_issue_key}`}
          </div>
        )}

        {/* Bottom row: screenshot time + agent version */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          {lastScreenshot?.captured_at ? (
            <div style={{ fontSize: 10, color: "#CBD5E1" }}>
              📷 {fmtTime(lastScreenshot.captured_at)}
            </div>
          ) : <div />}
          {employee.agent_version && (
            <div style={{
              fontSize: 9, fontWeight: 600, color: "#64748B",
              background: "#F1F5F9", borderRadius: 4, padding: "2px 6px",
              letterSpacing: "0.02em",
            }} title="macOS agent version">
              v{employee.agent_version}
            </div>
          )}
        </div>
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
      <div className="tm-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Status"           value={activeSession ? "Active" : "Offline"} color={activeSession ? C.green : C.muted} icon={activeSession ? "🟢" : "⚫"} sub={activeSession ? `since ${fmtTime(activeSession.punch_in)}` : "not tracking"} />
        <StatCard label="Hours Today"      value={fmtHMdec(totalMins)}  color={C.blue}   icon="⏱" sub={`${sessions.length} session${sessions.length !== 1 ? "s" : ""}`} />
        <StatCard label="Screenshots"      value={screenshots.length}   color={C.purple} icon="📷" sub="captured today" />
        <StatCard label="This Week"        value={fmtHMdec(chartData.reduce((a, d) => a + d.hours * 60, 0))} color={C.indigo} icon="📊" sub="total tracked" />
      </div>

      {/* Chart row */}
      <div className="tm-chart-row" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>
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
                    ? <img src={`${ss.file_path}?token=${encodeURIComponent(localStorage.getItem("tm_token") || "")}`} alt="screenshot"
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
  const [idleLogs,    setIdleLogs]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const autoRef = useRef(null);

  const load = useCallback(async () => {
    const [sess, stats, ss, emps, apps, tlData] = await Promise.all([
      api.getSessions(today).catch(() => []),
      api.getSessionStats(7).catch(() => []),
      api.getScreenshots(today).catch(() => []),
      api.getEmployees().catch(() => []),
      api.getActivitySummary(today).catch(() => []),
      api.getTimeline(today, today).catch(() => ({ idleLogs: [] })),
    ]);

    setSessions(sess);
    setScreenshots(ss);
    setEmployees(emps.filter(e => e.is_active === 1));
    setIdleLogs(tlData?.idleLogs || []);

    // DEBUG — remove after confirming idle logs work
    console.log('[Dashboard] tlData raw:', tlData);
    console.log('[Dashboard] idleLogs count:', (tlData?.idleLogs || []).length, tlData?.idleLogs);
    console.log('[Dashboard] sessions with breaks:', (sess || []).map(s => ({ id: s.id, emp: s.employee_id, breaks: s.breaks })));

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

  // Only consider sessions belonging to active employees — prevents deactivated/deleted
  // employee sessions from inflating active/total counts.
  const activeEmpIds = new Set(employees.map(e => e.id));
  const activeSessions = sessions.filter(s => activeEmpIds.has(s.employee_id));

  const totalMins    = activeSessions.reduce((a, s) => a + (s.total_minutes || 0), 0);

  // sum all sessions per employee for accurate daily total
  const totalMinsByEmp = {};
  const sessionsByEmpAll = {};
  activeSessions.forEach(s => {
    totalMinsByEmp[s.employee_id] = (totalMinsByEmp[s.employee_id] || 0) + (s.total_minutes || 0);
    if (!sessionsByEmpAll[s.employee_id]) sessionsByEmpAll[s.employee_id] = [];
    sessionsByEmpAll[s.employee_id].push(s);
  });
  const activeEmpCount = Object.keys(totalMinsByEmp).length;
  const avgMins        = activeEmpCount ? totalMins / activeEmpCount : 0;

  // Group idle logs by employee for timeline rendering
  const idleLogsByEmp = {};
  idleLogs.forEach(il => {
    const eid = il.employee_id;
    if (!idleLogsByEmp[eid]) idleLogsByEmp[eid] = [];
    idleLogsByEmp[eid].push(il);
  });

  // Build latest-session-per-employee map
  const sessionByEmp = {};
  activeSessions.forEach(s => {
    const prev = sessionByEmp[s.employee_id];
    if (!prev || s.status === "active" || new Date(s.punch_in) > new Date(prev.punch_in)) {
      sessionByEmp[s.employee_id] = s;
    }
  });

  // "Done" = employee whose LATEST session is completed (not punched back in)
  // "Active" = employee whose latest session is still active AND heartbeat < 6 min ago
  // "Idle"   = active session but no heartbeat for >6 min (asleep / logged out)
  // "Absent" = no sessions at all today
  const activeCount = Object.values(sessionByEmp).filter(s => s.status === "active" && !isStaleSession(s)).length;
  const idleCount   = Object.values(sessionByEmp).filter(s => isStaleSession(s)).length;
  const doneCount   = Object.values(sessionByEmp).filter(s => s.status !== "active").length;
  const absentCount = Math.max(0, employees.length - Object.keys(sessionByEmp).length);

  const screenshotByEmp = {};
  screenshots.forEach(ss => {
    if (!screenshotByEmp[ss.employee_id]) screenshotByEmp[ss.employee_id] = ss;
  });

  const sortedEmployees = [...employees].sort((a, b) => {
    const sa = sessionByEmp[a.id], sb = sessionByEmp[b.id];
    // active=0, idle=1, done=2, absent=3
    const rank = s => s?.status === "active" ? (isStaleSession(s) ? 1 : 0) : s ? 2 : 3;
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
      <div className="tm-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 20 }}>
        <StatCard label="Active Now"         value={activeCount}             color={C.green}  icon="🟢" sub={idleCount > 0 ? `${idleCount} idle` : `of ${employees.length} employees`} />
        <StatCard label="Total Employees"    value={employees.length}        color={C.blue}   icon="👥" sub="registered" />
        <StatCard label="Screenshots Today"  value={screenshots.length}      color={C.purple} icon="📷" sub="captured today" />
        <StatCard label="Avg Hours Today"    value={fmtHMdec(avgMins)}       color={C.amber}  icon="⏱" sub="per active employee" />
        <StatCard label="Total Hours Today"  value={fmtHMdec(totalMins)}     color={C.indigo} icon="📊" sub="across team" />
      </div>

      {/* Chart row */}
      <div className="tm-chart-row" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>

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
          idle={idleCount}
          done={doneCount}
          absent={absentCount}
          total={employees.length}
        />
      </div>

      {/* Employee Timelines */}
      {Object.keys(sessionsByEmpAll).length > 0 && (
        <div style={{ background: C.card, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>Today's Timelines</div>
              <div style={{ fontSize: 12, color: C.muted }}>Hover any segment for details</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {[
                { color: C.green,                  label: "Active" },
                { color: C.blue,                   label: "Worked", opacity: 0.85 },
                { color: "#FCD34D",                label: "Break",    border: "1px solid #D97706" },
                { color: "rgba(239,68,68,0.35)",   label: "Idle",     border: "1px solid rgba(239,68,68,0.6)" },
                { color: "#FCA5A5",                label: "Inactive", border: "1px solid #FCA5A5" },
              ].map(({ color, label, opacity, border }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 12, height: 8, borderRadius: 2, background: color, opacity: opacity || 1, border: border || "none" }} />
                  <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          {sortedEmployees.filter(emp => sessionsByEmpAll[emp.id]).map(emp => (
            <EmployeeTimeline
              key={emp.id}
              employee={emp}
              sessions={sessionsByEmpAll[emp.id] || []}
              idleLogs={idleLogsByEmp[emp.id] || []}
            />
          ))}
        </div>
      )}

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
          <div className="tm-employee-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14 }}>
            {sortedEmployees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                session={sessionByEmp[emp.id]}
                totalMinsToday={totalMinsByEmp[emp.id] || 0}
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
