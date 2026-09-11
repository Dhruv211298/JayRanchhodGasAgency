const assert = require("assert/strict");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n         " + e.message); }
};

console.log("\n── Product Master Backend Validation & Safety ──");

t("generates safe lowercase product id from label or sku", () => {
  const sanitizeId = (label, sku) => {
    const raw = (sku || label || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    return raw.startsWith("p") ? raw : "p" + raw;
  };
  assert.equal(sanitizeId("10 KG Composite", "10kg"), "p10kg");
  assert.equal(sanitizeId("47.5 KG Industrial", ""), "p475kgindustrial");
  assert.equal(sanitizeId("14.2 KG Domestic", "p14"), "p14");
});

t("validates required fields for cylinder products", () => {
  const validateProduct = (body) => {
    const errors = [];
    if (!body.label || !body.label.trim()) errors.push("Label is required");
    if (!body.short_name || !body.short_name.trim()) errors.push("Short name is required");
    if (body.fallback_rate !== undefined && isNaN(Number(body.fallback_rate))) errors.push("Fallback rate must be numeric");
    return errors;
  };
  assert.equal(validateProduct({ label: "", short_name: "10K" }).length, 1);
  assert.equal(validateProduct({ label: "10 KG", short_name: "10K", fallback_rate: "abc" }).length, 1);
  assert.equal(validateProduct({ label: "10 KG Cylinder", short_name: "10 KG", fallback_rate: 650 }).length, 0);
});

t("blocks deletion when referenced in historical transaction tables", () => {
  // Simulated safe-delete logic checking foreign key references
  const checkReferences = (productId, dbState) => {
    const usageTables = [];
    for (const [table, rows] of Object.entries(dbState)) {
      if (rows.some(r => r.product_id === productId || r.productId === productId)) {
        usageTables.push(table);
      }
    }
    return usageTables;
  };

  const dbState = {
    daily_product_stock: [{ product_id: "p14" }],
    godown_stock: [],
    vehicle_arrivals: [],
    credit_ledger: [{ product_id: "p10" }],
    price_history: [],
    commission_history: [],
    connection_events: [{ product_id: "p5" }],
  };

  // p10 is referenced in credit_ledger -> cannot delete
  assert.deepEqual(checkReferences("p10", dbState), ["credit_ledger"]);
  // p14 is referenced in daily_product_stock -> cannot delete
  assert.deepEqual(checkReferences("p14", dbState), ["daily_product_stock"]);
  // p99 is not referenced anywhere -> safe to delete
  assert.deepEqual(checkReferences("p99", dbState), []);
});

t("defaults new products to cylinder category and active status", () => {
  const createProductPayload = (input) => ({
    id: input.id,
    label: input.label.trim(),
    short_name: (input.short_name || input.label).trim(),
    category: input.category || "cylinder",
    is_active: input.is_active !== undefined ? (input.is_active ? 1 : 0) : 1,
    fallback_rate: Number(input.fallback_rate) || 0,
    fallback_sbc: Number(input.fallback_sbc) || 0,
    fallback_dbc: Number(input.fallback_dbc) || 0,
  });

  const p = createProductPayload({ id: "p10", label: "10 KG Cylinder", fallback_rate: "650" });
  assert.equal(p.category, "cylinder");
  assert.equal(p.is_active, 1);
  assert.equal(p.fallback_rate, 650);
  assert.equal(p.short_name, "10 KG Cylinder");
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail);
