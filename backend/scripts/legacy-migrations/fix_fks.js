const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jay_ranchhod_gas_agency'
  });

  try {
    console.log("Fixing daily_deliveries foreign key...");
    // 1. Drop existing FK
    try {
      await connection.query('ALTER TABLE daily_deliveries DROP FOREIGN KEY daily_deliveries_ibfk_2');
      console.log("Dropped old FK.");
    } catch(e) {
      console.log("FK might not exist or already dropped:", e.message);
    }

    // 2. Add new FK pointing to employees
    await connection.query('ALTER TABLE daily_deliveries ADD CONSTRAINT daily_deliveries_ibfk_employees FOREIGN KEY (delivery_boy_id) REFERENCES employees(id) ON DELETE CASCADE');
    console.log("Added new FK pointing to employees.");

  } catch(e) {
    console.error("Migration Error:", e.message);
  } finally {
    await connection.end();
  }
}
run();
