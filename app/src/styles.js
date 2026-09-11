export const T = {
  bg: "#f5f3ee",
  card: "#ffffff",
  cardAlt: "#faf9f6",
  border: "#e2ddd6",
  borderDk: "#c9c2b8",
  ink: "#1c1917",
  inkMid: "#57534e",
  inkLight: "#a8a29e",
  accent: "#c2410c",   // burnt orange
  accentBg: "#fff7ed",
  accentLt: "#fdba74",
  success: "#15803d",
  successBg: "#f0fdf4",
  danger: "#b91c1c",
  dangerBg: "#fef2f2",
  warn: "#92400e",
  warnBg: "#fffbeb",
  blue: "#1d4ed8",
  blueBg: "#eff6ff",
  shadow: "0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04)",
  shadowMd: "0 4px 12px rgba(0,0,0,.10)",
};

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body { background: ${T.bg}; font-family: 'DM Sans', sans-serif; color: ${T.ink}; }

.app-shell { min-height: 100vh; }

/* ── Header ── */
.hdr { background: ${T.ink}; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; height: 56px; position: sticky; top: 0; z-index: 100; }
.hdr-brand { display: flex; align-items: center; gap: 10px; }
.hdr-title { font-family: 'Fraunces', serif; font-size: 16px; color: #fff; letter-spacing: .5px; }
.hdr-sub { font-size: 10px; color: ${T.inkLight}; letter-spacing: 2px; text-transform: uppercase; }
.hdr-date { font-size: 11px; color: ${T.inkLight}; letter-spacing: 1px; }

/* ── Nav ── */
.nav { background: ${T.card}; border-bottom: 2px solid ${T.border}; display: flex; overflow-x: auto; scrollbar-width: none; position: sticky; top: 56px; z-index: 99; }
.nav::-webkit-scrollbar { display: none; }
.nav-btn { flex-shrink: 0; padding: 0 18px; height: 44px; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; border: none; border-bottom: 2.5px solid transparent; background: transparent; color: ${T.inkLight}; cursor: pointer; transition: all .18s; white-space: nowrap; }
.nav-btn.active { color: ${T.accent}; border-bottom-color: ${T.accent}; }
.nav-btn:hover:not(.active) { color: ${T.ink}; background: ${T.cardAlt}; }

/* ── Main ── */
.main { padding: 16px; max-width: 1080px; margin: 0 auto; }

/* ── Login ── */
.login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${T.bg}; padding: 20px; }
.login-card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 12px; padding: 40px 32px; width: 100%; max-width: 420px; box-shadow: ${T.shadowMd}; text-align: center; }
.login-logo { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-bottom: 8px; }
.login-logo img { height: 64px; object-fit: contain; filter: drop-shadow(0 2px 6px rgba(0,0,0,.15)); }
.login-logo-name { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: ${T.ink}; line-height: 1.2; }
.login-sub { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: ${T.inkLight}; margin-bottom: 32px; }
.login-options { display: flex; flex-direction: column; gap: 12px; }
.login-role-btn { background: ${T.cardAlt}; border: 1.5px solid ${T.border}; padding: 14px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600; color: ${T.inkMid}; cursor: pointer; transition: all .2s; }
.login-role-btn:hover { border-color: ${T.accent}; color: ${T.accent}; background: ${T.accentBg}; }
.login-inp-wrap { display: flex; flex-direction: column; gap: 8px; text-align: left; }
.login-inp { width: 100%; background: ${T.cardAlt}; border: 1.5px solid ${T.border}; border-radius: 8px; padding: 12px 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; color: ${T.ink}; outline: none; transition: border-color .2s; }
.login-inp:focus { border-color: ${T.accent}; }
.login-btn { width: 100%; background: ${T.accent}; color: #fff; border: none; border-radius: 8px; padding: 14px; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 700; cursor: pointer; transition: background .2s; margin-top: 8px; }
.login-btn:hover { background: #9a3412; }
.login-back { font-size: 12px; color: ${T.inkLight}; cursor: pointer; margin-top: 16px; text-decoration: underline; text-align: center; }
.login-err { background: ${T.dangerBg}; border: 1px solid #fecaca; border-radius: 6px; padding: 10px; font-size: 12px; color: ${T.danger}; margin-bottom: 16px; text-align: left; }

/* ── Cards / Sections ── */
.card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 10px; box-shadow: ${T.shadow}; overflow: hidden; margin-bottom: 14px; }
.card-head { padding: 10px 16px; background: ${T.cardAlt}; border-bottom: 1px solid ${T.border}; display: flex; align-items: center; justify-content: space-between; }
.card-head-title { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${T.inkMid}; display: flex; align-items: center; gap: 6px; }
.card-body { padding: 14px 16px; }

/* ── Grid layouts ── */
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
.row { display: flex; gap: 14px; }
.row > * { flex: 1; }

/* ── Form controls ── */
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: ${T.inkLight}; margin-bottom: 4px; }
.inp { width: 100%; background: ${T.cardAlt}; border: 1.5px solid ${T.border}; border-radius: 6px; padding: 8px 10px; font-family: 'DM Sans', sans-serif; font-size: 13px; color: ${T.ink}; outline: none; transition: border-color .15s; }
.inp:focus { border-color: ${T.accent}; }
.inp-inline { width: 100%; background: transparent; border: none; border-bottom: 1.5px solid ${T.border}; padding: 4px 6px; font-family: 'DM Sans', sans-serif; font-size: 13px; color: ${T.ink}; outline: none; transition: border-color .15s; text-align: center !important; }
.inp-inline:focus { border-bottom-color: ${T.accent}; }
.inp-inline.left { text-align: left; }

/* ── Tables ── */
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { padding: 8px 10px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${T.inkLight}; border-bottom: 1.5px solid ${T.border}; text-align: center !important; white-space: nowrap; }
.tbl td { padding: 7px 10px; border-bottom: 1px solid #f0ece6; vertical-align: middle; text-align: center !important; }
.tbl tr:last-child td { border-bottom: none; }
.tbl tr:hover td { background: ${T.cardAlt}; }
.tbl-total td { background: ${T.cardAlt} !important; font-weight: 700; font-size: 12px; }

/* ── Buttons ── */
.btn-primary { background: ${T.accent}; color: #fff; border: none; border-radius: 8px; padding: 10px 24px; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; transition: all .18s; }
.btn-primary:hover { background: #9a3412; }
.btn-ghost { background: transparent; color: ${T.inkMid}; border: 1.5px solid ${T.border}; border-radius: 6px; padding: 7px 14px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: .8px; text-transform: uppercase; cursor: pointer; transition: all .18s; }
.btn-ghost:hover { border-color: ${T.accent}; color: ${T.accent}; }
.btn-danger { background: ${T.danger}; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer; transition: background .18s; }
.btn-danger:hover { background: #991b1b; }
.btn-icon { background: transparent; border: 1.5px solid ${T.border}; border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: ${T.inkLight}; font-size: 14px; transition: all .15s; flex-shrink: 0; }
.btn-icon:hover { border-color: ${T.danger}; color: ${T.danger}; }
.btn-add { background: ${T.accentBg}; color: ${T.accent}; border: 1.5px dashed ${T.accentLt}; border-radius: 6px; padding: 7px 14px; font-family: 'DM Sans', sans-serif; font-size: 11px; font-weight: 600; cursor: pointer; transition: all .18s; width: 100%; margin-top: 6px; }
.btn-add:hover { background: #fff7ed; border-style: solid; }

/* ── Badges / Tags ── */
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
.badge-danger  { background: ${T.dangerBg}; color: ${T.danger}; }
.badge-success { background: ${T.successBg}; color: ${T.success}; }
.badge-warn    { background: ${T.warnBg}; color: ${T.warn}; }
.badge-blue    { background: ${T.blueBg}; color: ${T.blue}; }
.badge-ink     { background: #f5f5f4; color: ${T.inkMid}; }

/* ── Alert banners ── */
.alert { border-radius: 8px; padding: 10px 14px; font-size: 12px; font-weight: 500; margin-bottom: 14px; }
.alert-success { background: ${T.successBg}; color: ${T.success}; border: 1px solid #bbf7d0; }
.alert-warn    { background: ${T.warnBg}; color: ${T.warn}; border: 1px solid #fde68a; }

/* ── Stat cards ── */
.stat-row { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.stat-card { background: ${T.card}; border: 1px solid ${T.border}; border-radius: 10px; padding: 14px 16px; flex: 1; min-width: 130px; position: relative; overflow: hidden; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--kpi-color, transparent); }
.stat-val { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin-bottom: 2px; }
.stat-lbl { font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: ${T.inkLight}; }
.stat-delta { font-size: 11px; font-weight: 600; margin-top: 6px; }

/* ── Admin Tabs ── */
.prod-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.prod-tab { padding: 6px 14px; border-radius: 20px; border: 1.5px solid ${T.border}; background: ${T.cardAlt}; color: ${T.inkMid}; font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .18s; }
.prod-tab.active { background: ${T.accent}; border-color: ${T.accent}; color: #fff; }

/* ── Cash on hand bar ── */
.coh-bar { background: ${T.ink}; color: #fff; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; flex-wrap: wrap; }
.coh-label { font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: ${T.accentLt}; margin-bottom: 4px; }
.coh-formula { font-size: 11px; color: #a8a29e; }
.coh-amount { font-family: 'Fraunces', serif; font-size: 34px; font-weight: 700; color: #fdba74; }
.coh-amount.negative { color: #f87171; }

/* ── Pending credit items ── */
.pending-item { border: 1px solid ${T.border}; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; background: ${T.card}; }
.pending-item.cleared { opacity: .55; border-color: #d1fae5; background: ${T.successBg}; }
.pi-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px; }
.pi-name { font-weight: 600; font-size: 14px; }
.pi-meta { font-size: 11px; color: ${T.inkLight}; margin-top: 2px; }
.pi-bar-wrap { background: #f5f5f4; border-radius: 20px; height: 6px; overflow: hidden; margin-bottom: 6px; }
.pi-bar { height: 100%; border-radius: 20px; background: ${T.danger}; transition: width .4s ease; }
.pi-bar.done { background: ${T.success}; }
.pi-amounts { display: flex; justify-content: space-between; font-size: 11px; }

/* ── Period buttons ── */
.period-row { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }

/* ── Responsive breakpoints ── */
@media (max-width: 680px) {
  .g2 { grid-template-columns: 1fr; }
  .g3 { grid-template-columns: 1fr; }
  .row { flex-direction: column; }
  .hdr-title { font-size: 13px; }
  .hdr-sub { display: none; }
  .main { padding: 10px; }
  .coh-amount { font-size: 26px; }
  .stat-card { min-width: 100px; }
  .stat-val { font-size: 18px; }
  .tbl { display: block; overflow-x: auto; }
}
@media (max-width: 400px) {
  .g3 { grid-template-columns: 1fr; }
  .nav-btn { padding: 0 12px; font-size: 11px; }
}

/* ── Animations ── */
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.fade-in { animation: fadeIn .25s ease; }
`;

export function injectCSS() {
  if (document.getElementById("jrgs-style")) return;
  const el = document.createElement("style");
  el.id = "jrgs-style";
  el.textContent = CSS;
  document.head.appendChild(el);
}
