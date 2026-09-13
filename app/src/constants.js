export const PRODUCTS = [
  { id: "p14", label: "14 KG  (5350–5370)", short: "14 KG", sku: "5350–5370", fallbackRate: 906.5, fallbackSbc: 0, fallbackDbc: 0 },
  { id: "p19", label: "19 KG  (5400)", short: "19 KG", sku: "5400", fallbackRate: 1950, fallbackSbc: 0, fallbackDbc: 0 },
  { id: "p5", label: "FLT 5 KG", short: "5 KG", sku: "FLT", fallbackRate: 564.5, fallbackSbc: 0, fallbackDbc: 0 },
];
export const ACCESSORIES = [
  { id: "pipe", label: "Gas Pipe", short: "Pipe", fallbackRate: 150 },
  { id: "stove", label: "Gas Stove", short: "Stove", fallbackRate: 1500 },
];
export const DEFAULT_BOYS = ["OFFICE", "CHIRAG / JAYESH", "ARPIT / MAYUR", "CHOTUKAKA / BHAGO"];

/* Local-date "YYYY-MM-DD".
   NOTE: previously this used toISOString(), which returns the UTC date.
   In IST (UTC+5:30) that meant any entry made between 00:00 and 05:30
   was dated to the *previous* day. This builds the string from local
   date parts instead, so the date always matches the operator's clock. */
export const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Local "YYYY-MM" for a Date. Same reasoning as todayStr(): toISOString()
   gives the UTC month, which is the PREVIOUS month between 00:00 and 05:30
   IST on the 1st — salary rows were being tagged to the wrong month. */
export const monthStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// Returns the salary month: if today is 1st–10th, use previous month; else current month.
export const getSalaryMonth = () => {
  const now = new Date();
  if (now.getDate() <= 10) return monthStr(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return monthStr(now);
};
export const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const _MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const fmtMonth = (d) => { const dt = new Date(d + "T00:00:00"); return `${_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`; };
export const num = (v) => parseFloat(v) || 0;
export const inr = (v) => "₹" + num(v).toLocaleString("en-IN", { minimumFractionDigits: 0 });
export const uid = () => Math.random().toString(36).slice(2, 9);

export const getCurrentRate = (pid, pricesArr, productList = PRODUCTS) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  if (hist.length > 0) return num(hist[0].rate);
  const p = [...(productList || PRODUCTS), ...ACCESSORIES].find(p=>p.id===pid);
  if (!p) return 0;
  return num(p.fallbackRate !== undefined ? p.fallbackRate : p.fallback_rate);
};

export const getSbcRate = (pid, pricesArr, productList = PRODUCTS) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  if (hist.length > 0 && hist[0].sbcRate !== undefined) return num(hist[0].sbcRate);
  const p = (productList || PRODUCTS).find(p=>p.id===pid);
  if (!p) return 0;
  return num(p.fallbackSbc !== undefined ? p.fallbackSbc : p.fallback_sbc);
};

export const getDbcRate = (pid, pricesArr, productList = PRODUCTS) => {
  const hist = (pricesArr || []).filter(x => x.productId === pid).sort((a,b) => b.date.localeCompare(a.date));
  if (hist.length > 0 && hist[0].dbcRate !== undefined) return num(hist[0].dbcRate);
  const p = (productList || PRODUCTS).find(p=>p.id===pid);
  if (!p) return 0;
  return num(p.fallbackDbc !== undefined ? p.fallbackDbc : p.fallback_dbc);
};

export const getCommRate = (pid, commArr, upToDate = "9999-99-99") => {
  const hist = (commArr || []).filter(x => x.productId === pid && x.date <= upToDate).sort((a,b) => b.date.localeCompare(a.date));
  return hist[0] ? num(hist[0].perCyl) : 0;
};

