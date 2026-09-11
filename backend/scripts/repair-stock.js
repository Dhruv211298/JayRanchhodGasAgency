#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   repair-stock.js — recompute the full cylinder stock chain
   ────────────────────────────────────────────────────────────────
   WHY THIS EXISTS
   The daily entry screen displayed a closing stock that deducted
   credit-sale filled cylinders, but the figure actually written to
   the database did not. Because each day's closing stock becomes the
   next day's opening stock, every filled cylinder sold on credit
   silently reappeared in inventory the following day, and the error
   accumulated forward from the first credit sale ever recorded.

   WHAT IT DOES
   Replays every daily entry in date order and recomputes:

       closing = opening + filledReceived
                 - sell - online - sbc - dbc - creditFilled
                 - connectionFilledOut

   connectionFilledOut = filled cylinders issued to customers through the
   Connection module (new / additional bottle) on that date — read from
   connection_events. This mirrors computeClosingStock() in
   app/src/constants.js exactly; if that formula changes, change this too.

   The opening stock of the EARLIEST entry is trusted as the seed;
   every later entry's opening stock is taken from the recomputed
   closing stock of the entry before it. Shortage quantities are
   deliberately excluded — they are managerial reminders, not stock
   movements.

   SAFETY
   Report-only by default. Nothing is written unless you pass --apply,
   and when you do, all writes happen inside one transaction that is
   rolled back on any error.

   USAGE
       node scripts/repair-stock.js                  # dry run, full report
       node scripts/repair-stock.js --product p14    # limit to one product
       node scripts/repair-stock.js --from 2026-01-01
       node scripts/repair-stock.js --apply          # write the corrections
       node scripts/repair-stock.js --apply --yes    # skip the confirmation

   Reads the same DB_* environment variables as server.js.
════════════════════════════════════════════════════════════════ */
const readline = require('readline');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const APPLY = has('--apply');
const ASSUME_YES = has('--yes') || has('-y');
const ONLY_PRODUCT = valOf('--product');
const FROM_DATE = valOf('--from');

const num = (v) => parseFloat(v) || 0;

// The pool (and the mysql2 dependency) is created lazily so that the pure
// replayChain function below can be unit tested without a database driver.
let _pool = null;
const getPool = () => {
  if (!_pool) {
    const mysql = require('mysql2/promise');
    _pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      waitForConnections: true,
      connectionLimit: 4,
      dateStrings: true,
    });
  }
  return _pool;
};

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a); });
});

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

/* ────────────────────────────────────────────────────────────────
   replayChain — the actual repair algorithm, kept pure and exported
   so it can be unit tested without a database. Mirrors exactly the
   closing-stock formula in app/src/constants.js.
──────────────────────────────────────────────────────────────── */
function replayChain({ dates, products, stock, arrivals, credits, connIssued, key }) {
  connIssued = connIssued || new Map();
  const changes = [];
  const summary = {};

  for (const pid of products) {
    let carried = null; // recomputed closing stock of the previous entry
    let first = true;
    summary[pid] = { days: 0, changed: 0, maxDrift: 0, firstBadDate: null, finalDrift: 0 };

    for (const d of dates) {
      const row = stock.get(key(d, pid));
      if (!row) continue; // product not traded that day
      summary[pid].days++;

      // The first entry in range seeds the chain and keeps its stored opening.
      const opening = first ? num(row.opening_stock) : carried;
      first = false;

      const received = arrivals.get(key(d, pid)) || 0;
      const creditOut = credits.get(key(d, pid)) || 0;
      const connOut = connIssued.get(key(d, pid)) || 0;
      const out = num(row.sell_qty) + num(row.online_qty) + num(row.sbc_qty) + num(row.dbc_qty) + creditOut + connOut;
      const closing = opening + received - out;

      const oldOpening = num(row.opening_stock);
      const oldClosing = num(row.closing_stock);

      if (oldOpening !== opening || oldClosing !== closing) {
        const drift = Math.abs(oldClosing - closing);
        summary[pid].changed++;
        summary[pid].maxDrift = Math.max(summary[pid].maxDrift, drift);
        if (!summary[pid].firstBadDate) summary[pid].firstBadDate = d;
        changes.push({
          date: d, productId: pid,
          oldOpening, newOpening: opening,
          oldClosing, newClosing: closing,
          received, out, creditOut, connOut,
        });
      }
      summary[pid].finalDrift = closing - oldClosing;
      carried = closing;
    }
  }
  return { changes, summary };
}

