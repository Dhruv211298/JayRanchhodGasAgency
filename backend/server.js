const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const IS_PROD = process.env.NODE_ENV === 'production';

/* ════════════════════════════════════════════════════════════════
   JWT SIGNING KEY
   There is deliberately NO hardcoded production fallback. A secret
   committed to the repository is not a secret: anyone with the code
   could mint themselves an admin token. In production the server
   refuses to start without JWT_SECRET. In development it generates
   a random key per process (so dev sessions simply don't survive a
   restart, which is the correct trade-off).
════════════════════════════════════════════════════════════════ */
const JWT_SECRET = (() => {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) return s;
  if (IS_PROD) {
    console.error('FATAL: JWT_SECRET is missing or shorter than 32 characters.');
    console.error('Set a long random value in the environment, e.g.');
    console.error('   node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
    process.exit(1);
  }
  if (s) console.warn('WARNING: JWT_SECRET is shorter than 32 characters — using it anyway (dev only).');
  else console.warn('WARNING: JWT_SECRET not set — using an ephemeral random key (dev only).');
  return s || crypto.randomBytes(48).toString('hex');
})();

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // Session duration
const BCRYPT_ROUNDS = 12;

const app = express();
app.set('trust proxy', 1); // behind Render's proxy — needed for correct client IPs
app.disable('x-powered-by'); // do not advertise the framework version

/* Baseline security headers. The API only ever returns JSON, so a strict
   content-type sniffing / framing policy costs nothing and closes a class of
   browser-side attacks without adding a dependency. */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/* ════════════════════════════════════════════════════════════════
   CORS
   Locked to ALLOWED_ORIGINS (comma-separated) when set. If it is not
   set the server stays permissive so an existing deployment cannot
   break on upgrade, but it warns loudly on every start.
════════════════════════════════════════════════════════════════ */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  console.warn('WARNING: ALLOWED_ORIGINS is not set — accepting requests from ANY origin.');
  console.warn('         Set it to your frontend URL, e.g. ALLOWED_ORIGINS=https://your-app.onrender.com');
  app.use(cors());
} else {
  console.log('CORS restricted to:', ALLOWED_ORIGINS.join(', '));
  app.use(cors({
    origin: (origin, cb) => {
      // Allow same-origin / server-to-server requests which send no Origin header.
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed by CORS: ' + origin));
    },
    credentials: true
  }));
}

app.use(express.json({ limit: '5mb' }));

/* ════════════════════════════════════════════════════════════════
   LOGIN RATE LIMITING
   Simple in-memory sliding window keyed by IP + username. Blocks
   credential stuffing without adding an external dependency.
════════════════════════════════════════════════════════════════ */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function loginRateLimit(req, res, next) {
  const key = `${req.ip}|${String((req.body && req.body.username) || '').toLowerCase()}`;
  const now = Date.now();
  const hits = (loginAttempts.get(key) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  if (hits.length >= LOGIN_MAX_ATTEMPTS) {
    const retryIn = Math.ceil((LOGIN_WINDOW_MS - (now - hits[0])) / 60000);
    return res.status(429).json({
      error: `Too many failed login attempts. Please try again in about ${retryIn} minute(s).`
    });
  }
  req._loginKey = key;
  next();
}
const recordFailedLogin = (key) => {
  const now = Date.now();
  const hits = (loginAttempts.get(key) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  hits.push(now);
  loginAttempts.set(key, hits);
};
const clearLoginAttempts = (key) => loginAttempts.delete(key);

// Periodically drop stale rate-limit buckets so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginAttempts) {
    const fresh = v.filter(t => now - t < LOGIN_WINDOW_MS);
    if (fresh.length === 0) loginAttempts.delete(k); else loginAttempts.set(k, fresh);
  }
}, LOGIN_WINDOW_MS).unref();

/* ════════════════════════════════════════════════════════════════
   JWT AUTH MIDDLEWARE
   Verifies Bearer token on every protected route.
   Sets req.user = { username, role } on success.
════════════════════════════════════════════════════════════════ */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided. Please log in.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { username, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.', expired: true });
    }
    return res.status(401).json({ error: 'Invalid token. Please log in again.' });
  }
}

/* ════════════════════════════════════════════════════════════════
   ROLE ENFORCEMENT
   verifyToken only proves that SOME valid token was presented. It
   says nothing about what that user may do. Every administrative
   route must additionally pass requireAdmin — hiding a tab in the
   React app is not access control, since the API can be called
   directly with any valid operator token.
════════════════════════════════════════════════════════════════ */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges are required for this action.' });
  }
  next();
}

// Database connection pool
const isAivenHost = (process.env.DB_HOST || '').includes('aivencloud.com');
const useSsl = process.env.DB_SSL === 'true' || isAivenHost;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit: process.env.VERCEL ? 3 : 10,
  queueLimit: 0,
  dateStrings: true,
  connectAttributes: { program_name: 'gas-agency' }
});

// Set SQL mode on every new connection to disable ANSI_QUOTES.
// This ensures double-quoted values are NOT treated as identifiers on Aiven/cloud MySQL.
// NOTE: initializationQuery is NOT supported by mysql2 — this pool event is the correct approach.
pool.on('connection', (connection) => {
  connection.query(
    "SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
    (err) => { if (err) console.error('Failed to set sql_mode on connection:', err.message); }
  );
});

// Helper: safe number
const num = (v) => parseFloat(v) || 0;