/* ════════════════════════════════════════════════════════════════
   STOCK ENGINE — SINGLE SOURCE OF TRUTH
   ────────────────────────────────────────────────────────────────
   Every place in the app that needs a closing-stock or empty-stock
   figure MUST call these functions. This arithmetic used to be
   duplicated in three places (setProduct, the product table render,
   and handleSave) with three DIFFERENT formulas. The version that
   was actually written to the database omitted the credit-sale
   deduction, so every filled cylinder sold on credit silently
   reappeared in inventory the next day and the error compounded.
   Do not inline this arithmetic anywhere else.
════════════════════════════════════════════════════════════════ */

/** The arrival row for a product on this entry (always an object). */
export const arrivalFor = (entry, productId) =>
  ((entry && entry.arrivals) || []).find(a => a.productId === productId) || {};

/** Filled cylinders received from the plant. Zero when no vehicle arrived. */
export const filledReceivedFor = (entry, productId) =>
  entry && entry.hasArrival ? num(arrivalFor(entry, productId).filledReceived) : 0;

/** Empty cylinders despatched to the plant. Zero when no vehicle arrived. */
export const emptyDespatchedFor = (entry, productId) =>
  entry && entry.hasArrival ? num(arrivalFor(entry, productId).emptyReturned) : 0;

/** Filled cylinders issued on credit for a product — these LEAVE stock. */
export const creditFilledFor = (entry, productId) =>
  ((entry && entry.creditSales) || [])
    .filter(cs => cs.productId === productId)
    .reduce((s, cs) => s + num(cs.filledQty), 0);

/** Empty cylinders taken back at the time of a credit sale — these ENTER stock. */
export const creditEmptyFor = (entry, productId) =>
  ((entry && entry.creditSales) || [])
    .filter(cs => cs.productId === productId)
    .reduce((s, cs) => s + num(cs.emptyQty), 0);

/** Empty cylinders returned alongside a credit recovery — these ENTER stock. */
export const recoveryEmptyFor = (entry, productId) =>
  ((entry && entry.creditRecoveries) || [])
    .filter(cr => cr.productId === productId)
    .reduce((s, cr) => s + num(cr.emptyReturned), 0);

/* ── Connection-module cylinder movements ──
   entry.connectionMovements is [{ productId, filledOut, emptyIn }] per day,
   aggregated server-side from connection_events (never stored in
   daily_product_stock, so a re-save of the day cannot wipe them):
     filledOut — filled cylinders issued for new / additional-bottle
                 connections (LEAVE filled stock)
     emptyIn   — empty cylinders physically received back at surrender
                 (ENTER empty stock; cylinders penalised as missing are
                 NOT counted here — a missing cylinder is money, not stock)
   They are fed into the SAME two formulas below as every other movement.
   There is no second stock figure anywhere. */
export const connectionMovementFor = (entry, productId) =>
  ((entry && entry.connectionMovements) || []).find(m => m.productId === productId) || {};

/** Filled cylinders issued to customers through connections — these LEAVE stock. */
export const connectionFilledOutFor = (entry, productId) =>
  num(connectionMovementFor(entry, productId).filledOut);

/** Empty cylinders received back at surrender — these ENTER empty stock. */
export const connectionEmptyInFor = (entry, productId) =>
  num(connectionMovementFor(entry, productId).emptyIn);

/** Total filled cylinders leaving stock through every channel. */
export const outwardFilledFor = (entry, product) =>
  num(product.sell) + num(product.online) + num(product.sbc) + num(product.dbc)
  + creditFilledFor(entry, product.id)
  + connectionFilledOutFor(entry, product.id);

/**
 * CLOSING FULL-CYLINDER STOCK — the canonical formula.
 *   opening + received from plant
 *   − (cash + online + SBC + DBC + credit + connection issues)
 * The `shortage` field is deliberately excluded: it is a managerial
 * reminder that a discrepancy was seen, not a stock movement. Folding
 * it in here would hide the very thing it exists to surface.
 */
