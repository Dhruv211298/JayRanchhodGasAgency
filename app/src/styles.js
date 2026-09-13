export const T = {
  bg: "#f8fafc",
  card: "#ffffff",
  cardAlt: "#f8fafc",
  border: "#e2e8f0",
  borderDk: "#cbd5e1",
  ink: "#0f172a",
  inkMid: "#475569",
  inkLight: "#94a3b8",
  accent: "#ea580c",     // LPG energetic flame orange
  accentBg: "#fff7ed",
  accentLt: "#fdba74",
  accentGradient: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
  navy: "#0f172a",
  navyAlt: "#1e293b",
  success: "#059669",
  successBg: "#ecfdf5",
  danger: "#e11d48",
  dangerBg: "#fff1f2",
  warn: "#d97706",
  warnBg: "#fffbeb",
  blue: "#2563eb",
  blueBg: "#eff6ff",
  shadow: "0 1px 3px rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)",
  shadowMd: "0 4px 14px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -2px rgba(15, 23, 42, 0.04)",
  shadowLg: "0 12px 24px -4px rgba(15, 23, 42, 0.09), 0 4px 8px -2px rgba(15, 23, 42, 0.04)",
  touchMin: "44px",
  radiusXl: "18px",
  glassBg: "rgba(255, 255, 255, 0.88)",
  glassBorder: "rgba(226, 232, 240, 0.8)",
};

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Outfit:wght@500;600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: ${T.bg};
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: ${T.ink};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${T.bg};
}