// Strict YYYY-MM-DD guard used by every date-keyed endpoint.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Auto-migration: add for_month column to employee_payments if missing.
// Uses SHOW COLUMNS check for compatibility with all MySQL 8.x versions.
async function runMigrations() {
  // Migration 1: for_month column on employee_payments
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM employee_payments LIKE 'for_month'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE employee_payments ADD COLUMN for_month VARCHAR(7) NULL COMMENT 'YYYY-MM salary month'");
      console.log('Migration: added for_month column to employee_payments');
    }
  } catch (e) {
    console.warn('Migration warning (non-fatal):', e.message);
  }

  // Migration 2: product_id, filled_qty, empty_qty, remarks on credit_ledger
  try {
    const [clCols] = await pool.query("SHOW COLUMNS FROM credit_ledger LIKE 'product_id'");
    if (clCols.length === 0) {
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN product_id VARCHAR(50) NULL COMMENT 'p14/p19/p5'");
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN filled_qty INT DEFAULT 0 COMMENT 'Filled cylinders taken on credit'");
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN empty_qty INT DEFAULT 0 COMMENT 'Empty cylinders returned against credit'");
      await pool.query("ALTER TABLE credit_ledger ADD COLUMN remarks VARCHAR(255) DEFAULT '' COMMENT 'Optional note'");
      console.log('Migration: added product_id, filled_qty, empty_qty, remarks to credit_ledger');
    }
  } catch (e) {
    console.warn('Migration credit_ledger warning (non-fatal):', e.message);
  }

  // Migration 3: empty_returned on credit_payments
  try {
    const [cpCols] = await pool.query("SHOW COLUMNS FROM credit_payments LIKE 'empty_returned'");
    if (cpCols.length === 0) {
      await pool.query("ALTER TABLE credit_payments ADD COLUMN empty_returned INT DEFAULT 0 COMMENT 'Empty cylinders returned in this payment'");
      console.log('Migration: added empty_returned to credit_payments');
    }
  } catch (e) {
    console.warn('Migration credit_payments warning (non-fatal):', e.message);
  }

  // Migration 4: daily_other_cash_credits table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_other_cash_credits (
        id VARCHAR(20) NOT NULL PRIMARY KEY,
        entry_date DATE NOT NULL,
        description VARCHAR(255) NOT NULL DEFAULT '',
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        INDEX idx_occ_date (entry_date)
      ) ENGINE=InnoDB
    `);
    console.log('Migration: ensured daily_other_cash_credits table exists');
  } catch (e) {
    console.warn('Migration daily_other_cash_credits warning (non-fatal):', e.message);
  }

  /* Migration 5a: password security.
     Adds password_hash, invalidates every stored plaintext password, and
     flags the affected accounts. After this runs, NOBODY can log in until an
     administrator sets a password — bootstrap the first one with:
         node scripts/set-password.js <username> <newPassword>
     The legacy `password` column is emptied (not dropped) so the change is
     reversible from a database backup if anything goes wrong. */
  try {
    const [pwCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
    if (pwCols.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL COMMENT 'bcrypt hash'");
    }
    const [rrCols] = await pool.query("SHOW COLUMNS FROM users LIKE 'password_reset_required'");
    if (rrCols.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN password_reset_required TINYINT(1) NOT NULL DEFAULT 0");
    }
    // The legacy plaintext column is very likely NOT NULL. Make it nullable
    // FIRST, otherwise clearing it below fails under STRICT_TRANS_TABLES and
    // the plaintext passwords would silently survive the migration.
    const [legacy] = await pool.query("SHOW COLUMNS FROM users LIKE 'password'");
    if (legacy.length > 0 && String(legacy[0].Null).toUpperCase() === 'NO') {
      await pool.query('ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL');
    }
    // Runs on every start until no plaintext remains, so a partial failure on
    // one boot is corrected on the next rather than being skipped forever.
    if (legacy.length > 0) {
      const [r] = await pool.query(
        "UPDATE users SET password_reset_required = 1, password = NULL WHERE password_hash IS NULL AND password IS NOT NULL"
      );
      if (r.affectedRows > 0) {
        console.log('─'.repeat(72));
        console.log('SECURITY MIGRATION APPLIED — plaintext passwords have been cleared.');
        console.log(`${r.affectedRows} account(s) now require a new password.`);
        console.log('Bootstrap the first administrator with:');
        console.log('    node scripts/set-password.js <username> <newPassword>');
        console.log('─'.repeat(72));
      }
    }
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE password_hash IS NULL');
    if (Number(n) > 0) {
      console.warn(`NOTICE: ${n} account(s) have no password set and cannot sign in.`);
      console.warn('        Set one with: node scripts/set-password.js <username> <newPassword>');
    }
  } catch (e) {
    console.error('Migration users/password_hash FAILED:', e.message);
  }

  // Migration 5b: make usernames unique so two accounts cannot collide.
  try {
    const [idx] = await pool.query("SHOW INDEX FROM users WHERE Key_name = 'uniq_users_username'");
    if (idx.length === 0) {
      await pool.query('ALTER TABLE users ADD UNIQUE KEY uniq_users_username (username)');
      console.log('Migration: added unique index on users.username');
    }
  } catch (e) {
    console.warn('Migration users unique username warning (non-fatal):', e.message);
  }

  // Migration 5c: idempotency key on credit_payments prevents a double-submitted
  // recovery from being recorded twice.
  try {
    const [ikCols] = await pool.query("SHOW COLUMNS FROM credit_payments LIKE 'idempotency_key'");
    if (ikCols.length === 0) {
      await pool.query("ALTER TABLE credit_payments ADD COLUMN idempotency_key VARCHAR(64) NULL");
      await pool.query("ALTER TABLE credit_payments ADD UNIQUE KEY uniq_cp_idem (idempotency_key)");
      console.log('Migration: added idempotency_key to credit_payments');
    }
  } catch (e) {
    console.warn('Migration credit_payments idempotency warning (non-fatal):', e.message);
  }

  // Migration 5: shortage_qty column on daily_product_stock (informational reminder only)
  try {
    const [shrCols] = await pool.query("SHOW COLUMNS FROM daily_product_stock LIKE 'shortage_qty'");
    if (shrCols.length === 0) {
      await pool.query("ALTER TABLE daily_product_stock ADD COLUMN shortage_qty INT DEFAULT 0 COMMENT 'Shortage/Stolen reminder — informational only, does not affect stock calc'");
      console.log('Migration: added shortage_qty to daily_product_stock');
    }
  } catch (e) {
    console.warn('Migration shortage_qty warning (non-fatal):', e.message);
  }

  /* Migration 6: Connection events (stock + money only) and the append-only
     audit log. Mirrored in backend/migrations/2026-09-05_connections_module.sql
     — keep the two in sync. Every statement is CREATE TABLE IF NOT EXISTS, so
     this is safe on every boot.

     DESIGN: there is deliberately NO customer / consumer-wise connection
     master here — BPCL's own system already holds that. This system records
     only what moves stock and money at the dealer's counter:
       new         → N filled cylinders OUT (1 per single, 2 per double), no money
       additional  → 1 filled cylinder OUT per bottle + cash/online INFLOW
       surrender   → empties IN (only those physically returned) + cash OUTFLOW
                     net of itemised penalties                                   */
  const CONNECTION_TABLES = [
    ['connection_events', `
      CREATE TABLE IF NOT EXISTS connection_events (
        id                VARCHAR(20)   NOT NULL PRIMARY KEY,
        event_date        DATE          NOT NULL COMMENT 'business date; joins into that day''s stock and cash',
        event_type        ENUM('new','additional','surrender') NOT NULL,
        product_id        VARCHAR(50)   NOT NULL COMMENT 'p14 / p19 / p5 — must exist in products',
        connection_type   ENUM('single','double') NULL COMMENT 'new only: single = 1 cylinder, double = 2',
        qty               INT           NOT NULL DEFAULT 1 COMMENT 'connections (new / surrender) or bottles (additional)',
        cylinders_out     INT           NOT NULL DEFAULT 0 COMMENT 'filled cylinders issued (leave filled stock)',
        cylinders_in      INT           NOT NULL DEFAULT 0 COMMENT 'empty cylinders physically received back (enter empty stock)',
        cylinders_missing INT           NOT NULL DEFAULT 0 COMMENT 'surrender: not returned — penalty only, never stock',
        amount            DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'additional: collected; surrender: gross refund entered',
        payment_mode      ENUM('cash','online') NULL COMMENT 'additional only',
        penalty_deducted  DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'surrender: SUM(connection_event_penalties.amount)',
        net_paid          DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT 'surrender: amount - penalty_deducted; what left the till',
        remarks           VARCHAR(255)  NULL,
        recorded_by       VARCHAR(50)   NULL,
        idempotency_key   VARCHAR(64)   NULL,
        created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_cev_idem (idempotency_key),
        INDEX idx_cev_date (event_date, product_id),
        INDEX idx_cev_type (event_type, event_date)
      ) ENGINE=InnoDB`],
    ['connection_event_penalties', `
      CREATE TABLE IF NOT EXISTS connection_event_penalties (
        id                VARCHAR(20)   NOT NULL PRIMARY KEY,
        event_id          VARCHAR(20)   NOT NULL,
        item_description  VARCHAR(100)  NOT NULL COMMENT 'pipe / stove (ACCESSORIES ids) or free text',
        amount            DECIMAL(10,2) NOT NULL,
        CONSTRAINT fk_cevp_event FOREIGN KEY (event_id) REFERENCES connection_events(id),
        INDEX idx_cevp_event (event_id),
        INDEX idx_cevp_item  (item_description)
      ) ENGINE=InnoDB`],
    ['audit_log', `
      CREATE TABLE IF NOT EXISTS audit_log (
        id               VARCHAR(20)  NOT NULL PRIMARY KEY,
        event_type       VARCHAR(40)  NOT NULL,
        entity_type      VARCHAR(40)  NOT NULL,
        entity_id        VARCHAR(40)  NOT NULL,
        actor            VARCHAR(50)  NOT NULL COMMENT 'username',
        actor_role       VARCHAR(20)  NOT NULL,
        event_date       DATE         NULL COMMENT 'business date the event applies to',
        details          JSON         NULL,
        idempotency_key  VARCHAR(64)  NULL,
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_audit_idem (idempotency_key),
        INDEX idx_audit_entity  (entity_type, entity_id),
        INDEX idx_audit_created (created_at),
        INDEX idx_audit_event   (event_type, event_date)
      ) ENGINE=InnoDB`],
  ];
  for (const [table, ddl] of CONNECTION_TABLES) {
    try {
      await pool.query(ddl);
    } catch (e) {
      /* This one IS fatal for the module: without these tables every
         connection endpoint fails. Log loudly; the rest of the app still runs. */
      console.error(`Migration 6 FAILED creating ${table}:`, e.message);
    }
  }
  console.log('Migration: ensured connection-module tables exist (connection_events, connection_event_penalties, audit_log)');

  /* Migration 6b: an intermediate build of this module created a
     customer-wise master (customers, connections, connection_payments,
     connection_refunds, connection_refund_penalties,
     connection_cylinder_movements). That design was dropped — BPCL's system
     owns consumer data. If those tables exist AND are all empty they are
     removed; if any holds rows they are left alone and reported, never
     dropped automatically. */
  try {
    const legacyTables = ['connection_refund_penalties', 'connection_cylinder_movements', 'connection_payments',
                          'connection_refunds', 'connections', 'customers'];
    const present = [];
    for (const t of legacyTables) {
      const [rows] = await pool.query('SHOW TABLES LIKE ?', [t]);
      if (rows.length > 0) present.push(t);
    }
    if (present.length > 0) {
      let total = 0;
      for (const t of present) {
        const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
        total += Number(n);
      }
      if (total === 0) {
        for (const t of present) await pool.query(`DROP TABLE IF EXISTS \`${t}\``); // children first (FK order above)
        console.log('Migration: removed empty tables from the abandoned customer-master design:', present.join(', '));
      } else {
        console.warn(`NOTICE: abandoned customer-master tables still hold ${total} row(s) and were NOT dropped: ${present.join(', ')}`);
      }
    }
  } catch (e) {
    console.warn('Migration 6b warning (non-fatal):', e.message);
  }

  /* Migration 7: products table columns and defaults for Product Master.
     Ensures dynamic products (e.g., 10 KG, 14 KG, 19 KG, 5 KG) can be maintained
     from the Admin portal. */
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) NOT NULL PRIMARY KEY,
        label VARCHAR(100) NOT NULL DEFAULT '',
        short_name VARCHAR(50) NOT NULL DEFAULT '',
        sku VARCHAR(50) NOT NULL DEFAULT '',
        fallback_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
        fallback_sbc DECIMAL(10,2) NOT NULL DEFAULT 0,
        fallback_dbc DECIMAL(10,2) NOT NULL DEFAULT 0,
        category VARCHAR(20) NOT NULL DEFAULT 'cylinder',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const [pCols] = await pool.query("SHOW COLUMNS FROM products");
    const colMap = new Set(pCols.map(c => c.Field.toLowerCase()));

    if (!colMap.has('label')) await pool.query("ALTER TABLE products ADD COLUMN label VARCHAR(100) NOT NULL DEFAULT ''");
    if (!colMap.has('short_name')) await pool.query("ALTER TABLE products ADD COLUMN short_name VARCHAR(50) NOT NULL DEFAULT ''");
    if (!colMap.has('sku')) await pool.query("ALTER TABLE products ADD COLUMN sku VARCHAR(50) NOT NULL DEFAULT ''");
    if (!colMap.has('fallback_rate')) await pool.query("ALTER TABLE products ADD COLUMN fallback_rate DECIMAL(10,2) NOT NULL DEFAULT 0");
    if (!colMap.has('fallback_sbc')) await pool.query("ALTER TABLE products ADD COLUMN fallback_sbc DECIMAL(10,2) NOT NULL DEFAULT 0");
    if (!colMap.has('fallback_dbc')) await pool.query("ALTER TABLE products ADD COLUMN fallback_dbc DECIMAL(10,2) NOT NULL DEFAULT 0");
    if (!colMap.has('category')) await pool.query("ALTER TABLE products ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'cylinder'");
    if (!colMap.has('is_active')) await pool.query("ALTER TABLE products ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1");
    if (!colMap.has('sort_order')) await pool.query("ALTER TABLE products ADD COLUMN sort_order INT NOT NULL DEFAULT 0");

    await pool.query(`
      INSERT INTO products (id, label, short_name, sku, fallback_rate, fallback_sbc, fallback_dbc, category, is_active, sort_order)
      VALUES 
        ('p14', '14 KG  (5350–5370)', '14 KG', '5350–5370', 906.50, 0, 0, 'cylinder', 1, 1),
        ('p19', '19 KG  (5400)', '19 KG', '5400', 1950.00, 0, 0, 'cylinder', 1, 2),
        ('p5', 'FLT 5 KG', '5 KG', 'FLT', 564.50, 0, 0, 'cylinder', 1, 3),
        ('pipe', 'Gas Pipe', 'Pipe', 'ACC-PIPE', 150.00, 0, 0, 'accessory', 1, 10),
        ('stove', 'Gas Stove', 'Stove', 'ACC-STOVE', 1500.00, 0, 0, 'accessory', 1, 11)
      ON DUPLICATE KEY UPDATE
        label = IF(label = '' OR label IS NULL, VALUES(label), label),
        short_name = IF(short_name = '' OR short_name IS NULL, VALUES(short_name), short_name),
        sku = IF(sku = '' OR sku IS NULL, VALUES(sku), sku),
        fallback_rate = IF(fallback_rate = 0, VALUES(fallback_rate), fallback_rate),
        category = IF(category = '' OR category IS NULL, VALUES(category), category)
    `);
    console.log('Migration: ensured products table schema and seed rows');
  } catch (e) {
    console.warn('Migration products warning (non-fatal):', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   1. MASTER LOAD ENDPOINT (Replaces initial dbGet Promise.all)
════════════════════════════════════════════════════════════════ */
app.get('/api/load', verifyToken, async (req, res) => {
  try {
    // 1. Load Master Data
    const [productsRows] = await pool.query(`
      SELECT id, label, short_name as short, sku, 
             fallback_rate as fallbackRate, fallback_sbc as fallbackSbc, fallback_dbc as fallbackDbc,
             category, is_active as isActive, sort_order as sortOrder
      FROM products 
      ORDER BY sort_order ASC, id ASC
    `);
    const cylinderRows = productsRows.filter(p => p.category !== 'accessory' && p.isActive !== 0);
    const activeCylinders = cylinderRows.length > 0 ? cylinderRows : [{ id: 'p14', short: '14 KG' }, { id: 'p19', short: '19 KG' }, { id: 'p5', short: '5 KG' }];
    const accessoryRows = productsRows.filter(p => p.category === 'accessory' && p.isActive !== 0);
    const activeAccessories = accessoryRows.length > 0 ? accessoryRows : [{ id: 'pipe', short: 'Pipe' }, { id: 'stove', short: 'Stove' }];
    const activeCylIds = new Set(activeCylinders.map(c => c.id));
    const [pricesRows] = await pool.query(`SELECT id, product_id as productId, DATE_FORMAT(effective_date, '%Y-%m-%d') as date, rate, sbc_rate as sbcRate, dbc_rate as dbcRate, note FROM price_history`);
    
    // 2. Load Commissions
    const [commRows] = await pool.query(`SELECT id, product_id as productId, DATE_FORMAT(effective_date, '%Y-%m-%d') as date, per_cyl_rate as perCyl, note FROM commission_history`);
    
    // 3. Load Employees (for dropdowns)
    const [empRows] = await pool.query('SELECT id, name, role, salary FROM employees WHERE is_active = 1 ORDER BY name ASC');
    const employees = empRows.map(e => ({ id: e.id, name: e.name, role: e.role, salary: e.salary }));
    const boys = empRows.filter(e => e.role === "Delivery Boy").map(e => e.name);

    // 4. Load Active Vehicles
    const [vehicleRows] = await pool.query('SELECT id, vehicle_no, type, capacity FROM vehicles WHERE is_active = 1 ORDER BY sort_order ASC, id ASC');
    
    // 5. Load Pending Credits
    const [ledgerRows] = await pool.query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as date, customer_name as customerName, original_amount as originalAmt, cleared, COALESCE(product_id, '') as productId, COALESCE(filled_qty, 0) as filledQty, COALESCE(empty_qty, 0) as emptyQty, COALESCE(remarks, '') as remarks FROM credit_ledger`);
    const [paymentRows] = await pool.query(`
      SELECT p.ledger_id, DATE_FORMAT(p.payment_date, '%Y-%m-%d') as date, p.amount as amt, p.note, COALESCE(p.empty_returned, 0) as emptyReturned, l.customer_name as customerName, COALESCE(l.product_id, 'p14') as productId
      FROM credit_payments p 
      LEFT JOIN credit_ledger l ON p.ledger_id = l.id
    `);
    
    const pending = ledgerRows.map(l => {
      const payments = paymentRows.filter(p => p.ledger_id === l.id).map(p => ({ date: p.date, amt: num(p.amt), note: p.note, emptyReturned: num(p.emptyReturned) }));
      const recovered = payments.reduce((sum, p) => sum + num(p.amt), 0);
      return {
        id: l.id,
        date: l.date,
        customerName: l.customerName,
        originalAmt: num(l.originalAmt),
        recovered,
        cleared: l.cleared === 1 || recovered >= num(l.originalAmt),
        payments,
        productId: l.productId || '',
        filledQty: num(l.filledQty),
        emptyQty: num(l.emptyQty),
        remarks: l.remarks || ''
      };
    });

    // 6. Load Daily Entries
    const [entriesRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as date, opening_cash as openingCash, bob_bank as bob, has_vehicle_arrival as hasArrival FROM daily_entries`);
    const [prodStockRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as id, opening_stock as openingStock, rate, sbc_rate as sbcRate, dbc_rate as dbcRate, sell_qty as sell, online_qty as online, sbc_qty as sbc, dbc_qty as dbc, closing_stock as closingStock, COALESCE(shortage_qty, 0) as shortage, remarks FROM daily_product_stock`);
    const [deliveryRows] = await pool.query(`SELECT d.cash_qty, d.online_qty, d.qty_delivered, DATE_FORMAT(d.entry_date, '%Y-%m-%d') as entry_date, b.name FROM daily_deliveries d JOIN employees b ON d.delivery_boy_id = b.id`);
    const [expRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_expenses");
    const [chequeRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_cheque_online");
    const [creditSalesRows] = await pool.query(`SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, customer_name as customerName, original_amount as amt, COALESCE(product_id, '') as productId, COALESCE(filled_qty, 0) as filledQty, COALESCE(empty_qty, 0) as emptyQty, COALESCE(remarks, '') as remarks FROM credit_ledger`);
    const [vehExpRows] = await pool.query("SELECT dve.id, DATE_FORMAT(dve.entry_date, '%Y-%m-%d') as entry_date, dve.vehicle_id as vehicleId, COALESCE(v.vehicle_no, '') as vehicleNo, dve.expense_type as expType, dve.description as `desc`, dve.amount as amt FROM daily_vehicle_expenses dve LEFT JOIN vehicles v ON dve.vehicle_id = v.id");
    // Load salary payments — query for_month safely with a fallback
    let salPayRows = [];
    try {
      [salPayRows] = await pool.query(`SELECT sp.id, DATE_FORMAT(sp.entry_date, '%Y-%m-%d') as entry_date, sp.employee_id as employeeId, e.name as employeeName, sp.amount as amt, sp.type, sp.notes, sp.for_month as forMonth FROM employee_payments sp JOIN employees e ON sp.employee_id = e.id`);
    } catch (salErr) {
      // for_month column may not exist yet — fall back to query without it
      console.warn('Salary load fallback (for_month missing?):', salErr.message);
      [salPayRows] = await pool.query(`SELECT sp.id, DATE_FORMAT(sp.entry_date, '%Y-%m-%d') as entry_date, sp.employee_id as employeeId, e.name as employeeName, sp.amount as amt, sp.type, sp.notes FROM employee_payments sp JOIN employees e ON sp.employee_id = e.id`);
    }
    const [godownRows] = await pool.query("SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as productId, filled_qty as `filled`, empty_qty as `empty` FROM godown_stock");
    const [arrivalRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, product_id as productId, filled_received as filledReceived, empty_returned as emptyReturned FROM vehicle_arrivals`);
    const [accRows] = await pool.query(`SELECT DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, accessory_id as accessoryId, qty, rate FROM daily_accessory_sales`);
    const [occRows] = await pool.query("SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') as entry_date, description as `desc`, amount as amt FROM daily_other_cash_credits");

    /* Connection-module events (one table, three types). They are joined
       into each day's entry exactly like otherCashCredits / expenses so that
       calcEntry() and computeClosingStock() see them, and ALSO returned keyed
       by date (connectionsByDate) because an event can be recorded on a day
       whose daily entry has not been saved yet — the front-end needs them to
       build that day's blank entry correctly. */
    const [connEvRows] = await pool.query(`
      SELECT id, DATE_FORMAT(event_date, '%Y-%m-%d') AS entry_date, event_type AS eventType, product_id AS productId,
             connection_type AS connectionType, qty, cylinders_out AS cylindersOut, cylinders_in AS cylindersIn,
             cylinders_missing AS cylindersMissing, amount, payment_mode AS mode, penalty_deducted AS penaltyDeducted,
             net_paid AS netPaid, COALESCE(remarks, '') AS remarks, COALESCE(recorded_by, '') AS recordedBy
        FROM connection_events`);

    /* Index every per-day collection by date ONCE. The previous
       `.filter(x => x.entry_date === date)` inside the entries loop was
       O(days × rows) per collection — 14 collections × a year of history was
       several million comparisons on every load and after every save. */
    const byDate = (rows) => {
      const m = new Map();
      for (const r of rows) {
        const list = m.get(r.entry_date);
        if (list) list.push(r); else m.set(r.entry_date, [r]);
      }
      return m;
    };
    const prodStockByDate = byDate(prodStockRows);
    const deliveryByDate  = byDate(deliveryRows);
    const expByDate       = byDate(expRows);
    const chequeByDate    = byDate(chequeRows);
    const creditByDate    = byDate(creditSalesRows);
    const vehExpByDate    = byDate(vehExpRows);
    const salPayByDate    = byDate(salPayRows);
    const occByDate       = byDate(occRows);
    const godownByDate    = byDate(godownRows);
    const arrivalByDate   = byDate(arrivalRows);
    const accByDate       = byDate(accRows);
    const connEvByDate    = byDate(connEvRows);
    const paymentsByDate  = new Map();
    for (const p of paymentRows) {
      const list = paymentsByDate.get(p.date);
      if (list) list.push(p); else paymentsByDate.set(p.date, [p]);
    }
    const get = (m, date) => m.get(date) || [];

    /* Shapes consumed by calcEntry() — `amt` is the figure that enters the
       cash formula: the amount collected (payments) or the NET paid (refunds). */
    const shapeConnPayment = x => ({
      id: x.id, productId: x.productId, qty: num(x.qty), amt: num(x.amount), mode: x.mode,
      remarks: x.remarks, recordedBy: x.recordedBy
    });
    const shapeConnRefund = x => ({
      id: x.id, productId: x.productId, qty: num(x.qty), refundAmount: num(x.amount), penaltyDeducted: num(x.penaltyDeducted),
      amt: num(x.netPaid), cylindersQty: num(x.cylindersIn), cylindersMissing: num(x.cylindersMissing),
      notes: x.remarks, recordedBy: x.recordedBy
    });
    const shapeConnNew = x => ({
      id: x.id, productId: x.productId, connectionType: x.connectionType, qty: num(x.qty), cylindersOut: num(x.cylindersOut),
      amt: num(x.amount), mode: x.mode, remarks: x.remarks, recordedBy: x.recordedBy
    });
    /* Per-product cylinder movements for the stock engine (filled OUT for
       new + additional, empty IN for surrender). Missing cylinders are
       deliberately absent — they are money, not stock. */
    const shapeConnMovements = (date) => activeCylinders.map(p => {
      const rows = get(connEvByDate, date).filter(x => x.productId === p.id);
      return {
        productId: p.id,
        filledOut: rows.reduce((s, x) => s + num(x.cylindersOut), 0),
        emptyIn: rows.reduce((s, x) => s + num(x.cylindersIn), 0),
      };
    });
    const shapeConnDay = (date) => {
      const rows = get(connEvByDate, date);
      return {
        connectionNew: rows.filter(x => x.eventType === 'new').map(shapeConnNew),
        connectionPayments: rows.filter(x => x.eventType === 'additional').map(shapeConnPayment),
        connectionRefunds: rows.filter(x => x.eventType === 'surrender').map(shapeConnRefund),
        connectionMovements: shapeConnMovements(date),
      };
    };

    // Every date that has ANY connection activity, whether or not a daily entry exists.
    const connectionsByDate = {};
    for (const date of connEvByDate.keys()) connectionsByDate[date] = shapeConnDay(date);

    const entries = entriesRows.map(e => {
      const date = e.date;
      const products = get(prodStockByDate, date)
        .filter(p => activeCylIds.has(p.id))
        .map(p => ({
          id: p.id,
          openingStock: p.openingStock || "",
          rate: p.rate || "",
          sbcRate: p.sbcRate || "",
          dbcRate: p.dbcRate || "",
          sell: p.sell || "",
          online: p.online || "",
          sbc: p.sbc || "",
          dbc: p.dbc || "",
          closingStock: p.closingStock || "",
          shortage: p.shortage || "",
          remarks: p.remarks || ""
        }));
      
      const delivery = {};
      get(deliveryByDate, date).forEach(d => {
        delivery[d.name] = {
          cash: d.cash_qty || "",
          online: d.online_qty || ""
        };
      });

      const expenses = get(expByDate, date).map(x => ({ id: x.id, desc: x.desc, amt: x.amt || "" }));
      const chequeOnline = get(chequeByDate, date).map(x => ({ id: x.id, desc: x.desc, amt: x.amt || "" }));
      const creditSales = get(creditByDate, date).map(x => ({ id: x.id, customerName: x.customerName, amt: x.amt || "", productId: x.productId || "", filledQty: x.filledQty || "", emptyQty: x.emptyQty || "", remarks: x.remarks || "" }));
      const vehicleExpenses = get(vehExpByDate, date).map(x => ({ id: x.id, vehicleId: x.vehicleId || '', vehicleNo: x.vehicleNo || '', expType: x.expType || 'Fuel', desc: x.desc || '', amt: x.amt || '' }));
      const salaryPayments = get(salPayByDate, date).map(x => ({ id: x.id, employeeId: x.employeeId, employeeName: x.employeeName, amt: x.amt || "", type: x.type, notes: x.notes || "", forMonth: x.forMonth || null }));
      const creditRecoveries = get(paymentsByDate, date).map(p => ({
        ledgerId: p.ledger_id,
        customerName: p.customerName || "UNKNOWN",
        productId: p.productId,
        amt: p.amt || "",
        note: p.note || "",
        emptyReturned: p.emptyReturned || 0
      }));

      const otherCashCredits = get(occByDate, date).map(x => ({ id: x.id, desc: x.desc, amt: x.amt || "" }));
      const godownForDate = get(godownByDate, date);
      const arrivalsForDate = get(arrivalByDate, date);
      const accForDate = get(accByDate, date);

      return {
        date,
        openingCash: e.openingCash || "",
        bob: e.bob || "",
        products,
        delivery,
        expenses,
        chequeOnline,
        creditSales,
        vehicleExpenses,
        salaryPayments,
        creditRecoveries,
        otherCashCredits,
        // Connection module — same shape as the connectionsByDate map above.
        ...shapeConnDay(date),
        godownStock: activeCylinders.map(p => {
          const row = godownForDate.find(g => g.productId === p.id);
          return { productId: p.id, filled: row ? row.filled : "", empty: row ? row.empty : "" };
        }),
        hasArrival: !!e.hasArrival,
        arrivals: activeCylinders.map(p => {
          const row = arrivalsForDate.find(a => a.productId === p.id);
          return { productId: p.id, filledReceived: row ? row.filledReceived : "", emptyReturned: row ? row.emptyReturned : "" };
        }),
        accessories: activeAccessories.map(a => {
          const row = accForDate.find(r => r.accessoryId === a.id);
          return {
            accessoryId: a.id,
            sold: !!row,
            qty: row ? row.qty : "",
            rate: row ? row.rate : (a.fallbackRate || a.fallback_rate || "")
          };
        })
      };
    });

    res.json({ products: productsRows, prices: pricesRows, commissions: commRows, boys, employees, vehicles: vehicleRows, pending, entries, connectionsByDate });
  } catch (error) {
    console.error("Load API Error:", error);
    res.status(500).json({ error: 'Could not load data. Please try again.' });
  }
});

/* ════════════════════════════════════════════════════════════════
   2. DAILY ENTRY SAVE (Transaction)
════════════════════════════════════════════════════════════════ */
/* Server-local "today" in YYYY-MM-DD, honouring APP_TIMEZONE (default IST).
   Must not use toISOString(), which yields the UTC date and would treat the
   early hours of an Indian morning as the previous day. */
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // en-CA formats as YYYY-MM-DD
}

