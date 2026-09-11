const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
});

async function run() {
  const connection = await pool.getConnection();
  try {
    console.log("Altering daily_product_stock table to add online_qty column...");
    try {
      await connection.query('ALTER TABLE daily_product_stock ADD COLUMN online_qty INT DEFAULT 0 AFTER sell_qty');
      console.log("Column online_qty added successfully.");
    } catch (e) {
      if (e.message.includes("Duplicate column name")) {
        console.log("Column online_qty already exists.");
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();
