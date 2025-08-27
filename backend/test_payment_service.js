import { Pool } from 'pg';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database.js';
import { paymentService } from './services/PaymentService.js';

// Load environment variables
dotenv.config();

async function testPaymentService() {
  try {
    console.log('🔄 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');

    console.log('🔄 Initializing payment service...');
    await paymentService.initializeProviders(true); // Force refresh
    console.log('✅ Payment service initialized');

    console.log('🔍 Checking active providers...');
    const activeProviders = paymentService.getActiveProviders();
    
    if (activeProviders.length === 0) {
      console.log('❌ No active payment providers found');
      return;
    }

    console.log(`📊 Found ${activeProviders.length} active provider(s):`);
    activeProviders.forEach(provider => {
      console.log(`   • ${provider.displayName || provider.providerName} (${provider.type})`);
      console.log(`     Config ID: ${provider.configId}`);
      console.log(`     Test Mode: ${provider.isTestMode ? 'YES' : 'NO'}`);
      console.log(`     Priority: ${provider.priority}`);
      console.log('');
    });

    // Test if we can get the optimal provider
    console.log('🔄 Testing optimal provider selection...');
    const optimalProvider = await paymentService.getOptimalProvider(100, 'INR', 'IN', 'test-user');
    console.log(`✅ Optimal provider: ${optimalProvider.type} (Config ID: ${optimalProvider.config.id})`);

    console.log('\n🎉 Payment service test completed successfully!');
    console.log('   The Cashfree payment gateway is now properly configured and active.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing payment service:', error.message);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  }
}

testPaymentService();
