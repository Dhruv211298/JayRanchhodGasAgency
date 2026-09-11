-- ════════════════════════════════════════════════════════════════════════
--  Schema changes required by the security + data-integrity release
--  Database: jay_ranchhod_gas_agency
--  Date:     2026-08-06
-- ════════════════════════════════════════════════════════════════════════
--
--  YOU DO NOT NORMALLY NEED TO RUN THIS FILE.
--  server.js applies all of these automatically at start-up (runMigrations),
--  and every statement is guarded so it is safe to re-run. This file exists
--  only for applying the changes by hand.
--
--  Every statement below is idempotent — running it twice is harmless.
--  TAKE A DATABASE BACKUP FIRST.
--
--  Only THREE tables are touched:  users, credit_payments
--  No data other than the plaintext password column is modified.
--  No table is dropped. No existing column is removed.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. USERS — bcrypt password storage
-- ────────────────────────────────────────────────────────────────────────
-- Holds the bcrypt hash. NULL means "no password set — cannot sign in".
ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(255) NULL COMMENT 'bcrypt hash of the login password';

-- Flags accounts carried over from the plaintext scheme.
ALTER TABLE users
  ADD COLUMN password_reset_required TINYINT(1) NOT NULL DEFAULT 0;

-- IMPORTANT: run this BEFORE the UPDATE below.
-- The legacy `password` column is almost certainly NOT NULL. Clearing it
-- would fail under STRICT_TRANS_TABLES and the plaintext passwords would
-- silently survive. The column is kept (not dropped) so the change stays
-- reversible from a backup.
ALTER TABLE users
  MODIFY COLUMN password VARCHAR(255) NULL;

-- Clear every stored plaintext password and flag the account for reset.
-- AFTER THIS RUNS, NOBODY CAN LOG IN until a password is set — see step 4.
UPDATE users
   SET password_reset_required = 1,
       password = NULL
 WHERE password_hash IS NULL
   AND password IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────
-- 2. USERS — unique username
-- ────────────────────────────────────────────────────────────────────────
-- Prevents two accounts sharing a username, which would make login
-- non-deterministic.
--
-- If this fails with "Duplicate entry", you have duplicate usernames.
-- Find them first:
--     SELECT username, COUNT(*) c FROM users GROUP BY username HAVING c > 1;
-- Resolve those rows, then re-run this statement.
ALTER TABLE users
  ADD UNIQUE KEY uniq_users_username (username);


-- ────────────────────────────────────────────────────────────────────────
-- 3. CREDIT_PAYMENTS — double-submit protection
-- ────────────────────────────────────────────────────────────────────────
-- A key sent by the client with each recovery. The unique index is what
-- actually prevents a double-clicked payment from being recorded twice.
-- Existing rows stay NULL, and MySQL permits many NULLs in a unique index,
-- so no historical data is affected.
ALTER TABLE credit_payments
  ADD COLUMN idempotency_key VARCHAR(64) NULL COMMENT 'prevents duplicate submission of the same recovery';

ALTER TABLE credit_payments
  ADD UNIQUE KEY uniq_cp_idem (idempotency_key);


-- ════════════════════════════════════════════════════════════════════════
--  VERIFY
-- ════════════════════════════════════════════════════════════════════════
-- Expect: password_hash and password_reset_required present; password nullable
--   SHOW COLUMNS FROM users;
--
-- Expect: idempotency_key present and nullable
--   SHOW COLUMNS FROM credit_payments;
--
-- Expect: uniq_users_username listed
--   SHOW INDEX FROM users;
--
-- Expect: uniq_cp_idem listed
--   SHOW INDEX FROM credit_payments;
--
-- Expect: every row shows password_hash NULL and password NULL right after
-- the migration, then password_hash filled in as you set each password.
--   SELECT id, username, role,
--          (password_hash IS NULL) AS needs_password,
--          (password IS NOT NULL)  AS plaintext_still_present
--     FROM users ORDER BY username;
--
-- plaintext_still_present must be 0 for every row. If any row shows 1, the
-- UPDATE in section 1 did not apply — check that `password` is nullable.


-- ════════════════════════════════════════════════════════════════════════
--  AFTER APPLYING — set the first password (mandatory)
-- ════════════════════════════════════════════════════════════════════════
--  Passwords must be bcrypt hashes, so they CANNOT be set with plain SQL.
--  From the backend directory, with the same DB_* environment variables:
--
--      node scripts/set-password.js --list
--      node scripts/set-password.js <username> <newPassword>
--
--  Then set the rest from Admin -> Users -> Set password.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
--  NOT A SCHEMA CHANGE, BUT REQUIRED: repair the stock data
-- ════════════════════════════════════════════════════════════════════════
--  daily_product_stock.opening_stock and .closing_stock hold values produced
--  by the buggy formula (credit-sale cylinders were not deducted). No schema
--  change fixes this — the chain has to be recomputed. Do NOT attempt it in
--  SQL; use the script, which reports before it writes:
--
--      node scripts/repair-stock.js            # dry run, changes nothing
--      node scripts/repair-stock.js --apply    # writes, inside a transaction
--
--  To see the scale of the drift before running anything, this query lists
--  every day where filled cylinders were issued on credit — those are the
--  days whose closing stock is overstated:
--
--      SELECT cl.entry_date,
--             cl.product_id,
--             SUM(cl.filled_qty) AS credit_cylinders_not_deducted
--        FROM credit_ledger cl
--       WHERE COALESCE(cl.filled_qty, 0) > 0
--       GROUP BY cl.entry_date, cl.product_id
--       ORDER BY cl.entry_date;
--
--  And this gives the total overstatement per product across all history:
--
--      SELECT product_id,
--             SUM(filled_qty) AS total_cylinders_overstated
--        FROM credit_ledger
--       WHERE COALESCE(filled_qty, 0) > 0
--       GROUP BY product_id;
-- ════════════════════════════════════════════════════════════════════════
