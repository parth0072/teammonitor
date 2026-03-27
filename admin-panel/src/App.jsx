import React, { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { hasToken, clearToken, api } from "./api";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeDetail from "./pages/EmployeeDetail";
import Screenshots from "./pages/Screenshots";
import Attendance from "./pages/Attendance";
import Activity from "./pages/Activity";
import Reports from "./pages/Reports";
import Projects from "./pages/Projects";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const S = {
  sidebar: { width: 220, background: "#1e293b", minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 },
  logo: { padding: "24px 20px", color: "#fff", fontSize: 20, fontWeight: 700, borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 10 },
  nav: { flex: 1, padding: "16px 0" },
  navLink: { display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", color: "#94a3b8", textDecoration: "none", fontSize: 14, fontWeight: 500, transition: "all 0.15s" },
  navLinkActive: { color: "#fff", background: "#334155", borderRadius: 8, margin: "0 8px" },
  footer: { padding: "16px 20px", borderTop: "1px solid #334155" },
  logoutBtn: { background: "none", border: "1px solid #475569", color: "#94a3b8", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%", display: "flex", alignItems: "center", gap: 8 },
  main: { marginLeft: 220, padding: 32, minHeight: "100vh" },
};

const NAV_ITEMS = [
  { path: "/dashboard",  label: "Dashboard",    icon: "▦"  },
  { path: "/activity",   label: "Live Activity", icon: "🟢" },
  { path: "/projects",   label: "Projects",     icon: "📁" },
  { path: "/reports",    label: "Reports",      icon: "📊" },
  { path: "/employees",  label: "Employees",    icon: "👥" },
  { path: "/screenshots",label: "Screenshots",  icon: "🖼" },
  { path: "/attendance", label: "Attendance",   icon: "📅" },
];

function Sidebar() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => { clearToken(); setUser(null); navigate("/login"); };

  return (
    <div style={S.sidebar}>
      <div style={S.logo}><span>🖥</span> TeamMonitor</div>
      <nav style={S.nav}>
        {NAV_ITEMS.map(item => (
          <NavLink key={item.path} to={item.path}
            style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navLinkActive : {}) })}>
            <span>{item.icon}</span>{item.label}
          </NavLink>
        ))}
      </nav>
      <div style={S.footer}>
        <button style={S.logoutBtn} onClick={handleLogout}>⏻ &nbsp;Sign Out</button>
      </div>
    </div>
  );
}

function Layout({ children }) {
  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main style={S.main}>{children}</main>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", color:"#64748b" }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hasToken()) {
      api.me().then(emp => { setUser(emp); setLoading(false); }).catch(() => { clearToken(); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/employees"    element={<ProtectedRoute><Employees /></ProtectedRoute>} />
          <Route path="/employees/:id"element={<ProtectedRoute><EmployeeDetail /></ProtectedRoute>} />
          <Route path="/screenshots"  element={<ProtectedRoute><Screenshots /></ProtectedRoute>} />
          <Route path="/attendance"   element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
          <Route path="/activity"     element={<ProtectedRoute><Activity /></ProtectedRoute>} />
          <Route path="/reports"      element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/projects"     element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
