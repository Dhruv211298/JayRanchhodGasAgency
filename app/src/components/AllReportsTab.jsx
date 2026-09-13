import React, { useState } from "react";
import { T } from "../styles";
import {
  Register as ConnectionRegister,
  SummaryReport as ConnectionSummaryReport,
  MonthlyReport as ConnectionMonthlyReport,
  PaymentsReport as ConnectionPaymentsReport,
  RefundsReport as ConnectionRefundsReport,
  AuditTrail as ConnectionAuditTrail,
} from "./ConnectionsTab";
import { AdminDayReports } from "./AdminSide";
import { Summary as UserSummary } from "./UserSide";
import SharedSalaryReport from "./SharedSalaryReport";

export default function AllReportsTab({
  isAdmin = false,
  initialSub = null,
  entries = [],
  commissions = [],
  employees = [],
  products = [],
  onChanged = null,
}) {
  const defaultSub = initialSub || (isAdmin ? "day-reports" : "summary");
  const [sub, setSub] = useState(defaultSub);
  const [refreshKey, setRefreshKey] = useState(0);

  const changed = () => {
    setRefreshKey(k => k + 1);
    onChanged && onChanged();
  };

  const SUBS_ADMIN = [
    ["day-reports", "📊 Day Reports"],
    ["salary", "👤 Salary Report"],
    ["conn-register", "📅 Connection Register"],
    ["conn-summary", "🛢️ Cylinders in Market"],
    ["conn-monthly", "📆 Monthly Trend"],
    ["conn-payments", "💵 Connection Payments"],
    ["conn-refunds", "↩️ Connection Refunds"],
    ["conn-audit", "🧾 Audit Trail"],
  ];

  const SUBS_USER = [
    ["summary", "📊 Sales Summary"],
    ["salary", "👤 Salary Report"],
    ["conn-register", "📅 Today's Connection Register"],
  ];

  const tabs = isAdmin ? SUBS_ADMIN : SUBS_USER;

  return (
    <div className="fade-in">
      {/* Centralized Hub Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 18px",
          background: "#fff",
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          marginBottom: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📊</span> All Reports & Registers
          </div>
          <div style={{ fontSize: 12, color: T.inkLight, marginTop: 2 }}>
            Centralized access to daily sales, employee salary statements, and cylinder connection accounting.
          </div>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="prod-tabs" style={{ marginBottom: 16 }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`prod-tab${sub === id ? " active" : ""}`}
            onClick={() => setSub(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {isAdmin && sub === "day-reports" && (
        <AdminDayReports entries={entries} commissions={commissions} products={products} />
      )}

      {!isAdmin && sub === "summary" && (
        <UserSummary entries={entries} products={products} />
      )}

      {sub === "salary" && (
        <SharedSalaryReport entries={entries} employees={employees} isAdmin={isAdmin} />
      )}

      {sub === "conn-register" && (
        <ConnectionRegister isAdmin={isAdmin} refreshKey={refreshKey} onChanged={changed} />
      )}

      {isAdmin && sub === "conn-summary" && (
        <ConnectionSummaryReport />
      )}

      {isAdmin && sub === "conn-monthly" && (
        <ConnectionMonthlyReport />
      )}

      {isAdmin && sub === "conn-payments" && (
        <ConnectionPaymentsReport />
      )}

      {isAdmin && sub === "conn-refunds" && (
        <ConnectionRefundsReport />
      )}

      {isAdmin && sub === "conn-audit" && (
        <ConnectionAuditTrail />
      )}
    </div>
  );
}
