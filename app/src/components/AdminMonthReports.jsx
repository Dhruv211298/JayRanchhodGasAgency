import React, { useState, useEffect, useMemo } from "react";
import { T } from "../styles";
import {
  PRODUCTS,
  ACCESSORIES,
  todayStr,
  fmtDate,
  fmtMonth,
  inr,
  num,
  getCommRate,
  calcEntry,
  productLabel,
} from "../constants";

// System went live in August 2026
const SYSTEM_START_MONTH = "2026-08";

export default function AdminMonthReports({
  entries = [],
  commissions = [],
  products = PRODUCTS,
  deliveryBoys = [],
  isAdmin = true,
  onNavigate = null,
  onViewDay = null,
}) {
  const curMonthStr = todayStr().slice(0, 7);

  // Discover all months available in entries (anchored to >= 2026-08)
  const availableMonths = useMemo(() => {
    const monthSet = new Set();
    monthSet.add(curMonthStr);
    monthSet.add(SYSTEM_START_MONTH);
    (entries || []).forEach((e) => {
      if (e.date && e.date.length >= 7) {
        const m = e.date.slice(0, 7);
        if (m >= SYSTEM_START_MONTH) {
          monthSet.add(m);
        }
      }
    });
    return Array.from(monthSet).sort().reverse();
  }, [entries, curMonthStr]);

  // Default to current month or latest month available
  const [selMonth, setSelMonth] = useState(() => {
    return availableMonths[0] || curMonthStr;
  });

  const [txFilter, setTxFilter] = useState("all");
  const [txSearch, setTxSearch] = useState("");

  // Month navigation handlers
  const changeMonth = (delta) => {
    const [yStr, mStr] = selMonth.split("-");
    const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1 + delta, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const nextMonth = `${yyyy}-${mm}`;

    if (nextMonth < SYSTEM_START_MONTH) return;
    if (nextMonth > curMonthStr) return;
    setSelMonth(nextMonth);
  };

  // Filter entries for the selected month, sorted chronologically
  const monthEntries = useMemo(() => {
    return (entries || [])
      .filter((e) => e.date && e.date.startsWith(selMonth))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, selMonth]);

  // Key monthly financial rollups
  const mCalcs = useMemo(() => {
    if (monthEntries.length === 0) {
      return {
        hasData: false,
        daysCount: 0,
        openingCash: 0,
        closingCash: 0,
        totalSales: 0,
        totalCashSales: 0,
        totalOnlineSales: 0,
        totalAccessorySales: 0,
        totalCylindersSold: 0,
        totalCommission: 0,
        totalBob: 0,
        totalOfficeExp: 0,
        totalVehicleExp: 0,
        totalSalaryPaid: 0,
        totalOperatingExp: 0,
        totalCreditRecoveries: 0,
        totalOtherCashCredits: 0,
        totalCreditGiven: 0,
        totalConnCash: 0,
        totalConnOnline: 0,
        totalConnRefunds: 0,
        totalChequeOut: 0,
        operatingProfit: 0,
      };
    }

    const firstEntry = monthEntries[0];
    const lastEntry = monthEntries[monthEntries.length - 1];

    const openingCash = num(firstEntry.openingCash);
    const closingCash = calcEntry(lastEntry).cashOnHand;

    let totalCylSales = 0;
    let totalCashSales = 0;
    let totalOnlineSales = 0;
    let totalAccessorySales = 0;
    let totalCylindersSold = 0;
    let totalCommission = 0;
    let totalBob = 0;
    let totalOfficeExp = 0;
    let totalVehicleExp = 0;
    let totalSalaryPaid = 0;
    let totalCreditRecoveries = 0;
    let totalOtherCashCredits = 0;
    let totalCreditGiven = 0;
    let totalConnCash = 0;
    let totalConnOnline = 0;
    let totalConnRefunds = 0;
    let totalChequeOut = 0;

    monthEntries.forEach((e) => {
      const c = calcEntry(e);
      totalCylSales += c.totalSales;
      totalCashSales += c.totalCashSales;
      totalOnlineSales += c.totalOnlineSales;
      totalAccessorySales += c.totalAccessorySales;
      totalBob += num(e.bob);
      totalOfficeExp += c.totalExpenses;
      totalVehicleExp += c.totalVehicleExp;
      totalSalaryPaid += c.totalSalaryPayments;
      totalCreditRecoveries += c.totalCreditRecoveries;
      totalOtherCashCredits += c.totalOtherCashCredits;
      totalCreditGiven += c.totalCredit;
      totalConnCash += c.totalConnectionPaymentsCash;
      totalConnOnline += c.totalConnectionPaymentsOnline;
      totalConnRefunds += c.totalConnectionRefunds;
      totalChequeOut += c.totalCheque;

      (e.products || []).forEach((p) => {
        const sold = num(p.sell) + num(p.online);
        totalCylindersSold += sold;
        totalCommission += sold * getCommRate(p.id, commissions, e.date);
      });
    });

    const totalOperatingExp = totalOfficeExp + totalVehicleExp + totalSalaryPaid;
    const operatingProfit = totalCommission + totalAccessorySales - totalOperatingExp;

    return {
      hasData: true,
      daysCount: monthEntries.length,
      openingCash,
      closingCash,
      totalSales: totalCylSales + totalAccessorySales,
      totalCashSales,
      totalOnlineSales,
      totalAccessorySales,
      totalCylindersSold,
      totalCommission,
      totalBob,
      totalOfficeExp,
      totalVehicleExp,
      totalSalaryPaid,
      totalOperatingExp,
      totalCreditRecoveries,
      totalOtherCashCredits,
      totalCreditGiven,
      totalConnCash,
      totalConnOnline,
      totalConnRefunds,
      totalChequeOut,
      operatingProfit,
    };
  }, [monthEntries, commissions]);

  // Product breakdown aggregated across the whole month
  const monthlyProducts = useMemo(() => {
    return (products || PRODUCTS).map((p) => {
      let cashSell = 0;
      let onlineSell = 0;
      let sbc = 0;
      let dbc = 0;
      let rev = 0;
      let comm = 0;

      monthEntries.forEach((e) => {
        const prodEntry = (e.products || []).find((x) => x.id === p.id);
        if (!prodEntry) return;

        const cSell = num(prodEntry.sell);
        const oSell = num(prodEntry.online);
        const sbcQty = num(prodEntry.sbc);
        const dbcQty = num(prodEntry.dbc);
        const rate = num(prodEntry.rate);
        const sbcRate = num(prodEntry.sbcRate);
        const dbcRate = num(prodEntry.dbcRate);

        cashSell += cSell;
        onlineSell += oSell;
        sbc += sbcQty;
        dbc += dbcQty;

        rev += cSell * rate + oSell * rate + sbcQty * sbcRate + dbcQty * dbcRate;
        comm += (cSell + oSell) * getCommRate(p.id, commissions, e.date);
      });

      const totalSold = cashSell + onlineSell + sbc + dbc;
      const firstProd = monthEntries[0]?.products?.find((x) => x.id === p.id);
      const lastProd = monthEntries[monthEntries.length - 1]?.products?.find((x) => x.id === p.id);

      const openingStock = firstProd ? num(firstProd.opening) : 0;
      const closingStock = lastProd ? num(lastProd.closing) : 0;

      return {
        id: p.id,
        label: p.label,
        short: p.short || p.label,
        cashSell,
        onlineSell,
        sbc,
        dbc,
        totalSold,
        rev,
        comm,
        openingStock,
        closingStock,
      };
    });
  }, [products, monthEntries, commissions]);

  // Accessories sold across the whole month
  const monthlyAccessories = useMemo(() => {
    return ACCESSORIES.map((acc) => {
      let totalQty = 0;
      let totalRev = 0;
      let lastRate = 0;

      monthEntries.forEach((e) => {
        const item = (e.accessories || []).find(
          (a) => a.accessoryId === acc.id && a.sold && num(a.qty) > 0
        );
        if (item) {
          totalQty += num(item.qty);
          totalRev += num(item.qty) * num(item.rate);
          lastRate = num(item.rate);
        }
      });

      return {
        id: acc.id,
        label: acc.label,
        short: acc.short || acc.label,
        qty: totalQty,
        rate: lastRate,
        rev: totalRev,
      };
    }).filter((a) => a.qty > 0);
  }, [monthEntries]);

  // Delivery boys breakdown across the whole month
  const monthlyDeliveryBoys = useMemo(() => {
    const boysMap = {};

    monthEntries.forEach((e) => {
      Object.entries(e.delivery || {}).forEach(([boyName, val]) => {
        if (!boysMap[boyName]) {
          boysMap[boyName] = { name: boyName, cash: 0, online: 0, total: 0 };
        }
        if (val && typeof val === "object") {
          const c = num(val.cash);
          const o = num(val.online);
          boysMap[boyName].cash += c;
          boysMap[boyName].online += o;
          boysMap[boyName].total += c + o;
        } else {
          const q = num(val);
          boysMap[boyName].cash += q;
          boysMap[boyName].total += q;
        }
      });
    });

    const list = Object.values(boysMap).filter((b) => b.total > 0);
    const allDelivs = list.reduce((s, b) => s + b.total, 0);

    return list
      .map((b) => ({
        ...b,
        sharePct: allDelivs > 0 ? Math.round((b.total / allDelivs) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [monthEntries]);

  // All itemized financial transactions across the month for audit
  const allMonthTransactions = useMemo(() => {
    const list = [];

    monthEntries.forEach((e) => {
      const dateStr = e.date;

      // 1. Cash Sales
      (e.products || []).forEach((p) => {
        const cashSell = num(p.sell);
        const sbc = num(p.sbc);
        const dbc = num(p.dbc);
        const rev = cashSell * num(p.rate) + sbc * num(p.sbcRate) + dbc * num(p.dbcRate);
        if (rev > 0) {
          list.push({
            id: `tx-${dateStr}-prod-cash-${p.id}`,
            date: dateStr,
            category: "Cylinder Sales (Cash)",
            party: "Counter / Delivery",
            desc: `${productLabel(p.id, products)}: ${cashSell} sold${sbc > 0 ? ` + ${sbc} SBC` : ""}${dbc > 0 ? ` + ${dbc} DBC` : ""}`,
            mode: "Cash",
            flow: "in",
            amount: rev,
            cashImpact: rev,
            badgeClass: "badge-success",
          });
        }
      });

      // 2. Online Sales
      (e.products || []).forEach((p) => {
        const onlineSell = num(p.online);
        const rev = onlineSell * num(p.rate);
        if (rev > 0) {
          list.push({
            id: `tx-${dateStr}-prod-online-${p.id}`,
            date: dateStr,
            category: "Cylinder Sales (Online)",
            party: "Customer (UPI / QR)",
            desc: `${productLabel(p.id, products)}: ${onlineSell} sold online (Direct Bank)`,
            mode: "Online",
            flow: "in",
            amount: rev,
            cashImpact: 0,
            badgeClass: "badge-blue",
          });
        }
      });

      // 3. Accessories Sales
      (e.accessories || [])
        .filter((a) => a.sold && num(a.qty) > 0)
        .forEach((a) => {
          const accDef = ACCESSORIES.find((x) => x.id === a.accessoryId) || {};
          const amt = num(a.qty) * num(a.rate);
          list.push({
            id: `tx-${dateStr}-acc-${a.accessoryId}`,
            date: dateStr,
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

      // 4. Credit Recoveries
      (e.creditRecoveries || [])
        .filter((cr) => num(cr.amt) > 0)
        .forEach((cr, idx) => {
          list.push({
            id: `tx-${dateStr}-rec-${idx}`,
            date: dateStr,
            category: "Credit Received",
            party: cr.customerName || "Customer",
            desc: `Credit settlement${cr.note ? ` (${cr.note})` : ""}${num(cr.emptyReturned) > 0 ? ` · ${cr.emptyReturned} empty returned` : ""}`,
            mode: "Cash",
            flow: "in",
            amount: num(cr.amt),
            cashImpact: num(cr.amt),
            badgeClass: "badge-success",
          });
        });

      // 5. Other Cash Credits
      (e.otherCashCredits || [])
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          list.push({
            id: `tx-${dateStr}-occ-${idx}`,
            date: dateStr,
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

      // 6. Connection Payments
      [...(e.connectionNew || []), ...(e.connectionPayments || [])]
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          const isCash = x.mode === "cash";
          list.push({
            id: `tx-${dateStr}-conn-${idx}`,
            date: dateStr,
            category: isCash ? "Connection (Cash)" : "Connection (Online)",
            party: x.customerName || "Consumer",
            desc: `Connection: ${productLabel(x.productId, products)} (${x.qty || 1} cyl) · ${isCash ? "Cash" : "Online"}`,
            mode: isCash ? "Cash" : "Online",
            flow: "in",
            amount: num(x.amt),
            cashImpact: isCash ? num(x.amt) : 0,
            badgeClass: isCash ? "badge-success" : "badge-blue",
          });
        });

      // 7. Connection Refunds
      (e.connectionRefunds || [])
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          list.push({
            id: `tx-${dateStr}-cref-${idx}`,
            date: dateStr,
            category: "Connection Refund",
            party: x.customerName || "Consumer",
            desc: `SV Surrender: ${productLabel(x.productId, products)}${num(x.penaltyDeducted) > 0 ? ` (Deduction ${inr(x.penaltyDeducted)})` : ""}`,
            mode: "Cash",
            flow: "out",
            amount: num(x.amt),
            cashImpact: -num(x.amt),
            badgeClass: "badge-danger",
          });
        });

      // 8. Office Expenses
      (e.expenses || [])
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          list.push({
            id: `tx-${dateStr}-exp-${idx}`,
            date: dateStr,
            category: "Office Expense",
            party: "Office / Shop",
            desc: x.desc || "Office Expense",
            mode: "Cash",
            flow: "out",
            amount: num(x.amt),
            cashImpact: -num(x.amt),
            badgeClass: "badge-danger",
          });
        });

      // 9. Vehicle & Fuel Expenses
      (e.vehicleExpenses || [])
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          list.push({
            id: `tx-${dateStr}-veh-${idx}`,
            date: dateStr,
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

      // 10. Salary & Advances
      (e.salaryPayments || [])
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          list.push({
            id: `tx-${dateStr}-sal-${idx}`,
            date: dateStr,
            category: "Salary / Advance",
            party: x.employeeName || "Staff",
            desc: `${x.type || "Salary"}${x.forMonth ? ` for ${fmtMonth(x.forMonth + "-01")}` : ""}${x.notes ? ` · ${x.notes}` : ""}`,
            mode: "Cash",
            flow: "out",
            amount: num(x.amt),
            cashImpact: -num(x.amt),
            badgeClass: "badge-danger",
          });
        });

      // 11. Cheque / Online Disbursed
      (e.chequeOnline || [])
        .filter((x) => num(x.amt) > 0)
        .forEach((x, idx) => {
          list.push({
            id: `tx-${dateStr}-chk-${idx}`,
            date: dateStr,
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

      // 12. BOB Bank Deposit
      if (num(e.bob) > 0) {
        list.push({
          id: `tx-${dateStr}-bob`,
          date: dateStr,
          category: "BOB Bank Deposit",
          party: "Bank of Baroda",
          desc: `Cash drawer deposit into Bank of Baroda on ${fmtDate(dateStr)}`,
          mode: "Bank Deposit",
          flow: "out",
          amount: num(e.bob),
          cashImpact: -num(e.bob),
          badgeClass: "badge-blue",
        });
      }
    });

    return list;
  }, [monthEntries, products]);

  // Filtered transactions for search & tabs
  const filteredTransactions = useMemo(() => {
    return allMonthTransactions.filter((tx) => {
      if (txFilter === "in" && tx.flow !== "in") return false;
      if (txFilter === "out" && tx.flow !== "out") return false;
      if (txFilter === "cash" && tx.cashImpact === 0) return false;
      if (txFilter === "bank" && !["Online", "Bank Deposit", "Cheque/Online"].includes(tx.mode))
        return false;
      if (txSearch) {
        const q = txSearch.toLowerCase();
        const match =
          tx.category.toLowerCase().includes(q) ||
          tx.desc.toLowerCase().includes(q) ||
          tx.party.toLowerCase().includes(q) ||
          tx.date.toLowerCase().includes(q) ||
          String(tx.amount).includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [allMonthTransactions, txFilter, txSearch]);

  const totalInflows = allMonthTransactions
    .filter((t) => t.cashImpact > 0)
    .reduce((s, t) => s + t.cashImpact, 0);

  const totalOutflows = allMonthTransactions
    .filter((t) => t.cashImpact < 0)
    .reduce((s, t) => s + Math.abs(t.cashImpact), 0);

  // CSV Export
  const exportCSV = () => {
    const rows = [
      ["JAY RANCHHOD GAS AGENCY - MONTHLY BUSINESS REPORT"],
      [`Month: ${fmtMonth(selMonth + "-01")}`, `Exported: ${todayStr()}`],
      [],
      ["1. MONTHLY FINANCIAL SUMMARY"],
      ["Metric", "Amount (₹)"],
      ["Total Gross Sales", mCalcs.totalSales],
      ["Bank of Baroda (BOB) Deposits", mCalcs.totalBob],
      ["Closing Cash on Hand", mCalcs.closingCash],
      ["Total Cylinders Sold", mCalcs.totalCylindersSold],
      ["Total Agency Commission", mCalcs.totalCommission],
      ["Total Operating Expenses", mCalcs.totalOperatingExp],
      ["Real Operating Profit", mCalcs.operatingProfit],
      [],
      ["2. DAILY BREAKDOWN"],
      [
        "Date",
        "Cylinders Sold",
        "Turnover (₹)",
        "Expenses (₹)",
        "Commission (₹)",
        "BOB Deposit (₹)",
        "Closing Cash (₹)",
      ],
      ...monthEntries.map((e) => {
        const c = calcEntry(e);
        const cyl = (e.products || []).reduce((s, p) => s + num(p.sell) + num(p.online), 0);
        const comm = (e.products || []).reduce(
          (s, p) => s + (num(p.sell) + num(p.online)) * getCommRate(p.id, commissions, e.date),
          0
        );
        const exp = c.totalExpenses + c.totalVehicleExp + c.totalSalaryPayments;
        return [
          e.date,
          cyl,
          c.totalSales + c.totalAccessorySales,
          exp,
          comm,
          num(e.bob),
          c.cashOnHand,
        ];
      }),
      [],
      ["3. PRODUCTS SOLD BREAKDOWN"],
      ["Product", "Cash Sold", "Online Sold", "Total Sold", "Revenue (₹)", "Commission (₹)"],
      ...monthlyProducts.map((p) => [
        p.label,
        p.cashSell,
        p.onlineSell,
        p.totalSold,
        p.rev,
        p.comm,
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Month_Report_${selMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fade-in">
      {/* Month Navigation Control Bar */}
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
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "7px 12px", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => changeMonth(-1)}
            disabled={selMonth <= SYSTEM_START_MONTH}
            title="Previous Month"
          >
            ◀ Prev Month
          </button>

          <input
            type="month"
            className="inp"
            style={{ width: 175, fontWeight: 700, textAlign: "center", fontSize: 13 }}
            value={selMonth}
            min={SYSTEM_START_MONTH}
            max={curMonthStr}
            onChange={(e) => e.target.value && setSelMonth(e.target.value)}
          />

          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "7px 12px", display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => changeMonth(1)}
            disabled={selMonth >= curMonthStr}
            title="Next Month"
          >
            Next Month ▶
          </button>

          <button
            type="button"
            className="btn-ghost"
            style={{
              padding: "7px 14px",
              background: selMonth === curMonthStr ? "rgba(234, 88, 12, 0.08)" : "transparent",
              color: selMonth === curMonthStr ? T.accent : T.ink,
              borderColor: selMonth === curMonthStr ? T.accent : T.border,
              fontWeight: 700,
            }}
            onClick={() => setSelMonth(curMonthStr)}
          >
            📅 This Month
          </button>

          {availableMonths.length > 0 && (
            <select
              className="inp"
              value={selMonth}
              onChange={(e) => e.target.value && setSelMonth(e.target.value)}
              style={{ maxWidth: 210, fontSize: 13, fontWeight: 600 }}
            >
              {availableMonths.map((m) => {
                const count = entries.filter((e) => e.date && e.date.startsWith(m)).length;
                return (
                  <option key={m} value={m}>
                    {fmtMonth(m + "-01")} {count > 0 ? `(${count} days)` : ""}
                    {m === curMonthStr ? " (Current)" : ""}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {mCalcs.hasData ? (
            <>
              <span className="badge badge-success" style={{ fontSize: 12, padding: "5px 10px" }}>
                ● {mCalcs.daysCount} Daily Entries Recorded
              </span>
              {mCalcs.totalBob > 0 && (
                <span
                  className="badge"
                  style={{
                    background: "rgba(37,99,235,0.08)",
                    color: "#1d4ed8",
                    border: "1px solid rgba(37,99,235,0.25)",
                    fontSize: 12,
                    padding: "5px 10px",
                    fontWeight: 700,
                  }}
                >
                  🏦 BOB Total: {inr(mCalcs.totalBob)}
                </span>
              )}
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
                  borderColor: T.accent,
                  fontWeight: 700,
                }}
                onClick={exportCSV}
                title="Download CSV report"
              >
                📥 Export CSV
              </button>
            </>
          ) : (
            <span
              className="badge"
              style={{
                background: "#fef3c7",
                color: "#b45309",
                border: "1px solid #fde68a",
                fontSize: 12,
                padding: "5px 10px",
              }}
            >
              ○ No Entries recorded for this month
            </span>
          )}
        </div>
      </div>

      {!mCalcs.hasData ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: "48px 24px",
            background: "#ffffff",
            border: "1px dashed #cbd5e1",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 6 }}>
            No Daily Entries Found for {fmtMonth(selMonth + "-01")}
          </div>
          <div style={{ fontSize: 13, color: T.inkLight, maxWidth: 460, margin: "0 auto 20px" }}>
            No daily sales, plant deliveries, or cash drawer closing entries have been recorded for this month.
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
                fontSize: 14,
              }}
              onClick={() => onNavigate(isAdmin ? "admin-entry" : "entry")}
            >
              <span>📝</span> Open Daily Entry →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Top Monthly Metric Cards */}
          <div className="stat-row">
            <div className="stat-card" style={{ "--kpi-color": T.success }}>
              <div className="stat-val" style={{ color: T.success }}>{inr(mCalcs.totalSales)}</div>
              <div className="stat-lbl">Total Month Sales</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
                Turnover across {mCalcs.daysCount} days
              </div>
            </div>

            <div className="stat-card" style={{ "--kpi-color": "#2563eb" }}>
              <div
                className="stat-val"
                style={{ color: mCalcs.totalBob > 0 ? "#2563eb" : T.inkMid }}
              >
                {inr(mCalcs.totalBob)}
              </div>
              <div className="stat-lbl">BOB Bank Deposits</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
                Total cash banked in BOB
              </div>
            </div>

            <div
              className="stat-card"
              style={{ "--kpi-color": mCalcs.closingCash < 0 ? T.danger : T.ink }}
            >
              <div
                className="stat-val"
                style={{ color: mCalcs.closingCash < 0 ? T.danger : T.ink }}
              >
                {inr(mCalcs.closingCash)}
              </div>
              <div className="stat-lbl">Cash on Hand (Month End)</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
                Latest drawer balance
              </div>
            </div>

            <div className="stat-card" style={{ "--kpi-color": T.blue }}>
              <div className="stat-val" style={{ color: T.blue }}>{mCalcs.totalCylindersSold}</div>
              <div className="stat-lbl">Cylinders Sold</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
                Cash + Online refills & connections
              </div>
            </div>

            <div className="stat-card" style={{ "--kpi-color": T.accent }}>
              <div className="stat-val" style={{ color: T.accent }}>{inr(mCalcs.totalCommission)}</div>
              <div className="stat-lbl">Agency Commission</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
                Gross cylinder commission
              </div>
            </div>

            <div
              className="stat-card"
              style={{ "--kpi-color": mCalcs.operatingProfit >= 0 ? T.success : T.danger }}
            >
              <div
                className="stat-val"
                style={{ color: mCalcs.operatingProfit >= 0 ? T.success : T.danger }}
              >
                {mCalcs.operatingProfit >= 0 ? "+" : "−"}{inr(Math.abs(mCalcs.operatingProfit))}
              </div>
              <div className="stat-lbl">Operating Surplus</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10 }}>
                Comm + Acc − All Operating Exp
              </div>
            </div>
          </div>

          {/* Products Sold & Stock Movement Table */}
          <div className="card">
            <div
              className="card-head"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span className="card-head-title">🛢️ Products Sold & Stock Summary ({fmtMonth(selMonth + "-01")})</span>
              <span style={{ fontSize: 12, color: T.inkLight, fontWeight: 600 }}>
                {mCalcs.daysCount} days aggregated
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: "right" }}>Opening Stock</th>
                    <th style={{ textAlign: "right" }}>Cash Sold</th>
                    <th style={{ textAlign: "right" }}>Online Sold</th>
                    <th style={{ textAlign: "right" }}>New Conn (SBC/DBC)</th>
                    <th style={{ textAlign: "right" }}>Total Sold</th>
                    <th style={{ textAlign: "right" }}>Closing Stock</th>
                    <th style={{ textAlign: "right" }}>Revenue</th>
                    <th style={{ textAlign: "right" }}>Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyProducts.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.label}</td>
                      <td style={{ textAlign: "right", color: T.inkMid }}>{p.openingStock}</td>
                      <td style={{ textAlign: "right", color: T.ink }}>{p.cashSell}</td>
                      <td style={{ textAlign: "right", color: T.blue }}>{p.onlineSell}</td>
                      <td style={{ textAlign: "right", color: p.sbc + p.dbc > 0 ? T.accent : T.inkLight }}>
                        {p.sbc + p.dbc > 0 ? `${p.sbc} SBC / ${p.dbc} DBC` : "—"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{p.totalSold}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: p.closingStock < 10 ? T.danger : T.ink }}>
                        {p.closingStock}
                      </td>
                      <td style={{ color: T.success, fontWeight: 600, textAlign: "right" }}>{inr(p.rev)}</td>
                      <td style={{ color: T.accent, fontWeight: 600, textAlign: "right" }}>{inr(p.comm)}</td>
                    </tr>
                  ))}

                  {monthlyAccessories.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>🔧 {a.label}</td>
                      <td style={{ textAlign: "right", color: T.inkLight }}>—</td>
                      <td style={{ textAlign: "right", color: T.ink }}>{a.qty}</td>
                      <td style={{ textAlign: "right", color: T.inkLight }}>—</td>
                      <td style={{ textAlign: "right", color: T.inkLight }}>—</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{a.qty}</td>
                      <td style={{ textAlign: "right", color: T.inkLight }}>—</td>
                      <td style={{ color: T.success, fontWeight: 600, textAlign: "right" }}>{inr(a.rev)}</td>
                      <td style={{ color: T.inkLight, textAlign: "right" }}>—</td>
                    </tr>
                  ))}

                  <tr className="tbl-total">
                    <td colSpan={5} style={{ textTransform: "uppercase", fontSize: 11, textAlign: "right" }}>
                      Month Total
                    </td>
                    <td style={{ textAlign: "right", fontSize: 14, fontWeight: 800 }}>
                      {mCalcs.totalCylindersSold}
                    </td>
                    <td style={{ textAlign: "right" }}>—</td>
                    <td style={{ color: T.success, fontSize: 14, textAlign: "right", fontWeight: 800 }}>
                      {inr(mCalcs.totalSales)}
                    </td>
                    <td style={{ color: T.accent, fontSize: 14, textAlign: "right", fontWeight: 800 }}>
                      {inr(mCalcs.totalCommission)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Grid: Financials Details Table + Departmental Breakdown Cards */}
          <div className="g2">
            {/* Financials Details Table Card */}
            <div className="card">
              <div
                className="card-head"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span className="card-head-title">💰 Financials Details Table (Month Total)</span>
                <span className="badge badge-ink" style={{ fontSize: 11 }}>
                  {allMonthTransactions.length} Transactions
                </span>
              </div>
              <div className="card-body" style={{ padding: "10px 16px" }}>
                {/* Opening Cash */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                    Opening Cash (Start of Month)
                  </span>
                  <span style={{ fontWeight: 600 }}>{inr(mCalcs.openingCash)}</span>
                </div>

                {/* Cash Cylinder Sales */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Cash Cylinder Sales
                    </span>
                    <span style={{ fontWeight: 600, color: T.success }}>
                      +{inr(mCalcs.totalCashSales)}
                    </span>
                  </div>
                  {monthlyProducts
                    .filter((p) => p.cashSell > 0 || p.sbc > 0 || p.dbc > 0)
                    .map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: T.inkLight,
                          padding: "2px 0 2px 12px",
                        }}
                      >
                        <span>
                          • {p.short}: {p.cashSell} Cash
                          {p.sbc > 0 ? ` + ${p.sbc} SBC` : ""}
                          {p.dbc > 0 ? ` + ${p.dbc} DBC` : ""}
                        </span>
                        <span style={{ color: T.success, fontWeight: 500 }}>
                          +{inr(p.rev - p.onlineSell * (p.rev / (p.totalSold || 1)))}
                        </span>
                      </div>
                    ))}
                </div>

                {/* Online Cylinder Sales */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Online Cylinder Sales
                    </span>
                    <span style={{ fontWeight: 600, color: T.blue }}>
                      +{inr(mCalcs.totalOnlineSales)}
                    </span>
                  </div>
                  {monthlyProducts
                    .filter((p) => p.onlineSell > 0)
                    .map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 11,
                          color: T.inkLight,
                          padding: "2px 0 2px 12px",
                        }}
                      >
                        <span>• {p.short}: {p.onlineSell} Online</span>
                        <span style={{ color: T.blue, fontWeight: 500 }}>
                          +{inr(p.onlineSell * (p.rev / (p.totalSold || 1)))}
                        </span>
                      </div>
                    ))}
                </div>

                {/* Accessories Sales */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Accessories Sales
                    </span>
                    <span style={{ fontWeight: 600, color: T.success }}>
                      +{inr(mCalcs.totalAccessorySales)}
                    </span>
                  </div>
                  {monthlyAccessories.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        color: T.inkLight,
                        padding: "2px 0 2px 12px",
                      }}
                    >
                      <span>• {a.short}: {a.qty} sold</span>
                      <span style={{ color: T.success, fontWeight: 500 }}>+{inr(a.rev)}</span>
                    </div>
                  ))}
                </div>

                {/* Credit Received */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Credit Recoveries Received
                    </span>
                    <span style={{ fontWeight: 600, color: T.success }}>
                      +{inr(mCalcs.totalCreditRecoveries)}
                    </span>
                  </div>
                </div>

                {/* Other Cash Credit */}
                {mCalcs.totalOtherCashCredits > 0 && (
                  <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                        Other Cash Credits
                      </span>
                      <span style={{ fontWeight: 600, color: T.success }}>
                        +{inr(mCalcs.totalOtherCashCredits)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Connection Payments (Cash) */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Connection Payments (Cash)
                    </span>
                    <span style={{ fontWeight: 600, color: T.success }}>
                      +{inr(mCalcs.totalConnCash)}
                    </span>
                  </div>
                </div>

                {/* Connection Payments (Online) */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                    Connection Payments (Online){" "}
                    <span style={{ fontSize: 10, color: T.inkLight }}>direct to bank</span>
                  </span>
                  <span style={{ fontWeight: 600, color: T.blue }}>
                    {inr(mCalcs.totalConnOnline)}
                  </span>
                </div>

                {/* Online -> Bank Auto-settled */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                    Online Sales → Bank Auto-settled
                  </span>
                  <span style={{ fontWeight: 600, color: T.danger }}>
                    −{inr(mCalcs.totalOnlineSales)}
                  </span>
                </div>

                {/* Office Expenses */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Office Expenses
                    </span>
                    <span style={{ fontWeight: 600, color: T.danger }}>
                      −{inr(mCalcs.totalOfficeExp)}
                    </span>
                  </div>
                </div>

                {/* Connection Refunds */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Connection Surrender Refunds
                    </span>
                    <span style={{ fontWeight: 600, color: T.danger }}>
                      −{inr(mCalcs.totalConnRefunds)}
                    </span>
                  </div>
                </div>

                {/* Vehicle & Fuel Expenses */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Vehicle & Fuel Expenses
                    </span>
                    <span style={{ fontWeight: 600, color: T.danger }}>
                      −{inr(mCalcs.totalVehicleExp)}
                    </span>
                  </div>
                </div>

                {/* Salary / Advance */}
                <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                      Salary / Advances Paid
                    </span>
                    <span style={{ fontWeight: 600, color: T.danger }}>
                      −{inr(mCalcs.totalSalaryPaid)}
                    </span>
                  </div>
                </div>

                {/* Cheque / Online */}
                {mCalcs.totalChequeOut > 0 && (
                  <div style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                        Cheque/Online Out
                      </span>
                      <span style={{ fontWeight: 600, color: T.danger }}>
                        −{inr(mCalcs.totalChequeOut)}
                      </span>
                    </div>
                  </div>
                )}

                {/* BOB Bank Deposit */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderBottom: "1px solid #eee",
                    background: mCalcs.totalBob > 0 ? "rgba(37,99,235,0.04)" : "transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: mCalcs.totalBob > 0 ? "#1d4ed8" : T.inkMid,
                      fontWeight: mCalcs.totalBob > 0 ? 700 : 600,
                    }}
                  >
                    🏦 BOB Bank Deposit (−)
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: mCalcs.totalBob > 0 ? T.danger : T.inkLight,
                    }}
                  >
                    −{inr(mCalcs.totalBob)}
                  </span>
                </div>

                {/* Closing Cash on Hand */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "12px 0 4px",
                    marginTop: 8,
                    borderTop: "2px solid #e2e8f0",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMid }}>
                      CASH ON HAND (Month End Closing)
                    </div>
                    <div style={{ fontSize: 10, color: T.inkLight }}>
                      As of {fmtDate(monthEntries[monthEntries.length - 1]?.date)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: "'Outfit',sans-serif",
                      fontSize: 20,
                      fontWeight: 700,
                      color: mCalcs.closingCash < 0 ? T.danger : T.success,
                    }}
                  >
                    {inr(mCalcs.closingCash)}
                  </span>
                </div>
              </div>
            </div>

            {/* Departmental Itemized Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Delivery Boy Monthly Performance */}
              <div className="card">
                <div
                  className="card-head"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span className="card-head-title">🚚 Delivery Boy Performance ({fmtMonth(selMonth + "-01")})</span>
                  <span style={{ fontWeight: 700, color: T.accent }}>
                    {monthlyDeliveryBoys.reduce((s, b) => s + b.total, 0)} cyl
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Delivery Boy</th>
                        <th style={{ textAlign: "right" }}>Cash Cyl</th>
                        <th style={{ textAlign: "right" }}>Online Cyl</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                        <th style={{ width: 100 }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyDeliveryBoys.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: 12, color: T.inkLight }}>
                            No delivery tallies recorded this month.
                          </td>
                        </tr>
                      ) : (
                        monthlyDeliveryBoys.map((b, idx) => (
                          <tr key={b.name}>
                            <td style={{ fontWeight: idx === 0 ? 700 : 500 }}>{b.name}</td>
                            <td style={{ textAlign: "right", color: T.ink }}>{b.cash}</td>
                            <td style={{ textAlign: "right", color: T.blue }}>{b.online}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: T.accent }}>
                              {b.total}
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div
                                  style={{
                                    flex: 1,
                                    background: "#e2e8f0",
                                    borderRadius: 20,
                                    height: 6,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${b.sharePct}%`,
                                      height: "100%",
                                      background: T.accent,
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 11, color: T.inkLight }}>{b.sharePct}%</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Office Expenses */}
              <div className="card">
                <div
                  className="card-head"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span className="card-head-title">🧾 Office Expenses</span>
                  <span style={{ fontWeight: 700, color: T.danger }}>{inr(mCalcs.totalOfficeExp)}</span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 240 }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allMonthTransactions.filter((t) => t.category === "Office Expense").length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ textAlign: "center", padding: 10, color: T.inkLight }}>
                            No office expenses recorded this month
                          </td>
                        </tr>
                      ) : (
                        allMonthTransactions
                          .filter((t) => t.category === "Office Expense")
                          .map((x) => (
                            <tr key={x.id}>
                              <td style={{ fontSize: 11, color: T.inkLight, whiteSpace: "nowrap" }}>
                                {fmtDate(x.date)}
                              </td>
                              <td style={{ color: T.inkMid }}>{x.desc}</td>
                              <td style={{ fontWeight: 600, color: T.danger, textAlign: "right" }}>
                                {inr(x.amount)}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Vehicle & Fuel Expenses */}
              <div className="card">
                <div
                  className="card-head"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span className="card-head-title">🚚 Vehicle & Fuel Expenses</span>
                  <span style={{ fontWeight: 700, color: T.danger }}>{inr(mCalcs.totalVehicleExp)}</span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 240 }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Vehicle</th>
                        <th>Particulars</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allMonthTransactions.filter((t) => t.category === "Vehicle Expense").length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "center", padding: 10, color: T.inkLight }}>
                            No vehicle expenses recorded this month
                          </td>
                        </tr>
                      ) : (
                        allMonthTransactions
                          .filter((t) => t.category === "Vehicle Expense")
                          .map((x) => (
                            <tr key={x.id}>
                              <td style={{ fontSize: 11, color: T.inkLight, whiteSpace: "nowrap" }}>
                                {fmtDate(x.date)}
                              </td>
                              <td style={{ fontWeight: 600 }}>{x.party}</td>
                              <td style={{ color: T.inkMid }}>{x.desc}</td>
                              <td style={{ fontWeight: 600, color: T.danger, textAlign: "right" }}>
                                {inr(x.amount)}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Salary Payments */}
              <div className="card">
                <div
                  className="card-head"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <span className="card-head-title">👤 Salary & Advance Payouts</span>
                  <span style={{ fontWeight: 700, color: T.danger }}>{inr(mCalcs.totalSalaryPaid)}</span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 240 }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Staff Member</th>
                        <th>Type / Note</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allMonthTransactions.filter((t) => t.category === "Salary / Advance").length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "center", padding: 10, color: T.inkLight }}>
                            No salary/advance payouts recorded this month
                          </td>
                        </tr>
                      ) : (
                        allMonthTransactions
                          .filter((t) => t.category === "Salary / Advance")
                          .map((x) => (
                            <tr key={x.id}>
                              <td style={{ fontSize: 11, color: T.inkLight, whiteSpace: "nowrap" }}>
                                {fmtDate(x.date)}
                              </td>
                              <td style={{ fontWeight: 600 }}>{x.party}</td>
                              <td style={{ color: T.inkMid }}>{x.desc}</td>
                              <td style={{ fontWeight: 600, color: T.danger, textAlign: "right" }}>
                                {inr(x.amount)}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bank of Baroda Deposits List */}
              {mCalcs.totalBob > 0 && (
                <div
                  className="card"
                  style={{ borderLeft: "4px solid #2563eb", background: "rgba(37,99,235,0.02)" }}
                >
                  <div
                    className="card-head"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span className="card-head-title" style={{ color: "#1d4ed8" }}>
                      🏦 Bank of Baroda (BOB) Deposits
                    </span>
                    <span style={{ fontWeight: 800, color: "#1d4ed8", fontSize: 16 }}>
                      {inr(mCalcs.totalBob)}
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Particulars</th>
                          <th style={{ textAlign: "right" }}>Amount Deposited</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthEntries
                          .filter((e) => num(e.bob) > 0)
                          .map((e) => (
                            <tr key={e.date}>
                              <td style={{ fontWeight: 600 }}>{fmtDate(e.date)}</td>
                              <td style={{ color: T.inkMid, fontSize: 12 }}>
                                Cash drawer deposit to BOB account
                              </td>
                              <td
                                style={{
                                  fontWeight: 700,
                                  color: "#1d4ed8",
                                  textAlign: "right",
                                }}
                              >
                                {inr(num(e.bob))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Daily Breakdown Calendar Ledger */}
          <div className="card" style={{ marginTop: 18 }}>
            <div
              className="card-head"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <span className="card-head-title">📅 Daily Entries Breakdown ({fmtMonth(selMonth + "-01")})</span>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
                  Day-by-day operational audit. Click "View Day Report ↗" to jump directly into that day's full audit.
                </div>
              </div>
              <span className="badge badge-ink" style={{ fontSize: 11 }}>
                {monthEntries.length} Recorded Days
              </span>
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
                  {monthEntries.map((e) => {
                    const c = calcEntry(e);
                    const cyl = (e.products || []).reduce(
                      (s, p) => s + num(p.sell) + num(p.online),
                      0
                    );
                    const dayComm = (e.products || []).reduce(
                      (ps, p) =>
                        ps + (num(p.sell) + num(p.online)) * getCommRate(p.id, commissions, e.date),
                      0
                    );
                    const dayExp = c.totalExpenses + c.totalVehicleExp + c.totalSalaryPayments;
                    const dayProfit = dayComm + c.totalAccessorySales - dayExp;

                    return (
                      <tr key={e.date}>
                        <td style={{ color: T.ink, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {fmtDate(e.date)}
                        </td>
                        <td style={{ color: T.blue, fontWeight: 600, textAlign: "right" }}>
                          {inr(c.totalSales + c.totalAccessorySales)}
                        </td>
                        <td style={{ fontWeight: 600, textAlign: "right" }}>{cyl}</td>
                        <td
                          style={{
                            color: c.totalAccessorySales > 0 ? T.success : T.inkLight,
                            textAlign: "right",
                          }}
                        >
                          {c.totalAccessorySales > 0 ? inr(c.totalAccessorySales) : "—"}
                        </td>
                        <td
                          style={{
                            color: dayExp > 0 ? T.danger : T.inkLight,
                            fontWeight: 600,
                            textAlign: "right",
                          }}
                        >
                          {dayExp > 0 ? inr(dayExp) : "—"}
                        </td>
                        <td style={{ color: T.accent, fontWeight: 600, textAlign: "right" }}>
                          {inr(dayComm)}
                        </td>
                        <td
                          style={{
                            color: dayProfit >= 0 ? T.success : T.danger,
                            fontWeight: 700,
                            textAlign: "right",
                          }}
                        >
                          {dayProfit >= 0 ? "+" : "−"}{inr(Math.abs(dayProfit))}
                        </td>
                        <td
                          style={{
                            color: num(e.bob) > 0 ? "#1d4ed8" : T.inkLight,
                            fontWeight: num(e.bob) > 0 ? 700 : 400,
                            textAlign: "right",
                          }}
                        >
                          {num(e.bob) > 0 ? inr(num(e.bob)) : "—"}
                        </td>
                        <td
                          style={{
                            color: c.cashOnHand < 0 ? T.danger : T.ink,
                            fontWeight: 700,
                            textAlign: "right",
                          }}
                        >
                          {inr(c.cashOnHand)}
                        </td>
                        {onViewDay && (
                          <td style={{ textAlign: "center" }}>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{
                                padding: "3px 9px",
                                fontSize: 11,
                                fontWeight: 700,
                                color: T.accent,
                                borderColor: T.accent,
                              }}
                              onClick={() => onViewDay(e.date)}
                            >
                              Day Report ↗
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f8fafc", fontWeight: 700, borderTop: `2px solid ${T.border}` }}>
                    <td style={{ textTransform: "uppercase", fontSize: 11, color: T.inkLight }}>
                      Total ({mCalcs.daysCount} Days)
                    </td>
                    <td style={{ textAlign: "right", color: T.blue, fontSize: 13 }}>
                      {inr(mCalcs.totalSales)}
                    </td>
                    <td style={{ textAlign: "right", fontSize: 13 }}>
                      {mCalcs.totalCylindersSold}
                    </td>
                    <td style={{ textAlign: "right", color: T.success, fontSize: 13 }}>
                      {inr(mCalcs.totalAccessorySales)}
                    </td>
                    <td style={{ textAlign: "right", color: T.danger, fontSize: 13 }}>
                      {inr(mCalcs.totalOperatingExp)}
                    </td>
                    <td style={{ textAlign: "right", color: T.accent, fontSize: 13 }}>
                      {inr(mCalcs.totalCommission)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: mCalcs.operatingProfit >= 0 ? T.success : T.danger,
                        fontSize: 13,
                        fontWeight: 800,
                      }}
                    >
                      {mCalcs.operatingProfit >= 0 ? "+" : "−"}{inr(Math.abs(mCalcs.operatingProfit))}
                    </td>
                    <td style={{ textAlign: "right", color: "#1d4ed8", fontSize: 13, fontWeight: 800 }}>
                      {inr(mCalcs.totalBob)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: mCalcs.closingCash < 0 ? T.danger : T.success,
                        fontSize: 14,
                        fontWeight: 800,
                      }}
                    >
                      {inr(mCalcs.closingCash)}
                    </td>
                    {onViewDay && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Complete Month Financial Transactions Audit Journal */}
          <div className="card" style={{ marginTop: 18 }}>
            <div
              className="card-head"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <span className="card-head-title">📑 Monthly Financial Transactions Audit Journal</span>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
                  Comprehensive audit ledger of all receipts, sales collections, operating expenses, and bank transfers for {fmtMonth(selMonth + "-01")}
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
                    ["all", `All (${allMonthTransactions.length})`],
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

            <div style={{ overflowX: "auto", maxHeight: 520 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 40, textAlign: "center" }}>#</th>
                    <th>Date</th>
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
                      <td colSpan={9} style={{ textAlign: "center", padding: "24px 12px", color: T.inkLight }}>
                        No transactions matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((tx, idx) => (
                      <tr key={tx.id || idx}>
                        <td style={{ textAlign: "center", color: T.inkLight, fontSize: 11 }}>
                          {idx + 1}
                        </td>
                        <td style={{ fontSize: 11, color: T.ink, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {fmtDate(tx.date)}
                        </td>
                        <td>
                          <span
                            className={`badge ${tx.badgeClass}`}
                            style={{ fontSize: 10, padding: "3px 7px" }}
                          >
                            {tx.category}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: T.ink }}>{tx.desc}</td>
                        <td style={{ color: T.inkMid, fontSize: 12 }}>{tx.party}</td>
                        <td style={{ textAlign: "center" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: tx.mode === "Cash" ? T.ink : T.blue,
                            }}
                          >
                            {tx.mode}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", color: T.success, fontWeight: 600 }}>
                          {tx.flow === "in" ? `+${inr(tx.amount)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", color: T.danger, fontWeight: 600 }}>
                          {tx.flow === "out" ? `−${inr(tx.amount)}` : "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color:
                              tx.cashImpact > 0
                                ? T.success
                                : tx.cashImpact < 0
                                ? T.danger
                                : T.inkLight,
                          }}
                        >
                          {tx.cashImpact > 0
                            ? `+${inr(tx.cashImpact)}`
                            : tx.cashImpact < 0
                            ? `−${inr(Math.abs(tx.cashImpact))}`
                            : "0 (Direct Bank)"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f8fafc", fontWeight: 700, borderTop: `2px solid ${T.border}` }}>
                    <td
                      colSpan={6}
                      style={{ textAlign: "right", textTransform: "uppercase", fontSize: 11, color: T.inkLight }}
                    >
                      Total Month Cash Movements:
                    </td>
                    <td style={{ textAlign: "right", color: T.success, fontSize: 13 }}>
                      +{inr(totalInflows)}
                    </td>
                    <td style={{ textAlign: "right", color: T.danger, fontSize: 13 }}>
                      −{inr(totalOutflows)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color: mCalcs.closingCash < 0 ? T.danger : T.success,
                        fontSize: 15,
                        fontWeight: 800,
                      }}
                    >
                      {inr(mCalcs.closingCash)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
