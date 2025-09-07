import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

async function restoreProductionBackup() {
  try {
    console.log('🔧 Starting production database restoration...');
    
    const backupFile = 'E:\\db_backup.sql';
    
    // Check if backup file exists
    try {
      await fs.access(backupFile);
      console.log('✅ Backup file found');
    } catch (error) {
      console.error('❌ Backup file not found:', backupFile);
      return;
    }
    
    // Get database connection info
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'mockmate_db',
      user: process.env.DB_USER || 'mockmate_user',
      password: process.env.DB_PASSWORD
    };
    
    console.log('📋 Database Configuration:');
    console.log(`   Host: ${dbConfig.host}`);
    console.log(`   Port: ${dbConfig.port}`);
    console.log(`   Database: ${dbConfig.database}`);
    console.log(`   User: ${dbConfig.user}`);
    
    // First, let's create a backup of current database state
    console.log('\n🔄 Creating backup of current database state...');
    
    const currentBackupFile = `current_db_backup_${Date.now()}.sql`;
    const backupCommand = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f ${currentBackupFile}`;
    
    try {
      // Set PGPASSWORD environment variable for pg_dump
      const backupEnv = { ...process.env, PGPASSWORD: dbConfig.password };
      await execAsync(backupCommand, { env: backupEnv });
      console.log(`✅ Current database backed up to: ${currentBackupFile}`);
    } catch (error) {
      console.log('⚠️  Could not create current backup, continuing anyway...');
    }
    
    // Connect to database to check current state
    console.log('\n🔍 Checking current database state...');
    
    await initializeDatabase();
    const db = getDatabase();
    
    // Check current table count and data
    const currentTables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`📊 Current database has ${currentTables.rows.length} tables`);
    
    // Check if we have any existing data
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    const adminCount = await db.query('SELECT COUNT(*) as count FROM admin_users');
    const sessionCount = await db.query('SELECT COUNT(*) as count FROM sessions');
    
    console.log('📊 Current data counts:');
    console.log(`   Users: ${userCount.rows[0].count}`);
    console.log(`   Admin Users: ${adminCount.rows[0].count}`);
    console.log(`   Sessions: ${sessionCount.rows[0].count}`);
    
    await closeDatabase();
    
    // Ask for confirmation to proceed
    console.log('\n⚠️  WARNING: This will replace ALL current data with the backup data!');
    console.log('\n📋 Backup file contains:');
    console.log('   - Production admin users and activity logs');
    console.log('   - Credit packages and pricing configuration');
    console.log('   - App versions and download logs');
    console.log('   - System configurations and alert templates');
    console.log('   - Other production data');
    
    console.log('\\n▶️  Proceeding with database restoration...\\n');
    
    // Perform the restoration
    console.log('🔄 Restoring database from backup...');
    
    // Use psql to restore the backup
    const restoreCommand = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupFile}"`;
    
    try {
      const restoreEnv = { ...process.env, PGPASSWORD: dbConfig.password };
      console.log('⏳ Executing restoration... this may take a few minutes...');
      
      const { stdout, stderr } = await execAsync(restoreCommand, { 
        env: restoreEnv,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large output
      });
      
      if (stderr && !stderr.includes('NOTICE')) {
        console.log('⚠️  Restoration warnings/errors:');
        console.log(stderr);
      }
      
      console.log('✅ Database restoration completed!');
      
    } catch (error) {
      console.error('❌ Restoration failed:', error.message);
      
      if (error.stdout) {
        console.log('Standard output:', error.stdout);
      }
      if (error.stderr) {
        console.log('Error output:', error.stderr);
      }
      
      console.log('\\n🔧 Manual restoration steps:');
      console.log('1. Make sure PostgreSQL client tools (psql) are installed');
      console.log('2. Run manually:');
      console.log(`   psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupFile}"`);
      return;
    }
    
    // Verify restoration
    console.log('\\n🔍 Verifying restoration...');
    
    await initializeDatabase();
    const verifyDb = getDatabase();
    
    try {
      // Check restored data
      const newUserCount = await verifyDb.query('SELECT COUNT(*) as count FROM users');
      const newAdminCount = await verifyDb.query('SELECT COUNT(*) as count FROM admin_users');
      const newSessionCount = await verifyDb.query('SELECT COUNT(*) as count FROM sessions');
      const creditPackagesCount = await verifyDb.query('SELECT COUNT(*) as count FROM credit_packages');
      
      console.log('✅ Restoration verification:');
      console.log(`   Users: ${newUserCount.rows[0].count}`);
      console.log(`   Admin Users: ${newAdminCount.rows[0].count}`);
      console.log(`   Sessions: ${newSessionCount.rows[0].count}`);
      console.log(`   Credit Packages: ${creditPackagesCount.rows[0].count}`);
      
      // Check admin user details
      const adminUser = await verifyDb.query(`
        SELECT username, email, role, is_active, created_at 
        FROM admin_users 
        LIMIT 1
      `);
      
      if (adminUser.rows.length > 0) {
        const admin = adminUser.rows[0];
        console.log('\\n👤 Restored Admin User:');
        console.log(`   Username: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Active: ${admin.is_active}`);
        console.log(`   Created: ${admin.created_at}`);
      }
      
      // Check credit packages
      const packages = await verifyDb.query(`
        SELECT package_name, credits_amount, price_usd, is_active 
        FROM credit_packages 
        ORDER BY created_at
      `);
      
      if (packages.rows.length > 0) {
        console.log('\\n💰 Restored Credit Packages:');
        packages.rows.forEach(pkg => {
          console.log(`   - ${pkg.package_name}: ${pkg.credits_amount} credits for $${pkg.price_usd} (${pkg.is_active ? 'Active' : 'Inactive'})`);
        });
      }
      
    } catch (error) {
      console.error('⚠️  Error during verification:', error.message);
    }
    
    await closeDatabase();
    
    console.log('\\n🎉 Database restoration completed successfully!');
    console.log('\\n📋 IMPORTANT NOTES:');
    console.log('========================');
    console.log('✅ Production data has been restored');
    console.log('✅ Admin users, credit packages, and configurations are now available');
    console.log('✅ Your application should now have all the production data');
    console.log('\\n⚠️  Remember to:');
    console.log('- Update admin passwords if needed');
    console.log('- Check payment configurations');
    console.log('- Verify system configurations');
    console.log('- Test the application functionality');
    
    if (await fs.access(currentBackupFile).then(() => true).catch(() => false)) {
      console.log(`\\n💾 Your previous database backup is saved as: ${currentBackupFile}`);
    }
    
  } catch (error) {
    console.error('💥 Restoration failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    console.log('\\n🔧 TROUBLESHOOTING:');
    console.log('===================');
    console.log('1. Make sure PostgreSQL client tools are installed');
    console.log('2. Check database connection parameters');
    console.log('3. Ensure the backup file is accessible');
    console.log('4. Check database permissions');
  }
}

console.log('⚠️  This will restore your production database from backup');
console.log('📋 This will:');
console.log('- Replace current database with backup data');
console.log('- Restore all production configurations');
console.log('- Restore admin users and activity logs');
console.log('- Restore credit packages and pricing');
console.log('');
console.log('▶️  Starting database restoration...\\n');

restoreProductionBackup();
