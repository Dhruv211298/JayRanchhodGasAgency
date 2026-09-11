#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   set-password.js — bootstrap / reset a login password
   ────────────────────────────────────────────────────────────────
   After the security migration runs, every stored plaintext password
   is cleared and nobody can sign in. Use this script once to set the
   first administrator password; after that you can manage passwords
   from the Users tab in the admin portal.

   Usage:
       node scripts/set-password.js <username> <newPassword>
       node scripts/set-password.js --list

   Reads the same DB_* environment variables as server.js, so run it
   with the same environment (locally, or from the Render shell).
════════════════════════════════════════════════════════════════ */
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const PASSWORD_MIN = 8;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit: 2,
  dateStrings: true,
});

function validate(pw) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters long.`;
  }
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

async function ensureColumns() {
  const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'password_hash'");
  if (cols.length === 0) {
    await pool.query("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL COMMENT 'bcrypt hash'");
    await pool.query("ALTER TABLE users ADD COLUMN password_reset_required TINYINT(1) NOT NULL DEFAULT 0");
    console.log('Added password_hash / password_reset_required columns.');
  }
}

async function list() {
  const [rows] = await pool.query(
    `SELECT id, username, role, (password_hash IS NULL) AS needsPassword
     FROM users ORDER BY username ASC`
  );
  if (rows.length === 0) { console.log('No user accounts exist.'); return; }
  console.log('');
  console.log('  ID   USERNAME                ROLE     PASSWORD');
  console.log('  ' + '-'.repeat(58));
  for (const r of rows) {
    console.log(
      '  ' + String(r.id).padEnd(5) +
      String(r.username).padEnd(24) +
      String(r.role).padEnd(9) +
      (Number(r.needsPassword) ? 'NOT SET — must be assigned' : 'set')
    );
  }
  console.log('');
}

(async () => {
  const args = process.argv.slice(2);
  try {
    await ensureColumns();

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
      console.log('Usage: node scripts/set-password.js <username> <newPassword>');
      console.log('       node scripts/set-password.js --list');
      process.exitCode = 1;
      return;
    }

    if (args[0] === '--list') { await list(); return; }

    const [username, newPassword] = args;
    if (!username || !newPassword) {
      console.error('ERROR: both <username> and <newPassword> are required.');
      process.exitCode = 1;
      return;
    }
    const bad = validate(newPassword);
    if (bad) { console.error('ERROR: ' + bad); process.exitCode = 1; return; }

    const [rows] = await pool.query('SELECT id, role FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      console.error(`ERROR: no user named "${username}".`);
      console.error('Existing accounts:');
      await list();
      process.exitCode = 1;
      return;
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = ?, password_reset_required = 0, password = NULL WHERE id = ?',
      [hash, rows[0].id]
    );
    console.log(`OK — password set for "${username}" (role: ${rows[0].role}).`);
    console.log('You can now sign in with this password.');
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
