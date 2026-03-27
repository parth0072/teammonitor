import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, saveToken } from "../api";
import { useAuth } from "../App";

const S = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" },
  card: { background: "#fff", borderRadius: 16, padding: 40, width: 380, boxShadow: "0 25px 50px rgba(0,0,0,0.25)" },
  logoIcon: { fontSize: 48, textAlign: "center" },
  logoText: { fontSize: 24, fontWeight: 700, color: "#1e293b", textAlign: "center", marginTop: 8 },
  logoSub:  { color: "#64748b", fontSize: 14, textAlign: "center", marginTop: 4, marginBottom: 28 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Inter, sans-serif" },
  btn:   { width: "100%", padding: 12, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8, fontFamily: "Inter, sans-serif" },
  error: { background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16, border: "1px solid #fecaca" },
  group: { marginBottom: 18 },
};

export default function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await api.login(email, password);
      saveToken(data.token);
      setUser(data.employee);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logoIcon}>🖥</div>
        <div style={S.logoText}>TeamMonitor</div>
        <div style={S.logoSub}>Admin Panel</div>
        {error && <div style={S.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={S.group}>
            <label style={S.label}>Email Address</label>
            <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@company.com" required autoFocus />
          </div>
          <div style={S.group}>
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button style={{ ...S.btn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign In →"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          First time?{" "}
          <Link to="/setup" style={{ color: "rgba(255,255,255,0.75)", textDecoration: "none", fontWeight: 600 }}>
            Create admin account →
          </Link>
        </div>
      </div>
    </div>
  );
}
