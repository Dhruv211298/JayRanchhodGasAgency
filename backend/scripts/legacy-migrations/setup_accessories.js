const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jay_ranchhod_gas_agency',
});

async function setupAccessories() {
  const connection = await pool.getConnection();
  try {
    // 1. Insert accessories into products table
    await connection.query(`
      INSERT IGNORE INTO products (id, label, short_name, sku, fallback_rate) VALUES
      ('pipe', 'Gas Pipe', 'Pipe', 'ACC-PIPE', 150.00),
      ('stove', 'Gas Stove', 'Stove', 'ACC-STOVE', 1500.00);
    `);
    
    // 2. Create daily_accessory_sales table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS daily_accessory_sales (
          id INT AUTO_INCREMENT PRIMARY KEY,
          entry_date DATE NOT NULL,
          accessory_id VARCHAR(50) NOT NULL,
          qty INT DEFAULT 0,
          rate DECIMAL(10, 2) NOT NULL,
          FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
          FOREIGN KEY (accessory_id) REFERENCES products(id) ON DELETE CASCADE
      );
    `);
    
    console.log("Accessories setup successful.");
  } catch (error) {
    console.error("Error setting up accessories:", error);
  } finally {
    connection.release();
    process.exit(0);
  }
}

setupAccessories();
