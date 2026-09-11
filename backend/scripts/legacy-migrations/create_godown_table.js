const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jay_ranchhod_gas_agency'
  });

  try {
    console.log("Creating godown_stock table...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS godown_stock (
          id INT AUTO_INCREMENT PRIMARY KEY,
          entry_date DATE NOT NULL,
          product_id VARCHAR(50) NOT NULL,
          filled_qty INT DEFAULT 0,
          empty_qty INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY (entry_date, product_id),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);
    console.log("Table created successfully.");
  } catch(e) {
    console.error("Error creating table:", e.message);
  }
  process.exit(0);
}
run();
