import { getDatabase, initializeDatabase } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkUsers() {
  try {
    await initializeDatabase();
    const pool = getDatabase();
    
    console.log('🔍 Checking users in database...');
    
    // Check total users
    const countQuery = 'SELECT COUNT(*) as total FROM users';
    const countResult = await pool.query(countQuery);
    console.log(`📊 Total users: ${countResult.rows[0].total}`);
    
    if (countResult.rows[0].total > 0) {
      // Show recent users
      const usersQuery = `
        SELECT id, email, first_name, last_name, created_at, is_active 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT 10
      `;
      const usersResult = await pool.query(usersQuery);
      
      console.log('\n👥 Recent users:');
      usersResult.rows.forEach(user => {
        console.log(`  - ${user.id}: ${user.email} (${user.first_name} ${user.last_name}) - Active: ${user.is_active}`);
      });
    } else {
      console.log('❌ No users found in database!');
    }
    
    // Check recent sessions
    const sessionsCountQuery = 'SELECT COUNT(*) as total FROM sessions';
    const sessionsCountResult = await pool.query(sessionsCountQuery);
    console.log(`\n📊 Total sessions: ${sessionsCountResult.rows[0].total}`);
    
    if (sessionsCountResult.rows[0].total > 0) {
      const sessionsQuery = `
        SELECT id, user_id, session_name, status, created_at
        FROM sessions 
        ORDER BY created_at DESC 
        LIMIT 5
      `;
      const sessionsResult = await pool.query(sessionsQuery);
      
      console.log('\n📋 Recent sessions:');
      sessionsResult.rows.forEach(session => {
        console.log(`  - ${session.id}: ${session.session_name} (${session.status}) - User: ${session.user_id}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking users:', error);
  } finally {
    process.exit(0);
  }
}

checkUsers();
