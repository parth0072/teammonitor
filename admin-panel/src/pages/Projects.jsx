import React, { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import { useAuth } from "../App";

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#84cc16"];
const STATUS_COLORS = { todo:"#64748b", in_progress:"#3b82f6", done:"#10b981" };
const STATUS_BG     = { todo:"#f1f5f9", in_progress:"#eff6ff", done:"#dcfce7" };
const STATUS_LABEL  = { todo:"To Do",   in_progress:"In Progress", done:"Done" };

// Jira status-category colours
const JIRA_CAT_COLOR = { new:"#64748b", indeterminate:"#3b82f6", done:"#10b981" };
const JIRA_CAT_BG    = { new:"#f1f5f9", indeterminate:"#eff6ff", done:"#dcfce7" };
const JIRA_PRIORITY_ICON = { Highest:"🔴", High:"🟠", Medium:"🟡", Low:"🔵", Lowest:"⚪" };

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
         onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
           style={{ background:"#fff", borderRadius:12, padding:28, width: wide ? 620 : 460, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <span style={{ fontSize:17, fontWeight:700, color:"#1e293b" }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#9ca3af" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {COLORS.map(c => (
        <div key={c} onClick={() => onChange(c)}
          style={{ width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                   border: value===c ? "3px solid #1e293b" : "3px solid transparent",
                   boxSizing:"border-box" }} />
      ))}
    </div>
  );
}

const inputStyle = {
  width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8,
  fontSize:14, fontFamily:"Inter,sans-serif", boxSizing:"border-box", outline:"none"
};
const labelStyle   = { fontSize:13, fontWeight:600, color:"#374151", display:"block", marginBottom:6 };
const btnPrimary   = { background:"#3b82f6", color:"#fff", border:"none", borderRadius:8, padding:"9px 20px", cursor:"pointer", fontSize:13, fontWeight:600 };
const btnSecondary = { background:"#f1f5f9", color:"#374151", border:"none", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontSize:13, fontWeight:500 };
const btnDanger    = { background:"#fee2e2", color:"#ef4444", border:"none", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:600 };
const btnJira      = { background:"#0052cc", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:600, display:"flex", alignItems:"center", gap:6 };

