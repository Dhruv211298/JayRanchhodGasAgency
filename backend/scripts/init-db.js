#!/usr/bin/env node
/**
 * init-db.js — One-command cloud database initialization for Aiven MySQL
 * 
 * Usage:
 *   node backend/scripts/init-db.js
 * 
 * Environment Variables (set before running):
 *   DB_HOST     - Aiven host (e.g. mysql-xxxxx.aivencloud.com)
 *   DB_PORT     - Aiven port (e.g. 12345)
 *   DB_USER     - Aiven username (e.g. avnadmin)
 *   DB_PASSWORD - Aiven password
 *   DB_NAME     - Database name (default: defaultdb)
 *   DB_SSL      - true (automatically enabled for aivencloud.com)
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const isAiven = (process.env.DB_HOST || '').includes('aivencloud.com');
const ssl = process.env.DB_SSL === 'true' || isAiven ? { rejectUnauthorized: false } : false;

async function init() {
  console.log('────────────────────────────────────────────────────────────────');
  console.log('🚀 Connecting to MySQL Database...');
  console.log(`   Host: ${process.env.DB_HOST || '127.0.0.1'}`);
  console.log(`   Port: ${process.env.DB_PORT || 3306}`);
  console.log(`   User: ${process.env.DB_USER || 'root'}`);
  console.log(`   Database: ${process.env.DB_NAME || 'defaultdb'}`);
  console.log(`   SSL: ${ssl ? 'Enabled (Aiven)' : 'Disabled'}`);
  console.log('────────────────────────────────────────────────────────────────');

  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'defaultdb',
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
      ssl,
      multipleStatements: true
    });

    console.log('✅ Connected successfully!');

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
    console.log('🎉 Database initialization complete and ready for production!');
    console.log('────────────────────────────────────────────────────────────────');
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

init();
