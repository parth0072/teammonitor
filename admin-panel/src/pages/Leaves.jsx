import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../App";
import { format, differenceInCalendarDays, parseISO } from "date-fns";

const STATUS_STYLE = {
  pending:   { bg: "#fef9c3", color: "#92400e", label: "Pending" },
  approved:  { bg: "#dcfce7", color: "#166534", label: "Approved" },
  rejected:  { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
  cancelled: { bg: "#f1f5f9", color: "#64748b", label: "Cancelled" },
};

const S = {
  title:   { fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 },
  tabs:    { display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #e2e8f0", paddingBottom: 0 },
  tab:     { padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#64748b", borderBottom: "2px solid transparent", marginBottom: -2 },
  tabA:    { color: "#3b82f6", borderBottom: "2px solid #3b82f6" },
  card:    { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" },
  th:      { padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" },
  td:      { padding: "13px 16px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  btn:     { padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  btnBlue: { background: "#3b82f6", color: "#fff" },
  btnGreen:{ background: "#16a34a", color: "#fff" },
  btnRed:  { background: "#dc2626", color: "#fff" },
  btnGray: { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0" },
  input:   { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "Inter,sans-serif", width: "100%" },
  label:   { fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4, display: "block" },
  modal:   { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modalBox:{ background: "#fff", borderRadius: 16, padding: 28, width: 460, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
};

function StatusBadge({ status }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return <span style={{ background: st.bg, color: st.color, padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{st.label}</span>;
}

function workdays(from, to) {
  let count = 0;
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count || 1;
}

// ── Request Leave Modal ──────────────────────────────────────────────────────

function RequestModal({ leaveTypes, onClose, onSave }) {
  const [form, setForm] = useState({ leave_type_id: "", from_date: "", to_date: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const days = form.from_date && form.to_date ? workdays(form.from_date, form.to_date) : 0;

  const save = async () => {
    if (!form.leave_type_id || !form.from_date || !form.to_date) return setErr("All fields are required.");
    if (form.to_date < form.from_date) return setErr("End date must be after start date.");
    setSaving(true); setErr("");
    try {
      await api.submitLeaveRequest({ ...form, days });
      onSave();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#1e293b" }}>Request Leave</h3>
        {err && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 12px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{err}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Leave Type</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={form.leave_type_id} onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}>
              <option value="">Select type…</option>
              {leaveTypes.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name} {t.is_paid ? "(Paid)" : "(Unpaid)"}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>From Date</label>
              <input style={S.input} type="date" value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>To Date</label>
              <input style={S.input} type="date" value={form.to_date} min={form.from_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} />
            </div>
          </div>
          {days > 0 && <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>{days} working day{days !== 1 ? "s" : ""}</div>}
          <div>
            <label style={S.label}>Reason (optional)</label>
            <textarea style={{ ...S.input, height: 72, resize: "vertical" }} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Brief reason for leave…" />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button style={{ ...S.btn, ...S.btnGray }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, ...S.btnBlue }} onClick={save} disabled={saving}>{saving ? "Submitting…" : "Submit Request"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Review Modal (approve/reject) ────────────────────────────────────────────

function ReviewModal({ req_row, action, onClose, onSave }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (action === "approve") await api.approveLeave(req_row.id, note);
      else await api.rejectLeave(req_row.id, note);
      onSave();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
          {action === "approve" ? "✅ Approve Leave" : "❌ Reject Leave"}
        </h3>
        <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
          <div><b>{req_row.employee_name}</b> — {req_row.leave_type_name}</div>
          <div style={{ color: "#64748b", marginTop: 4 }}>{req_row.from_date} → {req_row.to_date} ({req_row.days} day{req_row.days !== 1 ? "s" : ""})</div>
          {req_row.reason && <div style={{ marginTop: 6, fontStyle: "italic", color: "#6b7280" }}>"{req_row.reason}"</div>}
        </div>
        <div>
          <label style={S.label}>Note (optional)</label>
          <textarea style={{ ...S.input, height: 72, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note for the employee…" />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button style={{ ...S.btn, ...S.btnGray }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, ...(action === "approve" ? S.btnGreen : S.btnRed) }} onClick={save} disabled={saving}>
            {saving ? "Saving…" : (action === "approve" ? "Approve" : "Reject")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Leave Type Form ──────────────────────────────────────────────────────────

function LeaveTypeModal({ existing, onClose, onSave }) {
  const [form, setForm] = useState(existing || { name: "", color: "#3b82f6", default_days: 12, is_paid: true, is_active: true });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name) return alert("Name required");
    setSaving(true);
    try {
      if (existing) await api.updateLeaveType(existing.id, form);
      else await api.createLeaveType(form);
      onSave();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#1e293b" }}>
          {existing ? "Edit Leave Type" : "New Leave Type"}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Name</label>
            <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Annual Leave, Sick Leave…" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>Default Days / Year</label>
              <input style={S.input} type="number" min="0" step="0.5" value={form.default_days} onChange={e => setForm(f => ({ ...f, default_days: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Color</label>
              <input style={{ ...S.input, padding: 4, height: 38 }} type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.is_paid} onChange={e => setForm(f => ({ ...f, is_paid: e.target.checked }))} />
              Paid Leave
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Active
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button style={{ ...S.btn, ...S.btnGray }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, ...S.btnBlue }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Balance Allocation Modal ─────────────────────────────────────────────────

function BalanceModal({ employees, leaveTypes, onClose, onSave }) {
  const year = new Date().getFullYear();
  const [form, setForm] = useState({ employee_id: "", leave_type_id: "", allocated_days: "", year });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.employee_id || !form.leave_type_id) return alert("Select employee and leave type");
    setSaving(true);
    try { await api.setLeaveBalance(form); onSave(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div style={S.modal} onClick={onClose}>
      <div style={S.modalBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#1e293b" }}>Allocate Leave Balance</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.label}>Employee</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Leave Type</label>
            <select style={{ ...S.input, cursor: "pointer" }} value={form.leave_type_id} onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value }))}>
              <option value="">Select type…</option>
              {leaveTypes.filter(t => t.is_active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>Year</label>
              <input style={S.input} type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>Allocated Days</label>
              <input style={S.input} type="number" min="0" step="0.5" value={form.allocated_days} onChange={e => setForm(f => ({ ...f, allocated_days: e.target.value }))} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button style={{ ...S.btn, ...S.btnGray }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, ...S.btnBlue }} onClick={save} disabled={saving}>{saving ? "Saving…" : "Allocate"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Leaves Page ─────────────────────────────────────────────────────────

export default function Leaves() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === "admin";
  const [tab,          setTab]          = useState("requests");
  const [requests,     setRequests]     = useState([]);
  const [leaveTypes,   setLeaveTypes]   = useState([]);
  const [balances,     setBalances]     = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [filterStatus, setFilterStatus] = useState(isAdmin ? "pending" : "");
  const [filterEmp,    setFilterEmp]    = useState("");
  const [modal,        setModal]        = useState(null); // null | {type, data}
  const year = new Date().getFullYear();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [types, reqs, bals, emps] = await Promise.all([
          api.getLeaveTypes(),
          api.getLeaveRequests(filterStatus ? { status: filterStatus } : {}),
          api.getLeaveBalances(year),
          api.getEmployees(),
        ]);
        setLeaveTypes(types); setRequests(reqs); setBalances(bals); setEmployees(emps);
      } else {
        // Employee: own requests + leave types (for apply form) + own balances
        const [types, reqs, bals] = await Promise.all([
          api.getLeaveTypes(),
          api.getLeaveRequests(filterStatus ? { status: filterStatus, employeeId: user?.id } : { employeeId: user?.id }),
          api.getLeaveBalances(year),
        ]);
        setLeaveTypes(types); setRequests(reqs); setBalances(bals);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterStatus, year, isAdmin, user?.id]);

  useEffect(() => { load(); }, [load]);

  const closeModal = () => { setModal(null); load(); };
  const pendingCount = requests.filter(r => r.status === "pending").length;

  // ── Requests tab ────────────────────────────────────────────────────────────

  const filteredReqs = (isAdmin && filterEmp) ? requests.filter(r => String(r.employee_id) === filterEmp) : requests;

  const RequestsTab = (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {["", "pending", "approved", "rejected", "cancelled"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ ...S.btn, ...(filterStatus === s ? S.btnBlue : S.btnGray) }}>
            {s === "" ? "All" : STATUS_STYLE[s]?.label}
            {s === "pending" && pendingCount > 0 && <span style={{ marginLeft: 6, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{pendingCount}</span>}
          </button>
        ))}
        {isAdmin && (
          <select style={{ ...S.input, width: "auto", padding: "7px 12px" }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <button style={{ ...S.btn, ...S.btnBlue, marginLeft: "auto" }} onClick={() => setModal({ type: "request" })}>+ New Request</button>
      </div>

      <div style={S.card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : filteredReqs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
            <div style={{ fontWeight: 600 }}>No leave requests found</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {isAdmin && <th style={S.th}>Employee</th>}
                {["Leave Type", "From", "To", "Days", "Reason", "Status", "Actions"].map(h =>
                  <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredReqs.map(r => (
                <tr key={r.id}>
                  {isAdmin && <td style={S.td}><span style={{ fontWeight: 600 }}>{r.employee_name}</span></td>}
                  <td style={S.td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.leave_type_color || "#3b82f6", flexShrink: 0 }} />
                      {r.leave_type_name}
                      {r.is_paid ? <span style={{ fontSize: 10, color: "#16a34a" }}>(Paid)</span> : <span style={{ fontSize: 10, color: "#dc2626" }}>(Unpaid)</span>}
                    </span>
                  </td>
                  <td style={S.td}>{r.from_date}</td>
                  <td style={S.td}>{r.to_date}</td>
                  <td style={S.td}>{r.days}</td>
                  <td style={{ ...S.td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason || "—"}</td>
                  <td style={S.td}><StatusBadge status={r.status} /></td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {isAdmin && r.status === "pending" && (
                        <>
                          <button style={{ ...S.btn, ...S.btnGreen, padding: "5px 12px" }} onClick={() => setModal({ type: "review", data: r, action: "approve" })}>Approve</button>
                          <button style={{ ...S.btn, ...S.btnRed, padding: "5px 12px" }} onClick={() => setModal({ type: "review", data: r, action: "reject" })}>Reject</button>
                        </>
                      )}
                      {(r.status === "pending" || r.status === "approved") && (
                        <button style={{ ...S.btn, ...S.btnGray, padding: "5px 12px" }} onClick={async () => { if (confirm("Cancel this leave request?")) { await api.cancelLeave(r.id); load(); } }}>Cancel</button>
                      )}
                      {r.reviewer_note && (
                        <span title={`Note: ${r.reviewer_note}`} style={{ fontSize: 13, cursor: "help" }}>📝</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  // ── Leave Types tab ─────────────────────────────────────────────────────────

  const TypesTab = (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button style={{ ...S.btn, ...S.btnBlue }} onClick={() => setModal({ type: "leaveType" })}>+ Add Leave Type</button>
      </div>
      <div style={S.card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Type", "Default Days/Year", "Paid", "Status", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {leaveTypes.length === 0 && (
              <tr><td colSpan={5} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 40 }}>No leave types yet. Add one above.</td></tr>
            )}
            {leaveTypes.map(t => (
              <tr key={t.id}>
                <td style={S.td}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: t.color }} />
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                  </span>
                </td>
                <td style={S.td}>{t.default_days} days</td>
                <td style={S.td}>{t.is_paid ? <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Paid</span> : <span style={{ color: "#dc2626" }}>Unpaid</span>}</td>
                <td style={S.td}>{t.is_active ? <span style={{ color: "#16a34a" }}>Active</span> : <span style={{ color: "#94a3b8" }}>Inactive</span>}</td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...S.btn, ...S.btnGray, padding: "5px 12px" }} onClick={() => setModal({ type: "leaveType", data: t })}>Edit</button>
                    {t.is_active && <button style={{ ...S.btn, ...S.btnRed, padding: "5px 12px" }} onClick={async () => { if (confirm(`Deactivate "${t.name}"?`)) { await api.deleteLeaveType(t.id); load(); } }}>Deactivate</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Balances tab ────────────────────────────────────────────────────────────

  // Group balances by employee (for employees, only show own)
  const balByEmp = {};
  for (const b of balances) {
    if (!isAdmin && String(b.employee_id) !== String(user?.id)) continue;
    if (!balByEmp[b.employee_id]) balByEmp[b.employee_id] = { name: b.employee_name, items: [] };
    balByEmp[b.employee_id].items.push(b);
  }

  const BalancesTab = (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: "#64748b" }}>Year: <b>{year}</b></div>
        {isAdmin && <button style={{ ...S.btn, ...S.btnBlue }} onClick={() => setModal({ type: "balance" })}>+ Allocate Days</button>}
      </div>
      <div style={S.card}>
        {Object.keys(balByEmp).length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: 40 }}>📊</div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>No balances allocated yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Use "Allocate Days" to assign leave quotas to employees.</div>
          </div>
        ) : (
          <div style={{ padding: 20 }}>
            {Object.entries(balByEmp).map(([empId, { name, items }]) => (
              <div key={empId} style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid #e2e8f0" }}>{name}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
                  {items.map(b => {
                    const remaining = Math.max(0, b.allocated_days - b.used_days);
                    const pct = b.allocated_days > 0 ? Math.round((b.used_days / b.allocated_days) * 100) : 0;
                    return (
                      <div key={b.id} style={{ background: "#f8fafc", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: b.color || "#3b82f6" }} />
                          <span style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{b.leave_type_name}</span>
                          {b.is_paid ? <span style={{ fontSize: 10, color: "#16a34a", marginLeft: "auto" }}>Paid</span> : <span style={{ fontSize: 10, color: "#dc2626", marginLeft: "auto" }}>Unpaid</span>}
                        </div>
                        <div style={{ height: 6, background: "#e2e8f0", borderRadius: 4, marginBottom: 8, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#16a34a", borderRadius: 4, transition: "width 0.3s" }} />
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                          <span style={{ color: "#ef4444", fontWeight: 600 }}>{b.used_days}</span> used ·
                          <span style={{ color: "#16a34a", fontWeight: 600 }}> {remaining}</span> remaining ·
                          <span> {b.allocated_days} total</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={S.title}>{isAdmin ? "Leave Management" : "My Leaves"}</h1>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
            {isAdmin ? "Manage leave requests, policies and employee balances" : "Apply for leave and track your requests and balances"}
          </div>
        </div>
      </div>

      <div style={S.tabs}>
        {[
          { key: "requests", label: `Requests${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          ...(isAdmin ? [{ key: "types", label: "Leave Types" }] : []),
          { key: "balances", label: "Balances" },
        ].map(t => (
          <button key={t.key} style={{ ...S.tab, ...(tab === t.key ? S.tabA : {}) }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requests" && RequestsTab}
      {tab === "types"    && TypesTab}
      {tab === "balances" && BalancesTab}

      {modal?.type === "request"   && <RequestModal leaveTypes={leaveTypes} onClose={closeModal} onSave={closeModal} />}
      {isAdmin && modal?.type === "review"    && <ReviewModal req_row={modal.data} action={modal.action} onClose={closeModal} onSave={closeModal} />}
      {isAdmin && modal?.type === "leaveType" && <LeaveTypeModal existing={modal.data} onClose={closeModal} onSave={closeModal} />}
      {isAdmin && modal?.type === "balance"   && <BalanceModal employees={employees} leaveTypes={leaveTypes} onClose={closeModal} onSave={closeModal} />}
    </div>
  );
}
