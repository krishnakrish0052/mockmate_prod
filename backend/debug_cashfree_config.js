import { Pool } from 'pg';
import dotenv from 'dotenv';
import { CashfreeService } from './services/CashfreeService.js';

// Load environment variables
dotenv.config();

async function debugCashfreeConfig() {
  console.log('🔍 Debugging Cashfree Configuration');
  console.log('===================================\n');
  
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
    // Get current configuration
    const configResult = await db.query(`
      SELECT id, provider_name, display_name, is_active, is_test_mode, 
             configuration, created_at, updated_at
      FROM payment_configurations 
      WHERE provider_name = 'cashfree'
    `);
    
    if (configResult.rows.length === 0) {
      console.log('❌ No Cashfree configuration found in database');
      console.log('   Run: node migrations/setup_payment_gateways.js first');
      process.exit(1);
    }
    
    const config = configResult.rows[0];
    console.log('📋 Current Cashfree Configuration:');
    console.log(`   ID: ${config.id}`);
    console.log(`   Provider: ${config.display_name} (${config.provider_name})`);
    console.log(`   Status: ${config.is_active ? '🟢 Active' : '🔴 Inactive'}`);
    console.log(`   Mode: ${config.is_test_mode ? '🧪 Test' : '🚀 Production'}`);
    console.log(`   Created: ${config.created_at}`);
    console.log(`   Updated: ${config.updated_at}`);
    
    // Parse and show configuration safely
    let parsedConfig;
    try {
      parsedConfig = typeof config.configuration === 'string' 
        ? JSON.parse(config.configuration) 
        : config.configuration;
        
      console.log('\n🔐 Configuration Details:');
      console.log(`   App ID: ${parsedConfig.app_id ? parsedConfig.app_id.substring(0, 8) + '••••' : 'Missing'}`);
      console.log(`   Secret Key: ${parsedConfig.secret_key ? '••••••••' : 'Missing'}`);
      console.log(`   Test Mode: ${parsedConfig.is_test_mode}`);
      
      // Check if credentials look like real ones
      const hasRealCredentials = parsedConfig.app_id && 
                                 parsedConfig.secret_key && 
                                 parsedConfig.app_id !== 'TEST_APP_ID_12345' &&
                                 parsedConfig.secret_key !== 'TEST_SECRET_KEY_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
      
      if (!hasRealCredentials) {
        console.log('\n⚠️  Using dummy/test credentials - API calls will fail');
        console.log('   Configure real credentials using:');
        console.log('   node configure_cashfree_production.js');
        console.log('\n💡 Or update manually in database:');
        console.log(`   UPDATE payment_configurations SET configuration = '{"app_id":"YOUR_APP_ID","secret_key":"YOUR_SECRET_KEY","is_test_mode":true}' WHERE provider_name='cashfree';`);
      } else {
        console.log('\n✅ Real credentials detected - testing API connection...');
        
        // Test API connection with real credentials
        const cashfreeService = new CashfreeService();
        cashfreeService.initialize(parsedConfig);
        
        console.log('🔄 Testing Cashfree API connection...');
        console.log(`   Base URL: ${cashfreeService.baseURL}`);
        console.log(`   Environment: ${parsedConfig.is_test_mode ? 'Sandbox' : 'Production'}`);
        
        // Test minimal order creation
        try {
          const testOrder = {
            orderId: `test_debug_${Date.now()}`,
            orderAmount: 1,
            orderCurrency: 'INR',
            customerDetails: {
              customerId: 'debug_customer',
              customerName: 'Debug Customer',
              customerEmail: 'debug@mockmate.com',
              customerPhone: '9999999999'
            },
            returnUrl: 'https://mock-mate.com/payment/success',
            notifyUrl: 'https://api.mock-mate.com/api/payments/cashfree/webhook',
            orderNote: 'Debug test order'
          };
          
          const result = await cashfreeService.createOrder(testOrder);
          
          if (result.success) {
            console.log('✅ Cashfree API connection successful!');
            console.log(`   Order ID: ${result.data.orderId}`);
            console.log(`   Payment Link: ${result.data.paymentLink ? 'Generated' : 'Not available'}`);
            console.log(`   Status: ${result.data.orderStatus}`);
          } else {
            console.log('❌ API call succeeded but order creation failed');
          }
        } catch (apiError) {
          console.log('❌ API connection test failed:', apiError.message);
          
          // Try to parse error details
          if (apiError.message.includes('authentication Failed')) {
            console.log('   → Authentication issue - check App ID and Secret Key');
          } else if (apiError.message.includes('version')) {
            console.log('   → API version issue - check headers');
          } else {
            console.log('   → Unknown API error');
          }
        }
      }
      
    } catch (parseError) {
      console.log('❌ Failed to parse configuration JSON:', parseError.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugCashfreeConfig();
