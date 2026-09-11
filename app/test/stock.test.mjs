import assert from "node:assert/strict";
import {
  computeClosingStock, finaliseProducts, computeOpeningEmptyByProduct,
  computeEmptyBalanceSeries, emptyInFor, emptyDespatchedFor, todayStr, calcEntry,
  computeDayCalcs, blankEntry, unrecordedConnectionIssues, monthStr, toCsv
} from "../src/constants.js";

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n         " + e.message); }
};

const P = (o = {}) => ({ id: "p14", openingStock: 0, sell: 0, online: 0, sbc: 0, dbc: 0,
                          rate: 900, sbcRate: 0, dbcRate: 0, ...o });

console.log("\n── Closing stock ──");

t("deducts cash sales", () => {
  const e = { products: [P({ openingStock: 100, sell: 10 })] };
  assert.equal(computeClosingStock(e, e.products[0]), 90);
});

t("deducts online, SBC and DBC", () => {
  const e = { products: [P({ openingStock: 100, sell: 5, online: 3, sbc: 2, dbc: 1 })] };
  assert.equal(computeClosingStock(e, e.products[0]), 89);
});

t("adds plant arrivals when hasArrival is true", () => {
  const e = { hasArrival: true, arrivals: [{ productId: "p14", filledReceived: 50 }],
              products: [P({ openingStock: 100, sell: 10 })] };
  assert.equal(computeClosingStock(e, e.products[0]), 140);
});

t("ignores arrivals when hasArrival is false", () => {
  const e = { hasArrival: false, arrivals: [{ productId: "p14", filledReceived: 50 }],
              products: [P({ openingStock: 100, sell: 10 })] };
  assert.equal(computeClosingStock(e, e.products[0]), 90);
});

t("THE BUG: deducts credit-sale filled cylinders", () => {
  const e = { products: [P({ openingStock: 100, sell: 10 })],
              creditSales: [{ productId: "p14", filledQty: 5, emptyQty: 0, amt: 4500 }] };
  // Old saved formula gave 90 and the 5 credit cylinders reappeared next day.
  assert.equal(computeClosingStock(e, e.products[0]), 85);
});

t("credit cylinders for a DIFFERENT product do not affect this one", () => {
  const e = { products: [P({ openingStock: 100, sell: 10 })],
              creditSales: [{ productId: "p19", filledQty: 5 }] };
  assert.equal(computeClosingStock(e, e.products[0]), 90);
});

t("shortage is excluded from the stock chain", () => {
  const a = { products: [P({ openingStock: 100, sell: 10, shortage: 0 })] };
  const b = { products: [P({ openingStock: 100, sell: 10, shortage: 7 })] };
  assert.equal(computeClosingStock(a, a.products[0]), computeClosingStock(b, b.products[0]));
});

console.log("\n── Saved value == displayed value (the actual defect) ──");

t("finaliseProducts matches computeClosingStock exactly", () => {
  const e = { hasArrival: true, arrivals: [{ productId: "p14", filledReceived: 20 }],
              products: [P({ openingStock: 100, sell: 10, online: 4, sbc: 1, dbc: 1 })],
              creditSales: [{ productId: "p14", filledQty: 6 }] };
  const displayed = computeClosingStock(e, e.products[0]);
  const persisted = finaliseProducts(e)[0].closingStock;
  assert.equal(persisted, displayed, `persisted ${persisted} != displayed ${displayed}`);
  assert.equal(persisted, 98);
});

t("carry-forward chain conserves cylinders across 3 days with credit", () => {
  let opening = 200;
  const days = [
    { sell: 10, credit: 5, recv: 0 },
    { sell: 8,  credit: 3, recv: 50 },
    { sell: 12, credit: 0, recv: 0 },
  ];
  let totalOut = 0, totalIn = 0;
  for (const d of days) {
    const e = { hasArrival: d.recv > 0,
                arrivals: [{ productId: "p14", filledReceived: d.recv }],
                products: [P({ openingStock: opening, sell: d.sell })],
                creditSales: d.credit ? [{ productId: "p14", filledQty: d.credit }] : [] };
    opening = finaliseProducts(e)[0].closingStock;   // carry forward
    totalOut += d.sell + d.credit; totalIn += d.recv;
  }
  assert.equal(opening, 200 + totalIn - totalOut, "cylinders were created or destroyed");
  assert.equal(opening, 212);
});

console.log("\n── Empty-cylinder balance ──");

