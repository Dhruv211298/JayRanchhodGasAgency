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
  onNavigate = null,
}) {
  const defaultSub = initialSub || (isAdmin ? "day-reports" : "summary");
  const [sub, setSub] = useState(defaultSub);
  const [refreshKey, setRefreshKey] = useState(0);

  const changed = () => {
    setRefreshKey(k => k + 1);
    onChanged && onChanged();
  };

  const SUBS_ADMIN = [
    {
      id: "day-reports",
      label: "Day Reports",
      icon: "📊",
      desc: "Daily sales audit, godown inventory movements, delivery boy tallies, and cash-on-hand drawer balances.",
    },
    {
      id: "salary",
      label: "Salary Report",
      icon: "👤",
      desc: "Comprehensive staff payroll tracking. Switch between whole-agency monthly overviews and detailed employee statements.",
    },
    {
      id: "conn-register",
      label: "Connection Register",
      icon: "📅",
      desc: "Filterable audit log of new connections issued, additional bottles taken, and customer cylinder surrenders.",
    },
    {
      id: "conn-summary",
      label: "Cylinders in Market",
      icon: "🛢️",
      desc: "Reconciliation of customer-held cylinders, all-time issued vs returned vs missing, and live market inventory.",
    },
    {
      id: "conn-monthly",
      label: "Monthly Trend",
      icon: "📆",
      desc: "Month-over-month trajectory of connection growth, collections, and security deposit payouts.",
    },
    {
      id: "conn-payments",
      label: "Connection Payments",
      icon: "💵",
      desc: "Counter receipts journal for collections on new connections and additional cylinders (Cash vs Online).",
    },
    {
      id: "conn-refunds",
      label: "Connection Refunds",
      icon: "↩️",
      desc: "Disbursements log for SV surrender security deposits and itemized penalty deductions.",
    },
    {
      id: "conn-audit",
      label: "Audit Trail",
      icon: "🧾",
      desc: "Tamper-evident system audit log tracking administrative modifications, voided entries, and connection actions.",
    },
  ];

  const SUBS_USER = [
    {
      id: "summary",
      label: "Sales Summary",
      icon: "📊",
      desc: "High-level operational overview of sales turnover, operating expenses, payment methods, and delivery performances.",
    },
    {
      id: "salary",
      label: "Salary Report",
      icon: "👤",
      desc: "Staff payroll tracking with month-wise overview and individual employee historical statements.",
    },
    {
      id: "conn-register",
      label: "Today's Connection Register",
      icon: "📅",
      desc: "Today's log of new connections, additional bottles, and customer cylinder surrenders.",
    },
  ];

  const tabs = isAdmin ? SUBS_ADMIN : SUBS_USER;
  const currentTab = tabs.find(t => t.id === sub) || tabs[0];

  return (
    <div className="fade-in">
      {/* Centralized Hub Header Card */}
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "16px 20px",
          background: "#ffffff",
          borderRadius: 14,
          border: `1px solid ${T.border}`,
          marginBottom: 16,
          boxShadow: "0 2px 10px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ flex: "1 1 320px" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📊</span>
            <span>All Reports & Analytics Hub</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: T.accent,
                background: "rgba(234, 88, 12, 0.1)",
                border: "1px solid rgba(234, 88, 12, 0.25)",
                padding: "2px 8px",
                borderRadius: 20,
                letterSpacing: "0.4px",
                textTransform: "uppercase"
              }}
            >
              {isAdmin ? "Admin Suite" : "Staff Suite"}
            </span>
          </div>
          <div style={{ fontSize: 13, color: T.inkLight, marginTop: 4, lineHeight: 1.4 }}>
            {currentTab.desc}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: T.inkLight, fontWeight: 600 }}>
            {tabs.length} Reports Available
          </span>
          {onNavigate && (
            <button
              type="button"
              className="btn-ghost"
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: T.accent,
                borderColor: T.accent,
                display: "inline-flex",
                alignItems: "center",
                gap: 6
              }}
              onClick={() => onNavigate(isAdmin ? "admin-entry" : "entry")}
            >
              <span>📋</span> Daily Entry
            </button>
          )}
        </div>
      </div>

      {/* Styled Segmented Sub-Tab Switcher */}
      <div className="prod-tabs">
        {tabs.map((tabItem) => {
          const isActive = sub === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              className={`prod-tab${isActive ? " active" : ""}`}
              onClick={() => setSub(tabItem.id)}
            >
              <span style={{ fontSize: 15 }}>{tabItem.icon}</span>
              <span>{tabItem.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Panels */}
      {isAdmin && sub === "day-reports" && (
        <AdminDayReports
          entries={entries}
          commissions={commissions}
          products={products}
          onNavigate={onNavigate}
        />
      )}

      {!isAdmin && sub === "summary" && (
        <UserSummary entries={entries} products={products} />
      )}

      {sub === "salary" && (
        <SharedSalaryReport entries={entries} employees={employees} isAdmin={isAdmin} />
      )}

      {sub === "conn-register" && (
        <ConnectionRegister isAdmin={isAdmin} refreshKey={refreshKey} onChanged={changed} products={products} />
      )}

      {isAdmin && sub === "conn-summary" && (
        <ConnectionSummaryReport products={products} />
      )}

      {isAdmin && sub === "conn-monthly" && (
        <ConnectionMonthlyReport products={products} />
      )}

      {isAdmin && sub === "conn-payments" && (
        <ConnectionPaymentsReport products={products} />
      )}

      {isAdmin && sub === "conn-refunds" && (
        <ConnectionRefundsReport products={products} />
      )}

      {isAdmin && sub === "conn-audit" && (
        <ConnectionAuditTrail products={products} />
      )}
    </div>
  );
}
