import React, { useState, useEffect, createContext, useContext, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, FolderOpen, Trophy, BarChart3,
  Umbrella, Users, ScanLine, CalendarCheck2, AlignLeft, Bug,
  Settings2, Monitor, LogOut, ClipboardList,
} from "lucide-react";
import "./responsive.css";
import { hasToken, clearToken, saveUser, getCachedUser, api } from "./api";
import { setTimezone } from "./tz";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import EmployeeDetail from "./pages/EmployeeDetail";
import Screenshots from "./pages/Screenshots";
import Attendance from "./pages/Attendance";
import Reports from "./pages/Reports";
import Projects from "./pages/Projects";
import Timelines from "./pages/Timelines";
import Leaves from "./pages/Leaves";
import Productivity from "./pages/Productivity";
import OrgSettings from "./pages/OrgSettings";
import TeamOverview from "./pages/TeamOverview";
import Issues from "./pages/Issues";
import PerformanceLogs from "./pages/PerformanceLogs";

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
  { path: "/dashboard",    label: "Dashboard",      Icon: LayoutDashboard },
  { path: "/productivity", label: "Productivity",   Icon: TrendingUp      },
  { path: "/projects",     label: "Projects",       Icon: FolderOpen      },
  { path: "/overview",     label: "Team Overview",  Icon: Trophy          },
  { path: "/reports",      label: "Reports",        Icon: BarChart3       },
  { path: "/leaves",       label: "Leaves",         Icon: Umbrella        },
  { path: "/employees",    label: "Employees",      Icon: Users           },
  { path: "/screenshots",  label: "Screenshots",    Icon: ScanLine        },
  { path: "/attendance",   label: "Attendance",     Icon: CalendarCheck2  },
  { path: "/timelines",    label: "Timelines",      Icon: AlignLeft       },
  { path: "/issues",       label: "Issues",         Icon: Bug             },
  { path: "/performance",  label: "Performance",    Icon: ClipboardList   },
  { path: "/settings",     label: "Settings",       Icon: Settings2       },
];

const EMPLOYEE_NAV = [
  { path: "/dashboard",    label: "My Dashboard",   Icon: LayoutDashboard },
  { path: "/productivity", label: "My Productivity",Icon: TrendingUp      },
  { path: "/projects",     label: "Projects",       Icon: FolderOpen      },
  { path: "/leaves",       label: "My Leaves",      Icon: Umbrella        },
  { path: "/screenshots",  label: "My Screenshots", Icon: ScanLine        },
  { path: "/attendance",   label: "My Attendance",  Icon: CalendarCheck2  },
  { path: "/timelines",    label: "My Timeline",    Icon: AlignLeft       },
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;
  const handleLogout = () => { clearToken(); window.location.href = (import.meta.env.BASE_URL || '/') + 'login'; };

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className={`tm-sidebar-backdrop${open ? " open" : ""}`}
        onClick={onClose}
      />
      <div className={`tm-sidebar${open ? " open" : ""}`} style={S.sidebar}>
        <div style={S.logo}>
          {isMobile && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", marginRight: 4, padding: 4, display: "flex" }}
              aria-label="Close menu"
            >✕</button>
          )}
          <Monitor size={20} strokeWidth={2} /> TeamMonitor
        </div>
        <nav style={S.nav}>
          {navItems.map(item => (
            <NavLink key={item.path} to={item.path}
              onClick={isMobile ? onClose : undefined}
              style={({ isActive }) => ({ ...S.navLink, ...(isActive ? S.navLinkActive : {}) })}>
              <item.Icon size={16} strokeWidth={1.75} />
              {item.label}
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
          <button style={S.logoutBtn} onClick={handleLogout}><LogOut size={14} strokeWidth={1.75} /> Sign Out</button>
        </div>
      </div>
    </>
  );
}

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div>
      {/* Mobile topbar */}
      <div className="tm-topbar">
        <button className="tm-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect y="3" width="20" height="2" rx="1"/>
            <rect y="9" width="20" height="2" rx="1"/>
            <rect y="15" width="20" height="2" rx="1"/>
          </svg>
        </button>
        <span className="tm-topbar-title">🖥 TeamMonitor</span>
      </div>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="tm-main" style={S.main}>{children}</main>
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
  const cached = getCachedUser();
  const [user, setUser]       = useState(cached && hasToken() ? cached : null);
  const [loading, setLoading] = useState(!cached || !hasToken());

  useEffect(() => {
    if (!hasToken()) { setLoading(false); return; }
    api.me()
      .then(emp => {
        if (emp) {
          setUser(emp);
          saveUser(emp);
          // Load org timezone and cache it for all formatters
          api.getSettings().then(s => { if (s?.timezone) setTimezone(s.timezone); }).catch(() => {});
        }
        setLoading(false);
      })
      .catch((err) => {
        // Only log out for explicit account deactivation.
        // Everything else (network errors, JWT issues, DB hiccups, server
        // restarts) keeps the cached user — don't punish the user for
        // transient server-side problems.
        if (err?.message === 'Account disabled') {
          clearToken();
          window.location.href = (import.meta.env.BASE_URL || '/') + 'login';
          return;
        }
        setLoading(false);
      });
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
          <Route path="/overview"      element={<AdminRoute><TeamOverview /></AdminRoute>} />
          <Route path="/reports"      element={<AdminRoute><Reports /></AdminRoute>} />
          <Route path="/screenshots"  element={<ProtectedRoute><Screenshots /></ProtectedRoute>} />
          <Route path="/attendance"   element={<ProtectedRoute><Attendance /></ProtectedRoute>} />
          <Route path="/projects"     element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/timelines"    element={<ProtectedRoute><Timelines /></ProtectedRoute>} />
          <Route path="/leaves"       element={<ProtectedRoute><Leaves /></ProtectedRoute>} />
          <Route path="/productivity" element={<ProtectedRoute><Productivity /></ProtectedRoute>} />
          <Route path="/issues"       element={<AdminRoute><Issues /></AdminRoute>} />
          <Route path="/performance"  element={<AdminRoute><PerformanceLogs /></AdminRoute>} />
          <Route path="/settings"     element={<AdminRoute><OrgSettings /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