/* Shape/range validation for the daily-entry payload. The route previously
   accepted anything: a non-array `expenses` crashed mid-transaction (rolled
   back, but as a 500 with a raw driver message), negative quantities were
   written as-is, and unknown product ids created stock rows nothing could
   read. Returns an error string, or null when the payload is acceptable. */
const isNonNegNum = (v) => v === '' || v === null || v === undefined || (Number.isFinite(Number(v)) && Number(v) >= 0);
function validateEntryPayload(entry, productIds) {
  const listKeys = ['products', 'expenses', 'chequeOnline', 'creditSales', 'vehicleExpenses',
                    'salaryPayments', 'godownStock', 'arrivals', 'accessories', 'otherCashCredits'];
  for (const k of listKeys) {
    if (entry[k] !== undefined && entry[k] !== null && !Array.isArray(entry[k])) return `${k} must be a list.`;
  }
  if (!isNonNegNum(entry.openingCash)) return 'Opening cash must be a non-negative number.';
  if (!isNonNegNum(entry.bob)) return 'BOB bank deposit must be a non-negative number.';
  for (const p of entry.products || []) {
    if (!p || !productIds.has(String(p.id))) return `Unknown product "${p && p.id}".`;
    for (const f of ['sell', 'online', 'sbc', 'dbc', 'rate', 'sbcRate', 'dbcRate', 'shortage']) {
      if (!isNonNegNum(p[f])) return `Product ${p.id}: ${f} must be a non-negative number.`;
    }
  }
  const moneyLists = { expenses: 'Expense', chequeOnline: 'Cheque/online', vehicleExpenses: 'Vehicle expense',
                       salaryPayments: 'Salary payment', otherCashCredits: 'Other cash credit', creditSales: 'Credit sale' };
  for (const [k, label] of Object.entries(moneyLists)) {
    for (const x of entry[k] || []) {
      if (!x || typeof x !== 'object') return `${label} rows must be objects.`;
      if (!isNonNegNum(x.amt)) return `${label}: amount must be a non-negative number.`;
      if (x.id !== undefined && String(x.id).length > 20) return `${label}: invalid row id.`;
    }
  }
  for (const cs of entry.creditSales || []) {
    if (!isNonNegNum(cs.filledQty) || !isNonNegNum(cs.emptyQty)) return 'Credit sale: cylinder quantities must be non-negative.';
    if (cs.productId && !productIds.has(String(cs.productId))) return `Credit sale: unknown product "${cs.productId}".`;
  }
  for (const g of [...(entry.godownStock || []), ...(entry.arrivals || [])]) {
    if (!g || !productIds.has(String(g.productId))) return `Unknown product "${g && g.productId}" in stock rows.`;
    for (const f of ['filled', 'empty', 'filledReceived', 'emptyReturned']) {
      if (!isNonNegNum(g[f])) return `Stock quantities must be non-negative.`;
    }
  }
  for (const a of entry.accessories || []) {
    if (!isNonNegNum(a.qty) || !isNonNegNum(a.rate)) return 'Accessory quantity and rate must be non-negative.';
  }
  return null;
}

