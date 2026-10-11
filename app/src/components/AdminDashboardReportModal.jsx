import React, { useState, useMemo } from "react";
import { T } from "../styles";
import {
  PRODUCTS, fmtDate, inr, num, productLabel, getCommRate, calcEntry
} from "../constants";

export default function AdminDashboardReportModal({
  type, // "turnover" | "cylinders" | "expenses" | "commission" | "profit" | "credit" | "bob"
  onClose,
  rangeEntries = [],
  fromDate,
  toDate,
  rangeLabel,
  products = PRODUCTS,
  commissions = [],
  pending = [],
  onViewDay
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expenseSubTab, setExpenseSubTab] = useState("all"); // "all" | "general" | "vehicle" | "salary"
  const [expandedGroups, setExpandedGroups] = useState({});

  if (!type) return null;

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  /* ─────────────────────────────────────────────────────────────
     1. EXPENSES AGGREGATIONS (The user's key feature!)
  ───────────────────────────────────────────────────────────── */
  const expensesData = useMemo(() => {
    let generalTotal = 0;
    let vehicleTotal = 0;
    let salaryTotal = 0;

    const generalGroups = {};
    const vehicleGroups = {};
    const vehicleTypeGroups = {};
    const salaryGroups = {};
    const allItems = [];

    rangeEntries.forEach(e => {
      const dayDate = e.date;

      // A. General Expenses
      (e.expenses || []).forEach(x => {
        const amt = num(x.amt);
        if (amt <= 0 && !x.desc) return;
        generalTotal += amt;

        const rawDesc = (x.desc || "Unspecified Expense").trim();
        const normKey = rawDesc.toUpperCase().replace(/\s+/g, " ");

        if (!generalGroups[normKey]) {
          generalGroups[normKey] = {
            groupKey: normKey,
            displayName: rawDesc,
            category: "General",
            totalAmt: 0,
            count: 0,
            items: []
          };
        }
        generalGroups[normKey].totalAmt += amt;
        generalGroups[normKey].count += 1;
        generalGroups[normKey].items.push({ date: dayDate, desc: x.desc || "—", amt, entry: e });

        allItems.push({
          id: `gen-${dayDate}-${x.id || Math.random()}`,
          date: dayDate,
          category: "General Expense",
          group: normKey,
          title: rawDesc,
          notes: x.desc || "—",
          amt,
          entry: e
        });
      });

      // B. Vehicle Expenses
      (e.vehicleExpenses || []).forEach(x => {
        const amt = num(x.amt);
        if (amt <= 0 && !x.desc && !x.vehicleNo) return;
        vehicleTotal += amt;

        const vNo = (x.vehicleNo || "General / Unknown Vehicle").trim().toUpperCase();
        const expType = (x.expType || "Fuel").trim();

        if (!vehicleGroups[vNo]) {
          vehicleGroups[vNo] = {
            groupKey: vNo,
            displayName: vNo,
            category: "Vehicle",
            totalAmt: 0,
            count: 0,
            items: []
          };
        }
        vehicleGroups[vNo].totalAmt += amt;
        vehicleGroups[vNo].count += 1;
        vehicleGroups[vNo].items.push({ date: dayDate, desc: `${expType}${x.desc ? ` · ${x.desc}` : ""}`, amt, entry: e });

        if (!vehicleTypeGroups[expType]) {
          vehicleTypeGroups[expType] = { name: expType, totalAmt: 0, count: 0 };
        }
        vehicleTypeGroups[expType].totalAmt += amt;
        vehicleTypeGroups[expType].count += 1;

        allItems.push({
          id: `veh-${dayDate}-${x.id || Math.random()}`,
          date: dayDate,
          category: "Vehicle Expense",
          group: vNo,
          title: `${vNo} (${expType})`,
          notes: x.desc || expType,
          amt,
          entry: e
        });
      });

      // C. Salary Payments & Advances
      (e.salaryPayments || []).forEach(x => {
        const amt = num(x.amt);
        if (amt <= 0 && !x.employeeName) return;
        salaryTotal += amt;

        const empName = (x.employeeName || "Unspecified Employee").trim().toUpperCase();
        const pType = x.type || "Salary";

        if (!salaryGroups[empName]) {
          salaryGroups[empName] = {
            groupKey: empName,
            displayName: empName,
            category: "Salary / Advance",
            totalAmt: 0,
            advanceAmt: 0,
            salaryAmt: 0,
            count: 0,
            items: []
          };
        }
        salaryGroups[empName].totalAmt += amt;
        if (pType === "Salary") salaryGroups[empName].salaryAmt += amt;
        else salaryGroups[empName].advanceAmt += amt;
        salaryGroups[empName].count += 1;
        salaryGroups[empName].items.push({ date: dayDate, desc: `${pType}${x.forMonth ? ` for ${x.forMonth}` : ""}${x.notes ? ` · ${x.notes}` : ""}`, amt, entry: e });

        allItems.push({
          id: `sal-${dayDate}-${x.id || Math.random()}`,
          date: dayDate,
          category: pType === "Salary" ? "Salary Payout" : "Salary Advance",
          group: empName,
          title: empName,
          notes: `${pType}${x.forMonth ? ` (${x.forMonth})` : ""}${x.notes ? ` · ${x.notes}` : ""}`,
          amt,
          entry: e
        });
      });
    });

    const totalExpenses = generalTotal + vehicleTotal + salaryTotal;

    // Convert groups to sorted arrays (highest amount first)
    const sortedGeneral = Object.values(generalGroups).sort((a, b) => b.totalAmt - a.totalAmt);
    const sortedVehicles = Object.values(vehicleGroups).sort((a, b) => b.totalAmt - a.totalAmt);
    const sortedVehicleTypes = Object.values(vehicleTypeGroups).sort((a, b) => b.totalAmt - a.totalAmt);
    const sortedSalaries = Object.values(salaryGroups).sort((a, b) => b.totalAmt - a.totalAmt);

    // Combined top groups across all expenses
    const combinedTopGroups = [
      ...sortedGeneral.map(g => ({ ...g, subType: "General" })),
      ...sortedVehicles.map(g => ({ ...g, displayName: `Vehicle: ${g.displayName}`, subType: "Vehicle" })),
      ...sortedSalaries.map(g => ({ ...g, displayName: `Employee: ${g.displayName}`, subType: "Salary" }))
    ].sort((a, b) => b.totalAmt - a.totalAmt);

    return {
      generalTotal,
      vehicleTotal,
      salaryTotal,
      totalExpenses,
      sortedGeneral,
      sortedVehicles,
      sortedVehicleTypes,
      sortedSalaries,
      combinedTopGroups,
      allItems: allItems.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [rangeEntries]);

  /* ─────────────────────────────────────────────────────────────
     2. TURNOVER / SALES AGGREGATIONS
  ───────────────────────────────────────────────────────────── */
  const turnoverData = useMemo(() => {
    let grandCylRevenue = 0;
    let grandAccRevenue = 0;
    let grandCashSales = 0;
    let grandOnlineSales = 0;

    const productSales = {};
    const accessorySales = {};
    const dailySales = [];

    rangeEntries.forEach(e => {
      const c = calcEntry(e);
      grandCylRevenue += c.totalSales;
      grandAccRevenue += c.totalAccessorySales;
      grandCashSales += c.totalCashSales;
      grandOnlineSales += c.totalOnlineSales;

      // Products breakdown
      (e.products || []).forEach(p => {
        const cashQty = num(p.sell);
        const onlineQty = num(p.online);
        const sbcQty = num(p.sbc);
        const dbcQty = num(p.dbc);
        const totQty = cashQty + onlineQty + sbcQty + dbcQty;
        const rate = num(p.rate);
        const revenue = (cashQty + onlineQty) * rate + (sbcQty * num(p.sbcRate)) + (dbcQty * num(p.dbcRate));

        if (!productSales[p.id]) {
          productSales[p.id] = {
            id: p.id,
            name: productLabel(p.id, products),
            totQty: 0,
            cashQty: 0,
            onlineQty: 0,
            sbcQty: 0,
            dbcQty: 0,
            revenue: 0,
            rate: rate
          };
        }
        productSales[p.id].totQty += totQty;
        productSales[p.id].cashQty += cashQty;
        productSales[p.id].onlineQty += onlineQty;
        productSales[p.id].sbcQty += sbcQty;
        productSales[p.id].dbcQty += dbcQty;
        productSales[p.id].revenue += revenue;
      });

      // Accessories breakdown
      (e.accessories || []).forEach(a => {
        if (!a.sold) return;
        const q = num(a.qty);
        const r = num(a.rate);
        const rev = q * r;
        if (!accessorySales[a.accessoryId]) {
          accessorySales[a.accessoryId] = {
            id: a.accessoryId,
            name: a.name || a.accessoryId,
            qty: 0,
            rate: r,
            revenue: 0
          };
        }
        accessorySales[a.accessoryId].qty += q;
        accessorySales[a.accessoryId].revenue += rev;
      });

      dailySales.push({
        date: e.date,
        cylSales: c.totalSales,
        accSales: c.totalAccessorySales,
        cashSales: c.totalCashSales,
        onlineSales: c.totalOnlineSales,
        totalSales: c.totalSales + c.totalAccessorySales,
        entry: e
      });
    });

    const grandTotal = grandCylRevenue + grandAccRevenue;

    return {
      grandTotal,
      grandCylRevenue,
      grandAccRevenue,
      grandCashSales,
      grandOnlineSales,
      productSalesList: Object.values(productSales).sort((a, b) => b.revenue - a.revenue),
      accessorySalesList: Object.values(accessorySales).sort((a, b) => b.revenue - a.revenue),
      dailySales: dailySales.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [rangeEntries, products]);

  /* ─────────────────────────────────────────────────────────────
     3. CYLINDERS SOLD AGGREGATIONS
  ───────────────────────────────────────────────────────────── */
  const cylindersData = useMemo(() => {
    let totalCyls = 0;
    let totalCash = 0;
    let totalOnline = 0;
    let totalSbc = 0;
    let totalDbc = 0;

    const byProduct = {};
    const byDeliveryBoy = {};
    const dailyCyls = [];

    rangeEntries.forEach(e => {
      let dayTot = 0;
      (e.products || []).forEach(p => {
        const cash = num(p.sell);
        const online = num(p.online);
        const sbc = num(p.sbc);
        const dbc = num(p.dbc);
        const tot = cash + online + sbc + dbc;

        totalCyls += tot;
        totalCash += cash;
        totalOnline += online;
        totalSbc += sbc;
        totalDbc += dbc;
        dayTot += tot;

        if (!byProduct[p.id]) {
          byProduct[p.id] = { id: p.id, name: productLabel(p.id, products), tot: 0, cash: 0, online: 0, sbc: 0, dbc: 0 };
        }
        byProduct[p.id].tot += tot;
        byProduct[p.id].cash += cash;
        byProduct[p.id].online += online;
        byProduct[p.id].sbc += sbc;
        byProduct[p.id].dbc += dbc;
      });

      // Delivery Boys breakdown
      Object.entries(e.delivery || {}).forEach(([boy, item]) => {
        const cash = typeof item === "object" && item !== null ? num(item.cash) : num(item);
        const online = typeof item === "object" && item !== null ? num(item.online) : 0;
        const tot = cash + online;
        if (tot <= 0) return;

        if (!byDeliveryBoy[boy]) {
          byDeliveryBoy[boy] = { boy, cash: 0, online: 0, total: 0 };
        }
        byDeliveryBoy[boy].cash += cash;
        byDeliveryBoy[boy].online += online;
        byDeliveryBoy[boy].total += tot;
      });

      dailyCyls.push({ date: e.date, totalCyls: dayTot, entry: e });
    });

    return {
      totalCyls,
      totalCash,
      totalOnline,
      totalSbc,
      totalDbc,
      byProductList: Object.values(byProduct).sort((a, b) => b.tot - a.tot),
      byDeliveryBoyList: Object.values(byDeliveryBoy).sort((a, b) => b.total - a.total),
      dailyCyls: dailyCyls.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [rangeEntries, products]);

  /* ─────────────────────────────────────────────────────────────
     4. COMMISSION AGGREGATIONS
  ───────────────────────────────────────────────────────────── */
  const commissionData = useMemo(() => {
    let totalComm = 0;
    const byProduct = {};
    const dailyComm = [];

    rangeEntries.forEach(e => {
      let dayTot = 0;
      (e.products || []).forEach(p => {
        const q = num(p.sell) + num(p.online);
        const r = getCommRate(p.id, commissions, e.date);
        const comm = q * r;

        totalComm += comm;
        dayTot += comm;

        if (!byProduct[p.id]) {
          byProduct[p.id] = { id: p.id, name: productLabel(p.id, products), qty: 0, rate: r, comm: 0 };
        }
        byProduct[p.id].qty += q;
        byProduct[p.id].comm += comm;
      });

      dailyComm.push({ date: e.date, comm: dayTot, entry: e });
    });

    return {
      totalComm,
      byProductList: Object.values(byProduct).sort((a, b) => b.comm - a.comm),
      dailyComm: dailyComm.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [rangeEntries, products, commissions]);

  /* ─────────────────────────────────────────────────────────────
     5. OUTSTANDING CREDIT AGGREGATIONS
  ───────────────────────────────────────────────────────────── */
  const creditData = useMemo(() => {
    let totalOriginal = 0;
    let totalRecovered = 0;
    let totalPendingAmt = 0;
    let totalEmptyDue = 0;

    const customerList = (pending || []).map(p => {
      const orig = num(p.originalAmt);
      const rec = num(p.recovered);
      const rem = Math.max(0, orig - rec);
      const empPaid = (p.payments || []).reduce((s, pay) => s + num(pay.emptyReturned), 0);
      const empDue = Math.max(0, (num(p.filledQty) || 0) - (num(p.emptyQty) || 0) - empPaid);

      totalOriginal += orig;
      totalRecovered += rec;
      if (!p.cleared) totalPendingAmt += rem;
      totalEmptyDue += empDue;

      return {
        id: p.id,
        date: p.date,
        customerName: p.customerName || "Unknown",
        productId: p.productId,
        productName: productLabel(p.productId, products),
        originalAmt: orig,
        recovered: rec,
        remaining: rem,
        empDue,
        cleared: !!p.cleared,
        remarks: p.remarks || ""
      };
    });

    return {
      totalOriginal,
      totalRecovered,
      totalPendingAmt,
      totalEmptyDue,
      customerList: customerList.sort((a, b) => {
        // Pending first, then largest balance due
        if (a.cleared !== b.cleared) return a.cleared ? 1 : -1;
        return b.remaining - a.remaining;
      })
    };
  }, [pending, products]);

  /* ─────────────────────────────────────────────────────────────
     6. BOB DEPOSIT AGGREGATIONS
  ───────────────────────────────────────────────────────────── */
  const bobData = useMemo(() => {
    let totalDeposit = 0;
    const list = [];

    rangeEntries.forEach(e => {
      const amt = num(e.bob);
      if (amt > 0) {
        totalDeposit += amt;
        list.push({ date: e.date, amt, entry: e });
      }
    });

    const avg = list.length > 0 ? Math.round(totalDeposit / list.length) : 0;

    return {
      totalDeposit,
      avgDeposit: avg,
      depositCount: list.length,
      list: list.sort((a, b) => b.date.localeCompare(a.date))
    };
  }, [rangeEntries]);

  /* ─────────────────────────────────────────────────────────────
     7. REAL PROFIT AGGREGATIONS
  ───────────────────────────────────────────────────────────── */
  const profitData = useMemo(() => {
    const grossEarnings = commissionData.totalComm + turnoverData.grandAccRevenue;
    const totalExp = expensesData.totalExpenses;
    const realProfit = grossEarnings - totalExp;
    const margin = grossEarnings > 0 ? ((realProfit / grossEarnings) * 100).toFixed(1) : "0.0";

    const dailyProfit = rangeEntries.map(e => {
      const c = calcEntry(e);
      const dayComm = (e.products || []).reduce((ps, p) => ps + (num(p.sell) + num(p.online)) * getCommRate(p.id, commissions, e.date), 0);
      const dayGross = dayComm + c.totalAccessorySales;
      const dayExp = c.totalExpenses + c.totalVehicleExp + c.totalSalaryPayments;
      const dayNet = dayGross - dayExp;
      return { date: e.date, gross: dayGross, exp: dayExp, net: dayNet, entry: e };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return {
      grossEarnings,
      totalExp,
      realProfit,
      margin,
      dailyProfit
    };
  }, [commissionData, turnoverData, expensesData, rangeEntries, commissions]);

  /* Filter search helper */
  const query = searchTerm.trim().toLowerCase();

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "16px"
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: "16px",
        width: "100%",
        maxWidth: "1040px",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        border: `1px solid ${T.border}`,
        overflow: "hidden"
      }}>
        {/* Modal Top Header */}
        <div style={{
          padding: "16px 24px",
          background: "linear-gradient(135deg, #0b1120 0%, #0f172a 100%)",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22 }}>
                {type === "expenses" && "💸"}
                {type === "turnover" && "📈"}
                {type === "cylinders" && "🛢️"}
                {type === "commission" && "💰"}
                {type === "profit" && "✨"}
                {type === "credit" && "📋"}
                {type === "bob" && "🏦"}
              </span>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, margin: 0, color: "#ffffff", letterSpacing: "0.3px" }}>
                {type === "expenses" && "Operating Expenses — Group-Wise Details Report"}
                {type === "turnover" && "Turnover & Sales — Product Breakdown Report"}
                {type === "cylinders" && "Cylinders Sold — Category & Boy Details Report"}
                {type === "commission" && "Cylinder Commission — Earnings Report"}
                {type === "profit" && "Real Profit & Loss (P&L) — Executive Summary Report"}
                {type === "credit" && "Outstanding Credit — Customer Ledger Report"}
                {type === "bob" && "BOB Bank Deposits — Detailed Log Report"}
              </h2>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
              <span>📅 {rangeLabel}</span>
              <span>·</span>
              <span>{rangeEntries.length} Recorded Day{rangeEntries.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ background: "rgba(255,255,255,0.1)", color: "#fff", borderColor: "rgba(255,255,255,0.2)", fontSize: 12, padding: "6px 12px" }}
              onClick={() => window.print()}
            >
              🖨️ Print Report
            </button>
            <button
              type="button"
              className="btn-icon"
              style={{ color: "#ffffff", fontSize: 22, background: "rgba(255,255,255,0.1)", borderRadius: 8, width: 34, height: 34 }}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", background: "#f8fafc" }}>

          {/* ══════════════════════════════════════════════════════════
              CASE 1: EXPENSES REPORT (THE PRIMARY USER REQUIREMENT)
          ══════════════════════════════════════════════════════════ */}
          {type === "expenses" && (() => {
            const exp = expensesData;

            // Filter groups by sub-tab and search term
            let groupsToDisplay = [];
            if (expenseSubTab === "all") groupsToDisplay = exp.combinedTopGroups;
            else if (expenseSubTab === "general") groupsToDisplay = exp.sortedGeneral;
            else if (expenseSubTab === "vehicle") groupsToDisplay = exp.sortedVehicles;
            else if (expenseSubTab === "salary") groupsToDisplay = exp.sortedSalaries;

            if (query) {
              groupsToDisplay = groupsToDisplay.filter(g =>
                (g.displayName || "").toLowerCase().includes(query) ||
                (g.groupKey || "").toLowerCase().includes(query)
              );
            }

            // Filter individual items by search term
            let itemsToDisplay = exp.allItems;
            if (expenseSubTab === "general") itemsToDisplay = itemsToDisplay.filter(x => x.category.includes("General"));
            else if (expenseSubTab === "vehicle") itemsToDisplay = itemsToDisplay.filter(x => x.category.includes("Vehicle"));
            else if (expenseSubTab === "salary") itemsToDisplay = itemsToDisplay.filter(x => x.category.includes("Salary"));

            if (query) {
              itemsToDisplay = itemsToDisplay.filter(x =>
                (x.title || "").toLowerCase().includes(query) ||
                (x.notes || "").toLowerCase().includes(query) ||
                (x.group || "").toLowerCase().includes(query) ||
                (x.date || "").includes(query)
              );
            }

            return (
              <div>
                {/* Summary Metric Chips */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Total Operating Expenses</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.danger, marginTop: 4 }}>{inr(exp.totalExpenses)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>{exp.allItems.length} total transactions</div>
                  </div>

                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>General Expenses</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706", marginTop: 4 }}>{inr(exp.generalTotal)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>{exp.sortedGeneral.length} unique expense groups</div>
                  </div>

                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Vehicle & Fuel</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.blue, marginTop: 4 }}>{inr(exp.vehicleTotal)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>{exp.sortedVehicles.length} vehicles active</div>
                  </div>

                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Salaries & Advances</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#8b5cf6", marginTop: 4 }}>{inr(exp.salaryTotal)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>{exp.sortedSalaries.length} employees paid</div>
                  </div>
                </div>

                {/* Sub-Tabs & Search Toolbar */}
                <div style={{
                  background: "#ffffff",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: `1px solid ${T.border}`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 18
                }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      ["all", `All Groups (${exp.combinedTopGroups.length})`, inr(exp.totalExpenses)],
                      ["general", `General (${exp.sortedGeneral.length})`, inr(exp.generalTotal)],
                      ["vehicle", `Vehicles (${exp.sortedVehicles.length})`, inr(exp.vehicleTotal)],
                      ["salary", `Salaries (${exp.sortedSalaries.length})`, inr(exp.salaryTotal)]
                    ].map(([key, label, amount]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setExpenseSubTab(key)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 8,
                          border: `1px solid ${expenseSubTab === key ? T.accent : T.border}`,
                          background: expenseSubTab === key ? T.accentBg : "#fff",
                          color: expenseSubTab === key ? T.accent : T.inkMid,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}
                      >
                        <span>{label}</span>
                        <span style={{ fontSize: 11, opacity: 0.8 }}>· {amount}</span>
                      </button>
                    ))}
                  </div>

                  <div style={{ minWidth: 260 }}>
                    <input
                      type="text"
                      className="inp"
                      placeholder="🔍 Search VC Hapto, Fuel, Employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ fontSize: 13, padding: "7px 12px", width: "100%" }}
                    />
                  </div>
                </div>

                {/* 1. GROUP-WISE SUMMARY (THE SPECIAL FOCUS) */}
                <div className="card" style={{ marginBottom: 18 }}>
                  <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="card-head-title">📊 Group-Wise Aggregated Summary</span>
                      <span className="badge badge-accent" style={{ fontSize: 11 }}>{groupsToDisplay.length} Groups</span>
                    </div>
                    <span style={{ fontSize: 11, color: T.inkLight }}>Click row to toggle entry drill-down</span>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ width: "35%" }}>Group Name / Purpose</th>
                          <th style={{ width: "15%" }}>Category</th>
                          <th style={{ textAlign: "center", width: "12%" }}>Times Entered</th>
                          <th style={{ textAlign: "right", width: "18%" }}>Total Amount (₹)</th>
                          <th style={{ textAlign: "right", width: "12%" }}>% Share</th>
                          <th style={{ textAlign: "center", width: "8%" }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupsToDisplay.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", padding: "24px 12px", color: T.inkLight }}>
                              No expense groups matched {searchTerm ? `"${searchTerm}"` : "this filter"}.
                            </td>
                          </tr>
                        ) : (
                          groupsToDisplay.map((grp, idx) => {
                            const isExpanded = !!expandedGroups[grp.groupKey];
                            const pct = exp.totalExpenses > 0 ? ((grp.totalAmt / exp.totalExpenses) * 100).toFixed(1) : "0.0";

                            return (
                              <React.Fragment key={grp.groupKey || idx}>
                                <tr
                                  style={{
                                    cursor: "pointer",
                                    background: isExpanded ? "rgba(234, 88, 12, 0.04)" : "transparent"
                                  }}
                                  onClick={() => toggleGroup(grp.groupKey)}
                                >
                                  <td>
                                    <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>
                                      {grp.displayName}
                                    </div>
                                    {grp.advanceAmt > 0 && grp.salaryAmt > 0 && (
                                      <div style={{ fontSize: 10.5, color: T.inkLight, marginTop: 2 }}>
                                        Adv: {inr(grp.advanceAmt)} · Sal: {inr(grp.salaryAmt)}
                                      </div>
                                    )}
                                  </td>
                                  <td>
                                    <span style={{
                                      fontSize: 10.5,
                                      fontWeight: 600,
                                      padding: "2px 8px",
                                      borderRadius: 4,
                                      background: grp.category === "General" ? "#fff7ed" : grp.category === "Vehicle" ? "#eff6ff" : "#f5f3ff",
                                      color: grp.category === "General" ? "#c2410c" : grp.category === "Vehicle" ? "#1d4ed8" : "#6d28d9",
                                      border: `1px solid ${T.border}`
                                    }}>
                                      {grp.category}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: "center", fontWeight: 600, color: T.inkMid }}>
                                    {grp.count} {grp.count === 1 ? "entry" : "entries"}
                                  </td>
                                  <td style={{ textAlign: "right", fontWeight: 800, color: T.danger, fontSize: 14 }}>
                                    {inr(grp.totalAmt)}
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    <span style={{ fontWeight: 700, color: T.inkMid, fontSize: 12 }}>{pct}%</span>
                                    <div style={{ width: "100%", height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 3, overflow: "hidden" }}>
                                      <div style={{ width: `${Math.min(100, num(pct))}%`, height: "100%", background: T.danger }} />
                                    </div>
                                  </td>
                                  <td style={{ textAlign: "center" }}>
                                    <button
                                      type="button"
                                      className="btn-ghost"
                                      style={{ padding: "2px 8px", fontSize: 11 }}
                                      onClick={(e) => { e.stopPropagation(); toggleGroup(grp.groupKey); }}
                                    >
                                      {isExpanded ? "▲ Hide" : "▼ View"}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded item list for this group */}
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={6} style={{ padding: "8px 16px 14px", background: "#f8fafc" }}>
                                      <div style={{
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 8,
                                        background: "#fff",
                                        padding: "10px 14px"
                                      }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                                          Individual entries for "{grp.displayName}" ({grp.items.length}):
                                        </div>
                                        <div style={{ display: "grid", gap: 6 }}>
                                          {grp.items.map((it, itIdx) => (
                                            <div
                                              key={itIdx}
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                padding: "4px 8px",
                                                borderBottom: itIdx < grp.items.length - 1 ? "1px solid #f1f5f9" : "none",
                                                fontSize: 12
                                              }}
                                            >
                                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <span style={{ fontWeight: 600, color: T.ink }}>{fmtDate(it.date)}</span>
                                                <span style={{ color: T.inkMid }}>{it.desc}</span>
                                              </div>
                                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                <span style={{ fontWeight: 700, color: T.danger }}>{inr(it.amt)}</span>
                                                {onViewDay && (
                                                  <button
                                                    type="button"
                                                    className="btn-ghost"
                                                    style={{ padding: "1px 6px", fontSize: 10 }}
                                                    onClick={() => { onClose(); onViewDay(it.entry); }}
                                                  >
                                                    Day ↗
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. CHRONOLOGICAL ALL-ENTRIES LIST */}
                <div className="card">
                  <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="card-head-title">📋 Itemized Expense Entries</span>
                      <span className="badge badge-ink" style={{ fontSize: 11 }}>{itemsToDisplay.length} Records</span>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th style={{ width: "15%" }}>Date</th>
                          <th style={{ width: "15%" }}>Category</th>
                          <th style={{ width: "25%" }}>Group / Title</th>
                          <th style={{ width: "25%" }}>Specific Details</th>
                          <th style={{ textAlign: "right", width: "12%" }}>Amount (₹)</th>
                          {onViewDay && <th style={{ textAlign: "center", width: "8%" }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {itemsToDisplay.length === 0 ? (
                          <tr>
                            <td colSpan={onViewDay ? 6 : 5} style={{ textAlign: "center", padding: "20px 12px", color: T.inkLight }}>
                              No individual entries match current search.
                            </td>
                          </tr>
                        ) : (
                          itemsToDisplay.slice(0, 150).map((it) => (
                            <tr key={it.id}>
                              <td style={{ fontWeight: 600, color: T.ink }}>{fmtDate(it.date)}</td>
                              <td>
                                <span style={{ fontSize: 11, color: T.inkMid, fontWeight: 500 }}>
                                  {it.category}
                                </span>
                              </td>
                              <td style={{ fontWeight: 700, color: T.accent }}>{it.title}</td>
                              <td style={{ color: T.inkMid, fontSize: 12 }}>{it.notes}</td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: T.danger }}>{inr(it.amt)}</td>
                              {onViewDay && (
                                <td style={{ textAlign: "center" }}>
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ padding: "2px 8px", fontSize: 10.5 }}
                                    onClick={() => { onClose(); onViewDay(it.entry); }}
                                  >
                                    View ↗
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              CASE 2: TURNOVER REPORT
          ══════════════════════════════════════════════════════════ */}
          {type === "turnover" && (() => {
            const data = turnoverData;
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Total Turnover (Gross)</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.blue, marginTop: 4 }}>{inr(data.grandTotal)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Cylinders + Accessories</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Cylinder Sales</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.success, marginTop: 4 }}>{inr(data.grandCylRevenue)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>{data.productSalesList.reduce((s, p) => s + p.totQty, 0)} Cylinders Sold</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Accessories Sales</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.accent, marginTop: 4 }}>{inr(data.grandAccRevenue)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Parts & fittings sold</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Payment Mode Split</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 4 }}>
                      Cash: <span style={{ color: T.success }}>{inr(data.grandCashSales)}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 2 }}>
                      Online: <span style={{ color: T.blue }}>{inr(data.grandOnlineSales)}</span>
                    </div>
                  </div>
                </div>

                {/* Product Wise Group Summary */}
                <div className="card" style={{ marginBottom: 18 }}>
                  <div className="card-head">
                    <span className="card-head-title">📊 Cylinder Product-Wise Sales Breakdown</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th style={{ textAlign: "right" }}>Current Rate</th>
                          <th style={{ textAlign: "center" }}>Cash Qty</th>
                          <th style={{ textAlign: "center" }}>Online Qty</th>
                          <th style={{ textAlign: "center" }}>SBC/DBC</th>
                          <th style={{ textAlign: "right" }}>Total Sold Qty</th>
                          <th style={{ textAlign: "right" }}>Total Revenue (₹)</th>
                          <th style={{ textAlign: "right" }}>% Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.productSalesList.map(p => {
                          const pct = data.grandTotal > 0 ? ((p.revenue / data.grandTotal) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 700, color: T.accent }}>🛢️ {p.name}</td>
                              <td style={{ textAlign: "right", color: T.inkLight }}>{inr(p.rate)}</td>
                              <td style={{ textAlign: "center" }}>{p.cashQty}</td>
                              <td style={{ textAlign: "center" }}>{p.onlineQty}</td>
                              <td style={{ textAlign: "center" }}>{p.sbcQty + p.dbcQty > 0 ? `${p.sbcQty + p.dbcQty}` : "—"}</td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: T.ink }}>{p.totQty}</td>
                              <td style={{ textAlign: "right", fontWeight: 800, color: T.success }}>{inr(p.revenue)}</td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: T.inkMid }}>{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Day-by-Day Sales Table */}
                <div className="card">
                  <div className="card-head">
                    <span className="card-head-title">📅 Daily Turnover Log ({data.dailySales.length} Days)</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: "right" }}>Cylinder Sales</th>
                          <th style={{ textAlign: "right" }}>Accessory Sales</th>
                          <th style={{ textAlign: "right" }}>Cash Collections</th>
                          <th style={{ textAlign: "right" }}>Online Payments</th>
                          <th style={{ textAlign: "right" }}>Total Daily Sales</th>
                          {onViewDay && <th style={{ textAlign: "center" }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.dailySales.map(d => (
                          <tr key={d.date}>
                            <td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(d.cylSales)}</td>
                            <td style={{ textAlign: "right", color: d.accSales > 0 ? T.accent : T.inkLight }}>{inr(d.accSales)}</td>
                            <td style={{ textAlign: "right", color: T.success }}>{inr(d.cashSales)}</td>
                            <td style={{ textAlign: "right", color: T.blue }}>{inr(d.onlineSales)}</td>
                            <td style={{ textAlign: "right", fontWeight: 800, color: T.ink }}>{inr(d.totalSales)}</td>
                            {onViewDay && (
                              <td style={{ textAlign: "center" }}>
                                <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10.5 }} onClick={() => { onClose(); onViewDay(d.entry); }}>
                                  View ↗
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              CASE 3: CYLINDERS SOLD REPORT
          ══════════════════════════════════════════════════════════ */}
          {type === "cylinders" && (() => {
            const data = cylindersData;
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Total Cylinders Sold</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#0ea5e9", marginTop: 4 }}>{data.totalCyls}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>In selected date range</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Cash Counter Sales</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.success, marginTop: 4 }}>{data.totalCash}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Cash refills</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Online Bookings</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.blue, marginTop: 4 }}>{data.totalOnline}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Online refills</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>New SBC / DBC</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.accent, marginTop: 4 }}>{data.totalSbc + data.totalDbc}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>SBC: {data.totalSbc} · DBC: {data.totalDbc}</div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 18 }}>
                  <div className="card-head">
                    <span className="card-head-title">📊 Cylinders Sold by Product Type</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th style={{ textAlign: "center" }}>Cash Qty</th>
                          <th style={{ textAlign: "center" }}>Online Qty</th>
                          <th style={{ textAlign: "center" }}>SBC Qty</th>
                          <th style={{ textAlign: "center" }}>DBC Qty</th>
                          <th style={{ textAlign: "right" }}>Total Sold</th>
                          <th style={{ textAlign: "right" }}>% Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byProductList.map(p => {
                          const pct = data.totalCyls > 0 ? ((p.tot / data.totalCyls) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 700, color: T.accent }}>🛢️ {p.name}</td>
                              <td style={{ textAlign: "center" }}>{p.cash}</td>
                              <td style={{ textAlign: "center" }}>{p.online}</td>
                              <td style={{ textAlign: "center" }}>{p.sbc || "—"}</td>
                              <td style={{ textAlign: "center" }}>{p.dbc || "—"}</td>
                              <td style={{ textAlign: "right", fontWeight: 800, color: T.ink, fontSize: 14 }}>{p.tot}</td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: T.inkMid }}>{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {data.byDeliveryBoyList.length > 0 && (
                  <div className="card">
                    <div className="card-head">
                      <span className="card-head-title">🚚 Delivery Boy Wise Distribution</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Delivery Boy</th>
                            <th style={{ textAlign: "center" }}>Cash Cylinders</th>
                            <th style={{ textAlign: "center" }}>Online Cylinders</th>
                            <th style={{ textAlign: "right" }}>Total Delivered</th>
                            <th style={{ textAlign: "right" }}>Delivery Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.byDeliveryBoyList.map(b => {
                            const pct = data.totalCyls > 0 ? ((b.total / data.totalCyls) * 100).toFixed(1) : "0.0";
                            return (
                              <tr key={b.boy}>
                                <td style={{ fontWeight: 700 }}>{b.boy}</td>
                                <td style={{ textAlign: "center" }}>{b.cash}</td>
                                <td style={{ textAlign: "center" }}>{b.online}</td>
                                <td style={{ textAlign: "right", fontWeight: 800, color: T.accent }}>{b.total}</td>
                                <td style={{ textAlign: "right", fontWeight: 700, color: T.inkMid }}>{pct}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              CASE 4: CYLINDER COMMISSION REPORT
          ══════════════════════════════════════════════════════════ */}
          {type === "commission" && (() => {
            const data = commissionData;
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Total Agency Commission</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.accent, marginTop: 4 }}>{inr(data.totalComm)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>BPCL Commission Income</div>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 18 }}>
                  <div className="card-head">
                    <span className="card-head-title">📊 Commission Breakdown by Product</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th style={{ textAlign: "right" }}>Cylinders Sold</th>
                          <th style={{ textAlign: "right" }}>Comm. Rate (₹/cyl)</th>
                          <th style={{ textAlign: "right" }}>Total Commission (₹)</th>
                          <th style={{ textAlign: "right" }}>% Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byProductList.map(p => {
                          const pct = data.totalComm > 0 ? ((p.comm / data.totalComm) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 700, color: T.accent }}>🛢️ {p.name}</td>
                              <td style={{ textAlign: "right", fontWeight: 600 }}>{p.qty}</td>
                              <td style={{ textAlign: "right", color: T.inkMid }}>{inr(p.rate)}</td>
                              <td style={{ textAlign: "right", fontWeight: 800, color: T.accent }}>{inr(p.comm)}</td>
                              <td style={{ textAlign: "right", fontWeight: 700, color: T.inkMid }}>{pct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <span className="card-head-title">📅 Daily Commission Earnings Log</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: "right" }}>Daily Commission (₹)</th>
                          {onViewDay && <th style={{ textAlign: "center" }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.dailyComm.map(d => (
                          <tr key={d.date}>
                            <td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: T.accent }}>{inr(d.comm)}</td>
                            {onViewDay && (
                              <td style={{ textAlign: "center" }}>
                                <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10.5 }} onClick={() => { onClose(); onViewDay(d.entry); }}>
                                  View ↗
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              CASE 5: REAL PROFIT & LOSS (P&L) REPORT
          ══════════════════════════════════════════════════════════ */}
          {type === "profit" && (() => {
            const data = profitData;
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1.5px solid ${data.realProfit >= 0 ? T.success : T.danger}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Real Net Profit</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: data.realProfit >= 0 ? T.success : T.danger, marginTop: 4 }}>
                      {data.realProfit >= 0 ? "+" : "−"}{inr(Math.abs(data.realProfit))}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Net Profit Margin: <strong>{data.margin}%</strong></div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Gross Earnings (+)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.success, marginTop: 4 }}>+{inr(data.grossEarnings)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Commission + Accessory Sales</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Operating Expenses (−)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: T.danger, marginTop: 4 }}>−{inr(data.totalExp)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>General + Vehicle + Salaries</div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <span className="card-head-title">📅 Daily Net Profit Trend ({data.dailyProfit.length} Days)</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: "right" }}>Gross Earnings (+)</th>
                          <th style={{ textAlign: "right" }}>Expenses (−)</th>
                          <th style={{ textAlign: "right" }}>Net Real Profit</th>
                          {onViewDay && <th style={{ textAlign: "center" }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.dailyProfit.map(d => (
                          <tr key={d.date}>
                            <td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td>
                            <td style={{ textAlign: "right", color: T.success, fontWeight: 600 }}>+{inr(d.gross)}</td>
                            <td style={{ textAlign: "right", color: T.danger, fontWeight: 600 }}>−{inr(d.exp)}</td>
                            <td style={{ textAlign: "right", fontWeight: 800, color: d.net >= 0 ? T.success : T.danger }}>
                              {d.net >= 0 ? "+" : "−"}{inr(Math.abs(d.net))}
                            </td>
                            {onViewDay && (
                              <td style={{ textAlign: "center" }}>
                                <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10.5 }} onClick={() => { onClose(); onViewDay(d.entry); }}>
                                  View ↗
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              CASE 6: OUTSTANDING CREDIT REPORT
          ══════════════════════════════════════════════════════════ */}
          {type === "credit" && (() => {
            const data = creditData;
            let filteredList = data.customerList;
            if (query) {
              filteredList = filteredList.filter(c =>
                c.customerName.toLowerCase().includes(query) ||
                (c.remarks || "").toLowerCase().includes(query) ||
                c.date.includes(query)
              );
            }

            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Total Outstanding Due</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: T.danger, marginTop: 4 }}>{inr(data.totalPendingAmt)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Across all pending customers</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Pending Accounts</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#d97706", marginTop: 4 }}>
                      {data.customerList.filter(c => !c.cleared).length}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Active credit customers</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Cleared Accounts</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.success, marginTop: 4 }}>
                      {data.customerList.filter(c => c.cleared).length}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Fully recovered accounts</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Empty Cylinders Due</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#d97706", marginTop: 4 }}>
                      {data.totalEmptyDue}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Empty bottles unreturned</div>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <input
                    type="text"
                    className="inp"
                    placeholder="🔍 Search customer name or remarks..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ fontSize: 13, padding: "8px 12px", width: "100%", maxWidth: 400 }}
                  />
                </div>

                <div className="card">
                  <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="card-head-title">📋 Customer Credit Ledger ({filteredList.length})</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Customer Name</th>
                          <th>Credit Date</th>
                          <th>Product</th>
                          <th style={{ textAlign: "right" }}>Original Credit</th>
                          <th style={{ textAlign: "right" }}>Recovered</th>
                          <th style={{ textAlign: "right" }}>Balance Due (₹)</th>
                          <th style={{ textAlign: "center" }}>Empty Due</th>
                          <th style={{ textAlign: "center" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredList.map(c => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 700, color: T.ink }}>
                              {c.customerName}
                              {c.remarks && <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 400 }}>{c.remarks}</div>}
                            </td>
                            <td style={{ color: T.inkMid }}>{fmtDate(c.date)}</td>
                            <td>
                              <span style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>
                                {c.productName}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", color: T.inkMid }}>{inr(c.originalAmt)}</td>
                            <td style={{ textAlign: "right", color: T.success, fontWeight: 600 }}>{inr(c.recovered)}</td>
                            <td style={{ textAlign: "right", fontWeight: 800, color: c.remaining > 0 ? T.danger : T.success, fontSize: 13.5 }}>
                              {inr(c.remaining)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {c.empDue > 0 ? (
                                <span style={{ color: "#d97706", fontWeight: 700, background: "#fffbeb", padding: "2px 6px", borderRadius: 4 }}>
                                  ↑ {c.empDue} cyl
                                </span>
                              ) : (
                                <span style={{ color: T.inkLight, fontSize: 11 }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className={`badge ${c.cleared ? "badge-success" : "badge-danger"}`}>
                                {c.cleared ? "CLEARED" : "DUE"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════
              CASE 7: BOB BANK DEPOSIT REPORT
          ══════════════════════════════════════════════════════════ */}
          {type === "bob" && (() => {
            const data = bobData;
            return (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 18 }}>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Total Bank Deposits</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#2563eb", marginTop: 4 }}>{inr(data.totalDeposit)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Bank of Baroda Deposit Account</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Average Daily Deposit</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, marginTop: 4 }}>{inr(data.avgDeposit)}</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>On days with deposits</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: "14px 18px", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadowSm }}>
                    <div style={{ fontSize: 11, color: T.inkLight, fontWeight: 700, textTransform: "uppercase" }}>Deposit Days</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: T.success, marginTop: 4 }}>{data.depositCount} Days</div>
                    <div style={{ fontSize: 11, color: T.inkMid, marginTop: 2 }}>Out of {rangeEntries.length} total entries</div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-head">
                    <span className="card-head-title">🏦 Day-Wise Bank Deposit Log</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: "right" }}>Deposited Amount (₹)</th>
                          {onViewDay && <th style={{ textAlign: "center" }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {data.list.length === 0 ? (
                          <tr>
                            <td colSpan={onViewDay ? 3 : 2} style={{ textAlign: "center", padding: "20px 12px", color: T.inkLight }}>
                              No bank deposits recorded in this date range.
                            </td>
                          </tr>
                        ) : (
                          data.list.map(d => (
                            <tr key={d.date}>
                              <td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td>
                              <td style={{ textAlign: "right", fontWeight: 800, color: "#2563eb", fontSize: 14 }}>{inr(d.amt)}</td>
                              {onViewDay && (
                                <td style={{ textAlign: "center" }}>
                                  <button className="btn-ghost" style={{ padding: "2px 8px", fontSize: 10.5 }} onClick={() => { onClose(); onViewDay(d.entry); }}>
                                    View ↗
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: "12px 24px",
          background: "#ffffff",
          borderTop: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{ fontSize: 12, color: T.inkLight }}>
            Reporting Date Range: <strong>{rangeLabel}</strong>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ padding: "8px 22px", fontSize: 12.5 }}
            onClick={onClose}
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
