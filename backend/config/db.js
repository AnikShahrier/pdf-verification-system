const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'pdf_verification',
  user: process.env.DB_USER || 'pdf_user',
  password: process.env.DB_PASSWORD || 'your_secure_password'
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('⚠️  Unexpected database error:', err.stack);
});

module.exports = pool;