/* ── Top Header ── */
.hdr {
  background: linear-gradient(135deg, #0b1120 0%, #0f172a 50%, #1e293b 100%);
  border-top: 3.5px solid #ea580c;
  padding: 0 max(16px, env(safe-area-inset-left));
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 62px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
}
.hdr-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.hdr-logo-box {
  height: 40px;
  width: 40px;
  background: #ffffff;
  border-radius: 8px;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}
.hdr-logo-box img {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
.hdr-title {
  font-family: 'Outfit', sans-serif;
  font-size: 15.5px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.5px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hdr-sub {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hdr-date {
  font-size: 11.5px;
  font-weight: 600;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 5px 12px;
  border-radius: 20px;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.hdr-menu-btn {
  display: none;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #ffffff;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}
.hdr-menu-btn:hover {
  background: rgba(234, 88, 12, 0.25);
  border-color: #ea580c;
}
.hdr-badges-desktop {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hdr-mobile-actions {
  display: none;
  align-items: center;
  gap: 8px;
}

/* ── Mobile Navigation Drawer ── */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(11, 17, 32, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
}
.drawer-panel {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 310px;
  max-width: 86vw;
  background: #ffffff;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  box-shadow: 8px 0 32px rgba(0, 0, 0, 0.25);
  overflow-y: auto;
}
.drawer-header {
  background: linear-gradient(135deg, #0b1120 0%, #0f172a 100%);
  padding: 20px 18px;
  border-bottom: 3px solid #ea580c;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.drawer-close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}
.drawer-close-btn:hover {
  background: rgba(234, 88, 12, 0.3);
  border-color: #ea580c;
}
.drawer-content {
  flex: 1;
  padding: 14px 12px;
  overflow-y: auto;
}
.drawer-section-lbl {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: #94a3b8;
  padding: 10px 12px 6px;
}
.drawer-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #334155;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
  min-height: 44px;
}
.drawer-nav-item:hover {
  background: #f8fafc;
  color: ${T.accent};
}
.drawer-nav-item.active {
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.12) 0%, rgba(234, 88, 12, 0.05) 100%);
  color: ${T.accent};
  font-weight: 700;
  border-left: 3.5px solid ${T.accent};
}
.drawer-footer {
  padding: 14px 16px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── Mobile Bottom Quick Bar ── */
.mobile-bottom-bar {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  z-index: 990;
  padding-bottom: env(safe-area-inset-bottom);
  justify-content: space-around;
  align-items: center;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.25);
}
.bottom-nav-item {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
  transition: all 0.2s ease;
  position: relative;
  min-height: 48px;
}
.bottom-nav-item.active {
  color: #fdba74;
  font-weight: 700;
}
.bottom-nav-item.active::after {
  content: '';
  position: absolute;
  top: 4px;
  width: 20px;
  height: 3px;
  border-radius: 2px;
  background: #ea580c;
  box-shadow: 0 0 8px #ea580c;
}

/* ── Responsive Table Wrapper ── */
.table-responsive {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 10px;
  position: relative;
}
.table-scroll-hint {
  display: none;
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  margin-top: 6px;
  text-align: right;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
}

/* ── Navigation Bar ── */
.nav-wrapper {
  position: sticky;
  top: 62px;
  z-index: 99;
  background: #ffffff;
  border-bottom: 1px solid ${T.border};
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  display: flex;
  align-items: center;
}
.nav {
  display: flex;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(234, 88, 12, 0.3) transparent;
  scroll-behavior: smooth;
  flex: 1;
}
.nav::-webkit-scrollbar { height: 4px; }
.nav::-webkit-scrollbar-track { background: transparent; }
.nav::-webkit-scrollbar-thumb { background: rgba(234, 88, 12, 0.25); border-radius: 4px; }
.nav::-webkit-scrollbar-thumb:hover { background: ${T.accent}; }

.nav-btn {
  flex-shrink: 0;
  padding: 0 18px;
  height: 48px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  border: none;
  border-bottom: 2.5px solid transparent;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}
.nav-btn:hover:not(.active) {
  color: ${T.ink};
  background: #f8fafc;
}
.nav-btn.active {
  color: ${T.accent};
  border-bottom-color: ${T.accent};
  font-weight: 700;
  background: rgba(234, 88, 12, 0.04);
}
.nav-scroll-btn {
  background: #ffffff;
  border: none;
  padding: 0 8px;
  cursor: pointer;
  color: #64748b;
  font-size: 18px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: bold;
  transition: all 0.15s ease;
}
.nav-scroll-btn:hover {
  color: ${T.accent};
  background: #f8fafc;
}

/* ── Product & Sub-Report Segmented Pill Tabs ── */
.prod-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  background: #f8fafc;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  margin-bottom: 18px;
  align-items: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.prod-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 9px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  white-space: nowrap;
}
.prod-tab:hover:not(.active) {
  color: #0f172a;
  border-color: #cbd5e1;
  background: #f1f5f9;
  transform: translateY(-1px);
}
.prod-tab.active {
  background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
  color: #ffffff;
  border-color: #c2410c;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(234, 88, 12, 0.28);
  transform: translateY(-1px);
}

/* ── Main Container ── */
.main {
  padding: 24px;
  max-width: 1260px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

/* ── Login Portal ── */
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 10% 20%, #1e293b 0%, #0f172a 90%);
  padding: 24px;
  position: relative;
  overflow: hidden;
}
.login-wrap::before {
  content: '';
  position: absolute;
  top: -150px;
  right: -150px;
  width: 450px;
  height: 450px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(234, 88, 12, 0.25) 0%, transparent 70%);
  filter: blur(50px);
  pointer-events: none;
}
.login-wrap::after {
  content: '';
  position: absolute;
  bottom: -150px;
  left: -150px;
  width: 450px;
  height: 450px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(37, 99, 235, 0.2) 0%, transparent 70%);
  filter: blur(50px);
  pointer-events: none;
}
.login-card {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 18px;
  padding: 44px 38px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
  text-align: center;
  position: relative;
  z-index: 2;
  backdrop-filter: blur(16px);
}
.login-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}
.login-logo img {
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.12));
}
.login-logo-name {
  font-family: 'Outfit', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.3px;
}
.login-sub {
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 28px;
  font-weight: 600;
}
.login-inp-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
}
.login-inp {
  width: 100%;
  background: #f8fafc;
  border: 1.5px solid ${T.border};
  border-radius: 10px;
  padding: 12px 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 14px;
  color: ${T.ink};
  outline: none;
  transition: all 0.2s ease;
}
.login-inp:focus {
  border-color: ${T.accent};
  background: #ffffff;
  box-shadow: 0 0 0 3.5px rgba(234, 88, 12, 0.15);
}
.login-btn {
  width: 100%;
  background: ${T.accentGradient};
  color: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.4px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 6px 16px rgba(234, 88, 12, 0.3);
}
.login-btn:hover {
  transform: translateY(-1.5px);
  box-shadow: 0 8px 22px rgba(234, 88, 12, 0.4);
  filter: brightness(1.04);
}
.login-btn:active {
  transform: translateY(0);
}
.login-err {
  background: ${T.dangerBg};
  border: 1px solid #fecdd3;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  color: ${T.danger};
  margin-bottom: 16px;
  text-align: left;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Cards / Surfaces ── */
.card {
  background: #ffffff;
  border: 1px solid ${T.border};
  border-radius: 14px;
  box-shadow: ${T.shadow};
  overflow: hidden;
  margin-bottom: 18px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.card:hover {
  box-shadow: ${T.shadowMd};
  border-color: #cbd5e1;
}
.card-head {
  padding: 12px 18px;
  background: #f8fafc;
  border-bottom: 1px solid ${T.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-head-title {
  font-family: 'Outfit', sans-serif;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-body {
  padding: 18px 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* ── Grid Layouts ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.row { display: flex; gap: 16px; }
.row > * { flex: 1; }

/* ── Form Controls ── */
.field { margin-bottom: 12px; }
.field label {
  display: block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 5px;
}
.inp {
  width: 100%;
  background: #ffffff;
  border: 1.5px solid ${T.border};
  border-radius: 8px;
  padding: 9px 12px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13.5px;
  color: ${T.ink};
  outline: none;
  transition: all 0.18s ease;
}
.inp:focus {
  border-color: ${T.accent};
  box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.15);
}

/* Number inputs without clipping or spinners */
input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type=number] {
  -moz-appearance: textfield;
}

.inp-inline {
  width: 100%;
  min-width: 55px;
  background: transparent;
  border: none;
  border-bottom: 2px solid ${T.border};
  padding: 4px 6px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 13.5px;
  font-weight: 600;
  color: ${T.ink};
  outline: none;
  transition: all 0.18s ease;
  text-align: center !important;
}
.inp-inline:focus {
  border-bottom-color: ${T.accent};
  background: rgba(234, 88, 12, 0.03);
}
.inp-inline.left {
  text-align: left !important;
}

/* ── Tables ── */
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.tbl th {
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1.5px solid ${T.border};
  text-align: center !important;
  white-space: nowrap;
}
.tbl td {
  padding: 9px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
  text-align: center !important;
  color: #1e293b;
}
.tbl tr:last-child td {
  border-bottom: none;
}
.tbl tr:hover td {
  background: #f8fafc;
}
.tbl-total td {
  background: #f8fafc !important;
  font-weight: 700;
  font-size: 13px;
  border-top: 2px solid ${T.border};
  color: #0f172a;
}

/* ── Buttons ── */
.btn-primary {
  background: ${T.accentGradient};
  color: #ffffff;
  border: none;
  border-radius: 9px;
  padding: 10px 22px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(234, 88, 12, 0.35);
  filter: brightness(1.03);
}
.btn-primary:active {
  transform: translateY(1px);
}

.btn-ghost {
  background: #ffffff;
  color: #475569;
  border: 1.5px solid ${T.borderDk};
  border-radius: 8px;
  padding: 8px 16px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  cursor: pointer;
  transition: all 0.18s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-ghost:hover {
  border-color: ${T.accent};
  color: ${T.accent};
  background: #fff7ed;
}

.btn-danger {
  background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 7px 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow: 0 2px 8px rgba(225, 29, 72, 0.25);
}
.btn-danger:hover {
  filter: brightness(1.05);
  box-shadow: 0 4px 12px rgba(225, 29, 72, 0.35);
}

.btn-icon {
  background: #ffffff;
  border: 1.5px solid ${T.border};
  border-radius: 7px;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #64748b;
  font-size: 14px;
  transition: all 0.18s ease;
  flex-shrink: 0;
}
.btn-icon:hover {
  border-color: ${T.danger};
  color: ${T.danger};
  background: #fff1f2;
}

.btn-add {
  background: ${T.accentBg};
  color: ${T.accent};
  border: 1.5px dashed ${T.accentLt};
  border-radius: 8px;
  padding: 8px 16px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  width: 100%;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.btn-add:hover {
  background: #ffedd5;
  border-style: solid;
}

/* ── Badges / Chips ── */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.badge-danger  { background: ${T.dangerBg}; color: ${T.danger}; border: 1px solid #fecdd3; }
.badge-success { background: ${T.successBg}; color: ${T.success}; border: 1px solid #a7f3d0; }
.badge-warn    { background: ${T.warnBg}; color: ${T.warn}; border: 1px solid #fde68a; }
.badge-blue    { background: ${T.blueBg}; color: ${T.blue}; border: 1px solid #bfdbfe; }
.badge-ink     { background: #f1f5f9; color: ${T.inkMid}; border: 1px solid #e2e8f0; }

/* ── Alert Banners ── */
.alert {
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.alert-success { background: ${T.successBg}; color: ${T.success}; border: 1px solid #bbf7d0; }
.alert-warn    { background: ${T.warnBg}; color: ${T.warn}; border: 1px solid #fde68a; }

/* ── KPI Stat Cards ── */
.stat-row { display: flex; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
.stat-card {
  background: #ffffff;
  border: 1px solid ${T.border};
  border-radius: 14px;
  padding: 18px 20px;
  flex: 1;
  min-width: 140px;
  position: relative;
  overflow: hidden;
  box-shadow: ${T.shadow};
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: ${T.shadowMd};
}
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3.5px;
  background: var(--kpi-color, ${T.accent});
}
.stat-val {
  font-family: 'Outfit', sans-serif;
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 3px;
}
.stat-lbl {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #64748b;
}
.stat-delta {
  font-size: 11.5px;
  font-weight: 600;
  margin-top: 6px;
}

/* ── Cash on Hand Executive Bar ── */
.coh-bar {
  background: linear-gradient(135deg, #0b1120 0%, #0f172a 50%, #1e293b 100%);
  color: #ffffff;
  border-radius: 14px;
  padding: 18px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  gap: 16px;
  flex-wrap: wrap;
  box-shadow: 0 10px 25px -4px rgba(15, 23, 42, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.coh-label {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #fdba74;
  margin-bottom: 4px;
}
.coh-formula {
  font-size: 12px;
  color: #94a3b8;
}
.coh-amount {
  font-family: 'Outfit', sans-serif;
  font-size: 34px;
  font-weight: 800;
  color: #fdba74;
  letter-spacing: -0.5px;
}
.coh-amount.negative { color: #fb7185; }

/* ── Animations ── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.fade-in { animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1); }

/* ── Responsive Breakpoints ── */
@media (max-width: 1024px) {
  .g3 { grid-template-columns: 1fr 1fr; }
  .table-scroll-hint { display: flex; }
}

@media (max-width: 768px) {
  .g2 { grid-template-columns: 1fr !important; }
  .g3 { grid-template-columns: 1fr !important; }
  .row { flex-direction: column !important; }

  /* Header */
  .hdr {
    padding: 0 12px;
    height: 58px;
  }
  .hdr-menu-btn {
    display: flex;
  }
  .hdr-badges-desktop {
    display: none;
  }
  .hdr-mobile-actions {
    display: flex;
  }
  .hdr-title {
    font-size: 14px;
    max-width: 180px;
  }
  .hdr-sub {
    display: none;
  }

  /* Navigation */
  .nav-scroll-btn {
    display: none;
  }
  .nav-btn {
    padding: 0 14px;
    height: 44px;
    font-size: 11.5px;
  }

  /* Mobile Bottom Bar active */
  .mobile-bottom-bar {
    display: flex;
  }

  /* Main container */
  .main {
    padding: 12px;
    padding-bottom: 96px; /* Extra padding so bottom bar does not obscure inputs/buttons */
  }

  /* Cards */
  .card {
    border-radius: 12px;
    margin-bottom: 14px;
  }
  .card-head {
    padding: 10px 14px;
    flex-wrap: wrap;
    gap: 8px;
  }
  .card-body {
    padding: 14px 12px;
  }

  /* KPI Stat Cards */
  .stat-row {
    gap: 10px;
    margin-bottom: 14px;
  }
  .stat-card {
    min-width: calc(50% - 6px);
    flex: 1 1 calc(50% - 6px);
    padding: 14px;
    border-radius: 12px;
  }
  .stat-val {
    font-size: 20px;
  }

  /* Cash on Hand Bar */
  .coh-bar {
    flex-direction: column;
    align-items: flex-start;
    padding: 16px;
    gap: 10px;
    border-radius: 12px;
  }
  .coh-amount {
    font-size: 28px;
    width: 100%;
    text-align: left;
  }

  /* Forms & Touch Targets */
  input:not([type=checkbox]):not([type=radio]), select, textarea {
    font-size: 16px !important; /* Prevents iOS Safari auto-zoom on focus */
    min-height: 44px;
  }
  .inp {
    padding: 10px 12px;
    border-radius: 8px;
  }
  .inp-inline {
    min-height: 38px;
    font-size: 15px !important;
  }

  /* Segmented Sub-Pill Tabs */
  .prod-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding: 6px;
    border-radius: 12px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .prod-tabs::-webkit-scrollbar {
    display: none;
  }
  .prod-tab {
    flex-shrink: 0;
    min-height: 40px;
    padding: 8px 14px;
    font-size: 12.5px;
  }

  /* Table responsiveness */
  .table-scroll-hint {
    display: flex;
  }
  .tbl th, .tbl td {
    padding: 8px 9px;
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .hdr {
    padding: 0 10px;
    height: 54px;
  }
  .hdr-logo-box {
    height: 34px;
    width: 34px;
  }
  .hdr-title {
    font-size: 12.5px;
    max-width: 145px;
  }
  .main {
    padding: 8px;
    padding-bottom: 96px;
  }
  .stat-card {
    min-width: 100%;
    flex: 1 1 100%;
  }
}
`;

export function injectCSS() {
  const existing = document.getElementById("jrgs-style");
  if (existing) {
    existing.textContent = CSS;
    return;
  }
  const el = document.createElement("style");
  el.id = "jrgs-style";
  el.textContent = CSS;
  document.head.appendChild(el);
}