app.post('/api/entries', verifyToken, async (req, res) => {
  const entry = req.body || {};
  const date = entry.date;

  // Validation — the date is the primary key of the whole day, so it must be
  // well-formed before anything else happens.
  if (!DATE_RE.test(String(date || ''))) {
    return res.status(400).json({ error: 'Invalid entry date. Expected YYYY-MM-DD.' });
  }
  const today = todayLocal();
  if (date > today) {
    return res.status(400).json({ error: 'Cannot record an entry for a future date.' });
  }
  /* Non-administrators may only write the current day. This was previously
     enforced only by disabling inputs in the browser, which is not a control
     at all — the endpoint could be called directly with any operator token. */
  if (req.user.role !== 'admin' && date !== today) {
    return res.status(403).json({
      error: 'You can only record today\'s entry. Ask an administrator to change a past date.'
    });
  }

  let productRows;
  try {
    [productRows] = await pool.query('SELECT id FROM products');
  } catch (e) {
    console.error('Save Entry Error (products):', e);
    return res.status(500).json({ error: 'Could not save the entry. Nothing was changed.' });
  }
  const bad = validateEntryPayload(entry, new Set(productRows.map(p => String(p.id))));
  if (bad) return res.status(400).json({ error: 'Entry rejected — ' + bad });

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Audit: an administrator rewriting a PAST day is exactly the event the
    // previous release flagged as untraceable. Record who, when and what day.
    const [existing] = await connection.query('SELECT entry_date FROM daily_entries WHERE entry_date = ?', [date]);
    if (req.user.role === 'admin' && date !== today) {
      await writeAudit(connection, {
        eventType: existing.length ? 'entry.backdated_save' : 'entry.backdated_create',
        entityType: 'daily_entry', entityId: date, req, eventDate: date,
        details: { openingCash: num(entry.openingCash), bob: num(entry.bob) }
      });
    }

    // 1. Insert/Update daily_entries
    await connection.query(`
      INSERT INTO daily_entries (entry_date, opening_cash, bob_bank, has_vehicle_arrival) 
      VALUES (?, ?, ?, ?) 
      ON DUPLICATE KEY UPDATE opening_cash = ?, bob_bank = ?, has_vehicle_arrival = ?
    `, [date, num(entry.openingCash), num(entry.bob), !!entry.hasArrival, num(entry.openingCash), num(entry.bob), !!entry.hasArrival]);

    // 2. Process Products
    await connection.query('DELETE FROM daily_product_stock WHERE entry_date = ?', [date]);
    if (entry.products && entry.products.length > 0) {
      const prodVals = entry.products.map(p => [
        date, p.id, num(p.openingStock), num(p.rate), num(p.sbcRate), num(p.dbcRate), num(p.sell), num(p.online), num(p.sbc), num(p.dbc), num(p.closingStock), num(p.shortage), p.remarks || ''
      ]);
      await connection.query('INSERT INTO daily_product_stock (entry_date, product_id, opening_stock, rate, sbc_rate, dbc_rate, sell_qty, online_qty, sbc_qty, dbc_qty, closing_stock, shortage_qty, remarks) VALUES ?', [prodVals]);
    }

    // 3. Process Deliveries (needs boy IDs from employees table)
    await connection.query('DELETE FROM daily_deliveries WHERE entry_date = ?', [date]);
    const [boys] = await connection.query("SELECT id, name FROM employees WHERE role = 'Delivery Boy'");
    const boyMap = {};
    boys.forEach(b => boyMap[b.name] = b.id);
    
    const delVals = [];
    if (entry.delivery) {
      for (const [boyName, val] of Object.entries(entry.delivery)) {
        const cash = typeof val === 'object' && val !== null ? num(val.cash) : num(val);
        const online = typeof val === 'object' && val !== null ? num(val.online) : 0;
        const total = cash + online;
        if (total > 0 && boyMap[boyName]) {
          delVals.push([date, boyMap[boyName], cash, online, total]);
        }
      }
    }
    if (delVals.length > 0) {
      await connection.query('INSERT INTO daily_deliveries (entry_date, delivery_boy_id, cash_qty, online_qty, qty_delivered) VALUES ?', [delVals]);
    }

    // 4. Process Expenses
    await connection.query('DELETE FROM daily_expenses WHERE entry_date = ?', [date]);
    if (entry.expenses) {
      const expVals = entry.expenses.filter(x => x.desc || num(x.amt) > 0).map(x => [x.id, date, x.desc || '', num(x.amt)]);
      if (expVals.length > 0) {
        await connection.query('INSERT INTO daily_expenses (id, entry_date, description, amount) VALUES ?', [expVals]);
      }
    }

    // 5. Process Cheque/Online
    await connection.query('DELETE FROM daily_cheque_online WHERE entry_date = ?', [date]);
    if (entry.chequeOnline) {
      const chqVals = entry.chequeOnline.filter(x => x.desc || num(x.amt) > 0).map(x => [x.id, date, x.desc || '', num(x.amt)]);
      if (chqVals.length > 0) {
        await connection.query('INSERT INTO daily_cheque_online (id, entry_date, description, amount) VALUES ?', [chqVals]);
      }
    }

    // 6. Process Credit Sales (Credit Ledger)
    // For existing records (id already starts with date), use the id as-is.
    // For new records added in this session, build a fresh ledgerId.
    // Allow deleting credit sales that have been removed in the frontend, but only if they have no payments.
    if (entry.creditSales) {
      const activeIds = [];
      for (const cs of entry.creditSales) {
        if (cs.customerName && num(cs.amt) > 0) {
          // If the id already starts with the date prefix it came from the DB — use it directly
          const ledgerId = cs.id && cs.id.startsWith(date + '-') ? cs.id : `${date}-${cs.id}`;
          activeIds.push(ledgerId);
          await connection.query(`
            INSERT INTO credit_ledger (id, entry_date, customer_name, original_amount, cleared, product_id, filled_qty, empty_qty, remarks) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), original_amount = VALUES(original_amount), product_id = VALUES(product_id), filled_qty = VALUES(filled_qty), empty_qty = VALUES(empty_qty), remarks = VALUES(remarks)
          `, [ledgerId, date, cs.customerName.trim().toUpperCase(), num(cs.amt), false, cs.productId || null, num(cs.filledQty), num(cs.emptyQty), cs.remarks || '']);
        }
      }

      // Delete credit ledger entries for this date that are NOT in the active list AND have no payments
      let queryStr = 'SELECT id FROM credit_ledger WHERE entry_date = ?';
      const params = [date];
      if (activeIds.length > 0) {
        queryStr += ' AND id NOT IN (?)';
        params.push(activeIds);
      }
      const [toDeleteRows] = await connection.query(queryStr, params);
      for (const row of toDeleteRows) {
        const [payments] = await connection.query('SELECT COUNT(*) as cnt FROM credit_payments WHERE ledger_id = ?', [row.id]);
        if (payments[0].cnt === 0) {
          await connection.query('DELETE FROM credit_ledger WHERE id = ?', [row.id]);
        }
      }
    } else {
      // If creditSales array is not provided or empty, delete all credit ledger entries for this date that have no payments
      const [toDeleteRows] = await connection.query('SELECT id FROM credit_ledger WHERE entry_date = ?', [date]);
      for (const row of toDeleteRows) {
        const [payments] = await connection.query('SELECT COUNT(*) as cnt FROM credit_payments WHERE ledger_id = ?', [row.id]);
        if (payments[0].cnt === 0) {
          await connection.query('DELETE FROM credit_ledger WHERE id = ?', [row.id]);
        }
      }
    }


    // 7. Process Vehicle Expenses
    await connection.query('DELETE FROM daily_vehicle_expenses WHERE entry_date = ?', [date]);
    if (entry.vehicleExpenses) {
      const vehExpVals = entry.vehicleExpenses
        .filter(x => num(x.amt) > 0)
        .map(x => [x.id, date, x.vehicleId || null, x.expType || 'Fuel', x.desc || '', num(x.amt)]);
      if (vehExpVals.length > 0) {
        await connection.query('INSERT INTO daily_vehicle_expenses (id, entry_date, vehicle_id, expense_type, description, amount) VALUES ?', [vehExpVals]);
      }
    }

    // 8. Process Salary/Advance Payments
    await connection.query('DELETE FROM employee_payments WHERE entry_date = ?', [date]);
    if (entry.salaryPayments) {
      const salPayVals = entry.salaryPayments
        .filter(x => x.employeeId && num(x.amt) > 0)
        .map(x => [x.id, date, x.employeeId, num(x.amt), x.type || 'Salary', x.notes || '', x.forMonth || null]);
      if (salPayVals.length > 0) {
        await connection.query('INSERT INTO employee_payments (id, entry_date, employee_id, amount, type, notes, for_month) VALUES ?', [salPayVals]);
      }
    }

    // 9. Process Godown Stock
    if (entry.godownStock && entry.godownStock.length > 0) {
      for (const item of entry.godownStock) {
        if (num(item.filled) > 0 || num(item.empty) > 0) {
          await connection.query(`
            INSERT INTO godown_stock (entry_date, product_id, filled_qty, empty_qty)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE filled_qty = ?, empty_qty = ?
          `, [date, item.productId, num(item.filled), num(item.empty), num(item.filled), num(item.empty)]);
        }
      }
    }

    // 10. Process Vehicle Arrivals
    if (entry.hasArrival && entry.arrivals && entry.arrivals.length > 0) {
      for (const item of entry.arrivals) {
        if (num(item.filledReceived) > 0 || num(item.emptyReturned) > 0) {
          await connection.query(`
            INSERT INTO vehicle_arrivals (entry_date, product_id, filled_received, empty_returned)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE filled_received = ?, empty_returned = ?
          `, [date, item.productId, num(item.filledReceived), num(item.emptyReturned), num(item.filledReceived), num(item.emptyReturned)]);
        }
      }
    } else {
      await connection.query('DELETE FROM vehicle_arrivals WHERE entry_date = ?', [date]);
    }

    // 11. Process Accessory Sales
    await connection.query('DELETE FROM daily_accessory_sales WHERE entry_date = ?', [date]);
    if (entry.accessories) {
      const accVals = entry.accessories
        .filter(x => x.sold && num(x.qty) > 0)
        .map(x => [date, x.accessoryId, num(x.qty), num(x.rate)]);
      if (accVals.length > 0) {
        await connection.query('INSERT INTO daily_accessory_sales (entry_date, accessory_id, qty, rate) VALUES ?', [accVals]);
      }
    }

    // 12. Process Other Cash Credits
    await connection.query('DELETE FROM daily_other_cash_credits WHERE entry_date = ?', [date]);
    if (entry.otherCashCredits) {
      const occVals = entry.otherCashCredits.filter(x => x.desc || num(x.amt) > 0).map(x => [x.id, date, x.desc || '', num(x.amt)]);
      if (occVals.length > 0) {
        await connection.query('INSERT INTO daily_other_cash_credits (id, entry_date, description, amount) VALUES ?', [occVals]);
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error("Save Entry Error:", error);
    res.status(500).json({ error: 'Could not save the entry. Nothing was changed.' });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   2b. DELETE DAILY ENTRY (Admin only)
   Removes ONLY the day's operational entry data.
   Salary payments and credit ledger are kept as permanent records.
════════════════════════════════════════════════════════════════ */
app.delete('/api/entries/:date', verifyToken, requireAdmin, async (req, res) => {
  const date = req.params.date;

  // Safety: validate date format (must be YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Only delete core daily entry tables for this specific date
    await connection.query('DELETE FROM daily_product_stock WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_deliveries WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_expenses WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_cheque_online WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_vehicle_expenses WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM godown_stock WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM vehicle_arrivals WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_accessory_sales WHERE entry_date = ?', [date]);
    await connection.query('DELETE FROM daily_other_cash_credits WHERE entry_date = ?', [date]);

    /* Salary/advance payments ARE removed with the day.
       Previously they were deliberately kept, but POST /api/entries already
       deletes and rewrites employee_payments for the date. Keeping them here
       left orphan rows attached to a date with no daily_entries parent: they
       stayed in the database, still counted against the employee's balance in
       raw SQL, yet vanished from every report (which iterates entries). The
       two paths must agree, and consistency is worth more than the false
       safety of an unreachable row. Take a database backup before deleting a
       day if you need the payment history preserved. */
    await connection.query('DELETE FROM employee_payments WHERE entry_date = ?', [date]);

    // Delete the main daily entry row last
    await connection.query('DELETE FROM daily_entries WHERE entry_date = ?', [date]);

    /* credit_ledger is intentionally NOT deleted. Unlike salary rows, a ledger
       row owns credit_payments that belong to OTHER dates — deleting it would
       destroy recovery history recorded days or weeks later. Ledger rows for
       this date that carry no payments are already cleaned up by the save path.

       connection_events rows are likewise NOT deleted: they are recorded and
       voided only through the Connections screen (admin, audited), not as a
       side-effect of clearing a day. Their money and stock effects reappear
       the moment the day is re-entered. */

    await writeAudit(connection, {
      eventType: 'entry.delete', entityType: 'daily_entry', entityId: date, req, eventDate: date
    });

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Delete Entry Error:', error);
    res.status(500).json({ error: 'Could not delete the entry. Nothing was changed.' });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   3. PAYMENT RECORDING
════════════════════════════════════════════════════════════════ */
app.post('/api/payments', verifyToken, async (req, res) => {
  const { ledgerId, amt, date, note, emptyReturned, idempotencyKey } = req.body || {};

  // Validation — a recovery must reference a real ledger row and carry a
  // positive amount or a positive empty-cylinder return.
  if (!ledgerId) return res.status(400).json({ error: 'ledgerId is required.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return res.status(400).json({ error: 'A valid payment date (YYYY-MM-DD) is required.' });
  }
  if (num(amt) < 0 || num(emptyReturned) < 0) {
    return res.status(400).json({ error: 'Amount and empty cylinders cannot be negative.' });
  }
  if (num(amt) <= 0 && num(emptyReturned) <= 0) {
    return res.status(400).json({ error: 'Enter a payment amount or a number of empty cylinders returned.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock the ledger row so two concurrent recoveries cannot both read a
    // stale recovered total and both decide the credit is still outstanding.
    const [ledger] = await connection.query(
      'SELECT id, original_amount FROM credit_ledger WHERE id = ? FOR UPDATE', [ledgerId]
    );
    if (ledger.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'That credit record no longer exists.' });
    }

    // Idempotency: a double-clicked or retried submit carrying the same key is
    // accepted once and silently ignored thereafter.
    const key = idempotencyKey
      ? String(idempotencyKey).slice(0, 64)
      : crypto.createHash('sha256')
          .update([ledgerId, date, num(amt), num(emptyReturned), note || ''].join('|'))
          .digest('hex').slice(0, 64);

    const [dup] = await connection.query(
      'SELECT id FROM credit_payments WHERE idempotency_key = ?', [key]
    );
    if (dup.length > 0) {
      await connection.commit();
      return res.json({ success: true, duplicate: true });
    }

    const paymentId = crypto.randomBytes(8).toString('hex');
    await connection.query(
      `INSERT INTO credit_payments (id, ledger_id, payment_date, amount, note, empty_returned, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, ledgerId, date, num(amt), note || '', num(emptyReturned), key]
    );

    // Recompute clearance from the authoritative sum inside the same transaction.
    const [payments] = await connection.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM credit_payments WHERE ledger_id = ?', [ledgerId]
    );
    const cleared = num(payments[0].total) >= num(ledger[0].original_amount) ? 1 : 0;
    await connection.query('UPDATE credit_ledger SET cleared = ? WHERE id = ?', [cleared, ledgerId]);

    await connection.commit();
    res.json({ success: true, cleared: !!cleared, recovered: num(payments[0].total) });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      // Lost the race against an identical concurrent submit — that submit won.
      return res.json({ success: true, duplicate: true });
    }
    console.error('Payment Error:', error);
    res.status(500).json({ error: 'Could not record the payment. Nothing was saved.' });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   4. SYNC ADMIN CONFIGS (Boys, Prices, Commissions)
════════════════════════════════════════════════════════════════ */
/* Both sync endpoints replace an entire history table. That makes a malformed
   or empty payload catastrophic — one bad request would wipe every rate ever
   recorded and silently re-value the whole trading history. Every row is
   therefore validated BEFORE anything is deleted, and a payload that would
   empty a table that currently has rows is rejected outright. */
function validateRateRows(arr, kind) {
  if (!Array.isArray(arr)) return 'Expected a list of ' + kind + ' rows.';
  const seen = new Set();
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i] || {};
    const at = `Row ${i + 1}`;
    if (!x.id) return `${at}: missing id.`;
    if (seen.has(x.id)) return `${at}: duplicate id "${x.id}".`;
    seen.add(x.id);
    if (!x.productId) return `${at}: missing product.`;
    if (!DATE_RE.test(String(x.date || ''))) return `${at}: effective date must be YYYY-MM-DD.`;
    const main = kind === 'price' ? num(x.rate) : num(x.perCyl);
    if (!(main >= 0) || !isFinite(main)) return `${at}: rate must be a non-negative number.`;
    if (kind === 'price' && (num(x.sbcRate) < 0 || num(x.dbcRate) < 0)) {
      return `${at}: SBC/DBC rates cannot be negative.`;
    }
  }
  return null;
}

app.post('/api/prices/sync', verifyToken, requireAdmin, async (req, res) => {
  const arr = req.body; // Array of { id, productId, rate, sbcRate, dbcRate, date, note }
  const bad = validateRateRows(arr, 'price');
  if (bad) return res.status(400).json({ error: 'Price history rejected — ' + bad });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[{ n }]] = await connection.query('SELECT COUNT(*) AS n FROM price_history');
    if (arr.length === 0 && Number(n) > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: 'Refusing to delete all price history. Send at least one rate row.'
      });
    }
    await connection.query('DELETE FROM price_history');
    if (arr.length > 0) {
      const vals = arr.map(x => [x.id, x.productId, x.date, num(x.rate), num(x.sbcRate), num(x.dbcRate), x.note || '']);
      await connection.query('INSERT INTO price_history (id, product_id, effective_date, rate, sbc_rate, dbc_rate, note) VALUES ?', [vals]);
    }
    await connection.commit();
    res.json({ success: true, count: arr.length });
  } catch (error) {
    await connection.rollback();
    console.error('Price sync error:', error);
    res.status(500).json({ error: 'Could not save price history. No changes were made.' });
  } finally {
    connection.release();
  }
});

app.post('/api/commissions/sync', verifyToken, requireAdmin, async (req, res) => {
  const arr = req.body; // Array of { id, productId, perCyl, date, note }
  const bad = validateRateRows(arr, 'commission');
  if (bad) return res.status(400).json({ error: 'Commission history rejected — ' + bad });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[{ n }]] = await connection.query('SELECT COUNT(*) AS n FROM commission_history');
    if (arr.length === 0 && Number(n) > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: 'Refusing to delete all commission history. Send at least one row.'
      });
    }
    await connection.query('DELETE FROM commission_history');
    if (arr.length > 0) {
      const vals = arr.map(x => [x.id, x.productId, x.date, num(x.perCyl), x.note || '']);
      await connection.query('INSERT INTO commission_history (id, product_id, effective_date, per_cyl_rate, note) VALUES ?', [vals]);
    }
    await connection.commit();
    res.json({ success: true, count: arr.length });
  } catch (error) {
    await connection.rollback();
    console.error('Commission sync error:', error);
    res.status(500).json({ error: 'Could not save commission history. No changes were made.' });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   5. AUTHENTICATION AND USER MANAGEMENT
════════════════════════════════════════════════════════════════ */

// Public: Login — issues a signed JWT on success.
// Passwords are verified against a bcrypt hash; the old plaintext column is
// never consulted. Accounts whose hash has not been set yet cannot log in and
// must have a password assigned by an administrator (or via set-password.js).
app.post('/api/login', loginRateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  // Both must be plain strings — an object or array here would reach the
  // driver / bcrypt with an unexpected type.
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (username.length > 100 || password.length > 200) {
    return res.status(400).json({ error: 'Invalid username or password.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, username, role, password_hash FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];

    // Always run a bcrypt comparison, even when the user does not exist, so
    // that response timing does not reveal whether a username is valid.
    const hash = (user && user.password_hash) || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !user.password_hash) {
      recordFailedLogin(req._loginKey);
      return res.status(401).json({
        error: user
          ? 'No password has been set for this account. Please ask an administrator to set one.'
          : 'Invalid username or password.',
        passwordNotSet: !!user
      });
    }
    if (!ok) {
      recordFailedLogin(req._loginKey);
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    clearLoginAttempts(req._loginKey);
    const payload = { uid: user.id, username: user.username, role: user.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ success: true, token, role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* Password policy — kept deliberately simple so staff can actually comply. */
const PASSWORD_MIN = 8;
function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters long.`;
  }
  if (pw.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

// Any signed-in user may change their OWN password (current password required).
app.post('/api/change-password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const bad = validatePassword(newPassword);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const [rows] = await pool.query(
      'SELECT id, password_hash FROM users WHERE username = ?', [req.user.username]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (!rows[0].password_hash ||
        !(await bcrypt.compare(String(currentPassword || ''), rows[0].password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = ?, password_reset_required = 0 WHERE id = ?',
      [hash, rows[0].id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Could not change password.' });
  }
});

// Administrators may set a password for any account (used for the forced reset).
app.post('/api/users/:id/password', verifyToken, requireAdmin, async (req, res) => {
  const { newPassword } = req.body || {};
  const bad = validatePassword(newPassword);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const [r] = await pool.query(
      'UPDATE users SET password_hash = ?, password_reset_required = 0 WHERE id = ?',
      [hash, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ error: 'Could not set password.' });
  }
});

// Public: Verify Session — checks if a stored token is still valid
app.post('/api/verify-session', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'No token.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, role: decoded.role, username: decoded.username, exp: decoded.exp });
  } catch (err) {
    res.status(401).json({ valid: false, error: err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid token.' });
  }
});

// Protected: User management (admin only in practice, token required)
app.get('/api/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    // password_reset_required lets the UI flag accounts that still need a password.
    const [rows] = await pool.query(
      `SELECT id, username, role,
              (password_hash IS NULL) AS needsPassword,
              COALESCE(password_reset_required, 0) AS passwordResetRequired
       FROM users ORDER BY username ASC`
    );
    res.json(rows.map(r => ({
      id: r.id, username: r.username, role: r.role,
      needsPassword: !!Number(r.needsPassword),
      passwordResetRequired: !!Number(r.passwordResetRequired)
    })));
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

app.post('/api/users', verifyToken, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'Username is required.' });
  }
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: "Role must be either 'admin' or 'user'." });
  }
  const bad = validatePassword(password);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(
      'INSERT INTO users (username, password_hash, role, password_reset_required) VALUES (?, ?, ?, 0)',
      [String(username).trim(), hash, role]
    );
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That username already exists.' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Could not create user.' });
  }
});

app.delete('/api/users/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    // Guard 1: an administrator must not be able to delete their own account
    // and lock themselves out mid-session.
    const [me] = await pool.query('SELECT id FROM users WHERE username = ?', [req.user.username]);
    if (me.length > 0 && String(me[0].id) === String(req.params.id)) {
      return res.status(400).json({ error: 'You cannot delete the account you are signed in with.' });
    }
    // Guard 2: never allow the last remaining administrator to be removed.
    const [target] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (target.length === 0) return res.status(404).json({ error: 'User not found.' });
    if (target[0].role === 'admin') {
      const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
      if (Number(n) <= 1) {
        return res.status(400).json({ error: 'Cannot delete the only administrator account.' });
      }
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Could not delete user.' });
  }
});

/* ════════════════════════════════════════════════════════════════
   6. VEHICLE MASTER
════════════════════════════════════════════════════════════════ */
/* Master-data endpoints used to crash with a TypeError (→ 500 with a raw
   stack message) when a required string was missing, and echoed raw driver
   errors to the client. Inputs are now checked up front and failures return
   a plain message; details go to the server log only. */
const strField = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const optIntOrNull = (v) => (v === '' || v === null || v === undefined) ? null : (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : NaN);
const validIdParam = (v) => /^\d{1,12}$/.test(String(v));

app.get('/api/vehicles', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vehicles ORDER BY sort_order ASC, id ASC');
    res.json(rows);
  } catch (error) {
    console.error('List vehicles error:', error);
    res.status(500).json({ error: 'Could not load vehicles.' });
  }
});

