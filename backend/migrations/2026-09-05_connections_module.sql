-- ════════════════════════════════════════════════════════════════════════
--  Schema changes for the Connection Events module
--  (new connection / additional-bottle payment / surrender refund)
--  + append-only audit log
--  Database: jay_ranchhod_gas_agency
--  Date:     2026-09-05
-- ════════════════════════════════════════════════════════════════════════
--
--  YOU DO NOT NORMALLY NEED TO RUN THIS FILE.
--  server.js applies all of these automatically at start-up (runMigrations,
--  "Migration 6"), and every statement is guarded so it is safe to re-run.
--  This file exists only for applying the changes by hand, and as the
--  documented, version-controlled shape of the new tables.
--
--  Every statement below is idempotent — running it twice is harmless.
--  TAKE A DATABASE BACKUP FIRST.
--
--  THREE NEW tables are created. NO existing table is touched.
--  No table is dropped. No existing column is removed or modified.
--
--  DESIGN NOTES (read before changing anything)
--  ─────────────────────────────────────────────
--  * There is deliberately NO customer / consumer-wise connection master.
--    BPCL's own system already holds consumer names, numbers, addresses and
--    the security-deposit record. This system records only what moves STOCK
--    and MONEY at the dealer's counter, per cylinder category.
--  * There is deliberately NO deposit ledger, deposit-rate table or
--    "deposits held" figure anywhere.
--  * One table, three event types:
--      new         → qty connections × (single 1 | double 2) filled OUT.
--                    No money.
--      additional  → qty bottles × 1 filled OUT + amount collected, cash or
--                    online. Only CASH enters cash-on-hand (like
--                    daily_other_cash_credits); online is reported only
--                    (like daily_cheque_online).
--      surrender   → qty connections closed. cylinders_in = empties
--                    PHYSICALLY returned (enter empty stock). cylinders_missing
--                    = not returned (penalty only, never stock). net_paid =
--                    amount (gross refund) − Σ penalties, paid in CASH (like
--                    daily_expenses).
--  * Cylinder movements are fed INTO the existing closing-stock formula
--    (computeClosingStock in app/src/constants.js) as one more outward term
--    and into the empty balance as one more inward term. Nothing here ever
--    writes to daily_product_stock, so a re-save of the Day Entry form
--    cannot wipe a connection movement — it is re-derived on every load.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. CONNECTION_EVENTS — every stock / money event, one row each
-- ────────────────────────────────────────────────────────────────────────
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
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────────────────
-- 2. CONNECTION_EVENT_PENALTIES — itemised deductions on one surrender
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connection_event_penalties (
  id                VARCHAR(20)   NOT NULL PRIMARY KEY,
  event_id          VARCHAR(20)   NOT NULL,
  item_description  VARCHAR(100)  NOT NULL COMMENT 'pipe / stove (ACCESSORIES ids) or free text e.g. regulator, missing cylinder',
  amount            DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_cevp_event FOREIGN KEY (event_id) REFERENCES connection_events(id),
  INDEX idx_cevp_event (event_id),
  INDEX idx_cevp_item  (item_description)
) ENGINE=InnoDB;


-- ────────────────────────────────────────────────────────────────────────
-- 3. AUDIT_LOG — append-only record of who did what, when
-- ────────────────────────────────────────────────────────────────────────
-- Closes the "no audit log of back-dated edits" item from the previous
-- release. Every connection event (and every admin void of one), every
-- admin back-dated daily-entry save and every day deletion writes one row
-- here. Rows are never updated or deleted by the application.
-- idempotency_key is UNIQUE: it is what makes a double-submitted event land
-- exactly once.
CREATE TABLE IF NOT EXISTS audit_log (
  id               VARCHAR(20)  NOT NULL PRIMARY KEY,
  event_type       VARCHAR(40)  NOT NULL COMMENT 'connection.new / .additional / .surrender / .delete, entry.backdated_save, entry.delete …',
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
) ENGINE=InnoDB;


-- ════════════════════════════════════════════════════════════════════════
--  CLEAN-UP of an abandoned intermediate design (only if you ran it)
-- ════════════════════════════════════════════════════════════════════════
-- An earlier build of this module created a customer-wise master:
--   customers, connections, connection_payments, connection_refunds,
--   connection_refund_penalties, connection_cylinder_movements
-- server.js drops them automatically at start-up ONLY when every one of
-- them is empty. If any holds rows it prints a NOTICE and leaves them.
-- To remove them by hand (children first, because of the foreign keys):
--
--   DROP TABLE IF EXISTS connection_refund_penalties;
--   DROP TABLE IF EXISTS connection_cylinder_movements;
--   DROP TABLE IF EXISTS connection_payments;
--   DROP TABLE IF EXISTS connection_refunds;
--   DROP TABLE IF EXISTS connections;
--   DROP TABLE IF EXISTS customers;


-- ════════════════════════════════════════════════════════════════════════
--  VERIFY
-- ════════════════════════════════════════════════════════════════════════
-- Expect all three tables listed:
--   SHOW TABLES LIKE 'connection_event%';
--   SHOW TABLES LIKE 'audit_log';
--
-- Cylinders currently out with customers, per product (must equal the
-- "Cylinders with Customers" column on the admin Connections report):
--   SELECT product_id,
--          SUM(cylinders_out)                              AS issued,
--          SUM(cylinders_in)                               AS returned,
--          SUM(cylinders_missing)                          AS missing,
--          SUM(cylinders_out) - SUM(cylinders_in) - SUM(cylinders_missing) AS with_customers,
--          SUM(CASE WHEN event_type = 'new'       THEN qty ELSE 0 END)
--        - SUM(CASE WHEN event_type = 'surrender' THEN qty ELSE 0 END) AS active_connections
--     FROM connection_events
--    GROUP BY product_id;
--
-- Every surrender's stored penalty total must equal its line items:
--   SELECT e.id, e.penalty_deducted, COALESCE(SUM(p.amount), 0) AS items
--     FROM connection_events e
--     LEFT JOIN connection_event_penalties p ON p.event_id = e.id
--    WHERE e.event_type = 'surrender'
--    GROUP BY e.id
--   HAVING ABS(e.penalty_deducted - items) > 0.005;
--   -- expect: no rows
--
-- And net_paid must always be amount − penalty_deducted:
--   SELECT id FROM connection_events
--    WHERE event_type = 'surrender' AND ABS(net_paid - (amount - penalty_deducted)) > 0.005;
--   -- expect: no rows
--
-- Cash effect of the module on a given day (what calcEntry adds/subtracts):
--   SELECT event_date,
--          SUM(CASE WHEN event_type = 'additional' AND payment_mode = 'cash'   THEN amount ELSE 0 END) AS payments_cash,
--          SUM(CASE WHEN event_type = 'additional' AND payment_mode = 'online' THEN amount ELSE 0 END) AS payments_online,
--          SUM(CASE WHEN event_type = 'surrender' THEN net_paid ELSE 0 END)                             AS refunds_net
--     FROM connection_events
--    WHERE event_date = '2026-09-05'
--    GROUP BY event_date;
-- ════════════════════════════════════════════════════════════════════════
