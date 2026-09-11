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
    console.log("Altering daily_deliveries table to add cash_qty and online_qty...");
    try {
      await connection.query('ALTER TABLE daily_deliveries ADD COLUMN cash_qty INT DEFAULT 0 AFTER delivery_boy_id');
      console.log("Column cash_qty added successfully.");
    } catch (e) {
      if (e.message.includes("Duplicate column name")) {
        console.log("Column cash_qty already exists.");
      } else {
        throw e;
      }
    }

    try {
      await connection.query('ALTER TABLE daily_deliveries ADD COLUMN online_qty INT DEFAULT 0 AFTER cash_qty');
      console.log("Column online_qty added successfully.");
    } catch (e) {
      if (e.message.includes("Duplicate column name")) {
        console.log("Column online_qty already exists.");
      } else {
        throw e;
      }
    }

    // Set existing records' cash_qty = qty_delivered to preserve old data
    await connection.query('UPDATE daily_deliveries SET cash_qty = qty_delivered WHERE cash_qty = 0 AND qty_delivered > 0');
    console.log("Existing records migrated successfully.");
    
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

run();
