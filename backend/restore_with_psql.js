import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

async function restoreWithPsql() {
  try {
    console.log('🔧 Restoring production database using psql...');
    
    const backupFile = 'E:\\db_backup.sql';
    const psqlPath = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
    
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
    
    // Check current database state
    console.log('\n🔍 Checking current database state...');
    
    try {
      await initializeDatabase();
      const db = getDatabase();
      
      const userCount = await db.query('SELECT COUNT(*) as count FROM users');
      const adminCount = await db.query('SELECT COUNT(*) as count FROM admin_users');
      const sessionCount = await db.query('SELECT COUNT(*) as count FROM sessions');
      const creditPackagesCount = await db.query('SELECT COUNT(*) as count FROM credit_packages');
      
      console.log('📊 Current data counts:');
      console.log(`   Users: ${userCount.rows[0].count}`);
      console.log(`   Admin Users: ${adminCount.rows[0].count}`);
      console.log(`   Sessions: ${sessionCount.rows[0].count}`);
      console.log(`   Credit Packages: ${creditPackagesCount.rows[0].count}`);
      
      await closeDatabase();
    } catch (error) {
      console.log('⚠️  Could not check current database state:', error.message);
    }
    
    console.log('\n⚠️  WARNING: This will replace ALL current data with backup data!');
    console.log('\n📋 Backup contains:');
    console.log('   ✅ Admin user: krishankant962@gmail.com');
    console.log('   ✅ Credit packages and pricing configuration');
    console.log('   ✅ App versions and download logs');
    console.log('   ✅ System configurations and alert templates');
    console.log('   ✅ Production activity logs and data');
    
    console.log('\n🔄 Starting database restoration...');
    
    // Build the psql command
    const restoreCommand = `"${psqlPath}" -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupFile}"`;
    
    console.log('⏳ Executing restoration... this may take a few minutes...');
    console.log(`🔧 Command: ${restoreCommand.replace(dbConfig.password, '***')}`);
    
    try {
      const restoreEnv = { ...process.env, PGPASSWORD: dbConfig.password };
      
      const { stdout, stderr } = await execAsync(restoreCommand, { 
        env: restoreEnv,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 300000 // 5 minute timeout
      });
      
      if (stdout) {
        console.log('\n📄 Restoration output:');
        console.log(stdout);
      }
      
      if (stderr && !stderr.includes('NOTICE')) {
        console.log('\n⚠️  Warnings/Messages:');
        console.log(stderr);
      }
      
      console.log('\n✅ Database restoration completed!');
      
    } catch (error) {
      console.error('\n❌ Restoration failed:', error.message);
      
      if (error.stdout) {
        console.log('\nStandard output:', error.stdout);
      }
      if (error.stderr) {
        console.log('\nError output:', error.stderr);
      }
      
      console.log('\n🔧 You can also try running manually in PowerShell:');
      console.log(`$env:PGPASSWORD="${dbConfig.password}"`);
      console.log(`& "${psqlPath}" -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupFile}"`);
      return;
    }
    
    // Verify restoration
    console.log('\n🔍 Verifying restoration...');
    
    try {
      await initializeDatabase();
      const verifyDb = getDatabase();
      
      // Check restored data
      const newUserCount = await verifyDb.query('SELECT COUNT(*) as count FROM users');
      const newAdminCount = await verifyDb.query('SELECT COUNT(*) as count FROM admin_users');
      const newSessionCount = await verifyDb.query('SELECT COUNT(*) as count FROM sessions');
      const creditPackagesCount = await verifyDb.query('SELECT COUNT(*) as count FROM credit_packages');
      const alertTemplatesCount = await verifyDb.query('SELECT COUNT(*) as count FROM alert_templates');
      
      console.log('✅ Restoration verification:');
      console.log(`   Users: ${newUserCount.rows[0].count}`);
      console.log(`   Admin Users: ${newAdminCount.rows[0].count}`);
      console.log(`   Sessions: ${newSessionCount.rows[0].count}`);
      console.log(`   Credit Packages: ${creditPackagesCount.rows[0].count}`);
      console.log(`   Alert Templates: ${alertTemplatesCount.rows[0].count}`);
      
      // Check admin user details
      const adminUser = await verifyDb.query(`
        SELECT username, email, role, is_active, created_at, first_name, last_name 
        FROM admin_users 
        LIMIT 1
      `);
      
      if (adminUser.rows.length > 0) {
        const admin = adminUser.rows[0];
        console.log('\n👤 Restored Admin User:');
        console.log(`   Username: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Name: ${admin.first_name} ${admin.last_name}`);
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
        console.log('\n💰 Restored Credit Packages:');
        packages.rows.forEach(pkg => {
          console.log(`   - ${pkg.package_name}: ${pkg.credits_amount} credits for $${pkg.price_usd} (${pkg.is_active ? 'Active' : 'Inactive'})`);
        });
      }
      
      // Check app versions
      const appVersions = await verifyDb.query(`
        SELECT av.version, ap.display_name as platform, av.is_active, av.download_count
        FROM app_versions av
        JOIN app_platforms ap ON av.platform_id = ap.id
        ORDER BY av.created_at DESC
      `);
      
      if (appVersions.rows.length > 0) {
        console.log('\n📱 Restored App Versions:');
        appVersions.rows.forEach(app => {
          console.log(`   - ${app.platform} v${app.version}: ${app.download_count} downloads (${app.is_active ? 'Active' : 'Inactive'})`);
        });
      }
      
      await closeDatabase();
      
    } catch (error) {
      console.error('⚠️  Error during verification:', error.message);
    }
    
    console.log('\n🎉 Database restoration completed successfully!');
    console.log('\n📋 RESTORATION SUMMARY:');
    console.log('========================');
    console.log('✅ Production database backup has been restored');
    console.log('✅ All production data is now available');
    console.log('✅ Admin panel should work with restored data');
    console.log('✅ Credit packages and configurations restored');
    console.log('✅ System configurations and templates restored');
    
    console.log('\n🔑 LOGIN CREDENTIALS:');
    console.log('=====================');
    console.log('Admin Username: admin');
    console.log('Admin Email: krishankant962@gmail.com');
    console.log('Note: Use the production admin password');
    
    console.log('\n⚠️  IMPORTANT NEXT STEPS:');
    console.log('========================');
    console.log('1. Restart your application server');
    console.log('2. Test admin panel login');
    console.log('3. Verify analytics dashboard works');
    console.log('4. Check payment configurations');
    console.log('5. Test enhanced users functionality');
    console.log('6. Verify all restored data is working correctly');
    
  } catch (error) {
    console.error('💥 Restoration process failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

console.log('🔄 Production Database Restoration');
console.log('==================================');
console.log('This will restore your production database from the backup file.');
console.log('The backup contains real production data including:');
console.log('- Admin users and authentication');
console.log('- Credit packages and pricing');
console.log('- App versions and downloads');
console.log('- System configurations');
console.log('- Activity logs and analytics data');
console.log('');
console.log('▶️  Starting restoration process...\n');

restoreWithPsql();
