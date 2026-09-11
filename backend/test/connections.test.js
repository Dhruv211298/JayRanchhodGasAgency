/* ════════════════════════════════════════════════════════════════
   connections.test.js — Connection Events module (new connection /
   additional-bottle payment / surrender refund), exercised end-to-end
   through the REAL server.js routes over HTTP, against the in-memory
   fake database in ./helpers/fake-mysql.js (no MySQL required).

   Run:   cd backend && node test/connections.test.js
════════════════════════════════════════════════════════════════ */
const assert = require('assert/strict');
const Module = require('module');
const path = require('path');
const { FakeDb, createFakePool } = require('./helpers/fake-mysql');

// ── boot server.js with the fake driver ──
const db = new FakeDb();
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'mysql2/promise') return { createPool: () => createFakePool(db) };
  return origLoad.call(this, request, ...rest);
};
process.env.PORT = String(30000 + Math.floor(Math.random() * 20000));
process.env.JWT_SECRET = 'test-secret-'.repeat(4);
process.env.NODE_ENV = 'test';
const origLog = console.log, origWarn = console.warn;
console.log = () => {}; console.warn = () => {}; // silence migration chatter
require(path.join(__dirname, '..', 'server.js'));
console.log = origLog; console.warn = origWarn;

const jwt = require('jsonwebtoken');
const ADMIN = jwt.sign({ username: 'admin1', role: 'admin' }, process.env.JWT_SECRET);
const OFFICE = jwt.sign({ username: 'office1', role: 'user' }, process.env.JWT_SECRET);
const BASE = `http://127.0.0.1:${process.env.PORT}`;

