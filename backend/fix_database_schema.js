import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';

async function fixDatabaseSchema() {
  try {
    console.log('🔧 Connecting to database...');
    await initializeDatabase();
    const db = getDatabase();
    
    console.log('✅ Database connected');
    console.log('\n🔨 Starting database schema fixes...\n');
    
    // Start transaction for all changes
    const client = await db.connect();
    
    try {
      await client.query('BEGIN');
      console.log('📝 Transaction started');
      
      // 1. Add missing columns to sessions table
      console.log('\n1️⃣ Adding missing columns to sessions table...');
      
      // Check and add interview_duration column
      const sessionColumns = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = 'interview_duration'
      `);
      
      if (sessionColumns.rows.length === 0) {
        await client.query(`
          ALTER TABLE sessions 
          ADD COLUMN interview_duration INTEGER DEFAULT 0
        `);
        console.log('   ✅ Added interview_duration column');
      } else {
        console.log('   ➡️  interview_duration column already exists');
      }
      
      // Check and add other missing session columns
      const sessionColumnsToAdd = [
        { name: 'interview_type', type: 'VARCHAR(50)', default: "'general'" },
        { name: 'difficulty_level', type: 'VARCHAR(20)', default: "'medium'" },
        { name: 'credits_used', type: 'INTEGER', default: '0' },
        { name: 'desktop_connected_at', type: 'TIMESTAMP', default: 'NULL' },
        { name: 'desktop_version', type: 'VARCHAR(50)', default: 'NULL' },
        { name: 'ai_feedback_score', type: 'DECIMAL(3,2)', default: 'NULL' },
        { name: 'completion_percentage', type: 'INTEGER', default: '0' }
      ];
      
      for (const column of sessionColumnsToAdd) {
        const columnCheck = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'sessions' AND column_name = $1
        `, [column.name]);
        
        if (columnCheck.rows.length === 0) {
          await client.query(`
            ALTER TABLE sessions 
            ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}
          `);
          console.log(`   ✅ Added ${column.name} column`);
        }
      }
      
      // 2. Add missing columns to users table
      console.log('\n2️⃣ Adding missing columns to users table...');
      
      const userColumnsToAdd = [
        { name: 'subscription_tier', type: 'VARCHAR(20)', default: "'free'" },
        { name: 'total_sessions_completed', type: 'INTEGER', default: '0' },
        { name: 'total_credits_purchased', type: 'INTEGER', default: '0' },
        { name: 'total_credits_used', type: 'INTEGER', default: '0' },
        { name: 'avg_interview_score', type: 'DECIMAL(3,2)', default: 'NULL' },
        { name: 'subscription_started_at', type: 'TIMESTAMP', default: 'NULL' },
        { name: 'subscription_expires_at', type: 'TIMESTAMP', default: 'NULL' }
      ];
      
      for (const column of userColumnsToAdd) {
        const columnCheck = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = $1
        `, [column.name]);
        
        if (columnCheck.rows.length === 0) {
          await client.query(`
            ALTER TABLE users 
            ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}
          `);
          console.log(`   ✅ Added ${column.name} column`);
        }
      }
      
      // 3. Create missing tables for analytics
      console.log('\n3️⃣ Creating missing analytics tables...');
      
      // Create interview_questions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS interview_questions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          question_text TEXT NOT NULL,
          question_type VARCHAR(50) DEFAULT 'technical',
          difficulty_level VARCHAR(20) DEFAULT 'medium',
          category VARCHAR(100) DEFAULT 'general',
          time_asked TIMESTAMP DEFAULT NOW(),
          expected_answer TEXT,
          scoring_criteria JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('   ✅ Created interview_questions table');
      
      // Create interview_answers table
      await client.query(`
        CREATE TABLE IF NOT EXISTS interview_answers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          question_id UUID REFERENCES interview_questions(id) ON DELETE CASCADE,
          session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
          answer_text TEXT,
          answer_audio_url VARCHAR(500),
          is_complete BOOLEAN DEFAULT false,
          ai_score DECIMAL(3,2) DEFAULT NULL,
          ai_feedback TEXT,
          duration_seconds INTEGER DEFAULT 0,
          time_submitted TIMESTAMP DEFAULT NOW(),
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('   ✅ Created interview_answers table');
      
      // Create system_notifications table if missing
      const notificationsTableCheck = await client.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'system_notifications'
      `);
      
      if (notificationsTableCheck.rows.length === 0) {
        await client.query(`
          CREATE TABLE system_notifications (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
            priority INTEGER DEFAULT 1,
            is_read BOOLEAN DEFAULT false,
            admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW(),
            expires_at TIMESTAMP
          );
        `);
        console.log('   ✅ Created system_notifications table');
      }
      
      // Create request_logs table for analytics (optional but helpful)
      await client.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          method VARCHAR(10) NOT NULL,
          url VARCHAR(500) NOT NULL,
          status_code INTEGER NOT NULL,
          response_time INTEGER NOT NULL,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
      console.log('   ✅ Created request_logs table');
      
      // 4. Add missing columns to payments table
      console.log('\n4️⃣ Enhancing payments table...');
      
      const paymentColumnsToAdd = [
        { name: 'subscription_period_months', type: 'INTEGER', default: 'NULL' },
        { name: 'discount_applied', type: 'DECIMAL(5,2)', default: '0' },
        { name: 'currency_code', type: 'VARCHAR(3)', default: "'USD'" },
        { name: 'payment_method_details', type: 'JSONB', default: "'{}'" },
        { name: 'refund_status', type: 'VARCHAR(20)', default: 'NULL' },
        { name: 'refund_amount', type: 'DECIMAL(10,2)', default: 'NULL' },
        { name: 'refund_reason', type: 'TEXT', default: 'NULL' }
      ];
      
      for (const column of paymentColumnsToAdd) {
        const columnCheck = await client.query(`
          SELECT column_name FROM information_schema.columns 
          WHERE table_name = 'payments' AND column_name = $1
        `, [column.name]);
        
        if (columnCheck.rows.length === 0) {
          await client.query(`
            ALTER TABLE payments 
            ADD COLUMN ${column.name} ${column.type} DEFAULT ${column.default}
          `);
          console.log(`   ✅ Added ${column.name} column to payments`);
        }
      }
      
      // 5. Create indexes for performance
      console.log('\n5️⃣ Creating performance indexes...');
      
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_sessions_interview_duration ON sessions(interview_duration)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_interview_type ON sessions(interview_type)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_difficulty_level ON sessions(difficulty_level)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_credits_used ON sessions(credits_used)',
        'CREATE INDEX IF NOT EXISTS idx_sessions_desktop_connected_at ON sessions(desktop_connected_at)',
        'CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier)',
        'CREATE INDEX IF NOT EXISTS idx_users_total_sessions_completed ON users(total_sessions_completed)',
        'CREATE INDEX IF NOT EXISTS idx_interview_questions_session_id ON interview_questions(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_interview_questions_question_type ON interview_questions(question_type)',
        'CREATE INDEX IF NOT EXISTS idx_interview_questions_time_asked ON interview_questions(time_asked)',
        'CREATE INDEX IF NOT EXISTS idx_interview_answers_question_id ON interview_answers(question_id)',
        'CREATE INDEX IF NOT EXISTS idx_interview_answers_session_id ON interview_answers(session_id)',
        'CREATE INDEX IF NOT EXISTS idx_interview_answers_ai_score ON interview_answers(ai_score)',
        'CREATE INDEX IF NOT EXISTS idx_interview_answers_time_submitted ON interview_answers(time_submitted)',
        'CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code)',
        'CREATE INDEX IF NOT EXISTS idx_request_logs_user_id ON request_logs(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_system_notifications_admin_id ON system_notifications(admin_id)',
        'CREATE INDEX IF NOT EXISTS idx_system_notifications_is_read ON system_notifications(is_read)'
      ];
      
      for (const indexSQL of indexes) {
        await client.query(indexSQL);
      }
      console.log('   ✅ Created performance indexes');
      
      // 6. Update existing data to populate new columns with sensible defaults
      console.log('\n6️⃣ Populating new columns with calculated data...');
      
      // Update interview_duration based on started_at and ended_at
      await client.query(`
        UPDATE sessions 
        SET interview_duration = EXTRACT(EPOCH FROM (ended_at - started_at))/60
        WHERE ended_at IS NOT NULL 
        AND started_at IS NOT NULL 
        AND interview_duration = 0
      `);
      console.log('   ✅ Updated interview_duration from existing timestamps');
      
      // Update users subscription tier based on credits
      await client.query(`
        UPDATE users 
        SET subscription_tier = CASE 
          WHEN credits > 500 THEN 'enterprise'
          WHEN credits > 100 THEN 'pro'
          ELSE 'free'
        END
        WHERE subscription_tier = 'free'
      `);
      console.log('   ✅ Updated user subscription tiers based on credits');
      
      // Update total_sessions_completed for users
      await client.query(`
        UPDATE users 
        SET total_sessions_completed = (
          SELECT COUNT(*) 
          FROM sessions 
          WHERE sessions.user_id = users.id 
          AND sessions.status = 'completed'
        )
        WHERE total_sessions_completed = 0
      `);
      console.log('   ✅ Updated user session completion counts');
      
      await client.query('COMMIT');
      console.log('\n✅ All database schema fixes completed successfully!');
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error during schema migration, rolled back:', error.message);
      throw error;
    } finally {
      client.release();
    }
    
    // 7. Verify the fixes
    console.log('\n🔍 Verifying schema fixes...');
    
    const verifyQueries = [
      { name: 'sessions.interview_duration', query: 'SELECT interview_duration FROM sessions LIMIT 1' },
      { name: 'users.subscription_tier', query: 'SELECT subscription_tier FROM users LIMIT 1' },
      { name: 'interview_questions table', query: 'SELECT COUNT(*) FROM interview_questions' },
      { name: 'interview_answers table', query: 'SELECT COUNT(*) FROM interview_answers' },
      { name: 'system_notifications table', query: 'SELECT COUNT(*) FROM system_notifications' }
    ];
    
    for (const verify of verifyQueries) {
      try {
        await db.query(verify.query);
        console.log(`   ✅ ${verify.name} - OK`);
      } catch (error) {
        console.log(`   ❌ ${verify.name} - FAILED: ${error.message}`);
      }
    }
    
    await closeDatabase();
    
    console.log('\n🎉 Database schema fix completed!');
    console.log('\n📋 SUMMARY OF CHANGES:');
    console.log('======================');
    console.log('✅ Added interview_duration column to sessions');
    console.log('✅ Added subscription_tier column to users');
    console.log('✅ Added interview tracking columns to sessions');
    console.log('✅ Added user analytics columns to users');
    console.log('✅ Created interview_questions table');
    console.log('✅ Created interview_answers table');
    console.log('✅ Created system_notifications table');
    console.log('✅ Created request_logs table for monitoring');
    console.log('✅ Added performance indexes');
    console.log('✅ Populated existing data with calculated values');
    console.log('\n💡 Your analytics dashboard should now work without errors!');
    
  } catch (error) {
    console.error('💥 Schema fix failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('===================');
    console.log('1. Check database connection');
    console.log('2. Verify database user has ALTER TABLE permissions');
    console.log('3. Check for any active transactions blocking the schema changes');
    console.log('4. Review the error message above for specific issues');
  }
}

console.log('⚠️  This will modify your database schema');
console.log('📋 Changes to be made:');
console.log('- Add missing columns to sessions and users tables');
console.log('- Create missing tables for analytics');
console.log('- Add performance indexes');
console.log('- Populate new columns with calculated data');
console.log('');
console.log('▶️  Starting schema migration...\n');

fixDatabaseSchema();
