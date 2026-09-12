import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { api } from "../api";
import { T } from "../styles";
import {
  PRODUCTS, ACCESSORIES, todayStr, fmtDate, fmtMonth, inr, num, uid,
  getCurrentRate, getCommRate, calcEntry, getSalaryMonth, productLabel
} from "../constants";
import AdminProductMaster from "./AdminProductMaster";

export { AdminProductMaster };

export function AdminDashboard({ entries = [], pending = [], prices = [], commissions = [], products = PRODUCTS, onViewDay }) {
  const currentMonthStr = todayStr().slice(0, 7); // e.g. "2026-09"
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);

  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleMonthChange = (mNum) => {
    setSelectedMonth(`${selYear}-${String(mNum).padStart(2, "0")}`);
  };

  const handleYearChange = (yNum) => {
    setSelectedMonth(`${yNum}-${String(selMonthNum).padStart(2, "0")}`);
  };

  // Generate Year options (current year +- 3 years, and any years from entries)
  const entryYears = (entries || []).map(e => parseInt(e.date?.slice(0, 4))).filter(Boolean);
  const thisYear = new Date().getFullYear();
  const minYear = Math.min(thisYear - 2, ...entryYears, 2024);
  const maxYear = Math.max(thisYear + 2, ...entryYears, 2028);
  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) yearOptions.push(y);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Filter entries for the selected month
  const monthEntries = (entries || [])
    .filter(e => e.date && e.date.startsWith(selectedMonth))
    .sort((a, b) => b.date.localeCompare(a.date));

  // Previous month entries for comparison
  const prevDate = new Date(selYear, selMonthNum - 2, 1);
  const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const prevMonthEntries = (entries || []).filter(e => e.date && e.date.startsWith(prevMonthStr));

  // Calculations for selected month
  const mCylSales = monthEntries.reduce((s, e) => s + calcEntry(e).totalSales, 0);
  const mAccSales = monthEntries.reduce((s, e) => s + calcEntry(e).totalAccessorySales, 0);
  const mGrossSales = mCylSales + mAccSales;

  const lmGrossSales = prevMonthEntries.reduce((s, e) => s + calcEntry(e).totalSales + calcEntry(e).totalAccessorySales, 0);
  const deltaSales = lmGrossSales > 0 ? (((mGrossSales - lmGrossSales) / lmGrossSales) * 100).toFixed(1) : null;

  // Cylinders sold
  const mCylinders = monthEntries.reduce((s, e) => {
    return s + (e.products || []).reduce((ps, p) => ps + num(p.sell) + num(p.online), 0);
  }, 0);

  // Agency Commission earned on cylinder sales
  const mCommission = monthEntries.reduce((s, e) => {
    return s + (e.products || []).reduce((ps, p) => ps + (num(p.sell) + num(p.online)) * getCommRate(p.id, commissions, e.date), 0);
  }, 0);

  // Total Gross Agency Earnings (Commission + Accessories)
  const mAgencyEarnings = mCommission + mAccSales;

  // Expenses breakdown
  const mGeneralExpenses = monthEntries.reduce((s, e) => s + calcEntry(e).totalExpenses, 0);
  const mVehicleExpenses = monthEntries.reduce((s, e) => s + calcEntry(e).totalVehicleExp, 0);
  const mSalaryExpenses  = monthEntries.reduce((s, e) => s + calcEntry(e).totalSalaryPayments, 0);
  const mTotalExpenses   = mGeneralExpenses + mVehicleExpenses + mSalaryExpenses;

  // Real Profit = (Agency Commission + Accessory Sales) - Total Operating Expenses
  const mRealProfit = mAgencyEarnings - mTotalExpenses;

  // Outstanding credit (all-time pending)
  const outstanding = (pending || []).filter(p => !p.cleared).reduce((s, p) => s + (num(p.originalAmt) - num(p.recovered)), 0);

  // Connections in month
  const mConn = monthEntries.reduce((acc, e) => {
    const c = calcEntry(e);
    acc.cash += c.totalConnectionPaymentsCash;
    acc.online += c.totalConnectionPaymentsOnline;
    acc.refunds += c.totalConnectionRefunds;
    return acc;
  }, { cash: 0, online: 0, refunds: 0 });

  // Product snapshot breakdown
  const productBreakdown = (products || PRODUCTS).map((p) => {
    const isAcc = p.category === 'accessory';
    const qty = monthEntries.reduce((s, e) => {
      if (isAcc) {
        const accRow = (e.accessories || []).find(x => x.accessoryId === p.id);
        return s + (accRow && accRow.sold ? num(accRow.qty) : 0);
      } else {
        const prodRow = (e.products || []).find(x => x.id === p.id);
        return s + num(prodRow?.sell) + num(prodRow?.online);
      }
    }, 0);

    const revenue = monthEntries.reduce((s, e) => {
      if (isAcc) {
        const accRow = (e.accessories || []).find(x => x.accessoryId === p.id);
        return s + (accRow && accRow.sold ? num(accRow.qty) * num(accRow.rate) : 0);
      } else {
        const prodRow = (e.products || []).find(x => x.id === p.id);
        return s + (num(prodRow?.sell) + num(prodRow?.online)) * num(prodRow?.rate)
                 + (num(prodRow?.sbc) * num(prodRow?.sbcRate))
                 + (num(prodRow?.dbc) * num(prodRow?.dbcRate));
      }
    }, 0);

    const commRate = isAcc ? 0 : getCommRate(p.id, commissions);
    const commTotal = isAcc ? 0 : monthEntries.reduce((s, e) => {
      const prodRow = (e.products || []).find(x => x.id === p.id);
      return s + (num(prodRow?.sell) + num(prodRow?.online)) * getCommRate(p.id, commissions, e.date);
    }, 0);

    return {
      ...p,
      isAcc,
      qty,
      revenue,
      rate: getCurrentRate(p.id, prices, products),
      commRate,
      commTotal,
    };
  });

  return (
    <div className="fade-in">
      {/* Month & Year Selection Toolbar */}
      <div className="card" style={{ marginBottom: 16, padding: "12px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
              {monthNames[selMonthNum - 1]} {selYear}
              {selectedMonth === currentMonthStr && <span className="badge badge-success" style={{ fontSize: 10, padding: "2px 8px" }}>Current Month</span>}
            </div>
            <div style={{ fontSize: 11, color: T.inkLight }}>{monthEntries.length} daily entries recorded</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={handlePrevMonth} title="Previous Month" style={{ padding: "6px 12px", fontWeight: 700 }}>
            ◀ Prev
          </button>
          
          <select 
            className="inp" 
            value={selMonthNum} 
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            style={{ width: 135, fontWeight: 600, padding: "6px 10px" }}
          >
            {monthNames.map((name, idx) => (
              <option key={idx + 1} value={idx + 1}>{name}</option>
            ))}
          </select>

          <select 
            className="inp" 
            value={selYear} 
            onChange={(e) => handleYearChange(Number(e.target.value))}
            style={{ width: 85, fontWeight: 600, padding: "6px 10px" }}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button className="btn-ghost" onClick={handleNextMonth} title="Next Month" style={{ padding: "6px 12px", fontWeight: 700 }}>
            Next ▶
          </button>

          {selectedMonth !== currentMonthStr && (
            <button 
              className="btn-ghost" 
              onClick={() => setSelectedMonth(currentMonthStr)} 
              style={{ borderColor: T.blue, color: T.blue, fontWeight: 700, padding: "6px 12px" }}
            >
              Current Month
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 16 }}>
        {/* Total Sales / Turnover */}
        <div className="stat-card" style={{ "--kpi-color": T.blue }}>
          <div className="stat-val" style={{ color: T.blue }}>{inr(mGrossSales)}</div>
          <div className="stat-lbl">Turnover (Sales)</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
            Cylinders: {inr(mCylSales)} · Acc: {inr(mAccSales)}
          </div>
          {deltaSales && (
            <div className="stat-delta" style={{ color: num(deltaSales) >= 0 ? T.success : T.danger, marginTop: 4 }}>
              {num(deltaSales) >= 0 ? "▲" : "▼"} {Math.abs(deltaSales)}% vs prev month
            </div>
          )}
        </div>

        {/* Cylinders Sold */}
        <div className="stat-card" style={{ "--kpi-color": "#0ea5e9" }}>
          <div className="stat-val" style={{ color: "#0ea5e9" }}>{mCylinders}</div>
          <div className="stat-lbl">Cylinders Sold</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>In {monthNames[selMonthNum - 1]} {selYear}</div>
        </div>

        {/* Total Operating Expenses */}
        <div className="stat-card" style={{ "--kpi-color": T.danger }}>
          <div className="stat-val" style={{ color: T.danger }}>{inr(mTotalExpenses)}</div>
          <div className="stat-lbl">Total Expenses</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }} title={`General: ${inr(mGeneralExpenses)} | Vehicles: ${inr(mVehicleExpenses)} | Salaries: ${inr(mSalaryExpenses)}`}>
            Gen: {inr(mGeneralExpenses)} · Veh: {inr(mVehicleExpenses)} · Sal: {inr(mSalaryExpenses)}
          </div>
        </div>

        {/* Agency Commission */}
        <div className="stat-card" style={{ "--kpi-color": T.accent }}>
          <div className="stat-val" style={{ color: T.accent }}>{inr(mCommission)}</div>
          <div className="stat-lbl">Cylinder Commission</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>BPCL Commission Income</div>
        </div>

        {/* REAL PROFIT */}
        <div className="stat-card" style={{ 
          "--kpi-color": mRealProfit >= 0 ? T.success : T.danger,
          background: mRealProfit >= 0 ? "rgba(16,185,129,0.04)" : "rgba(239,68,68,0.04)",
          border: `1.5px solid ${mRealProfit >= 0 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`
        }}>
          <div className="stat-val" style={{ color: mRealProfit >= 0 ? T.success : T.danger, fontWeight: 800 }}>
            {mRealProfit >= 0 ? "+" : "−"}{inr(Math.abs(mRealProfit))}
          </div>
          <div className="stat-lbl" style={{ fontWeight: 800, color: mRealProfit >= 0 ? "#047857" : "#b91c1c" }}>
            ✨ REAL PROFIT {mRealProfit >= 0 ? "(Net)" : "(Loss)"}
          </div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
            Earnings ({inr(mAgencyEarnings)}) − Exp ({inr(mTotalExpenses)})
          </div>
        </div>

        {/* Outstanding Credit */}
        <div className="stat-card" style={{ "--kpi-color": "#f59e0b" }}>
          <div className="stat-val" style={{ color: "#d97706" }}>{inr(outstanding)}</div>
          <div className="stat-lbl">Outstanding Credit</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>Total Pending All-Time</div>
        </div>
      </div>

      {/* Grid: P&L Financial Summary + Product Snapshot */}
      <div className="g2" style={{ marginBottom: 16 }}>
        {/* Monthly P&L / Financial Summary Card */}
        <div className="card">
          <div className="card-head">
            <span className="card-head-title">📊 Profit & Loss (P&L) Summary</span>
            <span className="badge badge-ink">{monthNames[selMonthNum - 1]} {selYear}</span>
          </div>
          <div className="card-body" style={{ padding: "10px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              1. Agency Gross Income (+)
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: 13, color: T.inkMid }}>Cylinder Sales Commission</span>
              <span style={{ fontWeight: 600, color: T.success }}>+{inr(mCommission)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: 13, color: T.inkMid }}>Accessories & Parts Sales</span>
              <span style={{ fontWeight: 600, color: T.success }}>+{inr(mAccSales)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid #e0e0e0", background: "rgba(16,185,129,0.06)", borderRadius: 4, marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Total Gross Earnings</span>
              <span style={{ fontWeight: 700, color: T.success }}>+{inr(mAgencyEarnings)}</span>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 14 }}>
              2. Operating Expenses (−)
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: 13, color: T.inkMid }}>General Daily Expenses</span>
              <span style={{ fontWeight: 600, color: T.danger }}>−{inr(mGeneralExpenses)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: 13, color: T.inkMid }}>Vehicle & Fuel Expenses</span>
              <span style={{ fontWeight: 600, color: T.danger }}>−{inr(mVehicleExpenses)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span style={{ fontSize: 13, color: T.inkMid }}>Employee Salaries & Advances</span>
              <span style={{ fontWeight: 600, color: T.danger }}>−{inr(mSalaryExpenses)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid #e0e0e0", background: "rgba(239,68,68,0.06)", borderRadius: 4, marginTop: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Total Operating Expenses</span>
              <span style={{ fontWeight: 700, color: T.danger }}>−{inr(mTotalExpenses)}</span>
            </div>

            {/* REAL NET PROFIT HIGHLIGHT BANNER */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              marginTop: 14,
              borderRadius: 8,
              background: mRealProfit >= 0 ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.05))" : "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))",
              border: `1.5px solid ${mRealProfit >= 0 ? "#10b981" : "#ef4444"}`
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: mRealProfit >= 0 ? "#047857" : "#b91c1c", letterSpacing: 0.5 }}>
                  REAL NET PROFIT ({monthNames[selMonthNum - 1]} {selYear})
                </div>
                <div style={{ fontSize: 10, color: T.inkLight }}>Gross Earnings − Total Expenses</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: mRealProfit >= 0 ? "#047857" : "#b91c1c" }}>
                {mRealProfit >= 0 ? "+" : "−"}{inr(Math.abs(mRealProfit))}
              </div>
            </div>
          </div>
        </div>

        {/* Product & Accessory Snapshot Table */}
        <div className="card">
          <div className="card-head">
            <span className="card-head-title">📦 Product & Accessory Snapshot</span>
            <span className="badge badge-ink">{monthNames[selMonthNum - 1]} {selYear}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product / Item</th>
                  <th style={{ textAlign: "right" }}>Current Rate</th>
                  <th style={{ textAlign: "right" }}>Sold Qty</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {productBreakdown.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ marginRight: 6 }}>{p.isAcc ? "🔧" : "🛢️"}</span>
                      {p.short || p.label}
                    </td>
                    <td style={{ color: T.inkLight, textAlign: "right" }}>{inr(p.rate)}</td>
                    <td style={{ fontWeight: 600, textAlign: "right" }}>{p.qty}</td>
                    <td style={{ color: T.success, fontWeight: 600, textAlign: "right" }}>{inr(p.revenue)}</td>
                    <td style={{ color: p.isAcc ? T.inkLight : T.accent, fontWeight: 600, textAlign: "right" }}>
                      {p.isAcc ? "—" : inr(p.commTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Month's Daily Entries Table */}
      <div className="card">
        <div className="card-head">
          <span className="card-head-title">📅 Daily Entries in {monthNames[selMonthNum - 1]} {selYear}</span>
          <span style={{ fontSize: 12, color: T.inkLight }}>{monthEntries.length} entries recorded</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ textAlign: "right" }}>Turnover</th>
                <th style={{ textAlign: "right" }}>Cylinders</th>
                <th style={{ textAlign: "right" }}>Accessories</th>
                <th style={{ textAlign: "right" }}>Expenses</th>
                <th style={{ textAlign: "right" }}>Commission</th>
                <th style={{ textAlign: "right" }}>Real Profit</th>
                <th style={{ textAlign: "right" }}>Cash on Hand</th>
                {onViewDay && <th style={{ textAlign: "center" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {monthEntries.length === 0 ? (
                <tr>
                  <td colSpan={onViewDay ? 9 : 8} style={{ textAlign: "center", padding: "24px 12px", color: T.inkLight }}>
                    No daily entries recorded for {monthNames[selMonthNum - 1]} {selYear}.
                  </td>
                </tr>
              ) : (
                monthEntries.map(e => {
                  const c = calcEntry(e);
                  const cyl = (e.products || []).reduce((s, p) => s + num(p.sell) + num(p.online), 0);
                  const dayComm = (e.products || []).reduce((ps, p) => ps + (num(p.sell) + num(p.online)) * getCommRate(p.id, commissions, e.date), 0);
                  const dayExp = c.totalExpenses + c.totalVehicleExp + c.totalSalaryPayments;
                  const dayProfit = (dayComm + c.totalAccessorySales) - dayExp;
                  return (
                    <tr key={e.date} style={{ cursor: onViewDay ? "pointer" : "default" }} onClick={() => onViewDay && onViewDay(e)}>
                      <td style={{ color: T.ink, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                      <td style={{ color: T.blue, fontWeight: 600, textAlign: "right" }}>{inr(c.totalSales + c.totalAccessorySales)}</td>
                      <td style={{ fontWeight: 600, textAlign: "right" }}>{cyl}</td>
                      <td style={{ color: c.totalAccessorySales > 0 ? T.success : T.inkLight, textAlign: "right" }}>{inr(c.totalAccessorySales)}</td>
                      <td style={{ color: dayExp > 0 ? T.danger : T.inkLight, fontWeight: 600, textAlign: "right" }}>{inr(dayExp)}</td>
                      <td style={{ color: T.accent, fontWeight: 600, textAlign: "right" }}>{inr(dayComm)}</td>
                      <td style={{ color: dayProfit >= 0 ? T.success : T.danger, fontWeight: 700, textAlign: "right" }}>
                        {dayProfit >= 0 ? "+" : "−"}{inr(Math.abs(dayProfit))}
                      </td>
                      <td style={{ color: c.cashOnHand < 0 ? T.danger : T.ink, fontWeight: 700, textAlign: "right" }}>{inr(c.cashOnHand)}</td>
                      {onViewDay && (
                        <td style={{ textAlign: "center" }}>
                          <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={(ev) => { ev.stopPropagation(); onViewDay(e); }}>
                            View ↗
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminPriceHistory({ prices, setPrices, products = PRODUCTS }) {
  const [selProd, setSelProd] = useState("p14");
  const [form, setForm] = useState({ date: todayStr(), rate: "", sbcRate: "", dbcRate: "", note: "" });
  const [saved, setSaved] = useState(false);

  /* Local state is only updated once the server has ACCEPTED the new list.
     Previously setPrices ran regardless, so a rejected sync left the screen
     showing rates the database did not have. */
  const syncOrExplain = async (updated) => {
    try {
      const res = await api.syncPrices(updated);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not save price history.");
      }
      setPrices(updated);
      return true;
    } catch (e) {
      if (e.message === "session_expired" || e.forbidden) return false;
      Swal.fire({ title: "Not saved", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
      return false;
    }
  };

  const add = async () => {
    if (!form.rate || num(form.rate) < 0) return;
    const rec = { id: uid(), productId: selProd, rate: num(form.rate), sbcRate: num(form.sbcRate), dbcRate: num(form.dbcRate), date: form.date, note: form.note };
    if (!(await syncOrExplain([...prices, rec]))) return;
    setForm({ date: todayStr(), rate: "", sbcRate: "", dbcRate: "", note: "" });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this record?")) return;
    await syncOrExplain(prices.filter(p => p.id !== id));
  };

  const filtered = prices.filter(p => p.productId === selProd).sort((a,b) => b.date.localeCompare(a.date));
  const allProds = Array.from(new Map([...(products || PRODUCTS), ...ACCESSORIES].map(p => [p.id, p])).values());

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Rate saved! New daily entries will use this rate.</div>}
      <div className="stat-row">
        {allProds.map(p => {
          const cr = getCurrentRate(p.id, prices, products);
          return (
            <div key={p.id} className="stat-card" style={{ "--kpi-color": selProd===p.id?T.accent:T.border, cursor:"pointer", borderColor: selProd===p.id?T.accent:T.border }} onClick={()=>setSelProd(p.id)}>
              <div className="stat-lbl">{p.short || p.label}</div>
              <div className="stat-val">{inr(cr)}</div>
              <div style={{fontSize:10, color:T.inkLight}}>{prices.find(x=>x.productId===p.id) ? "Custom Rate" : "Default Rate"}</div>
            </div>
          );
        })}
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">➕ Add New Rate</span></div>
          <div className="card-body">
            <div className="field"><label>Product</label><select className="inp" value={selProd} onChange={e=>setSelProd(e.target.value)}>{allProds.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="field"><label>Effective Date</label><input className="inp" type="date" max={todayStr()} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
            <div className="field"><label>Refill Rate (₹)</label><input className="inp" type="number" placeholder="e.g. 906.50" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})} /></div>
            <div className="field"><label>SBC Rate (₹)</label><input className="inp" type="number" placeholder="New connection single" value={form.sbcRate} onChange={e=>setForm({...form,sbcRate:e.target.value})} /></div>
            <div className="field"><label>DBC Rate (₹)</label><input className="inp" type="number" placeholder="New connection double" value={form.dbcRate} onChange={e=>setForm({...form,dbcRate:e.target.value})} /></div>
            <div className="field"><label>Note / Reason</label><input className="inp" type="text" placeholder="Price revision…" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
            <button className="btn-primary" style={{width:"100%", marginTop: 8}} onClick={add}>Save Rate Change</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">📜 Rate History</span></div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Date</th><th style={{ textAlign: "right" }}>Refill Rate</th><th style={{ textAlign: "right" }}>SBC Rate</th><th style={{ textAlign: "right" }}>DBC Rate</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={6} style={{textAlign:"center",padding:24,color:T.inkLight}}>No custom rates set for this product.</td></tr>}
                {filtered.map(p=>(
                  <tr key={p.id}>
                    <td style={{color:T.inkMid,whiteSpace:"nowrap"}}>{fmtDate(p.date)}</td>
                    <td style={{fontWeight:700, textAlign: "right"}}>{inr(p.rate)}</td>
                    <td style={{color:T.inkMid, textAlign: "right"}}>{num(p.sbcRate) ? inr(p.sbcRate) : "-"}</td>
                    <td style={{color:T.inkMid, textAlign: "right"}}>{num(p.dbcRate) ? inr(p.dbcRate) : "-"}</td>
                    <td style={{color:T.inkLight,fontSize:12}}>{p.note||"-"}</td>
                    <td style={{textAlign:"right"}}><button className="btn-danger" style={{padding:"2px 7px",fontSize:10}} onClick={()=>del(p.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminCommission({ commissions, setCommissions, products = PRODUCTS }) {
  const [selProd, setSelProd] = useState("p14");
  const [form, setForm] = useState({ date: todayStr(), perCyl: "", note: "" });
  const [saved, setSaved] = useState(false);

  const syncOrExplain = async (updated) => {
    try {
      const res = await api.syncCommissions(updated);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not save commission history.");
      }
      setCommissions(updated);
      return true;
    } catch (e) {
      if (e.message === "session_expired" || e.forbidden) return false;
      Swal.fire({ title: "Not saved", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
      return false;
    }
  };
  const add = async () => {
    if (!form.perCyl || num(form.perCyl) < 0) return;
    const rec = { id: uid(), productId: selProd, perCyl: num(form.perCyl), date: form.date, note: form.note };
    if (!(await syncOrExplain([...commissions, rec]))) return;
    setForm({ date: todayStr(), perCyl: "", note: "" });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  const del = async (id) => {
    if (!window.confirm("Delete this record?")) return;
    await syncOrExplain(commissions.filter(c=>c.id!==id));
  };
  const filtered = commissions.filter(c=>c.productId===selProd).sort((a,b)=>b.date.localeCompare(a.date));
  const prods = (products || PRODUCTS).filter(p => (p.category || "").toLowerCase() !== "accessory");

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Commission rate saved!</div>}
      <div className="stat-row">
        {prods.map(p => {
          const cc = getCommRate(p.id, commissions);
          return (
            <div key={p.id} className="stat-card" style={{ "--kpi-color": selProd===p.id?T.accent:T.border, cursor:"pointer", borderColor: selProd===p.id?T.accent:T.border }} onClick={()=>setSelProd(p.id)}>
              <div className="stat-lbl">{p.short || p.label}</div>
              <div className="stat-val">₹{cc}/cyl</div>
              <div style={{fontSize:10, color:T.inkLight}}>{cc>0 ? "Active Commission" : "No Commission"}</div>
            </div>
          );
        })}
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">➕ Set Commission</span></div>
          <div className="card-body">
            <div className="field"><label>Product</label><select className="inp" value={selProd} onChange={e=>setSelProd(e.target.value)}>{prods.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="field"><label>Effective Date</label><input className="inp" type="date" max={todayStr()} value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
            <div className="field"><label>Commission (₹/cyl)</label><input className="inp" type="number" placeholder="e.g. 25" value={form.perCyl} onChange={e=>setForm({...form,perCyl:e.target.value})} /></div>
            <div className="field"><label>Note</label><input className="inp" type="text" placeholder="Reason…" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} /></div>
            <button className="btn-primary" style={{width:"100%", marginTop: 8}} onClick={add}>Save Commission</button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">📜 Commission History</span></div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl">
              <thead><tr><th>Date</th><th style={{ textAlign: "right" }}>Per Cyl (₹)</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {filtered.length===0 && <tr><td colSpan={4} style={{textAlign:"center",padding:24,color:T.inkLight}}>No commission history.</td></tr>}
                {filtered.map(c=>(
                  <tr key={c.id}>
                    <td style={{color:T.inkMid,whiteSpace:"nowrap"}}>{fmtDate(c.date)}</td>
                    <td style={{fontWeight:700, textAlign: "right"}}>₹{c.perCyl}</td>
                    <td style={{color:T.inkLight,fontSize:11}}>{c.note||"-"}</td>
                    <td><button className="btn-icon" onClick={()=>del(c.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminDayReports({ entries, commissions, products = PRODUCTS }) {
  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date));
  const [selDate, setSelDate] = useState(sorted[0]?.date || todayStr());
  const entry = entries.find(e=>e.date===selDate);

  return (
    <div className="fade-in">
      <div style={{marginBottom: 16}}>
        <select className="inp" value={selDate} onChange={e=>setSelDate(e.target.value)} style={{maxWidth: 300}}>
          {sorted.length===0 && <option>No entries</option>}
          {sorted.map(e=><option key={e.date} value={e.date}>{fmtDate(e.date)}</option>)}
        </select>
      </div>

      {!entry ? (
        <div className="card"><div className="card-body" style={{textAlign:"center",padding:40,color:T.inkLight}}>No entry found for this date.</div></div>
      ) : (
        <AdminDayDetail entry={entry} commissions={commissions} products={products} />
      )}
    </div>
  );
}

export function AdminDayDetail({ entry, commissions, products = PRODUCTS }) {
  const calcs = calcEntry(entry);
  const totalCyl = entry.products.reduce((s,p)=>s+num(p.sell)+num(p.online),0);
  const totalComm = entry.products.reduce((s,p)=>s+(num(p.sell)+num(p.online))*getCommRate(p.id, commissions, entry.date),0);

  return (
    <div>
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{color:T.success}}>{inr(calcs.totalSales)}</div><div className="stat-lbl">Total Sales</div></div>
        <div className="stat-card" style={{ "--kpi-color": calcs.cashOnHand<0?T.danger:T.ink }}><div className="stat-val" style={{color:calcs.cashOnHand<0?T.danger:T.ink}}>{inr(calcs.cashOnHand)}</div><div className="stat-lbl">Cash on Hand</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{color:T.blue}}>{totalCyl}</div><div className="stat-lbl">Cylinders Sold</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{color:T.accent}}>{inr(totalComm)}</div><div className="stat-lbl">Commission Earned</div></div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-head-title">🛢️ Products Sold</span></div>
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>Sold</th><th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Revenue</th><th style={{ textAlign: "right" }}>Commission</th></tr></thead>
            <tbody>
              {entry.products.map((p)=>{
                const rev = (num(p.sell)+num(p.online))*num(p.rate);
                const comm = (num(p.sell)+num(p.online))*getCommRate(p.id, commissions, entry.date);
                return (
                  <tr key={p.id}>
                    <td style={{fontWeight:600}}>{productLabel(p.id, products)}</td>
                    <td style={{fontWeight:600, textAlign: "right"}}>{num(p.sell)+num(p.online)} <span style={{fontSize: 10, color: T.inkLight}}>({num(p.sell)} C / {num(p.online)} O)</span></td>
                    <td style={{color:T.inkLight, textAlign: "right"}}>{inr(p.rate)}</td>
                    <td style={{color:T.success,fontWeight:600, textAlign: "right"}}>{inr(rev)}</td>
                    <td style={{color:T.accent,fontWeight:600, textAlign: "right"}}>{inr(comm)}</td>
                  </tr>
                );
              })}
              {(entry.accessories||[]).filter(a=>a.sold).map((a)=>{
                const accDef = ACCESSORIES.find(x=>x.id===a.accessoryId) || {};
                const rev = num(a.qty)*num(a.rate);
                return (
                  <tr key={a.accessoryId}>
                    <td style={{fontWeight:600}}>{accDef.short}</td>
                    <td style={{fontWeight:600, textAlign: "right"}}>{num(a.qty)||"0"}</td>
                    <td style={{color:T.inkLight, textAlign: "right"}}>{inr(a.rate)}</td>
                    <td style={{color:T.success,fontWeight:600, textAlign: "right"}}>{inr(rev)}</td>
                    <td style={{color:T.accent,fontWeight:600, textAlign: "right"}}>—</td>
                  </tr>
                );
              })}
              <tr className="tbl-total">
                <td colSpan={3} style={{textTransform:"uppercase", fontSize: 11, textAlign: "right"}}>Total</td>
                <td style={{color:T.success, fontSize: 14, textAlign: "right"}}>{inr(calcs.totalSales + calcs.totalAccessorySales)}</td>
                <td style={{color:T.accent, fontSize: 14, textAlign: "right"}}>{inr(totalComm)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">💰 Financials</span></div>
          <div className="card-body">
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Opening Cash</span><span style={{fontWeight:600}}>{inr(entry.openingCash)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Cash Cylinder Sales</span><span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalCashSales)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Online Cylinder Sales</span><span style={{fontWeight:600,color:T.blue}}>+{inr(calcs.totalOnlineSales)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Accessories Sales</span><span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalAccessorySales)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Credit Received</span><span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalCreditRecoveries)}</span></div>
            {calcs.totalOtherCashCredits > 0 && <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Other Cash Credit</span><span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalOtherCashCredits)}</span></div>}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Connection Payments (Cash)</span><span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalConnectionPaymentsCash)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Connection Payments (Online) <span style={{fontSize:10,color:T.inkLight}}>not in cash</span></span><span style={{fontWeight:600,color:T.blue}}>{inr(calcs.totalConnectionPaymentsOnline)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Online → Bank</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalOnlineSales)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Expenses</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalExpenses)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Connection Refunds</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalConnectionRefunds)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Vehicle Expenses</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalVehicleExp)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Salary / Advance</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalSalaryPayments)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}><span style={{fontSize:12,color:T.inkMid}}>Cheque/Online</span><span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalCheque)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 4px",marginTop:8,borderTop:"2px solid #ccc"}}><span style={{fontSize:12,fontWeight:700,color:T.inkMid}}>CASH ON HAND</span><span style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:700,color:calcs.cashOnHand<0?T.danger:T.success}}>{inr(calcs.cashOnHand)}</span></div>
          </div>
        </div>
        
        <div style={{display:"flex", flexDirection:"column", gap: 14}}>
          <div className="card">
            <div className="card-head"><span className="card-head-title">🧾 Expenses</span><span style={{fontWeight:700,color:T.danger}}>{inr(calcs.totalExpenses)}</span></div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead><tr><th>Desc</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {(entry.expenses||[]).filter(x=>x.desc||x.amt).map(x=><tr key={x.id}><td style={{color:T.inkMid}}>{x.desc}</td><td style={{fontWeight:600,color:T.danger, textAlign: "right"}}>{inr(x.amt)}</td></tr>)}
                  {!(entry.expenses||[]).some(x=>x.desc||x.amt) && <tr><td colSpan={2} style={{textAlign:"center",padding:10,color:T.inkLight}}>No expenses</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-head-title">👤 Salary / Advance</span><span style={{fontWeight:700,color:T.danger}}>{inr(calcs.totalSalaryPayments)}</span></div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead><tr><th>Employee</th><th style={{ textAlign: "center" }}>Type</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {(entry.salaryPayments||[]).filter(x=>x.employeeName||x.amt).map((x,idx)=><tr key={idx}><td style={{fontWeight:600}}>{x.employeeName}</td><td style={{ textAlign: "center" }}><span className={`badge ${x.type==='Salary'?'badge-success':'badge-warn'}`}>{x.type}</span></td><td style={{fontWeight:600,color:T.danger, textAlign: "right"}}>{inr(x.amt)}</td></tr>)}
                  {!(entry.salaryPayments||[]).some(x=>x.employeeName||x.amt) && <tr><td colSpan={3} style={{textAlign:"center",padding:10,color:T.inkLight}}>No payments</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {((entry.connectionNew||[]).length > 0 || (entry.connectionPayments||[]).length > 0 || (entry.connectionRefunds||[]).length > 0) && (
            <div className="card">
              <div className="card-head"><span className="card-head-title">🔗 Connections</span><span style={{fontWeight:700,color:T.success}}>+{inr(calcs.totalConnectionPaymentsCash)} <span style={{color:T.danger}}>−{inr(calcs.totalConnectionRefunds)}</span></span></div>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Event</th><th>Product · Qty</th><th>Stock</th><th style={{ textAlign: "right" }}>Cash</th></tr></thead>
                  <tbody>
                    {(entry.connectionNew||[]).map(x=><tr key={"n"+x.id}><td><span className="badge badge-ink">New</span></td><td style={{fontWeight:600}}>{productLabel(x.productId, products)} × {x.qty} {x.connectionType}</td><td style={{fontSize:11,color:T.danger}}>−{x.cylindersOut} filled</td><td style={{color:T.inkLight, textAlign:"right", fontSize:11}}>—</td></tr>)}
                    {(entry.connectionPayments||[]).map(x=><tr key={"p"+x.id}><td><span className="badge badge-blue">{x.mode==="cash"?"Add. Bottle · Cash":"Add. Bottle · Online"}</span></td><td style={{fontWeight:600}}>{productLabel(x.productId, products)} × {x.qty}</td><td style={{fontSize:11,color:T.danger}}>−{x.qty} filled</td><td style={{fontWeight:600,color:x.mode==="cash"?T.success:T.blue, textAlign:"right"}}>{x.mode==="cash"?"+":""}{inr(x.amt)}</td></tr>)}
                    {(entry.connectionRefunds||[]).map(x=><tr key={"r"+x.id}><td><span className="badge badge-danger">Surrender</span></td><td style={{fontWeight:600}}>{productLabel(x.productId, products)} × {x.qty}<div style={{fontSize:10,color:T.inkLight}}>{num(x.penaltyDeducted)>0?`refund ${inr(x.refundAmount)} − penalty ${inr(x.penaltyDeducted)}`:""}</div></td><td style={{fontSize:11}}><span style={{color:T.success}}>+{x.cylindersQty} empty</span>{num(x.cylindersMissing)>0 && <span style={{color:T.warn}}> · {x.cylindersMissing} missing</span>}</td><td style={{fontWeight:600,color:T.danger, textAlign:"right"}}>-{inr(x.amt)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head"><span className="card-head-title">💳 Credit Sales</span><span style={{fontWeight:700,color:T.danger}}>{inr(calcs.totalCredit)}</span></div>
            <div style={{overflowX:"auto"}}>
              <table className="tbl">
                <thead><tr><th>Customer</th><th>Product</th><th style={{textAlign:"center"}}>Filled</th><th style={{textAlign:"center"}}>Empty</th><th style={{textAlign:"right"}}>Amount</th></tr></thead>
                <tbody>
                  {(entry.creditSales||[]).filter(x=>x.customerName||x.amt).map((x,idx)=>{
                    const prodDef = x.productId ? (products || PRODUCTS).find(p=>p.id===x.productId) : null;
                    return (
                      <tr key={idx}>
                        <td style={{fontWeight:600}}>{x.customerName}{x.remarks && <div style={{fontSize:10,color:T.inkLight,fontStyle:"italic"}}>📝 {x.remarks}</div>}</td>
                        <td style={{color:T.blue,fontWeight:600,fontSize:12}}>{prodDef ? (prodDef.short || prodDef.label) : "—"}</td>
                        <td style={{textAlign:"center",color:T.success,fontWeight:600}}>{x.filledQty > 0 ? x.filledQty : "—"}</td>
                        <td style={{textAlign:"center",color:"#e67e22",fontWeight:600}}>{x.emptyQty > 0 ? x.emptyQty : "—"}</td>
                        <td style={{fontWeight:600,color:T.danger,textAlign:"right"}}>{inr(x.amt)}</td>
                      </tr>
                    );
                  })}
                  {!(entry.creditSales||[]).some(x=>x.customerName||x.amt) && <tr><td colSpan={5} style={{textAlign:"center",padding:10,color:T.inkLight}}>No credit sales</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSalaryReport({ entries, employees }) {
  const [filter, setFilter] = useState("");
  const allPayments = entries.flatMap(e => (e.salaryPayments || []).map(p => ({ ...p, date: e.date })));
  
  // Salary month: if today is 1st-10th, report covers previous month; else current month.
  const currentMonth = getSalaryMonth();
  
  const summaries = (employees || []).map(emp => {
    // Filter by forMonth if present (new records), fall back to entry date for old records
    const empPayments = allPayments.filter(p => String(p.employeeId) === String(emp.id) &&
      (p.forMonth ? p.forMonth === currentMonth : p.date.startsWith(currentMonth)));
    const baseSalary = num(emp.salary || emp.base_salary);
    const advance = empPayments.filter(p => p.type === "Advance").reduce((s, p) => s + num(p.amt), 0);
    const salaryPaid = empPayments.filter(p => p.type === "Salary").reduce((s, p) => s + num(p.amt), 0);
    const totalPaid = advance + salaryPaid;
    const balance = baseSalary - totalPaid;
    return { ...emp, baseSalary, advance, salaryPaid, totalPaid, balance };
  });

  const totalOutstanding = summaries.filter(s => s.balance > 0).reduce((s, x) => s + x.balance, 0);
  const totalOverpaid = summaries.filter(s => s.balance < 0).reduce((s, x) => s + Math.abs(x.balance), 0);

  const filtered = allPayments.filter(p => !filter || String(p.employeeId) === filter).sort((a, b) => b.date.localeCompare(a.date));
  const selectedEmpSummary = summaries.find(s => String(s.id) === filter);

  return (
    <div className="fade-in">
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{ color: T.success }}>{inr(totalOutstanding)}</div>
          <div className="stat-lbl">Total Salary Due (This Month)</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}>
          <div className="stat-val" style={{ color: T.danger }}>{inr(totalOverpaid)}</div>
          <div className="stat-lbl">Total Over-Advance</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-head-title">📊 Monthly Balance Sheet ({fmtMonth(currentMonth + "-01")})</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Employee</th>
                <th style={{ textAlign: "right" }}>Base Salary</th>
                <th style={{ textAlign: "right" }}>Advance</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Balance</th>
                <th style={{ textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(s => (
                <tr key={s.id} style={{ cursor: "pointer", background: filter === String(s.id) ? "#f0f7ff" : "transparent" }} onClick={() => setFilter(filter === String(s.id) ? "" : String(s.id))}>
                  <td style={{ fontWeight: 600 }}>{s.name} <div style={{ fontSize: 10, fontWeight: 400, color: T.inkLight }}>{s.role}</div></td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(s.baseSalary)}</td>
                  <td style={{ color: T.warn, textAlign: "right" }}>{inr(s.advance)}</td>
                  <td style={{ color: T.success, textAlign: "right" }}>{inr(s.salaryPaid)}</td>
                  <td style={{ fontWeight: 700, color: s.balance < 0 ? T.danger : T.success, textAlign: "right" }}>{inr(s.balance)}</td>
                  <td style={{ textAlign: "center" }}>
                    {s.balance < 0 ? <span className="badge badge-danger">OVERPAID</span> : s.balance === 0 ? <span className="badge badge-success">SETTLED</span> : <span className="badge badge-warn">DUE</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-head-title">🔍 Detailed Filter</span></div>
        <div className="card-body">
          <select className="inp" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">— Select Employee to view history —</option>
            {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name} ({e.role})</option>)}
          </select>
        </div>
      </div>

      {filter && (
        <div className="card fade-in">
          <div className="card-head">
            <span className="card-head-title">📜 Payment History: {selectedEmpSummary?.name}</span>
            <button className="btn-icon" onClick={() => setFilter("")}>×</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: "center" }}>Type</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", padding: 32, color: T.inkLight }}>No records.</td></tr>}
                {filtered.map((p, idx) => (
                  <tr key={idx}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(p.date)}</td>
                    <td style={{ textAlign: "center" }}><span className={`badge ${p.type === "Salary" ? "badge-success" : "badge-warn"}`}>{p.type}</span></td>
                    <td style={{ color: T.danger, fontWeight: 700, textAlign: "right" }}>{inr(p.amt)}</td>
                    <td style={{ fontSize: 12, color: T.inkMid }}>{p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminCreditOverview({ pending, products = PRODUCTS }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const outstanding = pending.filter(p=>!p.cleared).reduce((s,p)=>s+(p.originalAmt-p.recovered),0);
  const recovered   = pending.reduce((s,p)=>s+p.recovered,0);
  const total       = pending.reduce((s,p)=>s+p.originalAmt,0);

  const byCustomer = {};
  pending.forEach(p=>{
    if (!byCustomer[p.customerName]) byCustomer[p.customerName]={name:p.customerName,entries:[],total:0,recovered:0};
    byCustomer[p.customerName].entries.push(p);
    byCustomer[p.customerName].total     += p.originalAmt;
    byCustomer[p.customerName].recovered += p.recovered;
  });

  const customers = Object.values(byCustomer)
    .filter(c => filter==="all" ? true : filter==="pending" ? (c.total-c.recovered)>0 : (c.total-c.recovered)<=0)
    .sort((a,b)=>(b.total-b.recovered)-(a.total-a.recovered));

  return (
    <div className="fade-in">
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{color:T.danger}}>{inr(outstanding)}</div><div className="stat-lbl">Outstanding</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{color:T.success}}>{inr(recovered)}</div><div className="stat-lbl">Recovered</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{color:T.blue}}>{inr(total)}</div><div className="stat-lbl">Total Credit Given</div></div>
      </div>

      <div className="period-row">
        {[["all","All Customers"],["pending","Pending"],["cleared","Cleared"]].map(([v,l])=>(
          <button key={v} className="btn-ghost" style={{background:filter===v?T.accent:"transparent",color:filter===v?"#fff":T.inkMid,borderColor:filter===v?T.accent:T.border}} onClick={()=>setFilter(v)}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center", marginLeft: 4 }}>Click row to expand</span>
      </div>

      <div className="card">
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead><tr><th>Customer</th><th style={{ textAlign: "right" }}>Txns</th><th style={{ textAlign: "right" }}>Total Credit</th><th style={{ textAlign: "right" }}>Recovered</th><th style={{ textAlign: "right" }}>Outstanding</th><th style={{ textAlign: "center" }}>Status</th></tr></thead>
            <tbody>
              {customers.length===0 && <tr><td colSpan={6} style={{textAlign:"center",padding:32,color:T.inkLight}}>No records.</td></tr>}
              {customers.map(c=>{
                const due = c.total-c.recovered;
                const isOpen = expanded === c.name;
                return (
                  <React.Fragment key={c.name}>
                    <tr style={{ cursor: "pointer", background: isOpen ? "#f0f7ff" : "transparent" }} onClick={() => setExpanded(isOpen ? null : c.name)}>
                      <td style={{fontWeight:700}}>{c.name} <span style={{fontSize:10,color:T.inkLight,marginLeft:4}}>{isOpen ? "▲" : "▼"}</span></td>
                      <td style={{color:T.inkMid, textAlign: "right"}}>{c.entries.length}</td>
                      <td style={{fontWeight:600, textAlign: "right"}}>{inr(c.total)}</td>
                      <td style={{color:T.success,fontWeight:600, textAlign: "right"}}>{inr(c.recovered)}</td>
                      <td style={{color:due>0?T.danger:T.success,fontWeight:700, textAlign: "right"}}>{inr(due)}</td>
                      <td style={{ textAlign: "center" }}><span className={`badge ${due<=0?"badge-success":"badge-danger"}`}>{due<=0?"CLEARED":"PENDING"}</span></td>
                    </tr>
                    {isOpen && c.entries.map(ent => {
                      const prodDef = ent.productId ? (products || PRODUCTS).find(p => p.id === ent.productId) : null;
                      const entryDue = ent.originalAmt - ent.recovered;
                      return (
                        <tr key={ent.id} style={{ background: "#f8fbff", fontSize: 12 }}>
                          <td style={{ paddingLeft: 28, color: T.inkMid }}>
                            <div style={{ fontSize: 11, color: T.inkLight, marginBottom: 2 }}>{fmtDate(ent.date)}</div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {prodDef && <span style={{ fontSize: 10, background: "#e8f0fe", color: T.blue, borderRadius: 3, padding: "1px 6px", fontWeight: 600 }}>{prodDef.short}</span>}
                              {ent.filledQty > 0 && <span style={{ fontSize: 10, color: T.success, fontWeight: 600 }}>↓ {ent.filledQty} filled</span>}
                              {ent.emptyQty > 0 && <span style={{ fontSize: 10, color: "#e67e22", fontWeight: 600 }}>↑ {ent.emptyQty} empty</span>}
                            </div>
                            {ent.remarks && <div style={{ fontSize: 10, color: T.inkLight, fontStyle: "italic", marginTop: 2 }}>📝 {ent.remarks}</div>}
                          </td>
                          <td colSpan={2} style={{ color: T.ink, textAlign: "right", fontSize: 12 }}>{inr(ent.originalAmt)}</td>
                          <td style={{ color: T.success, textAlign: "right", fontSize: 12 }}>{inr(ent.recovered)}</td>
                          <td style={{ color: entryDue > 0 ? T.danger : T.success, fontWeight: 600, textAlign: "right", fontSize: 12 }}>{inr(entryDue)}</td>
                          <td style={{ textAlign: "center" }}><span className={`badge ${ent.cleared ? "badge-success" : "badge-danger"}`} style={{ fontSize: 9 }}>{ent.cleared ? "PAID" : "DUE"}</span></td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Mirrors the server-side rule in validatePassword(). Checked here too so the
   user gets immediate feedback rather than a round trip. */
const passwordProblem = (pw) => {
  if (!pw || pw.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain at least one letter and one number.";
  return null;
};

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // `loading` starts true, so the initial fetch needs no synchronous
  // setState inside the effect (react-hooks/set-state-in-effect); later
  // refetches after add/delete simply replace the list in place.
  const fetchUsers = async () => {
    try { const data = await api.getUsers(); setUsers(Array.isArray(data) ? data : []); }
    catch (e) { if (e.message !== "session_expired" && !e.forbidden) Swal.fire({ title: "Could not load users", text: e.message, icon: "error", confirmButtonColor: "#ef4444" }); }
    setLoading(false);
  };

  useEffect(() => { let alive = true; Promise.resolve().then(() => alive && fetchUsers()); return () => { alive = false; }; }, []);

  const add = async () => {
    if (!form.username.trim()) {
      return Swal.fire({ title: "Username required", icon: "warning", confirmButtonColor: "#0077ff" });
    }
    const bad = passwordProblem(form.password);
    if (bad) return Swal.fire({ title: "Weak password", text: bad, icon: "warning", confirmButtonColor: "#0077ff" });
    setBusy(true);
    try {
      const res = await api.addUser(form.username.trim(), form.password, form.role);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not create the user.");
      }
      setForm({ username: "", password: "", role: "user" });
      await fetchUsers();
      Swal.fire({ title: "User created", icon: "success", timer: 1600, timerProgressBar: true, confirmButtonColor: "#0077ff" });
    } catch (e) {
      Swal.fire({ title: "Could not create user", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
    setBusy(false);
  };

  const del = async (u) => {
    const r = await Swal.fire({
      title: "Delete user?",
      html: `Permanently remove <strong>${u.username}</strong>?`,
      icon: "warning", showCancelButton: true, confirmButtonText: "Delete",
      confirmButtonColor: "#ef4444",
    });
    if (!r.isConfirmed) return;
    try {
      const res = await api.deleteUser(u.id);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Could not delete the user.");
      }
      await fetchUsers();
    } catch (e) {
      Swal.fire({ title: "Could not delete", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
  };

  const setPassword = async (u) => {
    const { value: pw } = await Swal.fire({
      title: `Set password for ${u.username}`,
      input: "password",
      inputLabel: "At least 8 characters, including a letter and a number",
      inputPlaceholder: "New password",
      showCancelButton: true,
      confirmButtonText: "Set password",
      confirmButtonColor: "#0077ff",
      inputValidator: (v) => passwordProblem(v),
    });
    if (!pw) return;
    try {
      await api.setUserPassword(u.id, pw);
      await fetchUsers();
      Swal.fire({ title: "Password set", text: `${u.username} can now sign in.`, icon: "success", confirmButtonColor: "#0077ff" });
    } catch (e) {
      Swal.fire({ title: "Could not set password", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
  };

  const pendingCount = users.filter(u => u.needsPassword).length;

  return (
    <div className="fade-in g2">
      <div className="card">
        <div className="card-head"><span className="card-head-title">➕ Add New User</span></div>
        <div className="card-body">
          <div className="field"><label>Username</label><input className="inp" type="text" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} /></div>
          <div className="field">
            <label>Password</label>
            <input className="inp" type="password" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} />
            <div style={{fontSize:11, color:T.inkLight, marginTop:4}}>
              Minimum 8 characters, with at least one letter and one number. Stored as a bcrypt hash — it cannot be read back.
            </div>
          </div>
          <div className="field"><label>Role</label>
            <select className="inp" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
              <option value="user">Office User</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <button className="btn-primary" style={{width:"100%", margin: "8px 0"}} disabled={busy} onClick={add}>
            {busy ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <span className="card-head-title">👥 User Accounts</span>
          {pendingCount > 0 && <span className="badge badge-warn">{pendingCount} need a password</span>}
        </div>
        {pendingCount > 0 && (
          <div className="alert alert-info" style={{margin:"10px 12px"}}>
            ⚠️ These accounts have no password set and cannot sign in. Use “Set password” on each one.
          </div>
        )}
        {loading ? <div style={{padding:20, textAlign:"center"}}>Loading...</div> : (
          <table className="tbl">
            <thead><tr>
              <th style={{textAlign:"left"}}>Username</th>
              <th style={{textAlign:"left"}}>Role</th>
              <th style={{textAlign:"left"}}>Password</th>
              <th></th>
            </tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.id}>
                  <td style={{fontWeight:600}}>{u.username}</td>
                  <td><span className={`badge ${u.role==='admin'?'badge-danger':'badge-success'}`}>{u.role.toUpperCase()}</span></td>
                  <td>
                    {u.needsPassword
                      ? <span className="badge badge-warn">NOT SET</span>
                      : <span style={{color:T.inkLight, fontSize:11}}>••••••••</span>}
                  </td>
                  <td style={{whiteSpace:"nowrap", textAlign:"right"}}>
                    <button className="btn-ghost" style={{padding:"3px 8px", fontSize:10, marginRight:6}} onClick={()=>setPassword(u)}>
                      Set password
                    </button>
                    <button className="btn-icon" title="Delete user" onClick={()=>del(u)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const VEHICLE_TYPES = ["3-Wheeler", "Tempo", "Mini Truck", "Truck", "Other"];
const blankVehicleForm = () => ({ vehicleNo: "", type: "3-Wheeler", capacity: "", notes: "" });

export function AdminVehicleMaster() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blankVehicleForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("active");

  const fetchVehicles = async () => {
    try { const data = await api.getVehicles(); setVehicles(Array.isArray(data) ? data : []); }
    catch { setVehicles([]); }
    setLoading(false);
  };
  useEffect(() => { let alive = true; Promise.resolve().then(() => alive && fetchVehicles()); return () => { alive = false; }; }, []);

  const openAdd = () => { setEditId(null); setForm(blankVehicleForm()); setErr(""); setShowModal(true); };
  const openEdit = (v) => {
    setEditId(v.id);
    setForm({ vehicleNo: v.vehicle_no, type: v.type, capacity: v.capacity ?? "", notes: v.notes || "" });
    setErr(""); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.vehicleNo.trim()) { setErr("Vehicle number is required."); return; }
    setSaving(true); setErr("");
    try {
      if (editId) { await api.updateVehicle(editId, { ...form, isActive: vehicles.find(v => v.id === editId)?.is_active ?? 1 }); }
      else { await api.addVehicle(form); }
      await fetchVehicles(); closeModal();
    } catch { setErr("Save failed."); }
    setSaving(false);
  };
  const handleToggle = async (id) => { await api.toggleVehicle(id); fetchVehicles(); };
  const handleDelete = async (id, vehicleNo) => {
    if (!window.confirm(`Delete vehicle ${vehicleNo}?`)) return;
    await api.deleteVehicle(id); fetchVehicles();
  };

  const displayed = vehicles.filter(v => filter === "all" ? true : v.is_active === 1);
  const activeCount = vehicles.filter(v => v.is_active === 1).length;

  return (
    <div className="fade-in">
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{ color: T.accent }}>{vehicles.length}</div><div className="stat-lbl">Total Vehicles</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{activeCount}</div><div className="stat-lbl">Active</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.inkLight }}><div className="stat-val" style={{ color: T.inkLight }}>{vehicles.length-activeCount}</div><div className="stat-lbl">Inactive</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="period-row" style={{ margin: 0 }}>
          {[["active", "🟢 Active"], ["all", "All Vehicles"]].map(([v, l]) => (
            <button key={v} className="btn-ghost" style={{ background: filter === v ? T.accent : "transparent", color: filter === v ? "#fff" : T.inkMid, borderColor: filter === v ? T.accent : T.border }} onClick={() => setFilter(v)}>{l}</button>
          ))}
          <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center" }}>{displayed.length} vehicle{displayed.length !== 1 ? "s" : ""}</span>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Vehicle</button>
      </div>
      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: "center", color: T.inkLight }}>Loading vehicles…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Vehicle No.</th><th>Type</th><th style={{ textAlign: "center" }}>Capacity</th><th>Notes</th><th style={{ textAlign: "center" }}>Status</th><th style={{ textAlign: "center" }}>Actions</th></tr></thead>
              <tbody>
                {displayed.map((v, idx) => (
                  <tr key={v.id}>
                    <td style={{ color: T.inkLight, fontSize: 11 }}>{idx + 1}</td>
                    <td><span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 1, color: T.accent, background: T.accentBg, border: `1px solid ${T.accentLt}`, borderRadius: 6, padding: "3px 10px", display: "inline-block" }}>{v.vehicle_no}</span></td>
                    <td><span className="badge badge-blue">{v.type || "—"}</span></td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{v.capacity ? `${v.capacity} cyl` : "—"}</td>
                    <td style={{ fontSize: 12, color: T.inkMid, maxWidth: 160 }}>{v.notes || "—"}</td>
                    <td style={{ textAlign: "center" }}><button onClick={() => handleToggle(v.id)} className={`badge ${v.is_active ? "badge-success" : "badge-ink"}`} style={{ cursor: "pointer", border: "none", padding: "4px 12px" }}>{v.is_active ? "ACTIVE" : "INACTIVE"}</button></td>
                    <td><div style={{ display: "flex", gap: 6, justifyContent: "center" }}><button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openEdit(v)}>✏️ Edit</button><button className="btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => handleDelete(v.id, v.vehicle_no)}>×</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: T.card, borderRadius: 14, padding: 28, width: "100%", maxWidth: 520, boxShadow: T.shadowMd, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700 }}>{editId ? "✏️ Edit Vehicle" : "🚛 Add New Vehicle"}</div></div><button className="btn-icon" onClick={closeModal}>×</button></div>
            {err && <div className="login-err">⚠️ {err}</div>}
            <div className="g2"><div className="field"><label>Vehicle Number *</label><input className="inp" type="text" value={form.vehicleNo} onChange={e => setForm({ ...form, vehicleNo: e.target.value.toUpperCase() })} /></div><div className="field"><label>Vehicle Type</label><select className="inp" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{VEHICLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div></div>
            <div className="field"><label>Cylinder Capacity</label><input className="inp" type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></div>
            <div className="field"><label>Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" style={{ flex: 1 }} onClick={closeModal}>Cancel</button><button className="btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editId ? "💾 Update" : "✅ Add"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMP_ROLES = ["Delivery Boy", "Office Staff", "Helper", "Driver", "Manager", "Accountant", "Other"];
const blankEmpForm = () => ({ name: "", role: "Delivery Boy", salary: "", phone: "", joinDate: todayStr(), notes: "" });

export function AdminEmployeeMaster() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blankEmpForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");

  const fetchEmployees = async () => {
    try { const data = await api.getEmployees(); setEmployees(Array.isArray(data) ? data : []); } catch { setEmployees([]); }
    setLoading(false);
  };
  useEffect(() => { let alive = true; Promise.resolve().then(() => alive && fetchEmployees()); return () => { alive = false; }; }, []);

  const openAdd = () => { setEditId(null); setForm(blankEmpForm()); setErr(""); setShowModal(true); };
  const openEdit = (e) => {
    setEditId(e.id);
    setForm({ name: e.name, role: e.role, salary: e.salary ?? "", phone: e.phone || "", joinDate: e.join_date || todayStr(), notes: e.notes || "" });
    setErr(""); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditId(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { setErr("Name is required."); return; }
    setSaving(true); setErr("");
    try {
      if (editId) { await api.updateEmployee(editId, { ...form, isActive: employees.find(e => e.id === editId)?.is_active ?? 1 }); }
      else { await api.addEmployee(form); }
      await fetchEmployees(); closeModal();
    } catch { setErr("Save failed."); }
    setSaving(false);
  };
  const handleToggle = async (id) => { await api.toggleEmployee(id); fetchEmployees(); };
  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await api.deleteEmployee(id); fetchEmployees();
  };

  const activeEmps = employees.filter(e => e.is_active === 1);
  const totalSalary = activeEmps.reduce((s, e) => s + num(e.salary), 0);
  const displayed = employees
    .filter(e => filter === "all" ? true : e.is_active === 1)
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.role.toLowerCase().includes(search.toLowerCase()));

  const roleBadge = (role) => {
    const map = { "Delivery Boy": "badge-blue", "Office Staff": "badge-success", "Helper": "badge-ink", "Driver": "badge-warn", "Manager": "badge-danger", "Accountant": "badge-blue" };
    return map[role] || "badge-ink";
  };

  return (
    <div className="fade-in">
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{ color: T.accent }}>{employees.length}</div><div className="stat-lbl">Total Employees</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{activeEmps.length}</div><div className="stat-lbl">Active</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.warn }}><div className="stat-val" style={{ color: T.warn, fontSize: 18 }}>{inr(totalSalary)}</div><div className="stat-lbl">Monthly Payroll</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["active", "🟢 Active"], ["all", "All"]].map(([v, l]) => (
            <button key={v} className="btn-ghost" style={{ background: filter === v ? T.accent : "transparent", color: filter === v ? "#fff" : T.inkMid, borderColor: filter === v ? T.accent : T.border }} onClick={() => setFilter(v)}>{l}</button>
          ))}
          <input className="inp" type="text" placeholder="🔍 Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 160, padding: "7px 10px", fontSize: 12 }} />
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>
      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: "center", color: T.inkLight }}>Loading…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Name</th><th>Role</th><th style={{ textAlign: "right" }}>Salary</th><th>Phone</th><th>Joined</th><th style={{ textAlign: "center" }}>Status</th><th style={{ textAlign: "center" }}>Actions</th></tr></thead>
              <tbody>
                {displayed.map((e, idx) => (
                  <tr key={e.id}>
                    <td style={{ color: T.inkLight, fontSize: 11 }}>{idx + 1}</td>
                    <td><div style={{ fontWeight: 700, fontSize: 14 }}>{e.name}</div></td>
                    <td><span className={`badge ${roleBadge(e.role)}`}>{e.role}</span></td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: num(e.salary)>0?T.success:T.inkLight }}>{inr(e.salary)}</td>
                    <td style={{ fontSize: 12 }}>{e.phone || "—"}</td>
                    <td style={{ fontSize: 12, color: T.inkMid }}>{e.join_date ? fmtDate(e.join_date) : "—"}</td>
                    <td style={{ textAlign: "center" }}><button onClick={() => handleToggle(e.id)} className={`badge ${e.is_active ? "badge-success" : "badge-ink"}`} style={{ cursor: "pointer", border: "none", padding: "4px 12px" }}>{e.is_active ? "ACTIVE" : "INACTIVE"}</button></td>
                    <td><div style={{ display: "flex", gap: 6, justifyContent: "center" }}><button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => openEdit(e)}>✏️</button><button className="btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => handleDelete(e.id, e.name)}>×</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ background: T.card, borderRadius: 14, padding: 28, width: "100%", maxWidth: 540, boxShadow: T.shadowMd, maxHeight: "92vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700 }}>{editId ? "✏️ Edit Employee" : "👤 Add New Employee"}</div></div><button className="btn-icon" onClick={closeModal}>×</button></div>
            {err && <div className="login-err">⚠️ {err}</div>}
            <div className="g2"><div className="field"><label>Full Name *</label><input className="inp" type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div><div className="field"><label>Role</label><select className="inp" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{EMP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div></div>
            <div className="g2"><div className="field"><label>Monthly Salary (₹)</label><input className="inp" type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} /></div><div className="field"><label>Phone</label><input className="inp" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div></div>
            <div className="field"><label>Date of Joining</label><input className="inp" type="date" value={form.joinDate} onChange={e => setForm({ ...form, joinDate: e.target.value })} /></div>
            <div className="field"><label>Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 10 }}><button className="btn-ghost" style={{ flex: 1 }} onClick={closeModal}>Cancel</button><button className="btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editId ? "💾 Update" : "✅ Add"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
