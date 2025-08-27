import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function activateCashfree() {
  // Create database connection directly
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  // Only add password if it exists and is not empty
  if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
    dbConfig.password = String(process.env.DB_PASSWORD.trim());
  } else {
    console.log('⚠️  No database password provided, attempting passwordless connection');
  }

  console.log('🔄 Connecting to database:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    hasPassword: !!dbConfig.password
  });

  const db = new Pool(dbConfig);
  
  try {
    // Test the connection
    const client = await db.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection established');

    // Check if payment_configurations table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'payment_configurations'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Payment configurations table does not exist');
      console.log('Please run: node migrations/setup_payment_gateways.js first');
      process.exit(1);
    }

    // Check current Cashfree configuration
    console.log('🔍 Checking current Cashfree configuration...');
    const existingConfig = await db.query(`
      SELECT id, provider_name, display_name, is_active, is_test_mode, configuration
      FROM payment_configurations 
      WHERE provider_name = 'cashfree'
    `);

    if (existingConfig.rows.length === 0) {
      console.log('❌ No Cashfree configuration found');
      console.log('Please run: node migrations/setup_payment_gateways.js first');
      process.exit(1);
    }

    const config = existingConfig.rows[0];
    console.log(`Found Cashfree config: ${config.display_name}`);
    console.log(`Current status: ${config.is_active ? 'Active' : 'Inactive'}`);
    console.log(`Mode: ${config.is_test_mode ? 'TEST' : 'LIVE'}`);

    if (config.is_active) {
      console.log('✅ Cashfree is already active!');
    } else {
      console.log('🔄 Activating Cashfree payment gateway...');
      
      // Activate Cashfree
      const updateResult = await db.query(`
        UPDATE payment_configurations 
        SET is_active = true, updated_at = NOW()
        WHERE provider_name = 'cashfree'
        RETURNING id, provider_name, is_active
      `);

      if (updateResult.rows.length > 0) {
        console.log('✅ Cashfree payment gateway activated successfully!');
      } else {
        console.log('❌ Failed to activate Cashfree');
        process.exit(1);
      }
    }

    // Check configuration credentials
    let conf;
    try {
      conf = typeof config.configuration === 'string' ? 
        JSON.parse(config.configuration) : config.configuration;
    } catch (e) {
      console.log('⚠️  Configuration JSON is invalid');
      conf = {};
    }
    console.log('\n📋 Configuration status:');
    
    if (conf.app_id === 'your_cashfree_app_id' || !conf.app_id) {
      console.log('⚠️  App ID needs to be configured (currently placeholder)');
    } else {
      console.log(`✅ App ID configured: ${conf.app_id.substring(0, 8)}••••`);
    }
    
    if (conf.secret_key === 'your_cashfree_secret_key' || !conf.secret_key) {
      console.log('⚠️  Secret Key needs to be configured (currently placeholder)');
    } else {
      console.log('✅ Secret Key configured');
    }

    console.log(`Mode: ${conf.is_test_mode ? 'TEST' : 'LIVE'}`);

    if (conf.app_id === 'your_cashfree_app_id' || conf.secret_key === 'your_cashfree_secret_key') {
      console.log('\n🚨 IMPORTANT: You need to update the Cashfree credentials!');
      console.log('Use the admin panel or update the database directly with your actual Cashfree credentials.');
    }

    console.log('\n🎉 Cashfree activation completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

activateCashfree();
