import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { fmtTime } from "../tz";
import { format, parseISO } from "date-fns";

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS = {
  open:        { label: "Open",        color: "#ef4444", bg: "#fef2f2", dot: "🔴" },
  in_progress: { label: "In Progress", color: "#f59e0b", bg: "#fffbeb", dot: "🟡" },
  resolved:    { label: "Resolved",    color: "#10b981", bg: "#f0fdf4", dot: "🟢" },
};

const CATEGORY_COLORS = {
  Bug:         { color: "#dc2626", bg: "#fef2f2" },
  Performance: { color: "#d97706", bg: "#fffbeb" },
  UI:          { color: "#7c3aed", bg: "#f5f3ff" },
  Tracking:    { color: "#2563eb", bg: "#eff6ff" },
  Sync:        { color: "#0891b2", bg: "#ecfeff" },
  Other:       { color: "#64748b", bg: "#f8fafc" },
};

function catStyle(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
}

function fmtRelative(dt) {
  if (!dt) return "—";
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return format(parseISO(String(dt).replace(" ", "T")), "MMM d, yyyy");
}

// ── Diagnostics panel ─────────────────────────────────────────────────────────

function DiagnosticsPanel({ diagnostics }) {
  const [showLogs, setShowLogs] = useState(false);
  if (!diagnostics) return <div style={{ color:"#94a3b8", fontSize:13 }}>No diagnostics attached.</div>;

  let d = diagnostics;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = {}; } }

  const { app_logs, ...meta } = d;

  const metaRows = [
    { label: "App Version",   value: meta.app_version    || "—" },
    { label: "macOS",         value: meta.macos_version  || "—" },
    { label: "Session ID",    value: meta.session_id || "—" },
    { label: "Is Tracking",   value: meta.is_tracking != null ? (meta.is_tracking ? "Yes" : "No") : "—" },
    { label: "Tracked Mins",  value: meta.tracked_minutes != null ? `${meta.tracked_minutes} min` : "—" },
    { label: "Reported At",   value: meta.reported_at ? fmtTime(meta.reported_at) : "—" },
  ];

  return (
    <div style={{ marginTop:8 }}>
      {/* Meta grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
        {metaRows.map(r => (
          <div key={r.label} style={{ background:"#f8fafc", borderRadius:8, padding:"8px 12px", border:"1px solid #f1f5f9" }}>
            <div style={{ fontSize:10, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>{r.label}</div>
            <div style={{ fontSize:12, fontWeight:700, color:"#1e293b", fontFamily:"monospace" }}>{r.value}</div>
          </div>
        ))}
      </div>

      {/* App logs */}
      {app_logs ? (
        <div>
          <button
            onClick={() => setShowLogs(v => !v)}
            style={{ background:"none", border:"1px solid #e2e8f0", borderRadius:6, padding:"5px 12px", fontSize:12, color:"#374151", cursor:"pointer", fontWeight:600, marginBottom:8 }}
          >
            {showLogs ? "▾ Hide Logs" : "▸ Show App Logs"} ({typeof app_logs === "string" ? app_logs.split("\n").length : 0} lines)
          </button>
          {showLogs && (
            <pre style={{
              background:"#0f172a", color:"#94a3b8", borderRadius:8, padding:"12px 16px",
              fontSize:11, lineHeight:1.6, overflowX:"auto", overflowY:"auto",
              maxHeight:320, fontFamily:"'Menlo','Monaco','Courier New',monospace",
              margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all",
            }}>
              {typeof app_logs === "string" ? app_logs : JSON.stringify(app_logs, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>No app logs attached.</div>
      )}
    </div>
  );
}

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({ issue, onStatusChange }) {
  const [expanded,    setExpanded]    = useState(false);
  const [note,        setNote]        = useState(issue.admin_note || "");
  const [savingStatus, setSavingStatus] = useState(false);
  const st = STATUS[issue.status] || STATUS.open;
  const cs = catStyle(issue.category);

  async function changeStatus(newStatus) {
    setSavingStatus(true);
    try {
      await api.updateBugReportStatus(issue.id, newStatus, note || undefined);
      onStatusChange(issue.id, newStatus, note);
    } catch (e) { console.error(e); }
    setSavingStatus(false);
  }

  const nextActions = {
    open:        [{ label:"→ Start",    status:"in_progress" }, { label:"✓ Resolve", status:"resolved" }],
    in_progress: [{ label:"✓ Resolve",  status:"resolved"    }, { label:"↩ Reopen",  status:"open"      }],
    resolved:    [{ label:"↩ Reopen",   status:"open"        }],
  }[issue.status] || [];

  return (
    <div style={{ borderBottom:"1px solid #f1f5f9" }}>
      {/* Main row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 20px", cursor:"pointer", transition:"background .1s" }}
        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
        onMouseLeave={e => e.currentTarget.style.background = ""}
      >
        {/* Status dot */}
        <span style={{ fontSize:14, flexShrink:0 }}>{st.dot}</span>

        {/* Employee avatar */}
        <div style={{ width:32, height:32, borderRadius:"50%", background:"#6366f1", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 }}>
          {(issue.employee_name||"?")[0].toUpperCase()}
        </div>

        {/* Content */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{issue.employee_name}</span>
            <span style={{ fontSize:11, fontWeight:600, borderRadius:20, padding:"2px 8px", background:cs.bg, color:cs.color }}>
              {issue.category}
            </span>
            <span style={{ fontSize:11, fontWeight:600, borderRadius:20, padding:"2px 8px", background:st.bg, color:st.color }}>
              {st.label}
            </span>
          </div>
          <div style={{ fontSize:12, color:"#374151", marginTop:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:520 }}>
            {issue.description}
          </div>
        </div>

        {/* Date */}
        <div style={{ fontSize:11, color:"#94a3b8", flexShrink:0, textAlign:"right" }}>
          <div>{fmtRelative(issue.created_at)}</div>
          <div style={{ fontSize:10 }}>#{issue.id}</div>
        </div>

        {/* Expand arrow */}
        <div style={{ fontSize:12, color:"#cbd5e1", flexShrink:0 }}>{expanded ? "▾" : "▸"}</div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ background:"#fafafa", borderTop:"1px solid #f1f5f9", padding:"20px 24px 20px 64px" }}>

          {/* Full description */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Description</div>
            <div style={{ fontSize:13, color:"#1e293b", lineHeight:1.6, background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, padding:"12px 16px", whiteSpace:"pre-wrap" }}>
              {issue.description}
            </div>
          </div>

          {/* Diagnostics */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Diagnostics</div>
            <DiagnosticsPanel diagnostics={issue.diagnostics} />
          </div>

          {/* Admin note */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Admin Note</div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add internal note (saved with next status change)…"
              rows={2}
              style={{ width:"100%", padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, color:"#374151", resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }}
            />
          </div>

          {/* Status actions */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {nextActions.map(a => (
              <button
                key={a.status}
                onClick={e => { e.stopPropagation(); changeStatus(a.status); }}
                disabled={savingStatus}
                style={{
                  background: a.status === "resolved" ? "#10b981" : a.status === "in_progress" ? "#f59e0b" : "#6366f1",
                  color:"#fff", border:"none", borderRadius:8, padding:"8px 18px",
                  fontSize:12, fontWeight:700, cursor: savingStatus ? "wait" : "pointer",
                  opacity: savingStatus ? 0.7 : 1,
                }}
              >
                {savingStatus ? "Saving…" : a.label}
              </button>
            ))}
          </div>

          {/* Admin note if already saved */}
          {issue.admin_note && (
            <div style={{ marginTop:12, fontSize:12, color:"#64748b", fontStyle:"italic" }}>
              Last note: "{issue.admin_note}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Issues() {
  const [issues,   setIssues]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState("all");   // all | open | in_progress | resolved
  const [catFilter,setCatFilter]= useState("all");
  const [search,   setSearch]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setIssues(await api.getBugReports()); }
    catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleStatusChange(id, newStatus, note) {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status: newStatus, admin_note: note || i.admin_note } : i));
  }

  // Summary counts
  const counts = {
    open:        issues.filter(i => i.status === "open").length,
    in_progress: issues.filter(i => i.status === "in_progress").length,
    resolved:    issues.filter(i => i.status === "resolved").length,
  };

  // Categories for filter
  const allCats = [...new Set(issues.map(i => i.category))].sort();

  // Filtered list
  const visible = issues.filter(i => {
    if (filter !== "all" && i.status !== filter) return false;
    if (catFilter !== "all" && i.category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!i.description?.toLowerCase().includes(q) &&
          !i.employee_name?.toLowerCase().includes(q) &&
          !i.category?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const inp = { padding:"8px 12px", border:"1px solid #e2e8f0", borderRadius:8, fontSize:13, background:"#fff", color:"#374151", outline:"none" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:700, color:"#1e293b", margin:0 }}>Issues</h1>
          <p style={{ color:"#64748b", fontSize:14, marginTop:4, marginBottom:0 }}>
            Bug reports and issues submitted by employees from the macOS agent
          </p>
        </div>
        <button onClick={load} disabled={loading}
          style={{ background:"#6366f1", color:"#fff", border:"none", borderRadius:8, padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer", opacity: loading ? .7 : 1 }}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24, marginTop:20 }}>
        {[
          { key:"open",        label:"Open",        icon:"🔴", color:"#ef4444", bg:"#fef2f2", border:"#fecaca" },
          { key:"in_progress", label:"In Progress", icon:"🟡", color:"#f59e0b", bg:"#fffbeb", border:"#fde68a" },
          { key:"resolved",    label:"Resolved",    icon:"🟢", color:"#10b981", bg:"#f0fdf4", border:"#a7f3d0" },
        ].map(s => (
          <div
            key={s.key}
            onClick={() => setFilter(filter === s.key ? "all" : s.key)}
            style={{
              background: filter === s.key ? s.bg : "#fff",
              border:`1.5px solid ${filter === s.key ? s.border : "#e2e8f0"}`,
              borderRadius:12, padding:"16px 20px", cursor:"pointer",
              display:"flex", alignItems:"center", gap:14,
              boxShadow: filter === s.key ? `0 0 0 3px ${s.border}` : "0 1px 3px rgba(0,0,0,0.04)",
              transition:"all .15s",
            }}
          >
            <span style={{ fontSize:24 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize:28, fontWeight:800, color:s.color }}>{counts[s.key]}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display:"flex", gap:10, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
        <select style={inp} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {allCats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          style={{ ...inp, flex:1, minWidth:200 }}
          placeholder="🔍 Search by employee, description, category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {(filter !== "all" || catFilter !== "all" || search) && (
          <button onClick={() => { setFilter("all"); setCatFilter("all"); setSearch(""); }}
            style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 14px", fontSize:12, cursor:"pointer", color:"#64748b" }}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Issues list */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
        {loading ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:"#94a3b8" }}>Loading issues…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding:"60px 0", textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#64748b" }}>
              {issues.length === 0 ? "No issues submitted yet" : "No issues match your filters"}
            </div>
            <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>
              {issues.length === 0
                ? "When employees submit a report from the macOS agent, it will appear here."
                : "Try adjusting the filter or search."}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
              <span style={{ width:14 }} />
              <span style={{ width:32 }} />
              <div style={{ flex:1, fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.5 }}>
                Employee · Category · Description
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:.5, width:80, textAlign:"right" }}>
                Submitted
              </div>
              <span style={{ width:12 }} />
            </div>
            {visible.map(issue => (
              <IssueRow key={issue.id} issue={issue} onStatusChange={handleStatusChange} />
            ))}
            <div style={{ padding:"10px 20px", background:"#f8fafc", borderTop:"1px solid #f1f5f9", fontSize:12, color:"#94a3b8" }}>
              {visible.length} of {issues.length} issue{issues.length !== 1 ? "s" : ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
