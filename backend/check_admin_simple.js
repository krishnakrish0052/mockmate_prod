import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

try {
  const result = await pool.query('SELECT id, username, email, role, is_active, created_at FROM admin_users ORDER BY created_at DESC');
  
  console.log('📋 Admin users in database:');
  console.log('========================================');
  
  if (result.rows.length === 0) {
    console.log('❌ No admin users found');
    console.log('\n🔑 Default credentials from .env:');
    console.log(`   Email: ${process.env.DEFAULT_ADMIN_EMAIL}`);
    console.log(`   Password: ${process.env.DEFAULT_ADMIN_PASSWORD}`);
  } else {
    result.rows.forEach((admin, index) => {
      console.log(`${index + 1}. ${admin.email}`);
      console.log(`   Username: ${admin.username || 'Not set'}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Active: ${admin.is_active ? 'Yes' : 'No'}`);
      console.log(`   Created: ${admin.created_at}`);
      console.log('');
    });
  }
  
  await pool.end();
} catch (error) {
  console.error('Error:', error.message);
  await pool.end();
}
