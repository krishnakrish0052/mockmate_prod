import { Pool } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function fixProductionCashfree() {
  console.log('🔧 Fixing Production Cashfree Configuration');
  console.log('============================================\n');
  
  // Production credentials - set via environment variables
  const appId = process.env.CASHFREE_APP_ID || 'your_production_app_id';
  const secretKey = process.env.CASHFREE_SECRET_KEY || 'your_production_secret_key';
  const useTestMode = process.env.CASHFREE_TEST_MODE === 'true' || false; // PRODUCTION MODE by default
  
  console.log('📋 Configuration to apply:');
  console.log(`   App ID: ${appId.substring(0, 8)}••••`);
  console.log(`   Secret Key: ••••••••••••••••••••••••••••••••••••••••••••••••`);
  console.log(`   Mode: ${useTestMode ? '🧪 TEST' : '🚀 PRODUCTION'}`);
  console.log(`   Status: 🟢 ACTIVE`);
  
  // Database configuration - use production database
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

  console.log(`\n🔄 Connecting to production database at ${dbConfig.host}:${dbConfig.port}...`);
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
      console.log('❌ payment_configurations table missing - creating it...');
      
      // Run the setup migration
      console.log('🔄 Creating payment_configurations table...');
      await db.query(`
        CREATE TABLE payment_configurations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_name VARCHAR(100) NOT NULL,
          provider_type VARCHAR(50) NOT NULL CHECK (provider_type IN ('card', 'wallet', 'bank_transfer', 'crypto', 'buy_now_pay_later')),
          display_name VARCHAR(200),
          is_active BOOLEAN DEFAULT true,
          is_test_mode BOOLEAN DEFAULT true,
          configuration JSONB NOT NULL DEFAULT '{}',
          webhook_url TEXT,
          webhook_secret TEXT,
          priority INTEGER DEFAULT 0,
          supported_currencies JSONB DEFAULT '["USD"]',
          supported_countries JSONB DEFAULT '["US"]',
          features JSONB DEFAULT '{}',
          limits JSONB DEFAULT '{}',
          metadata JSONB DEFAULT '{}',
          health_status VARCHAR(20) DEFAULT 'unknown',
          last_health_check TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          created_by UUID,
          updated_by UUID,
          UNIQUE(provider_name)
        );
      `);
      console.log('✅ Table created');
    }

    // Check for existing Cashfree configuration
    const existingConfig = await db.query(`
      SELECT id, provider_name, is_active, is_test_mode
      FROM payment_configurations 
      WHERE provider_name = 'cashfree'
    `);
    
    const cashfreeConfig = {
      app_id: appId,
      secret_key: secretKey,
      is_test_mode: useTestMode
    };

    if (existingConfig.rows.length === 0) {
      console.log('🔄 Creating new Cashfree configuration...');
      
      // Insert new Cashfree configuration
      const insertResult = await db.query(`
        INSERT INTO payment_configurations (
          provider_name, provider_type, display_name, is_active, is_test_mode,
          configuration, webhook_url, priority, supported_currencies, 
          supported_countries, features, limits, metadata
        ) VALUES (
          'cashfree', 'card', 'Cashfree', true, $1,
          $2, $3, 90, $4, $5, $6, $7, $8
        ) RETURNING id, provider_name, is_active, is_test_mode
      `, [
        useTestMode,
        JSON.stringify(cashfreeConfig),
        `${process.env.BACKEND_URL || 'https://api.mock-mate.com'}/api/payments/cashfree/webhook`,
        JSON.stringify(['INR', 'USD']),
        JSON.stringify(['IN']),
        JSON.stringify({
          supports_subscriptions: false,
          supports_refunds: true,
          supports_partial_refunds: true,
          supports_saved_cards: false,
          supports_upi: true,
          supports_netbanking: true,
          supports_wallets: true
        }),
        JSON.stringify({
          min_amount: 100, // ₹1 minimum (in paisa)
          max_amount: 10000000, // ₹100,000 maximum (in paisa)
          daily_limit: null,
          monthly_limit: null
        }),
        JSON.stringify({
          description: 'Indian payment processor supporting UPI, Net Banking, Cards, and Wallets',
          documentation_url: 'https://docs.cashfree.com/docs',
          support_email: 'support@cashfree.com'
        })
      ]);
      
      console.log('✅ Cashfree configuration created successfully!');
      console.log(`   Config ID: ${insertResult.rows[0].id}`);
      
    } else {
      console.log('🔄 Updating existing Cashfree configuration...');
      
      // Update existing configuration
      const updateResult = await db.query(`
        UPDATE payment_configurations 
        SET configuration = $1, is_test_mode = $2, is_active = true, updated_at = NOW()
        WHERE provider_name = 'cashfree'
        RETURNING id, provider_name, is_active, is_test_mode
      `, [JSON.stringify(cashfreeConfig), useTestMode]);
      
      console.log('✅ Cashfree configuration updated successfully!');
      console.log(`   Config ID: ${updateResult.rows[0].id}`);
    }
    
    // Final verification
    const finalCheck = await db.query(`
      SELECT id, provider_name, display_name, is_active, is_test_mode, configuration
      FROM payment_configurations 
      WHERE provider_name = 'cashfree'
    `);
    
    const config = finalCheck.rows[0];
    const conf = JSON.parse(config.configuration);
    
    console.log('\n🎉 CONFIGURATION COMPLETE!');
    console.log('============================');
    console.log(`✅ Provider: ${config.display_name}`);
    console.log(`✅ Status: ${config.is_active ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`✅ Mode: ${config.is_test_mode ? 'TEST' : 'PRODUCTION'}`);
    console.log(`✅ App ID: ${conf.app_id.substring(0, 8)}••••`);
    console.log(`✅ Secret Key: Configured`);
    
    console.log('\n🚀 Next Steps:');
    console.log('1. ✅ Database configured (DONE)');
    console.log('2. 🔄 Restart production backend server');
    console.log('3. 🔄 Test payment from frontend');
    
    console.log('\n⚠️  IMPORTANT: This is PRODUCTION mode - real payments will be processed!');

    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    await db.end();
    process.exit(1);
  }
}

fixProductionCashfree();
