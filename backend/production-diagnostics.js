import dotenv from 'dotenv';
import { getDatabase, initializeDatabase } from './config/database.js';

// Load appropriate environment
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
console.log(`🔧 Loading environment from: ${envFile}`);
dotenv.config({ path: envFile });

async function runProductionDiagnostics() {
  console.log('🚀 MockMate Production Diagnostics');
  console.log('=====================================');
  
  try {
    // 1. Environment Check
    console.log('\n📋 Environment Configuration:');
    console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`  PORT: ${process.env.PORT}`);
    console.log(`  DB_HOST: ${process.env.DB_HOST}`);
    console.log(`  DB_NAME: ${process.env.DB_NAME}`);
    console.log(`  DB_USER: ${process.env.DB_USER}`);
    console.log(`  DB_PASSWORD: ${process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]'}`);
    console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '[SET]' : '[NOT SET]'}`);
    console.log(`  REDIS configured: ${process.env.REDIS_HOST || process.env.REDIS_URL ? 'YES' : 'NO'}`);
    
    // 2. Database Connection Test
    console.log('\n🔌 Database Connection Test:');
    try {
      await initializeDatabase();
      const pool = getDatabase();
      
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
      return; // Can't continue without DB
    }
    
    // 3. Database Schema Check
    console.log('\n📊 Database Schema Verification:');
    try {
      const pool = getDatabase();
      
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
      
      const expectedTables = ['users', 'sessions', 'user_resumes', 'interview_messages', 'credit_transactions'];
      
      console.log(`  📋 Found ${existingTables.length} tables: ${existingTables.join(', ')}`);
      
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));
      if (missingTables.length > 0) {
        console.log(`  ⚠️ Missing tables: ${missingTables.join(', ')}`);
      } else {
        console.log('  ✅ All required tables exist');
      }
      
    } catch (schemaError) {
      console.log('  ❌ Schema check failed:', schemaError.message);
    }
    
    // 4. Users Table Check
    console.log('\n👥 Users Table Analysis:');
    try {
      const pool = getDatabase();
      
      // Check users count
      const userCountResult = await pool.query('SELECT COUNT(*) as total FROM users');
      const totalUsers = parseInt(userCountResult.rows[0].total);
      console.log(`  📊 Total users: ${totalUsers}`);
      
      if (totalUsers === 0) {
        console.log('  ⚠️ NO USERS FOUND - This will cause session creation to fail!');
        console.log('  💡 Solution: Create test user or ensure user migration ran');
      } else {
        // Show recent users
        const usersResult = await pool.query(`
          SELECT id, email, first_name, last_name, credits, is_active, created_at 
          FROM users 
          WHERE is_active = true 
          ORDER BY created_at DESC 
          LIMIT 3
        `);
        
        console.log('  👤 Active users (recent):');
        usersResult.rows.forEach(user => {
          console.log(`     - ${user.email} (Credits: ${user.credits}, ID: ${user.id.substring(0, 8)}...)`);
        });
      }
      
    } catch (usersError) {
      console.log('  ❌ Users check failed:', usersError.message);
    }
    
    // 5. Sessions Table Check
    console.log('\n📝 Sessions Table Analysis:');
    try {
      const pool = getDatabase();
      
      const sessionCountResult = await pool.query('SELECT COUNT(*) as total FROM sessions');
      const totalSessions = parseInt(sessionCountResult.rows[0].total);
      console.log(`  📊 Total sessions: ${totalSessions}`);
      
      // Check specific problematic session
      const problematicSessionId = 'dbfcc682-340c-4e72-a7c9-5be61499bbbe';
      const problematicResult = await pool.query('SELECT id, user_id, status, created_at FROM sessions WHERE id = $1', [problematicSessionId]);
      
      if (problematicResult.rows.length > 0) {
        const session = problematicResult.rows[0];
        console.log(`  🎯 Problematic session EXISTS:`);
        console.log(`     - ID: ${session.id}`);
        console.log(`     - User ID: ${session.user_id}`);
        console.log(`     - Status: ${session.status}`);
        console.log(`     - Created: ${session.created_at}`);
      } else {
        console.log(`  ❌ Problematic session NOT FOUND: ${problematicSessionId}`);
        console.log(`  💡 This explains the "Session not found" error!`);
      }
      
      // Check recent sessions
      if (totalSessions > 0) {
        const recentSessionsResult = await pool.query(`
          SELECT id, user_id, status, job_title, created_at 
          FROM sessions 
          ORDER BY created_at DESC 
          LIMIT 5
        `);
        
        console.log('  📋 Recent sessions:');
        recentSessionsResult.rows.forEach(session => {
          console.log(`     - ${session.job_title} (${session.status}) - ${session.created_at}`);
        });
      }
      
    } catch (sessionsError) {
      console.log('  ❌ Sessions check failed:', sessionsError.message);
    }
    
    // 6. Test Session Creation
    console.log('\n🧪 Test Session Creation:');
    try {
      const pool = getDatabase();
      
      // Get a valid user for testing
      const userResult = await pool.query('SELECT id, credits FROM users WHERE is_active = true AND credits > 0 LIMIT 1');
      
      if (userResult.rows.length === 0) {
        console.log('  ❌ No active users with credits found - cannot test session creation');
      } else {
        const testUser = userResult.rows[0];
        console.log(`  👤 Using test user: ${testUser.id.substring(0, 8)}... (Credits: ${testUser.credits})`);
        
        // Try to create a test session using the FIXED logic
        const testSessionId = `test-${Date.now()}`;
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');
          
          // Verify user exists (NEW LOGIC)
          const userVerifyResult = await client.query('SELECT id, credits FROM users WHERE id = $1 AND is_active = true', [testUser.id]);
          
          if (userVerifyResult.rows.length === 0) {
            throw new Error('User not found during verification');
          }
          
          const verifiedUser = userVerifyResult.rows[0];
          if (verifiedUser.credits < 1) {
            throw new Error('Insufficient credits');
          }
          
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
            'Production Test Job',
            'Testing session creation in production',
            'intermediate',
            30,
            'technical',
            null
          ]);
          
          if (createResult.rows.length === 0) {
            throw new Error('No data returned from session creation');
          }
          
          await client.query('COMMIT');
          
          console.log('  ✅ Test session creation SUCCESSFUL');
          console.log(`     - Session ID: ${createResult.rows[0].id}`);
          console.log(`     - Status: ${createResult.rows[0].status}`);
          
          // Clean up test session
          await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
          console.log('  🗑️ Test session cleaned up');
          
        } catch (createError) {
          await client.query('ROLLBACK');
          console.log('  ❌ Test session creation FAILED:', createError.message);
          console.log(`     - Error code: ${createError.code}`);
          
          if (createError.code === '23503') {
            console.log('     💡 Foreign key violation - user reference problem');
          } else if (createError.code === '23505') {
            console.log('     💡 Unique constraint violation - duplicate session ID');
          }
          
        } finally {
          client.release();
        }
      }
      
    } catch (testError) {
      console.log('  ❌ Session creation test setup failed:', testError.message);
    }
    
    // 7. Production-specific recommendations
    console.log('\n💡 Production Issue Recommendations:');
    console.log('=====================================');
    
    const issues = [];
    
    if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD.includes('your-')) {
      issues.push('❌ Database password not properly configured');
    }
    
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('your-')) {
      issues.push('❌ DATABASE_URL not properly configured');
    }
    
    if (process.env.NODE_ENV !== 'production') {
      issues.push('❌ NODE_ENV not set to production');
    }
    
    if (issues.length > 0) {
      console.log('  🚨 Configuration Issues Found:');
      issues.forEach(issue => console.log(`     ${issue}`));
    } else {
      console.log('  ✅ Basic configuration looks correct');
    }
    
    console.log('\n  📋 Next Steps:');
    console.log('     1. Ensure production database is properly migrated');
    console.log('     2. Verify users exist in production database');
    console.log('     3. Deploy the fixed session creation code');
    console.log('     4. Check production logs for specific error details');
    console.log('     5. Test session creation after deployment');
    
  } catch (error) {
    console.error('\n❌ Diagnostics failed:', error);
  } finally {
    console.log('\n🏁 Diagnostics completed');
    process.exit(0);
  }
}

runProductionDiagnostics();
