import { useState } from "react";
import { api } from "../api";
import { T } from "../styles";

export default function LoginScreen({ onAuth }) {
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const attemptLogin = async () => {
    if (!username || !pw) { setErr("Please enter both username and password."); return; }
    setLoading(true);
    setErr("");
    try {
      const res = await api.login(username, pw);
      if (res.success) {
        onAuth({ token: res.token, role: res.role });
      } else {
        setErr(res.error || "Login failed.");
        setPw("");
        // Keep the username on screen — clearing it made a simple typo feel
        // like the account had vanished. Only the password is cleared.
      }
    } catch {
      setErr("Failed to connect to server.");
    }
    setLoading(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <img src="/bpcl_logo.png" alt="Bharat Gas Logo" />
          <div className="login-logo-name">Jay Ranchhod Gas Service</div>
        </div>
        <div className="login-sub">Sign in to your account</div>
        <div className="fade-in">
          {err && <div className="login-err">⚠️ {err}</div>}
          <div className="login-inp-wrap">
            <label style={{fontSize: 11, fontWeight: 600, color: T.inkMid, alignSelf: "flex-start"}}>Username</label>
            <input className="login-inp" type="text" placeholder="Enter username…" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus style={{marginBottom: 12}} />
            
            <label style={{fontSize: 11, fontWeight: 600, color: T.inkMid, alignSelf: "flex-start"}}>Password</label>
            <input className="login-inp" type="password" placeholder="Enter password…" value={pw}
              onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key==="Enter" && attemptLogin()} />
            
            <button className="login-btn" onClick={attemptLogin} disabled={loading} style={{marginTop: 16}}>
              {loading ? "Authenticating..." : "Secure Login →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