app.post('/api/vehicles', verifyToken, requireAdmin, async (req, res) => {
  const { vehicleNo, type, capacity, notes } = req.body || {};
  const no = strField(vehicleNo, 30).toUpperCase();
  const cap = optIntOrNull(capacity);
  if (!no) return res.status(400).json({ error: 'Vehicle number is required.' });
  if (Number.isNaN(cap)) return res.status(400).json({ error: 'Capacity must be a whole number.' });
  try {
    const [result] = await pool.query(
      'INSERT INTO vehicles (vehicle_no, type, capacity, notes) VALUES (?, ?, ?, ?)',
      [no, strField(type, 50), cap, strField(notes, 500)]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add vehicle error:', error);
    res.status(500).json({ error: 'Could not add the vehicle.' });
  }
});

app.put('/api/vehicles/:id', verifyToken, requireAdmin, async (req, res) => {
  const { vehicleNo, type, capacity, notes, isActive } = req.body || {};
  const no = strField(vehicleNo, 30).toUpperCase();
  const cap = optIntOrNull(capacity);
  if (!validIdParam(req.params.id)) return res.status(400).json({ error: 'Invalid vehicle id.' });
  if (!no) return res.status(400).json({ error: 'Vehicle number is required.' });
  if (Number.isNaN(cap)) return res.status(400).json({ error: 'Capacity must be a whole number.' });
  try {
    const [r] = await pool.query(
      'UPDATE vehicles SET vehicle_no=?, type=?, capacity=?, notes=?, is_active=? WHERE id=?',
      [no, strField(type, 50), cap, strField(notes, 500), isActive !== undefined ? (isActive ? 1 : 0) : 1, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Update vehicle error:', error);
    res.status(500).json({ error: 'Could not update the vehicle.' });
  }
});

app.patch('/api/vehicles/:id/toggle', verifyToken, requireAdmin, async (req, res) => {
  if (!validIdParam(req.params.id)) return res.status(400).json({ error: 'Invalid vehicle id.' });
  try {
    await pool.query('UPDATE vehicles SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle vehicle error:', error);
    res.status(500).json({ error: 'Could not update the vehicle.' });
  }
});

app.delete('/api/vehicles/:id', verifyToken, requireAdmin, async (req, res) => {
  if (!validIdParam(req.params.id)) return res.status(400).json({ error: 'Invalid vehicle id.' });
  try {
    await pool.query('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'This vehicle has expense records. Mark it inactive instead of deleting it.' });
    }
    console.error('Delete vehicle error:', error);
    res.status(500).json({ error: 'Could not delete the vehicle.' });
  }
});

/* ════════════════════════════════════════════════════════════════
   7. EMPLOYEE MASTER
════════════════════════════════════════════════════════════════ */
app.get('/api/employees', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT id, name, role, salary, phone, DATE_FORMAT(join_date, '%Y-%m-%d') as join_date, notes, is_active FROM employees ORDER BY name ASC`);
    res.json(rows);
  } catch (error) {
    console.error('List employees error:', error);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

const employeeProblem = (b) => {
  if (!strField(b.name, 255)) return 'Name is required.';
  if (b.salary !== undefined && b.salary !== '' && !(Number.isFinite(Number(b.salary)) && Number(b.salary) >= 0)) return 'Salary must be a non-negative number.';
  if (b.joinDate && !DATE_RE.test(String(b.joinDate))) return 'Joining date must be YYYY-MM-DD.';
  return null;
};

app.post('/api/employees', verifyToken, requireAdmin, async (req, res) => {
  const b = req.body || {};
  const bad = employeeProblem(b);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const [result] = await pool.query(
      'INSERT INTO employees (name, role, salary, phone, join_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [strField(b.name, 255), strField(b.role, 50), num(b.salary), strField(b.phone, 20), b.joinDate || null, strField(b.notes, 500)]
    );
    res.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Add employee error:', error);
    res.status(500).json({ error: 'Could not add the employee.' });
  }
});

app.put('/api/employees/:id', verifyToken, requireAdmin, async (req, res) => {
  const b = req.body || {};
  if (!validIdParam(req.params.id)) return res.status(400).json({ error: 'Invalid employee id.' });
  const bad = employeeProblem(b);
  if (bad) return res.status(400).json({ error: bad });
  try {
    const [r] = await pool.query(
      'UPDATE employees SET name=?, role=?, salary=?, phone=?, join_date=?, notes=?, is_active=? WHERE id=?',
      [strField(b.name, 255), strField(b.role, 50), num(b.salary), strField(b.phone, 20), b.joinDate || null, strField(b.notes, 500), b.isActive !== undefined ? (b.isActive ? 1 : 0) : 1, req.params.id]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Employee not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: 'Could not update the employee.' });
  }
});

app.patch('/api/employees/:id/toggle', verifyToken, requireAdmin, async (req, res) => {
  if (!validIdParam(req.params.id)) return res.status(400).json({ error: 'Invalid employee id.' });
  try {
    await pool.query('UPDATE employees SET is_active = NOT is_active WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Toggle employee error:', error);
    res.status(500).json({ error: 'Could not update the employee.' });
  }
});

app.delete('/api/employees/:id', verifyToken, requireAdmin, async (req, res) => {
  if (!validIdParam(req.params.id)) return res.status(400).json({ error: 'Invalid employee id.' });
  try {
    await pool.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'This employee has delivery or salary records. Mark them inactive instead of deleting.' });
    }
    console.error('Delete employee error:', error);
    res.status(500).json({ error: 'Could not delete the employee.' });
  }
});

/* ════════════════════════════════════════════════════════════════
   7b. PRODUCT MASTER
   ════════════════════════════════════════════════════════════════ */
app.get('/api/products', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, label, short_name as shortName, sku, 
              fallback_rate as fallbackRate, fallback_sbc as fallbackSbc, fallback_dbc as fallbackDbc,
              category, is_active as isActive, sort_order as sortOrder,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as createdAt
       FROM products 
       ORDER BY sort_order ASC, id ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ error: 'Could not load products.' });
  }
});

app.post('/api/products', verifyToken, requireAdmin, async (req, res) => {
  const { id, label, shortName, sku, fallbackRate, fallbackSbc, fallbackDbc, category, sortOrder } = req.body || {};
  const cleanLabel = strField(label, 100);
  const cleanShort = strField(shortName, 50);
  const cleanSku = strField(sku, 50);
  const cleanCat = strField(category, 20).toLowerCase() === 'accessory' ? 'accessory' : 'cylinder';
  const order = Number.isInteger(Number(sortOrder)) ? Number(sortOrder) : 0;
  const rate = num(fallbackRate);
  const sbc = num(fallbackSbc);
  const dbc = num(fallbackDbc);

  // Auto-generate ID if empty or missing
  let cleanId = strField(id, 50).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!cleanId) {
    if (cleanCat === 'cylinder') {
      const match = cleanShort.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        cleanId = `p${match[1].replace('.', '_')}`;
      } else {
        const slug = cleanShort.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
        cleanId = slug ? `cyl_${slug}` : `cyl_${Date.now().toString(36)}`;
      }
    } else {
      const slug = (cleanShort || cleanLabel).toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
      cleanId = slug ? `acc_${slug}` : `acc_${Date.now().toString(36)}`;
    }
  }

  if (!cleanId || !/^[a-z0-9_-]{2,50}$/.test(cleanId)) {
    return res.status(400).json({ error: 'Product Code/ID must be 2-50 characters (letters, numbers, hyphens or underscores only, no spaces).' });
  }
  if (!cleanLabel) return res.status(400).json({ error: 'Product label is required.' });
  if (!cleanShort) return res.status(400).json({ error: 'Short display name is required.' });
  if (rate < 0 || sbc < 0 || dbc < 0) return res.status(400).json({ error: 'Rates cannot be negative.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT id FROM products WHERE id = ? FOR UPDATE', [cleanId]);
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: `Product ID "${cleanId}" already exists. Please choose a different short name or code.` });
    }

    await connection.query(
      `INSERT INTO products (id, label, short_name, sku, fallback_rate, fallback_sbc, fallback_dbc, category, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [cleanId, cleanLabel, cleanShort, cleanSku, rate, sbc, dbc, cleanCat, order]
    );

    await writeAudit(connection, {
      eventType: 'product.create',
      entityType: 'product',
      entityId: cleanId,
      req,
      details: { id: cleanId, label: cleanLabel, short: cleanShort, sku: cleanSku, rate, sbc, dbc, category: cleanCat }
    });

    await connection.commit();
    res.json({ success: true, id: cleanId });
  } catch (error) {
    await connection.rollback();
    console.error('Add product error:', error);
    res.status(500).json({ error: 'Could not add the product.' });
  } finally {
    connection.release();
  }
});

app.put('/api/products/:id', verifyToken, requireAdmin, async (req, res) => {
  const targetId = strField(req.params.id, 50).toLowerCase();
  const { label, shortName, sku, fallbackRate, fallbackSbc, fallbackDbc, category, sortOrder, isActive } = req.body || {};
  const cleanLabel = strField(label, 100);
  const cleanShort = strField(shortName, 50);
  const cleanSku = strField(sku, 50);
  const order = Number.isInteger(Number(sortOrder)) ? Number(sortOrder) : 0;
  const rate = num(fallbackRate);
  const sbc = num(fallbackSbc);
  const dbc = num(fallbackDbc);

  if (!cleanLabel) return res.status(400).json({ error: 'Product label is required.' });
  if (!cleanShort) return res.status(400).json({ error: 'Short display name is required.' });
  if (rate < 0 || sbc < 0 || dbc < 0) return res.status(400).json({ error: 'Rates cannot be negative.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [targetId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found.' });
    }

    const activeVal = isActive !== undefined ? (isActive ? 1 : 0) : existing[0].is_active;
    const cleanCat = category !== undefined ? (strField(category, 20).toLowerCase() === 'accessory' ? 'accessory' : 'cylinder') : (existing[0].category || 'cylinder');

    await connection.query(
      `UPDATE products 
       SET label = ?, short_name = ?, sku = ?, fallback_rate = ?, fallback_sbc = ?, fallback_dbc = ?, category = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [cleanLabel, cleanShort, cleanSku, rate, sbc, dbc, cleanCat, order, activeVal, targetId]
    );

    await writeAudit(connection, {
      eventType: 'product.update',
      entityType: 'product',
      entityId: targetId,
      req,
      details: { id: targetId, label: cleanLabel, short: cleanShort, sku: cleanSku, rate, sbc, dbc, category: cleanCat, isActive: activeVal }
    });

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Could not update the product.' });
  } finally {
    connection.release();
  }
});

app.patch('/api/products/:id/toggle', verifyToken, requireAdmin, async (req, res) => {
  const targetId = strField(req.params.id, 50).toLowerCase();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT id, is_active FROM products WHERE id = ? FOR UPDATE', [targetId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found.' });
    }
    const newActive = existing[0].is_active ? 0 : 1;
    await connection.query('UPDATE products SET is_active = ? WHERE id = ?', [newActive, targetId]);
    await writeAudit(connection, {
      eventType: 'product.toggle',
      entityType: 'product',
      entityId: targetId,
      req,
      details: { id: targetId, isActive: newActive }
    });
    await connection.commit();
    res.json({ success: true, isActive: newActive });
  } catch (error) {
    await connection.rollback();
    console.error('Toggle product error:', error);
    res.status(500).json({ error: 'Could not update the product.' });
  } finally {
    connection.release();
  }
});

app.delete('/api/products/:id', verifyToken, requireAdmin, async (req, res) => {
  const targetId = strField(req.params.id, 50).toLowerCase();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT id, label FROM products WHERE id = ? FOR UPDATE', [targetId]);
    if (existing.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Safety checks: check if product is referenced anywhere in transactional tables
    const [[{ c1 }]] = await connection.query('SELECT COUNT(*) as c1 FROM daily_product_stock WHERE product_id = ?', [targetId]);
    const [[{ c2 }]] = await connection.query('SELECT COUNT(*) as c2 FROM godown_stock WHERE product_id = ?', [targetId]);
    const [[{ c3 }]] = await connection.query('SELECT COUNT(*) as c3 FROM vehicle_arrivals WHERE product_id = ?', [targetId]);
    const [[{ c4 }]] = await connection.query('SELECT COUNT(*) as c4 FROM credit_ledger WHERE product_id = ?', [targetId]);
    const [[{ c5 }]] = await connection.query('SELECT COUNT(*) as c5 FROM price_history WHERE product_id = ?', [targetId]);
    const [[{ c6 }]] = await connection.query('SELECT COUNT(*) as c6 FROM commission_history WHERE product_id = ?', [targetId]);
    const [[{ c7 }]] = await connection.query('SELECT COUNT(*) as c7 FROM connection_events WHERE product_id = ?', [targetId]);

    const totalUsage = Number(c1) + Number(c2) + Number(c3) + Number(c4) + Number(c5) + Number(c6) + Number(c7);
    if (totalUsage > 0) {
      await connection.rollback();
      return res.status(409).json({
        error: `Cannot delete "${existing[0].label}" because it has ${totalUsage} historical transaction record(s). Deactivate the product instead.`
      });
    }

    await connection.query('DELETE FROM products WHERE id = ?', [targetId]);
    await writeAudit(connection, {
      eventType: 'product.delete',
      entityType: 'product',
      entityId: targetId,
      req,
      details: { id: targetId, label: existing[0].label }
    });
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(409).json({ error: 'This product is referenced by existing database records. Deactivate it instead.' });
    }
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Could not delete the product.' });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   8. GODOWN STOCK
   ════════════════════════════════════════════════════════════════ */
app.get('/api/godown-stock/:date', verifyToken, async (req, res) => {
  if (!DATE_RE.test(String(req.params.date))) return res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
  try {
    const [rows] = await pool.query(
      "SELECT product_id as productId, filled_qty as `filled`, empty_qty as `empty` FROM godown_stock WHERE entry_date = ?",
      [req.params.date]
    );
    res.json(rows);
  } catch (error) {
    console.error('Godown stock load error:', error);
    res.status(500).json({ error: 'Could not load godown stock.' });
  }
});

app.post('/api/godown-stock', verifyToken, async (req, res) => {
  const { date, items } = req.body || {}; // items: [{productId, filled, empty}]
  // Same date rules as the daily entry: well-formed, not future, office = today only.
  if (!DATE_RE.test(String(date || ''))) return res.status(400).json({ error: 'Invalid date. Expected YYYY-MM-DD.' });
  const today = todayLocal();
  if (date > today) return res.status(400).json({ error: 'Cannot record stock for a future date.' });
  if (req.user.role !== 'admin' && date !== today) {
    return res.status(403).json({ error: 'You can only record today\'s godown stock. Ask an administrator to change a past date.' });
  }
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be a list.' });
  for (const it of items) {
    if (!it || typeof it.productId !== 'string' || !isNonNegNum(it.filled) || !isNonNegNum(it.empty)) {
      return res.status(400).json({ error: 'Each item needs a productId and non-negative filled/empty quantities.' });
    }
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [productRows] = await connection.query('SELECT id FROM products');
    const known = new Set(productRows.map(p => String(p.id)));
    for (const item of items) {
      if (!known.has(item.productId)) {
        await connection.rollback();
        return res.status(400).json({ error: `Unknown product "${item.productId}".` });
      }
      await connection.query(`
        INSERT INTO godown_stock (entry_date, product_id, filled_qty, empty_qty)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE filled_qty = ?, empty_qty = ?
      `, [date, item.productId, num(item.filled), num(item.empty), num(item.filled), num(item.empty)]);
    }
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Godown stock save error:', error);
    res.status(500).json({ error: 'Could not save godown stock. Nothing was changed.' });
  } finally {
    connection.release();
  }
});

/* ════════════════════════════════════════════════════════════════
   9. CONNECTION EVENTS — NEW CONNECTION, ADDITIONAL BOTTLE, SURRENDER
   ────────────────────────────────────────────────────────────────
   Stock + money + accounting ONLY. There is deliberately no customer or
   consumer-wise connection master — BPCL's system already holds that.
   Each event is a dated row per cylinder category:
     new         → qty connections × (single 1 | double 2) filled OUT, no money
     additional  → qty bottles × 1 filled OUT + amount collected (cash|online)
     surrender   → qty connections closed; empties physically returned IN;
                   missing cylinders are penalty-only; gross refund − Σ
                   itemised penalties = net paid OUT (always cash)
   Every mutating route: verifyToken, transactional, idempotent, office
   restricted to today SERVER-SIDE, all money recomputed server-side, and
   every row written to the append-only audit_log. Reports: admin only.
════════════════════════════════════════════════════════════════ */
const newId = () => crypto.randomBytes(8).toString('hex'); // 16 hex chars — fits VARCHAR(20)
const PAYMENT_MODES = new Set(['cash', 'online']);
const CONNECTION_TYPES = new Set(['single', 'double']);
const EVENT_TYPES = new Set(['new', 'additional', 'surrender']);
const MAX_MONEY = 10000000; // ₹1 crore — sanity cap for a single event
const MAX_QTY = 500;        // connections / cylinders in one event
const ID_RE = /^[A-Za-z0-9_-]{1,20}$/;

const cleanStr = (v, max) => (v === undefined || v === null) ? '' : String(v).trim().slice(0, max);
const round2 = (v) => Math.round(Number(v) * 100) / 100;
/* Strict money parser: returns a number, or NaN for anything that is not a
   finite non-negative number within the sanity cap (blank, "abc", -5, 1e12…). */
const parseMoney = (v) => {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return NaN;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) return NaN;
  return round2(n);
};
/* Strict whole-number parser (0..MAX_QTY); NaN otherwise. `dflt` fills a blank. */
const parseQty = (v, dflt) => {
  if (v === '' || v === null || v === undefined) return dflt === undefined ? NaN : dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_QTY ? n : NaN;
};
const cylindersPer = (type) => (type === 'double' ? 2 : 1);

/* Event-date rule shared by every connection endpoint — the SAME rule as
   POST /api/entries: well-formed, not in the future, and non-administrators
   may only write TODAY. Returns { status, error } or null. */
function eventDateProblem(req, date) {
  if (!DATE_RE.test(String(date || ''))) return { status: 400, error: 'Invalid date. Expected YYYY-MM-DD.' };
  const today = todayLocal();
  if (date > today) return { status: 400, error: 'Cannot record connection activity for a future date.' };
  if (req.user.role !== 'admin' && date !== today) {
    return { status: 403, error: 'You can only record connection activity for today. Ask an administrator to record a past date.' };
  }
  return null;
}

/* Idempotency: the client sends a fresh key with every submit; a repeat
   with the same key is answered { duplicate: true } and writes nothing.
   Without a key each request stands alone — a payload digest is NOT used
   as a fallback because two genuinely separate, identical events on one day
   (two customers each surrendering one 14 KG single for the same refund)
   must never be collapsed into one. */
const idemKeyOrRandom = (supplied) => supplied ? String(supplied).slice(0, 64) : 'ev-' + newId() + newId();

async function findDuplicate(conn, key) {
  const [rows] = await conn.query('SELECT entity_type, entity_id, details FROM audit_log WHERE idempotency_key = ?', [key]);
  return rows[0] || null;
}

/* Append-only audit row. Declared as a function so it is hoisted for the
   daily-entry routes above. `details` is stored as JSON. */
async function writeAudit(conn, { eventType, entityType, entityId, req, eventDate, details, idempotencyKey }) {
  try {
    const username = (req && req.user && req.user.username) || 'system';
    const role = (req && req.user && req.user.role) || 'admin';
    await conn.query(
      `INSERT INTO audit_log (event_type, entity_type, entity_id, actor, actor_username, actor_role, event_date, details, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventType, entityType, String(entityId), username, username, role, eventDate || null,
       details ? JSON.stringify(details) : null, idempotencyKey || null]
    );
  } catch (err) {
    console.warn('writeAudit non-fatal warning:', err.message);
  }
}

