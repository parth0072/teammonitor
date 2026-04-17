import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { format, subDays } from "date-fns";
import { useAuth } from "../App";

const S = {
  title:      { fontSize: 26, fontWeight: 700, color: "#1e293b", margin: 0 },
  topBar:     { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  filters:    { display: "flex", gap: 12, marginBottom: 20, marginTop: 12, flexWrap: "wrap", alignItems: "center" },
  select:     { padding: "8px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, background: "#fff", fontFamily: "Inter,sans-serif", cursor: "pointer" },
  refreshBtn: { background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600 },
  group:      { marginBottom: 28 },
  groupHeader:{ display:"flex", alignItems:"center", gap:10, marginBottom:12 },
  avatar:     { width:34, height:34, borderRadius:"50%", background:"#3b82f6", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, flexShrink:0 },
  empName:    { fontSize:15, fontWeight:700, color:"#1e293b" },
  count:      { fontSize:13, color:"#94a3b8" },
  grid:       { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, width:"100%" },
  card:       { background:"#fff", borderRadius:10, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.08)", border:"1px solid #e2e8f0", cursor:"pointer", transition:"transform 0.15s,box-shadow 0.15s", position:"relative" },
  img:        { width:"100%", height:120, objectFit:"cover", background:"#f1f5f9", display:"block" },
  time:       { padding:"7px 10px", fontSize:12, color:"#64748b" },
};

const DATE_OPTIONS = Array.from({ length: 7 }, (_, i) => {
  const d = subDays(new Date(), i);
  return { label: i===0?"Today":i===1?"Yesterday":format(d,"EEE, MMM d"), value: format(d,"yyyy-MM-dd") };
});

function fmtBytes(b) {
  if (b >= 1073741824) return (b/1073741824).toFixed(1) + " GB";
  if (b >= 1048576)    return (b/1048576).toFixed(1) + " MB";
  if (b >= 1024)       return (b/1024).toFixed(0) + " KB";
  return b + " B";
}

function imgSrc(filePath) {
  if (!filePath) return null;
  const token = localStorage.getItem('tm_token') || '';
  return `${filePath}?token=${encodeURIComponent(token)}`;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ screenshots, index, onClose }) {
  const [current, setCurrent] = useState(index);
  useEffect(() => { setCurrent(index); }, [index]);
  const prev = useCallback(() => setCurrent(i => Math.max(0, i - 1)), []);
  const next = useCallback(() => setCurrent(i => Math.min(screenshots.length - 1, i + 1)), [screenshots.length]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === "Escape")     onClose();
      if (e.key === "ArrowLeft")  prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  if (index === null || !screenshots[current]) return null;
  const ss = screenshots[current];

  return (
    <div onClick={onClose}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999 }}>
      {current > 0 && (
        <button onClick={e => { e.stopPropagation(); prev(); }}
          style={{ position:"absolute", left:20, background:"rgba(255,255,255,0.15)", border:"none", borderRadius:"50%",
                   width:44, height:44, fontSize:22, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
      )}
      <div onClick={e => e.stopPropagation()} style={{ textAlign:"center", maxWidth:"90vw" }}>
        {ss.file_path
          ? <img src={imgSrc(ss.file_path)} alt="Screenshot"
              style={{ maxWidth:"88vw", maxHeight:"78vh", borderRadius:12, display:"block", margin:"0 auto" }}
              onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('div'), {
                innerHTML: '<span style="font-size:52px">🗑️</span><div style="color:#94a3b8;margin-top:10px;font-size:14px">Screenshot deleted</div>',
                style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;background:rgba(255,255,255,0.05);border-radius:12px'
              })); }}
            />
          : <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, background:"rgba(255,255,255,0.05)", borderRadius:12 }}>
              <span style={{ fontSize:52 }}>🗑️</span>
              <div style={{ color:"#94a3b8", marginTop:10, fontSize:14 }}>Screenshot deleted</div>
            </div>}
        <div style={{ color:"#e2e8f0", marginTop:12, fontSize:14 }}>
          <span style={{ fontWeight:600 }}>{ss.employee_name}</span>
          {" · "}
          {ss.captured_at ? format(new Date(ss.captured_at), "MMM d, yyyy  h:mm a") : ""}
          {ss.activity_level != null &&
            <span style={{ marginLeft:14, padding:"2px 10px", borderRadius:12, fontSize:12, fontWeight:700,
                           background: ss.activity_level > 50 ? "#166534" : "#78350f",
                           color: ss.activity_level > 50 ? "#bbf7d0" : "#fde68a" }}>
              {ss.activity_level}% active
            </span>}
        </div>
        <div style={{ color:"rgba(255,255,255,0.35)", fontSize:12, marginTop:6 }}>
          {current + 1} / {screenshots.length} · ← → to navigate · Esc to close
        </div>
      </div>
      {current < screenshots.length - 1 && (
        <button onClick={e => { e.stopPropagation(); next(); }}
          style={{ position:"absolute", right:20, background:"rgba(255,255,255,0.15)", border:"none", borderRadius:"50%",
                   width:44, height:44, fontSize:22, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
      )}
    </div>
  );
}

