import { getDatabase, initializeDatabase } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config();

async function testDatabase() {
  try {
    console.log('🔍 Testing database connection and session table...');
    
    await initializeDatabase();
    const pool = getDatabase();
    
    // Test basic connection
    console.log('✅ Database connected successfully');
    
    // Check if sessions table exists and get its structure
    const tableInfoQuery = `
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'sessions' 
      ORDER BY ordinal_position;
    `;
    
    const tableInfo = await pool.query(tableInfoQuery);
    console.log('\n📋 Sessions table structure:');
    tableInfo.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    
    // Test inserting a session
    console.log('\n🧪 Testing session creation...');
    const testSessionId = '12345678-1234-1234-1234-123456789abc';
    const testUserId = '87654321-4321-4321-4321-cba987654321';
    
    try {
      const createSessionQuery = `
        INSERT INTO sessions (
          id, user_id, session_name, job_title, job_description, difficulty_level, 
          estimated_duration_minutes, interview_type, resume_id,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created', CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const sessionResult = await pool.query(createSessionQuery, [
        testSessionId,
        testUserId,
        'Test Job Title',
        'Test Job Title',
        'Test job description',
        'intermediate',
        30,
        'technical',
        null,
      ]);
      
      console.log('✅ Session created successfully:', sessionResult.rows[0]);
      
      // Clean up test data
      await pool.query('DELETE FROM sessions WHERE id = $1', [testSessionId]);
      console.log('🗑️ Test session cleaned up');
      
    } catch (insertError) {
      console.error('❌ Session creation failed:', insertError);
      
      // Check what columns actually exist vs what we're trying to insert
      const actualColumns = tableInfo.rows.map(row => row.column_name);
      const expectedColumns = [
        'id', 'user_id', 'session_name', 'job_title', 'job_description', 
        'difficulty_level', 'estimated_duration_minutes', 'interview_type', 
        'resume_id', 'status', 'created_at'
      ];
      
      console.log('\n🔍 Column analysis:');
      console.log('Expected columns:', expectedColumns);
      console.log('Actual columns:', actualColumns);
      
      const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
      const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log('❌ Missing columns:', missingColumns);
      }
      if (extraColumns.length > 0) {
        console.log('ℹ️ Extra columns:', extraColumns);
      }
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    process.exit(0);
  }
}

testDatabase();
