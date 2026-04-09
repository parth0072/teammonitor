import React, { useState, useEffect } from "react";
import { api } from "../api";

const C = {
  text:   "#101828",
  muted:  "#667085",
  border: "#E2E8F0",
  card:   "#FFFFFF",
  bg:     "#F7F8FA",
  indigo: "#6366F1",
  green:  "#12B76A",
  red:    "#F04438",
};

export default function OrgSettings() {
  const [statusOptions, setStatusOptions] = useState([]);
  const [newOption,     setNewOption]     = useState("");
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [msg,           setMsg]           = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getSettings();
      const opts = data.work_status_options;
      setStatusOptions(Array.isArray(opts) ? opts : ["WFO", "WFH", "Remote"]);
    } catch { setStatusOptions(["WFO", "WFH", "Remote"]); }
    setLoading(false);
  }

  async function save(newOpts) {
    setSaving(true); setMsg("");
    try {
      await api.updateSettings({ work_status_options: newOpts });
      setMsg("✓ Saved");
      setTimeout(() => setMsg(""), 2500);
    } catch (err) { setMsg("✗ " + err.message); }
    setSaving(false);
  }

  function addOption() {
    const v = newOption.trim();
    if (!v || statusOptions.includes(v)) return;
    const next = [...statusOptions, v];
    setStatusOptions(next);
    setNewOption("");
    save(next);
  }

  function removeOption(opt) {
    const next = statusOptions.filter(o => o !== opt);
    setStatusOptions(next);
    save(next);
  }

  function moveUp(i) {
    if (i === 0) return;
    const next = [...statusOptions];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setStatusOptions(next);
    save(next);
  }

  function moveDown(i) {
    if (i === statusOptions.length - 1) return;
    const next = [...statusOptions];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setStatusOptions(next);
    save(next);
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0 }}>Organisation Settings</h1>
        <div style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
          Configure global options that appear in the macOS agent.
        </div>
      </div>

      {/* Work Status Options */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Work Status Options</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            Options that employees can select in the macOS sidebar STATUS picker.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: C.muted }}>Loading…</div>
        ) : (
          <div style={{ padding: 24 }}>
            {/* Option list */}
            {statusOptions.length === 0 && (
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>No options yet. Add one below.</div>
            )}
            {statusOptions.map((opt, i) => (
              <div key={opt} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", marginBottom: 8,
                background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`,
              }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: C.text }}>{opt}</span>
                <button onClick={() => moveUp(i)} disabled={i === 0}
                  style={{ background: "none", border: "none", cursor: i === 0 ? "not-allowed" : "pointer", fontSize: 14, color: i === 0 ? C.border : C.muted, padding: "2px 4px" }}
                  title="Move up">↑</button>
                <button onClick={() => moveDown(i)} disabled={i === statusOptions.length - 1}
                  style={{ background: "none", border: "none", cursor: i === statusOptions.length - 1 ? "not-allowed" : "pointer", fontSize: 14, color: i === statusOptions.length - 1 ? C.border : C.muted, padding: "2px 4px" }}
                  title="Move down">↓</button>
                <button onClick={() => removeOption(opt)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.red, padding: "0 4px", lineHeight: 1 }}
                  title={`Remove "${opt}"`}>×</button>
              </div>
            ))}

            {/* Add new */}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <input
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addOption()}
                placeholder="e.g. Client Site"
                style={{
                  flex: 1, padding: "9px 12px",
                  border: `1.5px solid ${C.border}`, borderRadius: 8,
                  fontSize: 13, outline: "none", fontFamily: "inherit",
                }}
              />
              <button
                onClick={addOption}
                disabled={!newOption.trim() || saving}
                style={{
                  background: C.indigo, color: "#fff",
                  border: "none", borderRadius: 8,
                  padding: "9px 18px", fontSize: 13, fontWeight: 600,
                  cursor: newOption.trim() ? "pointer" : "not-allowed",
                  opacity: !newOption.trim() ? 0.5 : 1,
                }}
              >
                + Add
              </button>
            </div>

            {msg && (
              <div style={{
                marginTop: 14, fontSize: 13, fontWeight: 600,
                color: msg.startsWith("✓") ? C.green : C.red,
              }}>{msg}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
