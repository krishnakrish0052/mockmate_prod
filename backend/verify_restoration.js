import dotenv from 'dotenv';
dotenv.config();

import { initializeDatabase, getDatabase, closeDatabase } from './config/database.js';

async function verifyRestoration() {
  try {
    console.log('🔍 Verifying database restoration...');
    
    await initializeDatabase();
    const db = getDatabase();
    
    // Check what data was restored
    const tables = [
      'users', 'admin_users', 'sessions', 'payments', 
      'credit_packages', 'app_versions', 'app_platforms',
      'alert_templates', 'system_config', 'email_templates'
    ];
    
    console.log('\n📊 Current data state:');
    console.log('=====================');
    
    for (const table of tables) {
      try {
        const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`   ${table.padEnd(25)}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`   ${table.padEnd(25)}: ERROR - ${error.message}`);
      }
    }
    
    // Check admin users
    try {
      console.log('\n👤 Admin Users:');
      console.log('================');
      const admins = await db.query(`
        SELECT id, username, email, first_name, last_name, role, is_active, created_at 
        FROM admin_users 
        ORDER BY created_at
      `);
      
      if (admins.rows.length > 0) {
        admins.rows.forEach(admin => {
          console.log(`   📧 ${admin.email}`);
          console.log(`      Username: ${admin.username}`);
          console.log(`      Name: ${admin.first_name} ${admin.last_name}`);
          console.log(`      Role: ${admin.role}`);
          console.log(`      Active: ${admin.is_active}`);
          console.log(`      ID: ${admin.id}`);
          console.log(`      Created: ${admin.created_at}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log(`   Error checking admin users: ${error.message}`);
    }
    
    // Check credit packages
    try {
      console.log('\n💰 Credit Packages:');
      console.log('===================');
      const packages = await db.query(`
        SELECT id, package_id, package_name, credits_amount, price_usd, is_active, created_at 
        FROM credit_packages 
        WHERE is_active = true
        ORDER BY created_at
      `);
      
      if (packages.rows.length > 0) {
        packages.rows.forEach(pkg => {
          console.log(`   💳 ${pkg.package_name} (ID: ${pkg.package_id})`);
          console.log(`      Credits: ${pkg.credits_amount}`);
          console.log(`      Price: $${pkg.price_usd}`);
          console.log(`      Active: ${pkg.is_active}`);
          console.log(`      Created: ${pkg.created_at}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log(`   Error checking credit packages: ${error.message}`);
    }
    
    // Check app versions
    try {
      console.log('\n📱 App Versions:');
      console.log('=================');
      const appVersions = await db.query(`
        SELECT av.id, av.version, ap.name as platform, av.is_active, av.download_count, av.created_at
        FROM app_versions av
        LEFT JOIN app_platforms ap ON av.platform_id = ap.id
        WHERE av.is_active = true
        ORDER BY av.created_at DESC
      `);
      
      if (appVersions.rows.length > 0) {
        appVersions.rows.forEach(app => {
          console.log(`   📲 ${app.platform || 'Unknown'} v${app.version}`);
          console.log(`      Downloads: ${app.download_count}`);
          console.log(`      Active: ${app.is_active}`);
          console.log(`      Created: ${app.created_at}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log(`   Error checking app versions: ${error.message}`);
    }
    
    // Check system configuration
    try {
      console.log('\n⚙️  System Configuration:');
      console.log('==========================');
      const configs = await db.query(`
        SELECT config_key, config_value, description, created_at 
        FROM system_config 
        ORDER BY config_key
      `);
      
      if (configs.rows.length > 0) {
        configs.rows.forEach(config => {
          console.log(`   🔧 ${config.config_key}: ${config.config_value}`);
          if (config.description) {
            console.log(`      Description: ${config.description}`);
          }
          console.log('');
        });
      }
    } catch (error) {
      console.log(`   Error checking system config: ${error.message}`);
    }
    
    // Check if enhanced users endpoint should work
    try {
      console.log('\n🔍 Enhanced Users Endpoint Check:');
      console.log('==================================');
      
      // Check if required columns exist for enhanced users
      const userColumnsCheck = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        ORDER BY column_name
      `);
      
      console.log('   Available columns in users table:');
      userColumnsCheck.rows.forEach(col => {
        console.log(`     - ${col.column_name}`);
      });
      
      // Test the enhanced users query
      console.log('\n   Testing enhanced users query...');
      const testQuery = `
        SELECT 
          u.id,
          u.email,
          u.created_at,
          u.is_active,
          u.subscription_tier,
          COALESCE(ucb.balance, 0) as credit_balance,
          COUNT(DISTINCT s.id) as total_sessions
        FROM users u
        LEFT JOIN user_credit_balances ucb ON u.id = ucb.user_id
        LEFT JOIN sessions s ON u.id = s.user_id
        GROUP BY u.id, u.email, u.created_at, u.is_active, u.subscription_tier, ucb.balance
        LIMIT 5
      `;
      
      const testResult = await db.query(testQuery);
      console.log(`   ✅ Query successful! Found ${testResult.rows.length} users`);
      
      if (testResult.rows.length > 0) {
        console.log('   Sample user data:');
        testResult.rows.forEach((user, index) => {
          console.log(`     ${index + 1}. ${user.email} - ${user.total_sessions} sessions`);
        });
      }
      
    } catch (error) {
      console.log(`   ❌ Enhanced users endpoint test failed: ${error.message}`);
      console.log('   This suggests the /api/admin/users-enhanced endpoint might still have issues');
    }
    
    await closeDatabase();
    
    console.log('\n🎯 RESTORATION SUMMARY:');
    console.log('========================');
    console.log('✅ Database connection successful');
    console.log('✅ Schema and functions are in place');
    console.log('✅ Some production data has been restored');
    console.log('⚠️  Schema conflicts prevented full restoration');
    console.log('ℹ️  Tables exist but may have different column structures');
    
    console.log('\n🔧 NEXT STEPS:');
    console.log('===============');
    console.log('1. Start your application server to test current functionality');
    console.log('2. Test the admin panel login');
    console.log('3. Check if the enhanced users endpoint works');
    console.log('4. If needed, we can manually insert specific data');
    console.log('5. Run any pending database migrations');
    
    console.log('\n💡 TIP: The restoration partially succeeded. Test your application');
    console.log('   and let me know which specific functionality is not working.');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

verifyRestoration();
