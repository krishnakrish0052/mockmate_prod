import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkProductionConfig() {
  console.log('🔍 Checking Production Database Configuration');
  console.log('=============================================\n');
  
  // Check if we're connecting to production database
  console.log('📋 Database Connection Details:');
  console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
  console.log(`   Port: ${process.env.DB_PORT || 5432}`);
  console.log(`   Database: ${process.env.DB_NAME || 'mockmate_db'}`);
  console.log(`   User: ${process.env.DB_USER || 'mockmate_user'}`);
  console.log(`   Has Password: ${!!process.env.DB_PASSWORD}`);
  
  // Database configuration
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
    dbConfig.password = String(process.env.DB_PASSWORD.trim());
  }

  console.log('\n🔄 Connecting to database...');
  const db = new Pool(dbConfig);
  
  try {
    // Test database connection
    const client = await db.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection successful');

    // Check if payment_configurations table exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'payment_configurations'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('❌ payment_configurations table does NOT exist!');
      console.log('   → Run: node migrations/setup_payment_gateways.js');
      process.exit(1);
    }

    console.log('✅ payment_configurations table exists');

    // Check for Cashfree configuration
    const configResult = await db.query(`
      SELECT id, provider_name, display_name, is_active, is_test_mode, 
             configuration, created_at, updated_at
      FROM payment_configurations 
      WHERE provider_name = 'cashfree'
    `);
    
    if (configResult.rows.length === 0) {
      console.log('❌ NO Cashfree configuration found in database!');
      console.log('\n🔧 SOLUTION: Run the setup script first:');
      console.log('   node migrations/setup_payment_gateways.js');
      console.log('\n   Then configure credentials with:');
      console.log('   UPDATE payment_configurations SET');
      console.log('   configuration = \'{"app_id":"YOUR_PRODUCTION_APP_ID","secret_key":"YOUR_PRODUCTION_SECRET_KEY","is_test_mode":false}\',');
      console.log('   is_active = true, is_test_mode = false');
      console.log('   WHERE provider_name = \'cashfree\';');
      process.exit(1);
    }
    
    const config = configResult.rows[0];
    console.log('\n📋 Found Cashfree Configuration:');
    console.log(`   ID: ${config.id}`);
    console.log(`   Status: ${config.is_active ? '🟢 Active' : '🔴 INACTIVE'}`);
    console.log(`   Mode: ${config.is_test_mode ? '🧪 Test' : '🚀 Production'}`);
    console.log(`   Created: ${config.created_at}`);
    console.log(`   Updated: ${config.updated_at}`);
    
    // Check configuration details
    try {
      const conf = typeof config.configuration === 'string' 
        ? JSON.parse(config.configuration) 
        : config.configuration;
        
      console.log('\n🔐 Configuration Details:');
      console.log(`   App ID: ${conf.app_id ? conf.app_id.substring(0, 8) + '••••' : '❌ MISSING'}`);
      console.log(`   Secret Key: ${conf.secret_key ? '••••••••' : '❌ MISSING'}`);
      console.log(`   Test Mode: ${conf.is_test_mode}`);
      
      const hasValidCredentials = conf.app_id && 
                                 conf.secret_key &&
                                 conf.app_id !== 'your_cashfree_app_id' &&
                                 conf.app_id !== 'TEST_APP_ID_12345';
      
      if (!hasValidCredentials) {
        console.log('\n❌ PROBLEM: Invalid or dummy credentials!');
        console.log('🔧 SOLUTION: Update with real credentials:');
        console.log(`UPDATE payment_configurations SET configuration = '{"app_id":"YOUR_PRODUCTION_APP_ID","secret_key":"YOUR_PRODUCTION_SECRET_KEY","is_test_mode":false}', is_active = true, is_test_mode = false WHERE id = '${config.id}';`);
      } else {
        console.log('✅ Valid credentials detected');
      }
      
      if (!config.is_active) {
        console.log('\n❌ PROBLEM: Gateway is INACTIVE!');
        console.log('🔧 SOLUTION: Activate the gateway:');
        console.log(`UPDATE payment_configurations SET is_active = true WHERE id = '${config.id}';`);
      }
      
    } catch (parseError) {
      console.log('\n❌ PROBLEM: Configuration JSON is invalid!');
      console.log('🔧 SOLUTION: Fix the configuration:');
      console.log(`UPDATE payment_configurations SET configuration = '{"app_id":"YOUR_PRODUCTION_APP_ID","secret_key":"YOUR_PRODUCTION_SECRET_KEY","is_test_mode":false}' WHERE id = '${config.id}';`);
    }

    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('\n🔧 Check your production database configuration:');
    console.log('1. Database server is running');
    console.log('2. Database credentials are correct');
    console.log('3. Network connectivity to database');
    await db.end();
    process.exit(1);
  }
}

checkProductionConfig();
