import { Pool } from 'pg';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function configureCashfreeProduction() {
  console.log('🔧 Cashfree Production Configuration Setup');
  console.log('==========================================\n');
  
  // Ask for credentials
  console.log('Please provide your Cashfree production credentials:');
  console.log('(These will be stored securely in the database)\n');
  
  const appId = await askQuestion('Enter your Cashfree App ID: ');
  const secretKey = await askQuestion('Enter your Cashfree Secret Key: ');
  const isTestMode = await askQuestion('Use test/sandbox mode? (y/N): ');
  
  rl.close();
  
  if (!appId || !secretKey) {
    console.log('❌ App ID and Secret Key are required');
    process.exit(1);
  }
  
  const useTestMode = isTestMode.toLowerCase() === 'y' || isTestMode.toLowerCase() === 'yes';
  
  console.log(`\n🔄 Configuring Cashfree...`);
  console.log(`   App ID: ${appId.substring(0, 8)}••••`);
  console.log(`   Secret Key: ••••••••`);
  console.log(`   Mode: ${useTestMode ? 'TEST/SANDBOX' : 'PRODUCTION'}`);
  
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
      console.log(`   Mode: ${config.is_test_mode ? '🧪 Test' : '🚀 Production'}`);
      
      if (!config.is_active) {
        console.log('\n⚠️  Gateway is currently INACTIVE');
        console.log('   Run: node activate_cashfree.js to activate it');
      }
      
      console.log('\n🎉 Configuration completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Restart your backend server');
      console.log('2. Test payment creation from frontend');
      console.log('3. Check logs for any API errors');
      
    } else {
      console.log('❌ Failed to update Cashfree configuration');
      console.log('   Make sure the payment gateway setup migration has been run');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

configureCashfreeProduction();