export const computeClosingStock = (entry, product) =>
  num(product.openingStock)
  + filledReceivedFor(entry, product.id)
  - outwardFilledFor(entry, product);

/**
 * Empty cylinders entering the godown on this day, from every source.
 * Note: Refill sales (cash sell + online) exchange an empty cylinder for a filled one.
 * SBC and DBC are new connection issues: a new filled bottle is issued, but NO empty
 * cylinder is received from the customer because it is a new connection.
 */
export const emptyInFor = (entry, product) =>
  num(product.sell) + num(product.online)
  + creditEmptyFor(entry, product.id)
  + recoveryEmptyFor(entry, product.id)
  + connectionEmptyInFor(entry, product.id);

/**
 * Filled cylinders issued through connections on days that have NO daily
 * entry, strictly after `afterDate` and strictly before `beforeDate`.
 * A connection can be registered at 10 am while the day's entry is only
 * saved at closing time. If an entry for that day is never saved, the
 * cylinder would otherwise vanish from the chain: the next blank entry
 * copies the last saved closing stock as its opening. This carries those
 * orphan issues forward so the chain still conserves cylinders.
 * Returns { [productId]: qty }.
 */
export const unrecordedConnectionIssues = (connectionsByDate, entries, afterDate, beforeDate, productList = PRODUCTS) => {
  const recorded = new Set((entries || []).map(e => e.date));
  const out = {};
  (productList || PRODUCTS).forEach(p => { out[p.id] = 0; });
  for (const [date, day] of Object.entries(connectionsByDate || {})) {
    if (recorded.has(date)) continue;
    if (afterDate && date <= afterDate) continue;
    if (beforeDate && date >= beforeDate) continue;
    for (const m of (day.connectionMovements || [])) {
      if (out[m.productId] !== undefined) out[m.productId] += num(m.filledOut);
    }
  }
  return out;
};

/**
 * Running empty-cylinder balance per product across ALL history strictly
 * before `beforeDate`. Returns a plain object keyed by product id.
 * Pure and side-effect free so it can be memoised by the caller — it is
 * O(days x products) and must never be run inside a render body directly.
 */
