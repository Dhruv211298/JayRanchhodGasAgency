import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { api } from "../api";
import { T } from "../styles";
import { inr, num } from "../constants";

const blankProductForm = () => ({
  id: "",
  label: "",
  shortName: "",
  sku: "",
  fallbackRate: "",
  fallbackSbc: "0",
  fallbackDbc: "0",
  sortOrder: "10",
  category: "cylinder"
});

export default function AdminProductMaster({ onProductsChanged }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blankProductForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("active");

  const fetchProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => alive && fetchProducts());
    return () => { alive = false; };
  }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(blankProductForm());
    setErr("");
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      id: p.id,
      label: p.label || "",
      shortName: p.shortName || p.short || "",
      sku: p.sku || "",
      fallbackRate: p.fallbackRate ?? "",
      fallbackSbc: p.fallbackSbc ?? "0",
      fallbackDbc: p.fallbackDbc ?? "0",
      sortOrder: p.sortOrder ?? "10",
      category: p.category || "cylinder"
    });
    setErr("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditId(null);
  };

  const handleSave = async () => {
    const cleanId = form.id.trim().toLowerCase();
    if (!cleanId) { setErr("Product ID/Code is required."); return; }
    if (!/^[a-z0-9_-]{2,50}$/.test(cleanId)) {
      setErr("Product ID must be 2-50 characters (letters, numbers, hyphens or underscores only).");
      return;
    }
    if (!form.label.trim()) { setErr("Product label is required."); return; }
    if (!form.shortName.trim()) { setErr("Short display name is required."); return; }
    if (num(form.fallbackRate) < 0) { setErr("Refill rate cannot be negative."); return; }

    setSaving(true);
    setErr("");
    try {
      if (editId) {
        const res = await api.updateProduct(editId, {
          label: form.label.trim(),
          shortName: form.shortName.trim(),
          sku: form.sku.trim(),
          fallbackRate: num(form.fallbackRate),
          fallbackSbc: num(form.fallbackSbc),
          fallbackDbc: num(form.fallbackDbc),
          sortOrder: parseInt(form.sortOrder, 10) || 0,
          isActive: products.find(p => p.id === editId)?.isActive ?? 1
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error || "Update failed.");
        }
        Swal.fire({ title: "Updated!", text: `Product "${form.label}" updated.`, icon: "success", timer: 1500, timerProgressBar: true, confirmButtonColor: "#0077ff" });
      } else {
        const res = await api.addProduct({
          id: cleanId,
          label: form.label.trim(),
          shortName: form.shortName.trim(),
          sku: form.sku.trim(),
          fallbackRate: num(form.fallbackRate),
          fallbackSbc: num(form.fallbackSbc),
          fallbackDbc: num(form.fallbackDbc),
          sortOrder: parseInt(form.sortOrder, 10) || 0,
          category: form.category || "cylinder"
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error || "Add failed.");
        }
        Swal.fire({ title: "Created!", text: `Product "${form.label}" added to catalogue.`, icon: "success", timer: 1500, timerProgressBar: true, confirmButtonColor: "#0077ff" });
      }
      await fetchProducts();
      if (onProductsChanged) onProductsChanged();
      closeModal();
    } catch (e) {
      setErr(e.message || "Operation failed.");
    }
    setSaving(false);
  };

  const handleToggle = async (id) => {
    try {
      const res = await api.toggleProduct(id);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Toggle failed.");
      }
      await fetchProducts();
      if (onProductsChanged) onProductsChanged();
    } catch (e) {
      Swal.fire({ title: "Toggle Failed", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
  };

  const handleDelete = async (p) => {
    const r = await Swal.fire({
      title: "Delete product?",
      html: `Permanently delete <strong>${p.label}</strong> (${p.id})?<br/><span style="font-size:12px;color:#888;">If this product has historical transactions, it cannot be deleted and must be deactivated instead.</span>`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#ef4444"
    });
    if (!r.isConfirmed) return;

    try {
      const res = await api.deleteProduct(p.id);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Delete failed.");
      }
      Swal.fire({ title: "Deleted", text: `Product ${p.id} removed.`, icon: "success", timer: 1500, timerProgressBar: true, confirmButtonColor: "#0077ff" });
      await fetchProducts();
      if (onProductsChanged) onProductsChanged();
    } catch (e) {
      Swal.fire({ title: "Cannot Delete", text: e.message, icon: "error", confirmButtonColor: "#ef4444" });
    }
  };

  const displayed = products.filter(p => filter === "all" ? true : p.isActive === 1);
  const activeCount = products.filter(p => p.isActive === 1).length;

  return (
    <div className="fade-in">
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}>
          <div className="stat-val" style={{ color: T.accent }}>{products.length}</div>
          <div className="stat-lbl">Total Catalog Products</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{ color: T.success }}>{activeCount}</div>
          <div className="stat-lbl">Active in Daily Operations</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.inkLight }}>
          <div className="stat-val" style={{ color: T.inkLight }}>{products.length - activeCount}</div>
          <div className="stat-lbl">Archived / Inactive</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="period-row" style={{ margin: 0 }}>
          {[["active", "🟢 Active Only"], ["all", "All Products"]].map(([v, l]) => (
            <button
              key={v}
              className="btn-ghost"
              style={{
                background: filter === v ? T.accent : "transparent",
                color: filter === v ? "#fff" : T.inkMid,
                borderColor: filter === v ? T.accent : T.border
              }}
              onClick={() => setFilter(v)}
            >
              {l}
            </button>
          ))}
          <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center" }}>
            {displayed.length} product{displayed.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Product</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: T.inkLight }}>Loading products…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product ID</th>
                  <th>Full Name / Description</th>
                  <th>Short Name</th>
                  <th>SKU</th>
                  <th style={{ textAlign: "right" }}>Base Refill (₹)</th>
                  <th style={{ textAlign: "right" }}>SBC Rate (₹)</th>
                  <th style={{ textAlign: "right" }}>DBC Rate (₹)</th>
                  <th style={{ textAlign: "center" }}>Order</th>
                  <th style={{ textAlign: "center" }}>Status</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: 32, color: T.inkLight }}>
                      No products found.
                    </td>
                  </tr>
                ) : (
                  displayed.map((p, idx) => (
                    <tr key={p.id}>
                      <td style={{ color: T.inkLight, fontSize: 11 }}>{idx + 1}</td>
                      <td>
                        <span style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontWeight: 700,
                          fontSize: 13,
                          letterSpacing: 0.5,
                          color: T.accent,
                          background: T.accentBg,
                          border: `1px solid ${T.accentLt}`,
                          borderRadius: 6,
                          padding: "2px 8px",
                          display: "inline-block"
                        }}>
                          {p.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.label}</td>
                      <td><span className="badge badge-blue">{p.shortName || p.short || "—"}</span></td>
                      <td style={{ fontSize: 12, color: T.inkMid }}>{p.sku || "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: T.success }}>
                        {inr(p.fallbackRate)}
                      </td>
                      <td style={{ textAlign: "right", color: T.inkMid }}>
                        {num(p.fallbackSbc) ? inr(p.fallbackSbc) : "—"}
                      </td>
                      <td style={{ textAlign: "right", color: T.inkMid }}>
                        {num(p.fallbackDbc) ? inr(p.fallbackDbc) : "—"}
                      </td>
                      <td style={{ textAlign: "center", fontSize: 12, color: T.inkLight }}>
                        {p.sortOrder ?? 0}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          onClick={() => handleToggle(p.id)}
                          className={`badge ${p.isActive ? "badge-success" : "badge-ink"}`}
                          style={{ cursor: "pointer", border: "none", padding: "4px 12px" }}
                          title="Click to toggle active status"
                        >
                          {p.isActive ? "ACTIVE" : "INACTIVE"}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button
                            className="btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => openEdit(p)}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            className="btn-danger"
                            style={{ padding: "4px 10px", fontSize: 11 }}
                            onClick={() => handleDelete(p)}
                            title="Delete if no historical records exist"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: T.card,
            borderRadius: 14,
            padding: 28,
            width: "100%",
            maxWidth: 540,
            boxShadow: T.shadowMd,
            maxHeight: "90vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700 }}>
                  {editId ? `✏️ Edit Product (${editId})` : "📦 Add New Product"}
                </div>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 3 }}>
                  Define cylinder specifications, default price rates, and display names
                </div>
              </div>
              <button className="btn-icon" onClick={closeModal}>×</button>
            </div>

            {err && <div className="login-err" style={{ marginBottom: 16 }}>⚠️ {err}</div>}

            <div className="g2">
              <div className="field">
                <label>Product Code / ID *</label>
                <input
                  className="inp"
                  type="text"
                  placeholder="e.g. p10, p47"
                  value={form.id}
                  onChange={e => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "") })}
                  disabled={!!editId}
                  style={editId ? { background: "rgba(0,0,0,0.04)", color: T.inkLight } : undefined}
                />
                <div style={{ fontSize: 11, color: T.inkLight, marginTop: 3 }}>
                  {editId ? "ID cannot be changed (bound to history)" : "Unique code, e.g. p10 for 10 KG"}
                </div>
              </div>

              <div className="field">
                <label>Short Name *</label>
                <input
                  className="inp"
                  type="text"
                  placeholder="e.g. 10 KG"
                  value={form.shortName}
                  onChange={e => setForm({ ...form, shortName: e.target.value })}
                />
                <div style={{ fontSize: 11, color: T.inkLight, marginTop: 3 }}>
                  Displayed in tables & counters
                </div>
              </div>
            </div>

            <div className="field">
              <label>Full Product Label *</label>
              <input
                className="inp"
                type="text"
                placeholder="e.g. 10 KG Composite Cylinder (5380)"
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
              />
            </div>

            <div className="g2">
              <div className="field">
                <label>SKU Code</label>
                <input
                  className="inp"
                  type="text"
                  placeholder="e.g. 5380"
                  value={form.sku}
                  onChange={e => setForm({ ...form, sku: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Display Sort Order</label>
                <input
                  className="inp"
                  type="number"
                  placeholder="e.g. 4"
                  value={form.sortOrder}
                  onChange={e => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
            </div>

            <div style={{ background: "rgba(0,119,255,0.03)", padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, margin: "14px 0" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, marginBottom: 10 }}>
                💰 Base Rates (Used when no custom price revision exists for the day)
              </div>
              <div className="g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>Refill Rate (₹) *</label>
                  <input
                    className="inp"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.fallbackRate}
                    onChange={e => setForm({ ...form, fallbackRate: e.target.value })}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>SBC Rate (₹)</label>
                  <input
                    className="inp"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.fallbackSbc}
                    onChange={e => setForm({ ...form, fallbackSbc: e.target.value })}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>DBC Rate (₹)</label>
                  <input
                    className="inp"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.fallbackDbc}
                    onChange={e => setForm({ ...form, fallbackDbc: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ flex: 2 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving…" : editId ? "💾 Save Changes" : "✅ Add to Catalog"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
