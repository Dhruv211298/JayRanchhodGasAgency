const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jay_ranchhod_gas_agency'
  });

  try {
    console.log("Creating vehicle_arrivals table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vehicle_arrivals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entry_date DATE NOT NULL,
        product_id VARCHAR(50) NOT NULL,
        filled_received INT DEFAULT 0,
        empty_returned INT DEFAULT 0,
        FOREIGN KEY (entry_date) REFERENCES daily_entries(entry_date) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE KEY (entry_date, product_id)
      )
    `);
    
    // Also add a column to daily_entries to track if vehicle arrived (optional but helpful for UI state)
    // Actually, presence of data in vehicle_arrivals is enough, but a flag is easier for "Yes/No" toggle persistence.
    console.log("Checking if has_vehicle_arrival exists in daily_entries...");
    const [cols] = await connection.query("SHOW COLUMNS FROM daily_entries LIKE 'has_vehicle_arrival'");
    if (cols.length === 0) {
      await connection.query("ALTER TABLE daily_entries ADD COLUMN has_vehicle_arrival BOOLEAN DEFAULT FALSE");
      console.log("Added has_vehicle_arrival column to daily_entries.");
    }

    console.log("Success!");
  } catch(e) {
    console.error("Migration Error:", e.message);
  } finally {
    await connection.end();
  }
}
run();
