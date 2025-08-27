import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setCashfreeCredentials() {
  console.log('🔧 Setting Cashfree Production Credentials');
  console.log('=========================================\n');
  
  // Production credentials (configured in database already)
  const appId = process.env.CASHFREE_APP_ID || 'YOUR_CASHFREE_APP_ID';
  const secretKey = process.env.CASHFREE_SECRET_KEY || 'YOUR_CASHFREE_SECRET_KEY';
  const useTestMode = true; // Start with sandbox mode for testing
  
  console.log('📋 Configuring with:');
  console.log(`   App ID: ${appId.substring(0, 8)}••••`);
  console.log(`   Secret Key: ••••••••••••••••••••••••••••••••••••••••••••••••`);
  console.log(`   Mode: ${useTestMode ? 'SANDBOX/TEST' : 'PRODUCTION'}`);
  
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

    // Update Cashfree configuration
    const cashfreeConfig = {
      app_id: appId,
      secret_key: secretKey,
      is_test_mode: useTestMode
    };

    console.log('\n🔄 Updating database configuration...');
    
    const updateResult = await db.query(`
      UPDATE payment_configurations 
      SET configuration = $1, is_test_mode = $2, updated_at = NOW()
      WHERE provider_name = 'cashfree'
      RETURNING id, provider_name, is_active, is_test_mode
    `, [JSON.stringify(cashfreeConfig), useTestMode]);

    if (updateResult.rows.length > 0) {
      console.log('✅ Cashfree configuration updated successfully!');
      const config = updateResult.rows[0];
      console.log(`   Status: ${config.is_active ? '🟢 Active' : '🔴 Inactive'}`);
      console.log(`   Mode: ${config.is_test_mode ? '🧪 Test/Sandbox' : '🚀 Production'}`);
      console.log(`   Config ID: ${config.id}`);
      
      if (!config.is_active) {
        console.log('\n⚠️  Gateway is currently INACTIVE - activating now...');
        
        await db.query(`
          UPDATE payment_configurations 
          SET is_active = true, updated_at = NOW()
          WHERE provider_name = 'cashfree'
        `);
        
        console.log('✅ Gateway activated successfully!');
      }
      
      console.log('\n🎉 Configuration completed successfully!');
      console.log('\n📋 Next Steps:');
      console.log('1. ✅ Credentials configured (DONE)');
      console.log('2. ✅ Gateway activated (DONE)');
      console.log('3. 🔄 Test API connection (NEXT)');
      console.log('4. 🔄 Restart backend server');
      console.log('5. 🔄 Test payment from frontend');
      
    } else {
      console.log('❌ Failed to update Cashfree configuration');
      console.log('   Make sure the payment gateway setup migration has been run');
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

setCashfreeCredentials();
