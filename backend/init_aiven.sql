-- ════════════════════════════════════════════════════════════════════════════════
-- JAY RANCHHOD GAS SERVICE — MASTER DATABASE SCHEMA FOR AIVEN CLOUD MYSQL
-- ════════════════════════════════════════════════════════════════════════════════
-- Safe to run on fresh or existing databases.
-- ════════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- 1. PRODUCTS TABLE (Master for Cylinders and Accessories)
CREATE TABLE IF NOT EXISTS products (
  id            VARCHAR(50)   NOT NULL PRIMARY KEY,
  label         VARCHAR(100)  NOT NULL,
  short_name    VARCHAR(50)   NOT NULL,
  sku           VARCHAR(50)   NULL,
  fallback_rate DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  fallback_sbc  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  fallback_dbc  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  category      ENUM('cylinder', 'accessory') NOT NULL DEFAULT 'cylinder',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  sort_order    INT           NOT NULL DEFAULT 0,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Default Products
INSERT INTO products (id, label, short_name, sku, fallback_rate, fallback_sbc, fallback_dbc, category, is_active, sort_order) VALUES
('p14', '14.2 KG Domestic', '14 KG', 'CYL-14', 850.00, 1800.00, 2200.00, 'cylinder', 1, 1),
('p19', '19 KG Commercial', '19 KG', 'CYL-19', 1750.00, 2500.00, 3000.00, 'cylinder', 1, 2),
('p5',  '5 KG Mini Cylinder', '5 KG', 'CYL-5', 350.00, 1000.00, 1200.00, 'cylinder', 1, 3),
('pipe', 'Suraksha LPG Hose Pipe', 'Pipe', 'ACC-PIPE', 150.00, 0.00, 0.00, 'accessory', 1, 10),
('stove', 'LPG Gas Stove', 'Stove', 'ACC-STOVE', 1500.00, 0.00, 0.00, 'accessory', 1, 11)
ON DUPLICATE KEY UPDATE label=VALUES(label), short_name=VALUES(short_name);

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  username                VARCHAR(50) NOT NULL UNIQUE,
  password                VARCHAR(255) NULL,
  password_hash           VARCHAR(255) NULL COMMENT 'bcrypt hash',
  role                    ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  password_reset_required TINYINT(1) NOT NULL DEFAULT 0,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. EMPLOYEES TABLE (Staff & Delivery Boys)
CREATE TABLE IF NOT EXISTS employees (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  role       VARCHAR(100) NOT NULL DEFAULT 'Delivery Boy',
  salary     DECIMAL(10,2) DEFAULT 0.00,
  phone      VARCHAR(50) DEFAULT '',
  join_date  DATE NULL,
  notes      TEXT NULL,
  is_active  TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Default Delivery Staff
INSERT INTO employees (name, role, salary, is_active) VALUES
('Haresh', 'Delivery Boy', 12000.00, 1),
('Mahesh', 'Delivery Boy', 12000.00, 1),
('Dilip', 'Delivery Boy', 12000.00, 1),
('Ramesh', 'Delivery Boy', 12000.00, 1)
ON DUPLICATE KEY UPDATE role=VALUES(role);

-- 4. VEHICLES TABLE
CREATE TABLE IF NOT EXISTS vehicles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_no VARCHAR(30) NOT NULL UNIQUE,
  type       VARCHAR(50) DEFAULT '',
  capacity   INT NULL,
  notes      VARCHAR(500) DEFAULT '',
  is_active  TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Default Vehicle
INSERT INTO vehicles (vehicle_no, type, capacity, is_active) VALUES
('GJ-01-XX-1234', 'Tata 407', 300, 1)
ON DUPLICATE KEY UPDATE is_active=1;

-- 5. DAILY ENTRIES TABLE (Parent ledger for daily closings)
CREATE TABLE IF NOT EXISTS daily_entries (
  entry_date          DATE NOT NULL PRIMARY KEY,
  opening_cash        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  bob_bank            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  has_vehicle_arrival TINYINT(1) NOT NULL DEFAULT 0,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. DAILY PRODUCT STOCK & SALES
CREATE TABLE IF NOT EXISTS daily_product_stock (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  entry_date    DATE NOT NULL,
  product_id    VARCHAR(50) NOT NULL,
  opening_stock INT DEFAULT 0,
  rate          DECIMAL(10,2) DEFAULT 0.00,
  sbc_rate      DECIMAL(10,2) DEFAULT 0.00,
  dbc_rate      DECIMAL(10,2) DEFAULT 0.00,
  sell_qty      INT DEFAULT 0,
  online_qty    INT DEFAULT 0,
  sbc_qty       INT DEFAULT 0,
  dbc_qty       INT DEFAULT 0,
  closing_stock INT DEFAULT 0,
  shortage_qty  INT DEFAULT 0,
  remarks       VARCHAR(255) DEFAULT '',
  UNIQUE KEY uniq_dps_date_prod (entry_date, product_id),
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. GODOWN PHYSICAL STOCK
CREATE TABLE IF NOT EXISTS godown_stock (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  entry_date DATE NOT NULL,
  product_id VARCHAR(50) NOT NULL,
  filled_qty INT DEFAULT 0,
  empty_qty  INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_gs_date_prod (entry_date, product_id),
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. VEHICLE ARRIVALS
CREATE TABLE IF NOT EXISTS vehicle_arrivals (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  entry_date      DATE NOT NULL,
  product_id      VARCHAR(50) NOT NULL,
  filled_received INT DEFAULT 0,
  empty_returned  INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_va_date_prod (entry_date, product_id),
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. DAILY DELIVERIES (Per delivery boy)
CREATE TABLE IF NOT EXISTS daily_deliveries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  entry_date      DATE NOT NULL,
  delivery_boy_id INT NOT NULL,
  cash_qty        INT DEFAULT 0,
  online_qty      INT DEFAULT 0,
  qty_delivered   INT DEFAULT 0,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (delivery_boy_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. DAILY OFFICE EXPENSES
CREATE TABLE IF NOT EXISTS daily_expenses (
  id          VARCHAR(100) NOT NULL PRIMARY KEY,
  entry_date  DATE NOT NULL,
  description VARCHAR(255) DEFAULT '',
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. DAILY CHEQUE / ONLINE EXPENSES
CREATE TABLE IF NOT EXISTS daily_cheque_online (
  id          VARCHAR(100) NOT NULL PRIMARY KEY,
  entry_date  DATE NOT NULL,
  description VARCHAR(255) DEFAULT '',
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. DAILY VEHICLE EXPENSES
CREATE TABLE IF NOT EXISTS daily_vehicle_expenses (
  id           VARCHAR(100) NOT NULL PRIMARY KEY,
  entry_date   DATE NOT NULL,
  vehicle_id   INT NULL,
  expense_type VARCHAR(50) DEFAULT 'Fuel',
  description  VARCHAR(255) DEFAULT '',
  amount       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. EMPLOYEE PAYMENTS (Salaries & Advances)
CREATE TABLE IF NOT EXISTS employee_payments (
  id          VARCHAR(100) NOT NULL PRIMARY KEY,
  entry_date  DATE NOT NULL,
  employee_id INT NOT NULL,
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  type        VARCHAR(50) DEFAULT 'Salary',
  notes       VARCHAR(255) DEFAULT '',
  for_month   VARCHAR(7) NULL COMMENT 'YYYY-MM salary month',
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. DAILY ACCESSORY SALES
CREATE TABLE IF NOT EXISTS daily_accessory_sales (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  entry_date   DATE NOT NULL,
  accessory_id VARCHAR(50) NOT NULL,
  qty          INT DEFAULT 0,
  rate         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
  FOREIGN KEY (accessory_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. DAILY OTHER CASH CREDITS
CREATE TABLE IF NOT EXISTS daily_other_cash_credits (
  id          VARCHAR(100) NOT NULL PRIMARY KEY,
  entry_date  DATE NOT NULL,
  description VARCHAR(255) DEFAULT '',
  amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. CREDIT LEDGER (Pending Customers)
CREATE TABLE IF NOT EXISTS credit_ledger (
  id              VARCHAR(100) NOT NULL PRIMARY KEY,
  entry_date      DATE NOT NULL,
  customer_name   VARCHAR(255) NOT NULL,
  original_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cleared         TINYINT(1) NOT NULL DEFAULT 0,
  product_id      VARCHAR(50) NULL,
  filled_qty      INT DEFAULT 0,
  empty_qty       INT DEFAULT 0,
  remarks         VARCHAR(255) DEFAULT '',
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. CREDIT PAYMENTS (Recoveries)
CREATE TABLE IF NOT EXISTS credit_payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  ledger_id       VARCHAR(100) NOT NULL,
  payment_date    DATE NOT NULL,
  amount          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  empty_returned  INT DEFAULT 0,
  note            VARCHAR(255) DEFAULT '',
  idempotency_key VARCHAR(64) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_cp_idem (idempotency_key),
  FOREIGN KEY (ledger_id) REFERENCES credit_ledger(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. PRICE HISTORY
CREATE TABLE IF NOT EXISTS price_history (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     VARCHAR(50) NOT NULL,
  effective_date DATE NOT NULL,
  rate           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sbc_rate       DECIMAL(10,2) DEFAULT 0.00,
  dbc_rate       DECIMAL(10,2) DEFAULT 0.00,
  note           VARCHAR(255) DEFAULT '',
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. COMMISSION HISTORY
CREATE TABLE IF NOT EXISTS commission_history (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id     VARCHAR(50) NOT NULL,
  effective_date DATE NOT NULL,
  per_cyl_rate   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  note           VARCHAR(255) DEFAULT '',
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. CONNECTION EVENTS (Counter stock and cash movements)
CREATE TABLE IF NOT EXISTS connection_events (
  id                VARCHAR(20)   NOT NULL PRIMARY KEY,
  event_date        DATE          NOT NULL COMMENT 'business date; joins into that days stock and cash',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. CONNECTION EVENT PENALTIES (Surrender deductions)
CREATE TABLE IF NOT EXISTS connection_event_penalties (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  event_id     VARCHAR(20)   NOT NULL,
  penalty_type ENUM('missing_cylinder','lost_dgcc','defective_regulator','other') NOT NULL,
  item_name    VARCHAR(100)  NOT NULL,
  amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES connection_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. AUDIT LOG (Immutable trail of admin actions)
CREATE TABLE IF NOT EXISTS audit_log (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  event_time      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_date      DATE         NULL,
  event_type      VARCHAR(50)  NOT NULL,
  entity_type     VARCHAR(50)  NOT NULL,
  entity_id       VARCHAR(100) NULL,
  actor_username  VARCHAR(50)  NULL,
  actor_role      VARCHAR(20)  NULL,
  actor_ip        VARCHAR(45)  NULL,
  details         JSON         NULL,
  idempotency_key VARCHAR(64)  NULL,
  UNIQUE KEY uniq_audit_idem (idempotency_key),
  INDEX idx_audit_time (event_time),
  INDEX idx_audit_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
