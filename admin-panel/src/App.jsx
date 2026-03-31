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
import Timelines from "./pages/Timelines";
import Leaves from "./pages/Leaves";
import Productivity from "./pages/Productivity";

export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const S = {
  sidebar: { width: 220, background: "#1e293b", minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100 },
  logo: { padding: "24px 20px", color: "#fff", fontSize: 20, fontWeight: 700, borderBottom: "1px solid #334155", display: "flex", alignItems: "center", gap: 10 },
  nav: { flex: 1, padding: "16px 0", overflowY: "auto" },
  navLink: { display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", color: "#94a3b8", textDecoration: "none", fontSize: 14, fontWeight: 500, transition: "all 0.15s" },
  navLinkActive: { color: "#fff", background: "#334155", borderRadius: 8, margin: "0 8px" },
  footer: { padding: "16px 20px", borderTop: "1px solid #334155" },
  logoutBtn: { background: "none", border: "1px solid #475569", color: "#94a3b8", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, width: "100%", display: "flex", alignItems: "center", gap: 8 },
  main: { marginLeft: 220, padding: 32, minHeight: "100vh" },
};

const ADMIN_NAV = [
  { path: "/dashboard",    label: "Dashboard",     icon: "▦"  },
  { path: "/activity",     label: "Live Activity", icon: "🟢" },
  { path: "/productivity", label: "Productivity",  icon: "📈" },
  { path: "/projects",     label: "Projects",      icon: "📁" },
  { path: "/reports",      label: "Reports",       icon: "📊" },
  { path: "/leaves",       label: "Leaves",        icon: "🏖" },
  { path: "/employees",    label: "Employees",     icon: "👥" },
  { path: "/screenshots",  label: "Screenshots",   icon: "🖼" },
  { path: "/attendance",   label: "Attendance",    icon: "📅" },
  { path: "/timelines",    label: "Timelines",     icon: "⏱" },
];

const EMPLOYEE_NAV = [
  { path: "/dashboard",    label: "My Dashboard",  icon: "▦"  },
  { path: "/activity",     label: "My Activity",   icon: "🟢" },
  { path: "/productivity", label: "My Productivity",icon: "📈" },
  { path: "/projects",     label: "Projects",      icon: "📁" },
  { path: "/leaves",       label: "My Leaves",     icon: "🏖" },
  { path: "/screenshots",  label: "My Screenshots",icon: "🖼" },
  { path: "/attendance",   label: "My Attendance", icon: "📅" },
  { path: "/timelines",    label: "My Timeline",   icon: "⏱" },
];

function Sidebar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  const handleLogout = () => { clearToken(); setUser(null); navigate("/login"); };

  return (
    <div style={S.sidebar}>
      <div style={S.logo}><span>🖥</span> TeamMonitor</div>
      <nav style={S.nav}>
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}
            style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navLinkActive : {}) })}>
            <span>{item.icon}</span>{item.label}
          </NavLink>
        ))}
      </nav>
      <div style={S.footer}>
        {user && (
          <div style={{ marginBottom: 10, padding: "8px 0" }}>
            <div style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
            <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{isAdmin ? "Administrator" : "Employee"}</div>
          </div>
        )}
        <button style={S.logoutBtn} onClick={handleLogout}>⏻ &nbsp;Sign Out</button>
      </div>
    </div>
  );
}

function Layout({ children }) {
  return (
    <div>
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

// Redirects non-admins back to /dashboard
function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
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
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/employees"    element={<AdminRoute><Employees /></AdminRoute>} />
          <Route path="/employees/:id"element={<AdminRoute><EmployeeDetail /></AdminRoute>} />
          <Route path="/reports"      element={<AdminRoute><Reports /></AdminRoute>} />
          <Route path="/screenshots"  element={<ProtectedRoute><Screenshots /></ProtectedRoute>} />
          <Route path="/attendance"   element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
          <Route path="/activity"     element={<ProtectedRoute><Activity /></ProtectedRoute>} />
          <Route path="/projects"     element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/timelines"    element={<ProtectedRoute><Timelines /></ProtectedRoute>} />
          <Route path="/leaves"       element={<ProtectedRoute><Leaves /></ProtectedRoute>} />
          <Route path="/productivity" element={<ProtectedRoute><Productivity /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