t("empties enter from sales, credit sales and recoveries", () => {
  const e = { products: [P({ sell: 10, online: 2 })],
              creditSales: [{ productId: "p14", emptyQty: 3 }],
              creditRecoveries: [{ productId: "p14", emptyReturned: 4 }] };
  assert.equal(emptyInFor(e, e.products[0]), 19);
});

t("empties leave only on plant despatch", () => {
  const e = { hasArrival: true, arrivals: [{ productId: "p14", emptyReturned: 40 }] };
  assert.equal(emptyDespatchedFor(e, "p14"), 40);
});

t("running balance nets receipts against despatches", () => {
  const entries = [
    { date: "2026-01-01", products: [P({ sell: 20 })] },
    { date: "2026-01-02", products: [P({ sell: 15 })],
      creditRecoveries: [{ productId: "p14", emptyReturned: 5 }] },
    { date: "2026-01-03", products: [P({ sell: 10 })], hasArrival: true,
      arrivals: [{ productId: "p14", emptyReturned: 30 }] },
  ];
  assert.equal(computeOpeningEmptyByProduct(entries, "2026-01-03").p14, 40);
  const s = computeEmptyBalanceSeries(entries);
  assert.equal(s["2026-01-01"].p14, 20);
  assert.equal(s["2026-01-02"].p14, 40);
  assert.equal(s["2026-01-03"].p14, 20);
});

t("series and per-date function agree", () => {
  const entries = [
    { date: "2026-02-01", products: [P({ sell: 7, online: 1 })] },
    { date: "2026-02-02", products: [P({ sell: 4 })], creditSales: [{ productId: "p14", emptyQty: 2 }] },
    { date: "2026-02-03", products: [P({ sell: 9 })] },
  ];
  const series = computeEmptyBalanceSeries(entries);
  assert.equal(series["2026-02-02"].p14, computeOpeningEmptyByProduct(entries, "2026-02-03").p14);
});

console.log("\n── Date handling ──");

t("todayStr returns the LOCAL date, not the UTC date", () => {
  const s = todayStr();
  const d = new Date();
  const expect = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  assert.equal(s, expect);
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/);
});

console.log("\n── Cash on hand ──");

t("cash formula excludes online receipts from the drawer", () => {
  const e = { date: "2026-03-01", openingCash: 1000, bob: 0,
              products: [P({ sell: 10, online: 5, rate: 100 })],
              expenses: [{ amt: 200 }] };
  const c = calcEntry(e);
  // sales 1500, of which 500 online -> drawer gets 1000, less 200 expenses
  assert.equal(c.totalSales, 1500);
  assert.equal(c.cashOnHand, 1000 + 1500 - 500 - 200);
});

t("same-day credit settlement reports zero outstanding credit", () => {
  const e = { date: "2026-03-01", openingCash: 0, products: [P()],
              creditSales: [{ id: "x", amt: 900 }],
              creditRecoveries: [{ ledgerId: "2026-03-01-x", amt: 900 }] };
  assert.equal(calcEntry(e).totalCredit, 0);
});

console.log("\n── Connection module: stock ──");

t("connection cylinders issued (new / additional bottle) LEAVE filled stock", () => {
  const e = { products: [P({ openingStock: 100, sell: 10 })],
              connectionMovements: [{ productId: "p14", filledOut: 3, emptyIn: 0 }] };
  assert.equal(computeClosingStock(e, e.products[0]), 87);
});

t("connection movements for a DIFFERENT product do not affect this one", () => {
  const e = { products: [P({ openingStock: 100, sell: 10 })],
              connectionMovements: [{ productId: "p19", filledOut: 3, emptyIn: 0 }] };
  assert.equal(computeClosingStock(e, e.products[0]), 90);
});

t("surrendered empties ENTER the empty balance; they never touch filled stock", () => {
  const e = { products: [P({ openingStock: 100, sell: 10 })],
              connectionMovements: [{ productId: "p14", filledOut: 0, emptyIn: 2 }] };
  assert.equal(emptyInFor(e, e.products[0]), 12);
  assert.equal(computeClosingStock(e, e.products[0]), 90);
});

t("persisted closing stock == displayed closing stock with connection issues present", () => {
  const e = { hasArrival: true, arrivals: [{ productId: "p14", filledReceived: 20 }],
              products: [P({ openingStock: 100, sell: 10, online: 4 })],
              creditSales: [{ productId: "p14", filledQty: 6 }],
              connectionMovements: [{ productId: "p14", filledOut: 2, emptyIn: 1 }] };
  assert.equal(finaliseProducts(e)[0].closingStock, computeClosingStock(e, e.products[0]));
  assert.equal(finaliseProducts(e)[0].closingStock, 98);
});

