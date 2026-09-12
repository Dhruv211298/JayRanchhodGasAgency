import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { api } from "../api";
import { T } from "../styles";
import { inr, num } from "../constants";

const generateAutoId = (category, shortName, label, existingList = []) => {
  const existingIds = new Set((existingList || []).map(p => (p.id || '').toLowerCase()));
  let baseId = '';
  const sName = (shortName || '').trim().toLowerCase();
  const lName = (label || '').trim().toLowerCase();
  
  if (category === 'cylinder') {
    const match = sName.match(/(\d+(?:\.\d+)?)/) || lName.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      baseId = `p${match[1].replace('.', '_')}`;
    } else if (sName) {
      baseId = `cyl_${sName.replace(/[^a-z0-9]/g, '_').slice(0, 15)}`;
    } else {
      let nextN = 1;
      while (existingIds.has(`p${nextN}`) || existingIds.has(`cyl_${nextN}`)) nextN++;
      baseId = `p${nextN}`;
    }
  } else {
    const slug = (sName || lName).replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '').slice(0, 15);
    baseId = slug ? (slug.startsWith('acc') ? slug : `acc_${slug}`) : 'acc_item';
  }
  
  baseId = baseId.replace(/[^a-z0-9_-]/g, '').toLowerCase() || 'prod';
  let finalId = baseId;
  let counter = 2;
  while (existingIds.has(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }
  return finalId;
};

const blankProductForm = (existingProducts = []) => {
  const defaultCategory = "cylinder";
  const autoId = generateAutoId(defaultCategory, "", "", existingProducts);
  return {
    id: autoId,
    label: "",
    shortName: "",
    sku: "",
    fallbackRate: "",
    fallbackSbc: "0",
    fallbackDbc: "0",
    sortOrder: "10",
    category: defaultCategory
  };
};

