/* ════════════════════════════════════════════════════════════════
   fake-mysql.js — a tiny in-memory stand-in for mysql2/promise
   ────────────────────────────────────────────────────────────────
   Understands only the SQL shapes server.js actually issues:
     • INSERT INTO t (cols) VALUES (?, 'lit', …)   and bulk  VALUES ?
     • SELECT cols | aggregates FROM t [WHERE …] [GROUP BY …]
       [ORDER BY …] [LIMIT n] [FOR UPDATE]
         cols:  col, col AS a, DATE_FORMAT(col,'…') AS a, COALESCE(col,'') AS a,
                COUNT(*) AS a, SUM(col) AS a,
                SUM(CASE WHEN col = 'x' THEN col2 ELSE 0 END) AS a
         where: col = ? | col = 'lit' | col >= ? | col <= ? |
                col BETWEEN ? AND ? | col IN (?) | 1=1   joined by AND
     • UPDATE t SET a = ?, b = 'lit' WHERE …
     • DELETE FROM t WHERE …
     • the JOIN queries used by /api/load and the reports (return [] / the
       explicit special cases below)
     • SHOW COLUMNS / SHOW INDEX / SHOW TABLES / CREATE / ALTER / DROP
   Enforces the UNIQUE keys that matter for the tests (idempotency) by
   throwing ER_DUP_ENTRY exactly like the driver. Transactions are
   snapshot/restore so rollback really undoes writes. Anything else throws
   loudly so a new query shape cannot pass silently.
════════════════════════════════════════════════════════════════ */
const UNIQUE = {
  audit_log: [['idempotency_key', 'uniq_audit_idem']],
  connection_events: [['idempotency_key', 'uniq_cev_idem']],
};

function dupError(keyName, value) {
  const e = new Error(`Duplicate entry '${value}' for key 'x.${keyName}'`);
  e.code = 'ER_DUP_ENTRY';
  return e;
}

class FakeDb {
  constructor() {
    this.tables = {
      products: [{ id: 'p14' }, { id: 'p19' }, { id: 'p5' }],
      users: [], daily_entries: [], daily_product_stock: [], godown_stock: [],
      connection_events: [], connection_event_penalties: [], audit_log: [],
    };
    this.log = [];
  }
  t(name) {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }
  snapshot() { return JSON.parse(JSON.stringify(this.tables)); }
  restore(s) { this.tables = s; }

