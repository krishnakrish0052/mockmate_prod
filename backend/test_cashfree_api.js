import { Pool } from 'pg';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database.js';
import { paymentService } from './services/PaymentService.js';
import { CashfreeService } from './services/CashfreeService.js';

// Load environment variables
dotenv.config();

async function testCashfreeAPI() {
  try {
    console.log('🔄 Testing Cashfree API integration...');
    
    // Initialize database
    await initializeDatabase();
    
    // Initialize payment service
    await paymentService.initializeProviders(true);
    const activeProviders = paymentService.getActiveProviders();
    
    console.log(`📊 Found ${activeProviders.length} active provider(s)`);
    
    if (activeProviders.length === 0) {
      console.log('❌ No active providers found');
      return;
    }
    
    const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
    if (!cashfreeProvider) {
      console.log('❌ Cashfree provider not found in active providers');
      return;
    }
    
    console.log('✅ Cashfree provider found:', {
      configId: cashfreeProvider.configId,
      testMode: cashfreeProvider.isTestMode,
      priority: cashfreeProvider.priority
    });
    
    // Try to create a test payment intent
    console.log('🔄 Testing payment intent creation...');
    
    const testMetadata = {
      userId: 'test-user-123',
      packageId: 'test-package',
      credits: '100',
      customerName: 'Test Customer',
      customerEmail: 'test@example.com',
      customerPhone: '9876543210',
      description: 'Test payment for 100 credits',
      returnUrl: 'https://mock-mate.com/payment/success',
      notifyUrl: 'https://api.mock-mate.com/api/payments/cashfree/webhook',
    };
    
    try {
      const paymentIntent = await paymentService.createPaymentIntent(
        100, // 100 INR
        'INR',
        testMetadata,
        'test-user-123',
        'IN'
      );
      
      console.log('✅ Payment intent created successfully!');
      console.log('📋 Payment Intent Details:', {
        orderId: paymentIntent.data.orderId,
        paymentLink: paymentIntent.data.paymentLink ? 'Present' : 'Not Present',
        orderToken: paymentIntent.data.orderToken ? 'Present' : 'Not Present',
        status: paymentIntent.data.orderStatus
      });
      
    } catch (error) {
      console.error('❌ Payment intent creation failed:', error.message);
      console.error('   Error details:', error.stack);
      
      // Check if it's a Cashfree API error
      if (error.message.includes('Cashfree')) {
        console.log('\n🔍 Analyzing Cashfree error...');
        
        // Test direct Cashfree service
        console.log('🔄 Testing direct Cashfree service...');
        const cashfreeService = new CashfreeService();
        
        // Get current configuration
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
        const configResult = await db.query(`
          SELECT configuration FROM payment_configurations 
          WHERE provider_name = 'cashfree' AND is_active = true
        `);
        
        if (configResult.rows.length > 0) {
          const config = JSON.parse(configResult.rows[0].configuration);
          console.log('📋 Current Cashfree config:', {
            app_id: config.app_id ? config.app_id.substring(0, 8) + '••••' : 'Missing',
            secret_key: config.secret_key ? '••••••••' : 'Missing',
            is_test_mode: config.is_test_mode
          });
          
          try {
            cashfreeService.initialize(config);
            const testResult = await cashfreeService.testConnection();
            
            if (testResult.success) {
              console.log('✅ Direct Cashfree connection test passed');
            } else {
              console.log('❌ Direct Cashfree connection test failed:', testResult.error);
            }
          } catch (directError) {
            console.log('❌ Direct Cashfree test error:', directError.message);
          }
        }
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  }
}

testCashfreeAPI();
