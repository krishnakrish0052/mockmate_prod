import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function checkAdminUsers() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD.trim()) : undefined,
  });

  try {
    // Check admin_users table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'admin_users'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 admin_users table structure:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to check admin_users table:', error.message);
  } finally {
    await pool.end();
  }
}

checkAdminUsers();
