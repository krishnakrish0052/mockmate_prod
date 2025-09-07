import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';
import bcrypt from 'bcryptjs';

async function quickTest() {
  try {
    console.log('🔧 Quick test and user addition...');
    
    await initializeDatabase();
    const db = getDatabase();
    
    // 1. Update admin email
    console.log('\n👤 Updating admin email...');
    await db.query(`
      UPDATE admin_users SET 
        email = 'krishankant962@gmail.com', 
        updated_at = NOW()
    `);
    console.log('✅ Admin email updated');
    
    // 2. Add a test user
    console.log('\n👥 Adding test user...');
    const passwordHash = await bcrypt.hash('password123', 10);
    
    const userResult = await db.query(`
      INSERT INTO users (
        email, name, first_name, last_name, password_hash,
        subscription_tier, credits, total_sessions_completed, total_spent_usd,
        registration_source, country, is_active, is_verified, created_at, updated_at
      ) VALUES (
        'test@example.com', 'Test User', 'Test', 'User', $1,
        'pro', 100, 5, 25.99, 'web', 'USA', true, true, NOW(), NOW()
      ) 
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        credits = EXCLUDED.credits,
        subscription_tier = EXCLUDED.subscription_tier
      RETURNING id, email
    `, [passwordHash]);
    
    console.log(`✅ Test user added: ${userResult.rows[0].email}`);
    
    // 3. Test enhanced users query directly
    console.log('\n🔍 Testing enhanced users query...');
    
    const enhancedQuery = `
      SELECT 
        u.id, u.name, u.first_name, u.last_name, u.email, u.phone, u.country,
        u.credits, u.subscription_tier, u.is_active, u.is_verified, u.is_suspended,
        u.registration_source, u.created_at, u.last_activity,
        u.total_sessions_completed, u.total_spent_usd,
        
        -- Session statistics
        COUNT(DISTINCT s.id) as session_count,
        COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_sessions,
        
        -- Payment statistics  
        COUNT(DISTINCT p.id) as payment_count,
        SUM(CASE WHEN p.status = 'completed' THEN p.amount_usd ELSE 0 END) as total_payments
        
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      LEFT JOIN payments p ON u.id = p.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    
    const testResult = await db.query(enhancedQuery);
    console.log(`✅ Query successful! Found ${testResult.rows.length} users`);
    
    if (testResult.rows.length > 0) {
      const user = testResult.rows[0];
      console.log(`   📋 Sample user:`);
      console.log(`      Email: ${user.email}`);
      console.log(`      Name: ${user.name}`);
      console.log(`      Tier: ${user.subscription_tier}`);
      console.log(`      Credits: ${user.credits}`);
      console.log(`      Sessions: ${user.session_count} (${user.total_sessions_completed} total completed)`);
      console.log(`      Payments: $${user.total_payments || 0} (${user.payment_count} transactions)`);
    }
    
    await closeDatabase();
    
    console.log('\n🎉 Quick test completed successfully!');
    console.log('\n📋 SUMMARY:');
    console.log('===========');
    console.log('✅ Admin email updated to krishankant962@gmail.com');
    console.log('✅ Test user added successfully');
    console.log('✅ Enhanced users query working correctly');
    
    console.log('\n🔑 ADMIN LOGIN CREDENTIALS:');
    console.log('============================');
    console.log('Username: admin');
    console.log('Email: krishankant962@gmail.com');
    console.log('Password: MockMateAdmin123!');
    
    console.log('\n🚀 READY TO TEST:');
    console.log('==================');
    console.log('1. Start server: npm start');
    console.log('2. Login to admin panel at http://localhost:3001');
    console.log('3. Test enhanced users endpoint: GET /api/admin/users-enhanced');
    console.log('4. You should see the test user in the response');
    
  } catch (error) {
    console.error('❌ Quick test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

quickTest();