module.exports = { replayChain };

// Exit here when loaded as a module by the test suite.
if (require.main !== module) return;

async function main() {
  console.log('');
  console.log('='.repeat(78));
  console.log('  STOCK CHAIN REPAIR  ' + (APPLY ? '[ APPLY — CHANGES WILL BE WRITTEN ]' : '[ DRY RUN — nothing will be written ]'));
  console.log('='.repeat(78));
  if (ONLY_PRODUCT) console.log('  Filtered to product: ' + ONLY_PRODUCT);
  if (FROM_DATE)     console.log('  Chain seeded from:   ' + FROM_DATE);
  console.log('');

  // ── Load every entry date in chronological order ──
  let dateSql = "SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS d FROM daily_entries";
  const dateParams = [];
  if (FROM_DATE) { dateSql += ' WHERE entry_date >= ?'; dateParams.push(FROM_DATE); }
  dateSql += ' ORDER BY entry_date ASC';
  const [dateRows] = await getPool().query(dateSql, dateParams);
  const dates = dateRows.map(r => r.d);

  if (dates.length === 0) { console.log('  No daily entries found. Nothing to do.\n'); return; }
  console.log(`  ${dates.length} daily entries from ${dates[0]} to ${dates[dates.length - 1]}\n`);

  // ── Load the movement data in three bulk queries ──
  const [stockRows] = await getPool().query(
    `SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, product_id,
            opening_stock, sell_qty, online_qty, sbc_qty, dbc_qty, closing_stock
     FROM daily_product_stock ORDER BY entry_date ASC`
  );
  const [arrivalRows] = await getPool().query(
    `SELECT DATE_FORMAT(va.entry_date, '%Y-%m-%d') AS d, va.product_id, va.filled_received,
            de.has_vehicle_arrival
     FROM vehicle_arrivals va
     JOIN daily_entries de ON de.entry_date = va.entry_date`
  );
  const [creditRows] = await getPool().query(
    `SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, COALESCE(product_id,'') AS product_id,
            COALESCE(filled_qty,0) AS filled_qty
     FROM credit_ledger`
  );

  const key = (d, p) => d + '|' + p;
  const arrivals = new Map();
  for (const r of arrivalRows) {
    if (!Number(r.has_vehicle_arrival)) continue; // arrivals only count when the day is flagged
    arrivals.set(key(r.d, r.product_id), num(r.filled_received));
  }
  const credits = new Map();
  for (const r of creditRows) {
    if (!r.product_id) continue;
    const k = key(r.d, r.product_id);
    credits.set(k, (credits.get(k) || 0) + num(r.filled_qty));
  }
  // Filled cylinders issued through the Connection module (table may not
  // exist on a database that has never booted the current server.js).
  const connIssued = new Map();
  try {
    const [connRows] = await getPool().query(
      `SELECT DATE_FORMAT(event_date, '%Y-%m-%d') AS d, product_id, SUM(cylinders_out) AS qty
         FROM connection_events
        WHERE cylinders_out > 0
        GROUP BY event_date, product_id`
    );
    for (const r of connRows) connIssued.set(key(r.d, r.product_id), num(r.qty));
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  const products = [...new Set(stockRows.map(r => r.product_id))]
    .filter(p => !ONLY_PRODUCT || p === ONLY_PRODUCT)
    .sort();
  if (products.length === 0) { console.log('  No matching product rows.\n'); return; }

  const stock = new Map();
  for (const r of stockRows) stock.set(key(r.d, r.product_id), r);

  // ── Replay the chain per product ──
  const { changes, summary } = replayChain({ dates, products, stock, arrivals, credits, connIssued, key });

  // ── Report ──
  if (changes.length === 0) {
    console.log('  No corrections needed — the stock chain is already consistent.\n');
    return;
  }

  console.log('  CHANGES BY DATE');
  console.log('  ' + '-'.repeat(76));
  console.log('  ' + pad('DATE', 12) + pad('PROD', 7) + padL('OPEN', 7) + padL('->', 4) + padL('NEW', 7) +
              padL('CLOSE', 9) + padL('->', 4) + padL('NEW', 7) + padL('CREDIT', 9) + padL('CONN', 6) + padL('DRIFT', 8));
  console.log('  ' + '-'.repeat(76));
  const shown = changes.slice(0, 200);
  for (const c of shown) {
    const drift = c.newClosing - c.oldClosing;
    console.log('  ' + pad(c.date, 12) + pad(c.productId, 7) +
      padL(c.oldOpening, 7) + padL('->', 4) + padL(c.newOpening, 7) +
      padL(c.oldClosing, 9) + padL('->', 4) + padL(c.newClosing, 7) +
      padL(c.creditOut || '-', 9) + padL(c.connOut || '-', 6) + padL((drift > 0 ? '+' : '') + drift, 8));
  }
  if (changes.length > shown.length) {
    console.log(`  ... and ${changes.length - shown.length} more rows (not shown)`);
  }

  console.log('');
  console.log('  SUMMARY BY PRODUCT');
  console.log('  ' + '-'.repeat(76));
  console.log('  ' + pad('PRODUCT', 10) + padL('DAYS', 7) + padL('CHANGED', 10) +
              padL('MAX DRIFT', 12) + padL('CURRENT DRIFT', 16) + '   FIRST WRONG DAY');
  console.log('  ' + '-'.repeat(76));
  for (const pid of products) {
    const s = summary[pid];
    if (!s.days) continue;
    console.log('  ' + pad(pid, 10) + padL(s.days, 7) + padL(s.changed, 10) +
      padL(s.maxDrift, 12) + padL((s.finalDrift > 0 ? '+' : '') + s.finalDrift, 16) +
      '   ' + (s.firstBadDate || '-'));
  }

  console.log('');
  console.log('  "CURRENT DRIFT" is how many cylinders the latest closing stock is out by.');
  console.log('  A negative value means the system has been over-stating stock on hand.');
  console.log('');

  if (!APPLY) {
    console.log('  ' + '='.repeat(74));
    console.log('  DRY RUN — nothing was written.');
    console.log('  Review the figures above. To write these corrections, re-run with:');
    console.log('      node scripts/repair-stock.js --apply');
    console.log('  Take a database backup first.');
    console.log('  ' + '='.repeat(74));
    console.log('');
    return;
  }

  // ── Apply ──
  if (!ASSUME_YES) {
    const a = await ask(`  Write ${changes.length} corrections to the database? Type "yes" to confirm: `);
    if (a.trim().toLowerCase() !== 'yes') { console.log('\n  Aborted. Nothing was written.\n'); return; }
  }

  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    for (const c of changes) {
      await conn.query(
        'UPDATE daily_product_stock SET opening_stock = ?, closing_stock = ? WHERE entry_date = ? AND product_id = ?',
        [c.newOpening, c.newClosing, c.date, c.productId]
      );
    }
    await conn.commit();
    console.log(`\n  DONE — ${changes.length} rows corrected and committed.`);
    console.log('  Reload the application to see the corrected figures.\n');
  } catch (e) {
    await conn.rollback();
    console.error('\n  FAILED — transaction rolled back, nothing was changed.');
    console.error('  ' + e.message + '\n');
    process.exitCode = 1;
  } finally {
    conn.release();
  }
}

main()
  .catch(e => { console.error('\nERROR:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => { if (_pool) _pool.end(); });
