import React, { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import { api } from "../api";
import { T } from "../styles";
import {
  PRODUCTS, ACCESSORIES, todayStr, fmtDate, fmtMonth, inr, num, uid,
  getCurrentRate, getCommRate, calcEntry, getSalaryMonth, productLabel
} from "../constants";
import AdminProductMaster from "./AdminProductMaster";
import SharedSalaryReport from "./SharedSalaryReport";

export { AdminProductMaster, SharedSalaryReport };

// Helper to calculate start and end of any month in local time (YYYY-MM-DD)
const getMonthBounds = (dateObj = new Date()) => {
  const y = dateObj.getFullYear();
  const m = dateObj.getMonth();
  const p = (n) => String(n).padStart(2, "0");
  const start = `${y}-${p(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${p(m + 1)}-${p(lastDay)}`;
  return { start, end };
};

export function AdminDashboard({ entries = [], pending = [], prices = [], commissions = [], products = PRODUCTS, onViewDay }) {
  // Default range is the current month Start & End date range
  const currentMonthRange = getMonthBounds(new Date());
  const [fromDate, setFromDate] = useState(currentMonthRange.start);
  const [toDate, setToDate] = useState(currentMonthRange.end);

  // Quick preset setters
  const setThisMonth = () => {
    const r = getMonthBounds(new Date());
    setFromDate(r.start);
    setToDate(r.end);
  };

  const setToday = () => {
    const t = todayStr();
    setFromDate(t);
    setToDate(t);
  };

  const setLastMonth = () => {
    const now = new Date();
    const r = getMonthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    setFromDate(r.start);
    setToDate(r.end);
  };

  // Month navigation: shift full month relative to current fromDate
  const handlePrevMonth = () => {
    const refDate = fromDate ? new Date(fromDate + "T00:00:00") : new Date();
    const r = getMonthBounds(new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1));
    setFromDate(r.start);
    setToDate(r.end);
  };

  const handleNextMonth = () => {
    const refDate = fromDate ? new Date(fromDate + "T00:00:00") : new Date();
    const r = getMonthBounds(new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1));
    setFromDate(r.start);
    setToDate(r.end);
  };

  const handleFromChange = (newVal) => {
    setFromDate(newVal);
    if (toDate && newVal && newVal > toDate) {
      setToDate(newVal);
    }
  };

  const handleToChange = (newVal) => {
    setToDate(newVal);
    if (fromDate && newVal && newVal < fromDate) {
      setFromDate(newVal);
    }
  };

  // Check preset matches
  const isThisMonth = fromDate === currentMonthRange.start && toDate === currentMonthRange.end;
  const isToday = fromDate === todayStr() && toDate === todayStr();
  const lastMonthRange = getMonthBounds(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const isLastMonth = fromDate === lastMonthRange.start && toDate === lastMonthRange.end;

  // Formatted display label for selected range
  const isSingleDay = fromDate && toDate && fromDate === toDate;
  const rangeLabel = !fromDate && !toDate
    ? "All Time"
    : isSingleDay
    ? fmtDate(fromDate)
    : `${fromDate ? fmtDate(fromDate) : "Start"} – ${toDate ? fmtDate(toDate) : "End"}`;

  // Filter entries for the selected date range
  const rangeEntries = (entries || [])
    .filter(e => {
      if (!e.date) return false;
      if (fromDate && e.date < fromDate) return false;
      if (toDate && e.date > toDate) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Calculations for selected date range
  const mCylSales = rangeEntries.reduce((s, e) => s + calcEntry(e).totalSales, 0);
  const mAccSales = rangeEntries.reduce((s, e) => s + calcEntry(e).totalAccessorySales, 0);
  const mGrossSales = mCylSales + mAccSales;

  // Comparison with prior period of equal duration
  let deltaSales = null;
  if (fromDate && toDate) {
    const fTime = new Date(fromDate + "T00:00:00").getTime();
    const tTime = new Date(toDate + "T00:00:00").getTime();
    const daySpan = Math.max(1, Math.round((tTime - fTime) / (1000 * 60 * 60 * 24)) + 1);

    const prevTo = new Date(fTime - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(prevTo.getTime() - (daySpan - 1) * 24 * 60 * 60 * 1000);
    const pToStr = `${prevTo.getFullYear()}-${String(prevTo.getMonth() + 1).padStart(2, "0")}-${String(prevTo.getDate()).padStart(2, "0")}`;
    const pFromStr = `${prevFrom.getFullYear()}-${String(prevFrom.getMonth() + 1).padStart(2, "0")}-${String(prevFrom.getDate()).padStart(2, "0")}`;

    const prevEntries = (entries || []).filter(e => e.date && e.date >= pFromStr && e.date <= pToStr);
    const prevGross = prevEntries.reduce((s, e) => s + calcEntry(e).totalSales + calcEntry(e).totalAccessorySales, 0);
    if (prevGross > 0) {
      deltaSales = (((mGrossSales - prevGross) / prevGross) * 100).toFixed(1);
    }
  }

  // Cylinders sold
  const mCylinders = rangeEntries.reduce((s, e) => {
    return s + (e.products || []).reduce((ps, p) => ps + num(p.sell) + num(p.online), 0);
  }, 0);

  // Agency Commission earned on cylinder sales
  const mCommission = rangeEntries.reduce((s, e) => {
    return s + (e.products || []).reduce((ps, p) => ps + (num(p.sell) + num(p.online)) * getCommRate(p.id, commissions, e.date), 0);
  }, 0);

  // Total Gross Agency Earnings (Commission + Accessories)
  const mAgencyEarnings = mCommission + mAccSales;

  // Expenses breakdown
  const mGeneralExpenses = rangeEntries.reduce((s, e) => s + calcEntry(e).totalExpenses, 0);
  const mVehicleExpenses = rangeEntries.reduce((s, e) => s + calcEntry(e).totalVehicleExp, 0);
  // Salary expenses & breakdown:
  // - Single day view: counts cash disbursements made on that calendar day (calcEntry).
  // - Full month / date-range views: accrues salary disbursements (advances + final payouts)
  //   belonging to the payroll month (forMonth), ensuring late disbursements (e.g. August salaries
  //   paid Sept 1-10) are included in August's P&L and not erroneously left out.
  const mSalaryBreakdown = (() => {
    if (isSingleDay) {
      let adv = 0, sal = 0;
      (rangeEntries[0]?.salaryPayments || []).forEach(p => {
        if (p.type === "Salary") sal += num(p.amt); else adv += num(p.amt);
      });
      return { advance: adv, salary: sal, total: adv + sal };
    }
    const fromMonth = fromDate ? fromDate.slice(0, 7) : "";
    const toMonth = toDate ? toDate.slice(0, 7) : "";
    const isStartOfMonth = fromDate && fromDate.endsWith("-01");
    const isEndOfMonth = toDate && toDate === getMonthBounds(new Date(toDate + "T00:00:00")).end;

    if ((!fromDate && !toDate) || (isStartOfMonth && isEndOfMonth)) {
      let adv = 0, sal = 0;
      (entries || []).forEach(e => {
        (e.salaryPayments || []).forEach(p => {
          const effMonth = p.forMonth || (e.date ? e.date.slice(0, 7) : "");
          if (!fromDate || (effMonth >= fromMonth && effMonth <= toMonth)) {
            if (p.type === "Salary") sal += num(p.amt); else adv += num(p.amt);
          }
        });
      });
      return { advance: adv, salary: sal, total: adv + sal };
    }
    let adv = 0, sal = 0;
    rangeEntries.forEach(e => {
      (e.salaryPayments || []).forEach(p => {
        if (p.type === "Salary") sal += num(p.amt); else adv += num(p.amt);
      });
    });
    return { advance: adv, salary: sal, total: adv + sal };
  })();

  const mSalaryExpenses  = mSalaryBreakdown.total;
  const mTotalExpenses   = mGeneralExpenses + mVehicleExpenses + mSalaryExpenses;

  // Real Profit = (Agency Commission + Accessory Sales) - Total Operating Expenses
  const mRealProfit = mAgencyEarnings - mTotalExpenses;

  // Outstanding credit (all-time pending)
  const outstanding = (pending || []).filter(p => !p.cleared).reduce((s, p) => s + (num(p.originalAmt) - num(p.recovered)), 0);

  // BOB Bank Deposits in range
  const mBobDeposit = rangeEntries.reduce((s, e) => s + num(e.bob), 0);

  // Connections in range
  const mConn = rangeEntries.reduce((acc, e) => {
    const c = calcEntry(e);
    acc.cash += c.totalConnectionPaymentsCash;
    acc.online += c.totalConnectionPaymentsOnline;
    acc.refunds += c.totalConnectionRefunds;
    return acc;
  }, { cash: 0, online: 0, refunds: 0 });

  // Product snapshot breakdown
  const productBreakdown = (products || PRODUCTS).map((p) => {
    const isAcc = p.category === 'accessory';
    const qty = rangeEntries.reduce((s, e) => {
      if (isAcc) {
        const accRow = (e.accessories || []).find(x => x.accessoryId === p.id);
        return s + (accRow && accRow.sold ? num(accRow.qty) : 0);
      } else {
        const prodRow = (e.products || []).find(x => x.id === p.id);
        return s + num(prodRow?.sell) + num(prodRow?.online);
      }
    }, 0);

    const revenue = rangeEntries.reduce((s, e) => {
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
    const commTotal = isAcc ? 0 : rangeEntries.reduce((s, e) => {
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
      {/* Date Range Selection Toolbar */}
      <div className="card" style={{ marginBottom: 18, padding: "14px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: T.shadowSm }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: "rgba(37, 99, 235, 0.08)",
            border: "1px solid rgba(37, 99, 235, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            flexShrink: 0
          }}>
            📅
          </div>
          <div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: T.ink, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{rangeLabel}</span>
              {isThisMonth && <span className="badge badge-success" style={{ fontSize: 11, padding: "2px 8px" }}>Current Month</span>}
              {isToday && <span className="badge badge-primary" style={{ fontSize: 11, padding: "2px 8px" }}>Today</span>}
              {isLastMonth && <span className="badge badge-ink" style={{ fontSize: 11, padding: "2px 8px" }}>Last Month</span>}
            </div>
            <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
              {rangeEntries.length} daily {rangeEntries.length === 1 ? "entry" : "entries"} recorded
            </div>
          </div>
        </div>

        {/* Date Range Inputs & Presets */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.inkMid }}>From:</span>
            <input
              type="date"
              className="inp"
              value={fromDate}
              onChange={(e) => handleFromChange(e.target.value)}
              style={{ width: 135, fontWeight: 600, padding: "6px 8px", fontSize: 13 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.inkMid }}>To:</span>
            <input
              type="date"
              className="inp"
              value={toDate}
              onChange={(e) => handleToChange(e.target.value)}
              style={{ width: 135, fontWeight: 600, padding: "6px 8px", fontSize: 13 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              className={isThisMonth ? "btn" : "btn-ghost"}
              onClick={setThisMonth}
              style={{ padding: "6px 12px", fontWeight: 700, fontSize: 12 }}
            >
              This Month
            </button>
            <button
              className={isToday ? "btn" : "btn-ghost"}
              onClick={setToday}
              style={{ padding: "6px 12px", fontWeight: 700, fontSize: 12 }}
            >
              Today
            </button>
            <button
              className={isLastMonth ? "btn" : "btn-ghost"}
              onClick={setLastMonth}
              style={{ padding: "6px 12px", fontWeight: 700, fontSize: 12 }}
            >
              Last Month
            </button>
            <button
              className="btn-ghost"
              onClick={handlePrevMonth}
              title="Previous Month"
              style={{ padding: "6px 10px", fontWeight: 700, fontSize: 12 }}
            >
              ◀ Prev
            </button>
            <button
              className="btn-ghost"
              onClick={handleNextMonth}
              title="Next Month"
              style={{ padding: "6px 10px", fontWeight: 700, fontSize: 12 }}
            >
              Next ▶
            </button>
          </div>
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
              {num(deltaSales) >= 0 ? "▲" : "▼"} {Math.abs(deltaSales)}% vs prior period
            </div>
          )}
        </div>

        {/* Cylinders Sold */}
        <div className="stat-card" style={{ "--kpi-color": "#0ea5e9" }}>
          <div className="stat-val" style={{ color: "#0ea5e9" }}>{mCylinders}</div>
          <div className="stat-lbl">Cylinders Sold</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>In selected range</div>
        </div>

        {/* Total Operating Expenses */}
        <div className="stat-card" style={{ "--kpi-color": T.danger }}>
          <div className="stat-val" style={{ color: T.danger }}>{inr(mTotalExpenses)}</div>
          <div className="stat-lbl">Total Expenses</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }} title={`General: ${inr(mGeneralExpenses)} | Vehicles: ${inr(mVehicleExpenses)} | Salaries: ${inr(mSalaryExpenses)}${mSalaryBreakdown.advance > 0 && mSalaryBreakdown.salary > 0 ? ` (Adv: ${inr(mSalaryBreakdown.advance)} + Sal: ${inr(mSalaryBreakdown.salary)})` : ""}`}>
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

        {/* BOB Bank Deposit */}
        <div className="stat-card" style={{ "--kpi-color": "#2563eb" }}>
          <div className="stat-val" style={{ color: "#2563eb" }}>{inr(mBobDeposit)}</div>
          <div className="stat-lbl">BOB Bank Deposit</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>Bank of Baroda Deposits</div>
        </div>
      </div>

      {/* Grid: P&L Financial Summary + Product Snapshot */}
      <div className="g2" style={{ marginBottom: 16 }}>
        {/* Monthly P&L / Financial Summary Card */}
        <div className="card">
          <div className="card-head">
            <span className="card-head-title">📊 Profit & Loss (P&L) Summary</span>
            <span className="badge badge-ink">{rangeLabel}</span>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f0f0f0" }}>
              <div>
                <span style={{ fontSize: 13, color: T.inkMid }}>Employee Salaries & Advances</span>
                {mSalaryBreakdown.total > 0 && mSalaryBreakdown.advance > 0 && mSalaryBreakdown.salary > 0 && (
                  <div style={{ fontSize: 10, color: T.inkLight, marginTop: 1 }}>
                    Adv: {inr(mSalaryBreakdown.advance)} · Sal: {inr(mSalaryBreakdown.salary)}
                  </div>
                )}
              </div>
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
                  REAL NET PROFIT ({rangeLabel})
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
            <span className="badge badge-ink">{rangeLabel}</span>
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

      {/* Daily Entries Table in Date Range */}
      <div className="card">
        <div className="card-head">
          <span className="card-head-title">📅 Daily Entries ({rangeLabel})</span>
          <span style={{ fontSize: 12, color: T.inkLight }}>{rangeEntries.length} entries recorded</span>
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
                <th style={{ textAlign: "right", color: "#1d4ed8" }}>BOB Deposit</th>
                <th style={{ textAlign: "right" }}>Cash on Hand</th>
                {onViewDay && <th style={{ textAlign: "center" }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {rangeEntries.length === 0 ? (
                <tr>
                  <td colSpan={onViewDay ? 10 : 9} style={{ textAlign: "center", padding: "24px 12px", color: T.inkLight }}>
                    No daily entries recorded between {fmtDate(fromDate)} and {fmtDate(toDate)}.
                  </td>
                </tr>
              ) : (
                rangeEntries.map(e => {
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
                      <td style={{ color: num(e.bob) > 0 ? "#1d4ed8" : T.inkLight, fontWeight: num(e.bob) > 0 ? 700 : 400, textAlign: "right" }}>
                        {num(e.bob) > 0 ? inr(num(e.bob)) : "—"}
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

export function AdminDayReports({ entries, commissions, products = PRODUCTS, onNavigate = null }) {
  const sorted = [...entries].sort((a,b)=>b.date.localeCompare(a.date));
  const [selDate, setSelDate] = useState(() => sorted[0]?.date || todayStr());

  // If selDate is not set or entries list changes, allow smooth sync
  useEffect(() => {
    if (sorted.length > 0 && !entries.some(e => e.date === selDate)) {
      setSelDate(sorted[0].date);
    }
  }, [entries]);

  const entry = entries.find(e => e.date === selDate);

  const changeDay = (delta) => {
    const d = new Date(selDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setSelDate(`${yyyy}-${mm}-${dd}`);
  };

  return (
    <div className="fade-in">
      {/* Interactive Date Navigation Bar */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          background: "#ffffff",
          border: `1px solid ${T.border}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "7px 12px", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => changeDay(-1)}
            title="Previous Day"
          >
            ◀ Prev Day
          </button>

          <input
            type="date"
            className="inp"
            style={{ width: 160, fontWeight: 700, textAlign: "center" }}
            value={selDate}
            max={todayStr()}
            onChange={(e) => setSelDate(e.target.value)}
          />

          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "7px 12px", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => changeDay(1)}
            disabled={selDate >= todayStr()}
            title="Next Day"
          >
            Next Day ▶
          </button>

          <button
            type="button"
            className="btn-ghost"
            style={{
              padding: "7px 14px",
              background: selDate === todayStr() ? "rgba(234, 88, 12, 0.08)" : "transparent",
              color: selDate === todayStr() ? T.accent : T.ink,
              borderColor: selDate === todayStr() ? T.accent : T.border,
              fontWeight: 700
            }}
            onClick={() => setSelDate(todayStr())}
          >
            📅 Today
          </button>

          {sorted.length > 0 && (
            <select
              className="inp"
              value={entry ? selDate : ""}
              onChange={(e) => e.target.value && setSelDate(e.target.value)}
              style={{ maxWidth: 220, fontSize: 13 }}
            >
              <option value="" disabled>— Jump to Saved Date ({sorted.length}) —</option>
              {sorted.map(e => (
                <option key={e.date} value={e.date}>
                  {fmtDate(e.date)} {e.date === todayStr() ? " (Today)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {entry ? (
            <>
              <span className="badge badge-success" style={{ fontSize: 12, padding: "5px 10px" }}>
                ● Saved Entry Found
              </span>
              {num(entry.bob) > 0 && (
                <span className="badge" style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8", border: "1px solid rgba(37,99,235,0.25)", fontSize: 12, padding: "5px 10px", fontWeight: 700 }}>
                  🏦 BOB Deposit: {inr(num(entry.bob))}
                </span>
              )}
              {onNavigate && (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: T.accent,
                    borderColor: T.accent
                  }}
                  onClick={() => onNavigate("admin-entry", selDate)}
                >
                  ✏️ Edit in Daily Entry
                </button>
              )}
            </>
          ) : (
            <span className="badge" style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", fontSize: 12, padding: "5px 10px" }}>
              ○ No Entry for this date
            </span>
          )}
        </div>
      </div>

      {!entry ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "48px 24px",
            background: "#ffffff",
            border: "1px dashed #cbd5e1"
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            No Daily Entry Found for {fmtDate(selDate)}
          </div>
          <div style={{ fontSize: 13, color: T.inkLight, maxWidth: 460, margin: "0 auto 20px" }}>
            No daily sales, plant deliveries, or cash drawer closing has been recorded for this date in the system yet.
          </div>
          {onNavigate && (
            <button
              type="button"
              className="btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 24px",
                fontSize: 14
              }}
              onClick={() => onNavigate("admin-entry", selDate)}
            >
              <span>📝</span> Open Daily Entry for {fmtDate(selDate)} →
            </button>
          )}
        </div>
      ) : (
        <AdminDayDetail entry={entry} commissions={commissions} products={products} />
      )}
    </div>
  );
}

export function AdminDayDetail({ entry, commissions, products = PRODUCTS }) {
  const [txFilter, setTxFilter] = useState("all");
  const [txSearch, setTxSearch] = useState("");

  const calcs = calcEntry(entry);
  const totalCyl = entry.products.reduce((s,p)=>s+num(p.sell)+num(p.online),0);
  const totalComm = entry.products.reduce((s,p)=>s+(num(p.sell)+num(p.online))*getCommRate(p.id, commissions, entry.date),0);

  // Compile every individual financial transaction for this day into a structured ledger
  const allTransactions = useMemo(() => {
    if (!entry) return [];
    const list = [];

    // 1. Opening Cash
    if (num(entry.openingCash) > 0) {
      list.push({
        id: "tx-open",
        category: "Opening Cash",
        party: "Cash Drawer",
        desc: "Opening Cash on Hand balance brought forward",
        mode: "Cash",
        flow: "in",
        amount: num(entry.openingCash),
        cashImpact: num(entry.openingCash),
        badgeClass: "badge-ink",
      });
    }

    // 2. Cash Cylinder Sales (per product)
    (entry.products || []).forEach(p => {
      const cashSell = num(p.sell);
      const sbc = num(p.sbc);
      const dbc = num(p.dbc);
      const rev = (cashSell * num(p.rate)) + (sbc * num(p.sbcRate)) + (dbc * num(p.dbcRate));
      if (rev > 0) {
        list.push({
          id: `tx-prod-cash-${p.id}`,
          category: "Cylinder Sales (Cash)",
          party: "Counter / Delivery",
          desc: `${productLabel(p.id, products)}: ${cashSell} sold @ ${inr(p.rate)}${sbc > 0 ? ` + ${sbc} SBC @ ${inr(p.sbcRate)}` : ""}${dbc > 0 ? ` + ${dbc} DBC @ ${inr(p.dbcRate)}` : ""}`,
          mode: "Cash",
          flow: "in",
          amount: rev,
          cashImpact: rev,
          badgeClass: "badge-success",
        });
      }
    });

    // 3. Online Cylinder Sales (per product)
    (entry.products || []).forEach(p => {
      const onlineSell = num(p.online);
      const rev = onlineSell * num(p.rate);
      if (rev > 0) {
        list.push({
          id: `tx-prod-online-${p.id}`,
          category: "Cylinder Sales (Online)",
          party: "Customer (UPI / QR)",
          desc: `${productLabel(p.id, products)}: ${onlineSell} sold online @ ${inr(p.rate)} (Auto-deducted to Bank)`,
          mode: "Online",
          flow: "in",
          amount: rev,
          cashImpact: 0,
          badgeClass: "badge-blue",
        });
      }
    });

    // 4. Accessories Sales
    (entry.accessories || []).filter(a => a.sold && num(a.qty) > 0).forEach(a => {
      const accDef = ACCESSORIES.find(x => x.id === a.accessoryId) || {};
      const amt = num(a.qty) * num(a.rate);
      list.push({
        id: `tx-acc-${a.accessoryId}`,
        category: "Accessories Sale",
        party: "Counter Sale",
        desc: `${accDef.short || accDef.label || a.accessoryId} × ${a.qty} @ ${inr(a.rate)}`,
        mode: "Cash",
        flow: "in",
        amount: amt,
        cashImpact: amt,
        badgeClass: "badge-success",
      });
    });

    // 5. Credit Recoveries
    (entry.creditRecoveries || []).filter(cr => num(cr.amt) > 0).forEach((cr, idx) => {
      list.push({
        id: `tx-rec-${idx}`,
        category: "Credit Received",
        party: cr.customerName || "Customer",
        desc: `Credit settlement payment${cr.note ? ` (${cr.note})` : ""}${num(cr.emptyReturned) > 0 ? ` · ${cr.emptyReturned} empty returned` : ""}`,
        mode: "Cash",
        flow: "in",
        amount: num(cr.amt),
        cashImpact: num(cr.amt),
        badgeClass: "badge-success",
      });
    });

    // 6. Other Cash Credits
    (entry.otherCashCredits || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      list.push({
        id: `tx-occ-${idx}`,
        category: "Other Cash Credit",
        party: "Counter / Misc",
        desc: x.desc || "Miscellaneous cash receipt",
        mode: "Cash",
        flow: "in",
        amount: num(x.amt),
        cashImpact: num(x.amt),
        badgeClass: "badge-success",
      });
    });

    // 7. Connection New Issue
    (entry.connectionNew || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      const isCash = x.mode === "cash";
      list.push({
        id: `tx-cnew-${idx}`,
        category: "Connection (New)",
        party: x.customerName || "New Consumer",
        desc: `New SV: ${productLabel(x.productId, products)} (${x.connectionType || "Single"}) · ${isCash ? "Cash" : "Online"}`,
        mode: isCash ? "Cash" : "Online",
        flow: "in",
        amount: num(x.amt),
        cashImpact: isCash ? num(x.amt) : 0,
        badgeClass: isCash ? "badge-success" : "badge-blue",
      });
    });

    // 8. Connection Additional Bottle
    (entry.connectionPayments || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      const isCash = x.mode === "cash";
      list.push({
        id: `tx-cpay-${idx}`,
        category: "Connection (Add. Bottle)",
        party: x.customerName || "Consumer",
        desc: `Additional Bottle: ${productLabel(x.productId, products)} × ${x.qty || 1} · ${isCash ? "Cash" : "Online"}`,
        mode: isCash ? "Cash" : "Online",
        flow: "in",
        amount: num(x.amt),
        cashImpact: isCash ? num(x.amt) : 0,
        badgeClass: isCash ? "badge-success" : "badge-blue",
      });
    });

    // 9. Connection Surrender Refunds
    (entry.connectionRefunds || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      list.push({
        id: `tx-cref-${idx}`,
        category: "Connection Refund",
        party: x.customerName || "Consumer",
        desc: `SV Surrender Refund: ${productLabel(x.productId, products)}${num(x.penaltyDeducted) > 0 ? ` (Refund ${inr(x.refundAmount)} − Penalty ${inr(x.penaltyDeducted)})` : ""}`,
        mode: "Cash",
        flow: "out",
        amount: num(x.amt),
        cashImpact: -num(x.amt),
        badgeClass: "badge-danger",
      });
    });

    // 10. Daily Operating Expenses
    (entry.expenses || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      list.push({
        id: `tx-exp-${idx}`,
        category: "Office Expense",
        party: "Office / Shop",
        desc: x.desc || "Daily expense",
        mode: "Cash",
        flow: "out",
        amount: num(x.amt),
        cashImpact: -num(x.amt),
        badgeClass: "badge-danger",
      });
    });

    // 11. Vehicle & Fuel Expenses
    (entry.vehicleExpenses || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      list.push({
        id: `tx-veh-${idx}`,
        category: "Vehicle Expense",
        party: x.vehicleNo || "Vehicle",
        desc: `${x.expType || "Fuel"}${x.desc ? ` · ${x.desc}` : ""}`,
        mode: "Cash",
        flow: "out",
        amount: num(x.amt),
        cashImpact: -num(x.amt),
        badgeClass: "badge-danger",
      });
    });

    // 12. Employee Salaries & Advances
    (entry.salaryPayments || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      list.push({
        id: `tx-sal-${idx}`,
        category: "Salary / Advance",
        party: x.employeeName || "Employee",
        desc: `${x.type === "Salary" ? "Salary payment" : "Salary advance"}${x.notes ? ` (${x.notes})` : ""}`,
        mode: "Cash",
        flow: "out",
        amount: num(x.amt),
        cashImpact: -num(x.amt),
        badgeClass: "badge-danger",
      });
    });

    // 13. Cheque / Online Disbursed
    (entry.chequeOnline || []).filter(x => num(x.amt) > 0).forEach((x, idx) => {
      list.push({
        id: `tx-chk-${idx}`,
        category: "Cheque / Online Out",
        party: "Vendor / Bank",
        desc: x.desc || "Cheque/online payment",
        mode: "Cheque/Online",
        flow: "out",
        amount: num(x.amt),
        cashImpact: -num(x.amt),
        badgeClass: "badge-danger",
      });
    });

    // 14. Bank of Baroda (BOB) Deposit
    if (num(entry.bob) > 0) {
      list.push({
        id: "tx-bob",
        category: "BOB Bank Deposit",
        party: "Bank of Baroda",
        desc: "Cash drawer funds deposited into Bank of Baroda (BOB) current account",
        mode: "Bank Deposit",
        flow: "out",
        amount: num(entry.bob),
        cashImpact: -num(entry.bob),
        badgeClass: "badge-blue",
      });
    }

    return list;
  }, [entry, calcs, products]);

  // Filter transactions based on active view and search query
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter(tx => {
      if (txFilter === "in" && tx.flow !== "in") return false;
      if (txFilter === "out" && tx.flow !== "out") return false;
      if (txFilter === "cash" && tx.cashImpact === 0) return false;
      if (txFilter === "bank" && !["Online", "Bank Deposit", "Cheque/Online"].includes(tx.mode)) return false;
      if (txSearch) {
        const q = txSearch.toLowerCase();
        const match = tx.category.toLowerCase().includes(q) ||
          tx.desc.toLowerCase().includes(q) ||
          tx.party.toLowerCase().includes(q) ||
          String(tx.amount).includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allTransactions, txFilter, txSearch]);

  const totalInflows = allTransactions.filter(t => t.cashImpact > 0).reduce((s, t) => s + t.cashImpact, 0);
  const totalOutflows = allTransactions.filter(t => t.cashImpact < 0).reduce((s, t) => s + Math.abs(t.cashImpact), 0);

  return (
    <div>
      {/* Top Metric Cards */}
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{color:T.success}}>{inr(calcs.totalSales)}</div>
          <div className="stat-lbl">Total Sales</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": "#2563eb" }}>
          <div className="stat-val" style={{ color: num(entry.bob) > 0 ? "#2563eb" : T.inkMid }}>{inr(num(entry.bob))}</div>
          <div className="stat-lbl">BOB Bank Deposit</div>
          <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>Bank of Baroda Deposit</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": calcs.cashOnHand<0?T.danger:T.ink }}>
          <div className="stat-val" style={{color:calcs.cashOnHand<0?T.danger:T.ink}}>{inr(calcs.cashOnHand)}</div>
          <div className="stat-lbl">Cash on Hand</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}>
          <div className="stat-val" style={{color:T.blue}}>{totalCyl}</div>
          <div className="stat-lbl">Cylinders Sold</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}>
          <div className="stat-val" style={{color:T.accent}}>{inr(totalComm)}</div>
          <div className="stat-lbl">Commission Earned</div>
        </div>
      </div>

      {/* Products Sold Table */}
      <div className="card">
        <div className="card-head"><span className="card-head-title">🛢️ Products Sold</span></div>
        <div style={{overflowX:"auto"}}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: "right" }}>Sold</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
                <th style={{ textAlign: "right" }}>Commission</th>
              </tr>
            </thead>
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

      {/* Grid: Financials Details Table + Departmental Cards */}
      <div className="g2">
        {/* Financials Details Table Card */}
        <div className="card">
          <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="card-head-title">💰 Financials Details Table</span>
            <span className="badge badge-ink" style={{ fontSize: 11 }}>{allTransactions.length} Transactions</span>
          </div>
          <div className="card-body" style={{ padding: "10px 16px" }}>
            {/* Opening Cash */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Opening Cash</span>
              <span style={{fontWeight:600}}>{inr(entry.openingCash)}</span>
            </div>

            {/* Cash Cylinder Sales */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Cash Cylinder Sales</span>
                <span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalCashSales)}</span>
              </div>
              {(entry.products || []).filter(p => num(p.sell) > 0 || num(p.sbc) > 0 || num(p.dbc) > 0).map(p => {
                const subAmt = (num(p.sell) * num(p.rate)) + (num(p.sbc) * num(p.sbcRate)) + (num(p.dbc) * num(p.dbcRate));
                return (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                    <span>• {productLabel(p.id, products)}: {p.sell || 0} Cash @ {inr(p.rate)}{num(p.sbc) > 0 ? ` + ${p.sbc} SBC` : ""}{num(p.dbc) > 0 ? ` + ${p.dbc} DBC` : ""}</span>
                    <span style={{ color: T.success, fontWeight: 500 }}>+{inr(subAmt)}</span>
                  </div>
                );
              })}
            </div>

            {/* Online Cylinder Sales */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Online Cylinder Sales</span>
                <span style={{fontWeight:600,color:T.blue}}>+{inr(calcs.totalOnlineSales)}</span>
              </div>
              {(entry.products || []).filter(p => num(p.online) > 0).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {productLabel(p.id, products)}: {p.online} Online @ {inr(p.rate)}</span>
                  <span style={{ color: T.blue, fontWeight: 500 }}>+{inr(num(p.online) * num(p.rate))}</span>
                </div>
              ))}
            </div>

            {/* Accessories Sales */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Accessories Sales</span>
                <span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalAccessorySales)}</span>
              </div>
              {(entry.accessories || []).filter(a => a.sold && num(a.qty) > 0).map(a => {
                const accDef = ACCESSORIES.find(x => x.id === a.accessoryId) || {};
                return (
                  <div key={a.accessoryId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                    <span>• {accDef.short || accDef.label}: {a.qty} × {inr(a.rate)}</span>
                    <span style={{ color: T.success, fontWeight: 500 }}>+{inr(num(a.qty) * num(a.rate))}</span>
                  </div>
                );
              })}
            </div>

            {/* Credit Received */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Credit Received</span>
                <span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalCreditRecoveries)}</span>
              </div>
              {(entry.creditRecoveries || []).map((cr, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {cr.customerName || "Customer"}{cr.note ? ` (${cr.note})` : ""}{num(cr.emptyReturned) > 0 ? ` [${cr.emptyReturned} empty]` : ""}</span>
                  <span style={{ color: T.success, fontWeight: 600 }}>+{inr(cr.amt)}</span>
                </div>
              ))}
            </div>

            {/* Other Cash Credit */}
            {calcs.totalOtherCashCredits > 0 && (
              <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Other Cash Credit</span>
                  <span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalOtherCashCredits)}</span>
                </div>
                {(entry.otherCashCredits || []).filter(x => num(x.amt) > 0).map((x, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                    <span>• {x.desc || "Misc Credit"}</span>
                    <span style={{ color: T.success, fontWeight: 600 }}>+{inr(x.amt)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Connection Payments (Cash) */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Connection Payments (Cash)</span>
                <span style={{fontWeight:600,color:T.success}}>+{inr(calcs.totalConnectionPaymentsCash)}</span>
              </div>
              {[...(entry.connectionNew || []).filter(x => x.mode === "cash" && num(x.amt) > 0), ...(entry.connectionPayments || []).filter(x => x.mode === "cash" && num(x.amt) > 0)].map((x, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {x.customerName || "Consumer"}: {productLabel(x.productId, products)}</span>
                  <span style={{ color: T.success, fontWeight: 600 }}>+{inr(x.amt)}</span>
                </div>
              ))}
            </div>

            {/* Connection Payments (Online) */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Connection Payments (Online) <span style={{fontSize:10,color:T.inkLight}}>not in cash</span></span>
              <span style={{fontWeight:600,color:T.blue}}>{inr(calcs.totalConnectionPaymentsOnline)}</span>
            </div>

            {/* Online -> Bank Auto-settled */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Online → Bank Auto-settled</span>
              <span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalOnlineSales)}</span>
            </div>

            {/* Office Expenses */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Office Expenses</span>
                <span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalExpenses)}</span>
              </div>
              {(entry.expenses || []).filter(x => num(x.amt) > 0).map((x, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {x.desc || "Expense"}</span>
                  <span style={{ color: T.danger, fontWeight: 600 }}>−{inr(x.amt)}</span>
                </div>
              ))}
            </div>

            {/* Connection Refunds */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Connection Surrender Refunds</span>
                <span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalConnectionRefunds)}</span>
              </div>
              {(entry.connectionRefunds || []).filter(x => num(x.amt) > 0).map((x, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {x.customerName || "Consumer"}: {productLabel(x.productId, products)}</span>
                  <span style={{ color: T.danger, fontWeight: 600 }}>−{inr(x.amt)}</span>
                </div>
              ))}
            </div>

            {/* Vehicle Expenses */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Vehicle & Fuel Expenses</span>
                <span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalVehicleExp)}</span>
              </div>
              {(entry.vehicleExpenses || []).filter(x => num(x.amt) > 0).map((x, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {x.vehicleNo || "Vehicle"} ({x.expType || "Fuel"}){x.desc ? ` · ${x.desc}` : ""}</span>
                  <span style={{ color: T.danger, fontWeight: 600 }}>−{inr(x.amt)}</span>
                </div>
              ))}
            </div>

            {/* Salary / Advance */}
            <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Salary / Advances</span>
                <span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalSalaryPayments)}</span>
              </div>
              {(entry.salaryPayments || []).filter(x => num(x.amt) > 0).map((x, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                  <span>• {x.employeeName || "Employee"} ({x.type}){x.notes ? ` · ${x.notes}` : ""}</span>
                  <span style={{ color: T.danger, fontWeight: 600 }}>−{inr(x.amt)}</span>
                </div>
              ))}
            </div>

            {/* Cheque / Online */}
            {calcs.totalCheque > 0 && (
              <div style={{padding:"6px 0",borderBottom:"1px solid #eee"}}>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:T.inkMid, fontWeight: 600}}>Cheque/Online Out</span>
                  <span style={{fontWeight:600,color:T.danger}}>-{inr(calcs.totalCheque)}</span>
                </div>
                {(entry.chequeOnline || []).filter(x => num(x.amt) > 0).map((x, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkLight, padding: "2px 0 2px 12px" }}>
                    <span>• {x.desc || "Cheque Payment"}</span>
                    <span style={{ color: T.danger, fontWeight: 600 }}>−{inr(x.amt)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* BOB Bank Deposit */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #eee", background: num(entry.bob) > 0 ? "rgba(37,99,235,0.04)" : "transparent"}}>
              <span style={{fontSize:12,color:num(entry.bob) > 0 ? "#1d4ed8" : T.inkMid, fontWeight: num(entry.bob) > 0 ? 700 : 600}}>
                🏦 BOB Bank Deposit (−)
              </span>
              <span style={{fontWeight:700,color:num(entry.bob) > 0 ? T.danger : T.inkLight}}>
                −{inr(num(entry.bob))}
              </span>
            </div>

            {/* Closing Cash on Hand */}
            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0 4px",marginTop:8,borderTop:"2px solid #e2e8f0"}}>
              <span style={{fontSize:12,fontWeight:700,color:T.inkMid}}>CASH ON HAND (Closing)</span>
              <span style={{fontFamily:"'Outfit',sans-serif",fontSize:20,fontWeight:700,color:calcs.cashOnHand<0?T.danger:T.success}}>
                {inr(calcs.cashOnHand)}
              </span>
            </div>
          </div>
        </div>

        {/* Itemized Cards Column */}
        <div style={{display:"flex", flexDirection:"column", gap: 14}}>
          {/* General Expenses */}
          <div className="card">
            <div className="card-head"><span className="card-head-title">🧾 Office Expenses</span><span style={{fontWeight:700,color:T.danger}}>{inr(calcs.totalExpenses)}</span></div>
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

          {/* Vehicle & Fuel Expenses */}
          {(entry.vehicleExpenses || []).some(x => x.vehicleNo || x.amt || x.desc) && (
            <div className="card">
              <div className="card-head">
                <span className="card-head-title">🚚 Vehicle & Fuel Expenses</span>
                <span style={{ fontWeight: 700, color: T.danger }}>{inr(calcs.totalVehicleExp)}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Vehicle No</th><th>Type / Desc</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {(entry.vehicleExpenses || []).filter(x => x.vehicleNo || x.amt || x.desc).map((x, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{x.vehicleNo || "—"}</td>
                        <td style={{ color: T.inkMid }}>{x.expType || "Fuel"}{x.desc ? ` · ${x.desc}` : ""}</td>
                        <td style={{ fontWeight: 600, color: T.danger, textAlign: "right" }}>{inr(x.amt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Salary Payments */}
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

          {/* Credit Recoveries Received */}
          {(entry.creditRecoveries || []).length > 0 && (
            <div className="card">
              <div className="card-head">
                <span className="card-head-title">📥 Credit Recoveries Received</span>
                <span style={{ fontWeight: 700, color: T.success }}>+{inr(calcs.totalCreditRecoveries)}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead><tr><th>Customer</th><th>Note / Empties</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                  <tbody>
                    {(entry.creditRecoveries || []).map((x, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{x.customerName || "Customer"}</td>
                        <td style={{ color: T.inkMid, fontSize: 12 }}>
                          {x.note || "Settlement"}
                          {num(x.emptyReturned) > 0 && <span style={{ color: "#e67e22", marginLeft: 6 }}>({x.emptyReturned} empty returned)</span>}
                        </td>
                        <td style={{ fontWeight: 600, color: T.success, textAlign: "right" }}>+{inr(x.amt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Connections */}
          {((entry.connectionNew||[]).length > 0 || (entry.connectionPayments||[]).length > 0 || (entry.connectionRefunds||[]).length > 0) && (
            <div className="card">
              <div className="card-head"><span className="card-head-title">🔗 Connections</span><span style={{fontWeight:700,color:T.success}}>+{inr(calcs.totalConnectionPaymentsCash)} <span style={{color:T.danger}}>−{inr(calcs.totalConnectionRefunds)}</span></span></div>
              <div style={{overflowX:"auto"}}>
                <table className="tbl">
                  <thead><tr><th>Event</th><th>Product · Qty</th><th>Stock</th><th style={{ textAlign: "right" }}>Cash</th></tr></thead>
                  <tbody>
                    {(entry.connectionNew||[]).map(x=><tr key={"n"+x.id}><td><span className="badge badge-ink">{x.mode ? `New · ${x.mode === "cash" ? "Cash" : "Online"}` : "New"}</span></td><td style={{fontWeight:600}}>{productLabel(x.productId, products)} × {x.qty} {x.connectionType}</td><td style={{fontSize:11,color:T.danger}}>−{x.cylindersOut} filled</td><td style={{fontWeight:num(x.amt)>0?600:400,color:x.mode==="cash"?T.success:x.mode==="online"?T.blue:T.inkLight, textAlign:"right", fontSize:num(x.amt)>0?12:11}}>{num(x.amt)>0?(x.mode==="cash"?"+":"")+inr(x.amt):"—"}</td></tr>)}
                    {(entry.connectionPayments||[]).map(x=><tr key={"p"+x.id}><td><span className="badge badge-blue">{x.mode==="cash"?"Add. Bottle · Cash":"Add. Bottle · Online"}</span></td><td style={{fontWeight:600}}>{productLabel(x.productId, products)} × {x.qty}</td><td style={{fontSize:11,color:T.danger}}>−{x.qty} filled</td><td style={{fontWeight:600,color:x.mode==="cash"?T.success:T.blue, textAlign:"right"}}>{x.mode==="cash"?"+":""}{inr(x.amt)}</td></tr>)}
                    {(entry.connectionRefunds||[]).map(x=><tr key={"r"+x.id}><td><span className="badge badge-danger">Surrender</span></td><td style={{fontWeight:600}}>{productLabel(x.productId, products)} × {x.qty}<div style={{fontSize:10,color:T.inkLight}}>{num(x.penaltyDeducted)>0?`refund ${inr(x.refundAmount)} − penalty ${inr(x.penaltyDeducted)}`:""}</div></td><td style={{fontSize:11}}><span style={{color:T.success}}>+{x.cylindersQty} empty</span>{num(x.cylindersMissing)>0 && <span style={{color:T.warn}}> · {x.cylindersMissing} missing</span>}</td><td style={{fontWeight:600,color:T.danger, textAlign:"right"}}>-{inr(x.amt)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Credit Sales */}
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

          {/* Bank of Baroda Deposit Card */}
          {num(entry.bob) > 0 && (
            <div className="card" style={{ borderLeft: "4px solid #2563eb", background: "rgba(37,99,235,0.02)" }}>
              <div className="card-head">
                <span className="card-head-title" style={{ color: "#1d4ed8" }}>🏦 Bank of Baroda (BOB) Deposit</span>
                <span style={{ fontWeight: 800, color: "#1d4ed8", fontSize: 16 }}>{inr(num(entry.bob))}</span>
              </div>
              <div className="card-body" style={{ padding: "10px 16px", fontSize: 12, color: T.inkMid }}>
                <span>Amount deposited to BOB Bank account on {fmtDate(entry.date)}: </span>
                <strong style={{ color: T.ink }}>{inr(num(entry.bob))}</strong>
                <div style={{ fontSize: 11, color: T.inkLight, marginTop: 4 }}>
                  Deducted from cash-on-hand closing drawer balance.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Complete All Financial Transactions Audit Ledger */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <span className="card-head-title">📑 All Financial Transactions Audit Journal ({fmtDate(entry.date)})</span>
            <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
              Detailed ledger of all receipts, sales collections, operating expenses, and bank transfers
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              className="inp"
              placeholder="🔍 Search transactions..."
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              style={{ padding: "5px 10px", fontSize: 12, width: 170 }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {[
                ["all", `All (${allTransactions.length})`],
                ["in", `Inflows (+)`],
                ["out", `Outflows (−)`],
                ["cash", `Cash Drawer`],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={txFilter === k ? "btn" : "btn-ghost"}
                  onClick={() => setTxFilter(k)}
                  style={{ padding: "5px 10px", fontSize: 11, fontWeight: 700 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>#</th>
                <th>Category</th>
                <th>Transaction Particulars & Details</th>
                <th>Party / Source</th>
                <th style={{ textAlign: "center" }}>Mode</th>
                <th style={{ textAlign: "right" }}>Inflow (+)</th>
                <th style={{ textAlign: "right" }}>Outflow (−)</th>
                <th style={{ textAlign: "right" }}>Cash Drawer Impact</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "24px 12px", color: T.inkLight }}>
                    No transactions matching the selected filter.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx, idx) => (
                  <tr key={tx.id || idx}>
                    <td style={{ textAlign: "center", color: T.inkLight, fontSize: 11 }}>{idx + 1}</td>
                    <td>
                      <span className={`badge ${tx.badgeClass}`} style={{ fontSize: 10, padding: "3px 7px" }}>
                        {tx.category}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: T.ink }}>{tx.desc}</td>
                    <td style={{ color: T.inkMid, fontSize: 12 }}>{tx.party}</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: tx.mode === "Cash" ? T.ink : T.blue }}>
                        {tx.mode}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", color: T.success, fontWeight: 600 }}>
                      {tx.flow === "in" ? `+${inr(tx.amount)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", color: T.danger, fontWeight: 600 }}>
                      {tx.flow === "out" ? `−${inr(tx.amount)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: tx.cashImpact > 0 ? T.success : tx.cashImpact < 0 ? T.danger : T.inkLight }}>
                      {tx.cashImpact > 0 ? `+${inr(tx.cashImpact)}` : tx.cashImpact < 0 ? `−${inr(Math.abs(tx.cashImpact))}` : "0 (Direct Bank)"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: "#f8fafc", fontWeight: 700, borderTop: `2px solid ${T.border}` }}>
                <td colSpan={5} style={{ textAlign: "right", textTransform: "uppercase", fontSize: 11, color: T.inkLight }}>
                  Total Day Cash on Hand:
                </td>
                <td style={{ textAlign: "right", color: T.success, fontSize: 13 }}>
                  +{inr(totalInflows)}
                </td>
                <td style={{ textAlign: "right", color: T.danger, fontSize: 13 }}>
                  −{inr(totalOutflows)}
                </td>
                <td style={{ textAlign: "right", color: calcs.cashOnHand < 0 ? T.danger : T.success, fontSize: 15, fontWeight: 800 }}>
                  {inr(calcs.cashOnHand)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AdminSalaryReport(props) {
  return <SharedSalaryReport {...props} isAdmin={true} />;
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 700 }}>{editId ? "✏️ Edit Vehicle" : "🚛 Add New Vehicle"}</div></div><button className="btn-icon" onClick={closeModal}>×</button></div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 20, fontWeight: 700 }}>{editId ? "✏️ Edit Employee" : "👤 Add New Employee"}</div></div><button className="btn-icon" onClick={closeModal}>×</button></div>
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
