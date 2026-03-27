import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, saveToken } from "../api";
import { useAuth } from "../App";

const S = {
  page:  { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" },
  card:  { background: "#fff", borderRadius: 20, padding: 40, width: 420, boxShadow: "0 25px 50px rgba(0,0,0,0.3)" },
  step:  { fontSize: 12, fontWeight: 600, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 },
  title: { fontSize: 24, fontWeight: 700, color: "#1e293b", marginBottom: 4 },
  sub:   { color: "#64748b", fontSize: 14, marginBottom: 28, lineHeight: 1.5 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Inter, sans-serif", marginBottom: 18 },
  btn:   { width: "100%", padding: 13, background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4, fontFamily: "Inter, sans-serif", letterSpacing: "0.01em" },
  error: { background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18, border: "1px solid #fecaca" },
  info:  { background: "#eff6ff", color: "#1d4ed8", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 18, border: "1px solid #bfdbfe", lineHeight: 1.5 },
  back:  { textAlign: "center", marginTop: 20, fontSize: 13, color: "#94a3b8" },
  done:  { textAlign: "center" },
};

function SuccessView({ name, onContinue }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 52, textAlign: "center", marginBottom: 16 }}>🎉</div>
      <div style={{ ...S.title, textAlign: "center" }}>You're all set, {name.split(" ")[0]}!</div>
      <div style={{ ...S.sub, textAlign: "center" }}>
        Your admin account has been created. You can now sign in and start managing your team.
      </div>
      <button style={S.btn} onClick={onContinue}>Go to Dashboard →</button>
    </div>
  );
}

export default function Setup() {
  const [step,     setStep]     = useState("form"); // "form" | "done"
  const [form,     setForm]     = useState({ name: "", email: "", password: "", confirm: "" });
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      await api.bootstrap(form.name, form.email, form.password);
      // Auto-login with the new credentials
      const data = await api.login(form.email, form.password);
      saveToken(data.token);
      setUser(data.employee);
      setStep("done");
    } catch (err) {
      if (err.message?.includes("disabled") || err.message?.includes("already")) {
        setError("An admin account already exists. Please sign in instead.");
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    }
    setLoading(false);
  };

  if (step === "done") {
    return (
      <div style={S.page}>
        <SuccessView name={form.name} onContinue={() => navigate("/dashboard")} />
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 44 }}>🖥</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", marginTop: 6 }}>TeamMonitor</div>
        </div>

        <div style={S.step}>Initial Setup · Step 1 of 1</div>
        <div style={S.title}>Create Admin Account</div>
        <div style={S.sub}>
          This is a one-time setup. Once created, this endpoint is permanently disabled and no one else can use it.
        </div>

        <div style={S.info}>
          🔐 You'll be the <strong>super admin</strong> — you can add employees and manage everything from the dashboard.
        </div>

        {error && <div style={S.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={S.label}>Full Name</label>
          <input
            style={S.input} type="text" placeholder="e.g. Parth Shah" required autoFocus
            value={form.name} onChange={e => set("name", e.target.value)}
          />
          <label style={S.label}>Email Address</label>
          <input
            style={S.input} type="email" placeholder="admin@company.com" required
            value={form.email} onChange={e => set("email", e.target.value)}
          />
          <label style={S.label}>Password</label>
          <input
            style={S.input} type="password" placeholder="Min 6 characters" required
            value={form.password} onChange={e => set("password", e.target.value)}
          />
          <label style={S.label}>Confirm Password</label>
          <input
            style={{ ...S.input, marginBottom: 4 }} type="password" placeholder="Re-enter password" required
            value={form.confirm} onChange={e => set("confirm", e.target.value)}
          />
          <button
            style={{ ...S.btn, opacity: loading ? 0.7 : 1 }}
            type="submit" disabled={loading}
          >
            {loading ? "Creating account…" : "Create Admin Account →"}
          </button>
        </form>

        <div style={S.back}>
          Already have an account? <Link to="/login" style={{ color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
