import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setCashfreeProductionMode() {
  console.log('🚀 Switching Cashfree to Production Mode');
  console.log('=======================================\n');
  
  console.log('⚠️  IMPORTANT: This will use the PRODUCTION Cashfree environment');
  console.log('   Real money transactions will be processed!');
  console.log('   Make sure you want to go live.\n');
  
  // Production credentials (set via environment variables)
  const appId = process.env.CASHFREE_APP_ID || 'YOUR_CASHFREE_APP_ID';
  const secretKey = process.env.CASHFREE_SECRET_KEY || 'YOUR_CASHFREE_SECRET_KEY';
  const useTestMode = false; // PRODUCTION MODE
  
  console.log('📋 Configuration:');
  console.log(`   App ID: ${appId.substring(0, 8)}••••`);
  console.log(`   Secret Key: ••••••••••••••••••••••••••••••••••••••••••••••••`);
  console.log(`   Mode: ${useTestMode ? 'SANDBOX/TEST' : '🚀 PRODUCTION'}`);
  console.log(`   Base URL: ${useTestMode ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg'}`);
  
  // Database configuration
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
    dbConfig.password = String(process.env.DB_PASSWORD.trim());
  }

  const db = new Pool(dbConfig);
  
  try {
    // Test database connection
    const client = await db.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Database connection established');

    // Update Cashfree configuration for PRODUCTION
    const cashfreeConfig = {
      app_id: appId,
      secret_key: secretKey,
      is_test_mode: useTestMode
    };

    console.log('\n🔄 Updating to PRODUCTION mode...');
    
    const updateResult = await db.query(`
      UPDATE payment_configurations 
      SET configuration = $1, is_test_mode = $2, updated_at = NOW()
      WHERE provider_name = 'cashfree'
      RETURNING id, provider_name, is_active, is_test_mode
    `, [JSON.stringify(cashfreeConfig), useTestMode]);

    if (updateResult.rows.length > 0) {
      console.log('✅ Cashfree updated to PRODUCTION mode!');
      const config = updateResult.rows[0];
      console.log(`   Status: ${config.is_active ? '🟢 Active' : '🔴 Inactive'}`);
      console.log(`   Mode: ${config.is_test_mode ? '🧪 Test/Sandbox' : '🚀 PRODUCTION'}`);
      console.log(`   Config ID: ${config.id}`);
      
      console.log('\n🎉 PRODUCTION mode configured successfully!');
      console.log('\n🚨 CRITICAL: This is now LIVE - real payments will be processed!');
      console.log('\n📋 Next Steps:');
      console.log('1. ✅ Production credentials configured (DONE)');
      console.log('2. ✅ Gateway set to PRODUCTION mode (DONE)');
      console.log('3. 🔄 Test API connection (NEXT)');
      console.log('4. 🔄 Restart backend server');
      console.log('5. 🔄 Test with SMALL amount first (₹1)');
      
    } else {
      console.log('❌ Failed to update Cashfree configuration');
      process.exit(1);
    }

    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await db.end();
    process.exit(1);
  }
}

setCashfreeProductionMode();