async function productExists(conn, productId) {
  const [rows] = await conn.query('SELECT id FROM products WHERE id = ?', [productId]);
  return rows.length > 0;
}

/* Map a duplicate-key driver error to the right response: a lost race on
   the idempotency key means "already recorded" (success), not an error. */
function duplicateKeyResponse(res, error) {
  if (/uniq_audit_idem|uniq_cev_idem/.test(error.message || '')) return res.json({ success: true, duplicate: true });
  return null;
}

/* Date-range query guard shared by the list/report endpoints. */
function rangeProblem(q) {
  if (q.from && !DATE_RE.test(String(q.from))) return 'from must be YYYY-MM-DD.';
  if (q.to && !DATE_RE.test(String(q.to))) return 'to must be YYYY-MM-DD.';
  if (q.from && q.to && q.from > q.to) return 'from must not be after to.';
  return null;
}

const EVENT_COLS = `id, DATE_FORMAT(event_date, '%Y-%m-%d') AS date, event_type AS eventType, product_id AS productId,
  connection_type AS connectionType, qty, cylinders_out AS cylindersOut, cylinders_in AS cylindersIn,
  cylinders_missing AS cylindersMissing, amount, payment_mode AS mode, penalty_deducted AS penaltyDeducted,
  net_paid AS netPaid, COALESCE(remarks, '') AS remarks, COALESCE(recorded_by, '') AS recordedBy,
  DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt`;