// ── Disk Usage Bar ─────────────────────────────────────────────────────────────

function DiskUsageBar({ diskUsage, onDeleteEmployee, onDeleteDate, filterDate, deleting }) {
  const [expanded, setExpanded] = useState(false);
  if (!diskUsage) return null;
  const { totalBytes, employees } = diskUsage;
  const MAX_DISPLAY = 200 * 1024 * 1024; // 200 MB visual max

  return (
    <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:"14px 18px", marginBottom:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>💾 Screenshot Storage</span>
          <span style={{ fontSize:13, color:"#64748b" }}>{fmtBytes(totalBytes)} used</span>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button
            onClick={() => setExpanded(x => !x)}
            style={{ background:"none", border:"1px solid #e2e8f0", borderRadius:6, padding:"4px 10px", fontSize:12, color:"#64748b", cursor:"pointer" }}>
            {expanded ? "▲ Hide" : "▼ Details"}
          </button>
          {filterDate && (
            <button
              disabled={deleting}
              onClick={() => onDeleteDate(filterDate)}
              style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:6, padding:"4px 10px", fontSize:12, color:"#dc2626", cursor:"pointer", fontWeight:600 }}>
              🗑 Delete {filterDate}
            </button>
          )}
        </div>
      </div>

      {/* overall bar */}
      <div style={{ height:6, background:"#e2e8f0", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${Math.min(100, (totalBytes/MAX_DISPLAY)*100)}%`, background:"linear-gradient(90deg,#3b82f6,#6366f1)", borderRadius:3, transition:"width 0.4s" }} />
      </div>

      {expanded && employees.length > 0 && (
        <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:8 }}>
          {employees.map(emp => (
            <div key={emp.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background:"#3b82f6", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>
                {emp.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:"#1e293b", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{emp.name}</span>
                  <span style={{ fontSize:11, color:"#64748b", flexShrink:0, marginLeft:8 }}>{fmtBytes(emp.bytes)} · {emp.count} shots</span>
                </div>
                <div style={{ height:4, background:"#e2e8f0", borderRadius:2, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${totalBytes ? Math.min(100,(emp.bytes/totalBytes)*100) : 0}%`, background:"#3b82f6", borderRadius:2 }} />
                </div>
              </div>
              <button
                disabled={deleting}
                onClick={() => onDeleteEmployee(emp.id, emp.name)}
                style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:6, padding:"3px 8px", fontSize:11, color:"#dc2626", cursor:"pointer", flexShrink:0 }}>
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Screenshots() {
  const { user }      = useAuth();
  const isAdmin       = user?.role === "admin";
  const [screenshots, setScreenshots] = useState([]);
  const [employees,   setEmployees]   = useState([]);
  const [filterEmp,   setFilterEmp]   = useState("all");
  const [filterDate,  setFilterDate]  = useState(DATE_OPTIONS[0].value);
  const [loading,     setLoading]     = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [diskUsage,   setDiskUsage]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);
  const [selected,    setSelected]    = useState(new Set()); // selected screenshot IDs
  const [selectMode,  setSelectMode]  = useState(false);
  const autoRef = useRef(null);

  useEffect(() => {
    if (isAdmin) api.getEmployees().then(setEmployees).catch(console.error);
  }, [isAdmin]);

  const loadDiskUsage = useCallback(async () => {
    if (!isAdmin) return;
    try { const d = await api.getScreenshotDiskUsage(); setDiskUsage(d); } catch (_) {}
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isAdmin
        ? await api.getScreenshots(filterDate, filterEmp !== "all" ? filterEmp : undefined)
        : await api.getMyScreenshots(filterDate);
      setScreenshots(data);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterDate, filterEmp, isAdmin]);

  useEffect(() => { load(); loadDiskUsage(); }, [load, loadDiskUsage]);

  useEffect(() => {
    clearInterval(autoRef.current);
    if (filterDate === DATE_OPTIONS[0].value) autoRef.current = setInterval(load, 30_000);
    return () => clearInterval(autoRef.current);
  }, [filterDate, load]);

  // ── Delete helpers ──────────────────────────────────────────────────────────

  const deleteOne = useCallback(async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this screenshot?")) return;
    setDeleting(true);
    try {
      await api.deleteScreenshot(id);
      setScreenshots(prev => prev.filter(s => s.id !== id));
      await loadDiskUsage();
    } catch (err) { alert("Delete failed: " + err.message); }
    setDeleting(false);
  }, [loadDiskUsage]);

  const deleteSelected = useCallback(async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} screenshot(s)?`)) return;
    setDeleting(true);
    try {
      await api.deleteScreenshotsBulk({ ids: [...selected] });
      setScreenshots(prev => prev.filter(s => !selected.has(s.id)));
      setSelected(new Set());
      setSelectMode(false);
      await loadDiskUsage();
    } catch (err) { alert("Delete failed: " + err.message); }
    setDeleting(false);
  }, [selected, loadDiskUsage]);

  const deleteByEmployee = useCallback(async (empId, name) => {
    if (!window.confirm(`Delete ALL screenshots for ${name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.deleteScreenshotsBulk({ employeeId: empId });
      setScreenshots(prev => prev.filter(s => String(s.employee_id) !== String(empId)));
      await loadDiskUsage();
    } catch (err) { alert("Delete failed: " + err.message); }
    setDeleting(false);
  }, [loadDiskUsage]);

  const deleteByDate = useCallback(async (date) => {
    if (!window.confirm(`Delete ALL screenshots for ${date}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const body = { date };
      if (filterEmp !== "all") body.employeeId = filterEmp;
      await api.deleteScreenshotsBulk(body);
      setScreenshots([]);
      await loadDiskUsage();
    } catch (err) { alert("Delete failed: " + err.message); }
    setDeleting(false);
  }, [filterEmp, loadDiskUsage]);

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  // Group screenshots by employee
  const groups = [];
  const seen = {};
  for (const ss of screenshots) {
    const key = ss.employee_id;
    if (!seen[key]) {
      seen[key] = { id: key, name: ss.employee_name, items: [] };
      groups.push(seen[key]);
    }
    seen[key].items.push(ss);
  }

  // Flat list for lightbox
  const flatIndex = {};
  let idx = 0;
  for (const g of groups) {
    for (const ss of g.items) { flatIndex[ss.id] = idx++; }
  }

  const allIds = screenshots.map(s => s.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));

  return (
    <div style={{ width:"100%" }}>
      <div style={S.topBar}>
        <h1 style={S.title}>Screenshots</h1>
        <div style={{ display:"flex", gap:8 }}>
          {isAdmin && selectMode && selected.size > 0 && (
            <button
              disabled={deleting}
              onClick={deleteSelected}
              style={{ background:"#dc2626", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600 }}>
              🗑 Delete {selected.size}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { setSelectMode(x => !x); setSelected(new Set()); }}
              style={{ background: selectMode ? "#f1f5f9" : "#f1f5f9", color:"#475569", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600 }}>
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          <button style={S.refreshBtn} onClick={load}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ color:"#64748b", fontSize:13, marginBottom:4 }}>
        Last updated {format(lastRefresh, "h:mm:ss a")}
        {filterDate === DATE_OPTIONS[0].value && <span style={{ marginLeft:8, color:"#10b981" }}>· auto-refreshing</span>}
      </div>

      <div style={S.filters}>
        <select style={S.select} value={filterDate} onChange={e => setFilterDate(e.target.value)}>
          {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isAdmin && (
          <select style={S.select} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="all">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        {isAdmin && selectMode && screenshots.length > 0 && (
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#475569", cursor:"pointer" }}>
            <input type="checkbox" checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))} />
            Select all
          </label>
        )}
        <span style={{ color:"#64748b", fontSize:13 }}>
          {loading ? "Loading…" : `${screenshots.length} screenshot${screenshots.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Disk usage — admin only */}
      {isAdmin && (
        <DiskUsageBar
          diskUsage={diskUsage}
          filterDate={filterDate}
          deleting={deleting}
          onDeleteEmployee={deleteByEmployee}
          onDeleteDate={deleteByDate}
        />
      )}

      {!loading && screenshots.length === 0 && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#94a3b8" }}>
          <div style={{ fontSize:52 }}>🖼</div>
          <div style={{ marginTop:12, fontSize:16, fontWeight:600, color:"#64748b" }}>No screenshots found</div>
          <div style={{ marginTop:6, fontSize:13 }}>Screenshots are captured every 5 minutes while employees are tracked.</div>
        </div>
      )}

      {groups.map(group => (
        <div key={group.name} style={S.group}>
          <div style={S.groupHeader}>
            <div style={S.avatar}>{group.name.charAt(0).toUpperCase()}</div>
            <span style={S.empName}>{group.name}</span>
            <span style={S.count}>{group.items.length} screenshot{group.items.length !== 1 ? "s" : ""}</span>
            {isAdmin && !selectMode && (
              <button
                disabled={deleting}
                onClick={() => deleteByEmployee(group.id, group.name)}
                style={{ marginLeft:"auto", background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:6, padding:"4px 10px", fontSize:12, color:"#dc2626", cursor:"pointer" }}>
                🗑 Delete all
              </button>
            )}
          </div>
          <div style={S.grid}>
            {group.items.map(ss => (
              <div key={ss.id}
                style={{
                  ...S.card,
                  outline: selected.has(ss.id) ? "2px solid #3b82f6" : "none",
                  outlineOffset: -2,
                }}
                onClick={() => selectMode ? toggleSelect(ss.id) : setLightboxIdx(flatIndex[ss.id])}
                onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 16px rgba(0,0,0,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.08)"; }}>

                {/* Select checkbox */}
                {isAdmin && selectMode && (
                  <div style={{ position:"absolute", top:6, left:6, zIndex:2 }}>
                    <input type="checkbox" checked={selected.has(ss.id)} readOnly
                      style={{ width:16, height:16, cursor:"pointer", accentColor:"#3b82f6" }} />
                  </div>
                )}

                {/* Delete button (always visible for admin, non-select mode) */}
                {isAdmin && !selectMode && (
                  <button
                    disabled={deleting}
                    onClick={e => deleteOne(ss.id, e)}
                    style={{ position:"absolute", top:6, right:6, zIndex:2, width:26, height:26, borderRadius:"50%",
                             background:"rgba(220,38,38,0.80)", border:"none", color:"#fff", fontSize:13,
                             cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
                  >✕</button>
                )}

                {ss.file_path
                  ? <img style={S.img} src={imgSrc(ss.file_path)} alt="Screenshot" loading="lazy"
                      onError={e => { e.currentTarget.style.display="none"; e.currentTarget.nextSibling.style.display="flex"; }}
                    />
                  : null}
                <div style={{ ...S.img, display: ss.file_path ? "none" : "flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:6, background:"#f8fafc" }}>
                  <span style={{ fontSize:28 }}>🗑️</span>
                  <span style={{ fontSize:11, color:"#94a3b8" }}>Deleted</span>
                </div>
                <div style={S.time}>
                  {ss.captured_at ? format(new Date(ss.captured_at), "h:mm a") : "—"}
                  {ss.activity_level != null && (
                    <span style={{ marginLeft:6, fontSize:11, fontWeight:700, padding:"1px 6px", borderRadius:8,
                                   background: ss.activity_level > 50 ? "#dcfce7" : "#fef9c3",
                                   color: ss.activity_level > 50 ? "#16a34a" : "#92400e" }}>
                      {ss.activity_level}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Lightbox screenshots={screenshots} index={lightboxIdx} onClose={() => setLightboxIdx(null)} />
    </div>
  );
}
