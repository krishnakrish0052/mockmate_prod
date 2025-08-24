import { getDatabase, initializeDatabase } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const sessionId = 'dbfcc682-340c-4e72-a7c9-5be61499bbbe';

async function checkSession() {
  try {
    await initializeDatabase();
    const pool = getDatabase();
    
    console.log('Checking session:', sessionId);
    
    // Check in sessions table
    const sessionQuery = `
      SELECT id, user_id, session_name, job_title, status, created_at, started_at, ended_at
      FROM sessions 
      WHERE id = $1
    `;
    
    const sessionResult = await pool.query(sessionQuery, [sessionId]);
    
    console.log('Session found in database:', sessionResult.rows.length);
    if (sessionResult.rows.length > 0) {
      console.log('Session details:', JSON.stringify(sessionResult.rows[0], null, 2));
    }
    
    // Check all sessions for this user if session exists
    if (sessionResult.rows.length > 0) {
      const userId = sessionResult.rows[0].user_id;
      const userSessionsQuery = `
        SELECT id, session_name, status, created_at 
        FROM sessions 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 10
      `;
      
      const userSessionsResult = await pool.query(userSessionsQuery, [userId]);
      console.log(`\nAll recent sessions for user ${userId}:`);
      userSessionsResult.rows.forEach(session => {
        console.log(`- ${session.id}: ${session.session_name} (${session.status}) - ${session.created_at}`);
      });
    }
    
    // Check if there are any sessions at all
    const allSessionsQuery = 'SELECT COUNT(*) as total FROM sessions';
    const allSessionsResult = await pool.query(allSessionsQuery);
    console.log(`\nTotal sessions in database: ${allSessionsResult.rows[0].total}`);
    
  } catch (error) {
    console.error('Error checking session:', error);
  } finally {
    process.exit(0);
  }
}

checkSession();