t("chain conserves cylinders across days with connection issues and surrender returns", () => {
  let opening = 50;
  const days = [
    { sell: 5, connOut: 2, connIn: 0 },
    { sell: 3, connOut: 1, connIn: 1 },
    { sell: 4, connOut: 0, connIn: 2 },
  ];
  let out = 0;
  for (const d of days) {
    const e = { products: [P({ openingStock: opening, sell: d.sell })],
                connectionMovements: [{ productId: "p14", filledOut: d.connOut, emptyIn: d.connIn }] };
    opening = finaliseProducts(e)[0].closingStock;
    out += d.sell + d.connOut;   // surrender returns are EMPTY — they never re-enter filled stock
  }
  assert.equal(opening, 50 - out);
  assert.equal(opening, 35);
});

t("issues on days with NO saved entry are carried into the next blank entry's opening", () => {
  const entries = [{ date: "2026-09-01", products: [P({ openingStock: 100, sell: 10, closingStock: 90 })] }];
  const byDate = {
    "2026-09-02": { connectionMovements: [{ productId: "p14", filledOut: 2, emptyIn: 0 }] }, // no entry saved
    "2026-09-03": { connectionMovements: [{ productId: "p14", filledOut: 1, emptyIn: 0 }] }, // the target day itself
    "2026-09-01": { connectionMovements: [{ productId: "p14", filledOut: 9, emptyIn: 0 }] }, // already inside the saved entry
  };
  const adj = unrecordedConnectionIssues(byDate, entries, "2026-09-01", "2026-09-03");
  assert.equal(adj.p14, 2, "only the unsaved intervening day counts");
  const blank = blankEntry([], [], entries[0], { date: "2026-09-03", connectionsByDate: byDate, entries });
  const p14 = blank.products.find(p => p.id === "p14");
  assert.equal(p14.openingStock, 88, "90 carried − 2 issued on the unsaved day");
  assert.equal(computeClosingStock(blank, p14), 87, "today's own issue is applied by the formula, not the opening");
  assert.equal(blank.unrecordedConnectionIssues.p14, 2);
});

t("blank entry with no connection activity has zero movement rows for every product", () => {
  const blank = blankEntry([], [], null, { date: "2026-09-03" });
  assert.equal(blank.connectionMovements.length, 3);
  assert.ok(blank.connectionMovements.every(m => m.filledOut === 0 && m.emptyIn === 0));
  assert.deepEqual(blank.connectionPayments, []);
  assert.deepEqual(blank.connectionRefunds, []);
});

console.log("\n── Connection module: cash on hand (computeDayCalcs) ──");

const CASH_BASE = { date: "2026-09-03", openingCash: 1000, bob: 0, products: [P()], expenses: [{ amt: 200 }] };

t("computeDayCalcs is the same function as calcEntry", () => {
  assert.equal(computeDayCalcs, calcEntry);
});

t("cash-mode connection payment RAISES cashOnHand by exactly its amount", () => {
  const base = calcEntry(CASH_BASE).cashOnHand;
  const c = calcEntry({ ...CASH_BASE, connectionPayments: [{ amt: 1500, mode: "cash" }] });
  assert.equal(c.totalConnectionPaymentsCash, 1500);
  assert.equal(c.totalConnectionPaymentsOnline, 0);
  assert.equal(c.cashOnHand, base + 1500);
});

t("online-mode connection payment leaves cashOnHand UNCHANGED but is reported", () => {
  const base = calcEntry(CASH_BASE).cashOnHand;
  const c = calcEntry({ ...CASH_BASE, connectionPayments: [{ amt: 3000, mode: "online" }] });
  assert.equal(c.totalConnectionPaymentsOnline, 3000);
  assert.equal(c.totalConnectionPaymentsCash, 0);
  assert.equal(c.cashOnHand, base);
});

t("one payment of each mode: only the cash one moves the drawer", () => {
  const base = calcEntry(CASH_BASE).cashOnHand;
  const c = calcEntry({ ...CASH_BASE, connectionPayments: [{ amt: 1500, mode: "cash" }, { amt: 3000, mode: "online" }] });
  assert.equal(c.cashOnHand, base + 1500);
  assert.equal(c.totalConnectionPaymentsCash + c.totalConnectionPaymentsOnline, 4500);
});

