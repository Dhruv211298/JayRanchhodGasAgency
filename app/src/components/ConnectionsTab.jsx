import React, { useState, useEffect, useCallback } from "react";
import Swal from "sweetalert2";
import { api } from "../api";
import { T } from "../styles";
import {
  PRODUCTS, ACCESSORIES, todayStr, fmtDate, fmtMonth, inr, num, uid, productLabel, downloadCsv
} from "../constants";

/* ════════════════════════════════════════════════════════════════
   CONNECTIONS TAB — stock, money and accounting for connection events
   ────────────────────────────────────────────────────────────────
   There is NO customer / consumer-wise master here. BPCL's own system
   holds consumer names, numbers and the security-deposit record. This
   screen records only what moves STOCK and MONEY at the counter, per
   cylinder category:

     New connection    qty × (single 1 | double 2) filled cylinders OUT,
                       no money.
     Additional bottle qty filled cylinders OUT + amount collected,
                       cash (→ cash on hand) or online (reported only).
     Surrender         empties physically returned IN; missing cylinders
                       are penalty-only; gross refund − Σ itemised
                       penalties = net cash OUT. Breakdown shown BEFORE
                       confirm.

   Office : record for today only + today's register (history read-only).
   Admin  : any past date, void wrong entries, and every report.
   Money rules are enforced by the SERVER; this screen mirrors them
   for immediate feedback only.
════════════════════════════════════════════════════════════════ */

const swalErr = (title, e) => {
  if (e && (e.message === "session_expired" || e.forbidden)) return; // handled globally
  Swal.fire({ title, text: (e && e.message) || "Something went wrong.", icon: "error", confirmButtonColor: "#ef4444" });
};
const swalDup = () => Swal.fire({
  title: "Already Recorded",
  text: "This was already saved — it has not been recorded twice.",
  icon: "info", confirmButtonColor: "#0077ff",
});
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

const TYPE_BADGE = { new: "badge-ink", additional: "badge-blue", surrender: "badge-danger" };
const TYPE_LABEL = { new: "New Connection", additional: "Additional Bottle", surrender: "Surrender" };
const PENALTY_PRESETS = [
  ...ACCESSORIES.map(a => ({ id: a.id, label: `Missing / damaged ${a.label.toLowerCase()}` })),
  { id: "regulator", label: "Missing / damaged regulator" },
  { id: "missing cylinder", label: "Missing cylinder (not returned)" },
  { id: "damaged cylinder", label: "Damaged cylinder (returned)" },
  { id: "__other", label: "Other (type below)" },
];

