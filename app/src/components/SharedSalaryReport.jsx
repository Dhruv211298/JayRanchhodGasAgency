import React, { useState, useMemo } from "react";
import Swal from "sweetalert2";
import { T } from "../styles";
import { inr, num, fmtDate, fmtMonth, todayStr, downloadCsv } from "../constants";
import { api } from "../api";

// System went live in August 2026 — accounting for salaries starts strictly from this date
const SYSTEM_START_MONTH = "2026-08";

/**
 * Computes a running balance ledger across chronological months for an employee.
 * Any overpaid balance (negative) or unpaid balance (positive) carries forward into the next month.
 * Any monthly leave/absence adjustments reduce net entitlement without affecting godown cash.
 */
function computeEmpLedger(emp, monthsList, payments, adjustments = [], systemStartMonth = SYSTEM_START_MONTH) {
  if (!emp) return {};
  const rawJoin = emp.join_date || emp.joinDate || "";
  const empJoinMonth = rawJoin ? rawJoin.slice(0, 7) : systemStartMonth;
  const empStartMonth = empJoinMonth > systemStartMonth ? empJoinMonth : systemStartMonth;
  const baseSalary = num(emp.salary || emp.base_salary || emp.baseSalary || 12000);

  // Chronological order (oldest to newest: e.g. "2026-08", "2026-09")
  const chrono = [...monthsList].sort((a, b) => a.localeCompare(b));
  let runningCarryForward = 0;
  const ledger = {};

  for (const mStr of chrono) {
    if (mStr < empStartMonth) {
      ledger[mStr] = {
        month: mStr,
        notJoinedYet: true,
        baseSalary: 0,
        carryForward: 0,
        deduction: 0,
        addition: 0,
        adjNotes: "",
        netPayable: 0,
        advance: 0,
        salaryPaid: 0,
        totalPaid: 0,
        balance: 0,
        payments: []
      };
      continue;
    }

    const mPayments = payments.filter(
      p => String(p.employeeId) === String(emp.id) && p.effectiveMonth === mStr
    );
    const advance = mPayments.filter(p => p.type === "Advance").reduce((s, p) => s + num(p.amt), 0);
    const salaryPaid = mPayments.filter(p => p.type === "Salary").reduce((s, p) => s + num(p.amt), 0);
    const totalPaid = advance + salaryPaid;

    // Monthly adjustment (leave cut / settlement notes)
    const mAdj = (adjustments || []).find(
      a => String(a.employeeId) === String(emp.id) && a.forMonth === mStr
    ) || { deduction: 0, addition: 0, notes: "" };
    const deduction = num(mAdj.deduction);
    const addition = num(mAdj.addition);
    const adjNotes = mAdj.notes || "";

    const carryForward = runningCarryForward;
    // Net entitlement for this month = Base + CarryForward - Leave/Absence Deduction + Bonus
    const netPayable = baseSalary + carryForward - deduction + addition;
    const balance = netPayable - totalPaid;

    ledger[mStr] = {
      month: mStr,
      notJoinedYet: false,
      baseSalary,
      carryForward,
      deduction,
      addition,
      adjNotes,
      netPayable,
      advance,
      salaryPaid,
      totalPaid,
      balance,
      payments: mPayments
    };

    // Closing balance carries forward to the following month
    runningCarryForward = balance;
  }

  return ledger;
}

