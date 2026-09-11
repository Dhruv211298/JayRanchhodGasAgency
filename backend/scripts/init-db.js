#!/usr/bin/env node
/**
 * init-db.js — One-command cloud database initialization for Aiven MySQL
 * 
 * Usage:
 *   node backend/scripts/init-db.js "mysql://avnadmin:password@host:port/defaultdb?ssl-mode=REQUIRED"
 *   OR with environment variables:
 *   node backend/scripts/init-db.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function init() {
  const arg = process.argv[2];
  let connectionConfig;

  if (arg && arg.startsWith('mysql://')) {
    try {
      const url = new URL(arg);
      connectionConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: decodeURIComponent(url.username || 'avnadmin'),
        password: decodeURIComponent(url.password || ''),
        database: url.pathname.replace(/^\//, '') || 'defaultdb',
        ssl: { rejectUnauthorized: false },
        multipleStatements: true
      };
    } catch (e) {
      console.error('Invalid MySQL URI:', e.message);
      process.exit(1);
    }
  } else if (process.env.MYSQL_URI || process.env.DATABASE_URL) {
    const uri = process.env.MYSQL_URI || process.env.DATABASE_URL;
    try {
      const url = new URL(uri);
      connectionConfig = {
        host: url.hostname,
        port: parseInt(url.port) || 3306,
        user: decodeURIComponent(url.username || 'avnadmin'),
        password: decodeURIComponent(url.password || ''),
        database: url.pathname.replace(/^\//, '') || 'defaultdb',
        ssl: { rejectUnauthorized: false },
        multipleStatements: true
      };
    } catch (e) {
      console.error('Invalid MySQL URI:', e.message);
      process.exit(1);
    }
  } else {
    const isAiven = (process.env.DB_HOST || '').includes('aivencloud.com');
    const ssl = process.env.DB_SSL === 'true' || isAiven ? { rejectUnauthorized: false } : false;
    connectionConfig = {
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'defaultdb',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      ssl,
      multipleStatements: true
    };
  }

  console.log('────────────────────────────────────────────────────────────────');
  console.log('🚀 Connecting to MySQL Database...');
  console.log(`   Host: ${connectionConfig.host}`);
  console.log(`   Port: ${connectionConfig.port}`);
  console.log(`   User: ${connectionConfig.user}`);
  console.log(`   Database: ${connectionConfig.database}`);
  console.log(`   SSL: ${connectionConfig.ssl ? 'Enabled' : 'Disabled'}`);
  console.log('────────────────────────────────────────────────────────────────');

  let connection;
  try {
    connection = await mysql.createConnection(connectionConfig);
    console.log('✅ Connected successfully to Aiven database!');

    // Read and run init_aiven.sql
    const sqlPath = path.join(__dirname, '..', 'init_aiven.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`init_aiven.sql not found at ${sqlPath}`);
    }

    console.log('📦 Executing schema creation & seeding initial master data...');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await connection.query(sql);
    console.log('✅ All 22 tables and master products seeded successfully!');

    // Ensure initial admin user exists
    const [existingUsers] = await connection.query("SELECT id, username, role FROM users WHERE username = 'admin'");
    if (existingUsers.length === 0) {
      console.log('👤 Creating initial administrator account ("admin")...');
      const hash = await bcrypt.hash('Admin@12345', 12);
      await connection.query(
        "INSERT INTO users (username, password_hash, role, password_reset_required) VALUES ('admin', ?, 'admin', 0)",
        [hash]
      );
      console.log('✅ Initial admin created:');
      console.log('   Username: admin');
      console.log('   Password: Admin@12345');
      console.log('   (Please change your password after logging in via Users tab)');
    } else {
      console.log(`ℹ️ Administrator account "${existingUsers[0].username}" already exists.`);
    }

    console.log('────────────────────────────────────────────────────────────────');
    console.log('🎉 Aiven database initialization complete!');
    console.log('────────────────────────────────────────────────────────────────');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

init();