/* Product selector — the same PRODUCTS source as the Day Entry form. */
export function ProductSelect({ value, onChange, products = PRODUCTS }) {
  const list = (products || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const items = list.length > 0 ? list : PRODUCTS;
  return (
    <select className="inp" value={value} onChange={e => onChange(e.target.value)}>
      {items.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}

/* Event-date field: office users always see today (locked); admins may pick a past date. */
export function EventDateField({ value, onChange, isAdmin, lockDate = false }) {
  if (lockDate) {
    return (
      <div className="field">
        <label>Date (Entry Date)</label>
        <input className="inp" type="date" value={value} readOnly style={{ background: "rgba(0,119,255,0.05)", fontWeight: 600, color: T.accent }} />
      </div>
    );
  }
  return (
    <div className="field">
      <label>Date {isAdmin ? "" : "(today only)"}</label>
      <input className="inp" type="date" value={value} max={todayStr()} readOnly={!isAdmin} onChange={e => onChange(e.target.value)} />
      {!isAdmin && <div style={{ fontSize: 10, color: T.inkLight, marginTop: 3 }}>Back-dated entries can only be made by an administrator.</div>}
    </div>
  );
}

export function EffectBox({ children, danger }) {
  return <div style={{ fontSize: 12, color: danger ? T.danger : T.inkMid, background: danger ? T.dangerBg : T.cardAlt, borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>{children}</div>;
}

/* ── Form 1: New connection — stock + optional cash / online payment ── */
export function NewConnectionForm({ isAdmin, onDone, defaultDate, lockDate = false, products = PRODUCTS }) {
  const blank = () => ({ productId: "p14", connectionType: "single", qty: "1", amount: "", paymentMode: "", remarks: "", date: defaultDate || todayStr() });
  const [f, setF] = useState(blank());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultDate) setF(x => ({ ...x, date: defaultDate }));
  }, [defaultDate]);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const qty = num(f.qty);
  const cyl = qty * (f.connectionType === "double" ? 2 : 1);
  const amountOk = f.amount !== "" && Number.isFinite(Number(f.amount)) && num(f.amount) >= 0;

  const submit = async () => {
    if (!(Number.isInteger(qty) && qty >= 1)) return Swal.fire({ title: "Enter how many connections", icon: "warning", confirmButtonColor: "#0077ff" });
    if (!amountOk) return Swal.fire({ title: "Amount is required", text: "Enter the amount collected (or 0 if none).", icon: "warning", confirmButtonColor: "#0077ff" });
    if (num(f.amount) > 0 && f.paymentMode !== "cash" && f.paymentMode !== "online") {
      return Swal.fire({ title: "Select payment mode", text: "Cash or Online — only cash enters cash-on-hand.", icon: "warning", confirmButtonColor: "#0077ff" });
    }
    setBusy(true);
    try {
      const r = await api.recordNewConnection({
        date: f.date,
        productId: f.productId,
        connectionType: f.connectionType,
        qty,
        amount: num(f.amount),
        paymentMode: num(f.amount) > 0 ? f.paymentMode : (f.paymentMode || null),
        remarks: f.remarks,
      });
      if (r.duplicate) await swalDup();
      else {
        const cashMsg = num(r.amount) > 0
          ? `<br/>${inr(r.amount)} recorded as <strong>${r.payment_mode === "cash" ? "cash — added to cash on hand" : "online — reported, not added to cash on hand"}</strong>.`
          : '';
        Swal.fire({
          title: "Recorded",
          html: `${r.cylinders_out} filled ${productLabel(f.productId, products)} issued from stock.${cashMsg}`,
          icon: "success",
          confirmButtonColor: "#0077ff",
          timer: 3500,
          timerProgressBar: true
        });
      }
      setF(blank()); onDone();
    } catch (e) { swalErr("Not recorded", e); }
    setBusy(false);
  };
  return (
    <div className="card" style={{ height: "100%" }}>
      <div className="card-head">
        <span className="card-head-title">➕ New Connection</span>
        <span className="badge badge-success">cash / online IN</span>
      </div>
      <div className="card-body">
        <div className="field"><label>Cylinder Category *</label><ProductSelect value={f.productId} onChange={v => set("productId", v)} products={products} /></div>
        <div className="g2">
          <div className="field"><label>Connection Type *</label>
            <select className="inp" value={f.connectionType} onChange={e => set("connectionType", e.target.value)}>
              <option value="single">Single bottle (1 cyl each)</option>
              <option value="double">Double bottle (2 cyl each)</option>
            </select>
          </div>
          <div className="field"><label>No. of Connections *</label><input className="inp" type="number" min="1" step="1" value={f.qty} onChange={e => set("qty", e.target.value)} /></div>
        </div>
        <div className="g2">
          <div className="field"><label>Amount Collected (₹) *</label>
            <input className="inp" type="number" min="0" step="0.01" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="0 or amount collected" style={{ borderColor: f.amount !== "" && !amountOk ? T.danger : undefined }} />
          </div>
          <div className="field"><label>Payment Mode *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[["cash", "💵 Cash"], ["online", "🏦 Online"]].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className="btn-ghost"
                  style={{
                    flex: 1,
                    padding: "9px 6px",
                    background: f.paymentMode === v ? (v === "cash" ? T.success : T.blue) : "transparent",
                    color: f.paymentMode === v ? "#fff" : T.inkMid,
                    borderColor: f.paymentMode === v ? (v === "cash" ? T.success : T.blue) : T.border
                  }}
                  onClick={() => set("paymentMode", v)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <EventDateField value={f.date} onChange={v => set("date", v)} isAdmin={isAdmin} lockDate={lockDate} />
        <div className="field"><label>Remarks (optional)</label><input className="inp" type="text" value={f.remarks} onChange={e => set("remarks", e.target.value)} placeholder="Not required" /></div>
        <EffectBox>
          Stock: <strong>−{cyl || 0} filled {productLabel(f.productId, products)}</strong> on {fmtDate(f.date)} · Cash on hand: <strong style={{ color: f.paymentMode === "cash" ? T.success : T.inkMid }}>
            {num(f.amount) > 0
              ? (f.paymentMode === "cash" ? `+${inr(f.amount)}` : f.paymentMode === "online" ? `unchanged (${inr(f.amount)} online, reported separately)` : "—")
              : "none (deposit recorded by BPCL or ₹0 entered)"}
          </strong>
        </EffectBox>
        <button className="btn-primary" style={{ width: "100%" }} onClick={submit} disabled={busy}>
          {busy ? "Saving…" : num(f.amount) > 0 ? "✅ Record Payment & Issue" : "✅ Issue Cylinders"}
        </button>
      </div>
    </div>
  );
}

/* ── Form 2: Additional bottle — filled out + cash / online in ── */
export function AdditionalBottleForm({ isAdmin, onDone, defaultDate, lockDate = false, products = PRODUCTS }) {
  const blank = () => ({ productId: "p14", qty: "1", amount: "", paymentMode: "", remarks: "", date: defaultDate || todayStr() });
  const [f, setF] = useState(blank());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultDate) setF(x => ({ ...x, date: defaultDate }));
  }, [defaultDate]);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const qty = num(f.qty);
  const amountOk = f.amount !== "" && Number.isFinite(Number(f.amount)) && num(f.amount) > 0;
  const submit = async () => {
    if (!(Number.isInteger(qty) && qty >= 1)) return Swal.fire({ title: "Enter how many bottles", icon: "warning", confirmButtonColor: "#0077ff" });
    if (!amountOk) return Swal.fire({ title: "Amount is required", text: "Enter the amount collected (greater than zero).", icon: "warning", confirmButtonColor: "#0077ff" });
    if (f.paymentMode !== "cash" && f.paymentMode !== "online") return Swal.fire({ title: "Select payment mode", text: "Cash or Online — only cash enters cash-on-hand.", icon: "warning", confirmButtonColor: "#0077ff" });
    setBusy(true);
    try {
      const r = await api.recordAdditionalBottle({ date: f.date, productId: f.productId, qty, amount: num(f.amount), paymentMode: f.paymentMode, remarks: f.remarks });
      if (r.duplicate) await swalDup();
      else Swal.fire({ title: "Recorded", html: `${r.cylinders_out} filled ${productLabel(f.productId, products)} issued.<br/>${inr(r.amount)} recorded as <strong>${r.payment_mode === "cash" ? "cash — added to cash on hand" : "online — reported, not added to cash on hand"}</strong>.`, icon: "success", confirmButtonColor: "#0077ff" });
      setF(blank()); onDone();
    } catch (e) { swalErr("Not recorded", e); }
    setBusy(false);
  };
  return (
    <div className="card" style={{ height: "100%" }}>
      <div className="card-head"><span className="card-head-title">🛢️ Additional Bottle</span><span className="badge badge-success">cash / online IN</span></div>
      <div className="card-body">
        <div className="g2">
          <div className="field"><label>Cylinder Category *</label><ProductSelect value={f.productId} onChange={v => set("productId", v)} products={products} /></div>
          <div className="field"><label>No. of Bottles *</label><input className="inp" type="number" min="1" step="1" value={f.qty} onChange={e => set("qty", e.target.value)} /></div>
        </div>
        <div className="g2">
          <div className="field"><label>Amount Collected (₹) *</label>
            <input className="inp" type="number" min="1" step="0.01" value={f.amount} onChange={e => set("amount", e.target.value)} placeholder="Required" style={{ borderColor: f.amount !== "" && !amountOk ? T.danger : undefined }} />
          </div>
          <div className="field"><label>Payment Mode *</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[["cash", "💵 Cash"], ["online", "🏦 Online"]].map(([v, l]) => (
                <button key={v} type="button" className="btn-ghost" style={{ flex: 1, padding: "9px 6px", background: f.paymentMode === v ? (v === "cash" ? T.success : T.blue) : "transparent", color: f.paymentMode === v ? "#fff" : T.inkMid, borderColor: f.paymentMode === v ? (v === "cash" ? T.success : T.blue) : T.border }} onClick={() => set("paymentMode", v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <EventDateField value={f.date} onChange={v => set("date", v)} isAdmin={isAdmin} lockDate={lockDate} />
        <div className="field"><label>Remarks (optional)</label><input className="inp" type="text" value={f.remarks} onChange={e => set("remarks", e.target.value)} placeholder="Not required" /></div>
        <EffectBox>
          Stock: <strong>−{qty || 0} filled {productLabel(f.productId, products)}</strong> · Cash on hand: <strong style={{ color: f.paymentMode === "cash" ? T.success : T.inkMid }}>
            {f.paymentMode === "cash" ? `+${inr(f.amount)}` : f.paymentMode === "online" ? `unchanged (${inr(f.amount)} online, reported separately)` : "—"}
          </strong>
        </EffectBox>
        <button className="btn-primary" style={{ width: "100%" }} onClick={submit} disabled={busy}>{busy ? "Saving…" : "✅ Record Payment & Issue"}</button>
      </div>
    </div>
  );
}

/* ── Form 3: Surrender — empties in + net cash out ── */
export function SurrenderForm({ isAdmin, onDone, defaultDate, lockDate = false, products = PRODUCTS }) {
  const blank = () => ({ productId: "p14", qty: "1", cylindersReturned: "1", cylindersMissing: "0", refundAmount: "", remarks: "", date: defaultDate || todayStr() });
  const [f, setF] = useState(blank());
  const [penalties, setPenalties] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultDate) setF(x => ({ ...x, date: defaultDate }));
  }, [defaultDate]);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const addPenalty = (preset = "") => setPenalties(p => [...p, { id: uid(), preset, other: "", amount: "" }]);
  const setPenalty = (id, k, v) => setPenalties(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));
  const removePenalty = (id) => setPenalties(p => p.filter(x => x.id !== id));
  const penaltyItem = (p) => p.preset === "__other" ? p.other.trim() : p.preset;

  const qty = num(f.qty), returned = num(f.cylindersReturned), missing = num(f.cylindersMissing);
  const refund = num(f.refundAmount);
  const penaltySum = penalties.reduce((s, p) => s + num(p.amount), 0);
  const netPaid = Math.round((refund - penaltySum) * 100) / 100;
  const refundOk = f.refundAmount !== "" && Number.isFinite(Number(f.refundAmount)) && refund >= 0;
  const countsOk = Number.isInteger(qty) && qty >= 1 && Number.isInteger(returned) && Number.isInteger(missing) && returned >= 0 && missing >= 0 && returned + missing >= qty && returned + missing <= qty * 2;
  const invalidPenalty = penalties.find(p => !penaltyItem(p) || !(num(p.amount) > 0));
  const hasMissingPenalty = penalties.some(p => /missing cylinder/i.test(penaltyItem(p)));
  const canConfirm = refundOk && countsOk && !invalidPenalty && netPaid >= 0;

  const submit = async () => {
    if (!canConfirm) return Swal.fire({ title: "Check the form", text: !countsOk ? `Returned + missing must be between ${qty || 1} and ${(qty || 1) * 2} cylinders.` : !refundOk ? "Enter the refund amount (0 or more)." : invalidPenalty ? "Every penalty needs an item and an amount above zero." : "Penalties exceed the refund — net cannot be negative.", icon: "warning", confirmButtonColor: "#0077ff" });
    setBusy(true);
    try {
      const r = await api.recordSurrender({
        date: f.date, productId: f.productId, qty, cylindersReturned: returned, cylindersMissing: missing, refundAmount: refund, remarks: f.remarks,
        penalties: penalties.map(p => ({ itemDescription: penaltyItem(p), amount: num(p.amount) })),
      });
      if (r.duplicate) await swalDup();
      else Swal.fire({ title: "Surrender recorded", html: `Net <strong>${inr(r.net_paid)}</strong> paid out in cash (refund ${inr(r.amount)} − penalties ${inr(r.penalty_deducted)}).<br/>${r.cylinders_in} empty ${productLabel(f.productId, products)} added to stock${r.cylinders_missing > 0 ? `; ${r.cylinders_missing} missing (penalty only, not stock)` : ""}.`, icon: "success", confirmButtonColor: "#0077ff" });
      setF(blank()); setPenalties([]); onDone();
    } catch (e) { swalErr("Not recorded", e); }
    setBusy(false);
  };

  return (
    <div className="card">
      <div className="card-head"><span className="card-head-title">↩️ Surrender / Return</span><span className="badge badge-danger">cash OUT</span></div>
      <div className="card-body">
        <div className="g3">
          <div className="field"><label>Cylinder Category *</label><ProductSelect value={f.productId} onChange={v => set("productId", v)} products={products} /></div>
          <div className="field"><label>Connections Surrendered *</label><input className="inp" type="number" min="1" step="1" value={f.qty} onChange={e => set("qty", e.target.value)} /></div>
          <div className="field"><label>Refund Amount (₹) *</label>
            <input className="inp" type="number" min="0" step="0.01" value={f.refundAmount} onChange={e => set("refundAmount", e.target.value)} placeholder="From BPCL passbook / SV" />
          </div>
        </div>
        <div className="g3">
          <div className="field"><label>Empty Cylinders Returned *</label><input className="inp" type="number" min="0" step="1" value={f.cylindersReturned} onChange={e => set("cylindersReturned", e.target.value)} /></div>
          <div className="field"><label>Cylinders Missing (not returned)</label><input className="inp" type="number" min="0" step="1" value={f.cylindersMissing} onChange={e => set("cylindersMissing", e.target.value)} />
            {missing > 0 && !hasMissingPenalty && <div style={{ fontSize: 10, color: T.warn, marginTop: 3 }}>⚠️ add a "Missing cylinder" penalty below — missing cylinders never enter stock.</div>}
          </div>
          <EventDateField value={f.date} onChange={v => set("date", v)} isAdmin={isAdmin} lockDate={lockDate} />
        </div>
        {!countsOk && qty >= 1 && <div className="login-err">⚠️ {qty} connection(s) hold between {qty} and {qty * 2} cylinders — account for each one as returned or missing.</div>}

        {/* Penalty line items */}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <span className="card-head-title">⚖️ Penalty Deductions (itemised)</span>
            <span style={{ fontWeight: 700, color: T.danger, fontSize: 13 }}>−{inr(penaltySum)}</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="tbl">
              <thead><tr><th style={{ width: "40%" }}>Item</th><th style={{ width: "30%" }}>Description</th><th style={{ textAlign: "right" }}>Amount (₹)</th><th style={{ width: 36 }}></th></tr></thead>
              <tbody>
                {penalties.length === 0 && <tr><td colSpan={4} style={{ padding: 14, color: T.inkLight, fontSize: 12 }}>No deductions — full refund will be paid.</td></tr>}
                {penalties.map(p => (
                  <tr key={p.id}>
                    <td>
                      <select className="inp-inline left" value={p.preset} onChange={e => setPenalty(p.id, "preset", e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">— Select item —</option>
                        {PENALTY_PRESETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </td>
                    <td>{p.preset === "__other" ? <input className="inp-inline left" type="text" placeholder="e.g. valve damage" value={p.other} onChange={e => setPenalty(p.id, "other", e.target.value)} /> : <span style={{ fontSize: 11, color: T.inkLight }}>{p.preset || "—"}</span>}</td>
                    <td><input className="inp-inline" type="number" min="0.01" step="0.01" placeholder="0" value={p.amount} onChange={e => setPenalty(p.id, "amount", e.target.value)} /></td>
                    <td><button className="btn-icon" onClick={() => removePenalty(p.id)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "6px 10px 10px", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn-add" style={{ width: "auto", marginTop: 0 }} onClick={() => addPenalty("")}>+ Add Penalty Line</button>
              {missing > 0 && !hasMissingPenalty && <button className="btn-add" style={{ width: "auto", marginTop: 0 }} onClick={() => addPenalty("missing cylinder")}>+ Missing Cylinder</button>}
            </div>
          </div>
        </div>

        <div className="field"><label>Remarks (optional — a note only, never affects the amount)</label><input className="inp" type="text" value={f.remarks} onChange={e => set("remarks", e.target.value)} placeholder="Not required" /></div>

        {/* Full payout breakdown — shown BEFORE confirm, nothing collapsed */}
        <div className="coh-bar" style={{ flexDirection: "column", alignItems: "stretch", gap: 4, padding: "12px 16px", marginBottom: 12 }}>
          <div className="coh-label">Payout breakdown — this is what leaves the till</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Refund amount entered</span><span>{inr(refund)}</span></div>
          {penalties.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#fca5a5" }}><span>− {penaltyItem(p) || "(unnamed penalty)"}</span><span>−{inr(p.amount)}</span></div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.inkLight }}><span>Stock: +{returned || 0} empty {productLabel(f.productId, products)}{missing > 0 ? ` (${missing} missing — not added)` : ""}</span><span></span></div>
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.2)", paddingTop: 6, marginTop: 2 }}>
            <span style={{ fontWeight: 700 }}>NET CASH PAID OUT</span>
            <span className={`coh-amount${netPaid < 0 ? " negative" : ""}`} style={{ fontSize: 24 }}>{inr(netPaid)}</span>
          </div>
        </div>
        <button className="btn-primary" style={{ width: "100%", background: T.danger }} onClick={submit} disabled={busy || !canConfirm}>{busy ? "Saving…" : `✅ Confirm — Pay ${inr(netPaid)} & Receive Empties`}</button>
      </div>
    </div>
  );
}

/* ══════════════ Daily register (all roles) ══════════════ */
function EventsTable({ events, isAdmin, onVoid }) {
  return (
    <div className="card">
      <div style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Event</th><th>Product</th><th style={{ textAlign: "right" }}>Qty</th><th>Stock</th><th>Money</th><th style={{ textAlign: "right" }}>Cash Effect</th><th>Remarks</th><th>By</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={isAdmin ? 10 : 9} style={{ padding: 20, color: T.inkLight }}>No connection events in this range.</td></tr>}
            {events.map(e => {
              const cashEffect = (e.eventType === "additional" || e.eventType === "new") && e.mode === "cash" ? e.amount : e.eventType === "surrender" ? -e.netPaid : 0;
              return (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(e.date)}</td>
                  <td><span className={`badge ${TYPE_BADGE[e.eventType]}`}>{TYPE_LABEL[e.eventType]}</span></td>
                  <td style={{ fontWeight: 600 }}>{productLabel(e.productId)}{e.connectionType ? <div style={{ fontSize: 10, color: T.inkLight }}>{e.connectionType}</div> : null}</td>
                  <td style={{ textAlign: "right" }}>{e.qty}</td>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {e.cylindersOut > 0 && <span style={{ color: T.danger }}>−{e.cylindersOut} filled</span>}
                    {e.cylindersIn > 0 && <span style={{ color: T.success }}>+{e.cylindersIn} empty</span>}
                    {e.cylindersMissing > 0 && <span style={{ color: T.warn }}> · {e.cylindersMissing} missing</span>}
                  </td>
                  <td style={{ fontSize: 12, textAlign: "left" }}>
                    {e.eventType === "additional" && <><span className={`badge ${e.mode === "cash" ? "badge-success" : "badge-blue"}`}>{e.mode}</span> {inr(e.amount)}</>}
                    {e.eventType === "surrender" && <>refund {inr(e.amount)}{e.penaltyDeducted > 0 && <span style={{ color: T.warn }}> − {inr(e.penaltyDeducted)} <span title={e.penalties.map(p => `${p.item}: ${inr(p.amount)}`).join("\n")} style={{ fontSize: 10 }}>({e.penalties.map(p => p.item).join(", ")})</span></span>}</>}
                    {e.eventType === "new" && (
                      num(e.amount) > 0 ? (
                        <><span className={`badge ${e.mode === "cash" ? "badge-success" : "badge-blue"}`}>{e.mode}</span> {inr(e.amount)}</>
                      ) : (
                        <span style={{ color: T.inkLight }}>— (BPCL deposit)</span>
                      )
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: cashEffect > 0 ? T.success : cashEffect < 0 ? T.danger : T.inkLight }}>
                    {cashEffect === 0 ? (
                      (e.eventType === "additional" || e.eventType === "new") && e.mode === "online" && num(e.amount) > 0 ? (
                        <span style={{ color: T.blue, fontSize: 11 }}>{inr(e.amount)} online</span>
                      ) : "—"
                    ) : (
                      (cashEffect > 0 ? "+" : "−") + inr(Math.abs(cashEffect))
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: T.inkLight, maxWidth: 160 }}>{e.remarks || "—"}</td>
                  <td style={{ fontSize: 11 }}>{e.recordedBy}</td>
                  {isAdmin && <td><button className="btn-icon" title="Void this entry (audited)" onClick={() => onVoid(e)}>×</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RangeBar({ from, to, setFrom, setTo, onExport, count, extra }) {
  return (
    <div className="period-row" style={{ alignItems: "center" }}>
      <input className="inp" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={{ width: 160 }} />
      <span style={{ color: T.inkLight }}>to</span>
      <input className="inp" type="date" value={to} min={from} max={todayStr()} onChange={e => setTo(e.target.value)} style={{ width: 160 }} />
      <button className="btn-ghost" onClick={() => { setFrom(todayStr()); setTo(todayStr()); }}>Today</button>
      <button className="btn-ghost" onClick={() => { setFrom(monthStart()); setTo(todayStr()); }}>This Month</button>
      {extra}
      {onExport && <button className="btn-ghost" onClick={onExport} disabled={!count}>⬇ Export CSV</button>}
      {count !== undefined && <span style={{ fontSize: 11, color: T.inkLight }}>{count} rows</span>}
    </div>
  );
}

function Register({ isAdmin, refreshKey, onChanged }) {
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [type, setType] = useState("");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    let alive = true;
    api.getConnectionEvents({ from, to, type }).then(d => alive && setData(d)).catch(e => alive && setErr(e.message));
    return () => { alive = false; };
  }, [from, to, type]);
  useEffect(load, [load, refreshKey]);
  const voidEvent = async (e) => {
    const r = await Swal.fire({
      title: "Void this entry?",
      html: `<strong>${TYPE_LABEL[e.eventType]}</strong> · ${productLabel(e.productId)} × ${e.qty} on ${fmtDate(e.date)}<br/>Its stock and cash effects will be removed for that day. The action is recorded in the audit trail.`,
      icon: "warning", input: "text", inputPlaceholder: "Reason (optional)", showCancelButton: true, confirmButtonText: "Void entry", confirmButtonColor: "#ef4444",
    });
    if (!r.isConfirmed) return;
    try { await api.deleteConnectionEvent(e.id, r.value || ""); load(); onChanged && onChanged(); } catch (err2) { swalErr("Not voided", err2); }
  };
  const exportCsv = () => downloadCsv(`connection-events_${from}_${to}.csv`,
    ["Date", "Event", "Product", "Type", "Qty", "Filled Out", "Empty In", "Missing", "Amount", "Mode", "Penalty", "Net Paid", "Penalty Items", "Remarks", "By"],
    data.events.map(e => [e.date, TYPE_LABEL[e.eventType], productLabel(e.productId), e.connectionType || "", e.qty, e.cylindersOut, e.cylindersIn, e.cylindersMissing, e.amount, e.mode || "", e.penaltyDeducted, e.netPaid, e.penalties.map(p => `${p.item}=${p.amount}`).join("; "), e.remarks, e.recordedBy]));
  const tt = data?.totals;
  return (
    <div>
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={data && exportCsv} count={data?.events.length}
        extra={<select className="inp" value={type} onChange={e => setType(e.target.value)} style={{ width: 170 }}><option value="">All events</option><option value="new">New connections</option><option value="additional">Additional bottles</option><option value="surrender">Surrenders</option></select>} />
      {!isAdmin && <div style={{ fontSize: 11, color: T.inkLight, marginBottom: 10 }}>History is read-only; only today can be recorded. Ask an administrator to void a wrong entry.</div>}
      {err && <div className="login-err">⚠️ {err}</div>}
      {tt && (
        <div className="stat-row">
          <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{ color: T.accent }}>{tt.newConnections}</div><div className="stat-lbl">New Connections</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{ color: T.blue }}>{tt.additionalBottles}</div><div className="stat-lbl">Additional Bottles</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.inkLight }}><div className="stat-val">{tt.surrenders}</div><div className="stat-lbl">Surrenders</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{tt.cylindersOut > 0 ? `−${tt.cylindersOut}` : 0}</div><div className="stat-lbl">Filled Issued</div><div className="stat-delta" style={{ color: T.success }}>+{tt.cylindersIn} empty back{tt.cylindersMissing > 0 ? ` · ${tt.cylindersMissing} missing` : ""}</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{inr(tt.collectedCash)}</div><div className="stat-lbl">Collected · Cash</div>{tt.collectedOnline > 0 && <div className="stat-delta" style={{ color: T.blue }}>+ {inr(tt.collectedOnline)} online</div>}</div>
          <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(tt.netPaid)}</div><div className="stat-lbl">Refunds Paid (net)</div>{tt.penaltyDeducted > 0 && <div className="stat-delta" style={{ color: T.warn }}>{inr(tt.penaltyDeducted)} penalties</div>}</div>
        </div>
      )}
      <EventsTable events={data?.events || []} isAdmin={isAdmin} onVoid={voidEvent} />
    </div>
  );
}

/* ══════════════ Admin reports ══════════════ */
function SummaryReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { let alive = true; api.getConnectionsSummary(from, to).then(x => alive && setD(x)).catch(e => alive && setErr(e.message)); return () => { alive = false; }; }, [from, to]);
  const exportCsv = () => downloadCsv(`connections-summary_${from}_${to}.csv`,
    ["Product", "New Conn", "Single", "Double", "Cyl Issued (new)", "Add Bottles", "Collected Cash", "Collected Online", "Surrenders", "Cyl Returned", "Cyl Missing", "Refund Gross", "Penalties", "Net Paid", "Active Conn (all time)", "Issued (all time)", "Returned (all time)", "Missing (all time)", "With Customers"],
    d.perProduct.map(p => [productLabel(p.productId), p.period.newConnections, p.period.newSingle, p.period.newDouble, p.period.newCylindersIssued, p.period.additionalBottles, p.period.additionalCash, p.period.additionalOnline, p.period.surrenders, p.period.cylindersReturned, p.period.cylindersMissing, p.period.refundAmount, p.period.penaltyDeducted, p.period.netPaid, p.market.activeConnections, p.market.issued, p.market.returned, p.market.missing, p.market.cylindersWithCustomers]));
  if (err) return <div className="login-err">⚠️ {err}</div>;
  return (
    <div>
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={d && exportCsv} count={d?.perProduct.length} />
      {!d ? <div style={{ padding: 20, color: T.inkLight }}>Loading…</div> : (
        <>
          <div className="stat-row">
            <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{ color: T.accent }}>{d.period.newConnections}</div><div className="stat-lbl">New Connections</div></div>
            <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{ color: T.blue }}>{d.period.additionalBottles}</div><div className="stat-lbl">Additional Bottles</div><div className="stat-delta"><span style={{ color: T.success }}>{inr(d.period.additionalCash)} cash</span> · <span style={{ color: T.blue }}>{inr(d.period.additionalOnline)} online</span></div></div>
            <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{d.period.surrenders}</div><div className="stat-lbl">Surrenders</div><div className="stat-delta" style={{ color: T.danger }}>{inr(d.period.netPaid)} net paid · <span style={{ color: T.warn }}>{inr(d.period.penaltyDeducted)} penalties</span></div></div>
            <div className="stat-card" style={{ "--kpi-color": d.period.netCashEffect >= 0 ? T.success : T.danger }}><div className="stat-val" style={{ color: d.period.netCashEffect >= 0 ? T.success : T.danger }}>{d.period.netCashEffect >= 0 ? "+" : "−"}{inr(Math.abs(d.period.netCashEffect))}</div><div className="stat-lbl">Net Cash Effect (period)</div><div className="stat-delta" style={{ color: T.inkLight }}>cash collected − net refunds</div></div>
            <div className="stat-card" style={{ "--kpi-color": d.period.netConnectionChange >= 0 ? T.success : T.danger }}><div className="stat-val" style={{ color: d.period.netConnectionChange >= 0 ? T.success : T.danger }}>{d.period.netConnectionChange >= 0 ? "+" : ""}{d.period.netConnectionChange}</div><div className="stat-lbl">Net Change · Connections</div><div className="stat-delta" style={{ color: T.inkLight }}>{d.period.netCylinderChange >= 0 ? "+" : ""}{d.period.netCylinderChange} cylinders in market</div></div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-head-title">📊 Connections Report · {fmtDate(from)} → {fmtDate(to)}</span></div>
            <div style={{ overflowX: "auto" }}><table className="tbl">
              <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>New Conn.</th><th style={{ textAlign: "right" }}>Single / Double</th><th style={{ textAlign: "right" }}>Cyl Issued (new)</th><th style={{ textAlign: "right" }}>Add. Bottles</th><th style={{ textAlign: "right" }}>Collected Cash</th><th style={{ textAlign: "right" }}>Collected Online</th><th style={{ textAlign: "right" }}>Surrenders</th><th style={{ textAlign: "right" }}>Cyl Returned</th><th style={{ textAlign: "right" }}>Missing</th><th style={{ textAlign: "right" }}>Refund Gross</th><th style={{ textAlign: "right" }}>Penalties</th><th style={{ textAlign: "right" }}>Net Paid</th></tr></thead>
              <tbody>
                {d.perProduct.map(p => <tr key={p.productId}><td style={{ fontWeight: 600 }}>{productLabel(p.productId)}</td><td style={{ textAlign: "right" }}>{p.period.newConnections}</td><td style={{ textAlign: "right", fontSize: 11 }}>{p.period.newSingle} / {p.period.newDouble}</td><td style={{ textAlign: "right" }}>{p.period.newCylindersIssued}</td><td style={{ textAlign: "right" }}>{p.period.additionalBottles}</td><td style={{ textAlign: "right", color: T.success }}>{inr(p.period.additionalCash)}</td><td style={{ textAlign: "right", color: T.blue }}>{inr(p.period.additionalOnline)}</td><td style={{ textAlign: "right" }}>{p.period.surrenders}</td><td style={{ textAlign: "right" }}>{p.period.cylindersReturned}</td><td style={{ textAlign: "right", color: T.warn }}>{p.period.cylindersMissing}</td><td style={{ textAlign: "right" }}>{inr(p.period.refundAmount)}</td><td style={{ textAlign: "right", color: T.warn }}>{inr(p.period.penaltyDeducted)}</td><td style={{ textAlign: "right", color: T.danger, fontWeight: 700 }}>{inr(p.period.netPaid)}</td></tr>)}
                <tr className="tbl-total"><td>Total</td><td style={{ textAlign: "right" }}>{d.period.newConnections}</td><td></td><td style={{ textAlign: "right" }}>{d.perProduct.reduce((s, p) => s + p.period.newCylindersIssued, 0)}</td><td style={{ textAlign: "right" }}>{d.period.additionalBottles}</td><td style={{ textAlign: "right", color: T.success }}>{inr(d.period.additionalCash)}</td><td style={{ textAlign: "right", color: T.blue }}>{inr(d.period.additionalOnline)}</td><td style={{ textAlign: "right" }}>{d.period.surrenders}</td><td style={{ textAlign: "right" }}>{d.perProduct.reduce((s, p) => s + p.period.cylindersReturned, 0)}</td><td style={{ textAlign: "right", color: T.warn }}>{d.perProduct.reduce((s, p) => s + p.period.cylindersMissing, 0)}</td><td style={{ textAlign: "right" }}>{inr(d.period.refundAmount)}</td><td style={{ textAlign: "right", color: T.warn }}>{inr(d.period.penaltyDeducted)}</td><td style={{ textAlign: "right", color: T.danger }}>{inr(d.period.netPaid)}</td></tr>
              </tbody></table></div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-head-title">🛢️ Cylinders-in-Market Reconciliation (all time, as of today)</span></div>
            <div style={{ overflowX: "auto" }}><table className="tbl">
              <thead><tr><th>Product</th><th style={{ textAlign: "right" }} title="new connections − surrenders">Active Connections</th><th style={{ textAlign: "right" }}>Issued</th><th style={{ textAlign: "right" }}>Returned</th><th style={{ textAlign: "right" }}>Missing (penalised)</th><th style={{ textAlign: "right" }} title="issued − returned − missing">Cylinders with Customers</th><th style={{ textAlign: "right" }}>Latest Closing Stock</th><th style={{ textAlign: "right" }}>Latest Godown Filled / Empty</th></tr></thead>
              <tbody>
                {d.perProduct.map(p => (
                  <tr key={p.productId}>
                    <td style={{ fontWeight: 600 }}>{productLabel(p.productId)}</td>
                    <td style={{ textAlign: "right" }}>{p.market.activeConnections}</td>
                    <td style={{ textAlign: "right", color: T.danger }}>{p.market.issued}</td>
                    <td style={{ textAlign: "right", color: T.success }}>{p.market.returned}</td>
                    <td style={{ textAlign: "right", color: T.warn }}>{p.market.missing}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: T.blue, fontSize: 15 }}>{p.market.cylindersWithCustomers}</td>
                    <td style={{ textAlign: "right" }}>{p.stock.closingStock ?? "—"} <span style={{ fontSize: 10, color: T.inkLight }}>{p.stock.asOf ? fmtDate(p.stock.asOf) : ""}</span></td>
                    <td style={{ textAlign: "right" }}>{p.stock.godownFilled ?? "—"} / {p.stock.godownEmpty ?? "—"} <span style={{ fontSize: 10, color: T.inkLight }}>{p.stock.godownAsOf ? fmtDate(p.stock.godownAsOf) : ""}</span></td>
                  </tr>
                ))}
                <tr className="tbl-total"><td>Total</td><td style={{ textAlign: "right" }}>{d.market.activeConnections}</td><td style={{ textAlign: "right" }}>{d.market.issued}</td><td style={{ textAlign: "right" }}>{d.market.returned}</td><td style={{ textAlign: "right" }}>{d.market.missing}</td><td style={{ textAlign: "right", color: T.blue }}>{d.market.cylindersWithCustomers}</td><td></td><td></td></tr>
              </tbody></table></div>
            <div style={{ padding: "10px 16px", fontSize: 11, color: T.inkLight, fontStyle: "italic", borderTop: `1px solid ${T.border}` }}>
              Counts start from the first event recorded in this system — connections issued before that are not included. "Cylinders with Customers" = filled issued − empties returned − cylinders penalised as missing (those never came back and are not in stock). Closing / godown figures are the last saved Day Entry, for cross-checking.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MonthlyReport() {
  const [productId, setProductId] = useState("");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { let alive = true; api.getConnectionsMonthly({ productId }).then(x => alive && setD(x)).catch(e => alive && setErr(e.message)); return () => { alive = false; }; }, [productId]);
  const exportCsv = () => downloadCsv(`connections-monthly${productId ? "_" + productId : ""}.csv`,
    ["Month", "New Conn", "Cyl Issued (new)", "Add Bottles", "Collected Cash", "Collected Online", "Surrenders", "Cyl Returned", "Missing", "Refund Gross", "Penalties", "Net Paid", "Net Cash Effect", "Net Conn Change"],
    d.months.map(m => [m.month, m.newConnections, m.newCylindersIssued, m.additionalBottles, m.additionalCash, m.additionalOnline, m.surrenders, m.cylindersReturned, m.cylindersMissing, m.refundAmount, m.penaltyDeducted, m.netPaid, m.netCashEffect, m.netConnectionChange]));
  return (
    <div>
      <div className="period-row" style={{ alignItems: "center" }}>
        <select className="inp" value={productId} onChange={e => setProductId(e.target.value)} style={{ width: 200 }}><option value="">All products</option>{PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <button className="btn-ghost" onClick={exportCsv} disabled={!d || !d.months.length}>⬇ Export CSV</button>
      </div>
      {err && <div className="login-err">⚠️ {err}</div>}
      <div className="card">
        <div className="card-head"><span className="card-head-title">📆 Month-wise Trend {productId ? `· ${productLabel(productId)}` : "· all products"}</span></div>
        <div style={{ overflowX: "auto" }}><table className="tbl">
          <thead><tr><th>Month</th><th style={{ textAlign: "right" }}>New Conn.</th><th style={{ textAlign: "right" }}>Cyl Issued</th><th style={{ textAlign: "right" }}>Add. Bottles</th><th style={{ textAlign: "right" }}>Collected Cash</th><th style={{ textAlign: "right" }}>Collected Online</th><th style={{ textAlign: "right" }}>Surrenders</th><th style={{ textAlign: "right" }}>Cyl Returned</th><th style={{ textAlign: "right" }}>Missing</th><th style={{ textAlign: "right" }}>Refund Gross</th><th style={{ textAlign: "right" }}>Penalties</th><th style={{ textAlign: "right" }}>Net Paid</th><th style={{ textAlign: "right" }}>Net Cash Effect</th><th style={{ textAlign: "right" }}>Net Conn.</th></tr></thead>
          <tbody>
            {!d && <tr><td colSpan={14} style={{ padding: 20, color: T.inkLight }}>Loading…</td></tr>}
            {d?.months.length === 0 && <tr><td colSpan={14} style={{ padding: 20, color: T.inkLight }}>No events recorded yet.</td></tr>}
            {d?.months.map(m => <tr key={m.month}><td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{fmtMonth(m.month + "-01")}</td><td style={{ textAlign: "right" }}>{m.newConnections}</td><td style={{ textAlign: "right" }}>{m.newCylindersIssued}</td><td style={{ textAlign: "right" }}>{m.additionalBottles}</td><td style={{ textAlign: "right", color: T.success }}>{inr(m.additionalCash)}</td><td style={{ textAlign: "right", color: T.blue }}>{inr(m.additionalOnline)}</td><td style={{ textAlign: "right" }}>{m.surrenders}</td><td style={{ textAlign: "right" }}>{m.cylindersReturned}</td><td style={{ textAlign: "right", color: T.warn }}>{m.cylindersMissing}</td><td style={{ textAlign: "right" }}>{inr(m.refundAmount)}</td><td style={{ textAlign: "right", color: T.warn }}>{inr(m.penaltyDeducted)}</td><td style={{ textAlign: "right", color: T.danger }}>{inr(m.netPaid)}</td><td style={{ textAlign: "right", fontWeight: 700, color: m.netCashEffect >= 0 ? T.success : T.danger }}>{m.netCashEffect >= 0 ? "+" : "−"}{inr(Math.abs(m.netCashEffect))}</td><td style={{ textAlign: "right", color: m.netConnectionChange >= 0 ? T.success : T.danger }}>{m.netConnectionChange >= 0 ? "+" : ""}{m.netConnectionChange}</td></tr>)}
          </tbody></table></div>
      </div>
    </div>
  );
}

function PaymentsReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [mode, setMode] = useState("");
  const [productId, setProductId] = useState("");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { let alive = true; api.getConnectionPayments({ from, to, mode, productId }).then(x => alive && setD(x)).catch(e => alive && setErr(e.message)); return () => { alive = false; }; }, [from, to, mode, productId]);
  const exportCsv = () => downloadCsv(`connection-payments_${from}_${to}.csv`,
    ["Date", "Product", "Bottles", "Mode", "Amount", "Remarks", "Recorded By"],
    d.rows.map(r => [r.date, productLabel(r.productId), r.qty, r.mode, r.amount, r.remarks, r.recordedBy]));
  return (
    <div>
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={d && exportCsv} count={d?.rows.length}
        extra={<select className="inp" value={productId} onChange={e => setProductId(e.target.value)} style={{ width: 150 }}><option value="">All products</option>{PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.short}</option>)}</select>} />
      <div className="period-row">
        {[["", "All modes"], ["cash", "💵 Cash only"], ["online", "🏦 Online only"]].map(([v, l]) => <button key={v} className="btn-ghost" style={{ background: mode === v ? T.accent : "transparent", color: mode === v ? "#fff" : T.inkMid, borderColor: mode === v ? T.accent : T.border }} onClick={() => setMode(v)}>{l}</button>)}
      </div>
      {err && <div className="login-err">⚠️ {err}</div>}
      {d && (
        <div className="stat-row">
          <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{inr(d.totals.cash)}</div><div className="stat-lbl">Cash (in cash on hand)</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.blue }}><div className="stat-val" style={{ color: T.blue }}>{inr(d.totals.online)}</div><div className="stat-lbl">Online (not in cash)</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.accent }}><div className="stat-val" style={{ color: T.accent }}>{inr(d.totals.total)}</div><div className="stat-lbl">Total · {d.totals.count} payments · {d.totals.bottles} bottles</div></div>
        </div>
      )}
      <div className="card">
        <div className="card-head"><span className="card-head-title">💵 Connection Payments Collected</span></div>
        <div style={{ overflowX: "auto" }}><table className="tbl">
          <thead><tr><th>Date</th><th>Product</th><th style={{ textAlign: "right" }}>Bottles</th><th>Mode</th><th style={{ textAlign: "right" }}>Amount</th><th>Remarks</th><th>By</th></tr></thead>
          <tbody>
            {(!d || d.rows.length === 0) && <tr><td colSpan={7} style={{ padding: 20, color: T.inkLight }}>{d ? "No payments in this range." : "Loading…"}</td></tr>}
            {d?.rows.map(r => <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td><td style={{ fontWeight: 600 }}>{productLabel(r.productId)}</td><td style={{ textAlign: "right" }}>{r.qty}</td><td><span className={`badge ${r.mode === "cash" ? "badge-success" : "badge-blue"}`}>{r.mode}</span></td><td style={{ textAlign: "right", fontWeight: 700, color: r.mode === "cash" ? T.success : T.blue }}>{inr(r.amount)}</td><td style={{ fontSize: 11, color: T.inkLight }}>{r.remarks || "—"}</td><td style={{ fontSize: 11 }}>{r.recordedBy}</td></tr>)}
          </tbody></table></div>
      </div>
    </div>
  );
}

