import { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import { api } from "./api";
import { T, injectCSS } from "./styles";
import {
  PRODUCTS, DEFAULT_BOYS, todayStr, fmtDate, blankEntry, calcEntry, finaliseProducts
} from "./constants";

// Separate Components
import LoginScreen from "./components/LoginScreen";
import { DailyEntry, History, PendingCredits, Summary, SalaryReport } from "./components/UserSide";
import {
  AdminDashboard, AdminPriceHistory, AdminCommission,
  AdminDayReports, AdminCreditOverview, AdminUsers,
  AdminVehicleMaster, AdminEmployeeMaster, AdminSalaryReport,
  AdminProductMaster
} from "./components/AdminSide";
import ConnectionsTab from "./components/ConnectionsTab";

/* Pure helpers — kept outside the component so loadData's useCallback has
   no hidden dependencies. */
const getRecoveriesForDate = (date, pendingList) => {
  const recoveries = [];
  (pendingList || []).forEach(p => {
    (p.payments || []).forEach(pay => {
      if (pay.date === date) {
        recoveries.push({
          ledgerId: p.id,
          customerName: p.customerName,
          productId: p.productId,
          amt: pay.amt,
          note: pay.note,
          emptyReturned: pay.emptyReturned
        });
      }
    });
  });
  return recoveries;
};

/* Build the entry object to show for a date: the saved entry if one exists,
   otherwise a blank seeded from the last SAVED entry strictly BEFORE that
   date. (Previously a blank was always seeded from the latest entry overall,
   so an admin back-dating to a gap got the wrong opening stock and cash.) */
const buildEntryForDate = (date, data) => {
  const list = data.entries;
  const existing = list.find(x => x.date === date);
  if (existing) return existing;
  const before = list.filter(e => e.date < date).sort((a, b) => b.date.localeCompare(a.date));
  const lastEntry = before.length > 0 ? before[0] : null;
  const blank = blankEntry(data.prices, data.boys, lastEntry, {
    date, connectionsByDate: data.connectionsByDate, entries: list, products: data.products,
  });
  blank.creditRecoveries = getRecoveriesForDate(date, data.pending);
  return blank;
};

export default function App() {
  injectCSS();

  const [authedRole, setAuthedRole] = useState(null); // null | "user" | "admin"
  const [tab, setTab] = useState("entry");
  const [sessionChecked, setSessionChecked] = useState(false); // true once startup verification is done

  const [entries, setEntries] = useState([]);
  const [pending, setPending] = useState([]);
  const [prices, setPrices] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [products, setProducts] = useState(PRODUCTS);
  // Connection-module activity keyed by date — includes days that have no
  // saved daily entry yet, so a blank entry can still pick up its cylinders
  // and cash events. See blankEntry() in constants.js.
  const [connectionsByDate, setConnectionsByDate] = useState({});

  const [entry, setEntry] = useState(blankEntry([], []));
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadData = useCallback(async (restoreDate = null) => {
    setLoadError(null);
    let data;
    try {
      data = await api.load();
    } catch (e) {
      if (e.message === "session_expired") return;
      setLoading(false);
      setLoadError(e.message || "Could not reach the server.");
      return;
    }
    const pendingList = data.pending || [];
    const byDate = data.connectionsByDate || {};

    // Map entries to dynamically calculate and attach creditRecoveries from pending payments
    const entriesList = (data.entries || []).map(e => ({
      ...e,
      creditRecoveries: getRecoveriesForDate(e.date, pendingList),
      connectionPayments: e.connectionPayments || [],
      connectionRefunds: e.connectionRefunds || [],
      connectionMovements: e.connectionMovements || [],
    }));
    const loadedBoys = data.boys && data.boys.length > 0 ? data.boys : DEFAULT_BOYS;
    const loadedProducts = data.products && data.products.length > 0 ? data.products : PRODUCTS;

    setEntries(entriesList);
    setPending(pendingList);
    setPrices(data.prices || []);
    setCommissions(data.commissions || []);
    setVehicles(data.vehicles || []);
    setEmployees(data.employees || []);
    setDeliveryBoys(loadedBoys);
    setProducts(loadedProducts);
    setConnectionsByDate(byDate);

    // If a specific date was requested (e.g. after saving a backdated entry), restore that date
    const targetDate = restoreDate || todayStr();
    setEntry(buildEntryForDate(targetDate, {
      entries: entriesList, prices: data.prices || [], boys: loadedBoys, pending: pendingList, connectionsByDate: byDate, products: loadedProducts,
    }));
    setLoading(false);
  }, []);

  useEffect(() => {
    // On startup: verify the stored JWT token against the server.
    // This prevents stale/tampered tokens from granting access.
    const initSession = async () => {
      const result = await api.verifySession();
      if (result.valid) {
        setAuthedRole(result.role);
        setTab(result.role === "admin" ? "admin-entry" : "entry");
        await loadData();
      } else {
        // Token missing, expired, or invalid — clear it and show login
        localStorage.removeItem("authToken");
        setLoading(false);
      }
      setSessionChecked(true);
    };
    initSession();

    // Listen for mid-session expiry (dispatched by api.js when any call returns 401)
    const handleExpired = () => {
      setAuthedRole(null);
      setLoading(false);
      Swal.fire({
        title: "Session Expired",
        text: "Your session has ended. Please log in again.",
        icon: "warning",
        confirmButtonColor: "#0077ff",
        confirmButtonText: "Log In"
      });
    };
    window.addEventListener("session:expired", handleExpired);

    // The server now enforces roles independently of the UI. If an action is
    // refused, the session is still valid — explain rather than log the user out.
    const handleForbidden = (ev) => {
      Swal.fire({
        title: "Not Permitted",
        text: (ev.detail && ev.detail.message) || "You do not have permission to perform this action.",
        icon: "error",
        confirmButtonColor: "#ef4444",
      });
    };
    window.addEventListener("api:forbidden", handleForbidden);

    return () => {
      window.removeEventListener("session:expired", handleExpired);
      window.removeEventListener("api:forbidden", handleForbidden);
    };
  }, [loadData]);

  /* ── switch the Daily Entry screen to another date ──
     Loads that date's saved entry, or a correctly-seeded blank. Unsaved edits
     on the current date are discarded after confirmation. */
  const handleDateChange = async (date) => {
    if (!date || date === entry.date) return;
    const savedVersion = entries.find(x => x.date === entry.date);
    const dirty = savedVersion ? JSON.stringify(savedVersion) !== JSON.stringify(entry) : false;
    if (dirty) {
      const r = await Swal.fire({
        title: "Discard unsaved changes?",
        text: `You have unsaved edits for ${fmtDate(entry.date)}. Switching dates will discard them.`,
        icon: "warning", showCancelButton: true, confirmButtonText: "Discard & switch", confirmButtonColor: "#ef4444",
      });
      if (!r.isConfirmed) return;
    }
    setEntry(buildEntryForDate(date, { entries, prices, boys: deliveryBoys, pending, connectionsByDate, products }));
  };

  /* ── save daily entry ── */
  const handleSave = async () => {
    try {
      const savedDate = entry.date; // Remember the date being saved
      const finalEntry = { ...entry };
      // Closing stock is derived by the shared stock engine in constants.js.
      // This MUST be the same function the UI displays from, otherwise the
      // saved figure and the shown figure drift apart and the error is
      // carried into the next day's opening stock.
      finalEntry.products = finaliseProducts(finalEntry);

      const response = await api.saveEntry(finalEntry);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      // Reload data and restore the entry for the date that was just saved
      // (without this, loadData defaults to today — wrong for admin backdated entries)
      await loadData(savedDate);

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);

      Swal.fire({
        title: "Saved Successfully!",
        text: "The daily entry has been recorded in the database.",
        icon: "success",
        confirmButtonColor: "#0077ff",
        timer: 2500,
        timerProgressBar: true
      });
    } catch (error) {
      if (error.message === "session_expired" || error.forbidden) return; // handled globally
      console.error("Save Entry Error:", error);
      Swal.fire({
        title: "Save Failed!",
        text: error.message || "An error occurred while saving the entry.",
        icon: "error",
        confirmButtonColor: "#ef4444"
      });
    }
  };

  /* ── record a recovery payment against a pending credit ──
     savePayment now throws on a rejected request (validation failure, missing
     ledger row, server error) and carries an idempotency key so a double
     submit cannot book the same recovery twice. */
  const recordPayment = async (pendingId, payAmt, payDate, note, emptyReturned) => {
    try {
      const res = await api.savePayment(pendingId, payAmt, payDate, note, emptyReturned);
      await loadData(entry.date);
      if (res && res.duplicate) {
        Swal.fire({
          title: "Already Recorded",
          text: "This payment was already saved — it has not been counted twice.",
          icon: "info",
          confirmButtonColor: "#0077ff",
        });
      }
    } catch (error) {
      if (error.message === "session_expired" || error.forbidden) return; // handled globally
      Swal.fire({
        title: "Payment Not Saved",
        text: error.message || "Could not record the payment.",
        icon: "error",
        confirmButtonColor: "#ef4444",
      });
    }
  };

  /* ── delete a daily entry (admin only) ── */
  const handleDeleteEntry = async (date) => {
    try {
      const res = await api.deleteEntry(date);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Delete failed");
      }
      // Reload from the server so stock/cash seeds and connection data stay consistent.
      await loadData(entry.date === date ? null : entry.date);
      Swal.fire({ title: "Deleted!", text: `Entry for ${fmtDate(date)} removed.`, icon: "success", timer: 1800, timerProgressBar: true, confirmButtonColor: "#0077ff" });
    } catch (err) {
      if (err.message === "session_expired" || err.forbidden) return;
      Swal.fire({ title: "Delete Failed", text: err.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    setAuthedRole(null);
  };

  if (loading || !sessionChecked) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.inkLight, letterSpacing: 2, fontSize: 13 }}>
      Loading…
    </div>
  );

  if (!authedRole) return <LoginScreen onAuth={async ({ token, role }) => {
    localStorage.setItem("authToken", token);
    setAuthedRole(role);
    setTab(role === "admin" ? "admin-entry" : "entry");
    setLoading(true);
    await loadData(); // Fresh load on login
  }} />;

  if (loadError) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.inkMid, gap: 14, padding: 20, textAlign: "center" }}>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 700, color: T.danger }}>Could not load data</div>
      <div style={{ fontSize: 13, maxWidth: 420 }}>{loadError}</div>
      <div style={{ fontSize: 12, color: T.inkLight, maxWidth: 420 }}>Nothing has been changed. The screen is blocked rather than shown empty so that a blank day cannot be saved over real data by mistake.</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn-primary" onClick={() => { setLoading(true); loadData(); }}>Retry</button>
        <button className="btn-ghost" onClick={handleLogout}>Log out</button>
      </div>
    </div>
  );

  const TABS_USER = [
    { id: "entry", label: "📋 Daily Entry" },
    { id: "history", label: "📅 History" },
    { id: "credits", label: "💳 Pending Credits" },
    { id: "connections", label: "🔗 Connections" },
    { id: "summary", label: "📊 Summary" },
    { id: "salary", label: "👤 Salary Report" },
  ];

  const TABS_ADMIN = [
    { id: "admin-entry", label: "📋 Daily Entry" },
    { id: "admin-history", label: "📅 History" },
    { id: "admin-dashboard", label: "⬛ Dashboard" },
    { id: "admin-connections", label: "🔗 Connections" },
    { id: "admin-prices", label: "📈 Prices" },
    { id: "admin-comm", label: "💰 Commission" },
    { id: "admin-products", label: "📦 Product Master" },
    { id: "admin-vehicles", label: "🚛 Vehicle Master" },
    { id: "admin-employees", label: "👤 Employee Master" },
    { id: "admin-reports", label: "📊 Day Reports" },
    { id: "admin-salary", label: "👤 Salary Report" },
    { id: "admin-credits", label: "💳 Ledger" },
    { id: "admin-users", label: "👥 Users" },
  ];

  const TABS = authedRole === "admin" ? TABS_ADMIN : TABS_USER;
  const calcs = calcEntry(entry);
  // After any connection event the day's cash and stock change — reload the
  // working entry's date so Daily Entry / History reflect it immediately.
  const onConnectionsChanged = () => loadData(entry.date);

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="hdr">
        <div className="hdr-brand">
          <div className="hdr-logo-box">
            <img
              src="/bpcl_logo.png"
              alt="Bharat Gas"
            />
          </div>
          <div>
            <div className="hdr-title">JAY RANCHHOD GAS SERVICE</div>
            <div className="hdr-sub">Bharat LPG · {authedRole === "admin" ? "Admin Portal" : "Daily Management"}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Live system status */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            color: "#34d399",
            letterSpacing: "0.5px"
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></span>
            <span>SYSTEM ACTIVE</span>
          </div>

          <div className="hdr-date">
            <span>📅</span> {fmtDate(todayStr())}
          </div>

          <div style={{
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "3px 10px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            color: "#e2e8f0",
            letterSpacing: "0.5px",
            textTransform: "uppercase"
          }}>
            {authedRole}
          </div>

          <button
            className="btn-ghost"
            style={{
              borderColor: "rgba(255, 255, 255, 0.2)",
              color: "#e2e8f0",
              background: "rgba(255, 255, 255, 0.05)",
              padding: "5px 12px",
              fontSize: 11,
              borderRadius: 8
            }}
            onClick={handleLogout}
          >
            LOGOUT
          </button>
        </div>
      </header>

      {/* Nav */}
      <div className="nav-wrapper">
        <button
          type="button"
          className="nav-scroll-btn"
          onClick={() => { document.getElementById("main-nav")?.scrollBy({ left: -240, behavior: "smooth" }); }}
          title="Scroll tabs left"
        >
          ‹
        </button>
        <nav id="main-nav" className="nav">
          {TABS.map((t) => (
            <button key={t.id} className={`nav-btn${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="nav-scroll-btn"
          onClick={() => { document.getElementById("main-nav")?.scrollBy({ left: 240, behavior: "smooth" }); }}
          title="Scroll tabs right"
        >
          ›
        </button>
      </div>

      <main className="main">
        {/* User Tabs */}
        {tab === "entry" && <DailyEntry entry={entry} setEntry={setEntry} calcs={calcs} onSave={handleSave} onDateChange={handleDateChange} saved={saved} entries={entries} prices={prices} deliveryBoys={deliveryBoys} vehicles={vehicles} employees={employees} pending={pending} products={products} onConnectionsChanged={onConnectionsChanged} isAdmin={false} />}
        {tab === "history" && <History entries={entries} onEdit={(e) => { setEntry(e); setTab("entry"); }} products={products} />}
        {tab === "credits" && <PendingCredits pending={pending} onRecord={recordPayment} products={products} />}
        {tab === "connections" && <ConnectionsTab isAdmin={false} onChanged={onConnectionsChanged} prices={prices} />}
        {tab === "summary" && <Summary entries={entries} products={products} />}
        {tab === "salary" && <SalaryReport entries={entries} employees={employees} />}

        {/* Admin Tabs */}
        {tab === "admin-entry" && <DailyEntry entry={entry} setEntry={setEntry} calcs={calcs} onSave={handleSave} onDateChange={handleDateChange} saved={saved} entries={entries} prices={prices} deliveryBoys={deliveryBoys} vehicles={vehicles} employees={employees} pending={pending} isAdmin={true} products={products} onConnectionsChanged={onConnectionsChanged} />}
        {tab === "admin-history" && <History entries={entries} onEdit={(e) => { setEntry(e); setTab("admin-entry"); }} isAdmin={true} onDelete={handleDeleteEntry} products={products} />}
        {tab === "admin-dashboard" && <AdminDashboard entries={entries} pending={pending} prices={prices} commissions={commissions} products={products} onViewDay={(e) => { setEntry(e); setTab("admin-entry"); }} />}
        {tab === "admin-connections" && <ConnectionsTab isAdmin={true} onChanged={onConnectionsChanged} prices={prices} />}
        {tab === "admin-prices" && <AdminPriceHistory prices={prices} setPrices={setPrices} products={products} />}
        {tab === "admin-comm" && <AdminCommission commissions={commissions} setCommissions={setCommissions} products={products} />}
        {tab === "admin-products" && <AdminProductMaster products={products} onProductsChanged={() => loadData(entry.date)} />}
        {tab === "admin-reports" && <AdminDayReports entries={entries} commissions={commissions} products={products} />}
        {tab === "admin-salary" && <AdminSalaryReport entries={entries} employees={employees} />}
        {tab === "admin-credits" && <AdminCreditOverview pending={pending} products={products} />}
        {tab === "admin-users" && <AdminUsers />}
        {tab === "admin-vehicles" && <AdminVehicleMaster />}
        {tab === "admin-employees" && <AdminEmployeeMaster />}
      </main>
    </div>
  );
}