export default function AdminProductMaster({ products: initialProducts = [], onProductsChanged }) {
  const [products, setProducts] = useState(Array.isArray(initialProducts) && initialProducts.length > 0 ? initialProducts : []);
  const [loading, setLoading] = useState(products.length === 0);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(blankProductForm(products));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // "active" | "all"
  const [catFilter, setCatFilter] = useState("all"); // "all" | "cylinder" | "accessory"
  const [fetchErr, setFetchErr] = useState("");

  const fetchProducts = async () => {
    setFetchErr("");
    try {
      const data = await api.getProducts();
      if (Array.isArray(data)) {
        setProducts(data);
      } else if (data && data.error) {
        setFetchErr(data.error);
        if (products.length === 0 && initialProducts.length > 0) {
          setProducts(initialProducts);
        }
      }
    } catch (e) {
      setFetchErr(e.message || "Failed to load products from server.");
      if (products.length === 0 && initialProducts.length > 0) {
        setProducts(initialProducts);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) fetchProducts();
    });
    return () => { alive = false; };
  }, []);

  // Update products if initialProducts arrives and products is empty
  useEffect(() => {
    if (products.length === 0 && Array.isArray(initialProducts) && initialProducts.length > 0) {
      setProducts(initialProducts);
      setLoading(false);
    }
  }, [initialProducts]);

  const openAdd = () => {
    setEditId(null);
    setForm(blankProductForm(products));
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

  // When category, shortName, or label changes in ADD mode, update auto-generated ID
  const handleCategoryChange = (newCat) => {
    if (editId) {
      setForm(prev => ({ ...prev, category: newCat }));
    } else {
      const newId = generateAutoId(newCat, form.shortName, form.label, products);
      setForm(prev => ({
        ...prev,
        category: newCat,
        id: newId,
        fallbackSbc: newCat === "accessory" ? "0" : prev.fallbackSbc,
        fallbackDbc: newCat === "accessory" ? "0" : prev.fallbackDbc
      }));
    }
  };

  const handleShortNameChange = (val) => {
    if (editId) {
      setForm(prev => ({ ...prev, shortName: val }));
    } else {
      const newId = generateAutoId(form.category, val, form.label, products);
      setForm(prev => ({ ...prev, shortName: val, id: newId }));
    }
  };

  const handleLabelChange = (val) => {
    if (editId) {
      setForm(prev => ({ ...prev, label: val }));
    } else {
      const newId = generateAutoId(form.category, form.shortName, val, products);
      setForm(prev => ({ ...prev, label: val, id: newId }));
    }
  };

  const handleSave = async () => {
    const cleanId = form.id.trim().toLowerCase();
    if (!cleanId) { setErr("Product ID/Code could not be generated."); return; }
    if (!/^[a-z0-9_-]{2,50}$/.test(cleanId)) {
      setErr("Product ID must be 2-50 characters (letters, numbers, hyphens or underscores only).");
      return;
    }
    if (!form.label.trim()) { setErr("Product label / full name is required."); return; }
    if (!form.shortName.trim()) { setErr("Short display name is required."); return; }
    if (num(form.fallbackRate) < 0) { setErr("Base rate cannot be negative."); return; }

    setSaving(true);
    setErr("");
    try {
      if (editId) {
        const res = await api.updateProduct(editId, {
          label: form.label.trim(),
          shortName: form.shortName.trim(),
          sku: form.sku.trim(),
          fallbackRate: num(form.fallbackRate),
          fallbackSbc: form.category === "accessory" ? 0 : num(form.fallbackSbc),
          fallbackDbc: form.category === "accessory" ? 0 : num(form.fallbackDbc),
          category: form.category || "cylinder",
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
          fallbackSbc: form.category === "accessory" ? 0 : num(form.fallbackSbc),
          fallbackDbc: form.category === "accessory" ? 0 : num(form.fallbackDbc),
          sortOrder: parseInt(form.sortOrder, 10) || 0,
          category: form.category || "cylinder"
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error || "Add failed.");
        }
        Swal.fire({ title: "Created!", text: `Product "${form.label}" added to catalog with ID: ${cleanId}.`, icon: "success", timer: 1800, timerProgressBar: true, confirmButtonColor: "#0077ff" });
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

  // Filter products by active/all and category
  const displayed = products.filter(p => {
    const matchesStatus = statusFilter === "all" ? true : (p.isActive === 1 || p.isActive === true || p.isActive === undefined);
    const prodCat = (p.category || "cylinder").toLowerCase();
    const matchesCat = catFilter === "all" ? true : prodCat === catFilter;
    return matchesStatus && matchesCat;
  });

  const activeCount = products.filter(p => p.isActive === 1 || p.isActive === true || p.isActive === undefined).length;
  const cylinderCount = products.filter(p => (p.category || "cylinder").toLowerCase() === "cylinder").length;
  const accessoryCount = products.filter(p => (p.category || "").toLowerCase() === "accessory").length;

  return (
    <div className="fade-in">
      {/* KPI Stats */}
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-card" style={{ "--kpi-color": T.accent }}>
          <div className="stat-val" style={{ color: T.accent }}>{products.length}</div>
          <div className="stat-lbl">Total Catalog Products</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.success }}>
          <div className="stat-val" style={{ color: T.success }}>{activeCount}</div>
          <div className="stat-lbl">Active in Daily Operations</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.blue }}>
          <div className="stat-val" style={{ color: T.blue }}>{cylinderCount} <span style={{ fontSize: 13, fontWeight: 400, color: T.inkLight }}>Cyl / {accessoryCount} Acc</span></div>
          <div className="stat-lbl">Cylinders & Accessories</div>
        </div>
        <div className="stat-card" style={{ "--kpi-color": T.inkLight }}>
          <div className="stat-val" style={{ color: T.inkLight }}>{products.length - activeCount}</div>
          <div className="stat-lbl">Archived / Inactive</div>
        </div>
      </div>

      {fetchErr && (
        <div style={{
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: T.danger,
          padding: "10px 16px",
          borderRadius: 8,
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>⚠️ {fetchErr} Showing cached catalog data.</span>
          <button className="btn-ghost" style={{ padding: "3px 10px", fontSize: 11 }} onClick={fetchProducts}>
            🔄 Retry
          </button>
        </div>
      )}

      {/* Control Bar: Filters & Action Button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* Status Filter */}
          <div className="period-row" style={{ margin: 0 }}>
            {[["active", "🟢 Active Only"], ["all", "All Products"]].map(([v, l]) => (
              <button
                key={v}
                className="btn-ghost"
                style={{
                  background: statusFilter === v ? T.accent : "transparent",
                  color: statusFilter === v ? "#fff" : T.inkMid,
                  borderColor: statusFilter === v ? T.accent : T.border
                }}
                onClick={() => setStatusFilter(v)}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Category Filter Pills */}
          <div className="period-row" style={{ margin: 0 }}>
            {[
              ["all", "All Categories"],
              ["cylinder", "🛢️ Cylinders"],
              ["accessory", "🔧 Accessories"]
            ].map(([v, l]) => (
              <button
                key={v}
                className="btn-ghost"
                style={{
                  background: catFilter === v ? (v === "accessory" ? T.blue : T.accent) : "transparent",
                  color: catFilter === v ? "#fff" : T.inkMid,
                  borderColor: catFilter === v ? (v === "accessory" ? T.blue : T.accent) : T.border,
                  fontSize: 12
                }}
                onClick={() => setCatFilter(v)}
              >
                {l}
              </button>
            ))}
            <span style={{ fontSize: 11, color: T.inkLight, alignSelf: "center", marginLeft: 4 }}>
              {displayed.length} item{displayed.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <button className="btn-primary" onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>+</span> Add Product
        </button>
      </div>

      {/* Catalog Table */}
      <div className="card">
        {loading && products.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: T.inkLight }}>Loading products…</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product ID</th>
                  <th>Category</th>
                  <th>Full Name / Description</th>
                  <th>Short Name</th>
                  <th>SKU</th>
                  <th style={{ textAlign: "right" }}>Base Rate (₹)</th>
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
                    <td colSpan={12} style={{ textAlign: "center", padding: 36, color: T.inkLight }}>
                      No products found matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  displayed.map((p, idx) => {
                    const isAcc = (p.category || "").toLowerCase() === "accessory";
                    return (
                      <tr key={p.id}>
                        <td style={{ color: T.inkLight, fontSize: 11 }}>{idx + 1}</td>
                        <td>
                          <span style={{
                            fontFamily: "'DM Sans',sans-serif",
                            fontWeight: 700,
                            fontSize: 13,
                            letterSpacing: 0.5,
                            color: isAcc ? T.blue : T.accent,
                            background: isAcc ? "rgba(0,119,255,0.08)" : (T.accentBg || "rgba(224, 77, 1, 0.08)"),
                            border: `1px solid ${isAcc ? "rgba(0,119,255,0.2)" : (T.accentLt || "rgba(224, 77, 1, 0.2)")}`,
                            borderRadius: 6,
                            padding: "2px 8px",
                            display: "inline-block"
                          }}>
                            {p.id}
                          </span>
                        </td>
                        <td>
                          {isAcc ? (
                            <span className="badge badge-blue" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <span>🔧</span> Accessory
                            </span>
                          ) : (
                            <span className="badge" style={{
                              background: "rgba(224, 77, 1, 0.12)",
                              color: T.accent,
                              border: `1px solid rgba(224, 77, 1, 0.25)`,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4
                            }}>
                              <span>🛢️</span> Cylinder
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>{p.label}</td>
                        <td><span className="badge badge-blue">{p.shortName || p.short || "—"}</span></td>
                        <td style={{ fontSize: 12, color: T.inkMid }}>{p.sku || "—"}</td>
                        <td style={{ textAlign: "right", fontWeight: 700, color: T.success }}>
                          {inr(p.fallbackRate)}
                        </td>
                        <td style={{ textAlign: "right", color: T.inkMid }}>
                          {isAcc ? <span style={{ color: T.inkLight, fontSize: 11 }}>— (N/A)</span> : (num(p.fallbackSbc) ? inr(p.fallbackSbc) : "—")}
                        </td>
                        <td style={{ textAlign: "right", color: T.inkMid }}>
                          {isAcc ? <span style={{ color: T.inkLight, fontSize: 11 }}>— (N/A)</span> : (num(p.fallbackDbc) ? inr(p.fallbackDbc) : "—")}
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add / Edit Product */}
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
            maxHeight: "92vh",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700 }}>
                  {editId ? `✏️ Edit Product (${editId})` : "📦 Add New Product"}
                </div>
                <div style={{ fontSize: 12, color: T.inkLight, marginTop: 3 }}>
                  Define cylinder or accessory specifications, default price rates, and display names
                </div>
              </div>
              <button className="btn-icon" onClick={closeModal}>×</button>
            </div>

            {err && <div className="login-err" style={{ marginBottom: 16 }}>⚠️ {err}</div>}

            {/* Field: Category Selector (Cylinder vs Accessory) */}
            <div className="field" style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <span>Product Type / Category *</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `2px solid ${form.category === "cylinder" ? T.accent : T.border}`,
                    background: form.category === "cylinder" ? "rgba(224, 77, 1, 0.08)" : "transparent",
                    color: form.category === "cylinder" ? T.accent : T.inkMid,
                    fontWeight: form.category === "cylinder" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  onClick={() => handleCategoryChange("cylinder")}
                >
                  <span style={{ fontSize: 18 }}>🛢️</span>
                  <span>Cylinder</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `2px solid ${form.category === "accessory" ? T.blue : T.border}`,
                    background: form.category === "accessory" ? "rgba(0, 119, 255, 0.08)" : "transparent",
                    color: form.category === "accessory" ? T.blue : T.inkMid,
                    fontWeight: form.category === "accessory" ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  onClick={() => handleCategoryChange("accessory")}
                >
                  <span style={{ fontSize: 18 }}>🔧</span>
                  <span>Accessory</span>
                </button>
              </div>
            </div>

            {/* Product ID (Automated) and Short Name */}
            <div className="g2">
              <div className="field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label>Product Code / ID *</label>
                  {!editId && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: T.success,
                      background: "rgba(16, 185, 129, 0.1)",
                      padding: "1px 6px",
                      borderRadius: 4
                    }}>
                      🤖 Auto-Generated
                    </span>
                  )}
                </div>
                <input
                  className="inp"
                  type="text"
                  value={form.id}
                  readOnly
                  disabled
                  style={{
                    background: "rgba(0,0,0,0.04)",
                    color: T.inkMid,
                    fontWeight: 700,
                    cursor: "not-allowed",
                    letterSpacing: 0.5
                  }}
                />
                <div style={{ fontSize: 11, color: T.inkLight, marginTop: 3 }}>
                  {editId ? "ID cannot be changed (bound to transactions)" : "Auto-computed from category & name"}
                </div>
              </div>

              <div className="field">
                <label>Short Name *</label>
                <input
                  className="inp"
                  type="text"
                  placeholder={form.category === "cylinder" ? "e.g. 10 KG, 47.5 KG" : "e.g. Pipe, Regulator"}
                  value={form.shortName}
                  onChange={e => handleShortNameChange(e.target.value)}
                />
                <div style={{ fontSize: 11, color: T.inkLight, marginTop: 3 }}>
                  Displayed in counters, tables & slips
                </div>
              </div>
            </div>

            {/* Full Product Label */}
            <div className="field">
              <label>Full Product Label *</label>
              <input
                className="inp"
                type="text"
                placeholder={form.category === "cylinder" ? "e.g. 10 KG Composite Cylinder (5380)" : "e.g. Suraksha LPG Reinforced Hose Pipe"}
                value={form.label}
                onChange={e => handleLabelChange(e.target.value)}
              />
            </div>

            {/* SKU and Sort Order */}
            <div className="g2">
              <div className="field">
                <label>SKU Code</label>
                <input
                  className="inp"
                  type="text"
                  placeholder={form.category === "cylinder" ? "e.g. 5380, CYL-10" : "e.g. ACC-PIPE"}
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

            {/* Base Rates Card */}
            <div style={{
              background: form.category === "accessory" ? "rgba(0,119,255,0.03)" : "rgba(224, 77, 1, 0.03)",
              padding: 14,
              borderRadius: 10,
              border: `1px solid ${T.border}`,
              margin: "14px 0"
            }}>
              <div style={{
                fontSize: 12,
                fontWeight: 700,
                color: form.category === "accessory" ? T.blue : T.accent,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 6
              }}>
                <span>💰</span>
                <span>
                  {form.category === "accessory" ? "Accessory Pricing (Standard Sales Rate)" : "Base Rates (Used when no custom price revision exists for the day)"}
                </span>
              </div>

              {form.category === "accessory" ? (
                <div className="field" style={{ margin: 0 }}>
                  <label style={{ fontSize: 11 }}>Unit Selling Rate / Price (₹) *</label>
                  <input
                    className="inp"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.fallbackRate}
                    onChange={e => setForm({ ...form, fallbackRate: e.target.value })}
                  />
                  <div style={{ fontSize: 11, color: T.inkLight, marginTop: 4 }}>
                    Note: Accessories do not require SBC / DBC cylinder deposit rates.
                  </div>
                </div>
              ) : (
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
              )}
            </div>

            {/* Modal Buttons */}
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