const shapeEvent = (r, penalties) => ({
  id: r.id, date: r.date, eventType: r.eventType, productId: r.productId, connectionType: r.connectionType || null,
  qty: num(r.qty), cylindersOut: num(r.cylindersOut), cylindersIn: num(r.cylindersIn), cylindersMissing: num(r.cylindersMissing),
  amount: num(r.amount), mode: r.mode || null, penaltyDeducted: num(r.penaltyDeducted), netPaid: num(r.netPaid),
  remarks: r.remarks, recordedBy: r.recordedBy, createdAt: r.createdAt,
  penalties: (penalties || []).filter(p => p.eventId === r.id).map(p => ({ item: p.item, amount: num(p.amount) })),
});
async function penaltiesFor(conn, eventIds) {
  if (eventIds.length === 0) return [];
  const [rows] = await conn.query(
    'SELECT event_id AS eventId, item_name AS item, amount FROM connection_event_penalties WHERE event_id IN (?)', [eventIds]);
  return rows;
}

/* Shared write path for all three event types. `row` is fully validated by
   the caller; this does the transaction, idempotency, product check,
   penalties and audit in one place so the three routes cannot drift. */
async function recordEvent(req, res, { row, penalties, key, auditType }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const dup = await findDuplicate(connection, key);
    if (dup) {
      await connection.commit();
      return res.json({ success: true, duplicate: true, eventId: dup.entity_id });
    }
    if (!(await productExists(connection, row.product_id))) {
      await connection.rollback();
      return res.status(400).json({ error: `Unknown product "${row.product_id}".` });
    }
    const id = newId();
    await connection.query(
      `INSERT INTO connection_events
         (id, event_date, event_type, product_id, connection_type, qty, cylinders_out, cylinders_in, cylinders_missing,
          amount, payment_mode, penalty_deducted, net_paid, remarks, recorded_by, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, row.event_date, row.event_type, row.product_id, row.connection_type || null, row.qty, row.cylinders_out, row.cylinders_in,
       row.cylinders_missing, row.amount, row.payment_mode || null, row.penalty_deducted, row.net_paid, row.remarks || null,
       req.user.username, key]
    );
    if (penalties && penalties.length > 0) {
      await connection.query(
        'INSERT INTO connection_event_penalties (id, event_id, penalty_type, item_name, amount) VALUES ?',
        [penalties.map(p => [newId(), id, 'other', p.item || p.itemDescription || 'Penalty', p.amount])]
      );
    }
    await writeAudit(connection, {
      eventType: auditType, entityType: 'connection_event', entityId: id, req, eventDate: row.event_date,
      details: { ...row, penalties: penalties || [] }, idempotencyKey: key
    });
    await connection.commit();
    return res.json({ success: true, eventId: id, ...row, penalties: penalties || [] });
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      const handled = duplicateKeyResponse(res, error);
      if (handled) return handled;
    }
    console.error(`Connection event (${auditType}) error:`, error);
    return res.status(500).json({ error: 'Could not record the event. Nothing was saved.' });
  } finally {
    connection.release();
  }
}

/* ── 9.1 New connection — stock + optional cash/online payment ── */
app.post('/api/connection-events/new', verifyToken, async (req, res) => {
  const b = req.body || {};
  const date = b.date;
  const productId = cleanStr(b.productId, 50);
  const connectionType = cleanStr(b.connectionType, 10) || 'single';
  const qty = parseQty(b.qty, 1);
  const amount = parseMoney(b.amount || 0);
  const paymentMode = cleanStr(b.paymentMode, 10);
  const remarks = cleanStr(b.remarks, 255); // optional — never required

  const dp = eventDateProblem(req, date);
  if (dp) return res.status(dp.status).json({ error: dp.error });
  if (!productId) return res.status(400).json({ error: 'Cylinder category (product) is required.' });
  if (!CONNECTION_TYPES.has(connectionType)) return res.status(400).json({ error: "Connection type must be 'single' or 'double'." });
  if (!(qty >= 1)) return res.status(400).json({ error: `Number of connections must be a whole number from 1 to ${MAX_QTY}.` });
  if (amount > 0 && !PAYMENT_MODES.has(paymentMode)) {
    return res.status(400).json({ error: "Payment mode must be exactly 'cash' or 'online'." });
  }

  const row = {
    event_date: date, event_type: 'new', product_id: productId, connection_type: connectionType, qty,
    cylinders_out: qty * cylindersPer(connectionType), cylinders_in: 0, cylinders_missing: 0,
    amount, payment_mode: amount > 0 ? paymentMode : (paymentMode || null), penalty_deducted: 0, net_paid: 0, remarks,
  };
  return recordEvent(req, res, { row, penalties: [], key: idemKeyOrRandom(b.idempotencyKey), auditType: 'connection.new' });
});

/* ── 9.2 Additional bottle — filled OUT + cash/online INFLOW ─────── */
app.post('/api/connection-events/additional', verifyToken, async (req, res) => {
  const b = req.body || {};
  const date = b.date;
  const productId = cleanStr(b.productId, 50);
  const qty = parseQty(b.qty, 1);
  const amount = parseMoney(b.amount);
  const paymentMode = cleanStr(b.paymentMode, 10);
  const remarks = cleanStr(b.remarks, 255);

  const dp = eventDateProblem(req, date);
  if (dp) return res.status(dp.status).json({ error: dp.error });
  if (!productId) return res.status(400).json({ error: 'Cylinder category (product) is required.' });
  if (!(qty >= 1)) return res.status(400).json({ error: `Number of additional bottles must be a whole number from 1 to ${MAX_QTY}.` });
  if (!(amount > 0)) return res.status(400).json({ error: 'Amount collected is required and must be greater than zero.' });
  if (!PAYMENT_MODES.has(paymentMode)) return res.status(400).json({ error: "Payment mode must be exactly 'cash' or 'online'." });

  const row = {
    event_date: date, event_type: 'additional', product_id: productId, connection_type: null, qty,
    cylinders_out: qty, cylinders_in: 0, cylinders_missing: 0,   // exactly one filled cylinder per additional bottle
    amount, payment_mode: paymentMode, penalty_deducted: 0, net_paid: 0, remarks,
  };
  return recordEvent(req, res, { row, penalties: [], key: idemKeyOrRandom(b.idempotencyKey), auditType: 'connection.additional' });
});

/* ── 9.3 Surrender — empties IN + cash OUTFLOW net of penalties ──── */
app.post('/api/connection-events/surrender', verifyToken, async (req, res) => {
  const b = req.body || {};
  const date = b.date;
  const productId = cleanStr(b.productId, 50);
  const qty = parseQty(b.qty, 1);
  const cylindersReturned = parseQty(b.cylindersReturned);
  const cylindersMissing = parseQty(b.cylindersMissing, 0);
  const refundAmount = parseMoney(b.refundAmount);
  const remarks = cleanStr(b.remarks, 255);

  const dp = eventDateProblem(req, date);
  if (dp) return res.status(dp.status).json({ error: dp.error });
  if (!productId) return res.status(400).json({ error: 'Cylinder category (product) is required.' });
  if (!(qty >= 1)) return res.status(400).json({ error: `Number of connections surrendered must be a whole number from 1 to ${MAX_QTY}.` });
  if (Number.isNaN(cylindersReturned)) return res.status(400).json({ error: 'Number of empty cylinders returned is required (0 or more).' });
  if (Number.isNaN(cylindersMissing)) return res.status(400).json({ error: 'Missing cylinders must be a whole number (0 or more).' });
  if (cylindersReturned + cylindersMissing > qty * 2) {
    return res.status(400).json({ error: `${qty} connection(s) can hold at most ${qty * 2} cylinders; returned + missing cannot exceed that.` });
  }
  if (cylindersReturned + cylindersMissing < qty) {
    return res.status(400).json({ error: `${qty} connection(s) hold at least ${qty} cylinder(s); account for each as returned or missing.` });
  }
  if (Number.isNaN(refundAmount)) return res.status(400).json({ error: 'Refund amount must be a non-negative number.' });
  if (b.penalties !== undefined && !Array.isArray(b.penalties)) return res.status(400).json({ error: 'penalties must be a list.' });
  const penalties = [];
  for (let i = 0; i < (b.penalties || []).length; i++) {
    const p = b.penalties[i] || {};
    const item = cleanStr(p.itemDescription ?? p.item, 100);
    const amt = parseMoney(p.amount);
    if (!item) return res.status(400).json({ error: `Penalty ${i + 1}: description is required.` });
    if (!(amt > 0)) return res.status(400).json({ error: `Penalty ${i + 1} (${item}): amount must be greater than zero.` });
    penalties.push({ item, amount: amt });
  }
  if (penalties.length > 20) return res.status(400).json({ error: 'Too many penalty items (max 20).' });

  // Money is computed HERE, never taken from the client.
  const penaltySum = round2(penalties.reduce((s, p) => s + p.amount, 0));
  const netPaid = round2(refundAmount - penaltySum);
  if (netPaid < 0) {
    return res.status(400).json({ error: `Penalties (₹${penaltySum}) exceed the refund amount (₹${refundAmount}). Net paid cannot be negative.` });
  }

  const row = {
    event_date: date, event_type: 'surrender', product_id: productId, connection_type: null, qty,
    cylinders_out: 0, cylinders_in: cylindersReturned, cylinders_missing: cylindersMissing, // only returned cylinders enter stock
    amount: refundAmount, payment_mode: null, penalty_deducted: penaltySum, net_paid: netPaid, remarks,
  };
  return recordEvent(req, res, { row, penalties, key: idemKeyOrRandom(b.idempotencyKey), auditType: 'connection.surrender' });
});

/* ── 9.4 Daily register (all roles; office uses it for "today") ──── */
app.get('/api/connection-events', verifyToken, async (req, res) => {
  const bad = rangeProblem(req.query);
  if (bad) return res.status(400).json({ error: bad });
  const from = req.query.from || todayLocal();
  const to = req.query.to || from;
  const type = cleanStr(req.query.type, 12);
  const productId = cleanStr(req.query.productId, 50);
  if (type && !EVENT_TYPES.has(type)) return res.status(400).json({ error: 'type must be new, additional or surrender.' });
  try {
    const params = [from, to];
    let where = 'event_date BETWEEN ? AND ?';
    if (type) { where += ' AND event_type = ?'; params.push(type); }
    if (productId) { where += ' AND product_id = ?'; params.push(productId); }
    const [rows] = await pool.query(`SELECT ${EVENT_COLS} FROM connection_events WHERE ${where} ORDER BY event_date DESC, created_at DESC LIMIT 5000`, params);
    const pens = await penaltiesFor(pool, rows.map(r => r.id));
    const events = rows.map(r => shapeEvent(r, pens));
    const sum = (f) => round2(events.reduce((s, e) => s + f(e), 0));
    res.json({
      from, to, events,
      totals: {
        newConnections: sum(e => e.eventType === 'new' ? e.qty : 0),
        additionalBottles: sum(e => e.eventType === 'additional' ? e.qty : 0),
        surrenders: sum(e => e.eventType === 'surrender' ? e.qty : 0),
        cylindersOut: sum(e => e.cylindersOut), cylindersIn: sum(e => e.cylindersIn), cylindersMissing: sum(e => e.cylindersMissing),
        collectedCash: sum(e => (e.eventType === 'additional' || e.eventType === 'new') && e.mode === 'cash' ? e.amount : 0),
        collectedOnline: sum(e => (e.eventType === 'additional' || e.eventType === 'new') && e.mode === 'online' ? e.amount : 0),
        refundGross: sum(e => e.eventType === 'surrender' ? e.amount : 0),
        penaltyDeducted: sum(e => e.penaltyDeducted), netPaid: sum(e => e.netPaid),
      }
    });
  } catch (error) {
    console.error('Connection events list error:', error);
    res.status(500).json({ error: 'Could not load connection events.' });
  }
});

/* ── 9.5 Admin: delete (void) a wrongly entered event — audited ──── */
app.delete('/api/connection-events/:id', verifyToken, requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid event id.' });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`SELECT ${EVENT_COLS} FROM connection_events WHERE id = ? FOR UPDATE`, [id]);
    if (rows.length === 0) { await connection.rollback(); return res.status(404).json({ error: 'Event not found.' }); }
    const pens = await penaltiesFor(connection, [id]);
    await connection.query('DELETE FROM connection_event_penalties WHERE event_id = ?', [id]);
    await connection.query('DELETE FROM connection_events WHERE id = ?', [id]);
    await writeAudit(connection, {
      eventType: 'connection.delete', entityType: 'connection_event', entityId: id, req, eventDate: rows[0].date,
      details: { deleted: shapeEvent(rows[0], pens), reason: cleanStr((req.body || {}).reason, 255) || null }
    });
    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Delete connection event error:', error);
    res.status(500).json({ error: 'Could not delete the event. Nothing was changed.' });
  } finally {
    connection.release();
  }
});

/* ── 9.6 Admin reports ───────────────────────────────────────────── */
const AGG_COLS = `product_id AS productId, event_type AS eventType, connection_type AS connectionType,
  COUNT(*) AS events, SUM(qty) AS qty, SUM(cylinders_out) AS cylindersOut, SUM(cylinders_in) AS cylindersIn,
  SUM(cylinders_missing) AS cylindersMissing, SUM(amount) AS amount,
  SUM(CASE WHEN payment_mode = 'cash' THEN amount ELSE 0 END) AS cash,
  SUM(CASE WHEN payment_mode = 'online' THEN amount ELSE 0 END) AS online,
  SUM(penalty_deducted) AS penalty, SUM(net_paid) AS netPaid`;

const emptyBucket = () => ({ events: 0, qty: 0, cylindersOut: 0, cylindersIn: 0, cylindersMissing: 0, amount: 0, cash: 0, online: 0, penalty: 0, netPaid: 0 });
const addBucket = (b, r) => {
  if (!b || !r) return b;
  for (const k of Object.keys(b)) b[k] = round2(b[k] + num(r[k]));
  return b;
};

/* Connections report + cylinders-in-market reconciliation. */
app.get('/api/connections/reports/summary', verifyToken, requireAdmin, async (req, res) => {
  const bad = rangeProblem(req.query);
  if (bad) return res.status(400).json({ error: bad });
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || todayLocal();
  try {
    const [productsRows] = await pool.query('SELECT id, label, category, is_active FROM products ORDER BY sort_order ASC, id ASC');
    const cylinderRows = productsRows.filter(p => p.category !== 'accessory' && p.is_active !== 0 && p.isActive !== 0);
    const products = cylinderRows.length > 0 ? cylinderRows : productsRows;

    let periodRows = [];
    try {
      [periodRows] = await pool.query(
        `SELECT ${AGG_COLS} FROM connection_events WHERE event_date BETWEEN ? AND ? GROUP BY product_id, event_type, connection_type`, [from, to]);
    } catch (e1) {
      console.warn('Period rows query fallback:', e1.message);
    }

    let allRows = [];
    try {
      [allRows] = await pool.query(
        `SELECT ${AGG_COLS} FROM connection_events GROUP BY product_id, event_type, connection_type`);
    } catch (e2) {
      console.warn('All rows query fallback:', e2.message);
    }

    // Latest recorded closing stock + godown count per product for the cross-check.
    let stockRows = [];
    try {
      [stockRows] = await pool.query(
        `SELECT s.product_id AS productId, s.closing_stock AS closingStock, DATE_FORMAT(s.entry_date, '%Y-%m-%d') AS date
           FROM daily_product_stock s
           JOIN (SELECT product_id, MAX(entry_date) AS d FROM daily_product_stock GROUP BY product_id) m
             ON m.product_id = s.product_id AND m.d = s.entry_date`);
    } catch (stErr) {
      console.warn('Stock rows load error in summary:', stErr.message);
    }

    let godownRows = [];
    try {
      [godownRows] = await pool.query(
        `SELECT g.product_id AS productId, g.filled_qty AS filled, g.empty_qty AS empty, DATE_FORMAT(g.entry_date, '%Y-%m-%d') AS date
           FROM godown_stock g
           JOIN (SELECT product_id, MAX(entry_date) AS d FROM godown_stock GROUP BY product_id) m
             ON m.product_id = g.product_id AND m.d = g.entry_date`);
    } catch (gdErr) {
      console.warn('Godown rows load error in summary:', gdErr.message);
    }

    const bucketise = (rows, pid) => {
      const b = { new: emptyBucket(), newSingle: emptyBucket(), newDouble: emptyBucket(), additional: emptyBucket(), surrender: emptyBucket() };
      for (const r of (rows || []).filter(r => r && r.productId === pid)) {
        if (r.eventType && b[r.eventType]) {
          addBucket(b[r.eventType], r);
        }
        if (r.eventType === 'new') {
          const target = r.connectionType === 'double' ? b.newDouble : b.newSingle;
          if (target) addBucket(target, r);
        }
      }
      return b;
    };

    const perProduct = (products || []).map(p => {
      const period = bucketise(periodRows, p.id);
      const all = bucketise(allRows, p.id);
      const st = (stockRows || []).find(r => r && r.productId === p.id) || {};
      const gd = (godownRows || []).find(r => r && r.productId === p.id) || {};
      const issued = all.new.cylindersOut + all.additional.cylindersOut;
      const returned = all.surrender.cylindersIn;
      const missing = all.surrender.cylindersMissing;
      return {
        productId: p.id,
        period: {
          newConnections: period.new.qty, newSingle: period.newSingle.qty, newDouble: period.newDouble.qty,
          newCylindersIssued: period.new.cylindersOut,
          additionalBottles: period.additional.qty, additionalAmount: period.additional.amount,
          additionalCash: period.additional.cash, additionalOnline: period.additional.online,
          surrenders: period.surrender.qty, cylindersReturned: period.surrender.cylindersIn, cylindersMissing: period.surrender.cylindersMissing,
          refundAmount: period.surrender.amount, penaltyDeducted: period.surrender.penalty, netPaid: period.surrender.netPaid,
          netConnectionChange: period.new.qty - period.surrender.qty,
          netCylinderChange: period.new.cylindersOut + period.additional.cylindersOut - period.surrender.cylindersIn - period.surrender.cylindersMissing,
        },
        market: {
          activeConnections: all.new.qty - all.surrender.qty,
          issued, returned, missing,
          cylindersWithCustomers: issued - returned - missing,
        },
        stock: {
          closingStock: st.closingStock !== undefined && st.closingStock !== null ? num(st.closingStock) : null, asOf: st.date || null,
          godownFilled: gd.filled !== undefined && gd.filled !== null ? num(gd.filled) : null, godownEmpty: gd.empty !== undefined && gd.empty !== null ? num(gd.empty) : null, godownAsOf: gd.date || null,
        },
      };
    });

    const sumP = (k) => round2(perProduct.reduce((s, p) => s + num(p.period && p.period[k]), 0));
    const sumM = (k) => perProduct.reduce((s, p) => s + num(p.market && p.market[k]), 0);

    res.json({
      from, to,
      period: {
        newConnections: sumP('newConnections'), additionalBottles: sumP('additionalBottles'), surrenders: sumP('surrenders'),
        netConnectionChange: sumP('netConnectionChange'), netCylinderChange: sumP('netCylinderChange'),
        additionalCash: sumP('additionalCash'), additionalOnline: sumP('additionalOnline'),
        refundAmount: sumP('refundAmount'), penaltyDeducted: sumP('penaltyDeducted'), netPaid: sumP('netPaid'),
        netCashEffect: round2(sumP('additionalCash') - sumP('netPaid')),
      },
      market: { activeConnections: sumM('activeConnections'), issued: sumM('issued'), returned: sumM('returned'), missing: sumM('missing'), cylindersWithCustomers: sumM('cylindersWithCustomers') },
      perProduct,
    });
  } catch (error) {
    console.error('Connections summary error:', error);
    res.status(500).json({ error: 'Could not build the connections report.', message: error.message });
  }
});

/* Month-wise trend: one row per month × product (or all products). */
app.get('/api/connections/reports/monthly', verifyToken, requireAdmin, async (req, res) => {
  const bad = rangeProblem(req.query);
  if (bad) return res.status(400).json({ error: bad });
  const from = req.query.from || '1970-01-01';
  const to = req.query.to || todayLocal();
  const productId = cleanStr(req.query.productId, 50);
  try {
    const params = [from, to];
    let where = 'event_date BETWEEN ? AND ?';
    if (productId) { where += ' AND product_id = ?'; params.push(productId); }
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(event_date, '%Y-%m') AS month, ${AGG_COLS} FROM connection_events WHERE ${where}
        GROUP BY DATE_FORMAT(event_date, '%Y-%m'), product_id, event_type, connection_type ORDER BY month ASC`, params);
    const months = {};
    for (const r of rows) {
      const m = months[r.month] || (months[r.month] = { month: r.month, newConnections: 0, newCylindersIssued: 0, additionalBottles: 0, additionalCash: 0, additionalOnline: 0,
                                                         surrenders: 0, cylindersReturned: 0, cylindersMissing: 0, refundAmount: 0, penaltyDeducted: 0, netPaid: 0 });
      if (r.eventType === 'new') {
        m.newConnections += num(r.qty);
        m.newCylindersIssued += num(r.cylindersOut);
        m.newCash = round2((m.newCash || 0) + num(r.cash));
        m.newOnline = round2((m.newOnline || 0) + num(r.online));
      }
      if (r.eventType === 'additional') { m.additionalBottles += num(r.qty); m.additionalCash = round2(m.additionalCash + num(r.cash)); m.additionalOnline = round2(m.additionalOnline + num(r.online)); }
      if (r.eventType === 'surrender') { m.surrenders += num(r.qty); m.cylindersReturned += num(r.cylindersIn); m.cylindersMissing += num(r.cylindersMissing);
        m.refundAmount = round2(m.refundAmount + num(r.amount)); m.penaltyDeducted = round2(m.penaltyDeducted + num(r.penalty)); m.netPaid = round2(m.netPaid + num(r.netPaid)); }
    }
    const list = Object.values(months).map(m => ({ ...m, netCashEffect: round2((m.additionalCash + (m.newCash || 0)) - m.netPaid), netConnectionChange: m.newConnections - m.surrenders }));
    res.json({ from, to, productId: productId || null, months: list });
  } catch (error) {
    console.error('Connections monthly report error:', error);
    res.status(500).json({ error: 'Could not build the monthly report.' });
  }
});