t("surrender refund (net paid) LOWERS cashOnHand by exactly its amount", () => {
  const base = calcEntry(CASH_BASE).cashOnHand;
  const c = calcEntry({ ...CASH_BASE, connectionRefunds: [{ amt: 1650, refundAmount: 2000, penaltyDeducted: 350 }] });
  assert.equal(c.totalConnectionRefunds, 1650, "net paid, not the gross refund");
  assert.equal(c.cashOnHand, base - 1650);
});

t("full formula: opening + sales − online→bank − expenses + conn cash − conn refunds − BOB", () => {
  const e = { date: "2026-09-03", openingCash: 5000, bob: 500,
              products: [P({ sell: 10, online: 2, rate: 900 })],
              expenses: [{ amt: 100 }], vehicleExpenses: [{ amt: 50 }], salaryPayments: [{ amt: 300 }],
              otherCashCredits: [{ amt: 40 }], chequeOnline: [{ amt: 999 }],
              connectionPayments: [{ amt: 1500, mode: "cash" }, { amt: 3000, mode: "online" }],
              connectionRefunds: [{ amt: 1650 }] };
  const c = calcEntry(e);
  // 5000 + (9000 cash + 1800 online) − 1800 + 40 + 1500 − 100 − 50 − 300 − 1650 − 500 = 12940 ; cheque is not in the formula
  assert.equal(c.cashOnHand, 12940);
});

t("an unknown payment mode is neither added nor reported as cash", () => {
  const base = calcEntry(CASH_BASE).cashOnHand;
  const c = calcEntry({ ...CASH_BASE, connectionPayments: [{ amt: 1500, mode: "upi" }] });
  assert.equal(c.cashOnHand, base);
  assert.equal(c.totalConnectionPaymentsCash, 0);
});

console.log("\n── Misc helpers ──");

t("monthStr uses the LOCAL month", () => {
  const d = new Date(2026, 0, 1, 0, 30); // 00:30 on 1 Jan local — UTC may still be December
  assert.equal(monthStr(d), "2026-01");
});

t("CSV export escapes commas, quotes and newlines", () => {
  const csv = toCsv(["a", "b"], [["x,y", 'he said "hi"'], ["plain", "multi\nline"]]);
  assert.equal(csv, 'a,b\r\n"x,y","he said ""hi"""\r\nplain,"multi\nline"');
});

console.log("\n── Dynamic Product Master ──");

t("blankEntry initializes custom products like p10", () => {
  const customProds = [
    { id: "p14", label: "14.2 KG Domestic", short: "14 KG", is_active: 1, fallback_rate: 850, fallback_sbc: 1800, fallback_dbc: 2200 },
    { id: "p10", label: "10 KG Composite", short: "10 KG", is_active: 1, fallback_rate: 650, fallback_sbc: 2500, fallback_dbc: 3000 },
  ];
  const e = blankEntry([], [], null, { products: customProds });
  assert.equal(e.products.length, 2);
  assert.equal(e.products[1].id, "p10");
  assert.equal(e.products[1].rate, 650);
  assert.equal(e.arrivals.length, 2);
  assert.equal(e.arrivals[1].productId, "p10");
  assert.equal(e.godownStock.length, 2);
  assert.equal(e.godownStock[1].productId, "p10");
});

t("computeClosingStock calculates correct balance for custom product", () => {
  const customProd = { id: "p10", openingStock: 50, sell: 12, online: 3, sbc: 1, dbc: 0, rate: 650 };
  const e = {
    hasArrival: true,
    arrivals: [{ productId: "p10", filledReceived: 20 }],
    products: [customProd],
    creditSales: [{ productId: "p10", filledQty: 4 }]
  };
  // 50 + 20 - 12 - 3 - 1 - 0 - 4 = 50
  assert.equal(computeClosingStock(e, customProd), 50);
});

t("computeEmptyBalanceSeries tracks custom product empty balance", () => {
  const customProds = [
    { id: "p14", label: "14.2 KG Domestic", short: "14 KG" },
    { id: "p10", label: "10 KG Composite", short: "10 KG" },
  ];
  const entries = [
    {
      date: "2026-03-01",
      godownStock: [{ productId: "p10", empty: 15 }],
      products: [{ id: "p10", sell: 5, online: 2, sbc: 0, dbc: 0 }],
      arrivals: [{ productId: "p10", emptyReturned: 10 }],
      hasArrival: true,
    }
  ];
  const series = computeEmptyBalanceSeries(entries, customProds);
  assert.ok(series["2026-03-01"]);
  // In: 5 + 2 = 7. Out: 10. Net running: 7 - 10 = -3.
  assert.equal(series["2026-03-01"]["p10"], -3);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail);

