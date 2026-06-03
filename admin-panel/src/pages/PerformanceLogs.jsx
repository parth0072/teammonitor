import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { fmtDateShort } from "../tz";
import { format, parseISO } from "date-fns";

// ── constants ─────────────────────────────────────────────────────────────────

const GOOD_CATEGORIES = ["Achievement", "Praise", "Milestone", "Improvement", "Above & Beyond"];
const BAD_CATEGORIES  = ["Warning", "Missed Deadline", "Policy Violation", "Poor Performance", "Attendance Issue"];

const RATING = {
  good: { label: "Good",  color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0", icon: "👍" },
  bad:  { label: "Issue", color: "#ef4444", bg: "#fef2f2", border: "#fecaca", icon: "⚠️"  },
};

const S = {
  page:      { padding: "24px 28px", maxWidth: 900, margin: "0 auto" },
  card:      { background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 16 },
  table:     { width: "100%", borderCollapse: "collapse" },
  th:        { textAlign: "left", fontSize: 12, color: "#64748b", fontWeight: 600, padding: "8px 12px 8px 0", borderBottom: "1px solid #e2e8f0" },
  td:        { padding: "12px 12px 12px 0", fontSize: 13, borderBottom: "1px solid #f1f5f9", color: "#374151", verticalAlign: "top" },
  empty:     { color: "#94a3b8", fontSize: 14, textAlign: "center", padding: "48px 0" },
  tag:       (c) => ({ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: c + "20", color: c, fontWeight: 600 }),
  input:     { width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, color: "#1e293b", outline: "none", boxSizing: "border-box" },
  label:     { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5, display: "block" },
  btn:       (c, outline) => ({
    padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: outline ? "transparent" : c, color: outline ? c : "#fff",
    border: `1.5px solid ${c}`, transition: "opacity .15s",
  }),
};

// ── helper: format event_date + event_time nicely ─────────────────────────────
function fmtEventDateTime(log) {
  try {
    const d = fmtDateShort(parseISO(log.event_date + "T00:00:00"));
    return log.event_time ? `${d} at ${log.event_time}` : d;
  } catch {
    return log.event_date || "—";
  }
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────
function LogModal({ log, employees, onSave, onClose }) {
  const editing = !!log?.id;
  const today   = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState({
    employeeId:  log?.employee_id  || "",
    rating:      log?.rating       || "good",
    category:    log?.category     || GOOD_CATEGORIES[0],
    title:       log?.title        || "",
    description: log?.description  || "",
    eventDate:   log?.event_date   || today,
    eventTime:   log?.event_time   || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const categories = form.rating === "good" ? GOOD_CATEGORIES : BAD_CATEGORIES;

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v };
      // when rating changes, reset category to first of new list
      if (k === "rating") {
        next.category = v === "good" ? GOOD_CATEGORIES[0] : BAD_CATEGORIES[0];
      }
      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.employeeId) return setErr("Please select an employee.");
    if (!form.title.trim()) return setErr("Title is required.");
    setErr(""); setSaving(true);
    try {
      const payload = {
        employeeId:  Number(form.employeeId),
        rating:      form.rating,
        category:    form.category,
        title:       form.title.trim(),
        description: form.description.trim() || null,
        eventDate:   form.eventDate,
        eventTime:   form.eventTime || null,
      };
      const saved = editing
        ? await api.updatePerformanceLog(log.id, payload)
        : await api.createPerformanceLog(payload);
      onSave(saved, editing);
    } catch (e) {
      setErr(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
            {editing ? "Edit Log Entry" : "Add Performance Log"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>

        <form onSubmit={submit}>
          {/* Employee (hidden when editing — can't change who the log is about) */}
          {!editing && (
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Employee *</label>
              <select value={form.employeeId} onChange={e => set("employeeId", e.target.value)}
                      style={{ ...S.input, background: "#fff" }} required>
                <option value="">Select employee…</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Rating toggle */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Rating *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["good", "bad"].map(r => (
                <button key={r} type="button"
                  onClick={() => set("rating", r)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all .15s",
                    background: form.rating === r ? RATING[r].bg : "#f8fafc",
                    color:      form.rating === r ? RATING[r].color : "#94a3b8",
                    border:     `2px solid ${form.rating === r ? RATING[r].color : "#e2e8f0"}`,
                  }}>
                  {RATING[r].icon} {RATING[r].label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Category *</label>
            <select value={form.category} onChange={e => set("category", e.target.value)}
                    style={{ ...S.input, background: "#fff" }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)}
                   placeholder="Brief summary…" style={S.input} maxLength={200} required />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              placeholder="Add more details (optional)…"
              rows={3}
              style={{ ...S.input, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />
          </div>

          {/* Date + Time row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div>
              <label style={S.label}>Event Date *</label>
              <input type="date" value={form.eventDate} onChange={e => set("eventDate", e.target.value)}
                     style={S.input} required />
            </div>
            <div>
              <label style={S.label}>Time (optional)</label>
              <input type="time" value={form.eventTime} onChange={e => set("eventTime", e.target.value)}
                     style={S.input} />
            </div>
          </div>

          {err && <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{err}</div>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={S.btn("#94a3b8", true)}>Cancel</button>
            <button type="submit" disabled={saving}
                    style={{ ...S.btn(form.rating === "good" ? "#10b981" : "#ef4444"), opacity: saving ? .6 : 1 }}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PerformanceLogs() {
  const { user } = useAuth();
  const isAdmin  = user?.role === "admin";

  const [logs,      setLogs]      = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null); // null | {} (new) | log (edit)
  const [deleting,  setDeleting]  = useState(null);

  // filters
  const [filterEmp,    setFilterEmp]    = useState("");
  const [filterRating, setFilterRating] = useState("");
  const [filterStart,  setFilterStart]  = useState("");
  const [filterEnd,    setFilterEnd]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterEmp)    params.employeeId = filterEmp;
      if (filterRating) params.rating     = filterRating;
      if (filterStart)  params.startDate  = filterStart;
      if (filterEnd)    params.endDate    = filterEnd;
      const data = await api.getPerformanceLogs(params);
      setLogs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterEmp, filterRating, filterStart, filterEnd]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getEmployees().then(setEmployees).catch(() => {});
  }, [isAdmin]);

  function handleSave(saved, editing) {
    if (editing) {
      setLogs(prev => prev.map(l => l.id === saved.id ? saved : l));
    } else {
      setLogs(prev => [saved, ...prev]);
    }
    setModal(null);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this log entry?")) return;
    setDeleting(id);
    try {
      await api.deletePerformanceLog(id);
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      alert("Failed to delete: " + e.message);
    } finally {
      setDeleting(null);
    }
  }

  // summary counts
  const goodCount = logs.filter(l => l.rating === "good").length;
  const badCount  = logs.filter(l => l.rating === "bad").length;

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Performance Log</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            Track employee performance events, achievements and issues
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setModal({})} style={S.btn("#6366f1")}>
            + Add Entry
          </button>
        )}
      </div>

      {/* Summary chips */}
      {(goodCount > 0 || badCount > 0) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <div style={{ padding: "8px 16px", borderRadius: 20, background: RATING.good.bg, border: `1px solid ${RATING.good.border}`, fontSize: 13, fontWeight: 600, color: RATING.good.color }}>
            👍 {goodCount} Good
          </div>
          <div style={{ padding: "8px 16px", borderRadius: 20, background: RATING.bad.bg, border: `1px solid ${RATING.bad.border}`, fontSize: 13, fontWeight: 600, color: RATING.bad.color }}>
            ⚠️ {badCount} Issue{badCount !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...S.card, marginBottom: 20, padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {isAdmin && (
            <div>
              <label style={S.label}>Employee</label>
              <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
                      style={{ ...S.input, background: "#fff" }}>
                <option value="">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={S.label}>Rating</label>
            <select value={filterRating} onChange={e => setFilterRating(e.target.value)}
                    style={{ ...S.input, background: "#fff" }}>
              <option value="">All</option>
              <option value="good">👍 Good</option>
              <option value="bad">⚠️ Issues</option>
            </select>
          </div>
          <div>
            <label style={S.label}>From Date</label>
            <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>To Date</label>
            <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} style={S.input} />
          </div>
          {(filterEmp || filterRating || filterStart || filterEnd) && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button onClick={() => { setFilterEmp(""); setFilterRating(""); setFilterStart(""); setFilterEnd(""); }}
                      style={{ ...S.btn("#94a3b8", true), width: "100%" }}>
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? (
          <div style={S.empty}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={S.empty}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            No log entries found.
            {isAdmin && <div style={{ marginTop: 8, fontSize: 13 }}>Click "Add Entry" to log the first event.</div>}
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Employee</th>
                <th style={S.th}>Rating</th>
                <th style={S.th}>Category</th>
                <th style={S.th}>Title &amp; Description</th>
                <th style={S.th}>Date</th>
                <th style={S.th}>Logged By</th>
                {isAdmin && <th style={S.th}></th>}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const R = RATING[log.rating] || RATING.bad;
                return (
                  <tr key={log.id}>
                    {/* Employee */}
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: "#6366f1", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>
                          {(log.employee_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500, color: "#1e293b" }}>{log.employee_name}</span>
                      </div>
                    </td>

                    {/* Rating badge */}
                    <td style={S.td}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: R.bg, color: R.color, border: `1px solid ${R.border}`,
                      }}>
                        {R.icon} {R.label}
                      </span>
                    </td>

                    {/* Category */}
                    <td style={S.td}>
                      <span style={S.tag(R.color)}>{log.category}</span>
                    </td>

                    {/* Title + description */}
                    <td style={{ ...S.td, maxWidth: 280 }}>
                      <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: log.description ? 3 : 0 }}>
                        {log.title}
                      </div>
                      {log.description && (
                        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                          {log.description}
                        </div>
                      )}
                    </td>

                    {/* Date */}
                    <td style={S.td}>
                      <span style={{ color: "#475569", whiteSpace: "nowrap" }}>
                        {fmtEventDateTime(log)}
                      </span>
                    </td>

                    {/* Logged by */}
                    <td style={S.td}>
                      <span style={{ color: "#64748b", fontSize: 12 }}>{log.logged_by_name}</span>
                    </td>

                    {/* Actions */}
                    {isAdmin && (
                      <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <button onClick={() => setModal(log)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", fontSize: 12, fontWeight: 600, padding: "2px 6px" }}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(log.id)}
                          disabled={deleting === log.id}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12, fontWeight: 600, padding: "2px 6px", opacity: deleting === log.id ? .5 : 1 }}>
                          {deleting === log.id ? "…" : "Delete"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal !== null && (
        <LogModal
          log={modal?.id ? modal : null}
          employees={employees}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
