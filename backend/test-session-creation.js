import { getDatabase, initializeDatabase } from './config/database.js';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

async function testSessionCreation() {
  try {
    await initializeDatabase();
    const pool = getDatabase();
    
    console.log('🧪 Testing session creation with improved error handling...');
    
    // First, check if the problematic session exists
    const problematicSessionId = 'dbfcc682-340c-4e72-a7c9-5be61499bbbe';
    console.log('\n🔍 Checking if problematic session exists:', problematicSessionId);
    
    const existingSessionQuery = 'SELECT id, user_id, status FROM sessions WHERE id = $1';
    const existingSessionResult = await pool.query(existingSessionQuery, [problematicSessionId]);
    
    if (existingSessionResult.rows.length > 0) {
      console.log('✅ Problematic session EXISTS in database:');
      console.log('  - ID:', existingSessionResult.rows[0].id);
      console.log('  - User ID:', existingSessionResult.rows[0].user_id);
      console.log('  - Status:', existingSessionResult.rows[0].status);
    } else {
      console.log('❌ Problematic session NOT FOUND in database');
      
      // Try to create the problematic session with a valid user ID
      console.log('\n🛠️ Attempting to create the problematic session...');
      
      // Get a valid user ID from the database
      const userQuery = 'SELECT id, email FROM users WHERE is_active = true LIMIT 1';
      const userResult = await pool.query(userQuery);
      
      if (userResult.rows.length === 0) {
        console.log('❌ No active users found in database');
        return;
      }
      
      const validUser = userResult.rows[0];
      console.log('  - Using valid user:', validUser.email, '(ID:', validUser.id + ')');
      
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
          problematicSessionId,
          validUser.id,
          'Test Interview Session',
          'Software Engineer',
          'Testing session creation for debugging',
          'intermediate',
          30,
          'technical',
          null
        ]);
        
        console.log('✅ Problematic session created successfully!');
        console.log('  - ID:', sessionResult.rows[0].id);
        console.log('  - Status:', sessionResult.rows[0].status);
        console.log('  - Created at:', sessionResult.rows[0].created_at);
        
      } catch (createError) {
        console.error('❌ Failed to create problematic session:', createError.message);
        console.error('  - Error code:', createError.code);
      }
    }
    
    // Now test the new session creation logic with proper error handling
    console.log('\n🧪 Testing new session creation with a fresh session...');
    
    const newSessionId = uuidv4();
    console.log('  - New session ID:', newSessionId);
    
    // Get a valid user
    const userQuery2 = 'SELECT id, email, credits FROM users WHERE is_active = true LIMIT 1';
    const userResult2 = await pool.query(userQuery2);
    const testUser = userResult2.rows[0];
    
    console.log('  - Test user:', testUser.email, 'Credits:', testUser.credits);
    
    // Simulate the new session creation logic
    const client = await pool.connect();
    let session;
    
    try {
      await client.query('BEGIN');
      
      // Verify user exists and get user info (NEW LOGIC)
      const userQuery = 'SELECT id, credits FROM users WHERE id = $1 AND is_active = true';
      const userResult = await client.query(userQuery, [testUser.id]);
      
      if (userResult.rows.length === 0) {
        throw new Error('User not found or inactive');
      }
      
      const user = userResult.rows[0];
      console.log('  ✅ User validation passed. Credits:', user.credits);
      
      // Double-check credits in database (NEW LOGIC)
      const totalCreditCost = 1;
      if (user.credits < totalCreditCost) {
        throw new Error(`Insufficient credits: required ${totalCreditCost}, available ${user.credits}`);
      }
      
      console.log('  ✅ Credit validation passed');
      
      const createSessionQuery = `
        INSERT INTO sessions (
          id, user_id, session_name, job_title, job_description, difficulty_level, 
          estimated_duration_minutes, interview_type, resume_id,
          status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created', CURRENT_TIMESTAMP)
        RETURNING *
      `;

      const sessionResult = await client.query(createSessionQuery, [
        newSessionId,
        testUser.id,
        'New Test Session',
        'Senior Developer',
        'Testing improved session creation',
        'advanced',
        45,
        'mixed',
        null,
      ]);

      if (sessionResult.rows.length === 0) {
        throw new Error('Failed to create session - no data returned');
      }
      
      session = sessionResult.rows[0];
      
      await client.query('COMMIT');
      console.log('  ✅ Session created successfully with new logic!');
      console.log('    - ID:', session.id);
      console.log('    - Status:', session.status);
      console.log('    - Job Title:', session.job_title);
      
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('  ❌ Session creation failed:', dbError.message);
      
      // Handle specific error cases (NEW LOGIC)
      if (dbError.code === '23503') {
        console.error('  💡 Foreign key violation - user reference issue');
      } else if (dbError.code === '23505') {
        console.error('  💡 Unique violation - duplicate session ID');
      }
    } finally {
      client.release();
    }
    
    // Test retrieval of the session
    if (session) {
      console.log('\n🔍 Testing session retrieval...');
      const retrieveQuery = `
        SELECT s.*, ur.file_name as resume_filename, ur.parsed_content as resume_content
        FROM sessions s
        LEFT JOIN user_resumes ur ON s.resume_id = ur.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      
      const retrieveResult = await pool.query(retrieveQuery, [newSessionId, testUser.id]);
      
      if (retrieveResult.rows.length > 0) {
        console.log('  ✅ Session retrieved successfully');
        console.log('    - Status:', retrieveResult.rows[0].status);
        console.log('    - Job Title:', retrieveResult.rows[0].job_title);
      } else {
        console.log('  ❌ Session not found during retrieval');
      }
    }
    
    console.log('\n🏁 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testSessionCreation();
