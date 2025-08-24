// Production Diagnostics Script for MockMate
// Upload this file to /var/www/mm/mockmate_prod/backend/production-diagnostics.js

import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Load production environment
console.log('🔧 Loading production environment...');
dotenv.config({ path: '.env.production' });

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

async function runProductionDiagnostics() {
  console.log('🚀 MockMate Production Diagnostics');
  console.log('=====================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  let pool;
  
  try {
    // 1. Environment Check
    console.log('\n📋 Environment Configuration:');
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
    console.log(`  PORT: ${process.env.PORT || 'NOT SET'}`);
    console.log(`  DB_HOST: ${process.env.DB_HOST || 'NOT SET'}`);
    console.log(`  DB_NAME: ${process.env.DB_NAME || 'NOT SET'}`);
    console.log(`  DB_USER: ${process.env.DB_USER || 'NOT SET'}`);
    console.log(`  DB_PASSWORD: ${process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]'}`);
    console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '[SET]' : '[NOT SET]'}`);
    
    // 2. Database Connection Test
    console.log('\n🔌 Database Connection Test:');
    try {
      pool = new Pool(dbConfig);
      
      // Test basic query
      const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
      console.log('  ✅ Database connection successful');
      console.log(`  📅 Server time: ${result.rows[0].current_time}`);
      console.log(`  🗄️ PostgreSQL version: ${result.rows[0].pg_version.split(' ')[0]}`);
      
    } catch (dbError) {
      console.log('  ❌ Database connection failed:', dbError.message);
      console.log('  🔧 Error details:');
      console.log(`     - Code: ${dbError.code}`);
      console.log(`     - Host: ${process.env.DB_HOST}`);
      console.log(`     - Database: ${process.env.DB_NAME}`);
      console.log(`     - User: ${process.env.DB_USER}`);
      console.log(`     - Error: ${dbError.toString()}`);
      
      // Try to diagnose connection issues
      if (dbError.code === 'ECONNREFUSED') {
        console.log('  💡 Database server is not running or not accepting connections');
      } else if (dbError.code === 'ENOTFOUND') {
        console.log('  💡 Database host not found - check DB_HOST setting');
      } else if (dbError.code === '28P01') {
        console.log('  💡 Authentication failed - check DB_USER/DB_PASSWORD');
      }
      
      return; // Can't continue without DB
    }
    
    // 3. Database Schema Check
    console.log('\n📊 Database Schema Verification:');
    try {
      // Check if tables exist
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
      const tablesResult = await pool.query(tablesQuery);
      const existingTables = tablesResult.rows.map(row => row.table_name);
      
      const expectedTables = ['users', 'sessions', 'user_resumes', 'interview_messages', 'credit_transactions', 'admin_users'];
      
      console.log(`  📋 Found ${existingTables.length} tables: ${existingTables.join(', ')}`);
      
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));
      if (missingTables.length > 0) {
        console.log(`  ⚠️ Missing expected tables: ${missingTables.join(', ')}`);
      } else {
        console.log('  ✅ All expected tables exist');
      }
      
    } catch (schemaError) {
      console.log('  ❌ Schema check failed:', schemaError.message);
    }
    
    // 4. Users Table Check
    console.log('\n👥 Users Table Analysis:');
    try {
      // Check users count
      const userCountResult = await pool.query('SELECT COUNT(*) as total FROM users');
      const totalUsers = parseInt(userCountResult.rows[0].total);
      console.log(`  📊 Total users: ${totalUsers}`);
      
      if (totalUsers === 0) {
        console.log('  ❌ NO USERS FOUND - This WILL cause session creation to fail!');
        console.log('  💡 CRITICAL: Session creation requires valid user_id references');
        console.log('  🔧 Solution: Import users from backup or create test users');
      } else {
        // Show recent active users
        const usersResult = await pool.query(`
          SELECT id, email, first_name, last_name, credits, is_active, created_at 
          FROM users 
          WHERE is_active = true 
          ORDER BY created_at DESC 
          LIMIT 5
        `);
        
        console.log('  👤 Active users (recent):');
        if (usersResult.rows.length === 0) {
          console.log('     ❌ No ACTIVE users found - all users are inactive!');
        } else {
          usersResult.rows.forEach(user => {
            console.log(`     - ${user.email} (Credits: ${user.credits}, ID: ${user.id.substring(0, 8)}...)`);
          });
        }
      }
      
    } catch (usersError) {
      console.log('  ❌ Users check failed:', usersError.message);
    }
    
    // 5. Sessions Table Check
    console.log('\n📝 Sessions Table Analysis:');
    try {
      const sessionCountResult = await pool.query('SELECT COUNT(*) as total FROM sessions');
      const totalSessions = parseInt(sessionCountResult.rows[0].total);
      console.log(`  📊 Total sessions: ${totalSessions}`);
      
      // Check specific problematic session
      const problematicSessionId = 'dbfcc682-340c-4e72-a7c9-5be61499bbbe';
      const problematicResult = await pool.query('SELECT id, user_id, status, created_at FROM sessions WHERE id = $1', [problematicSessionId]);
      
      if (problematicResult.rows.length > 0) {
        const session = problematicResult.rows[0];
        console.log(`  🎯 Problematic session EXISTS in production:`);
        console.log(`     - ID: ${session.id}`);
        console.log(`     - User ID: ${session.user_id}`);
        console.log(`     - Status: ${session.status}`);
        console.log(`     - Created: ${session.created_at}`);
        
        // Verify the user still exists
        const userCheckResult = await pool.query('SELECT email, is_active FROM users WHERE id = $1', [session.user_id]);
        if (userCheckResult.rows.length > 0) {
          console.log(`     - User exists: ${userCheckResult.rows[0].email} (Active: ${userCheckResult.rows[0].is_active})`);
        } else {
          console.log(`     ❌ User ${session.user_id} does not exist! (Orphaned session)`);
        }
      } else {
        console.log(`  ❌ Problematic session NOT FOUND: ${problematicSessionId}`);
        console.log(`  💡 This confirms the session creation is failing!`);
      }
      
      // Check recent sessions
      if (totalSessions > 0) {
        const recentSessionsResult = await pool.query(`
          SELECT s.id, s.user_id, s.status, s.job_title, s.created_at, u.email as user_email
          FROM sessions s
          LEFT JOIN users u ON s.user_id = u.id
          ORDER BY s.created_at DESC 
          LIMIT 5
        `);
        
        console.log('  📋 Recent sessions:');
        recentSessionsResult.rows.forEach(session => {
          console.log(`     - ${session.job_title} (${session.status}) - ${session.created_at}`);
          console.log(`       User: ${session.user_email || 'UNKNOWN'} (${session.user_id?.substring(0, 8)}...)`);
        });
      }
      
      // Check for sessions created today
      const todaySessionsResult = await pool.query(`
        SELECT COUNT(*) as today_count, status
        FROM sessions 
        WHERE DATE(created_at) = CURRENT_DATE
        GROUP BY status
      `);
      
      if (todaySessionsResult.rows.length > 0) {
        console.log('  📅 Sessions created today:');
        todaySessionsResult.rows.forEach(row => {
          console.log(`     - ${row.status}: ${row.today_count} sessions`);
        });
      } else {
        console.log('  📅 No sessions created today');
      }
      
    } catch (sessionsError) {
      console.log('  ❌ Sessions check failed:', sessionsError.message);
    }
    
    // 6. Test Session Creation with Production Logic
    console.log('\n🧪 Test Session Creation:');
    try {
      // Get a valid user for testing
      const userResult = await pool.query('SELECT id, credits, email FROM users WHERE is_active = true AND credits > 0 LIMIT 1');
      
      if (userResult.rows.length === 0) {
        console.log('  ❌ No active users with credits found - CANNOT CREATE SESSIONS');
        console.log('  💡 This is likely the root cause of the production issue!');
      } else {
        const testUser = userResult.rows[0];
        console.log(`  👤 Test user: ${testUser.email} (Credits: ${testUser.credits})`);
        
        // Try to create a test session using FIXED logic
        const testSessionId = `test-prod-${Date.now()}`;
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');
          console.log('    🔄 Starting transaction...');
          
          // Verify user exists (IMPROVED LOGIC)
          const userVerifyResult = await client.query('SELECT id, credits FROM users WHERE id = $1 AND is_active = true', [testUser.id]);
          
          if (userVerifyResult.rows.length === 0) {
            throw new Error('User not found during verification');
          }
          
          const verifiedUser = userVerifyResult.rows[0];
          if (verifiedUser.credits < 1) {
            throw new Error('Insufficient credits');
          }
          
          console.log('    ✅ User verification passed');
          
          // Create session
          const createResult = await client.query(`
            INSERT INTO sessions (
              id, user_id, session_name, job_title, job_description, difficulty_level, 
              estimated_duration_minutes, interview_type, resume_id,
              status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created', CURRENT_TIMESTAMP)
            RETURNING id, status, created_at
          `, [
            testSessionId,
            testUser.id,
            'Production Test Session',
            'Production Diagnostic Test',
            'Testing session creation in production environment',
            'intermediate',
            30,
            'technical',
            null
          ]);
          
          if (createResult.rows.length === 0) {
            throw new Error('No data returned from session creation');
          }
          
          await client.query('COMMIT');
          console.log('    ✅ Transaction committed');
          
          console.log('  ✅ TEST SESSION CREATION SUCCESSFUL!');
          console.log(`     - Session ID: ${createResult.rows[0].id}`);
          console.log(`     - Status: ${createResult.rows[0].status}`);
          console.log(`     - Created: ${createResult.rows[0].created_at}`);
          
          // Clean up test session
          await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
          console.log('  🗑️ Test session cleaned up');
          
        } catch (createError) {
          await client.query('ROLLBACK');
          console.log('  ❌ TEST SESSION CREATION FAILED:', createError.message);
          console.log(`     - Error code: ${createError.code}`);
          
          if (createError.code === '23503') {
            console.log('     💡 Foreign key violation - user/resume reference problem');
          } else if (createError.code === '23505') {
            console.log('     💡 Unique constraint violation - duplicate session ID');
          } else if (createError.message.includes('User not found')) {
            console.log('     💡 User validation failed in transaction');
          }
          
          console.log('     🚨 THIS IS LIKELY THE ROOT CAUSE OF PRODUCTION ISSUE');
          
        } finally {
          client.release();
        }
      }
      
    } catch (testError) {
      console.log('  ❌ Session creation test setup failed:', testError.message);
    }
    
    // 7. Production Environment Analysis
    console.log('\n⚙️ Production Environment Analysis:');
    console.log('=====================================');
    
    const issues = [];
    const warnings = [];
    
    // Check environment configuration
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production') {
      warnings.push('NODE_ENV not set to production');
    }
    
    if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.includes('your-') || process.env.DB_PASSWORD === 'your-secure-production-password') {
      issues.push('Database password appears to be a placeholder');
    }
    
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('your-')) {
      issues.push('DATABASE_URL appears to be a placeholder');
    }
    
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.includes('your-')) {
      issues.push('JWT_SECRET appears to be a placeholder');
    }
    
    // Report issues
    if (issues.length > 0) {
      console.log('  🚨 CRITICAL Issues Found:');
      issues.forEach(issue => console.log(`     ❌ ${issue}`));
    }
    
    if (warnings.length > 0) {
      console.log('  ⚠️ Warnings:');
      warnings.forEach(warning => console.log(`     ⚠️ ${warning}`));
    }
    
    if (issues.length === 0 && warnings.length === 0) {
      console.log('  ✅ Environment configuration looks correct');
    }
    
    console.log('\n📋 PRODUCTION ISSUE DIAGNOSIS:');
    console.log('==============================');
    
    if (totalUsers === 0) {
      console.log('🎯 ROOT CAUSE: No users in production database');
      console.log('   Session creation fails due to foreign key constraint violations');
      console.log('   API returns HTTP 201 but database insert actually fails');
      console.log('\n🔧 SOLUTION:');
      console.log('   1. Import users from backup/development database');
      console.log('   2. Or create test users in production');
      console.log('   3. Deploy the improved error handling code');
    } else {
      console.log('🎯 Database has users - session creation should work');
      console.log('   Issue might be in the session creation code logic');
      console.log('\n🔧 SOLUTION:');
      console.log('   1. Deploy the improved session creation code');
      console.log('   2. Monitor logs for proper error handling');
    }
    
  } catch (error) {
    console.error('\n❌ Diagnostics failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    if (pool) {
      await pool.end();
      console.log('\n🔌 Database connection closed');
    }
    console.log('\n🏁 Production diagnostics completed');
    console.log(`End time: ${new Date().toISOString()}`);
  }
}

// Run diagnostics
runProductionDiagnostics().catch(console.error);
