import { useState, useMemo, useEffect } from "react";
import Swal from "sweetalert2";
import { T } from "../styles";
import {
  PRODUCTS, ACCESSORIES, todayStr, fmtDate, fmtMonth, monthStr, inr, num, getSalaryMonth,
  blankExpense, blankCheque, blankCredit, blankVehicleExp, blankSalaryPayment,
  blankOtherCashCredit, calcEntry, getCurrentRate, productLabel,
  computeClosingStock, computeOpeningEmptyByProduct, computeEmptyBalanceSeries,
  emptyInFor, emptyDespatchedFor, connectionFilledOutFor, connectionEmptyInFor
} from "../constants";

import SharedSalaryReport from "./SharedSalaryReport";
import { api } from "../api";
import { NewConnectionForm, AdditionalBottleForm, SurrenderForm } from "./ConnectionsTab";

const VEH_EXP_TYPES = ["Fuel", "Repair", "Maintenance", "Toll / Tax", "Washing", "Other"];

/* Comprehensive card listing the day's connection-module events with inline record options.
   Operators can directly record New Connections, Additional Bottles, and Surrenders right
   inside Daily Entry so stock movements and cash on hand stay 100% in sync without leaving the screen. */
export function ConnectionsDayCard({ entry, calcs, products = PRODUCTS, onConnectionsChanged, isAdmin = false, canEdit = true }) {
  const [activeForm, setActiveForm] = useState(null); // null | "new" | "additional" | "surrender"
  const news = entry.connectionNew || [];
  const pays = entry.connectionPayments || [];
  const refs = entry.connectionRefunds || [];
  const totalEvents = news.length + pays.length + refs.length;

  const handleDone = () => {
    setActiveForm(null);
    onConnectionsChanged && onConnectionsChanged();
  };

  const handleVoid = async (evtObj) => {
    const { value: confirmed } = await Swal.fire({
      title: "Delete this entry?",
      text: `This will reverse its stock and cash effects for ${fmtDate(entry.date)}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ef4444",
      reverseButtons: true,
    });
    if (!confirmed) return;
    try {
      await api.deleteConnectionEvent(evtObj.id, "");
      onConnectionsChanged && onConnectionsChanged();
    } catch (err) {
      Swal.fire({ title: "Could not delete", text: err.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${T.blue}` }}>
      {/* Header */}
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10, padding: "12px 18px", background: "linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(37,99,235,0.01) 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="card-head-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>🔗 Connection Events & Quick Record</span>
            <span className={`badge ${totalEvents > 0 ? "badge-blue" : "badge-ink"}`} style={{ fontSize: 11 }}>
              {totalEvents} {totalEvents === 1 ? "Event" : "Events"} ({fmtDate(entry.date)})
            </span>
          </span>
        </div>

        {/* Quick action record buttons right in the header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={`btn-ghost ${activeForm === "new" ? "active" : ""}`}
                style={{
                  fontSize: 12, padding: "6px 12px",
                  background: activeForm === "new" ? T.accent : "rgba(37,99,235,0.08)",
                  color: activeForm === "new" ? "#fff" : T.accent,
                  borderColor: T.accent,
                  fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5
                }}
                onClick={() => setActiveForm(activeForm === "new" ? null : "new")}
              >
                <span>➕</span> New Connection
              </button>
              <button
                type="button"
                className={`btn-ghost ${activeForm === "additional" ? "active" : ""}`}
                style={{
                  fontSize: 12, padding: "6px 12px",
                  background: activeForm === "additional" ? T.success : "rgba(16,185,129,0.08)",
                  color: activeForm === "additional" ? "#fff" : T.success,
                  borderColor: T.success,
                  fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5
                }}
                onClick={() => setActiveForm(activeForm === "additional" ? null : "additional")}
              >
                <span>🛢️</span> Additional Bottle
              </button>
              <button
                type="button"
                className={`btn-ghost ${activeForm === "surrender" ? "active" : ""}`}
                style={{
                  fontSize: 12, padding: "6px 12px",
                  background: activeForm === "surrender" ? T.danger : "rgba(239,68,68,0.08)",
                  color: activeForm === "surrender" ? "#fff" : T.danger,
                  borderColor: T.danger,
                  fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 5
                }}
                onClick={() => setActiveForm(activeForm === "surrender" ? null : "surrender")}
              >
                <span>↩️</span> Surrender / Return
              </button>
            </div>
          )}

          {/* Cash effect totals */}
          <div style={{ fontSize: 11, fontWeight: 700, display: "flex", gap: 10, background: "#fff", padding: "4px 10px", borderRadius: 8, border: `1px solid ${T.border}` }}>
            <span style={{ color: T.success }} title="Additional bottle cash collections">+{inr(calcs.totalConnectionPaymentsCash || 0)} Cash</span>
            <span style={{ color: T.blue }} title="Additional bottle online payments (bank)">{inr(calcs.totalConnectionPaymentsOnline || 0)} Online</span>
            <span style={{ color: T.danger }} title="Surrender refund payouts">−{inr(calcs.totalConnectionRefunds || 0)} Refunds</span>
          </div>
        </div>
      </div>

      {/* Embedded Record Drawer when activeForm is set */}
      {activeForm && (
        <div style={{ padding: "16px", background: "#f8fafc", borderBottom: `1px solid ${T.border}` }} className="fade-in">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn-ghost ${activeForm === "new" ? "active" : ""}`}
                onClick={() => setActiveForm("new")}
                style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  background: activeForm === "new" ? T.accent : "#fff",
                  color: activeForm === "new" ? "#fff" : T.inkMid
                }}
              >
                ➕ New Connection (Stock only)
              </button>
              <button
                type="button"
                className={`btn-ghost ${activeForm === "additional" ? "active" : ""}`}
                onClick={() => setActiveForm("additional")}
                style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  background: activeForm === "additional" ? T.success : "#fff",
                  color: activeForm === "additional" ? "#fff" : T.inkMid
                }}
              >
                🛢️ Additional Bottle (Cash / Online)
              </button>
              <button
                type="button"
                className={`btn-ghost ${activeForm === "surrender" ? "active" : ""}`}
                onClick={() => setActiveForm("surrender")}
                style={{
                  padding: "5px 12px", fontSize: 12, fontWeight: 600,
                  background: activeForm === "surrender" ? T.danger : "#fff",
                  color: activeForm === "surrender" ? "#fff" : T.inkMid
                }}
              >
                ↩️ Surrender / Return (Empty In + Cash Out)
              </button>
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setActiveForm(null)}
              title="Close form"
              style={{ fontSize: 18, width: 28, height: 28 }}
            >
              ×
            </button>
          </div>

          {activeForm === "new" && (
            <NewConnectionForm
              isAdmin={isAdmin}
              onDone={handleDone}
              defaultDate={entry.date}
              lockDate={!isAdmin}
              products={products}
            />
          )}
          {activeForm === "additional" && (
            <AdditionalBottleForm
              isAdmin={isAdmin}
              onDone={handleDone}
              defaultDate={entry.date}
              lockDate={!isAdmin}
              products={products}
            />
          )}
          {activeForm === "surrender" && (
            <SurrenderForm
              isAdmin={isAdmin}
              onDone={handleDone}
              defaultDate={entry.date}
              lockDate={!isAdmin}
              products={products}
            />
          )}
        </div>
      )}

      {/* Events Table for this date */}
      <div className="card-body" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Event</th>
                <th>Product</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th>Stock Effect</th>
                <th>Detail / Mode</th>
                <th style={{ textAlign: "right" }}>Cash Effect</th>
                {isAdmin && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {totalEvents === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} style={{ padding: 24, textAlign: "center", color: T.inkLight }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>No connection events recorded for <strong>{fmtDate(entry.date)}</strong>.</div>
                    {canEdit && (
                      <div style={{ fontSize: 11, color: T.inkLight }}>
                        Click <strong>➕ New Connection</strong>, <strong>🛢️ Additional Bottle</strong>, or <strong>↩️ Surrender / Return</strong> above to record an event.
                      </div>
                    )}
                  </td>
                </tr>
              )}
              {news.map(x => (
                <tr key={"n" + x.id}>
                  <td><span className="badge badge-ink">New Connection</span></td>
                  <td style={{ fontWeight: 600 }}>{productLabel(x.productId, products)}</td>
                  <td style={{ textAlign: "right" }}>{x.qty} {x.connectionType}</td>
                  <td style={{ color: T.danger, fontSize: 12 }}>−{x.cylindersOut} filled</td>
                  <td style={{ fontSize: 12, color: T.inkMid }}>{x.remarks || "—"}</td>
                  <td style={{ textAlign: "right", color: T.inkLight, fontSize: 11 }}>none (BPCL deposit)</td>
                  {isAdmin && (
                    <td>
                      <button className="btn-icon" title="Void event" onClick={() => handleVoid({ id: x.id, eventType: "new" })}>×</button>
                    </td>
                  )}
                </tr>
              ))}
              {pays.map(x => (
                <tr key={"p" + x.id}>
                  <td><span className="badge badge-blue">Additional Bottle</span></td>
                  <td style={{ fontWeight: 600 }}>{productLabel(x.productId, products)}</td>
                  <td style={{ textAlign: "right" }}>{x.qty}</td>
                  <td style={{ color: T.danger, fontSize: 12 }}>−{x.qty} filled</td>
                  <td style={{ fontSize: 12, color: T.inkMid }}>{x.mode === "cash" ? "💵 Cash" : "🏦 Online"}{x.remarks ? ` · ${x.remarks}` : ""}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: x.mode === "cash" ? T.success : T.blue }}>
                    {x.mode === "cash" ? "+" : ""}{inr(x.amt)}
                    {x.mode === "online" ? <div style={{ fontSize: 9, color: T.inkLight }}>bank (not in till)</div> : null}
                  </td>
                  {isAdmin && (
                    <td>
                      <button className="btn-icon" title="Void event" onClick={() => handleVoid({ id: x.id, eventType: "additional" })}>×</button>
                    </td>
                  )}
                </tr>
              ))}
              {refs.map(x => (
                <tr key={"r" + x.id}>
                  <td><span className="badge badge-danger">Surrender</span></td>
                  <td style={{ fontWeight: 600 }}>{productLabel(x.productId, products)}</td>
                  <td style={{ textAlign: "right" }}>{x.qty}</td>
                  <td style={{ fontSize: 12 }}>
                    <span style={{ color: T.success }}>+{x.cylindersQty} empty</span>
                    {num(x.cylindersMissing) > 0 && <span style={{ color: T.warn }}> · {x.cylindersMissing} missing</span>}
                  </td>
                  <td style={{ fontSize: 12, color: T.inkMid }}>
                    Refund {inr(x.refundAmount)}
                    {num(x.penaltyDeducted) > 0 ? ` − penalty ${inr(x.penaltyDeducted)}` : ""}
                    {x.notes ? ` · ${x.notes}` : ""}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: T.danger }}>−{inr(x.amt)}</td>
                  {isAdmin && (
                    <td>
                      <button className="btn-icon" title="Void event" onClick={() => handleVoid({ id: x.id, eventType: "surrender" })}>×</button>
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
}

/* Small read-only annotation next to a product's closing stock: why it
   moved through connection events even on a day with no product sales. */
export function ConnectionStockNote({ entry, productId }) {
  const out = connectionFilledOutFor(entry, productId);
  const back = connectionEmptyInFor(entry, productId);
  if (!out && !back) return null;
  return (
    <div style={{ fontSize: 9, whiteSpace: "nowrap", marginTop: 2 }}>
      {out > 0 && <span style={{ color: T.danger }}>−{out} (connection)</span>}
      {out > 0 && back > 0 && " "}
      {back > 0 && <span style={{ color: T.success }}>+{back} empty (surrender)</span>}
    </div>
  );
}

export function DailyEntry({ entry, setEntry, onSave, onDateChange, saved, entries, prices, deliveryBoys, vehicles, employees, pending, isAdmin, products = PRODUCTS, onConnectionsChanged }) {
  const calcs = calcEntry(entry);
  const orphanIssues = Object.entries(entry.unrecordedConnectionIssues || {}).filter(([, n]) => num(n) > 0);
  // Replaying the full history to derive the opening empty-cylinder balance is
  // O(days x products). It only changes when the entry list or the working date
  // changes, so it is memoised rather than re-run on every keystroke.
  const openingEmptyByProduct = useMemo(
    () => computeOpeningEmptyByProduct(entries, entry.date, products),
    [entries, entry.date, products]
  );
  const p14 = (entry.products || []).find(p => p.id === "p14") || {};
  const p14Rate = num(p14.rate);
  // Immutable path set — clones only the objects along the path rather than
  // deep-cloning the entire entry (16 collections) on every keystroke.
  const set = (path, val) => {
    setEntry((prev) => {
      const parts = path.split(".");
      const assign = (obj, i) => {
        const key = parts[i];
        const copy = Array.isArray(obj) ? [...obj] : { ...obj };
        copy[key] = i === parts.length - 1 ? val : assign(obj[key], i + 1);
        return copy;
      };
      return assign(prev, 0);
    });
  };

  const setProduct = (idOrIndex, field, val) => {
    setEntry((prev) => {
      // Targeted immutable update — no full-object deep clone per keystroke.
      const products = prev.products.map((p, idx) =>
        (idx === idOrIndex || p.id === idOrIndex) ? { ...p, [field]: val } : p
      );
      const next = { ...prev, products };
      // Closing stock always comes from the shared stock engine so that the
      // value held in state, the value rendered, and the value persisted are
      // guaranteed to be identical.
      next.products = next.products.map((p, idx) =>
        (idx === idOrIndex || p.id === idOrIndex) ? { ...p, closingStock: computeClosingStock(next, p) } : p
      );
      return next;
    });
  };

  const setAccessory = (i, field, val) => {
    setEntry((prev) => {
      if (!prev.accessories) return prev;
      return {
        ...prev,
        accessories: prev.accessories.map((a, idx) =>
          idx === i ? { ...a, [field]: val } : a
        ),
      };
    });
  };

  const setDelivery = (boy, field, val) => {
    setEntry((prev) => {
      const current = prev.delivery[boy] && typeof prev.delivery[boy] === 'object'
        ? prev.delivery[boy]
        : { cash: "", online: "" };
      return {
        ...prev,
        delivery: {
          ...prev.delivery,
          [boy]: {
            ...current,
            [field]: val
          }
        }
      };
    });
  };

  const listAdd = (key, blank) => setEntry((p) => ({ ...p, [key]: [...p[key], blank()] }));
  const listRemove = (key, id) => setEntry((p) => ({ ...p, [key]: p[key].filter((x) => x.id !== id) }));
  const listSet = (key, id, field, val) =>
    setEntry((p) => ({ ...p, [key]: p[key].map((x) => x.id === id ? { ...x, [field]: val } : x) }));

  const canEdit = isAdmin ? true : entry.date === todayStr();

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Entry saved successfully!</div>}
      {!canEdit && <div className="alert alert-info">👁️ Viewing historical entry — Read-only mode</div>}
      {isAdmin && entry.date !== todayStr() && <div className="alert alert-success">🔓 Admin Mode — Editing entry for {fmtDate(entry.date)}</div>}
      {orphanIssues.length > 0 && (
        <div className="alert alert-warn">
          ⚠️ Opening stock reduced by connection cylinders issued on days with no saved entry:
          {" "}{orphanIssues.map(([pid, n]) => `${productLabel(pid)} −${n}`).join(", ")}. Save those days' entries to clear this notice.
        </div>
      )}

      <div className="g3" style={{ marginBottom: 18 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-head" style={{ padding: "10px 16px" }}>
            <span className="card-head-title">📅 Accounting Date</span>
          </div>
          <div className="card-body" style={{ padding: "12px 16px" }}>
            <input
              className="inp"
              type="date"
              value={entry.date}
              max={todayStr()}
              onChange={(e) => onDateChange ? onDateChange(e.target.value) : set("date", e.target.value)}
              style={{ fontWeight: 600, fontSize: 14 }}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-head" style={{ padding: "10px 16px" }}>
            <span className="card-head-title">💰 Opening Cash Balance</span>
          </div>
          <div className="card-body" style={{ padding: "12px 16px" }}>
            <input
              className="inp"
              type="number"
              placeholder="₹ 0"
              value={entry.openingCash}
              onChange={(e) => set("openingCash", e.target.value)}
              readOnly={!canEdit}
              style={{ fontWeight: 700, fontSize: 15, color: T.ink }}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-head" style={{ padding: "10px 16px" }}>
            <span className="card-head-title">🏦 Bank of Baroda (Deposit)</span>
          </div>
          <div className="card-body" style={{ padding: "12px 16px" }}>
            <input
              className="inp"
              type="number"
              placeholder="₹ 0"
              value={entry.bob}
              onChange={(e) => set("bob", e.target.value)}
              readOnly={!canEdit}
              style={{ fontWeight: 700, fontSize: 15, color: T.blue }}
            />
          </div>
        </div>
      </div>

      {/* Vehicle Arrival Question */}
      <div className="card" style={{ marginBottom: 18, borderLeft: entry.hasArrival ? `4px solid ${T.success}` : `4px solid ${T.border}` }}>
        <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: entry.hasArrival ? T.successBg : "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20
            }}>
              🚚
            </div>
            <div>
              <div style={{ fontWeight: 700, color: T.ink, fontSize: 14 }}>Did a new gas cylinder vehicle arrive today?</div>
              <div style={{ fontSize: 11.5, color: T.inkLight }}>Record plant delivery arrivals and turnaround empties returned</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, background: "#f1f5f9", padding: 4, borderRadius: 10 }}>
            <button
              type="button"
              style={{
                padding: "7px 18px",
                borderRadius: 8,
                border: "none",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.4px",
                cursor: canEdit ? "pointer" : "default",
                background: entry.hasArrival ? T.success : "transparent",
                color: entry.hasArrival ? "#fff" : "#64748b",
                boxShadow: entry.hasArrival ? "0 2px 8px rgba(5,150,105,0.3)" : "none",
                transition: "all 0.18s ease"
              }}
              onClick={() => canEdit && set("hasArrival", true)}
              disabled={!canEdit}
            >
              Yes, Arrived
            </button>
            <button
              type="button"
              style={{
                padding: "7px 18px",
                borderRadius: 8,
                border: "none",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: "0.4px",
                cursor: canEdit ? "pointer" : "default",
                background: !entry.hasArrival ? "#64748b" : "transparent",
                color: !entry.hasArrival ? "#fff" : "#64748b",
                boxShadow: !entry.hasArrival ? "0 2px 8px rgba(100,116,139,0.3)" : "none",
                transition: "all 0.18s ease"
              }}
              onClick={() => canEdit && set("hasArrival", false)}
              disabled={!canEdit}
            >
              No Arrival
            </button>
          </div>
        </div>

        {entry.hasArrival && (
          <div className="fade-in">
            <div className="card-head" style={{ borderTop: `1px solid ${T.border}`, background: "#f8fafc" }}>
              <span className="card-head-title">📦 New Vehicle Arrival Details From Plant</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div style={{ overflowX: "auto" }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: "center" }}>Filled Received</th>
                      <th style={{ textAlign: "center" }}>Empty Returned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(entry.arrivals || []).map((item, idx) => {
                      const p = (products || PRODUCTS).find(prod => prod.id === item.productId);
                      return (
                        <tr key={item.productId}>
                          <td style={{ fontWeight: 700, color: T.accent, fontSize: 13.5 }}>{p ? p.label : item.productId}</td>
                          <td style={{ textAlign: "center" }}>
                            <input
                              className="inp-inline"
                              type="number"
                              placeholder="0"
                              value={item.filledReceived}
                              onChange={(e) => {
                                const newArr = [...entry.arrivals];
                                newArr[idx].filledReceived = e.target.value;
                                set("arrivals", newArr);
                              }}
                              readOnly={!canEdit}
                              style={{ width: 80, fontWeight: 700, color: T.success }}
                            />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <input
                              className="inp-inline"
                              type="number"
                              placeholder="0"
                              value={item.emptyReturned}
                              onChange={(e) => {
                                const newArr = [...entry.arrivals];
                                newArr[idx].emptyReturned = e.target.value;
                                set("arrivals", newArr);
                              }}
                              readOnly={!canEdit}
                              style={{ width: 80, fontWeight: 700, color: T.danger }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cylinders */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-head" style={{ flexWrap: "wrap", gap: 10, padding: "14px 20px" }}>
          <span className="card-head-title">🛢️ Cylinder Stock & Sales</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, fontWeight: 700 }}>
            <span style={{ background: T.successBg, color: T.success, padding: "4px 12px", borderRadius: 20, border: "1px solid #a7f3d0" }}>
              Cash: {inr(calcs.originalCashSales)}
            </span>
            <span style={{ background: T.blueBg, color: T.blue, padding: "4px 12px", borderRadius: 20, border: "1px solid #bfdbfe" }}>
              Online: {inr(calcs.totalOnlineSales)}
            </span>
            <span style={{ background: "#f8fafc", color: T.ink, padding: "4px 14px", borderRadius: 20, border: "1px solid #e2e8f0" }}>
              Gross: {inr(calcs.originalSales)}
            </span>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  {[
                    { label: "Cylinder Product", align: "left", width: 130 },
                    { label: "Opening Stock", align: "right", width: 80 },
                    { label: "Rate (₹)", align: "right", width: 85 },
                    { label: "Cash Qty", align: "right", width: 75 },
                    { label: "Online Qty", align: "right", width: 75 },
                    { label: "SBC", align: "right", width: 65, title: "Single Bottle Connection — new filled bottle issued, no empty cylinder received" },
                    { label: "DBC", align: "right", width: 65, title: "Double Bottle Connection — new filled bottle issued, no empty cylinder received" },
                    { label: "Cash Total", align: "right", width: 105 },
                    { label: "Online Total", align: "right", width: 105 },
                    { label: "Closing", align: "right", width: 75 },
                    { label: "⚠️ Shortage / Stolen", align: "right", width: 90 },
                    { label: "Remarks", align: "left", width: 130 }
                  ].map((xh) => (
                    <th key={xh.label} title={xh.title} style={{
                      textAlign: xh.align,
                      minWidth: xh.width,
                      width: xh.width,
                      ...(xh.label.includes("Shortage") ? { color: "#f59e0b", whiteSpace: "nowrap" } : {})
                    }}>
                      {xh.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entry.products.filter(p => {
                  const def = (products || []).find(x => x.id === p.id);
                  return !def || def.category !== 'accessory';
                }).map((p) => {
                  // Opening stock is the previous day's In-Out Stock Master full cylinder value.
                  // Arrivals (filledReceived) must NOT be added here — they are already reflected in the In-Out Master section.
                  const autoOpening = num(p.openingStock);

                  const cashTotal = (num(p.sell) * num(p.rate)) + (num(p.sbc) * num(p.sbcRate)) + (num(p.dbc) * num(p.dbcRate));
                  const onlineTotal = num(p.online) * num(p.rate);
                  // Closing stock comes from the shared stock engine — identical
                  // to what setProduct stores and what handleSave persists.
                  const closing = computeClosingStock(entry, p);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: T.accent, whiteSpace: "nowrap" }}>{productLabel(p.id, products)}</td>
                      <td><input className="inp-inline" type="number" value={autoOpening} readOnly style={{ background: "rgba(0,119,255,0.05)", color: T.blue, fontWeight: 600, minWidth: 60 }} /></td>
                      <td><input className="inp-inline" type="number" value={p.rate} readOnly style={{ minWidth: 65, fontWeight: 600 }} /></td>
                      <td><input className="inp-inline" type="number" value={p.sell} onChange={(e) => setProduct(p.id, "sell", e.target.value)} readOnly={!canEdit} style={{ minWidth: 55 }} /></td>
                      <td><input className="inp-inline" type="number" value={p.online} onChange={(e) => setProduct(p.id, "online", e.target.value)} readOnly={!canEdit} style={{ minWidth: 55 }} /></td>
                      <td><input className="inp-inline" type="number" placeholder="0" title="SBC: New filled issued, no empty cylinder returned" value={p.sbc} onChange={(e) => setProduct(p.id, "sbc", e.target.value)} readOnly={!canEdit} style={{ minWidth: 50 }} /></td>
                      <td><input className="inp-inline" type="number" placeholder="0" title="DBC: New filled issued, no empty cylinder returned" value={p.dbc} onChange={(e) => setProduct(p.id, "dbc", e.target.value)} readOnly={!canEdit} style={{ minWidth: 50 }} /></td>
                      <td style={{ color: T.success, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }} title={`Refill (Cash): ${inr(num(p.sell) * num(p.rate))} | SBC: ${inr(num(p.sbc) * num(p.sbcRate))} | DBC: ${inr(num(p.dbc) * num(p.dbcRate))}`}>{inr(cashTotal)}</td>
                      <td style={{ color: T.blue, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{inr(onlineTotal)}</td>
                      <td style={{ color: closing < 0 ? T.danger : T.ink, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" }}>{closing}<ConnectionStockNote entry={entry} productId={p.id} /></td>
                      <td style={{ textAlign: "right" }}>
                        <input
                          className="inp-inline"
                          type="number"
                          placeholder="0"
                          value={p.shortage || ""}
                          onChange={(e) => setProduct(p.id, "shortage", e.target.value)}
                          readOnly={!canEdit}
                          title="Shortage / Stolen — reminder only, does not affect stock"
                          style={{
                            textAlign: "right",
                            minWidth: 55,
                            border: num(p.shortage) > 0 ? "1.5px solid #f59e0b" : undefined,
                            background: num(p.shortage) > 0 ? "rgba(245,158,11,0.08)" : undefined,
                            color: num(p.shortage) > 0 ? "#d97706" : undefined,
                            fontWeight: num(p.shortage) > 0 ? 700 : undefined,
                          }}
                        />
                      </td>
                      <td style={{ width: 140 }}><input className="inp-inline left" type="text" placeholder="Note..." value={p.remarks || ""} onChange={(e) => setProduct(p.id, "remarks", e.target.value)} readOnly={!canEdit} /></td>
                    </tr>
                  );
                })}

              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <span className="card-head-title">🔧 Accessories & Parts</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.success }}>{inr(calcs.totalAccessorySales)}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Accessory / Part</th><th style={{ textAlign: "center" }}>Sold Today?</th><th style={{ textAlign: "right" }}>Qty Sold</th><th style={{ textAlign: "right" }}>Rate (₹)</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {(entry.accessories || []).map((a, i) => {
                  const accDef = (products || []).find(x => x.id === a.accessoryId) 
                    || ACCESSORIES.find(x => x.id === a.accessoryId) 
                    || ACCESSORIES[i] 
                    || {};
                  const label = accDef.label || accDef.short || accDef.shortName || a.accessoryId;
                  const total = num(a.qty) * num(a.rate);
                  return (
                    <tr key={a.accessoryId || i}>
                      <td style={{ fontWeight: 600, color: T.accent }}>{label}</td>
                      <td style={{ textAlign: "center" }}>
                        <select className="inp-inline" value={a.sold ? "yes" : "no"} onChange={(e) => setAccessory(i, "sold", e.target.value === "yes")} disabled={!canEdit} style={{ width: 80, margin: "0 auto", cursor: canEdit ? "pointer" : "default" }}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </td>
                      <td><input className="inp-inline" type="number" value={a.qty} onChange={(e) => setAccessory(i, "qty", e.target.value)} disabled={!canEdit || !a.sold} style={{ opacity: a.sold ? 1 : 0.4 }} /></td>
                      <td><input className="inp-inline" type="number" value={a.rate} onChange={(e) => setAccessory(i, "rate", e.target.value)} disabled={!canEdit || !a.sold} style={{ opacity: a.sold ? 1 : 0.4 }} /></td>
                      <td style={{ color: a.sold && total > 0 ? T.success : T.inkLight, fontWeight: 700, textAlign: "right" }}>{a.sold ? inr(total) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card" style={{ height: "100%" }}>
          <div className="card-head">
            <span className="card-head-title">🚚 Delivery Boy Wise</span>
            <span style={{ fontWeight: 700, color: T.accent, fontSize: 13 }}>{calcs.totalDelivery} cyl</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Delivery Boy</th>
                  <th style={{ width: "22%", textAlign: "right" }}>Cash Qty</th>
                  <th style={{ width: "22%", textAlign: "right" }}>Online Qty</th>
                  <th style={{ width: "25%", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {deliveryBoys.map((b) => {
                  const item = entry.delivery[b] || {};
                  // Support old flat values (backward compatibility)
                  const cashVal = typeof item === 'object' && item !== null ? (item.cash || "") : (item || "");
                  const onlineVal = typeof item === 'object' && item !== null ? (item.online || "") : "";
                  const totalQty = num(cashVal) + num(onlineVal);
                  const amount = totalQty * p14Rate;

                  return (
                    <tr key={b}>
                      <td style={{ fontWeight: 500 }}>{b}</td>
                      <td>
                        <input
                          className="inp-inline"
                          type="number"
                          placeholder="0"
                          value={cashVal}
                          onChange={(e) => setDelivery(b, "cash", e.target.value)}
                          readOnly={!canEdit}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td>
                        <input
                          className="inp-inline"
                          type="number"
                          placeholder="0"
                          value={onlineVal}
                          onChange={(e) => setDelivery(b, "online", e.target.value)}
                          readOnly={!canEdit}
                          style={{ textAlign: "right" }}
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: totalQty > 0 ? T.success : T.inkLight }}>
                        {totalQty > 0 ? inr(amount) : "—"}
                      </td>
                    </tr>
                  );
                })}

                {(() => {
                  const totalCash = deliveryBoys.reduce((s, b) => {
                    const item = entry.delivery[b] || {};
                    const cash = typeof item === 'object' && item !== null ? num(item.cash) : num(item);
                    return s + cash;
                  }, 0);

                  const totalOnline = deliveryBoys.reduce((s, b) => {
                    const item = entry.delivery[b] || {};
                    const online = typeof item === 'object' && item !== null ? num(item.online) : 0;
                    return s + online;
                  }, 0);

                  const grandTotalQty = totalCash + totalOnline;
                  const grandTotalAmt = grandTotalQty * p14Rate;

                  return (
                    <tr className="tbl-total">
                      <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                      <td style={{ textAlign: "right", color: T.accent, fontWeight: 700 }}>{totalCash || ""}</td>
                      <td style={{ textAlign: "right", color: T.accent, fontWeight: 700 }}>{totalOnline || ""}</td>
                      <td style={{ textAlign: "right", color: T.success, fontWeight: 800 }}>{grandTotalQty > 0 ? inr(grandTotalAmt) : "—"}</td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ height: "100%" }}>
          <div className="card-head">
            <span className="card-head-title">🏧 Cheque / Online</span>
            <span style={{ fontWeight: 700, color: T.blue, fontSize: 13 }}>{inr(calcs.totalCheque)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: "55%" }}>Description</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
              <tbody>
                {entry.chequeOnline.map((x) => (
                  <tr key={x.id}>
                    <td><input className="inp-inline left" type="text" placeholder="Payment detail…" value={x.desc} onChange={(e) => listSet("chequeOnline", x.id, "desc", e.target.value)} readOnly={!canEdit} /></td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("chequeOnline", x.id, "amt", e.target.value)} readOnly={!canEdit} /></td>
                    <td style={{ width: 36 }}>
                      {canEdit && entry.chequeOnline.length > 1 && <button className="btn-icon" onClick={() => listRemove("chequeOnline", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
                <tr className="tbl-total">
                  <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                  <td style={{ color: T.blue, textAlign: "right" }}>{inr(calcs.totalCheque)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            {canEdit && (
              <div style={{ padding: "6px 10px 10px" }}>
                <button className="btn-add" onClick={() => listAdd("chequeOnline", blankCheque)}>+ Add Row</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card" style={{ height: "100%" }}>
          <div className="card-head">
            <span className="card-head-title">💳 Credit Sale</span>
            <span style={{ fontWeight: 700, color: T.danger, fontSize: 13 }}>{inr(calcs.totalCredit)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: "20%", minWidth: 130 }}>Customer Name</th>
                    <th style={{ width: "14%", minWidth: 100 }}>Product</th>
                    <th style={{ width: "10%", textAlign: "center" }}>Filled Cyl</th>
                    <th style={{ width: "10%", textAlign: "center" }}>Empty Cyl</th>
                    <th style={{ width: "12%", textAlign: "right" }}>Amount (₹)</th>
                    <th style={{ width: "18%", minWidth: 120 }}>Remarks</th>
                    <th>Status</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {entry.creditSales.map((x) => {
                    const statusItem = (pending || []).find(p => p.id === x.id);
                    let statusText = "New Credit";
                    let statusColor = T.blue;
                    if (statusItem) {
                      if (statusItem.cleared) {
                        statusText = "Cleared (Paid)";
                        statusColor = T.success;
                      } else if (statusItem.recovered > 0) {
                        statusText = `Partially Paid (₹${statusItem.originalAmt - statusItem.recovered} left)`;
                        statusColor = "orange";
                      } else {
                        statusText = "Unpaid";
                        statusColor = T.danger;
                      }
                    }
                    return (
                      <tr key={x.id}>
                        <td><input className="inp-inline left" type="text" placeholder="Customer name…" value={x.customerName} onChange={(e) => listSet("creditSales", x.id, "customerName", e.target.value)} readOnly={!canEdit} /></td>
                        <td>
                          <select
                            className="inp-inline left"
                            value={x.productId || "p14"}
                            onChange={(e) => {
                              const newProd = e.target.value;
                              const rate = getCurrentRate(newProd, prices);
                              setEntry(prev => ({
                                ...prev,
                                creditSales: prev.creditSales.map(cs => cs.id === x.id
                                  ? { ...cs, productId: newProd, amt: num(cs.filledQty) > 0 ? String(num(cs.filledQty) * rate) : cs.amt }
                                  : cs
                                )
                              }));
                            }}
                            disabled={!canEdit}
                            style={{ fontSize: 12 }}
                          >
                            {(products || PRODUCTS).map(p => (
                              <option key={p.id} value={p.id}>{p.short || p.label}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input
                            className="inp-inline"
                            type="number"
                            placeholder="0"
                            value={x.filledQty || ""}
                            onChange={(e) => {
                              const newQty = e.target.value;
                              const rate = getCurrentRate(x.productId || "p14", prices);
                              setEntry(prev => ({
                                ...prev,
                                creditSales: prev.creditSales.map(cs => cs.id === x.id
                                  ? { ...cs, filledQty: newQty, amt: num(newQty) > 0 ? String(num(newQty) * rate) : cs.amt }
                                  : cs
                                )
                              }));
                            }}
                            readOnly={!canEdit}
                            style={{ textAlign: "center", width: 60 }}
                            title="Filled cylinders taken by customer on credit"
                          />
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <input
                            className="inp-inline"
                            type="number"
                            placeholder="0"
                            value={x.emptyQty || ""}
                            onChange={(e) => listSet("creditSales", x.id, "emptyQty", e.target.value)}
                            readOnly={!canEdit}
                            style={{ textAlign: "center", width: 60 }}
                            title="Empty cylinders returned by customer"
                          />
                        </td>
                        <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("creditSales", x.id, "amt", e.target.value)} readOnly={!canEdit} /></td>
                        <td><input className="inp-inline left" type="text" placeholder="Note…" value={x.remarks || ""} onChange={(e) => listSet("creditSales", x.id, "remarks", e.target.value)} readOnly={!canEdit} /></td>
                        <td style={{ color: statusColor, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "middle" }}>{statusText}</td>
                        <td style={{ width: 36 }}>
                          {canEdit && entry.creditSales.length > 1 && <button className="btn-icon" onClick={() => listRemove("creditSales", x.id)}>×</button>}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="tbl-total">
                    <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                    <td colSpan={3}>
                      <span style={{ fontSize: 11, color: T.inkLight }}>
                        Filled: <strong style={{ color: T.accent }}>{entry.creditSales.reduce((s, x) => s + (num(x.filledQty) || 0), 0)}</strong>
                        {" · "}
                        Empty: <strong style={{ color: T.inkMid }}>{entry.creditSales.reduce((s, x) => s + (num(x.emptyQty) || 0), 0)}</strong>
                      </span>
                    </td>
                    <td style={{ color: T.danger, textAlign: "right" }}>{inr(calcs.totalCredit)}</td>
                    <td colSpan={3} />
                  </tr>
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div style={{ padding: "6px 10px 10px" }}>
                <button className="btn-add" onClick={() => listAdd("creditSales", blankCredit)}>+ Add Customer</button>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ height: "100%" }}>
          <div className="card-head">
            <span className="card-head-title">💵 Credit Sale Return Received</span>
            <span style={{ fontWeight: 700, color: T.success, fontSize: 13 }}>{inr(calcs.totalCreditRecoveries)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Customer Name</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {(entry.creditRecoveries || []).map((x, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: T.accent }}>{x.customerName}</td>
                    <td style={{ fontWeight: 600, color: T.success, textAlign: "right" }}>{inr(x.amt)}</td>
                    <td style={{ color: T.inkLight, fontSize: 12 }}>{x.note || "—"}</td>
                  </tr>
                ))}
                {!(entry.creditRecoveries || []).length && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: "16px 10px", color: T.inkLight }}>
                      No credit returns received today.
                    </td>
                  </tr>
                )}
                {!!(entry.creditRecoveries || []).length && (
                  <tr className="tbl-total">
                    <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                    <td style={{ color: T.success, textAlign: "right" }}>{inr(calcs.totalCreditRecoveries)}</td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Other Cash Credit Card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <span className="card-head-title">💵 Other Cash Credit</span>
          <span style={{ fontWeight: 700, color: T.success, fontSize: 13 }}>{inr(calcs.totalOtherCashCredits)}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr><th style={{ width: "65%" }}>Description</th><th style={{ textAlign: "right" }}>Amount (₹)</th><th style={{ width: 36 }}></th></tr></thead>
            <tbody>
              {(entry.otherCashCredits || []).map((x) => (
                <tr key={x.id}>
                  <td><input className="inp-inline left" type="text" placeholder="e.g. Misc income, refund…" value={x.desc} onChange={(e) => listSet("otherCashCredits", x.id, "desc", e.target.value)} readOnly={!canEdit} /></td>
                  <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("otherCashCredits", x.id, "amt", e.target.value)} readOnly={!canEdit} /></td>
                  <td style={{ width: 36 }}>
                    {canEdit && (entry.otherCashCredits || []).length > 1 && <button className="btn-icon" onClick={() => listRemove("otherCashCredits", x.id)}>×</button>}
                  </td>
                </tr>
              ))}
              <tr className="tbl-total">
                <td style={{ color: T.inkMid, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Total</td>
                <td style={{ color: T.success, textAlign: "right" }}>{inr(calcs.totalOtherCashCredits)}</td>
                <td />
              </tr>
            </tbody>
          </table>
          {canEdit && (
            <div style={{ padding: "6px 10px 10px" }}>
              <button className="btn-add" onClick={() => listAdd("otherCashCredits", blankOtherCashCredit)}>+ Add Row</button>
            </div>
          )}
        </div>
      </div>

      {/* Connection module events for this date with full record options (New Connection, Additional Bottle, Surrender) */}
      <ConnectionsDayCard
        entry={entry}
        calcs={calcs}
        products={products}
        onConnectionsChanged={onConnectionsChanged}
        isAdmin={isAdmin}
        canEdit={canEdit}
      />

      {/* Combined Outflows & Expenses Card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head" style={{ background: "linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(239, 68, 68, 0.01) 100%)", borderBottom: `1px solid ${T.border}` }}>
          <span className="card-head-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>💸 Daily Outflows & Expenses</span>
            <span style={{ fontSize: 11, fontWeight: 400, color: T.inkLight, textTransform: "none" }}>(Office, Vehicles, Salaries)</span>
          </span>
          <span style={{ fontWeight: 800, color: T.danger, fontSize: 15 }}>
            {inr(calcs.totalExpenses + calcs.totalVehicleExp + calcs.totalSalaryPayments)}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>

          {/* Sub-section 1: Office Expenses */}
          <div style={{ padding: "16px 20px", borderBottom: `1px dashed ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.inkDark, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🧾 Office Expenses</span>
              </h4>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>{inr(calcs.totalExpenses)}</span>
            </div>
            <table className="tbl" style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={{ width: "65%" }}>Description</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {entry.expenses.map((x) => (
                  <tr key={x.id}>
                    <td><input className="inp-inline left" type="text" placeholder="Expense item…" value={x.desc} onChange={(e) => listSet("expenses", x.id, "desc", e.target.value)} readOnly={!canEdit} /></td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("expenses", x.id, "amt", e.target.value)} readOnly={!canEdit} /></td>
                    <td>
                      {canEdit && entry.expenses.length > 1 && <button className="btn-icon" onClick={() => listRemove("expenses", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-add" onClick={() => listAdd("expenses", blankExpense)}>+ Add Office Expense Row</button>
              </div>
            )}
          </div>

          {/* Sub-section 2: Vehicle Expenses */}
          <div style={{ padding: "16px 20px", borderBottom: `1px dashed ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.inkDark, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🚛 Vehicle Expenses</span>
              </h4>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>{inr(calcs.totalVehicleExp)}</span>
            </div>
            <table className="tbl" style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={{ width: "26%" }}>Vehicle</th>
                  <th style={{ width: "18%" }}>Type</th>
                  <th style={{ width: "32%" }}>Description</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {(entry.vehicleExpenses || []).map((x) => (
                  <tr key={x.id}>
                    <td>
                      <select
                        className="inp-inline left"
                        value={x.vehicleId}
                        onChange={(e) => {
                          const v = vehicles.find(v => String(v.id) === e.target.value);
                          listSet("vehicleExpenses", x.id, "vehicleId", e.target.value);
                          listSet("vehicleExpenses", x.id, "vehicleNo", v ? v.vehicle_no : "");
                        }}
                        style={{ fontSize: 12 }}
                        disabled={!canEdit}
                      >
                        <option value="">— Select —</option>
                        {(vehicles || []).map(v => (
                          <option key={v.id} value={v.id}>{v.vehicle_no} {v.type ? `(${v.type})` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="inp-inline left"
                        value={x.expType}
                        onChange={(e) => listSet("vehicleExpenses", x.id, "expType", e.target.value)}
                        style={{ fontSize: 12 }}
                        disabled={!canEdit}
                      >
                        {VEH_EXP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td><input className="inp-inline left" type="text" placeholder="Details…" value={x.desc} onChange={(e) => listSet("vehicleExpenses", x.id, "desc", e.target.value)} readOnly={!canEdit} /></td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("vehicleExpenses", x.id, "amt", e.target.value)} readOnly={!canEdit} /></td>
                    <td>
                      {canEdit && (entry.vehicleExpenses || []).length > 1 && <button className="btn-icon" onClick={() => listRemove("vehicleExpenses", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-add" onClick={() => listAdd("vehicleExpenses", blankVehicleExp)}>+ Add Vehicle Expense Row</button>
              </div>
            )}
          </div>

          {/* Sub-section 3: Salary / Advance Payments */}
          <div style={{ padding: "16px 20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.inkDark, display: "flex", alignItems: "center", gap: 6 }}>
                <span>👤 Salary / Advance Payments</span>
              </h4>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>{inr(calcs.totalSalaryPayments)}</span>
            </div>
            <table className="tbl" style={{ border: `1px solid ${T.border}`, borderRadius: 4, overflow: "hidden" }}>
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>Employee</th>
                  <th style={{ width: "18%" }}>Type</th>
                  <th style={{ width: "20%" }}>For Month</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {(entry.salaryPayments || []).map((x) => (
                  <tr key={x.id}>
                    <td>
                      <select
                        className="inp-inline left"
                        value={x.employeeId}
                        onChange={(e) => {
                          const emp = employees.find(emp => String(emp.id) === e.target.value);
                          listSet("salaryPayments", x.id, "employeeId", e.target.value);
                          listSet("salaryPayments", x.id, "employeeName", emp ? emp.name : "");
                        }}
                        style={{ fontSize: 12 }}
                        disabled={!canEdit}
                      >
                        <option value="">— Select —</option>
                        {(employees || []).map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name} ({emp.role})</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="inp-inline left"
                        value={x.type}
                        onChange={(e) => listSet("salaryPayments", x.id, "type", e.target.value)}
                        style={{ fontSize: 12 }}
                        disabled={!canEdit}
                      >
                        <option value="Salary">Salary</option>
                        <option value="Advance">Advance</option>
                      </select>
                    </td>
                    <td>
                      <select
                        className="inp-inline left"
                        value={x.forMonth || monthStr()}
                        onChange={(e) => listSet("salaryPayments", x.id, "forMonth", e.target.value)}
                        style={{ fontSize: 12 }}
                        disabled={!canEdit}
                      >
                        {(() => {
                          const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
                          // Show 12 months: current + 11 past (to cover full previous year)
                          const opts = [];
                          const now = new Date();
                          for (let i = 0; i < 12; i++) {
                            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                            const val = monthStr(d); // "YYYY-MM" in LOCAL time (toISOString gave the UTC month)
                            const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; // "June 2026"
                            opts.push(<option key={val} value={val}>{label}</option>);
                          }
                          return opts;
                        })()}
                      </select>
                    </td>
                    <td><input className="inp-inline" type="number" placeholder="0" value={x.amt} onChange={(e) => listSet("salaryPayments", x.id, "amt", e.target.value)} readOnly={!canEdit} /></td>
                    <td>
                      {canEdit && (entry.salaryPayments || []).length > 1 && <button className="btn-icon" onClick={() => listRemove("salaryPayments", x.id)}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-add" onClick={() => listAdd("salaryPayments", blankSalaryPayment)}>+ Add Payment Row</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Godown Stock Section */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <span className="card-head-title">📦 Closing Godown Stock Entry</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ textAlign: "center" }}>Product</th>
                  <th style={{ textAlign: "center" }}>Filled Cylinders</th>
                  <th style={{ textAlign: "center" }}>Empty Cylinders</th>
                </tr>
              </thead>
              <tbody>
                {(entry.godownStock || []).filter(item => {
                  const p = (products || PRODUCTS).find(prod => prod.id === item.productId);
                  return !p || p.category !== 'accessory';
                }).map((item, idx) => {
                  const p = (products || PRODUCTS).find(prod => prod.id === item.productId);
                  return (
                    <tr key={item.productId}>
                      <td style={{ fontWeight: 600, color: T.accent, textAlign: "center" }}>{p ? p.label : item.productId}</td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          className="inp-inline"
                          style={{ textAlign: "center" }}
                          type="number"
                          placeholder="0"
                          value={item.filled}
                          onChange={(e) => {
                            const newStock = [...entry.godownStock];
                            newStock[idx].filled = e.target.value;
                            set("godownStock", newStock);
                          }}
                          readOnly={!canEdit}
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          className="inp-inline"
                          style={{ textAlign: "center" }}
                          type="number"
                          placeholder="0"
                          value={item.empty}
                          onChange={(e) => {
                            const newStock = [...entry.godownStock];
                            newStock[idx].empty = e.target.value;
                            set("godownStock", newStock);
                          }}
                          readOnly={!canEdit}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* In-Out Stock Master (Auto-Calculated) */}
      <div className="card" style={{ marginBottom: 14, background: "#f0f7ff", border: `1px solid ${T.blue}` }}>
        <div className="card-head" style={{ borderBottomColor: "rgba(0,119,255,0.1)" }}>
          <span className="card-head-title" style={{ color: T.blue }}>📦 In-Out Stock Master (Auto)</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr style={{ background: "rgba(0,119,255,0.05)" }}>
                  <th style={{ color: T.blue, textAlign: "center" }}>Product</th>
                  <th style={{ textAlign: "center", color: T.blue }}>Full Cylinder Stock</th>
                  <th style={{ textAlign: "center", color: T.blue }}>Empty Cylinder Stock</th>
                  <th style={{ textAlign: "center", color: "#d97706", whiteSpace: "nowrap" }}>⚠️ Shortage / Stolen</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // openingEmptyByProduct is memoised above (useMemo) — it replays the
                  // whole history and must NOT be recomputed on every keystroke.
                  const activeCyls = (products || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
                  const cylList = activeCyls.length > 0 ? activeCyls : PRODUCTS;
                  return cylList.map((p) => {
                  const prod = (entry.products || []).find(x => x.id === p.id) || {};

                  // Same shared stock engine as the product table and the save path.
                  const totalFull = computeClosingStock(entry, { ...prod, id: p.id });

                  // Opening empty = previous day's In-Out Stock Master auto-calculated empty (running total)
                  const openingEmpty = openingEmptyByProduct[p.id] || 0;

                  // Empty IN today: customers returning empties when buying filled + credit/recovery empties returned
                  const emptyInToday  = emptyInFor(entry, { ...prod, id: p.id });
                  // Empty OUT today: empties sent back to plant via vehicle
                  const emptyOutToday = emptyDespatchedFor(entry, p.id);

                  // Closing Empty = Opening (prev day In-Out Master) + IN today − OUT today
                  const totalEmpty = openingEmpty + emptyInToday - emptyOutToday;

                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: T.accent, textAlign: "center" }}>{p.label}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: T.success, fontSize: 16 }}>
                        {totalFull}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: T.danger, fontSize: 16 }}>
                        {totalEmpty}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {num(prod.shortage) > 0 ? (
                          <span style={{
                            fontWeight: 700,
                            fontSize: 15,
                            color: "#d97706",
                            background: "rgba(245,158,11,0.12)",
                            border: "1.5px solid #f59e0b",
                            borderRadius: 6,
                            padding: "2px 10px",
                            display: "inline-block"
                          }}>
                            {num(prod.shortage)}
                          </span>
                        ) : (
                          <span style={{ color: T.inkLight, fontSize: 13 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 16px", fontSize: 11, color: T.inkLight, fontStyle: "italic", borderTop: "1px solid rgba(0,119,255,0.1)" }}>
            * Full = Opening + Received − Credit Filled − Sold(Cash+Online+SBC+DBC) − Connection Cylinders Issued | Empty = Prev Godown Empty (opening) + Empties IN today (Cash &amp; Online refills + Credit/Recovery returns + Surrenders; SBC/DBC issue new bottles without returning empties) − Sent to Plant | ⚠️ Shortage/Stolen = reminder from Products section above
          </div>
        </div>
      </div>

      <div className="coh-bar" style={{ marginBottom: 18, flexDirection: "column", alignItems: "stretch", gap: 0, padding: 0, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", background: "linear-gradient(135deg, #0b1120 0%, #0f172a 100%)" }}>
          <div>
            <div className="coh-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span>💵</span> Net Cash on Hand
            </div>
            <div className="coh-formula" style={{ fontSize: 11.5, color: "#94a3b8" }}>
              Opening + Cash Sales + Accessories + Recoveries − Expenses − Vehicle − Salary − BOB Bank
            </div>
          </div>
          <div className={`coh-amount${calcs.cashOnHand < 0 ? " negative" : ""}`} style={{ fontSize: 32 }}>
            {inr(calcs.cashOnHand)}
          </div>
        </div>
        {/* Breakdown */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "1px", background: "#e2e8f0" }}>
          {[
            { label: "Opening Cash", val: num(entry.openingCash), color: T.ink },
            { label: "Cash Sales (+)", val: calcs.totalCashSales, color: T.success },
            { label: "Online Sales (+)", val: calcs.totalOnlineSales, color: T.success },
            { label: "Accessories (+)", val: calcs.totalAccessorySales, color: T.success },
            { label: "Credit Received (+)", val: calcs.totalCreditRecoveries, color: T.success },
            { label: "Other Cash Credit (+)", val: calcs.totalOtherCashCredits, color: T.success },
            { label: "Connection Payments (Cash) (+)", val: calcs.totalConnectionPaymentsCash, color: T.success },
            { label: "Cheque/Online (+)", val: calcs.totalCheque, color: T.success },
            { label: "Connection Payments (Online)", val: calcs.totalConnectionPaymentsOnline, color: T.blue, sub: "info only — not in cash" },
            { label: "Online/Chq → Bank (−)", val: calcs.totalOnlineSales + calcs.totalCheque, color: "#ea580c", note: "auto" },
            { label: "Expenses (−)", val: calcs.totalExpenses, color: T.danger },
            { label: "Connection Refunds (−)", val: calcs.totalConnectionRefunds, color: T.danger },
            { label: "Vehicle Exp (−)", val: calcs.totalVehicleExp, color: T.danger },
            { label: "Salary/Adv (−)", val: calcs.totalSalaryPayments, color: T.danger },
            { label: "BOB Bank Deposit (−)", val: num(entry.bob), color: T.danger },
          ].map(({ label, val, color, note, sub }) => (
            <div key={label} style={{ background: "#ffffff", padding: "8px 14px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
                {label} {note && <span style={{ background: "#ea580c", color: "#fff", borderRadius: 3, padding: "0 4px", fontSize: 8.5 }}>AUTO</span>}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color, marginTop: 2 }}>{inr(val)}</span>
              {sub && <span style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 2 }}>{sub}</span>}
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <div style={{ textAlign: "right", marginTop: 20, marginBottom: 28 }}>
          <button
            className="btn-primary"
            style={{
              padding: "13px 32px",
              fontSize: 13,
              fontWeight: 800,
              borderRadius: 10,
              letterSpacing: "0.5px"
            }}
            onClick={onSave}
          >
            <span>💾</span> SAVE TODAY'S ENTRY
          </button>
        </div>
      )}
    </div>
  );
}

export function History({ entries, onEdit, isAdmin, onDelete, products = PRODUCTS }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  // Running empty-cylinder balance for every date, computed once for the whole
  // table instead of replaying history inside each row.
  const emptySeries = useMemo(() => computeEmptyBalanceSeries(entries, products), [entries, products]);

  const handleDelete = async (e, date) => {
    e.stopPropagation(); // prevent row click triggering edit
    const result = await Swal.fire({
      title: "Delete Entry?",
      html: `This will permanently delete the entry for <strong>${fmtDate(date)}</strong> and all associated data.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel"
    });
    if (result.isConfirmed && onDelete) {
      await onDelete(date);
    }
  };
  return (
    <div className="fade-in">
      <div style={{ fontSize: 12, color: T.inkLight, marginBottom: 12 }}>{entries.length} entries · tap to view/edit</div>
      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ borderCollapse: "collapse", border: `1px solid ${T.border}` }}>
            <thead>
              <tr style={{ background: T.cardAlt }}>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Date</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Opening Cash</th>
                <th colSpan="4" style={{ textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Total Sell</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Accessories Sale</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Credit Sale</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Credit Received</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Other Cash Credit</th>
                <th colSpan="2" style={{ textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Connections</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Online/Cheque Deposit</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>BOB Bank Deposit</th>
                <th colSpan="3" style={{ textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Expenses</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Cash on Hand</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Godown Stock</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>In-Out Stock (Auto)</th>
                <th rowSpan="2" style={{ verticalAlign: "middle", textAlign: "center", border: `1px solid ${T.border}`, padding: "10px 8px" }}>Action</th>
              </tr>
              <tr style={{ background: T.cardAlt }}>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Cash Sale</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Online Sale</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>SBC Sale</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>DBC Sale</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }} title="Additional-bottle payments received in cash (online shown in brackets)">Pay (Cash)</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }} title="Net surrender refunds paid out in cash">Refunds</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Office</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Vehicle</th>
                <th style={{ fontSize: 9, textAlign: "center", border: `1px solid ${T.border}`, padding: "6px 8px" }}>Salary/Advance</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={20} style={{ textAlign: "center", padding: 32, color: T.inkLight }}>No entries yet.</td></tr>
              )}
              {sorted.map((e) => {
                const c = calcEntry(e);
                const isToday = e.date === todayStr();

                // Custom strict sale sub-column derivations
                const cashSalesOnly = (e.products || []).reduce((s, p) => s + num(p.sell) * num(p.rate), 0);
                const sbcSalesOnly = (e.products || []).reduce((s, p) => s + num(p.sbc) * num(p.sbcRate), 0);
                const dbcSalesOnly = (e.products || []).reduce((s, p) => s + num(p.dbc) * num(p.dbcRate), 0);

                return (
                  <tr key={e.date} style={{ cursor: "pointer" }} onClick={() => onEdit(e)}>
                    <td style={{ fontWeight: 600, color: T.accent, whiteSpace: "nowrap", border: `1px solid ${T.border}`, textAlign: "center" }}>{fmtDate(e.date)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", fontWeight: 500 }}>{inr(num(e.openingCash))}</td>

                    {/* Total Sell Sub-columns */}
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success }}>{inr(cashSalesOnly)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success }}>{inr(c.totalOnlineSales)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success }}>{inr(sbcSalesOnly)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success }}>{inr(dbcSalesOnly)}</td>

                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right" }}>{inr(c.totalAccessorySales)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.danger }}>{inr(c.totalCredit)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success }}>{inr(c.totalCreditRecoveries)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success }}>{c.totalOtherCashCredits > 0 ? inr(c.totalOtherCashCredits) : <span style={{ color: T.inkLight }}>—</span>}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.success, whiteSpace: "nowrap" }}>
                      {c.totalConnectionPaymentsCash > 0 ? inr(c.totalConnectionPaymentsCash) : <span style={{ color: T.inkLight }}>—</span>}
                      {c.totalConnectionPaymentsOnline > 0 && <span style={{ color: T.blue, fontSize: 10 }}> ({inr(c.totalConnectionPaymentsOnline)} online)</span>}
                    </td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.danger }}>{c.totalConnectionRefunds > 0 ? inr(c.totalConnectionRefunds) : <span style={{ color: T.inkLight }}>—</span>}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.blue }}>{inr(c.totalOnlineSales + c.totalCheque)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.danger }}>{inr(num(e.bob))}</td>

                    {/* Expenses Sub-columns */}
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.danger }}>{inr(c.totalExpenses)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.danger }}>{inr(c.totalVehicleExp)}</td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "right", color: T.danger }}>{inr(c.totalSalaryPayments)}</td>

                    <td style={{ color: c.cashOnHand < 0 ? T.danger : T.success, fontWeight: 700, border: `1px solid ${T.border}`, textAlign: "right" }}>{inr(c.cashOnHand)}</td>

                    <td style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: "nowrap", border: `1px solid ${T.border}` }}>
                      {(e.godownStock || []).map((item) => {
                        const p = (products || PRODUCTS).find(prod => prod.id === item.productId);
                        return (
                          <div key={item.productId} style={{ marginBottom: 2 }}>
                            <span style={{ fontWeight: 600, color: T.inkMid }}>{p ? (p.short || p.label) : item.productId}:</span>
                            <span style={{ color: T.success, marginLeft: 4 }}>{item.filled || 0}</span>
                            <span style={{ color: T.inkLight }}>/</span>
                            <span style={{ color: T.inkMid }}>{item.empty || 0}</span>
                          </div>
                        );
                      })}
                    </td>
                    <td style={{ fontSize: 11, lineHeight: 1.2, whiteSpace: "nowrap", border: `1px solid ${T.border}` }}>
                      {(products || PRODUCTS).map((p) => {
                        const prod = (e.products || []).find(x => x.id === p.id) || {};
                        // Same shared stock engine as the Daily Entry screen, so the
                        // History column can never disagree with the entry screen.
                        const totalFull = computeClosingStock(e, { ...prod, id: p.id });
                        // Running closing empty balance, looked up from the precomputed
                        // series rather than replayed per row.
                        const totalEmpty = (emptySeries[e.date] || {})[p.id] || 0;
                        return (
                          <div key={p.id} style={{ marginBottom: 2 }}>
                            <span style={{ fontWeight: 600, color: T.inkMid }}>{p.short}:</span>
                            <span style={{ color: T.success, marginLeft: 4 }}>{totalFull}</span>
                            <span style={{ color: T.inkLight }}>/</span>
                            <span style={{ color: T.danger }}>{totalEmpty}</span>
                          </div>
                        );
                      })}
                    </td>
                    <td style={{ border: `1px solid ${T.border}`, textAlign: "center", whiteSpace: "nowrap", padding: "0 8px" }}>
                      <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <span style={{ display: "inline-flex", gap: 4, alignItems: "center", background: (isToday || isAdmin) ? T.ink : T.blueBg, color: (isToday || isAdmin) ? "#fff" : T.blue, padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                          {(isToday || isAdmin) ? "✏️ Edit" : "👁️ View"}
                        </span>
                        {isAdmin && (
                          <span
                            onClick={(ev) => handleDelete(ev, e.date)}
                            style={{ display: "inline-flex", alignItems: "center", background: "#ef4444", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            🗑️ Del
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PendingCredits({ pending, onRecord, products = PRODUCTS }) {
  const [filter, setFilter] = useState("pending");
  const [modal, setModal] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payEmpty, setPayEmpty] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [payNote, setPayNote] = useState("");

  const totalOutstanding = pending.filter((p) => !p.cleared).reduce((s, p) => s + (p.originalAmt - p.recovered), 0);
  const totalPending = pending.filter((p) => !p.cleared).length;
  const filtered = pending.filter((p) => filter === "all" ? true : filter === "cleared" ? p.cleared : !p.cleared).sort((a, b) => b.date.localeCompare(a.date));

  const submitPayment = async () => {
    const amt = num(payAmt);
    const emp = num(payEmpty);
    if (payAmt === "" && payEmpty === "") return;
    if (!modal) return;
    await onRecord(modal, amt, payDate, payNote, emp);
    setModal(null); setPayAmt(""); setPayEmpty(""); setPayNote(""); setPayDate(todayStr());
  };

  return (
    <div className="fade-in">
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.danger }}>
          <div className="stat-val" style={{ color: T.danger }}>{inr(totalOutstanding)}</div>
          <div className="stat-lbl">Total Outstanding</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.warn }}>
          <div className="stat-val" style={{ color: T.warn }}>{totalPending}</div>
          <div className="stat-lbl">Pending Accounts</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{ color: T.success }}>{pending.filter((p) => p.cleared).length}</div>
          <div className="stat-lbl">Cleared Accounts</div>
        </div>
      </div>

      <div className="period-row">
        {[["pending", "⏳ Pending"], ["cleared", "✅ Cleared"], ["all", "All"]].map(([v, l]) => (
          <button key={v} className={`btn-ghost${filter === v ? " active" : ""}`}
            style={{ background: filter === v ? T.accent : "transparent", color: filter === v ? "#fff" : T.inkMid, borderColor: filter === v ? T.accent : T.border }}
            onClick={() => setFilter(v)}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center", marginLeft: 4 }}>{filtered.length} records</span>
      </div>

      {filtered.length === 0 && <div className="card"><div className="card-body" style={{ textAlign: "center", padding: 40, color: T.inkLight }}>No records found.</div></div>}

      {filtered.map((p) => {
        const remaining = p.originalAmt - p.recovered;
        const pct = (p.recovered / p.originalAmt) * 100;
        const prodDef = p.productId ? (products || PRODUCTS).find(pr => pr.id === p.productId) : null;
        return (
          <div key={p.id} className={`pending-item${p.cleared ? " cleared" : ""}`}>
            <div className="pi-top">
              <div>
                <div className="pi-name">{p.customerName}</div>
                <div className="pi-meta">Credit on {fmtDate(p.date)}</div>
                {(prodDef || p.filledQty > 0 || p.emptyQty > 0) && (() => {
                  const filled = num(p.filledQty) || 0;
                  const empty = num(p.emptyQty) || 0;
                  const emptyDue = filled - empty;
                  return (
                    <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                      {prodDef && (
                        <span style={{ fontSize: 11, background: "#f0f7ff", color: T.blue, borderRadius: 4, padding: "2px 8px", fontWeight: 600, border: `1px solid ${T.border}` }}>
                          🛢️ {prodDef.short}
                        </span>
                      )}
                      {filled > 0 && (
                        <span style={{ fontSize: 11, background: "#f0fff4", color: T.success, borderRadius: 4, padding: "2px 8px", fontWeight: 600, border: `1px solid ${T.border}` }}>
                          ↓ {filled} Filled Taken
                        </span>
                      )}
                      {empty > 0 && (
                        <span style={{ fontSize: 11, background: "#fff7f0", color: "#e67e22", borderRadius: 4, padding: "2px 8px", fontWeight: 600, border: `1px solid ${T.border}` }}>
                          ↑ {empty} Empty Given
                        </span>
                      )}
                      {emptyDue > 0 && (
                        <span style={{ fontSize: 11, background: "#fff0f0", color: T.danger, borderRadius: 4, padding: "2px 8px", fontWeight: 600, border: `1px solid ${T.border}` }}>
                          ⚠️ {emptyDue} Empty Due
                        </span>
                      )}
                    </div>
                  );
                })()}
                {p.remarks && (
                  <div style={{ fontSize: 11, color: T.inkLight, marginTop: 4, fontStyle: "italic" }}>📝 {p.remarks}</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span className={`badge ${p.cleared ? "badge-success" : remaining > 0 ? "badge-danger" : "badge-warn"}`}>
                  {p.cleared ? "CLEARED" : `DUE ${inr(remaining)}`}
                </span>
                {!p.cleared && (
                  <button className="btn-ghost" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => setModal(p.id)}>
                    💰 Record Payment
                  </button>
                )}
              </div>
            </div>
            <div className="pi-bar-wrap"><div className="pi-bar" style={{ width: `${pct}%` }} /></div>
            <div className="pi-amounts">
              <span style={{ color: T.inkLight }}>Original: <strong style={{ color: T.ink }}>{inr(p.originalAmt)}</strong></span>
              <span style={{ color: T.inkLight }}>Recovered: <strong style={{ color: T.success }}>{inr(p.recovered)}</strong></span>
              <span style={{ color: T.inkLight }}>Remaining: <strong style={{ color: p.cleared ? T.success : T.danger }}>{inr(remaining)}</strong></span>
            </div>
            {p.payments.length > 0 && (
              <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.inkLight, marginBottom: 6 }}>Payment History</div>
                {p.payments.map((pay, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: idx < p.payments.length - 1 ? "1px solid #f5f3ee" : "none" }}>
                    <span style={{ color: T.inkMid }}>{fmtDate(pay.date)}{pay.note ? ` · ${pay.note}` : ""}</span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {num(pay.emptyReturned) > 0 && <span style={{ color: "#e67e22", fontWeight: 600, fontSize: 11 }}>↑ {pay.emptyReturned} Empty</span>}
                      {num(pay.amt) > 0 && <span style={{ color: T.success, fontWeight: 600 }}>+{inr(pay.amt)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {modal && (() => {
        const item = pending.find((p) => p.id === modal);
        const remaining = item ? item.originalAmt - item.recovered : 0;
        const totalEmptyGiven = (item?.payments || []).reduce((s, p) => s + num(p.emptyReturned), 0);
        const emptyDue = Math.max(0, (num(item?.filledQty) || 0) - (num(item?.emptyQty) || 0) - totalEmptyGiven);
        
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
            <div style={{ background: T.card, borderRadius: 12, padding: 24, width: "100%", maxWidth: 400, boxShadow: T.shadowMd }}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 4, color: T.ink }}>Record Payment</div>
              <div style={{ fontSize: 12, color: T.inkLight, marginBottom: 18 }}>
                {item?.customerName} · Remaining: <strong style={{ color: T.danger }}>{inr(remaining)}</strong>
              </div>
              <div className="field"><label>Payment Date</label><input className="inp" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Amount (₹)</label>
                  <input className="inp" type="number" placeholder={`Max ${inr(remaining)}`} value={payAmt} onChange={(e) => setPayAmt(e.target.value)} />
                </div>
                <div className="field">
                  <label>Empties Returned</label>
                  <input className="inp" type="number" placeholder={`Max ${emptyDue}`} max={emptyDue} value={payEmpty} onChange={(e) => {
                    let v = num(e.target.value);
                    if (v > emptyDue) v = emptyDue;
                    setPayEmpty(e.target.value === "" ? "" : v);
                  }} />
                </div>
              </div>

              <div className="field"><label>Note (optional)</label><input className="inp" type="text" placeholder="Cash / Online / Cheque…" value={payNote} onChange={(e) => setPayNote(e.target.value)} /></div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={() => { setModal(null); setPayAmt(""); setPayEmpty(""); setPayNote(""); }}>Cancel</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={submitPayment}>Save Payment</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export function Summary({ entries, products = PRODUCTS }) {
  const [period, setPeriod] = useState("month");
  const now = new Date();
  const filtered = entries.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    if (period === "week") { const wa = new Date(); wa.setDate(wa.getDate() - 7); return d >= wa; }
    if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    return true;
  });
  const totals = filtered.reduce((acc, e) => {
    const c = calcEntry(e);
    acc.sales += c.totalSales + c.totalAccessorySales;
    acc.expenses += c.totalExpenses + c.totalVehicleExp;
    acc.credit += c.totalCredit;
    acc.cheque += c.totalCheque;
    acc.delivery += c.totalDelivery;
    acc.salary += c.totalSalaryPayments;
    acc.connCash += c.totalConnectionPaymentsCash;
    acc.connOnline += c.totalConnectionPaymentsOnline;
    acc.connRefunds += c.totalConnectionRefunds;
    return acc;
  }, { sales: 0, expenses: 0, credit: 0, cheque: 0, delivery: 0, salary: 0, connCash: 0, connOnline: 0, connRefunds: 0 });
  const productTotals = (products || PRODUCTS).map((p) => {
    const findProd = (e) => (e.products || []).find(x => x.id === p.id) || {};
    const cashQty = filtered.reduce((s, e) => s + num(findProd(e).sell), 0);
    const onlineQty = filtered.reduce((s, e) => s + num(findProd(e).online), 0);
    const sbcQty = filtered.reduce((s, e) => s + num(findProd(e).sbc), 0);
    const dbcQty = filtered.reduce((s, e) => s + num(findProd(e).dbc), 0);

    const revenue = filtered.reduce((s, e) => {
      const prod = findProd(e);
      const sell = num(prod.sell);
      const online = num(prod.online);
      const sbc = num(prod.sbc);
      const dbc = num(prod.dbc);
      const rate = num(prod.rate);
      const sbcRate = num(prod.sbcRate);
      const dbcRate = num(prod.dbcRate);
      return s + (sell * rate) + (online * rate) + (sbc * sbcRate) + (dbc * dbcRate);
    }, 0);

    const parts = [];
    if (cashQty > 0) parts.push(`${cashQty} Cash`);
    if (onlineQty > 0) parts.push(`${onlineQty} Online`);
    if (sbcQty > 0) parts.push(`${sbcQty} SBC`);
    if (dbcQty > 0) parts.push(`${dbcQty} DBC`);

    return {
      label: p.label,
      qty: parts.length > 0 ? parts.join(" / ") : "0",
      revenue,
    };
  });
  const boyTotalsObj = {};
  filtered.forEach(e => {
    Object.entries(e.delivery || {}).forEach(([b, val]) => {
      const q = typeof val === 'object' && val !== null ? (num(val.cash) + num(val.online)) : num(val);
      if (q > 0) boyTotalsObj[b] = (boyTotalsObj[b] || 0) + q;
    });
  });
  const boyTotals = Object.entries(boyTotalsObj).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty);

  return (
    <div className="fade-in">
      <div className="period-row">
        {[["week", "Last 7 Days"], ["month", "This Month"], ["all", "All Time"]].map(([v, l]) => (
          <button key={v} className="btn-ghost" style={{ background: period === v ? T.accent : "transparent", color: period === v ? "#fff" : T.inkMid, borderColor: period === v ? T.accent : T.border }} onClick={() => setPeriod(v)}>{l}</button>
        ))}
        <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center" }}>{filtered.length} entries</span>
      </div>
      <div className="stat-row">
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{inr(totals.sales)}</div><div className="stat-lbl">Total Sales</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(totals.expenses)}</div><div className="stat-lbl">Expenses</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{ color: T.blue }}>{inr(totals.cheque)}</div><div className="stat-lbl">Cheque/Online</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(totals.salary)}</div><div className="stat-lbl">Salary/Advance</div></div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{inr(totals.connCash)}</div><div className="stat-lbl">Connection Payments (Cash)</div>{totals.connOnline > 0 && <div className="stat-delta" style={{ color: T.blue }}>+ {inr(totals.connOnline)} online</div>}</div>
        <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(totals.connRefunds)}</div><div className="stat-lbl">Connection Refunds</div></div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-head"><span className="card-head-title">🛢️ Product Sales</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>Qty Sold</th><th style={{ textAlign: "right" }}>Revenue</th></tr></thead>
              <tbody>{productTotals.map((p) => <tr key={p.label}><td style={{ color: T.accent, fontWeight: 500 }}>{p.label}</td><td style={{ fontWeight: 600, textAlign: "right" }}>{p.qty}</td><td style={{ color: T.success, fontWeight: 700, textAlign: "right" }}>{inr(p.revenue)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">🚚 Delivery Boy</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Delivery Boy</th><th style={{ textAlign: "right" }}>Deliveries</th><th>Share</th></tr></thead>
              <tbody>
                {boyTotals.map((b, idx) => {
                  const pct = totals.delivery > 0 ? Math.round((b.qty / totals.delivery) * 100) : 0;
                  return (
                    <tr key={b.name}><td style={{ fontWeight: idx === 0 ? 700 : 400 }}>{b.name}</td><td style={{ fontWeight: 700, color: T.accent, textAlign: "right" }}>{b.qty}</td>
                      <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1, background: T.border, borderRadius: 20, height: 5, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: T.accent }} /></div><span style={{ fontSize: 11, color: T.inkLight }}>{pct}%</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export { default as SalaryReport } from "./SharedSalaryReport";

export function GodownStock({ products, blankStock, api }) {
  const [date, setDate] = useState(todayStr());
  const [items, setItems] = useState(blankStock());
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStock = async (d) => {
    try {
      const data = await api.getGodownStock(d);
      if (data && data.length > 0) {
        const newItems = blankStock().map(blank => {
          const found = data.find(item => item.productId === blank.productId);
          return found ? { ...blank, filled: found.filled, empty: found.empty } : blank;
        });
        setItems(newItems);
      } else {
        setItems(blankStock());
      }
    } catch (e) {
      console.error(e);
      setItems(blankStock());
    }
    setLoading(false);
  };

  // Was `useState(() => fetchStock(date), [])` — a hook misuse that ran the
  // fetch during the initial render. useEffect is the correct hook.
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => alive && fetchStock(date));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = (newDate) => {
    setDate(newDate);
    setLoading(true);
    fetchStock(newDate);
  };

  const setItem = (index, field, val) => {
    const newItems = [...items];
    newItems[index][field] = val;
    setItems(newItems);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await api.saveGodownStock(date, items);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        Swal.fire({
          title: "Saved Successfully!",
          text: "Godown stock has been recorded in the database.",
          icon: "success",
          confirmButtonColor: "#0077ff",
          timer: 2000,
          timerProgressBar: true
        });
      }
    } catch (e) {
      console.error(e);
      Swal.fire({
        title: "Save Failed!",
        text: e.message || "An error occurred while saving the godown stock.",
        icon: "error",
        confirmButtonColor: "#ef4444"
      });
    }
    setLoading(false);
  };

  return (
    <div className="fade-in">
      {saved && <div className="alert alert-success">✅ Godown stock saved successfully!</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-head-title">📅 Select Date</span></div>
        <div className="card-body">
          <input className="inp" type="date" value={date} max={todayStr()} onChange={(e) => handleDateChange(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-head-title">📦 Closing Godown Stock Entry</span>
          {loading && <span style={{ fontSize: 11, color: T.inkLight }}>Loading...</span>}
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ textAlign: "center" }}>Product</th>
                  <th style={{ textAlign: "center" }}>Filled Cylinders</th>
                  <th style={{ textAlign: "center" }}>Empty Cylinders</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const p = products.find(prod => prod.id === item.productId);
                  return (
                    <tr key={item.productId}>
                      <td style={{ fontWeight: 600, color: T.accent, textAlign: "center" }}>{p ? p.label : item.productId}</td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          className="inp-inline"
                          style={{ textAlign: "center" }}
                          type="number"
                          placeholder="0"
                          value={item.filled}
                          onChange={(e) => setItem(idx, "filled", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          className="inp-inline"
                          style={{ textAlign: "center" }}
                          type="number"
                          placeholder="0"
                          value={item.empty}
                          onChange={(e) => setItem(idx, "empty", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "right", marginTop: 20 }}>
        <button className="btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "💾 Save Godown Stock"}
        </button>
      </div>
    </div>
  );
}