  query(sqlRaw, params = []) {
    const sql = String(sqlRaw).replace(/\s+/g, ' ').trim();
    this.log.push(sql);
    let m;

    // ── DDL / migrations ──
    if (/^SHOW COLUMNS/i.test(sql)) return [[{ Field: 'x', Null: 'YES' }]];
    if (/^SHOW INDEX/i.test(sql)) return [[{}]];
    if (/^SHOW TABLES LIKE/i.test(sql)) return [this.tables[params[0]] && this.tables[params[0]].__legacy ? [{}] : []];
    if (/^(CREATE TABLE|ALTER TABLE|DROP TABLE)/i.test(sql)) return [{ affectedRows: 0 }];
    if (/^UPDATE users SET password_reset_required/i.test(sql)) return [{ affectedRows: 0 }];
    if (/COUNT\(\*\) AS n FROM users/i.test(sql)) return [[{ n: 0 }]];

    // ── /api/load specials ──
    if (/^SELECT DATE_FORMAT\(entry_date, '%Y-%m-%d'\) as date, opening_cash/i.test(sql)) {
      return [this.t('daily_entries').map(e => ({ date: e.entry_date, openingCash: e.opening_cash, bob: e.bob_bank, hasArrival: e.has_vehicle_arrival }))];
    }
    // Report cross-check joins (latest stock / godown) — no data in these tests.
    if (/JOIN \(SELECT product_id, MAX\(entry_date\)/i.test(sql)) return [[]];
    // Every other /api/load SELECT (prices, employees, ledger …) has no data in these tests.
    if (/^SELECT .* FROM (price_history|commission_history|employees|vehicles|credit_ledger|credit_payments p|daily_product_stock|daily_deliveries|daily_expenses|daily_cheque_online|daily_vehicle_expenses|employee_payments|godown_stock|vehicle_arrivals|daily_accessory_sales|daily_other_cash_credits)\b/i.test(sql) && !/WHERE/i.test(sql)) {
      return [[]];
    }

    // ── INSERT ──
    if ((m = sql.match(/^INSERT INTO (\w+) \(([^)]+)\) VALUES (.+)$/i))) {
      const table = m[1];
      const cols = m[2].split(',').map(s => s.trim());
      let rows;
      if (m[3].trim() === '?') {
        rows = params[0].map(vals => Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
      } else {
        const tokens = m[3].replace(/^\(|\)$/g, '').split(',').map(s => s.trim());
        let pi = 0;
        const row = {};
        tokens.forEach((tok, i) => { row[cols[i]] = tok === '?' ? params[pi++] : (tok === 'NULL' ? null : tok.replace(/^'|'$/g, '')); });
        rows = [row];
      }
      for (const row of rows) {
        for (const [col, keyName] of (UNIQUE[table] || [])) {
          if (row[col] !== null && row[col] !== undefined && this.t(table).some(r => r[col] === row[col])) throw dupError(keyName, row[col]);
        }
        if (row.created_at === undefined) row.created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
        this.t(table).push({ ...row });
      }
      return [{ affectedRows: rows.length }];
    }

    // ── SELECT (single table, optional GROUP BY) ──
    if (/^SELECT /i.test(sql)) {
      let rest = sql.replace(/ FOR UPDATE$/i, '');
      let limit = null;
      if ((m = rest.match(/ LIMIT (\?|\d+)$/i))) { limit = m[1] === '?' ? Number(params[params.length - 1]) : Number(m[1]); rest = rest.slice(0, m.index); }
      rest = rest.replace(/ ORDER BY .+$/i, '');
      let groupBy = null;
      if ((m = rest.match(/ GROUP BY (.+)$/i))) { groupBy = m[1].split(/,(?![^(]*\))/).map(s => s.trim()); rest = rest.slice(0, m.index); }
      const sm = rest.match(/^SELECT (.+?) FROM (\w+)(?: (\w+))?(?: WHERE (.+))?$/i);
      if (!sm) throw new Error('fake-mysql: unsupported SELECT: ' + sql);
      const [, colsRaw, table, , whereRaw] = sm;
      const usedParams = { i: 0 };
      let rows = this.t(table).filter(r => this.matchWhere(r, whereRaw, params, usedParams));
      const cols = this.parseCols(colsRaw);
      const project = (group) => Object.fromEntries(cols.map(c => [c.as, c.fn(group)]));
      let out;
      if (cols[0] && cols[0].star) {
        out = rows.map(r => ({ ...r }));
      } else if (groupBy) {
        const keyOf = (r) => groupBy.map(g => this.evalExpr(g, r)).join('|');
        const groups = new Map();
        for (const r of rows) { const k = keyOf(r); (groups.get(k) || groups.set(k, []).get(k)).push(r); }
        out = [...groups.values()].map(project);
      } else if (cols.some(c => c.agg)) {
        out = [project(rows)];
      } else {
        out = rows.map(r => project([r]));
      }
      if (limit !== null) out = out.slice(0, limit);
      return [out];
    }

    // ── UPDATE ──
    if ((m = sql.match(/^UPDATE (\w+) SET (.+) WHERE (.+)$/i))) {
      const [, table, setRaw, whereRaw] = m;
      const assigns = setRaw.split(/,(?![^(]*\))/).map(s => s.trim());
      const setParamCount = assigns.reduce((n, a) => n + (a.split('?').length - 1), 0);
      const setParams = params.slice(0, setParamCount);
      const whereParams = params.slice(setParamCount);
      let n = 0;
      for (const r of this.t(table)) {
        if (!this.matchWhere(r, whereRaw, whereParams, { i: 0 })) continue;
        let pi = 0;
        for (const a of assigns) {
          let am;
          if ((am = a.match(/^(\w+) = \?$/))) r[am[1]] = setParams[pi++];
          else if ((am = a.match(/^(\w+) = '([^']*)'$/))) r[am[1]] = am[2];
          else throw new Error('fake-mysql: unsupported SET clause: ' + a);
        }
        n++;
      }
      return [{ affectedRows: n }];
    }

    // ── DELETE ──
    if ((m = sql.match(/^DELETE FROM (\w+) WHERE (.+)$/i))) {
      const before = this.t(m[1]).length;
      this.tables[m[1]] = this.t(m[1]).filter(r => !this.matchWhere(r, m[2], params, { i: 0 }));
      return [{ affectedRows: before - this.tables[m[1]].length }];
    }

    throw new Error('fake-mysql: unsupported SQL: ' + sql);
  }

  /* Evaluate a scalar expression against one row. */
  evalExpr(expr, r) {
    let m;
    expr = expr.trim();
    if ((m = expr.match(/^DATE_FORMAT\((\w+), '([^']+)'\)$/i))) {
      const v = r[m[1]] == null ? null : String(r[m[1]]);
      if (v === null) return null;
      if (m[2] === '%Y-%m') return v.slice(0, 7);
      if (m[2] === '%Y-%m-%d') return v.slice(0, 10);
      return v;
    }
    if ((m = expr.match(/^COALESCE\((\w+), '([^']*)'\)$/i))) return r[m[1]] == null ? m[2] : r[m[1]];
    if (/^\w+$/.test(expr)) return r[expr] === undefined ? null : r[expr];
    throw new Error('fake-mysql: unsupported expression: ' + expr);
  }

  /* Parse the select list into [{ as, fn(rowsOfGroup) → value, agg }]. */
  parseCols(colsRaw) {
    if (colsRaw.trim() === '*') return [{ as: '*', fn: (g) => g[0], agg: false, star: true }];
    const parts = colsRaw.split(/,(?![^(]*\))/).map(s => s.trim());
    const cols = [];
    for (const p of parts) {
      let m;
      if ((m = p.match(/^COUNT\(\*\) AS (\w+)$/i))) cols.push({ as: m[1], agg: true, fn: g => g.length });
      else if ((m = p.match(/^SUM\((\w+)\) AS (\w+)$/i))) { const c = m[1]; cols.push({ as: m[2], agg: true, fn: g => g.reduce((s, r) => s + Number(r[c] || 0), 0) }); }
      else if ((m = p.match(/^SUM\(CASE WHEN (\w+) = '([^']*)' THEN (\w+) ELSE 0 END\) AS (\w+)$/i))) {
        const [, cc, cv, sc, as] = m;
        cols.push({ as, agg: true, fn: g => g.reduce((s, r) => s + (String(r[cc]) === cv ? Number(r[sc] || 0) : 0), 0) });
      }
      else if ((m = p.match(/^(.+?) AS (\w+)$/i))) { const e = m[1]; cols.push({ as: m[2], agg: false, fn: g => this.evalExpr(e, g[0]) }); }
      else cols.push({ as: p, agg: false, fn: g => this.evalExpr(p, g[0]) });
    }
    // A projection with `*` returns whole rows.
    return cols;
  }

  matchWhere(row, whereRaw, params, used) {
    if (!whereRaw) return true;
    // BETWEEN contains AND — tokenise it first.
    const conds = whereRaw.replace(/BETWEEN \? AND \?/gi, 'BETWEEN_PARAMS').split(/ AND /i);
    let pi = used.i;
    let ok = true;
    for (const raw of conds) {
      const cond = raw.trim();
      let cm;
      if (cond === '1=1') continue;
      if ((cm = cond.match(/^(\w+) BETWEEN_PARAMS$/))) { const lo = params[pi++], hi = params[pi++]; if (!(String(row[cm[1]]) >= lo && String(row[cm[1]]) <= hi)) ok = false; }
      else if ((cm = cond.match(/^(\w+) = \?$/))) { if (String(row[cm[1]]) !== String(params[pi++])) ok = false; }
      else if ((cm = cond.match(/^(\w+) >= \?$/))) { if (!(String(row[cm[1]]) >= String(params[pi++]))) ok = false; }
      else if ((cm = cond.match(/^(\w+) <= \?$/))) { if (!(String(row[cm[1]]) <= String(params[pi++]))) ok = false; }
      else if ((cm = cond.match(/^(\w+) IN \(\?\)$/))) { const list = params[pi++]; if (!list.map(String).includes(String(row[cm[1]]))) ok = false; }
      else if ((cm = cond.match(/^(\w+) = '([^']*)'$/))) { if (String(row[cm[1]]) !== cm[2]) ok = false; }
      else throw new Error('fake-mysql: unsupported WHERE clause: ' + cond);
    }
    return ok;
  }
}

/* A pool whose connections share one FakeDb; each getConnection() gets its
   own transaction snapshot. Concurrency is not modelled (tests are serial). */
function createFakePool(db) {
  return {
    db,
    query: async (sql, params) => db.query(sql, params),
    getConnection: async () => {
      let snap = null;
      return {
        query: async (sql, params) => db.query(sql, params),
        beginTransaction: async () => { snap = db.snapshot(); },
        commit: async () => { snap = null; },
        rollback: async () => { if (snap) { db.restore(snap); snap = null; } },
        release() {},
      };
    },
    on() {},
    end: async () => {},
  };
}

module.exports = { FakeDb, createFakePool };