export const computeOpeningEmptyByProduct = (entries, beforeDate, productList = PRODUCTS) => {
  const prods = (productList || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const history = (entries || [])
    .filter(e => e.date < beforeDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out = {};
  for (const p of prods) {
    let running = 0;
    for (const e of history) {
      const prod = (e.products || []).find(x => x.id === p.id) || {};
      running += emptyInFor(e, { ...prod, id: p.id }) - emptyDespatchedFor(e, p.id);
    }
    out[p.id] = running;
  }
  return out;
};

/**
 * Closing empty-cylinder balance for EVERY recorded date, in one pass.
 * Returns { [date]: { [productId]: closingEmpty } }.
 * Use this instead of calling computeOpeningEmptyByProduct once per row —
 * that turns an O(n) job into an O(n^2) one.
 */
export const computeEmptyBalanceSeries = (entries, productList = PRODUCTS) => {
  const prods = (productList || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const ordered = [...(entries || [])].sort((a, b) => a.date.localeCompare(b.date));
  const running = {};
  prods.forEach(p => { running[p.id] = 0; });
  const series = {};
  for (const e of ordered) {
    const row = {};
    for (const p of prods) {
      const prod = (e.products || []).find(x => x.id === p.id) || {};
      running[p.id] += emptyInFor(e, { ...prod, id: p.id }) - emptyDespatchedFor(e, p.id);
      row[p.id] = running[p.id];
    }
    series[e.date] = row;
  }
  return series;
};

/**
 * Recompute every product's closing stock for an entry, returning a new
 * products array. Called immediately before persisting so that what is
 * saved is always exactly what the operator was shown.
 */
export const finaliseProducts = (entry) =>
  (entry.products || []).map(p => ({
    ...p,
    openingStock: num(p.openingStock),
    closingStock: computeClosingStock(entry, p),
  }));

/* ── calculations ── */
export const calcEntry = (e) => {
  const originalCashSales = (e.products||[]).reduce((s, p) => {
    const sell = num(p.sell);
    const sbc = num(p.sbc);
    const dbc = num(p.dbc);
    const rate = num(p.rate);
    const sbcRate = num(p.sbcRate);
    const dbcRate = num(p.dbcRate);
    return s + (sell * rate) + (sbc * sbcRate) + (dbc * dbcRate);
  }, 0);
  const totalOnlineSales = (e.products||[]).reduce((s, p) => {
    const online = num(p.online || 0);
    const rate = num(p.rate);
    return s + (online * rate);
  }, 0);
  const totalAccessorySales = (e.accessories||[]).filter(a=>a.sold).reduce((s, a) => s + num(a.qty) * num(a.rate), 0);
  const totalDelivery = Object.values(e.delivery||{}).reduce((s, val) => {
    if (typeof val === 'object' && val !== null) {
      return s + num(val.cash) + num(val.online);
    }
    return s + num(val);
  }, 0);
  const totalExpenses = (e.expenses||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalCheque = (e.chequeOnline||[]).reduce((s, x) => s + num(x.amt), 0);
  const originalCredit = (e.creditSales||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalVehicleExp = (e.vehicleExpenses||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalSalaryPayments = (e.salaryPayments||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalCreditRecoveries = (e.creditRecoveries||[]).reduce((s, x) => s + num(x.amt), 0);
  const totalOtherCashCredits = (e.otherCashCredits||[]).reduce((s, x) => s + num(x.amt), 0);

  /* Connection module — two same-day money events (see UPGRADE.md):
       connectionPayments  cash collected for an additional bottle.
         mode 'cash'   → ADDED to cashOnHand, exactly like otherCashCredits.
         mode 'online' → reported only; never touches physical cash, exactly
                         like chequeOnline.
       connectionRefunds   net cash handed back at surrender.
         → SUBTRACTED from cashOnHand, exactly like expenses. */
  const totalConnectionPaymentsCash = (
    (e.connectionPayments||[]).filter(x => x.mode === 'cash').reduce((s, x) => s + num(x.amt), 0) +
    (e.connectionNew||[]).filter(x => x.mode === 'cash').reduce((s, x) => s + num(x.amt), 0)
  );
  const totalConnectionPaymentsOnline = (
    (e.connectionPayments||[]).filter(x => x.mode === 'online').reduce((s, x) => s + num(x.amt), 0) +
    (e.connectionNew||[]).filter(x => x.mode === 'online').reduce((s, x) => s + num(x.amt), 0)
  );
  const totalConnectionRefunds = (e.connectionRefunds||[]).reduce((s, x) => s + num(x.amt), 0);

  // Identify same-day payments (recoveries received today for credit sales created today)
  const sameDayPayments = (e.creditRecoveries||[]).reduce((s, x) => {
    const isSameDay = x.ledgerId && e.date && x.ledgerId.startsWith(e.date + '-');
    return s + (isSameDay ? num(x.amt) : 0);
  }, 0);

  // Adjust Credit Sales by sameDayPayments so that cleared same-day credit is 0, keeping Cash Sales unadjusted to match physical cash
  const totalCashSales = originalCashSales;
  const totalCredit = Math.max(0, originalCredit - sameDayPayments);
  const totalSales = totalCashSales + totalOnlineSales;
  const originalSales = originalCashSales + totalOnlineSales;

  // Cash on Hand: Opening + Total Sales (Cash+Online) + Accessories + Credit Returns + Other Cash Credits
  //               + Connection Payments (cash only)
  //               - OnlineAutoDeduction - Expenses - Vehicle - Salary - Connection Refunds - BOB Bank
  const cashOnHand = num(e.openingCash) + totalSales + totalAccessorySales + totalCreditRecoveries + totalOtherCashCredits
    + totalConnectionPaymentsCash
    - totalOnlineSales - totalExpenses - totalVehicleExp - totalSalaryPayments - totalConnectionRefunds - num(e.bob);
  return { totalSales, totalCashSales, totalOnlineSales, totalAccessorySales, totalDelivery, totalExpenses, totalCheque, totalCredit, totalVehicleExp, totalSalaryPayments, totalCreditRecoveries, totalOtherCashCredits,
           totalConnectionPaymentsCash, totalConnectionPaymentsOnline, totalConnectionRefunds,
           cashOnHand, originalCashSales, originalSales, sameDayPayments, originalCredit };
};
/* Alias — the day-level cash calculation is referred to as computeDayCalcs in
   the module specification; calcEntry is the historical name used throughout
   the components. They are the same function. */
export const computeDayCalcs = calcEntry;

/* ── blank templates ── */
export const blankProduct = (pricesArr, lastEntry = null, openingAdjust = {}, productList = PRODUCTS) => {
  const cylinders = (productList || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const list = cylinders.length > 0 ? cylinders : PRODUCTS;
  return list.map((p) => {
    // Opening stock = previous day's Products Stock & Sales (In-Out Stock Master) Closing Stock
    // minus any connection cylinders issued on intervening days that have no
    // saved daily entry (see unrecordedConnectionIssues).
    let prevInOutFull = "";
    if (lastEntry) {
      const prevP = (lastEntry.products || []).find(x => x.id === p.id);
      if (prevP && prevP.closingStock !== "") prevInOutFull = num(prevP.closingStock) - num(openingAdjust[p.id]);
    }
    return {
      id: p.id, 
      openingStock: prevInOutFull, 
      rate: getCurrentRate(p.id, pricesArr, list), 
      sbcRate: getSbcRate(p.id, pricesArr, list),
      dbcRate: getDbcRate(p.id, pricesArr, list),
      sell: "", 
      online: "",
      sbc: "", 
      dbc: "", 
      closingStock: "",
      shortage: "",  // Reminder only — does NOT affect stock calculations
      remarks: ""
    };
  });
};
export const blankDelivery = (boysArr) => Object.fromEntries((boysArr || DEFAULT_BOYS).map((b) => [b, { cash: "", online: "" }]));
export const blankExpense = () => ({ id: uid(), desc: "", amt: "" });
export const blankCheque = () => ({ id: uid(), desc: "", amt: "" });
export const blankCredit = () => ({ id: uid(), customerName: "", productId: "p14", filledQty: "", emptyQty: "", amt: "", remarks: "" });
export const blankVehicleExp = () => ({ id: uid(), vehicleId: "", vehicleNo: "", expType: "Fuel", desc: "", amt: "" });
export const blankSalaryPayment = () => ({ id: uid(), employeeId: "", employeeName: "", amt: "", type: "Salary", notes: "", forMonth: monthStr() });
export const blankArrival = (productList = PRODUCTS) => {
  const cylinders = (productList || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const list = cylinders.length > 0 ? cylinders : PRODUCTS;
  return list.map(p => ({ productId: p.id, filledReceived: "", emptyReturned: "" }));
};
export const blankAccessory = (pricesArr, productList = PRODUCTS) => {
  const accs = (productList || []).filter(p => p.category === 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const list = accs.length > 0 ? accs : ACCESSORIES;
  return list.map(a => ({
    accessoryId: a.id,
    sold: false,
    qty: "",
    rate: getCurrentRate(a.id, pricesArr, productList)
  }));
};
export const blankOtherCashCredit = () => ({ id: uid(), desc: "", amt: "" });

export const blankGodownStock = (lastEntry = null, productList = PRODUCTS) => {
  const cylinders = (productList || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const list = cylinders.length > 0 ? cylinders : PRODUCTS;
  return list.map(p => {
    if (!lastEntry) return { productId: p.id, filled: "", empty: "" };
    // The godownStock values saved in the DB are already the end-of-day (closing) stock
    // the user physically entered. So today's opening = yesterday's closing directly.
    const g = (lastEntry.godownStock || []).find(x => x.productId === p.id) || {};
    return { 
      productId: p.id, 
      filled: g.filled !== undefined && g.filled !== "" ? g.filled : "", 
      empty: g.empty !== undefined && g.empty !== "" ? g.empty : "" 
    };
  });
};

/** Blank connection-module arrays for a day with no activity. */
export const blankConnectionMovements = (productList = PRODUCTS) => {
  const cylinders = (productList || PRODUCTS).filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const list = cylinders.length > 0 ? cylinders : PRODUCTS;
  return list.map(p => ({ productId: p.id, filledOut: 0, emptyIn: 0 }));
};

/**
 * A fresh entry for `opts.date` (default today).
 *   lastEntry            — the most recent SAVED entry strictly before that date;
 *                          its closing stock / cash-on-hand seed this day's opening.
 *   opts.connectionsByDate — the map returned by /api/load; that date's
 *                          connection payments / refunds / cylinder movements
 *                          are attached so calcEntry() and computeClosingStock()
 *                          see them even before the day is saved.
 *   opts.entries         — all saved entries, used to detect connection
 *                          activity on unsaved intervening days.
 *   opts.products        — dynamic cylinder products array from database.
 */
export const blankEntry = (pricesArr = [], boysArr = [], lastEntry = null, opts = {}) => {
  const date = opts.date || todayStr();
  const prods = (opts.products && opts.products.length > 0) ? opts.products : PRODUCTS;
  const cylinders = prods.filter(p => p.category !== 'accessory' && p.isActive !== 0 && p.is_active !== 0);
  const activeCyls = cylinders.length > 0 ? cylinders : PRODUCTS;
  const byDate = opts.connectionsByDate || {};
  const forDay = byDate[date] || {};
  const openingAdjust = lastEntry
    ? unrecordedConnectionIssues(byDate, opts.entries || [], lastEntry.date, date, activeCyls)
    : {};
  return {
    date,
    openingCash: lastEntry ? calcEntry(lastEntry).cashOnHand : "",
    bob: "",
    products: blankProduct(pricesArr, lastEntry, openingAdjust, activeCyls),
    delivery: blankDelivery(boysArr),
    expenses: [blankExpense()],
    chequeOnline: [blankCheque()],
    creditSales: [blankCredit()],
    vehicleExpenses: [blankVehicleExp()],
    salaryPayments: [blankSalaryPayment()],
    creditRecoveries: [],
    godownStock: blankGodownStock(lastEntry, activeCyls),
    hasArrival: false,
    arrivals: blankArrival(activeCyls),
    accessories: blankAccessory(pricesArr, prods),
    otherCashCredits: [blankOtherCashCredit()],
    connectionNew: forDay.connectionNew || [],
    connectionPayments: forDay.connectionPayments || [],
    connectionRefunds: forDay.connectionRefunds || [],
    connectionMovements: forDay.connectionMovements || blankConnectionMovements(activeCyls),
    // Surfaced in the UI so the operator knows opening stock was adjusted.
    unrecordedConnectionIssues: openingAdjust,
  };
};

/* ── CSV export (shared by the admin report tables) ── */
export const toCsv = (headers, rows) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\r\n");
};
export const downloadCsv = (filename, headers, rows) => {
  const blob = new Blob(["\ufeff" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* Human label for a product id (used by the Connections screens and reports). */
export const productLabel = (pid, productList = PRODUCTS) => {
  const list = (productList && productList.length > 0) ? productList : PRODUCTS;
  const match = list.find(p => p.id === pid) || PRODUCTS.find(p => p.id === pid);
  return match?.short || match?.label || pid;
};
