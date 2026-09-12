import React, { useState, useMemo } from "react";
import { T } from "../styles";
import { inr, num, fmtDate, fmtMonth, todayStr, downloadCsv } from "../constants";

export default function SharedSalaryReport({ entries = [], employees = [], isAdmin = false }) {
  // Current month string "YYYY-MM"
  const currentMonthStr = todayStr().slice(0, 7);

  // Tab View Mode: "month" (Month-wise all employees) | "employee" (Employee-wise historical ledger)
  const [viewMode, setViewMode] = useState("month");

  // Selected month for Month-wise view
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);

  // Selected employee for Employee-wise view
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0] ? String(employees[0].id) : "");

  // All salary payments flattened across all days with entry dates & target months
  const allPayments = useMemo(() => {
    return (entries || []).flatMap(e =>
      (e.salaryPayments || []).map(p => ({
        ...p,
        date: e.date,
        effectiveMonth: p.forMonth || (e.date ? e.date.slice(0, 7) : currentMonthStr)
      }))
    );
  }, [entries, currentMonthStr]);

  // Available unique months list (sorted newest first)
  const availableMonths = useMemo(() => {
    const set = new Set();
    set.add(currentMonthStr);
    (entries || []).forEach(e => { if (e.date) set.add(e.date.slice(0, 7)); });
    allPayments.forEach(p => { if (p.effectiveMonth) set.add(p.effectiveMonth); });
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [entries, allPayments, currentMonthStr]);

  // Month navigation helpers
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

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

  // Year choices
  const entryYears = (entries || []).map(e => parseInt(e.date?.slice(0, 4))).filter(Boolean);
  const thisYear = new Date().getFullYear();
  const minYear = Math.min(thisYear - 2, ...entryYears, 2024);
  const maxYear = Math.max(thisYear + 2, ...entryYears, 2028);
  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) yearOptions.push(y);

  // ════════════════════════════════════════════════════════════════
  // 1. MONTH-WISE COMPUTATIONS (For selectedMonth across all employees)
  // ════════════════════════════════════════════════════════════════
  const monthSummaries = useMemo(() => {
    return (employees || []).map(emp => {
      const empPayments = allPayments.filter(
        p => String(p.employeeId) === String(emp.id) && p.effectiveMonth === selectedMonth
      );
      const baseSalary = num(emp.salary || emp.base_salary || emp.baseSalary || 12000);
      const advance = empPayments.filter(p => p.type === "Advance").reduce((s, p) => s + num(p.amt), 0);
      const salaryPaid = empPayments.filter(p => p.type === "Salary").reduce((s, p) => s + num(p.amt), 0);
      const totalPaid = advance + salaryPaid;
      const balance = baseSalary - totalPaid;
      return {
        ...emp,
        baseSalary,
        advance,
        salaryPaid,
        totalPaid,
        balance,
        paymentCount: empPayments.length
      };
    });
  }, [employees, allPayments, selectedMonth]);

  const monthTotals = useMemo(() => {
    return monthSummaries.reduce(
      (acc, s) => {
        acc.baseSalary += s.baseSalary;
        acc.advance += s.advance;
        acc.salaryPaid += s.salaryPaid;
        acc.totalPaid += s.totalPaid;
        if (s.balance > 0) acc.totalDue += s.balance;
        if (s.balance < 0) acc.totalOverpaid += Math.abs(s.balance);
        return acc;
      },
      { baseSalary: 0, advance: 0, salaryPaid: 0, totalPaid: 0, totalDue: 0, totalOverpaid: 0 }
    );
  }, [monthSummaries]);

  // All individual payments for selected month
  const monthIndividualPayments = useMemo(() => {
    return allPayments
      .filter(p => p.effectiveMonth === selectedMonth)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allPayments, selectedMonth]);

  // ════════════════════════════════════════════════════════════════
  // 2. EMPLOYEE-WISE COMPUTATIONS (Month-by-month for selected employee)
  // ════════════════════════════════════════════════════════════════
  const currentSelectedEmp = useMemo(() => {
    return (employees || []).find(e => String(e.id) === String(selectedEmpId)) || employees[0] || null;
  }, [employees, selectedEmpId]);

  const empMonthByMonth = useMemo(() => {
    if (!currentSelectedEmp) return [];
    const baseSalary = num(currentSelectedEmp.salary || currentSelectedEmp.base_salary || currentSelectedEmp.baseSalary || 12000);

    return availableMonths.map(mStr => {
      const mPayments = allPayments.filter(
        p => String(p.employeeId) === String(currentSelectedEmp.id) && p.effectiveMonth === mStr
      );
      const advance = mPayments.filter(p => p.type === "Advance").reduce((s, p) => s + num(p.amt), 0);
      const salaryPaid = mPayments.filter(p => p.type === "Salary").reduce((s, p) => s + num(p.amt), 0);
      const totalPaid = advance + salaryPaid;
      const balance = baseSalary - totalPaid;
      return {
        month: mStr,
        baseSalary,
        advance,
        salaryPaid,
        totalPaid,
        balance,
        payments: mPayments
      };
    });
  }, [currentSelectedEmp, availableMonths, allPayments]);

  const empLifetimeTotals = useMemo(() => {
    return empMonthByMonth.reduce(
      (acc, m) => {
        acc.totalBase += m.baseSalary;
        acc.totalAdvance += m.advance;
        acc.totalSalaryPaid += m.salaryPaid;
        acc.totalPaid += m.totalPaid;
        if (m.balance > 0) acc.totalDue += m.balance;
        if (m.balance < 0) acc.totalOverpaid += Math.abs(m.balance);
        return acc;
      },
      { totalBase: 0, totalAdvance: 0, totalSalaryPaid: 0, totalPaid: 0, totalDue: 0, totalOverpaid: 0 }
    );
  }, [empMonthByMonth]);

  const empIndividualPayments = useMemo(() => {
    if (!currentSelectedEmp) return [];
    return allPayments
      .filter(p => String(p.employeeId) === String(currentSelectedEmp.id))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [currentSelectedEmp, allPayments]);

  // CSV Export helpers
  const exportMonthCsv = () => {
    const filename = `salary-report_${selectedMonth}.csv`;
    const headers = ["Employee Name", "Role", "Month", "Base Salary", "Advance Taken", "Salary Paid", "Total Paid", "Balance Due", "Status"];
    const rows = monthSummaries.map(s => [
      s.name,
      s.role,
      selectedMonth,
      s.baseSalary,
      s.advance,
      s.salaryPaid,
      s.totalPaid,
      s.balance,
      s.balance < 0 ? "OVERPAID" : s.balance === 0 ? "SETTLED" : "DUE"
    ]);
    downloadCsv(filename, headers, rows);
  };

  const exportEmployeeCsv = () => {
    if (!currentSelectedEmp) return;
    const filename = `salary-ledger_${currentSelectedEmp.name.replace(/\s+/g, '_')}.csv`;
    const headers = ["Month", "Base Salary", "Advance Taken", "Salary Paid", "Total Paid", "Balance Due", "Status"];
    const rows = empMonthByMonth.map(m => [
      m.month,
      m.baseSalary,
      m.advance,
      m.salaryPaid,
      m.totalPaid,
      m.balance,
      m.balance < 0 ? "OVERPAID" : m.balance === 0 ? "SETTLED" : "DUE"
    ]);
    downloadCsv(filename, headers, rows);
  };

  const switchToEmployee = (empId) => {
    setSelectedEmpId(String(empId));
    setViewMode("employee");
  };

  return (
    <div className="fade-in">
      {/* ── Mode Switcher & Export Header ── */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 18,
        flexWrap: "wrap",
        gap: 12
      }}>
        {/* Toggle Pills */}
        <div style={{
          display: "flex",
          background: "#ffffff",
          padding: "4px",
          borderRadius: 12,
          border: `1.5px solid ${T.border}`,
          boxShadow: T.shadowSm
        }}>
          <button
            type="button"
            style={{
              padding: "8px 20px",
              borderRadius: 9,
              border: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: viewMode === "month" ? T.accentGradient : "transparent",
              color: viewMode === "month" ? "#ffffff" : "#64748b",
              boxShadow: viewMode === "month" ? "0 4px 12px rgba(234, 88, 12, 0.25)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
            onClick={() => setViewMode("month")}
          >
            <span>📅</span> Month-Wise Overview
          </button>
          <button
            type="button"
            style={{
              padding: "8px 20px",
              borderRadius: 9,
              border: "none",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: viewMode === "employee" ? "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)" : "transparent",
              color: viewMode === "employee" ? "#ffffff" : "#64748b",
              boxShadow: viewMode === "employee" ? "0 4px 12px rgba(37, 99, 235, 0.25)" : "none",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
            onClick={() => setViewMode("employee")}
          >
            <span>👤</span> Employee-Wise Statement
          </button>
        </div>

        {/* Action Button */}
        <div>
          <button
            className="btn-ghost"
            style={{ fontSize: 12, fontWeight: 700, gap: 6 }}
            onClick={viewMode === "month" ? exportMonthCsv : exportEmployeeCsv}
          >
            <span>📥</span> Export CSV ({viewMode === "month" ? "Month" : "Employee"})
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          VIEW MODE 1: MONTH-WISE OVERVIEW
         ════════════════════════════════════════════════════════════════ */}
      {viewMode === "month" && (
        <div className="fade-in">
          {/* Month / Year Selector Toolbar */}
          <div className="card" style={{ marginBottom: 18, padding: "14px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: T.shadowSm }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(234, 88, 12, 0.08)",
                border: "1px solid rgba(234, 88, 12, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20
              }}>
                🗓️
              </div>
              <div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: 18, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
                  {monthNames[selMonthNum - 1]} {selYear}
                  {selectedMonth === currentMonthStr && (
                    <span className="badge badge-success" style={{ fontSize: 10, padding: "2px 8px" }}>Current Month</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
                  Payroll statement for {employees.length} employees · {monthIndividualPayments.length} payouts recorded
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button className="btn-ghost" onClick={handlePrevMonth} title="Previous Month" style={{ padding: "7px 14px", fontWeight: 700 }}>
                ◀ Prev
              </button>
              
              <select 
                className="inp" 
                value={selMonthNum} 
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                style={{ width: 140, fontWeight: 600, padding: "7px 12px" }}
              >
                {monthNames.map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>

              <select 
                className="inp" 
                value={selYear} 
                onChange={(e) => handleYearChange(Number(e.target.value))}
                style={{ width: 90, fontWeight: 600, padding: "7px 12px" }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button className="btn-ghost" onClick={handleNextMonth} title="Next Month" style={{ padding: "7px 14px", fontWeight: 700 }}>
                Next ▶
              </button>

              {selectedMonth !== currentMonthStr && (
                <button 
                  className="btn-ghost" 
                  onClick={() => setSelectedMonth(currentMonthStr)} 
                  style={{ borderColor: T.accent, color: T.accent, fontWeight: 700, padding: "7px 14px" }}
                >
                  Current Month
                </button>
              )}
            </div>
          </div>

          {/* Month KPI Summary Cards */}
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat-card" style={{ "--kpi-color": "#0f172a" }}>
              <div className="stat-val">{inr(monthTotals.baseSalary)}</div>
              <div className="stat-lbl">Total Base Payroll</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>{employees.length} Active Staff</div>
            </div>

            <div className="stat-card" style={{ "--kpi-color": T.warn }}>
              <div className="stat-val" style={{ color: T.warn }}>{inr(monthTotals.advance)}</div>
              <div className="stat-lbl">Advance Taken</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Early mid-month withdrawals</div>
            </div>

            <div className="stat-card" style={{ "--kpi-color": T.blue }}>
              <div className="stat-val" style={{ color: T.blue }}>{inr(monthTotals.salaryPaid)}</div>
              <div className="stat-lbl">Salary Payouts</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Net settlements disbursed</div>
            </div>

            <div className="stat-card" style={{ "--kpi-color": T.success }}>
              <div className="stat-val" style={{ color: T.success }}>{inr(monthTotals.totalPaid)}</div>
              <div className="stat-lbl">Total Disbursed</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Advance + Salary</div>
            </div>

            <div className="stat-card" style={{
              "--kpi-color": monthTotals.totalDue > 0 ? T.danger : T.success,
              background: monthTotals.totalDue > 0 ? "rgba(225, 29, 72, 0.03)" : "rgba(5, 150, 105, 0.03)"
            }}>
              <div className="stat-val" style={{ color: monthTotals.totalDue > 0 ? T.danger : T.success }}>
                {inr(monthTotals.totalDue)}
              </div>
              <div className="stat-lbl" style={{ fontWeight: 800 }}>
                {monthTotals.totalDue > 0 ? "Pending Salary Due" : "All Salaries Settled"}
              </div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>
                {monthTotals.totalOverpaid > 0 ? `Over-advance: ${inr(monthTotals.totalOverpaid)}` : "For " + monthNames[selMonthNum - 1]}
              </div>
            </div>
          </div>

          {/* Monthly Balance Sheet Table */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <span className="card-head-title">
                📊 Monthly Balance Sheet ({monthNames[selMonthNum - 1]} {selYear})
              </span>
              <span style={{ fontSize: 11.5, color: T.inkLight }}>Click any employee row to drill down into their statement</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl" style={{ minWidth: 840 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Employee</th>
                    <th style={{ textAlign: "right" }}>Base Salary</th>
                    <th style={{ textAlign: "right" }}>Advance</th>
                    <th style={{ textAlign: "right" }}>Salary Paid</th>
                    <th style={{ textAlign: "right" }}>Total Paid</th>
                    <th style={{ textAlign: "right" }}>Balance Remaining</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {monthSummaries.map((s) => (
                    <tr
                      key={s.id}
                      style={{ cursor: "pointer", transition: "background 0.15s ease" }}
                      onClick={() => switchToEmployee(s.id)}
                      title={`View ${s.name}'s month-by-month historical statement`}
                    >
                      <td style={{ textAlign: "left" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            background: "rgba(234, 88, 12, 0.1)",
                            color: T.accent,
                            fontWeight: 800,
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}>
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: T.inkLight }}>{s.role}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: T.ink }}>{inr(s.baseSalary)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: s.advance > 0 ? T.warn : T.inkLight }}>
                        {s.advance > 0 ? inr(s.advance) : "₹0"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: s.salaryPaid > 0 ? T.blue : T.inkLight }}>
                        {s.salaryPaid > 0 ? inr(s.salaryPaid) : "₹0"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: T.ink }}>{inr(s.totalPaid)}</td>
                      <td style={{ textAlign: "right", fontWeight: 800, color: s.balance < 0 ? T.danger : s.balance === 0 ? T.success : "#ea580c" }}>
                        {inr(s.balance)}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {s.balance < 0 ? (
                          <span className="badge badge-danger">OVERPAID</span>
                        ) : s.balance === 0 ? (
                          <span className="badge badge-success">SETTLED</span>
                        ) : (
                          <span className="badge badge-warn">DUE</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, borderColor: T.border }}
                          onClick={(e) => {
                            e.stopPropagation();
                            switchToEmployee(s.id);
                          }}
                        >
                          View Ledger ➔
                        </button>
                      </td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="tbl-total">
                    <td style={{ textAlign: "left", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>
                      Total ({employees.length} Staff)
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: T.ink }}>{inr(monthTotals.baseSalary)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: T.warn }}>{inr(monthTotals.advance)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: T.blue }}>{inr(monthTotals.salaryPaid)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: T.ink }}>{inr(monthTotals.totalPaid)}</td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: monthTotals.totalDue > 0 ? T.danger : T.success }}>
                      {inr(monthTotals.totalDue)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Month's Individual Payout Transaction Records */}
          <div className="card">
            <div className="card-head">
              <span className="card-head-title">🧾 Payout Log for {monthNames[selMonthNum - 1]} {selYear}</span>
              <span style={{ fontSize: 11.5, color: T.inkLight }}>{monthIndividualPayments.length} recorded payments</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date Paid</th>
                    <th style={{ textAlign: "left" }}>Employee</th>
                    <th style={{ textAlign: "center" }}>Type</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th style={{ textAlign: "left" }}>Notes / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {monthIndividualPayments.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", padding: "28px 10px", color: T.inkLight }}>
                        No salary or advance payouts recorded for this month.
                      </td>
                    </tr>
                  )}
                  {monthIndividualPayments.map((p, idx) => (
                    <tr key={p.id || idx}>
                      <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDate(p.date)}</td>
                      <td style={{ textAlign: "left", fontWeight: 700, color: T.ink }}>{p.employeeName || "Employee"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`badge ${p.type === "Salary" ? "badge-blue" : "badge-warn"}`}>
                          {p.type}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: T.danger }}>
                        {inr(p.amt)}
                      </td>
                      <td style={{ textAlign: "left", fontSize: 12, color: T.inkMid }}>
                        {p.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          VIEW MODE 2: EMPLOYEE-WISE STATEMENT
         ════════════════════════════════════════════════════════════════ */}
      {viewMode === "employee" && (
        <div className="fade-in">
          {/* Employee Selector Bar */}
          <div className="card" style={{ marginBottom: 18, padding: "14px 20px", background: "#ffffff", border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: T.shadowSm }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>👤</span>
                <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 16, fontWeight: 700, color: T.ink }}>
                  Select Employee for Full Historical Statement
                </span>
              </div>
              <div style={{ fontSize: 12, color: T.inkLight }}>
                Click any staff member or choose from the dropdown
              </div>
            </div>

            {/* Quick Pills for Staff */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(employees || []).map(emp => {
                const isSelected = String(emp.id) === String(selectedEmpId);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    style={{
                      padding: "8px 16px",
                      borderRadius: 10,
                      border: `1.5px solid ${isSelected ? T.blue : T.border}`,
                      background: isSelected ? "rgba(37, 99, 235, 0.08)" : "#f8fafc",
                      color: isSelected ? T.blue : T.ink,
                      fontWeight: isSelected ? 800 : 600,
                      fontSize: 12.5,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.18s ease"
                    }}
                    onClick={() => setSelectedEmpId(String(emp.id))}
                  >
                    <span style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: isSelected ? T.blue : "#cbd5e1",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 800,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      {emp.name.charAt(0).toUpperCase()}
                    </span>
                    <span>{emp.name}</span>
                    <span style={{ fontSize: 10, color: isSelected ? T.blue : T.inkLight, fontWeight: 500 }}>
                      ({emp.role})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Employee Profile Summary */}
          {currentSelectedEmp && (
            <>
              <div className="stat-row" style={{ marginBottom: 18 }}>
                <div className="stat-card" style={{ "--kpi-color": T.accent, minWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: T.accentGradient,
                      color: "#ffffff",
                      fontSize: 18,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 4px 10px rgba(234, 88, 12, 0.3)"
                    }}>
                      {currentSelectedEmp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, color: T.ink }}>
                        {currentSelectedEmp.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.inkLight, fontWeight: 600 }}>
                        {currentSelectedEmp.role} {currentSelectedEmp.phone ? `· 📞 ${currentSelectedEmp.phone}` : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: T.inkMid, borderTop: "1px solid #f1f5f9", paddingTop: 6 }}>
                    Base: <strong style={{ color: T.accent }}>{inr(num(currentSelectedEmp.salary || 12000))}/mo</strong>
                  </div>
                </div>

                <div className="stat-card" style={{ "--kpi-color": T.warn }}>
                  <div className="stat-val" style={{ color: T.warn }}>{inr(empLifetimeTotals.totalAdvance)}</div>
                  <div className="stat-lbl">Lifetime Advance Taken</div>
                  <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Across all recorded months</div>
                </div>

                <div className="stat-card" style={{ "--kpi-color": T.blue }}>
                  <div className="stat-val" style={{ color: T.blue }}>{inr(empLifetimeTotals.totalSalaryPaid)}</div>
                  <div className="stat-lbl">Lifetime Salary Paid</div>
                  <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Net settlements disbursed</div>
                </div>

                <div className="stat-card" style={{ "--kpi-color": T.success }}>
                  <div className="stat-val" style={{ color: T.success }}>{inr(empLifetimeTotals.totalPaid)}</div>
                  <div className="stat-lbl">Total Received by Employee</div>
                  <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Advance + Salary total</div>
                </div>

                <div className="stat-card" style={{
                  "--kpi-color": empLifetimeTotals.totalDue > 0 ? T.danger : T.success,
                  background: empLifetimeTotals.totalDue > 0 ? "rgba(225, 29, 72, 0.03)" : "rgba(5, 150, 105, 0.03)"
                }}>
                  <div className="stat-val" style={{ color: empLifetimeTotals.totalDue > 0 ? T.danger : T.success }}>
                    {inr(empLifetimeTotals.totalDue)}
                  </div>
                  <div className="stat-lbl" style={{ fontWeight: 800 }}>Total Balance Due</div>
                  <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>
                    {empLifetimeTotals.totalOverpaid > 0 ? `Over-advance: ${inr(empLifetimeTotals.totalOverpaid)}` : "All settled"}
                  </div>
                </div>
              </div>

              {/* Month-by-Month Statement Table */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-head">
                  <span className="card-head-title">
                    📅 Month-by-Month Salary History: {currentSelectedEmp.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: T.inkLight }}>Full ledger breakdown by calendar month</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl" style={{ minWidth: 800 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Accounting Month</th>
                        <th style={{ textAlign: "right" }}>Base Salary</th>
                        <th style={{ textAlign: "right" }}>Advance Taken</th>
                        <th style={{ textAlign: "right" }}>Salary Paid</th>
                        <th style={{ textAlign: "right" }}>Total Disbursed</th>
                        <th style={{ textAlign: "right" }}>Month Balance</th>
                        <th style={{ textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empMonthByMonth.map((m) => {
                        const [y, mNum] = m.month.split("-").map(Number);
                        const label = `${monthNames[mNum - 1]} ${y}`;
                        const isCurr = m.month === currentMonthStr;
                        return (
                          <tr key={m.month}>
                            <td style={{ textAlign: "left", fontWeight: 700, color: T.ink }}>
                              <span>{label}</span>
                              {isCurr && (
                                <span className="badge badge-success" style={{ marginLeft: 8, fontSize: 9, padding: "1px 6px" }}>
                                  Current
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(m.baseSalary)}</td>
                            <td style={{ textAlign: "right", fontWeight: 600, color: m.advance > 0 ? T.warn : T.inkLight }}>
                              {m.advance > 0 ? inr(m.advance) : "₹0"}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600, color: m.salaryPaid > 0 ? T.blue : T.inkLight }}>
                              {m.salaryPaid > 0 ? inr(m.salaryPaid) : "₹0"}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: T.ink }}>{inr(m.totalPaid)}</td>
                            <td style={{ textAlign: "right", fontWeight: 800, color: m.balance < 0 ? T.danger : m.balance === 0 ? T.success : "#ea580c" }}>
                              {inr(m.balance)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              {m.balance < 0 ? (
                                <span className="badge badge-danger">OVERPAID</span>
                              ) : m.balance === 0 ? (
                                <span className="badge badge-success">SETTLED</span>
                              ) : (
                                <span className="badge badge-warn">DUE</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Individual Transactions Log */}
              <div className="card">
                <div className="card-head">
                  <span className="card-head-title">
                    📜 Lifetime Payment Log: {currentSelectedEmp.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: T.inkLight }}>{empIndividualPayments.length} recorded payments</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Date Paid</th>
                        <th style={{ textAlign: "center" }}>Type</th>
                        <th style={{ textAlign: "center" }}>Target Month</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                        <th style={{ textAlign: "left" }}>Notes / Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empIndividualPayments.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", padding: "28px 10px", color: T.inkLight }}>
                            No payment transactions recorded yet for this employee.
                          </td>
                        </tr>
                      )}
                      {empIndividualPayments.map((p, idx) => (
                        <tr key={p.id || idx}>
                          <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDate(p.date)}</td>
                          <td style={{ textAlign: "center" }}>
                            <span className={`badge ${p.type === "Salary" ? "badge-blue" : "badge-warn"}`}>
                              {p.type}
                            </span>
                          </td>
                          <td style={{ textAlign: "center", fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                            {p.forMonth || p.date.slice(0, 7)}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: T.danger }}>
                            {inr(p.amt)}
                          </td>
                          <td style={{ textAlign: "left", fontSize: 12, color: T.inkMid }}>
                            {p.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
