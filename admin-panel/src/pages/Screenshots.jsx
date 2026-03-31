import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api";
import { format, subDays } from "date-fns";

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
  card:       { background:"#fff", borderRadius:10, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.08)", border:"1px solid #e2e8f0", cursor:"pointer", transition:"transform 0.15s,box-shadow 0.15s" },
  img:        { width:"100%", height:120, objectFit:"cover", background:"#f1f5f9", display:"block" },
  time:       { padding:"7px 10px", fontSize:12, color:"#64748b" },
};

const DATE_OPTIONS = Array.from({ length: 7 }, (_, i) => {
  const d = subDays(new Date(), i);
  return { label: i===0?"Today":i===1?"Yesterday":format(d,"EEE, MMM d"), value: format(d,"yyyy-MM-dd") };
});

function imgSrc(filePath) {
  if (!filePath) return null;
  const token = sessionStorage.getItem('tm_token') || '';
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
        <img src={imgSrc(ss.file_path)} alt="Screenshot"
          style={{ maxWidth:"88vw", maxHeight:"78vh", borderRadius:12, display:"block", margin:"0 auto" }} />
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Screenshots() {
  const [screenshots, setScreenshots] = useState([]);
  const [employees,   setEmployees]   = useState([]);
  const [filterEmp,   setFilterEmp]   = useState("all");
  const [filterDate,  setFilterDate]  = useState(DATE_OPTIONS[0].value);
  const [loading,     setLoading]     = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const autoRef = useRef(null);

  useEffect(() => { api.getEmployees().then(setEmployees).catch(console.error); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getScreenshots(filterDate, filterEmp !== "all" ? filterEmp : undefined);
      setScreenshots(data);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterDate, filterEmp]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    clearInterval(autoRef.current);
    if (filterDate === DATE_OPTIONS[0].value) autoRef.current = setInterval(load, 30_000);
    return () => clearInterval(autoRef.current);
  }, [filterDate, load]);

  // Group screenshots by employee
  const groups = [];
  const seen = {};
  for (const ss of screenshots) {
    const key = ss.employee_id;
    if (!seen[key]) {
      seen[key] = { name: ss.employee_name, items: [] };
      groups.push(seen[key]);
    }
    seen[key].items.push(ss);
  }

  // Flat list for lightbox (preserves order)
  // Map each ss to its flat index
  const flatIndex = {};
  let idx = 0;
  for (const g of groups) {
    for (const ss of g.items) { flatIndex[ss.id] = idx++; }
  }

  return (
    <div style={{ width:"100%" }}>
      <div style={S.topBar}>
        <h1 style={S.title}>Screenshots</h1>
        <button style={S.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      <div style={{ color:"#64748b", fontSize:13, marginBottom:4 }}>
        Last updated {format(lastRefresh, "h:mm:ss a")}
        {filterDate === DATE_OPTIONS[0].value && <span style={{ marginLeft:8, color:"#10b981" }}>· auto-refreshing</span>}
      </div>

      <div style={S.filters}>
        <select style={S.select} value={filterDate} onChange={e => setFilterDate(e.target.value)}>
          {DATE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={S.select} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="all">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span style={{ color:"#64748b", fontSize:13 }}>
          {loading ? "Loading…" : `${screenshots.length} screenshot${screenshots.length !== 1 ? "s" : ""}`}
        </span>
      </div>

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
          </div>
          <div style={S.grid}>
            {group.items.map(ss => (
              <div key={ss.id} style={S.card}
                onClick={() => setLightboxIdx(flatIndex[ss.id])}
                onMouseEnter={e => { e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 16px rgba(0,0,0,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.08)"; }}>
                {ss.file_path
                  ? <img style={S.img} src={imgSrc(ss.file_path)} alt="Screenshot" loading="lazy" />
                  : <div style={{ ...S.img, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32 }}>🖥</div>}
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
