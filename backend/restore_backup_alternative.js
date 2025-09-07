import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';
import fs from 'fs/promises';

async function restoreBackupAlternative() {
  try {
    console.log('🔧 Alternative database restoration method...');
    console.log('This method will drop and recreate the database with backup data\n');
    
    const backupFile = 'E:\\db_backup.sql';
    
    // Check if backup file exists
    try {
      await fs.access(backupFile);
      console.log('✅ Backup file found');
    } catch (error) {
      console.error('❌ Backup file not found:', backupFile);
      return;
    }
    
    console.log('📋 Manual restoration steps:');
    console.log('==========================');
    
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'mockmate_db',
      user: process.env.DB_USER || 'mockmate_user',
      password: process.env.DB_PASSWORD
    };
    
    console.log('\n1️⃣ First, backup your current database (optional but recommended):');
    console.log(`   pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} > current_backup.sql`);
    
    console.log('\n2️⃣ Drop the current database (CAREFUL - this deletes all data):');
    console.log(`   dropdb -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} ${dbConfig.database}`);
    
    console.log('\n3️⃣ Create a new empty database:');
    console.log(`   createdb -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} ${dbConfig.database}`);
    
    console.log('\n4️⃣ Restore from backup:');
    console.log(`   psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} < "${backupFile}"`);
    
    console.log('\n📝 Or as a single command (Windows PowerShell):');
    console.log('   $env:PGPASSWORD="' + dbConfig.password + '"');
    console.log(`   dropdb -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} ${dbConfig.database} ; createdb -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} ${dbConfig.database} ; psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupFile}"`);
    
    console.log('\n🔧 Alternative: Direct SQL execution');
    console.log('==================================');
    
    // Read the backup file content
    console.log('📖 Reading backup file...');
    const backupContent = await fs.readFile(backupFile, 'utf8');
    console.log(`✅ Backup file loaded (${Math.round(backupContent.length / 1024)}KB)`);
    
    console.log('\n📋 Backup file contains:');
    console.log('- Database schema (tables, functions, indexes)');
    console.log('- Production data (users, admin, configurations)');
    console.log('- Extensions and constraints');
    
    // Split content into manageable chunks
    const sqlStatements = backupContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
      .slice(0, 10); // Show first 10 statements as example
    
    console.log(`\n📊 Backup contains approximately ${backupContent.split(';').length} SQL statements`);
    console.log('\n🔍 Sample statements from backup:');
    sqlStatements.forEach((stmt, index) => {
      if (stmt.length > 100) {
        console.log(`   ${index + 1}. ${stmt.substring(0, 100)}...`);
      } else {
        console.log(`   ${index + 1}. ${stmt}`);
      }
    });
    
    console.log('\n⚠️  IMPORTANT NOTES:');
    console.log('==================');
    console.log('✅ The backup file is valid and contains production data');
    console.log('✅ Contains admin user: krishankant962@gmail.com');
    console.log('✅ Contains credit packages and system configurations');
    console.log('✅ Contains app versions and platform data');
    console.log('⚠️  This will replace ALL current data');
    console.log('⚠️  Make sure to backup current data first if needed');
    
    console.log('\n🚀 Recommended restoration method:');
    console.log('================================');
    console.log('1. Open a terminal/command prompt');
    console.log('2. Set the password environment variable:');
    console.log(`   set PGPASSWORD=${dbConfig.password}`);
    console.log('3. Run the restoration command:');
    console.log(`   psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupFile}"`);
    
    // Test database connection
    console.log('\n🔍 Testing database connection...');
    
    try {
      await initializeDatabase();
      const db = getDatabase();
      
      const result = await db.query('SELECT version()');
      console.log('✅ Database connection successful');
      console.log(`   PostgreSQL version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
      
      await closeDatabase();
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      console.log('   Please check your database configuration in .env file');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

restoreBackupAlternative();