export default function SharedSalaryReport({
  entries = [],
  employees = [],
  salaryAdjustments = [],
  onSalaryAdjustmentsChanged,
  isAdmin = false
}) {
  // Current month string "YYYY-MM"
  const currentMonthStr = todayStr().slice(0, 7);

  // Tab View Mode: "month" (Month-wise all employees) | "employee" (Employee-wise historical ledger)
  const [viewMode, setViewMode] = useState("month");

  // Selected month for Month-wise view (default current month, clamped >= SYSTEM_START_MONTH)
  const [selectedMonth, setSelectedMonth] = useState(
    currentMonthStr >= SYSTEM_START_MONTH ? currentMonthStr : SYSTEM_START_MONTH
  );
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);

  // Selected employee for Employee-wise view
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0] ? String(employees[0].id) : "");

  // Bulk Settlement Modal state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkDraft, setBulkDraft] = useState({});
  const [savingBulk, setSavingBulk] = useState(false);

  // Single Employee Adjustment Modal state
  const [singleEmpModal, setSingleEmpModal] = useState(null);
  const [singleDeduction, setSingleDeduction] = useState(0);
  const [singleNotes, setSingleNotes] = useState("");
  const [savingSingle, setSavingSingle] = useState(false);

  // All salary payments flattened across all days with entry dates & target months
  // Strictly filter out any test entries or disbursements before system went live (August 2026)
  const allPayments = useMemo(() => {
    return (entries || [])
      .filter(e => e.date && e.date >= `${SYSTEM_START_MONTH}-01`)
      .flatMap(e =>
        (e.salaryPayments || []).map(p => ({
          ...p,
          date: e.date,
          effectiveMonth: p.forMonth || (e.date ? e.date.slice(0, 7) : currentMonthStr)
        }))
      )
      .filter(p => p.effectiveMonth >= SYSTEM_START_MONTH);
  }, [entries, currentMonthStr]);

  // Available unique months list (sorted newest first, strictly >= SYSTEM_START_MONTH)
  const availableMonths = useMemo(() => {
    const set = new Set();
    set.add(currentMonthStr);
    (entries || []).forEach(e => {
      if (e.date && e.date.slice(0, 7) >= SYSTEM_START_MONTH) {
        set.add(e.date.slice(0, 7));
      }
    });
    allPayments.forEach(p => {
      if (p.effectiveMonth && p.effectiveMonth >= SYSTEM_START_MONTH) {
        set.add(p.effectiveMonth);
      }
    });
    (salaryAdjustments || []).forEach(a => {
      if (a.forMonth && a.forMonth >= SYSTEM_START_MONTH) {
        set.add(a.forMonth);
      }
    });
    // Continuous calendar months from August 2026 up to current month
    const [startYear, startM] = SYSTEM_START_MONTH.split("-").map(Number);
    const [currYear, currM] = currentMonthStr.split("-").map(Number);
    let y = startYear;
    let m = startM;
    while (y < currYear || (y === currYear && m <= currM)) {
      set.add(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return Array.from(set)
      .filter(mStr => mStr >= SYSTEM_START_MONTH)
      .sort((a, b) => b.localeCompare(a));
  }, [entries, allPayments, salaryAdjustments, currentMonthStr]);

  // Month navigation helpers
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    const prevStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (prevStr >= SYSTEM_START_MONTH) {
      setSelectedMonth(prevStr);
    }
  };

  const handleNextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleMonthChange = (mNum) => {
    const targetStr = `${selYear}-${String(mNum).padStart(2, "0")}`;
    if (targetStr >= SYSTEM_START_MONTH) {
      setSelectedMonth(targetStr);
    }
  };

  const handleYearChange = (yNum) => {
    const targetStr = `${yNum}-${String(selMonthNum).padStart(2, "0")}`;
    if (targetStr >= SYSTEM_START_MONTH) {
      setSelectedMonth(targetStr);
    } else {
      setSelectedMonth(`${yNum}-08`);
    }
  };

  // Year choices (starting from 2026 when system went live)
  const entryYears = (entries || []).map(e => parseInt(e.date?.slice(0, 4))).filter(Boolean);
  const thisYear = new Date().getFullYear();
  const minYear = 2026;
  const maxYear = Math.max(thisYear + 2, ...entryYears, 2028);
  const yearOptions = [];
  for (let y = minYear; y <= maxYear; y++) yearOptions.push(y);

  // ════════════════════════════════════════════════════════════════
  // 1. MONTH-WISE COMPUTATIONS (For selectedMonth across all employees)
  // ════════════════════════════════════════════════════════════════
  const monthSummaries = useMemo(() => {
    return (employees || []).map(emp => {
      const ledger = computeEmpLedger(emp, availableMonths, allPayments, salaryAdjustments, SYSTEM_START_MONTH);
      const row = ledger[selectedMonth] || {
        baseSalary: num(emp.salary || emp.base_salary || emp.baseSalary || 12000),
        carryForward: 0,
        deduction: 0,
        addition: 0,
        adjNotes: "",
        netPayable: num(emp.salary || emp.base_salary || emp.baseSalary || 12000),
        advance: 0,
        salaryPaid: 0,
        totalPaid: 0,
        balance: num(emp.salary || emp.base_salary || emp.baseSalary || 12000),
        notJoinedYet: false,
        payments: []
      };
      return {
        ...emp,
        baseSalary: row.baseSalary,
        carryForward: row.carryForward,
        deduction: row.deduction,
        addition: row.addition,
        adjNotes: row.adjNotes,
        netPayable: row.netPayable,
        advance: row.advance,
        salaryPaid: row.salaryPaid,
        totalPaid: row.totalPaid,
        balance: row.balance,
        notJoinedYet: row.notJoinedYet,
        paymentCount: (row.payments || []).length
      };
    });
  }, [employees, allPayments, salaryAdjustments, selectedMonth, availableMonths]);

  const monthTotals = useMemo(() => {
    return monthSummaries.reduce(
      (acc, s) => {
        acc.baseSalary += s.baseSalary;
        acc.carryForward += s.carryForward;
        acc.deduction += s.deduction;
        acc.addition += s.addition;
        acc.netPayable += s.netPayable;
        acc.advance += s.advance;
        acc.salaryPaid += s.salaryPaid;
        acc.totalPaid += s.totalPaid;
        if (s.balance > 0) acc.totalDue += s.balance;
        if (s.balance < 0) acc.totalOverpaid += Math.abs(s.balance);
        return acc;
      },
      { baseSalary: 0, carryForward: 0, deduction: 0, addition: 0, netPayable: 0, advance: 0, salaryPaid: 0, totalPaid: 0, totalDue: 0, totalOverpaid: 0 }
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
    const rawJoin = currentSelectedEmp.join_date || currentSelectedEmp.joinDate || "";
    const empJoinMonth = rawJoin ? rawJoin.slice(0, 7) : SYSTEM_START_MONTH;
    const empStartMonth = empJoinMonth > SYSTEM_START_MONTH ? empJoinMonth : SYSTEM_START_MONTH;

    const ledger = computeEmpLedger(currentSelectedEmp, availableMonths, allPayments, salaryAdjustments, SYSTEM_START_MONTH);
    const empMonths = availableMonths.filter(mStr => mStr >= empStartMonth);

    return empMonths.map(mStr => ledger[mStr] || {
      month: mStr,
      baseSalary: num(currentSelectedEmp.salary || currentSelectedEmp.base_salary || currentSelectedEmp.baseSalary || 12000),
      carryForward: 0,
      deduction: 0,
      addition: 0,
      adjNotes: "",
      netPayable: num(currentSelectedEmp.salary || currentSelectedEmp.base_salary || currentSelectedEmp.baseSalary || 12000),
      advance: 0,
      salaryPaid: 0,
      totalPaid: 0,
      balance: num(currentSelectedEmp.salary || currentSelectedEmp.base_salary || currentSelectedEmp.baseSalary || 12000),
      payments: []
    });
  }, [currentSelectedEmp, availableMonths, allPayments, salaryAdjustments]);

  const empLifetimeTotals = useMemo(() => {
    const totals = empMonthByMonth.reduce(
      (acc, m) => {
        acc.totalBase += m.baseSalary;
        acc.totalDeduction += m.deduction;
        acc.totalAdvance += m.advance;
        acc.totalSalaryPaid += m.salaryPaid;
        acc.totalPaid += m.totalPaid;
        return acc;
      },
      { totalBase: 0, totalDeduction: 0, totalAdvance: 0, totalSalaryPaid: 0, totalPaid: 0, totalDue: 0, totalOverpaid: 0 }
    );

    // In a running ledger, the latest active month's balance is the cumulative net position
    const latestBalance = empMonthByMonth[0]?.balance ?? 0;
    if (latestBalance > 0) {
      totals.totalDue = latestBalance;
      totals.totalOverpaid = 0;
    } else if (latestBalance < 0) {
      totals.totalDue = 0;
      totals.totalOverpaid = Math.abs(latestBalance);
    } else {
      totals.totalDue = 0;
      totals.totalOverpaid = 0;
    }

    return totals;
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
    const headers = [
      "Employee Name",
      "Role",
      "Month",
      "Base Salary",
      "Prev Carry Forward",
      "Leave Deduction",
      "Adjustment Notes",
      "Net Payable",
      "Advance Taken",
      "Salary Paid",
      "Total Disbursed",
      "Closing Balance",
      "Status"
    ];
    const rows = monthSummaries.map(s => [
      s.name,
      s.role,
      selectedMonth,
      s.baseSalary,
      s.carryForward,
      s.deduction,
      s.adjNotes || "",
      s.netPayable,
      s.advance,
      s.salaryPaid,
      s.totalPaid,
      s.balance,
      s.notJoinedYet ? "NOT JOINED" : s.balance < 0 ? "OVERPAID" : s.balance === 0 ? "SETTLED" : "DUE"
    ]);
    downloadCsv(filename, headers, rows);
  };

  const exportEmployeeCsv = () => {
    if (!currentSelectedEmp) return;
    const filename = `salary-ledger_${currentSelectedEmp.name.replace(/\s+/g, '_')}.csv`;
    const headers = [
      "Month",
      "Base Salary",
      "Prev Carry Forward",
      "Leave Deduction",
      "Adjustment Notes",
      "Net Payable",
      "Advance Taken",
      "Salary Paid",
      "Total Disbursed",
      "Month Balance",
      "Status"
    ];
    const rows = empMonthByMonth.map(m => [
      m.month,
      m.baseSalary,
      m.carryForward,
      m.deduction,
      m.adjNotes || "",
      m.netPayable,
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

  // ════════════════════════════════════════════════════════════════
  // 3. BULK SETTLEMENT / LEAVE DEDUCTIONS MODAL LOGIC
  // ════════════════════════════════════════════════════════════════
  const openBulkSettleModal = () => {
    const draft = {};
    monthSummaries.forEach(s => {
      const existing = (salaryAdjustments || []).find(
        a => String(a.employeeId) === String(s.id) && a.forMonth === selectedMonth
      );
      const currDeduction = existing ? num(existing.deduction) : 0;
      const currNotes = existing ? existing.notes || "" : "";
      // Gross due before any deduction = baseSalary + carryForward - totalPaid
      const grossDue = s.baseSalary + s.carryForward - s.totalPaid;

      draft[s.id] = {
        employeeId: s.id,
        name: s.name,
        role: s.role,
        baseSalary: s.baseSalary,
        carryForward: s.carryForward,
        advance: s.advance,
        salaryPaid: s.salaryPaid,
        totalPaid: s.totalPaid,
        grossDue,
        deduction: currDeduction,
        targetRemaining: grossDue - currDeduction,
        notes: currNotes
      };
    });
    setBulkDraft(draft);
    setShowBulkModal(true);
  };

  const handleBulkDeductionChange = (empId, newDeductionVal) => {
    const val = Math.max(0, num(newDeductionVal));
    setBulkDraft(prev => {
      const item = prev[empId];
      if (!item) return prev;
      return {
        ...prev,
        [empId]: {
          ...item,
          deduction: val,
          targetRemaining: item.grossDue - val
        }
      };
    });
  };

  const handleBulkTargetRemainingChange = (empId, newRemainingVal) => {
    const rem = num(newRemainingVal);
    setBulkDraft(prev => {
      const item = prev[empId];
      if (!item) return prev;
      const newDeduction = Math.max(0, item.grossDue - rem);
      return {
        ...prev,
        [empId]: {
          ...item,
          deduction: newDeduction,
          targetRemaining: rem
        }
      };
    });
  };

  const handleBulkNotesChange = (empId, notesVal) => {
    setBulkDraft(prev => {
      const item = prev[empId];
      if (!item) return prev;
      return {
        ...prev,
        [empId]: {
          ...item,
          notes: notesVal
        }
      };
    });
  };

  const handleBulkSettleZero = (empId) => {
    setBulkDraft(prev => {
      const item = prev[empId];
      if (!item) return prev;
      const newDeduction = Math.max(0, item.grossDue);
      return {
        ...prev,
        [empId]: {
          ...item,
          deduction: newDeduction,
          targetRemaining: 0,
          notes: item.notes || "Settled to ₹0 (Leave cut)"
        }
      };
    });
  };

  const handleBulkReset = (empId) => {
    setBulkDraft(prev => {
      const item = prev[empId];
      if (!item) return prev;
      return {
        ...prev,
        [empId]: {
          ...item,
          deduction: 0,
          targetRemaining: item.grossDue,
          notes: ""
        }
      };
    });
  };

  const handleSaveBulk = async () => {
    setSavingBulk(true);
    try {
      const adjustmentsToSave = Object.values(bulkDraft).map(item => ({
        id: `adj-${item.employeeId}-${selectedMonth}`,
        employeeId: item.employeeId,
        forMonth: selectedMonth,
        deduction: item.deduction,
        addition: 0,
        notes: item.notes
      }));

      await api.saveSalaryAdjustments(adjustmentsToSave);
      setShowBulkModal(false);
      Swal.fire({
        icon: "success",
        title: "Settlement Saved",
        text: `Leave adjustments & settlements for ${monthNames[selMonthNum - 1]} ${selYear} saved successfully!`,
        timer: 1800,
        showConfirmButton: false
      });
      if (onSalaryAdjustmentsChanged) {
        await onSalaryAdjustmentsChanged();
      }
    } catch (err) {
      console.error("Save adjustments error:", err);
      Swal.fire({
        icon: "error",
        title: "Failed to Save",
        text: err.message || "Could not save adjustments. Please try again."
      });
    } finally {
      setSavingBulk(false);
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 4. SINGLE EMPLOYEE QUICK ADJUST MODAL LOGIC
  // ════════════════════════════════════════════════════════════════
  const openSingleEmpModal = (summaryRow) => {
    const existing = (salaryAdjustments || []).find(
      a => String(a.employeeId) === String(summaryRow.id) && a.forMonth === selectedMonth
    );
    const grossDue = summaryRow.baseSalary + summaryRow.carryForward - summaryRow.totalPaid;
    setSingleEmpModal({
      ...summaryRow,
      grossDue
    });
    setSingleDeduction(existing ? num(existing.deduction) : 0);
    setSingleNotes(existing ? existing.notes || "" : "");
  };

  const handleSaveSingle = async () => {
    if (!singleEmpModal) return;
    setSavingSingle(true);
    try {
      await api.saveSalaryAdjustments([
        {
          id: `adj-${singleEmpModal.id}-${selectedMonth}`,
          employeeId: singleEmpModal.id,
          forMonth: selectedMonth,
          deduction: Math.max(0, num(singleDeduction)),
          addition: 0,
          notes: singleNotes
        }
      ]);
      setSingleEmpModal(null);
      Swal.fire({
        icon: "success",
        title: "Adjusted",
        text: `Leave adjustment for ${singleEmpModal.name} saved!`,
        timer: 1500,
        showConfirmButton: false
      });
      if (onSalaryAdjustmentsChanged) {
        await onSalaryAdjustmentsChanged();
      }
    } catch (err) {
      console.error("Save single adjustment error:", err);
      Swal.fire({
        icon: "error",
        title: "Failed to Save",
        text: err.message || "Could not save adjustment."
      });
    } finally {
      setSavingSingle(false);
    }
  };

  // Bulk Modal live totals calculation
  const bulkTotals = useMemo(() => {
    const list = Object.values(bulkDraft);
    return list.reduce(
      (acc, it) => {
        acc.grossDue += it.grossDue;
        acc.deduction += it.deduction;
        acc.targetRemaining += it.targetRemaining;
        return acc;
      },
      { grossDue: 0, deduction: 0, targetRemaining: 0 }
    );
  }, [bulkDraft]);

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

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {isAdmin && viewMode === "month" && (
            <button
              type="button"
              className="btn-primary"
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                gap: 7,
                background: "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)",
                boxShadow: "0 4px 12px rgba(234, 88, 12, 0.28)",
                padding: "8px 16px"
              }}
              onClick={openBulkSettleModal}
              title="Settle unpaid salary debts or apply leave deductions across staff for this month"
            >
              <span>⚙️</span> Settle Month / Leave Deductions
            </button>
          )}

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
                  {monthTotals.deduction > 0 && (
                    <span className="badge" style={{ fontSize: 10, padding: "2px 8px", background: "rgba(124, 58, 237, 0.1)", color: "#7c3aed", border: "1px solid rgba(124, 58, 237, 0.25)" }}>
                      −{inr(monthTotals.deduction)} Leave Cuts
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
                  Payroll statement for {employees.length} employees · {monthIndividualPayments.length} payouts recorded
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn-ghost"
                onClick={handlePrevMonth}
                disabled={selectedMonth <= SYSTEM_START_MONTH}
                title={selectedMonth <= SYSTEM_START_MONTH ? "System start is August 2026" : "Previous Month"}
                style={{
                  padding: "7px 14px",
                  fontWeight: 700,
                  opacity: selectedMonth <= SYSTEM_START_MONTH ? 0.4 : 1,
                  cursor: selectedMonth <= SYSTEM_START_MONTH ? "not-allowed" : "pointer"
                }}
              >
                ◀ Prev
              </button>
              
              <select 
                className="inp" 
                value={selMonthNum} 
                onChange={(e) => handleMonthChange(Number(e.target.value))}
                style={{ width: 140, fontWeight: 600, padding: "7px 12px" }}
              >
                {monthNames.map((name, idx) => {
                  const mVal = idx + 1;
                  const isBeforeStart = selYear === 2026 && mVal < 8;
                  return (
                    <option key={mVal} value={mVal} disabled={isBeforeStart}>
                      {name} {isBeforeStart ? "(Pre-system)" : ""}
                    </option>
                  );
                })}
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

            <div className="stat-card" style={{ "--kpi-color": T.accent }}>
              <div className="stat-val" style={{ color: T.accent }}>{inr(monthTotals.netPayable)}</div>
              <div className="stat-lbl">Net Entitlement Payable</div>
              <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>
                {monthTotals.deduction > 0 ? (
                  <span style={{ color: "#7c3aed", fontWeight: 700 }}>
                    −{inr(monthTotals.deduction)} leave cuts
                    {monthTotals.carryForward !== 0 && ` · ${monthTotals.carryForward < 0 ? `−${inr(Math.abs(monthTotals.carryForward))}` : `+${inr(monthTotals.carryForward)}`} carry`}
                  </span>
                ) : monthTotals.carryForward < 0 ? (
                  `−${inr(Math.abs(monthTotals.carryForward))} carry-fwd deduction`
                ) : monthTotals.carryForward > 0 ? (
                  `+${inr(monthTotals.carryForward)} prior unpaid carry-fwd`
                ) : (
                  "No deductions or carry-fwd"
                )}
              </div>
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
                {monthTotals.totalDue === 0 ? (
                  <span style={{ color: T.success, fontWeight: 700 }}>✨ All staff fully settled (₹0)</span>
                ) : monthTotals.totalOverpaid > 0 ? (
                  `Over-advance: ${inr(monthTotals.totalOverpaid)}`
                ) : (
                  `For ${monthNames[selMonthNum - 1]}`
                )}
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
              <table className="tbl" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Employee</th>
                    <th style={{ textAlign: "right" }}>Base Salary</th>
                    <th style={{ textAlign: "right" }} title="Opening balance carried from previous month: negative for over-advance deductions, positive for unpaid salary">Prev. Carry-Fwd</th>
                    <th style={{ textAlign: "right" }} title="Staff leave or absence salary deductions (Admin managed)">Leave Cut</th>
                    <th style={{ textAlign: "right" }} title="Base Salary adjusted by Previous Carry-Forward and Leave Deductions">Net Payable</th>
                    <th style={{ textAlign: "right" }}>Advance</th>
                    <th style={{ textAlign: "right" }}>Salary Paid</th>
                    <th style={{ textAlign: "right" }}>Total Disbursed</th>
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
                      <td style={{ textAlign: "right", fontWeight: 600, color: T.ink }}>{inr(s.baseSalary)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {s.carryForward < 0 ? (
                          <span style={{ color: T.danger }} title="Overpaid in previous month">
                            −{inr(Math.abs(s.carryForward))}
                            <span style={{ fontSize: 9.5, display: "block", color: "#dc2626", fontWeight: 500 }}>Over-advance</span>
                          </span>
                        ) : s.carryForward > 0 ? (
                          <span style={{ color: T.blue }} title="Unpaid balance from previous month">
                            +{inr(s.carryForward)}
                            <span style={{ fontSize: 9.5, display: "block", color: T.inkLight, fontWeight: 500 }}>Prev. unpaid</span>
                          </span>
                        ) : (
                          <span style={{ color: T.inkLight }}>—</span>
                        )}
                      </td>

                      {/* Leave Cut / Deduction Column */}
                      <td style={{ textAlign: "right", fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          {s.deduction > 0 ? (
                            <span style={{ color: "#7c3aed" }} title={s.adjNotes ? `Reason: ${s.adjNotes}` : "Leave deduction"}>
                              −{inr(s.deduction)}
                              {s.adjNotes && (
                                <span style={{ fontSize: 9.5, display: "block", color: "#8b5cf6", fontWeight: 500 }}>
                                  {s.adjNotes.length > 15 ? s.adjNotes.slice(0, 15) + "…" : s.adjNotes}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: T.inkLight }}>—</span>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{
                                padding: "2px 6px",
                                fontSize: 11,
                                border: "1px solid #e2e8f0",
                                borderRadius: 6,
                                marginLeft: 4,
                                lineHeight: 1
                              }}
                              title="Adjust leave cut or settlement for this employee"
                              onClick={(e) => {
                                e.stopPropagation();
                                openSingleEmpModal(s);
                              }}
                            >
                              ✏️
                            </button>
                          )}
                        </div>
                      </td>

                      <td style={{ textAlign: "right", fontWeight: 700, color: T.ink }}>
                        {inr(s.netPayable)}
                      </td>
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
                        {s.notJoinedYet ? (
                          <span className="badge badge-ink" style={{ fontSize: 9.5 }}>NOT JOINED</span>
                        ) : s.balance < 0 ? (
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
                    <td style={{ textAlign: "right", fontWeight: 800, color: monthTotals.carryForward < 0 ? T.danger : monthTotals.carryForward > 0 ? T.blue : T.inkLight }}>
                      {monthTotals.carryForward < 0 ? `−${inr(Math.abs(monthTotals.carryForward))}` : monthTotals.carryForward > 0 ? `+${inr(monthTotals.carryForward)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: monthTotals.deduction > 0 ? "#7c3aed" : T.inkLight }}>
                      {monthTotals.deduction > 0 ? `−${inr(monthTotals.deduction)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 800, color: T.ink }}>{inr(monthTotals.netPayable)}</td>
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
                    <th style={{ textAlign: "center" }}>For Month</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th style={{ textAlign: "left" }}>Notes / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {monthIndividualPayments.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "28px 10px", color: T.inkLight }}>
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
                      <td style={{ textAlign: "center", fontSize: 12, color: T.inkMid, fontWeight: 600 }}>
                        {fmtMonth((p.forMonth || p.date.slice(0, 7)) + "-01")}
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
                Click any staff member or choose from the pills below
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
                    <span style={{ color: T.inkLight, marginLeft: 8, fontSize: 11 }}>
                      {currentSelectedEmp.join_date ? `· Joined ${fmtDate(currentSelectedEmp.join_date)}` : `· Online since Aug 2026`}
                    </span>
                  </div>
                </div>

                <div className="stat-card" style={{ "--kpi-color": T.warn }}>
                  <div className="stat-val" style={{ color: T.warn }}>{inr(empLifetimeTotals.totalAdvance)}</div>
                  <div className="stat-lbl">Lifetime Advance Taken</div>
                  <div className="stat-delta" style={{ color: T.inkLight, fontSize: 10.5 }}>Since Aug 2026</div>
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
                    {empLifetimeTotals.totalOverpaid > 0
                      ? `Over-advance: ${inr(empLifetimeTotals.totalOverpaid)}`
                      : empLifetimeTotals.totalDue > 0
                      ? `Pending: ${inr(empLifetimeTotals.totalDue)}`
                      : "All settled (₹0)"}
                  </div>
                </div>
              </div>

              {/* Month-by-Month Statement Table */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="card-head">
                  <span className="card-head-title">
                    📅 Month-by-Month Salary History: {currentSelectedEmp.name}
                  </span>
                  <span style={{ fontSize: 11.5, color: T.inkLight }}>Full ledger breakdown with previous carry-forward & leave adjustments</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="tbl" style={{ minWidth: 980 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Accounting Month</th>
                        <th style={{ textAlign: "right" }}>Base Salary</th>
                        <th style={{ textAlign: "right" }} title="Opening balance carried from previous month">Prev. Carry-Fwd</th>
                        <th style={{ textAlign: "right" }} title="Staff leave or absence deductions applied">Leave Cut</th>
                        <th style={{ textAlign: "right" }} title="Base Salary adjusted by Previous Carry-Forward and Leave Deductions">Net Payable</th>
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
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              {m.carryForward < 0 ? (
                                <span style={{ color: T.danger }} title="Overpaid in previous month">
                                  −{inr(Math.abs(m.carryForward))}
                                  <span style={{ fontSize: 9.5, display: "block", color: "#dc2626", fontWeight: 500 }}>Over-advance</span>
                                </span>
                              ) : m.carryForward > 0 ? (
                                <span style={{ color: T.blue }} title="Unpaid balance from previous month">
                                  +{inr(m.carryForward)}
                                  <span style={{ fontSize: 9.5, display: "block", color: T.inkLight, fontWeight: 500 }}>Prev. unpaid</span>
                                </span>
                              ) : (
                                <span style={{ color: T.inkLight }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>
                              {m.deduction > 0 ? (
                                <span style={{ color: "#7c3aed" }} title={m.adjNotes ? `Reason: ${m.adjNotes}` : "Leave deduction"}>
                                  −{inr(m.deduction)}
                                  {m.adjNotes && (
                                    <span style={{ fontSize: 9.5, display: "block", color: "#8b5cf6", fontWeight: 500 }}>
                                      {m.adjNotes}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ color: T.inkLight }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: T.ink }}>
                              {inr(m.netPayable)}
                            </td>
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
                            {fmtMonth((p.forMonth || p.date.slice(0, 7)) + "-01")}
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

      {/* ════════════════════════════════════════════════════════════════
          MODAL: BULK SETTLEMENT & LEAVE DEDUCTIONS (ADMIN ONLY)
         ════════════════════════════════════════════════════════════════ */}
      {showBulkModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1050,
          padding: 16
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: 24,
            width: "100%",
            maxWidth: 1040,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            maxHeight: "92vh",
            display: "flex",
            flexDirection: "column",
            border: `1px solid ${T.border}`
          }}>
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 800, color: T.ink, display: "flex", alignItems: "center", gap: 10 }}>
                  <span>⚙️</span> Settle Payroll & Leave Adjustments — {monthNames[selMonthNum - 1]} {selYear}
                </div>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 4 }}>
                  Adjust for staff leaves, absences, or finalize target remaining payout so records balance to ₹0 without false carry-forward.
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowBulkModal(false)}
                style={{ fontSize: 20, width: 34, height: 34 }}
              >
                ×
              </button>
            </div>

            {/* Explanatory Tip Box */}
            <div style={{
              background: "rgba(234, 88, 12, 0.05)",
              border: "1px solid rgba(234, 88, 12, 0.2)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
              fontSize: 12,
              color: T.inkMid,
              lineHeight: 1.5
            }}>
              💡 <strong>Smart Two-Way Settlement:</strong> You can enter the <strong>Leave Cut (₹)</strong> directly, OR type your <strong>Remaining Due (₹)</strong> and the system will automatically calculate the required leave deduction. Leave deductions reduce salary entitlement without deducting from daily cash drawer funds.
            </div>

            {/* Table Area (Scrollable) */}
            <div style={{ flex: 1, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 14 }}>
              <table className="tbl" style={{ minWidth: 920 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "#f8fafc" }}>
                  <tr>
                    <th style={{ textAlign: "left" }}>Employee</th>
                    <th style={{ textAlign: "right" }}>Base Salary</th>
                    <th style={{ textAlign: "right" }}>Prev Carry</th>
                    <th style={{ textAlign: "right" }}>Total Paid</th>
                    <th style={{ textAlign: "right" }} title="Balance due before applying any leave deduction">Gross Due</th>
                    <th style={{ textAlign: "center", width: 130 }}>Leave Cut (₹)</th>
                    <th style={{ textAlign: "center", width: 140 }}>Target Due (₹)</th>
                    <th style={{ textAlign: "left", width: 170 }}>Reason / Notes</th>
                    <th style={{ textAlign: "center", width: 110 }}>Quick Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(bulkDraft).map(item => {
                    const isSettledZero = item.targetRemaining === 0 && item.grossDue > 0;
                    return (
                      <tr key={item.employeeId} style={{ background: isSettledZero ? "rgba(5, 150, 105, 0.03)" : "transparent" }}>
                        <td style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 700, color: T.ink, fontSize: 13 }}>{item.name}</div>
                          <div style={{ fontSize: 10.5, color: T.inkLight }}>{item.role}</div>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(item.baseSalary)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: item.carryForward < 0 ? T.danger : item.carryForward > 0 ? T.blue : T.inkLight }}>
                          {item.carryForward < 0 ? `−${inr(Math.abs(item.carryForward))}` : item.carryForward > 0 ? `+${inr(item.carryForward)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{inr(item.totalPaid)}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: item.grossDue > 0 ? "#ea580c" : item.grossDue < 0 ? T.danger : T.success }}>
                          {inr(item.grossDue)}
                        </td>

                        {/* Input 1: Leave Cut (₹) */}
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="number"
                            min="0"
                            className="inp"
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: item.deduction > 0 ? "#7c3aed" : T.ink,
                              borderColor: item.deduction > 0 ? "#7c3aed" : T.border
                            }}
                            value={item.deduction === 0 ? "" : item.deduction}
                            placeholder="₹0"
                            onChange={(e) => handleBulkDeductionChange(item.employeeId, e.target.value)}
                          />
                        </td>

                        {/* Input 2: Target Remaining (₹) */}
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="number"
                            className="inp"
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              textAlign: "right",
                              fontWeight: 700,
                              color: item.targetRemaining === 0 ? T.success : item.targetRemaining > 0 ? "#ea580c" : T.danger,
                              borderColor: item.targetRemaining === 0 ? T.success : T.border
                            }}
                            value={item.targetRemaining}
                            onChange={(e) => handleBulkTargetRemainingChange(item.employeeId, e.target.value)}
                          />
                        </td>

                        {/* Input 3: Reason Notes */}
                        <td style={{ textAlign: "left" }}>
                          <input
                            type="text"
                            className="inp"
                            style={{ width: "100%", padding: "6px 8px", fontSize: 11.5 }}
                            value={item.notes}
                            placeholder="e.g. 3 days leave"
                            onChange={(e) => handleBulkNotesChange(item.employeeId, e.target.value)}
                          />
                        </td>

                        {/* Action buttons */}
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{
                                padding: "4px 8px",
                                fontSize: 10,
                                fontWeight: 700,
                                color: T.success,
                                borderColor: "rgba(5, 150, 105, 0.3)"
                              }}
                              title="Set target remaining to ₹0"
                              onClick={() => handleBulkSettleZero(item.employeeId)}
                            >
                              Settle ₹0
                            </button>
                            {item.deduction > 0 && (
                              <button
                                type="button"
                                className="btn-ghost"
                                style={{
                                  padding: "4px 6px",
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: T.inkLight,
                                  borderColor: T.border
                                }}
                                title="Reset deduction to 0"
                                onClick={() => handleBulkReset(item.employeeId)}
                              >
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Bottom Live Summary Bar */}
            <div style={{
              background: "#f8fafc",
              border: `1.5px solid ${T.border}`,
              borderRadius: 12,
              padding: "12px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: T.inkLight, textTransform: "uppercase", fontWeight: 700 }}>Total Gross Due</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{inr(bulkTotals.grossDue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#7c3aed", textTransform: "uppercase", fontWeight: 700 }}>Total Leave Cuts</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#7c3aed" }}>−{inr(bulkTotals.deduction)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#ea580c", textTransform: "uppercase", fontWeight: 700 }}>Target Remaining Payout</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: bulkTotals.targetRemaining === 0 ? T.success : "#ea580c" }}>
                    {inr(bulkTotals.targetRemaining)}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowBulkModal(false)}
                  disabled={savingBulk}
                  style={{ padding: "8px 18px", fontWeight: 700 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveBulk}
                  disabled={savingBulk}
                  style={{
                    padding: "8px 24px",
                    fontWeight: 700,
                    background: T.accentGradient,
                    boxShadow: "0 4px 12px rgba(234, 88, 12, 0.3)"
                  }}
                >
                  {savingBulk ? "Saving..." : "💾 Save & Apply Settlements"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL: SINGLE EMPLOYEE QUICK ADJUST (ADMIN ONLY)
         ════════════════════════════════════════════════════════════════ */}
      {singleEmpModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(3px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1060,
          padding: 16
        }}>
          <div style={{
            background: "#ffffff",
            borderRadius: 16,
            padding: 24,
            width: "100%",
            maxWidth: 500,
            boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
            border: `1px solid ${T.border}`
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 800, color: T.ink }}>
                  ✏️ Adjust Leave / Settlement
                </div>
                <div style={{ fontSize: 12, color: T.inkLight }}>
                  {singleEmpModal.name} ({singleEmpModal.role}) · {monthNames[selMonthNum - 1]} {selYear}
                </div>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSingleEmpModal(null)}
                style={{ fontSize: 20, width: 32, height: 32 }}
              >
                ×
              </button>
            </div>

            {/* Quick stats grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              background: "#f8fafc",
              border: `1px solid ${T.border}`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              textAlign: "center"
            }}>
              <div>
                <div style={{ fontSize: 10, color: T.inkLight, textTransform: "uppercase" }}>Base Salary</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{inr(singleEmpModal.baseSalary)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.inkLight, textTransform: "uppercase" }}>Total Paid</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{inr(singleEmpModal.totalPaid)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.inkLight, textTransform: "uppercase" }}>Gross Due</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: singleEmpModal.grossDue > 0 ? "#ea580c" : T.success }}>
                  {inr(singleEmpModal.grossDue)}
                </div>
              </div>
            </div>

            {/* Field: Leave Cut Amount */}
            <div className="field" style={{ marginBottom: 14 }}>
              <label style={{ fontWeight: 700, fontSize: 13 }}>Leave / Absence Deduction (₹)</label>
              <input
                type="number"
                min="0"
                className="inp"
                value={singleDeduction === 0 ? "" : singleDeduction}
                placeholder="₹0"
                onChange={(e) => setSingleDeduction(Math.max(0, num(e.target.value)))}
                style={{ fontSize: 15, fontWeight: 700, color: "#7c3aed" }}
              />
              <div style={{ fontSize: 11, color: T.inkLight, marginTop: 4 }}>
                Remaining balance after cut: <strong>{inr(singleEmpModal.grossDue - singleDeduction)}</strong>
              </div>
            </div>

            {/* Field: Reason / Notes */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 700, fontSize: 13 }}>Reason / Notes</label>
              <input
                type="text"
                className="inp"
                value={singleNotes}
                placeholder="e.g. 4 days unpaid leave, festival leave"
                onChange={(e) => setSingleNotes(e.target.value)}
              />
            </div>

            {/* Quick Settle to 0 Button */}
            {singleEmpModal.grossDue > 0 && (
              <div style={{ marginBottom: 18 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{
                    width: "100%",
                    padding: "8px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.success,
                    borderColor: "rgba(5, 150, 105, 0.4)",
                    background: "rgba(5, 150, 105, 0.04)"
                  }}
                  onClick={() => {
                    setSingleDeduction(singleEmpModal.grossDue);
                    if (!singleNotes) setSingleNotes("Settled to ₹0 (Leave cut)");
                  }}
                >
                  🎯 Set Leave Cut to Full Gross Due ({inr(singleEmpModal.grossDue)}) ➔ Settle to ₹0
                </button>
              </div>
            )}

            {/* Dialog Action Buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setSingleEmpModal(null)}
                disabled={savingSingle}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1.5, background: T.accentGradient }}
                onClick={handleSaveSingle}
                disabled={savingSingle}
              >
                {savingSingle ? "Saving..." : "💾 Save Adjustment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