function RefundsReport() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [productId, setProductId] = useState("");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  useEffect(() => { let alive = true; api.getConnectionRefunds({ from, to, productId }).then(x => alive && setD(x)).catch(e => alive && setErr(e.message)); return () => { alive = false; }; }, [from, to, productId]);
  const exportCsv = () => downloadCsv(`connection-refunds_${from}_${to}.csv`,
    ["Date", "Product", "Connections", "Refund Amount", "Penalty Deducted", "Net Paid", "Cylinders Returned", "Cylinders Missing", "Penalty Items", "Remarks", "Recorded By"],
    d.rows.map(r => [r.date, productLabel(r.productId), r.qty, r.amount, r.penaltyDeducted, r.netPaid, r.cylindersIn, r.cylindersMissing, r.penalties.map(p => `${p.item}=${p.amount}`).join("; "), r.remarks, r.recordedBy]));
  return (
    <div>
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} onExport={d && exportCsv} count={d?.rows.length}
        extra={<select className="inp" value={productId} onChange={e => setProductId(e.target.value)} style={{ width: 150 }}><option value="">All products</option>{PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.short}</option>)}</select>} />
      {err && <div className="login-err">⚠️ {err}</div>}
      {d && (
        <div className="stat-row">
          <div className="stat-card" style={{ "--kpi-color": T.inkLight }}><div className="stat-val">{inr(d.totals.refundAmount)}</div><div className="stat-lbl">Gross Refunds</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.warn }}><div className="stat-val" style={{ color: T.warn }}>{inr(d.totals.penaltyDeducted)}</div><div className="stat-lbl">Penalties Deducted</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.danger }}><div className="stat-val" style={{ color: T.danger }}>{inr(d.totals.netPaid)}</div><div className="stat-lbl">Net Paid Out · {d.totals.count} surrenders</div></div>
          <div className="stat-card" style={{ "--kpi-color": T.success }}><div className="stat-val" style={{ color: T.success }}>{d.totals.cylindersReturned}</div><div className="stat-lbl">Empty Cylinders Received</div>{d.totals.cylindersMissing > 0 && <div className="stat-delta" style={{ color: T.warn }}>{d.totals.cylindersMissing} missing (penalised)</div>}</div>
        </div>
      )}
      <div className="g2">
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-head"><span className="card-head-title">↩️ Connection Refunds Paid</span><span style={{ fontSize: 11, color: T.inkLight }}>click a row to see penalty items</span></div>
          <div style={{ overflowX: "auto" }}><table className="tbl">
            <thead><tr><th>Date</th><th>Product</th><th style={{ textAlign: "right" }}>Conn.</th><th style={{ textAlign: "right" }}>Refund</th><th style={{ textAlign: "right" }}>Penalty</th><th style={{ textAlign: "right" }}>Net Paid</th><th>Cyl Ret / Missing</th><th>Remarks</th><th>By</th></tr></thead>
            <tbody>
              {(!d || d.rows.length === 0) && <tr><td colSpan={9} style={{ padding: 20, color: T.inkLight }}>{d ? "No refunds in this range." : "Loading…"}</td></tr>}
              {d?.rows.map(r => (
                <React.Fragment key={r.id}>
                  <tr style={{ cursor: r.penalties.length ? "pointer" : "default", background: open === r.id ? "#f8fbff" : "transparent" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td><td style={{ fontWeight: 600 }}>{productLabel(r.productId)}</td><td style={{ textAlign: "right" }}>{r.qty}</td>
                    <td style={{ textAlign: "right" }}>{inr(r.amount)}</td><td style={{ textAlign: "right", color: T.warn }}>{r.penaltyDeducted > 0 ? `−${inr(r.penaltyDeducted)} ${open === r.id ? "▲" : "▼"}` : "—"}</td><td style={{ textAlign: "right", fontWeight: 700, color: T.danger }}>{inr(r.netPaid)}</td>
                    <td>{r.cylindersIn}{r.cylindersMissing > 0 ? <span style={{ color: T.warn }}> / {r.cylindersMissing} missing</span> : ""}</td><td style={{ fontSize: 11, color: T.inkLight }}>{r.remarks || "—"}</td><td style={{ fontSize: 11 }}>{r.recordedBy}</td>
                  </tr>
                  {open === r.id && r.penalties.map((p, i) => <tr key={i} style={{ background: "#fffbeb", fontSize: 12 }}><td></td><td colSpan={3} style={{ textAlign: "left", paddingLeft: 28, color: T.inkMid }}>⚖️ {p.item}</td><td style={{ textAlign: "right", color: T.warn }}>−{inr(p.amount)}</td><td colSpan={4}></td></tr>)}
                </React.Fragment>
              ))}
            </tbody></table></div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-head-title">⚖️ Penalty Breakdown by Item</span></div>
          <table className="tbl">
            <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Times</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {(!d || d.penaltyBreakdown.length === 0) && <tr><td colSpan={3} style={{ padding: 14, color: T.inkLight }}>No penalties in this range.</td></tr>}
              {d?.penaltyBreakdown.map(b => <tr key={b.item}><td style={{ textAlign: "left", fontWeight: 600 }}>{b.item}</td><td style={{ textAlign: "right" }}>{b.count}</td><td style={{ textAlign: "right", color: T.warn, fontWeight: 700 }}>{inr(b.amount)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AuditTrail() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => { let alive = true; api.getAuditLog({ limit: 300 }).then(x => alive && setRows(x)).catch(e => alive && setErr(e.message)); return () => { alive = false; }; }, []);
  return (
    <div className="card">
      <div className="card-head"><span className="card-head-title">🧾 Audit Trail (latest 300, append-only)</span></div>
      {err && <div className="login-err" style={{ margin: 12 }}>⚠️ {err}</div>}
      <div style={{ overflowX: "auto" }}><table className="tbl">
        <thead><tr><th>When</th><th>Who</th><th>Event</th><th>Entity</th><th>Business Date</th><th>Details</th></tr></thead>
        <tbody>
          {!rows && <tr><td colSpan={6} style={{ padding: 20, color: T.inkLight }}>Loading…</td></tr>}
          {rows?.length === 0 && <tr><td colSpan={6} style={{ padding: 20, color: T.inkLight }}>Nothing recorded yet.</td></tr>}
          {rows?.map(r => <tr key={r.id}><td style={{ whiteSpace: "nowrap", fontSize: 11 }}>{r.createdAt}</td><td style={{ fontWeight: 600 }}>{r.actor} <span className={`badge ${r.actorRole === "admin" ? "badge-danger" : "badge-success"}`}>{r.actorRole}</span></td><td><span className="badge badge-ink">{r.eventType}</span></td><td style={{ fontSize: 11 }}>{r.entityType} · {r.entityId}</td><td style={{ fontSize: 11 }}>{r.eventDate ? fmtDate(r.eventDate) : "—"}</td><td style={{ fontSize: 10, color: T.inkLight, textAlign: "left", maxWidth: 360, wordBreak: "break-all" }}>{r.details ? JSON.stringify(r.details) : "—"}</td></tr>)}
        </tbody></table></div>
    </div>
  );
}

/* ══════════════ Tab shell ══════════════ */
export default function ConnectionsTab({ isAdmin, onChanged }) {
  const [sub, setSub] = useState("register");
  const [refreshKey, setRefreshKey] = useState(0);
  const changed = () => { setRefreshKey(k => k + 1); onChanged && onChanged(); };
  const SUBS = [
    ["register", isAdmin ? "📅 Daily Register" : "📅 Today's Register"],
    ...(isAdmin ? [["summary", "📊 Summary & Cylinders in Market"], ["monthly", "📆 Monthly Trend"], ["payments", "💵 Payments Collected"], ["refunds", "↩️ Refunds Paid"], ["audit", "🧾 Audit Trail"]] : []),
  ];
  return (
    <div className="fade-in">
      <div className="alert alert-info" style={{ background: T.blueBg, color: T.blue, border: "1px solid #bfdbfe" }}>
        No consumer details are entered here — BPCL's system holds the customer master and the deposit record. This screen displays connection registers, cylinder reconciliation, and reports. New connections, additional bottles, and surrenders are recorded directly in Daily Entry.
      </div>
      <div className="prod-tabs">
        {SUBS.map(([id, label]) => <button key={id} className={`prod-tab${sub === id ? " active" : ""}`} onClick={() => setSub(id)}>{label}</button>)}
      </div>
      {sub === "register" && <Register isAdmin={isAdmin} refreshKey={refreshKey} onChanged={onChanged} />}
      {isAdmin && sub === "summary" && <SummaryReport />}
      {isAdmin && sub === "monthly" && <MonthlyReport />}
      {isAdmin && sub === "payments" && <PaymentsReport />}
      {isAdmin && sub === "refunds" && <RefundsReport />}
      {isAdmin && sub === "audit" && <AuditTrail />}
    </div>
  );
}
