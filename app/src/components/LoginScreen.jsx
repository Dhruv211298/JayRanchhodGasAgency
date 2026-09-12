import { useState } from "react";
import { api } from "../api";
import { T } from "../styles";

export default function LoginScreen({ onAuth }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const attemptLogin = async () => {
    if (!username || !pw) {
      setErr("Please enter both username and password.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await api.login(username, pw);
      if (res.success) {
        onAuth({ token: res.token, role: res.role });
      } else {
        setErr(res.error || "Invalid username or password.");
        setPw("");
      }
    } catch {
      setErr("Failed to connect to authentication server.");
    }
    setLoading(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* Top security tag */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 12px",
          background: "rgba(234, 88, 12, 0.08)",
          border: "1px solid rgba(234, 88, 12, 0.2)",
          borderRadius: 20,
          color: T.accent,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          marginBottom: 16
        }}>
          <span>🛡️</span> Authorized Personnel Only
        </div>

        <div className="login-logo">
          <div style={{
            background: "#ffffff",
            padding: 8,
            borderRadius: 14,
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            display: "inline-flex"
          }}>
            <img src="/bpcl_logo.png" alt="Bharat Gas Logo" style={{ height: 60 }} />
          </div>
          <div className="login-logo-name">JAY RANCHHOD GAS SERVICE</div>
        </div>
        <div className="login-sub">Bharat LPG · Distribution Management Portal</div>

        <div className="fade-in">
          {err && (
            <div className="login-err">
              <span>⚠️</span>
              <span>{err}</span>
            </div>
          )}

          <div className="login-inp-wrap">
            <label style={{ fontSize: 11.5, fontWeight: 700, color: "#475569", letterSpacing: "0.4px" }}>
              Operator / Admin ID
            </label>
            <input
              className="login-inp"
              type="text"
              placeholder="e.g. admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              style={{ marginBottom: 12 }}
            />

            <label style={{ fontSize: 11.5, fontWeight: 700, color: "#475569", letterSpacing: "0.4px" }}>
              Secure Password
            </label>
            <input
              className="login-inp"
              type="password"
              placeholder="••••••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attemptLogin()}
            />

            <button
              className="login-btn"
              onClick={attemptLogin}
              disabled={loading}
              style={{ marginTop: 18 }}
            >
              {loading ? "Authenticating Session..." : "Sign In to Portal →"}
            </button>
          </div>

          <div style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "#94a3b8",
            fontSize: 11,
            fontWeight: 500
          }}>
            <span>🔒 End-to-End Encrypted Session</span>
          </div>
        </div>
      </div>
    </div>
  );
}