/* Payments collected register (additional bottles & new connections). */
app.get('/api/connections/payments', verifyToken, requireAdmin, async (req, res) => {
  const bad = rangeProblem(req.query);
  if (bad) return res.status(400).json({ error: bad });
  const mode = cleanStr(req.query.mode, 10);
  const productId = cleanStr(req.query.productId, 50);
  if (mode && !PAYMENT_MODES.has(mode)) return res.status(400).json({ error: "mode must be 'cash' or 'online'." });
  try {
    const params = [];
    let where = "(event_type = 'additional' OR (event_type = 'new' AND amount > 0))";
    if (req.query.from) { where += ' AND event_date >= ?'; params.push(req.query.from); }
    if (req.query.to)   { where += ' AND event_date <= ?'; params.push(req.query.to); }
    if (mode)           { where += ' AND payment_mode = ?'; params.push(mode); }
    if (productId)      { where += ' AND product_id = ?'; params.push(productId); }
    const [rows] = await pool.query(`SELECT ${EVENT_COLS} FROM connection_events WHERE ${where} ORDER BY event_date DESC, created_at DESC LIMIT 5000`, params);
    const list = rows.map(r => shapeEvent(r, []));
    res.json({
      rows: list,
      totals: {
        count: list.length, bottles: list.reduce((s, r) => s + r.qty, 0),
        cash: round2(list.filter(r => r.mode === 'cash').reduce((s, r) => s + r.amount, 0)),
        online: round2(list.filter(r => r.mode === 'online').reduce((s, r) => s + r.amount, 0)),
        total: round2(list.reduce((s, r) => s + r.amount, 0)),
      }
    });
  } catch (error) {
    console.error('Connection payments report error:', error);
    res.status(500).json({ error: 'Could not load connection payments.' });
  }
});

/* Refunds paid register (surrenders) with penalty line items + breakdown. */
app.get('/api/connections/refunds', verifyToken, requireAdmin, async (req, res) => {
  const bad = rangeProblem(req.query);
  if (bad) return res.status(400).json({ error: bad });
  const productId = cleanStr(req.query.productId, 50);
  try {
    const params = [];
    let where = "event_type = 'surrender'";
    if (req.query.from) { where += ' AND event_date >= ?'; params.push(req.query.from); }
    if (req.query.to)   { where += ' AND event_date <= ?'; params.push(req.query.to); }
    if (productId)      { where += ' AND product_id = ?'; params.push(productId); }
    const [rows] = await pool.query(`SELECT ${EVENT_COLS} FROM connection_events WHERE ${where} ORDER BY event_date DESC, created_at DESC LIMIT 5000`, params);
    const pens = await penaltiesFor(pool, rows.map(r => r.id));
    const list = rows.map(r => shapeEvent(r, pens));
    const breakdown = {};
    for (const p of pens) {
      const k = String(p.item).trim().toLowerCase();
      if (!breakdown[k]) breakdown[k] = { item: p.item, count: 0, amount: 0 };
      breakdown[k].count += 1;
      breakdown[k].amount = round2(breakdown[k].amount + num(p.amount));
    }
    res.json({
      rows: list,
      totals: {
        count: list.length, connections: list.reduce((s, r) => s + r.qty, 0),
        refundAmount: round2(list.reduce((s, r) => s + r.amount, 0)),
        penaltyDeducted: round2(list.reduce((s, r) => s + r.penaltyDeducted, 0)),
        netPaid: round2(list.reduce((s, r) => s + r.netPaid, 0)),
        cylindersReturned: list.reduce((s, r) => s + r.cylindersIn, 0),
        cylindersMissing: list.reduce((s, r) => s + r.cylindersMissing, 0),
      },
      penaltyBreakdown: Object.values(breakdown).sort((a, b) => b.amount - a.amount),
    });
  } catch (error) {
    console.error('Connection refunds report error:', error);
    res.status(500).json({ error: 'Could not load connection refunds.' });
  }
});

/* Audit trail viewer (admin). Read-only; the table is append-only. */
app.get('/api/audit', verifyToken, requireAdmin, async (req, res) => {
  const bad = rangeProblem(req.query);
  if (bad) return res.status(400).json({ error: bad });
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const entityType = cleanStr(req.query.entityType, 40);
  const entityId = cleanStr(req.query.entityId, 40);
  try {
    const params = [];
    let where = '1=1';
    if (req.query.from) { where += ' AND created_at >= ?'; params.push(req.query.from + ' 00:00:00'); }
    if (req.query.to)   { where += ' AND created_at <= ?'; params.push(req.query.to + ' 23:59:59'); }
    if (entityType)     { where += ' AND entity_type = ?'; params.push(entityType); }
    if (entityId)       { where += ' AND entity_id = ?'; params.push(entityId); }
    const [rows] = await pool.query(
      `SELECT id, event_type AS eventType, entity_type AS entityType, entity_id AS entityId, actor, actor_role AS actorRole,
              DATE_FORMAT(event_date, '%Y-%m-%d') AS eventDate, details, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
         FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT ?`, [...params, limit]);
    res.json(rows.map(r => ({ ...r, details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details })));
  } catch (error) {
    console.error('Audit read error:', error);
    res.status(500).json({ error: 'Could not load the audit log.' });
  }
});

/* ════════════════════════════════════════════════════════════════
   10. FALLBACK HANDLERS
   Unknown routes and unexpected errors (malformed JSON, a route that
   throws) previously fell through to Express' default HTML page, which
   the React client could not parse. Both now answer in JSON.
════════════════════════════════════════════════════════════════ */
app.use((req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
});
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err && /CORS/.test(err.message || '')) {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 3001;

module.exports = app;

if (require.main === module) {
  runMigrations().then(() => {
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  }).catch(err => {
    console.error("Failed to run migrations:", err);
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  });
}