// ── Jira logo SVG (inline, blue) ──────────────────────────────────────────────
function JiraLogo({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M15.89 0C11.73 0 8.35 3.38 8.35 7.54v.61H1.61A1.61 1.61 0 000 9.76c0 4.16 3.38 7.54 7.54 7.54h.81v7.16A7.54 7.54 0 0015.89 32c4.16 0 7.54-3.38 7.54-7.54V1.61A1.61 1.61 0 0021.82 0h-5.93z" fill="#2684FF"/>
      <path d="M22.35 8.15H15.6v8.77h6.75V8.15z" fill="url(#jg)"/>
      <defs>
        <linearGradient id="jg" x1="15.6" y1="12.53" x2="22.35" y2="8.15" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052CC"/>
          <stop offset="1" stopColor="#2684FF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Projects() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === "admin";

  const [projects,   setProjects]   = useState([]);
  const [employees,  setEmployees]  = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [tasks,      setTasks]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [taskLoad,   setTaskLoad]   = useState(false);

  // Modals
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewTask,    setShowNewTask]    = useState(false);
  const [editProject,    setEditProject]    = useState(null);
  const [editTask,       setEditTask]       = useState(null);
  const [showJira,       setShowJira]       = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([
        api.getProjects(),
        isAdmin ? api.getEmployees().catch(() => []) : Promise.resolve([]),
      ]);
      setProjects(p);
      setEmployees(e);
      if (p.length && !selected) setSelected(p[0]);
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [isAdmin]);

  const loadTasks = useCallback(async (project) => {
    if (!project) return;
    setTaskLoad(true);
    try {
      const t = await api.getProjectTasks(project.id);
      setTasks(t);
    } catch(e){ console.error(e); }
    setTaskLoad(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { if (selected) loadTasks(selected); }, [selected, loadTasks]);

  const statusGroups = {
    todo:        tasks.filter(t => t.status === "todo"),
    in_progress: tasks.filter(t => t.status === "in_progress"),
    done:        tasks.filter(t => t.status === "done"),
  };

  if (loading) return <div style={{ color:"#64748b", padding:40 }}>Loading…</div>;

  return (
    <div style={{ display:"flex", gap:24, height:"calc(100vh - 64px)", overflow:"hidden" }}>

      {/* ── Left: project list ── */}
      <div style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ fontSize:18, fontWeight:700, color:"#1e293b" }}>Projects</span>
          {isAdmin && <button style={btnPrimary} onClick={() => setShowNewProject(true)}>+ New</button>}
        </div>

        <div style={{ overflowY:"auto", flex:1 }}>
          {projects.length === 0 && (
            <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center", padding:"32px 0" }}>
              No projects yet.<br/>Click "+ New" to create one.
            </div>
          )}
          {projects.map(p => (
            <div key={p.id} onClick={() => setSelected(p)}
              style={{ padding:"12px 14px", borderRadius:10, cursor:"pointer", marginBottom:6,
                       background: selected?.id === p.id ? "#eff6ff" : "#fff",
                       border: selected?.id === p.id ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                       transition:"all 0.1s" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <div style={{ width:12, height:12, borderRadius:"50%", background:p.color, flexShrink:0 }} />
                <span style={{ fontWeight:600, fontSize:14, color:"#1e293b", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
              </div>
              <div style={{ fontSize:12, color:"#64748b" }}>
                {p.task_count} task{p.task_count !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: task board ── */}
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column" }}>
        {!selected ? (
          <div style={{ color:"#94a3b8", fontSize:14, textAlign:"center", padding:"60px 0" }}>
            Select a project to view its tasks.
          </div>
        ) : (
          <>
            {/* Project header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:16, height:16, borderRadius:"50%", background:selected.color }} />
                <h2 style={{ fontSize:22, fontWeight:700, color:"#1e293b", margin:0 }}>{selected.name}</h2>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {/* Jira connect button */}
                <button style={btnJira} onClick={() => setShowJira(true)}>
                  <JiraLogo size={15} />
                  Jira
                </button>
                {isAdmin && <button style={btnSecondary} onClick={() => setEditProject(selected)}>✏ Edit</button>}
                <button style={btnPrimary} onClick={() => setShowNewTask(true)}>+ Add Task</button>
              </div>
            </div>

            {selected.description && (
              <p style={{ color:"#64748b", fontSize:14, marginBottom:20, marginTop:-12 }}>{selected.description}</p>
            )}

            {taskLoad ? <div style={{ color:"#64748b" }}>Loading tasks…</div> : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, alignItems:"start" }}>
                {(["todo","in_progress","done"]).map(status => (
                  <div key={status}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:STATUS_COLORS[status] }}>{STATUS_LABEL[status]}</span>
                      <span style={{ fontSize:12, color:"#94a3b8" }}>({statusGroups[status].length})</span>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {statusGroups[status].length === 0 && (
                        <div style={{ color:"#cbd5e1", fontSize:12, padding:"16px 0", textAlign:"center" }}>No tasks</div>
                      )}
                      {statusGroups[status].map(task => (
                        <TaskCard key={task.id} task={task} employees={employees}
                          isAdmin={isAdmin}
                          onEdit={() => setEditTask(task)}
                          onStatusChange={async (s) => {
                            await api.updateTask(task.id, { status: s });
                            loadTasks(selected);
                          }}
                          onDelete={async () => {
                            if (window.confirm(`Delete task "${task.name}"?`)) {
                              await api.deleteTask(task.id);
                              loadTasks(selected);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}

      {showNewProject && (
        <ProjectForm title="New Project" onClose={() => setShowNewProject(false)}
          onSave={async (data) => { await api.createProject(data); loadProjects(); setShowNewProject(false); }} />
      )}
      {editProject && (
        <ProjectForm title="Edit Project" initial={editProject} onClose={() => setEditProject(null)}
          onSave={async (data) => { await api.updateProject(editProject.id, data); loadProjects(); setEditProject(null); }} />
      )}
      {showNewTask && selected && (
        <TaskForm title={`Add Task — ${selected.name}`} employees={employees} projectColor={selected.color} isAdmin={isAdmin}
          onClose={() => setShowNewTask(false)}
          onSave={async (data) => { await api.createTask(selected.id, data); loadTasks(selected); setShowNewTask(false); }} />
      )}
      {editTask && (
        <TaskForm title="Edit Task" initial={editTask} employees={employees} projectColor={selected?.color || "#3b82f6"} isAdmin={isAdmin}
          onClose={() => setEditTask(null)}
          onSave={async (data) => { await api.updateTask(editTask.id, data); loadTasks(selected); setEditTask(null); }} />
      )}

      {/* Jira panel */}
      {showJira && (
        <JiraPanel
          selectedProject={selected}
          projects={projects}
          onClose={() => setShowJira(false)}
          onSynced={() => { loadTasks(selected); loadProjects(); }}
        />
      )}
    </div>
  );
}

// ── Task Card ──────────────────────────────────────────────────────────────────

function TaskCard({ task, employees, isAdmin, onEdit, onStatusChange, onDelete }) {
  return (
    <div style={{ background:"#fff", borderRadius:10, padding:14, border:"1px solid #e2e8f0",
                  borderLeft:`4px solid ${STATUS_COLORS[task.status]}`,
                  boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ fontWeight:600, fontSize:14, color:"#1e293b", marginBottom:6 }}>
        {task.jira_issue_key && (
          <span style={{ fontSize:11, color:"#0052cc", fontWeight:700, marginRight:6 }}>
            {task.jira_issue_key}
          </span>
        )}
        {task.name.replace(/^\[[\w]+-\d+\]\s*/, "")}
      </div>
      {task.description && (
        <div style={{ fontSize:12, color:"#64748b", marginBottom:8, lineHeight:1.5 }}>{task.description}</div>
      )}
      {task.assigned_to_name && (
        <div style={{ fontSize:12, color:"#94a3b8", marginBottom:8 }}>
          👤 {task.assigned_to_name}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <select value={task.status} onChange={e => onStatusChange(e.target.value)}
          style={{ fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:10, border:"none",
                   background:STATUS_BG[task.status], color:STATUS_COLORS[task.status], cursor:"pointer" }}>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <div style={{ display:"flex", gap:4 }}>
          <button onClick={onEdit}
            style={{ fontSize:11, padding:"3px 8px", background:"#f8fafc", border:"none", borderRadius:6, cursor:"pointer", color:"#475569" }}>
            Edit
          </button>
          {isAdmin && (
            <button onClick={onDelete}
              style={{ fontSize:11, padding:"3px 8px", background:"#fee2e2", border:"none", borderRadius:6, cursor:"pointer", color:"#ef4444" }}>
              Del
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Project Form ───────────────────────────────────────────────────────────────

function ProjectForm({ title, initial, onClose, onSave }) {
  const [name,  setName]  = useState(initial?.name  || "");
  const [desc,  setDesc]  = useState(initial?.description || "");
  const [color, setColor] = useState(initial?.color || "#3b82f6");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div>
          <label style={labelStyle}>Project Name</label>
          <input style={inputStyle} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Website Redesign" />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, height:70, resize:"vertical" }} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional description" />
        </div>
        <div>
          <label style={labelStyle}>Color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} disabled={!name.trim() || saving}
            onClick={async () => { setSaving(true); await onSave({ name, description:desc, color }); }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Task Form ──────────────────────────────────────────────────────────────────

function TaskForm({ title, initial, employees, projectColor, isAdmin, onClose, onSave }) {
  const [name,       setName]       = useState(initial?.name        || "");
  const [desc,       setDesc]       = useState(initial?.description || "");
  const [status,     setStatus]     = useState(initial?.status      || "todo");
  const [assignedTo, setAssignedTo] = useState(initial?.assigned_to || "");
  const [saving,     setSaving]     = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div>
          <label style={labelStyle}>Task Name</label>
          <input style={inputStyle} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Fix login bug" />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, height:60, resize:"vertical" }} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Optional" />
        </div>
        <div style={{ display:"grid", gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr", gap:12 }}>
          <div>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          {isAdmin && (
            <div>
              <label style={labelStyle}>Assign To</label>
              <select style={inputStyle} value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnPrimary} disabled={!name.trim() || saving}
            onClick={async () => { setSaving(true); await onSave({ name, description:desc, status, assignedTo: assignedTo||undefined }); }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Jira Panel ────────────────────────────────────────────────────────────────

function JiraPanel({ selectedProject, projects, onClose, onSynced }) {
  const [status,     setStatus]     = useState(null);   // null = loading
  const [jiraProjs,  setJiraProjs]  = useState([]);
  const [issues,     setIssues]     = useState([]);
  const [selProjKey, setSelProjKey] = useState("");
  const [loading,    setLoading]    = useState(true);
  const [issueLoad,  setIssueLoad]  = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [error,      setError]      = useState(null);

  // Connect form
  const [showConnect, setShowConnect] = useState(false);
  const [siteUrl,     setSiteUrl]     = useState("https://yourcompany.atlassian.net");
  const [email,       setEmail]       = useState("");
  const [apiToken,    setApiToken]    = useState("");
  const [connecting,  setConnecting]  = useState(false);

  // Which TeamMonitor project to import into
  const [targetProjectId, setTargetProjectId] = useState(selectedProject?.id || "");

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const s = await api.getJiraStatus();
      setStatus(s);
      if (s.connected) {
        const p = await api.getJiraProjects();
        setJiraProjs(p);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function loadIssues(projectKey) {
    setIssueLoad(true);
    setIssues([]);
    setSyncResult(null);
    try {
      const data = await api.getJiraIssues(projectKey || undefined);
      setIssues(data);
    } catch (err) {
      setError(err.message);
    }
    setIssueLoad(false);
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const result = await api.connectJira(siteUrl.trim(), email.trim(), apiToken.trim());
      setStatus(result);
      setShowConnect(false);
      const p = await api.getJiraProjects();
      setJiraProjs(p);
    } catch (err) {
      setError(err.message);
    }
    setConnecting(false);
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Jira? Your imported tasks won't be deleted.")) return;
    await api.disconnectJira();
    setStatus({ connected: false });
    setJiraProjs([]);
    setIssues([]);
    setSelProjKey("");
  }

  async function handleSync() {
    if (!selProjKey)       return alert("Select a Jira project first");
    if (!targetProjectId)  return alert("Select a TeamMonitor project to import into");
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const r = await api.syncJira(selProjKey, targetProjectId);
      setSyncResult(r);
      onSynced();
    } catch (err) {
      setError(err.message);
    }
    setSyncing(false);
  }

  const catColor = cat => JIRA_CAT_COLOR[cat] || "#64748b";
  const catBg    = cat => JIRA_CAT_BG[cat]    || "#f1f5f9";

  return (
    <Modal title="Jira Integration" onClose={onClose} wide>
      {loading ? (
        <div style={{ color:"#64748b", padding:"24px 0", textAlign:"center" }}>Connecting to Jira…</div>
      ) : !status?.connected ? (
        /* ── Not connected ── */
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"16px 20px",
                        background:"#f8faff", borderRadius:10, border:"1px solid #e0e7ff", marginBottom:20 }}>
            <JiraLogo size={32} />
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:"#1e293b" }}>Connect your Jira account</div>
              <div style={{ fontSize:13, color:"#64748b", marginTop:2 }}>
                Sign in with your Atlassian API token to view and import your Jira issues.
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:8, padding:"10px 14px", fontSize:13, marginBottom:16 }}>
              {error}
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div>
              <label style={labelStyle}>Jira Site URL</label>
              <input style={inputStyle} value={siteUrl} onChange={e=>setSiteUrl(e.target.value)}
                placeholder="https://yourcompany.atlassian.net" />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
                Your Atlassian Cloud URL (find it in your Jira browser address bar)
              </div>
            </div>
            <div>
              <label style={labelStyle}>Atlassian Account Email</label>
              <input style={inputStyle} type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@yourcompany.com" />
            </div>
            <div>
              <label style={labelStyle}>API Token</label>
              <input style={inputStyle} type="password" value={apiToken} onChange={e=>setApiToken(e.target.value)}
                placeholder="Paste your Jira API token" />
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:4 }}>
                Generate at{" "}
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
                   target="_blank" rel="noreferrer"
                   style={{ color:"#3b82f6" }}>
                  id.atlassian.com → Security → API tokens
                </a>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
              <button style={btnSecondary} onClick={onClose}>Cancel</button>
              <button style={btnJira}
                disabled={!siteUrl.trim() || !email.trim() || !apiToken.trim() || connecting}
                onClick={handleConnect}>
                <JiraLogo size={14} />
                {connecting ? "Connecting…" : "Connect Jira"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Connected ── */
        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

          {/* Connection status bar */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                        padding:"12px 16px", background:"#f0fdf4", borderRadius:10, border:"1px solid #bbf7d0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <JiraLogo size={22} />
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:"#166534" }}>
                  Connected as {status.displayName}
                </div>
                <div style={{ fontSize:12, color:"#4ade80" }}>{status.email} · {status.siteUrl}</div>
              </div>
            </div>
            <button style={btnDanger} onClick={handleDisconnect}>Disconnect</button>
          </div>

          {error && (
            <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:8, padding:"10px 14px", fontSize:13 }}>
              {error}
            </div>
          )}

          {syncResult && (
            <div style={{ background:"#f0fdf4", color:"#166534", borderRadius:8, padding:"10px 14px", fontSize:13, fontWeight:600 }}>
              ✅ Synced: {syncResult.created} imported, {syncResult.skipped} already existed
            </div>
          )}

          {/* Project picker + Issue list */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, alignItems:"end" }}>
            <div>
              <label style={labelStyle}>Jira Project</label>
              <select style={inputStyle} value={selProjKey}
                onChange={e => { setSelProjKey(e.target.value); loadIssues(e.target.value); }}>
                <option value="">— All assigned issues —</option>
                {jiraProjs.map(p => (
                  <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                ))}
              </select>
            </div>
            <div>
              <button style={{ ...btnJira, width:"100%", justifyContent:"center" }}
                onClick={() => loadIssues(selProjKey)}>
                🔄 Refresh Issues
              </button>
            </div>
          </div>

          {/* Issues list */}
          <div style={{ border:"1px solid #e2e8f0", borderRadius:10, overflow:"hidden" }}>
            <div style={{ background:"#f8fafc", padding:"10px 14px", borderBottom:"1px solid #e2e8f0",
                          fontSize:13, fontWeight:600, color:"#374151", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span>My Assigned Issues {issues.length > 0 ? `(${issues.length})` : ""}</span>
              {issueLoad && <span style={{ fontSize:12, color:"#94a3b8" }}>Loading…</span>}
            </div>

            <div style={{ maxHeight:280, overflowY:"auto" }}>
              {!issueLoad && issues.length === 0 ? (
                <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center", padding:"24px 0" }}>
                  {selProjKey ? "No open issues assigned to you in this project" : "Select a project or click Refresh"}
                </div>
              ) : (
                issues.map(issue => (
                  <div key={issue.key}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px",
                             borderBottom:"1px solid #f1f5f9" }}>
                    <div style={{ flexShrink:0, width:70 }}>
                      <a href={issue.url} target="_blank" rel="noreferrer"
                         style={{ fontSize:12, fontWeight:700, color:"#0052cc", textDecoration:"none" }}>
                        {issue.key}
                      </a>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:"#1e293b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {issue.summary}
                      </div>
                      <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>
                        {issue.projectName} · {issue.issueType}
                      </div>
                    </div>
                    <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:10,
                                     background: catBg(issue.statusCategory), color: catColor(issue.statusCategory) }}>
                        {issue.status}
                      </span>
                      <span title={issue.priority} style={{ fontSize:13 }}>
                        {JIRA_PRIORITY_ICON[issue.priority] || "🟡"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Import section */}
          <div style={{ borderTop:"1px solid #e2e8f0", paddingTop:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:10 }}>
              Import issues as TeamMonitor tasks
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end" }}>
              <div>
                <label style={labelStyle}>Into TeamMonitor Project</label>
                <select style={inputStyle} value={targetProjectId}
                  onChange={e => setTargetProjectId(e.target.value)}>
                  <option value="">— Select project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button style={{ ...btnJira, height:40, paddingTop:0, paddingBottom:0 }}
                disabled={!selProjKey || !targetProjectId || syncing}
                onClick={handleSync}>
                <JiraLogo size={14} />
                {syncing ? "Importing…" : "Import as Tasks"}
              </button>
            </div>
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:8 }}>
              Only imports issues assigned to you that haven't been imported before. Already-imported tasks are skipped.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
