import React, { useState, useEffect } from "react";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

const S = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  title:  { fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 },
  btn:    { background: "#3b82f6", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 },
  table:  { background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0", width: "100%" },
  th:     { background: "#f8fafc", padding: "12px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e2e8f0" },
  td:     { padding: "14px 20px", borderBottom: "1px solid #f1f5f9", fontSize: 14, color: "#374151" },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "#3b82f6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  viewBtn:{ background: "#f1f5f9", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontWeight: 500, fontSize: 13 },
  modal:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 },
  modalBox:{ background: "#fff", borderRadius: 16, padding: 32, width: 440 },
  modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 24, color: "#1e293b" },
  label:  { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  input:  { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16, fontFamily: "Inter,sans-serif" },
  row:    { display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 },
  cancelBtn: { background: "#f1f5f9", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 600, cursor: "pointer" },
  badge:  { fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 600 },
  error:  { background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 },
  select: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16, fontFamily: "Inter,sans-serif", background: "#fff" },
};

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899"];
const initials = n => (n || "?").split(" ").map(x => x[0]).join("").toUpperCase().slice(0,2);
const colorFor = id => COLORS[id % COLORS.length];
const INTERVAL_OPTIONS = [
  { value: 60,   label: "Every 1 minute" },
  { value: 120,  label: "Every 2 minutes" },
  { value: 300,  label: "Every 5 minutes (default)" },
  { value: 600,  label: "Every 10 minutes" },
  { value: 900,  label: "Every 15 minutes" },
  { value: 1800, label: "Every 30 minutes" },
];
const fmtInterval = s => {
  const secs = s || 300;
  if (secs < 120) return `${secs}s`;
  return `${Math.round(secs/60)} min`;
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState({ name:"", email:"", department:"", password:"", role:"employee", screenshot_interval: 300 });
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [editEmp, setEditEmp]     = useState(null);  // employee being edited
  const [editForm, setEditForm]   = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");
  const navigate = useNavigate();

  const load = () => api.getEmployees().then(setEmployees).catch(console.error);
  useEffect(() => { load(); }, []);

  const openEdit = emp => {
    setEditEmp(emp);
    setEditForm({ name: emp.name, department: emp.department||"", role: emp.role, is_active: emp.is_active, screenshot_interval: emp.screenshot_interval || 300 });
    setEditError("");
  };

  const handleEdit = async () => {
    setEditSaving(true); setEditError("");
    try {
      await api.updateEmployee(editEmp.id, editForm);
      setEditEmp(null);
      load();
    } catch (err) { setEditError(err.message); }
    setEditSaving(false);
  };

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.password) { setError("Name, email and password are required."); return; }
    setSaving(true); setError("");
    try {
      await api.createEmployee(form);
      setShowModal(false);
      setForm({ name:"", email:"", department:"", password:"", role:"employee", screenshot_interval: 300 });
      load();
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={S.header}>
        <div><h1 style={S.title}>Employees</h1><p style={{ color:"#64748b", margin:"4px 0 0", fontSize:14 }}>{employees.length} members</p></div>
        <button style={S.btn} onClick={() => setShowModal(true)}>+ Add Employee</button>
      </div>

      <table style={S.table} cellSpacing={0}>
        <thead>
          <tr>{["Name","Email","Department","Screenshot Interval","Status",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id}>
              <td style={S.td}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ ...S.avatar, background: colorFor(emp.id) }}>{initials(emp.name)}</div>
                  <div><div style={{ fontWeight:600 }}>{emp.name}</div><div style={{ fontSize:12, color:"#94a3b8" }}>{emp.role}</div></div>
                </div>
              </td>
              <td style={S.td}>{emp.email}</td>
              <td style={S.td}>{emp.department || "—"}</td>
              <td style={S.td}><span style={{ fontSize:12, color:"#6366f1", fontWeight:600 }}>{fmtInterval(emp.screenshot_interval)}</span></td>
              <td style={S.td}><span style={{ ...S.badge, background: emp.is_active ? "#dcfce7":"#f1f5f9", color: emp.is_active ? "#16a34a":"#64748b" }}>{emp.is_active ? "● Active":"○ Inactive"}</span></td>
              <td style={S.td} >
                <div style={{ display:"flex", gap:8 }}>
                  <button style={S.viewBtn} onClick={() => navigate(`/employees/${emp.id}`)}>View →</button>
                  <button style={{ ...S.viewBtn, color:"#6366f1" }} onClick={() => openEdit(emp)}>Edit</button>
                </div>
              </td>
            </tr>
          ))}
          {employees.length === 0 && <tr><td colSpan={5} style={{ ...S.td, textAlign:"center", color:"#94a3b8", padding:40 }}>No employees yet.</td></tr>}
        </tbody>
      </table>

      {editEmp && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <div style={S.modalTitle}>Edit Employee</div>
            {editError && <div style={S.error}>{editError}</div>}
            <label style={S.label}>Full Name</label>
            <input style={S.input} value={editForm.name} onChange={e => setEditForm({...editForm, name:e.target.value})} />
            <label style={S.label}>Department</label>
            <input style={S.input} value={editForm.department} onChange={e => setEditForm({...editForm, department:e.target.value})} />
            <label style={S.label}>Role</label>
            <select style={S.select} value={editForm.role} onChange={e => setEditForm({...editForm, role:e.target.value})}>
              <option value="employee">Employee</option>
              <option value="admin">Admin</option>
            </select>
            <label style={S.label}>Status</label>
            <select style={S.select} value={editForm.is_active} onChange={e => setEditForm({...editForm, is_active: Number(e.target.value)})}>
              <option value={1}>Active</option>
              <option value={0}>Inactive</option>
            </select>
            <label style={S.label}>Screenshot Interval</label>
            <select style={S.select} value={editForm.screenshot_interval} onChange={e => setEditForm({...editForm, screenshot_interval: Number(e.target.value)})}>
              {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:"8px 14px", fontSize:12, color:"#0369a1", marginBottom:16 }}>
              📸 Screenshots will be captured every <strong>{fmtInterval(editForm.screenshot_interval)}</strong> while this employee is tracked.
            </div>
            <div style={S.row}>
              <button style={S.cancelBtn} onClick={() => setEditEmp(null)}>Cancel</button>
              <button style={{ ...S.btn, opacity: editSaving?0.7:1 }} onClick={handleEdit} disabled={editSaving}>{editSaving?"Saving…":"Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <div style={S.modalTitle}>Add New Employee</div>
            {error && <div style={S.error}>{error}</div>}
            <label style={S.label}>Full Name</label>
            <input style={S.input} placeholder="Jane Smith" value={form.name} onChange={e => setForm({...form, name:e.target.value})} />
            <label style={S.label}>Email</label>
            <input style={S.input} type="email" placeholder="jane@company.com" value={form.email} onChange={e => setForm({...form, email:e.target.value})} />
            <label style={S.label}>Department</label>
            <input style={S.input} placeholder="Engineering" value={form.department} onChange={e => setForm({...form, department:e.target.value})} />
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" placeholder="Min 6 characters" value={form.password} onChange={e => setForm({...form, password:e.target.value})} />
            <label style={S.label}>Screenshot Interval</label>
            <select style={S.select} value={form.screenshot_interval} onChange={e => setForm({...form, screenshot_interval: Number(e.target.value)})}>
              <option value={60}>Every 1 minute</option>
              <option value={120}>Every 2 minutes</option>
              <option value={300}>Every 5 minutes (default)</option>
              <option value={600}>Every 10 minutes</option>
              <option value={900}>Every 15 minutes</option>
              <option value={1800}>Every 30 minutes</option>
            </select>
            <div style={S.row}>
              <button style={S.cancelBtn} onClick={() => { setShowModal(false); setError(""); }}>Cancel</button>
              <button style={{ ...S.btn, opacity: saving ? 0.7:1 }} onClick={handleAdd} disabled={saving}>{saving ? "Creating…":"Create Employee"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