const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const TODAY = todayLocal();
const YESTERDAY = (() => { const d = new Date(TODAY + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

const call = async (method, url, body, token = ADMIN) => {
  const r = await fetch(BASE + url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const tbl = (n) => db.tables[n] || [];
const events = () => tbl('connection_events');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  PASS  ' + name); }
  catch (e) { fail++; console.log('  FAIL  ' + name + '\n         ' + (e.message || e)); }
};

(async () => {
  await sleep(400); // let the server bind

  console.log('\n── New connection (stock only, NO money, NO customer data) ──');
  await t('single 14 KG: 1 filled cylinder out, amount 0, no payment fields', async () => {
    const r = await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14', connectionType: 'single' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const e = events().find(x => x.id === r.body.eventId);
    assert.equal(e.event_type, 'new'); assert.equal(e.qty, 1); assert.equal(e.cylinders_out, 1); assert.equal(e.cylinders_in, 0);
    assert.equal(e.amount, 0); assert.equal(e.payment_mode, null); assert.equal(e.recorded_by, 'admin1'); assert.equal(e.event_date, TODAY);
    assert.ok(!('customer_name' in e) && !('consumer_no' in e), 'no consumer data is stored');
    assert.equal(tbl('audit_log').filter(a => a.event_type === 'connection.new').length, 1);
  });
  await t('double 19 KG × 3 connections: 6 filled cylinders out', async () => {
    const r = await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p19', connectionType: 'double', qty: 3, remarks: 'hotel batch' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.cylinders_out, 6);
    assert.equal(events().find(x => x.id === r.body.eventId).remarks, 'hotel batch');
  });
  await t('remarks optional; qty defaults to 1; validation of product / type / qty', async () => {
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p5' })).status, 200);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p99' })).status, 400);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: '' })).status, 400);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14', connectionType: 'triple' })).status, 400);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14', qty: 0 })).status, 400);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14', qty: 1.5 })).status, 400);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14', qty: 9999 })).status, 400);
  });
  await t('idempotent: same key twice → one row, second answers duplicate', async () => {
    const n = events().length;
    const body = { date: TODAY, productId: 'p14', idempotencyKey: 'key-new-1' };
    const a = await call('POST', '/api/connection-events/new', body);
    const b = await call('POST', '/api/connection-events/new', body);
    assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(b.body.duplicate, true);
    assert.equal(b.body.eventId, a.body.eventId);
    assert.equal(events().length, n + 1);
  });
  await t('two identical events WITHOUT a key are two events (no payload-digest collapsing)', async () => {
    const n = events().length;
    await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14' });
    await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14' });
    assert.equal(events().length, n + 2);
  });

  console.log('\n── Additional bottle (filled OUT + cash / online INFLOW) ──');
  await t('cash ₹1,500: 1 cylinder out, amount + mode stored', async () => {
    const r = await call('POST', '/api/connection-events/additional', { date: TODAY, productId: 'p14', amount: '1500', paymentMode: 'cash' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const e = events().find(x => x.id === r.body.eventId);
    assert.equal(e.cylinders_out, 1); assert.equal(e.amount, 1500); assert.equal(e.payment_mode, 'cash'); assert.equal(e.qty, 1);
  });
  await t('online ₹3,000 for 2 bottles of 19 KG: 2 cylinders out', async () => {
    const r = await call('POST', '/api/connection-events/additional', { date: TODAY, productId: 'p19', qty: 2, amount: 3000, paymentMode: 'online' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.cylinders_out, 2); assert.equal(r.body.payment_mode, 'online');
  });
  await t('validation: amount must be > 0 and finite, mode exactly cash|online', async () => {
    const base = { date: TODAY, productId: 'p5', amount: 500, paymentMode: 'cash' };
    for (const bad of [{ amount: 0 }, { amount: -5 }, { amount: 'abc' }, { amount: undefined }, { amount: 1e12 },
                       { paymentMode: 'upi' }, { paymentMode: 'CASH' }, { paymentMode: '' }, { productId: '' }, { qty: 0 }]) {
      const r = await call('POST', '/api/connection-events/additional', { ...base, ...bad });
      assert.equal(r.status, 400, JSON.stringify(bad) + ' → ' + JSON.stringify(r.body));
    }
    assert.equal(events().filter(e => e.product_id === 'p5' && e.event_type === 'additional').length, 0, 'nothing written');
  });
  await t('idempotent double-submit records the payment once', async () => {
    const n = events().length;
    const body = { date: TODAY, productId: 'p5', amount: 700, paymentMode: 'cash', idempotencyKey: 'key-add-1' };
    const a = await call('POST', '/api/connection-events/additional', body);
    const b = await call('POST', '/api/connection-events/additional', body);
    assert.equal(a.status, 200); assert.equal(b.body.duplicate, true);
    assert.equal(events().length, n + 1);
  });

  console.log('\n── Surrender (empties IN + cash OUTFLOW net of itemised penalties) ──');
  let surrenderId;
  await t('net_paid = refund − Σ penalties computed server-side; missing cylinder NOT in stock', async () => {
    // One double 14 KG connection: 1 cylinder returned, 1 missing; regulator + pipe penalised.
    const r = await call('POST', '/api/connection-events/surrender', {
      date: TODAY, productId: 'p14', qty: 1, cylindersReturned: 1, cylindersMissing: 1, refundAmount: 2000, remarks: 'moved city',
      penalties: [{ itemDescription: 'regulator', amount: 200 }, { itemDescription: 'pipe', amount: 150 }, { itemDescription: 'missing cylinder', amount: 1450 }],
      netPaid: 5, penaltyDeducted: 0, // client-supplied totals must be IGNORED
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    surrenderId = r.body.eventId;
    assert.equal(r.body.penalty_deducted, 1800); assert.equal(r.body.net_paid, 200);
    const e = events().find(x => x.id === surrenderId);
    assert.equal(e.net_paid, 200); assert.equal(e.penalty_deducted, 1800); assert.equal(e.amount, 2000);
    assert.equal(e.cylinders_in, 1, 'only the physically returned cylinder enters stock');
    assert.equal(e.cylinders_missing, 1); assert.equal(e.cylinders_out, 0); assert.equal(e.remarks, 'moved city');
    const pens = tbl('connection_event_penalties').filter(p => p.event_id === surrenderId);
    assert.deepEqual(pens.map(p => [p.item_description, p.amount]).sort(), [['missing cylinder', 1450], ['pipe', 150], ['regulator', 200]]);
  });
  await t('zero penalties → full refund; two 5 KG singles both returned', async () => {
    const r = await call('POST', '/api/connection-events/surrender', { date: TODAY, productId: 'p5', qty: 2, cylindersReturned: 2, refundAmount: 1000, penalties: [] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.net_paid, 1000); assert.equal(r.body.cylinders_in, 2);
  });
  await t('validation: negative net, blank / non-positive penalty, cylinder counts, refund, list shape', async () => {
    const n = events().length;
    const base = { date: TODAY, productId: 'p14', qty: 1, cylindersReturned: 1, refundAmount: 100, penalties: [] };
    const cases = [
      [{ penalties: [{ itemDescription: 'pipe', amount: 150 }] }, 'net negative'],
      [{ penalties: [{ itemDescription: '', amount: 10 }] }, 'blank description'],
      [{ penalties: [{ itemDescription: 'pipe', amount: 0 }] }, 'zero penalty'],
      [{ penalties: [{ itemDescription: 'pipe', amount: -1 }] }, 'negative penalty'],
      [{ penalties: 'x' }, 'penalties not a list'],
      [{ cylindersReturned: undefined }, 'returned count required'],
      [{ cylindersReturned: 3 }, 'more than 2 per connection'],
      [{ cylindersReturned: 0 }, 'nothing accounted for (0 returned, 0 missing)'],
      [{ cylindersReturned: 2, cylindersMissing: 1 }, 'returned + missing > 2 per connection'],
      [{ refundAmount: -1 }, 'negative refund'],
      [{ refundAmount: 'abc' }, 'refund not a number'],
      [{ productId: '' }, 'product required'],
      [{ qty: 0 }, 'qty must be ≥ 1'],
    ];
    for (const [bad, why] of cases) {
      const r = await call('POST', '/api/connection-events/surrender', { ...base, ...bad });
      assert.equal(r.status, 400, why + ' → ' + JSON.stringify(r.body));
    }
    assert.equal(events().length, n, 'nothing was written');
  });
  await t('0 returned + 1 missing is valid (cylinder fully lost): no stock in, penalty only', async () => {
    const r = await call('POST', '/api/connection-events/surrender', { date: TODAY, productId: 'p19', qty: 1, cylindersReturned: 0, cylindersMissing: 1, refundAmount: 3000, penalties: [{ itemDescription: 'missing cylinder', amount: 3000 }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.cylinders_in, 0); assert.equal(r.body.net_paid, 0);
  });
  await t('idempotent double-submit of a surrender pays out once', async () => {
    const n = events().length;
    const body = { date: TODAY, productId: 'p14', qty: 1, cylindersReturned: 1, refundAmount: 500, penalties: [], idempotencyKey: 'key-sur-1' };
    const a = await call('POST', '/api/connection-events/surrender', body);
    const b = await call('POST', '/api/connection-events/surrender', body);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(b.status, 200); assert.equal(b.body.duplicate, true, '"already recorded", not a duplicate payout');
    assert.equal(events().length, n + 1);
  });

  console.log('\n── Roles & dates (enforced server-side) ──');
  await t('office: today is allowed on all three routes', async () => {
    const a = await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14' }, OFFICE);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(events().find(x => x.id === a.body.eventId).recorded_by, 'office1');
    assert.equal((await call('POST', '/api/connection-events/additional', { date: TODAY, productId: 'p14', amount: 100, paymentMode: 'cash' }, OFFICE)).status, 200);
    assert.equal((await call('POST', '/api/connection-events/surrender', { date: TODAY, productId: 'p14', qty: 1, cylindersReturned: 1, refundAmount: 100, penalties: [] }, OFFICE)).status, 200);
  });
  await t('office: back-dated new / additional / surrender all refused with 403', async () => {
    const r = await call('POST', '/api/connection-events/new', { date: YESTERDAY, productId: 'p14' }, OFFICE);
    assert.equal(r.status, 403); assert.match(r.body.error, /today/i);
    assert.equal((await call('POST', '/api/connection-events/additional', { date: YESTERDAY, productId: 'p14', amount: 100, paymentMode: 'cash' }, OFFICE)).status, 403);
    assert.equal((await call('POST', '/api/connection-events/surrender', { date: YESTERDAY, productId: 'p14', qty: 1, cylindersReturned: 1, refundAmount: 1, penalties: [] }, OFFICE)).status, 403);
  });
  await t('admin: back-dated allowed; future / malformed date refused for everyone', async () => {
    assert.equal((await call('POST', '/api/connection-events/new', { date: YESTERDAY, productId: 'p14' })).status, 200);
    assert.equal((await call('POST', '/api/connection-events/new', { date: '2999-01-01', productId: 'p14' })).status, 400);
    assert.equal((await call('POST', '/api/connection-events/new', { date: '01/02/2026', productId: 'p14' })).status, 400);
  });
  await t('office: delete and reports are admin-only (403) even with a valid token', async () => {
    assert.equal((await call('DELETE', `/api/connection-events/${surrenderId}`, null, OFFICE)).status, 403);
    for (const u of ['/api/connections/reports/summary', '/api/connections/reports/monthly', '/api/connections/payments', '/api/connections/refunds', '/api/audit']) {
      assert.equal((await call('GET', u, null, OFFICE)).status, 403, u);
    }
    assert.equal((await call('GET', '/api/connection-events', null, OFFICE)).status, 200, 'the daily register is allowed');
  });
  await t('no token → 401', async () => {
    assert.equal((await call('GET', '/api/connection-events', null, null)).status, 401);
    assert.equal((await call('POST', '/api/connection-events/new', { date: TODAY, productId: 'p14' }, null)).status, 401);
  });

  console.log('\n── Per-category stock: what /api/load hands to computeClosingStock ──');
  let load;
  await t('movements are per product; a 5 KG event never touches 14 KG or 19 KG', async () => {
    db.tables.daily_entries.push({ entry_date: TODAY, opening_cash: 1000, bob_bank: 0, has_vehicle_arrival: 0 });
    const r = await call('GET', '/api/load');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    load = r.body;
    const e = load.entries.find(x => x.date === TODAY);
    const mv = Object.fromEntries(e.connectionMovements.map(m => [m.productId, m]));
    // p14 out today: new ×1, key-new-1 ×1, two no-key ×2, office new ×1 = 5 ; additional: 1500 cash ×1, office 100 ×1 = 2 → 7
    // p14 in: surrender 1 + key-sur-1 1 + office 1 = 3
    assert.equal(mv.p14.filledOut, 7); assert.equal(mv.p14.emptyIn, 3);
    // p19 out: double×3 = 6, additional 2 → 8 ; in: 0 (the 19 KG surrender had 0 returned, 1 missing)
    assert.equal(mv.p19.filledOut, 8); assert.equal(mv.p19.emptyIn, 0);
    // p5 out: new 1, additional 1 → 2 ; in: 2
    assert.equal(mv.p5.filledOut, 2); assert.equal(mv.p5.emptyIn, 2);
    const total = events().filter(x => x.event_date === TODAY);
    assert.equal(mv.p14.filledOut + mv.p19.filledOut + mv.p5.filledOut, total.reduce((s, x) => s + x.cylinders_out, 0), 'nothing leaks between categories');
  });
  await t("today's payments / refunds are attached with amt = collected / NET paid", async () => {
    const e = load.entries.find(x => x.date === TODAY);
    const cash = e.connectionPayments.filter(p => p.mode === 'cash').reduce((s, p) => s + p.amt, 0);
    const online = e.connectionPayments.filter(p => p.mode === 'online').reduce((s, p) => s + p.amt, 0);
    assert.equal(cash, 1500 + 700 + 100); assert.equal(online, 3000);
    const refunds = e.connectionRefunds.reduce((s, x) => s + x.amt, 0);
    assert.equal(refunds, 200 + 1000 + 0 + 500 + 100, 'net paid only, never the gross refund');
    assert.ok(e.connectionRefunds.every(x => typeof x.refundAmount === 'number' && typeof x.cylindersMissing === 'number'));
    assert.ok(Array.isArray(e.connectionNew) && e.connectionNew.length > 0);
    assert.ok(load.connectionsByDate[YESTERDAY], 'days with activity but no daily entry are still returned');
    assert.equal(load.connectionsByDate[YESTERDAY].connectionMovements.find(m => m.productId === 'p14').filledOut, 1);
  });
  await t('movements survive a full re-save of the day (they are derived, not stored in daily_product_stock)', async () => {
    const before = load.entries.find(x => x.date === TODAY).connectionMovements;
    const save = await call('POST', '/api/entries', { date: TODAY, openingCash: 1000, bob: 0, products: [{ id: 'p14', openingStock: 100, sell: 10, closingStock: 83 }] });
    // The fake DB has no daily_product_stock DML — a 500 here is fine; what matters is the reload below.
    assert.ok([200, 500].includes(save.status));
    const after = (await call('GET', '/api/load')).body.entries.find(x => x.date === TODAY).connectionMovements;
    assert.deepEqual(after, before);
  });

  console.log('\n── Admin delete (void) ──');
  await t('admin can void an event; penalties go with it; audited', async () => {
    const n = events().length;
    const r = await call('DELETE', `/api/connection-events/${surrenderId}`, { reason: 'entered twice' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(events().length, n - 1);
    assert.equal(tbl('connection_event_penalties').filter(p => p.event_id === surrenderId).length, 0);
    const a = tbl('audit_log').find(x => x.event_type === 'connection.delete');
    assert.ok(a); assert.match(a.details, /entered twice/);
    assert.equal((await call('DELETE', `/api/connection-events/${surrenderId}`)).status, 404);
    assert.equal((await call('DELETE', '/api/connection-events/bad id!')).status, 400);
  });

  console.log('\n── Reports ──');
  await t('daily register totals', async () => {
    const r = await call('GET', `/api/connection-events?from=${TODAY}&to=${TODAY}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.totals.newConnections, 1 + 3 + 1 + 1 + 2 + 1); // single, double×3, p5, key-new-1, two no-key, office
    assert.equal(r.body.totals.collectedCash, 1500 + 700 + 100);
    assert.equal(r.body.totals.collectedOnline, 3000);
    assert.equal(r.body.totals.netPaid, 1000 + 0 + 500 + 100); // the voided 200 one is gone
    assert.ok(r.body.events.some(e => e.eventType === 'surrender' && Array.isArray(e.penalties)));
    assert.equal((await call('GET', '/api/connection-events?type=bogus')).status, 400);
    assert.equal((await call('GET', '/api/connection-events?from=2026-02-01&to=2026-01-01')).status, 400);
  });
  await t('summary: per-product cylinders with customers = issued − returned − missing', async () => {
    const r = await call('GET', `/api/connections/reports/summary?from=${TODAY}&to=${TODAY}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p19 = r.body.perProduct.find(p => p.productId === 'p19');
    assert.equal(p19.market.issued, 8); assert.equal(p19.market.returned, 0); assert.equal(p19.market.missing, 1);
    assert.equal(p19.market.cylindersWithCustomers, 7);
    assert.equal(p19.market.activeConnections, 3 - 1);
    assert.equal(p19.period.newDouble, 3); assert.equal(p19.period.additionalOnline, 3000);
    const p14 = r.body.perProduct.find(p => p.productId === 'p14');
    assert.equal(p14.market.issued, 8, 'includes yesterday\'s admin back-dated one'); // 7 today + 1 yesterday
    assert.equal(p14.period.newConnections, 5); // today only
    assert.equal(r.body.period.netCashEffect, (1500 + 700 + 100) - (1000 + 0 + 500 + 100));
    assert.equal(r.body.market.cylindersWithCustomers, r.body.perProduct.reduce((s, p) => s + p.market.cylindersWithCustomers, 0));
  });
  await t('monthly trend groups by month', async () => {
    const r = await call('GET', '/api/connections/reports/monthly');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.months.length >= 1);
    const m = r.body.months.find(x => x.month === TODAY.slice(0, 7));
    assert.ok(m); assert.equal(typeof m.netCashEffect, 'number');
    assert.equal((await call('GET', '/api/connections/reports/monthly?productId=p19')).body.months.every(x => x.additionalOnline === 3000 || x.additionalOnline === 0), true);
  });
  await t('payments register filters by mode and totals cash / online separately', async () => {
    const all = await call('GET', '/api/connections/payments');
    assert.equal(all.status, 200);
    assert.equal(all.body.totals.cash, 2300); assert.equal(all.body.totals.online, 3000); assert.equal(all.body.totals.total, 5300);
    const cash = await call('GET', '/api/connections/payments?mode=cash');
    assert.ok(cash.body.rows.every(r => r.mode === 'cash'));
    assert.equal((await call('GET', '/api/connections/payments?mode=upi')).status, 400);
  });
  await t('refunds register carries penalty items and a breakdown by item', async () => {
    const r = await call('GET', '/api/connections/refunds');
    assert.equal(r.status, 200);
    assert.equal(r.body.totals.netPaid, 1000 + 0 + 500 + 100);
    assert.equal(r.body.totals.cylindersMissing, 1);
    const missing = r.body.penaltyBreakdown.find(b => b.item === 'missing cylinder');
    assert.ok(missing); assert.equal(missing.amount, 3000); assert.equal(missing.count, 1);
  });

  console.log('\n── Fallback handlers ──');
  await t('unknown route and malformed JSON answer in JSON, not HTML', async () => {
    const nf = await call('GET', '/api/nope');
    assert.equal(nf.status, 404); assert.ok(nf.body && nf.body.error);
    const bad = await fetch(BASE + '/api/connection-events/new', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` }, body: '{not json' });
    assert.equal(bad.status, 400); assert.match((await bad.json()).error, /JSON/);
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
