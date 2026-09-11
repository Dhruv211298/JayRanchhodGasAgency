const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
});

async function setupSbcDbc() {
  const connection = await pool.getConnection();
  try {
    console.log("Altering products table...");
    try {
      await connection.query('ALTER TABLE products ADD COLUMN fallback_sbc DECIMAL(10,2) DEFAULT 0, ADD COLUMN fallback_dbc DECIMAL(10,2) DEFAULT 0');
    } catch (e) {
      if (!e.message.includes("Duplicate column name")) throw e;
    }

    console.log("Altering price_history table...");
    try {
      await connection.query('ALTER TABLE price_history ADD COLUMN sbc_rate DECIMAL(10,2) DEFAULT 0, ADD COLUMN dbc_rate DECIMAL(10,2) DEFAULT 0');
    } catch (e) {
      if (!e.message.includes("Duplicate column name")) throw e;
    }

    console.log("Altering daily_product_stock table...");
    try {
      await connection.query('ALTER TABLE daily_product_stock ADD COLUMN sbc_rate DECIMAL(10,2) DEFAULT 0, ADD COLUMN dbc_rate DECIMAL(10,2) DEFAULT 0, ADD COLUMN remarks VARCHAR(255) DEFAULT ""');
    } catch (e) {
      if (!e.message.includes("Duplicate column name")) throw e;
    }

    console.log("Database schema updated successfully.");
  } catch (error) {
    console.error("Error updating schema:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

setupSbcDbc();
