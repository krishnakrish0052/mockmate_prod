import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Direct migration to set up default payment gateway configurations
 * This adds Stripe and Cashfree payment configurations to the database
 */

async function setupPaymentGateways() {
  // Create database connection directly for migration
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  console.log('🔄 Connecting to database:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    hasPassword: !!dbConfig.password && dbConfig.password.length > 0
  });

  const db = new Pool(dbConfig);
  
  try {
    // Test the connection
    console.log('🔍 Testing database connection...');
    const client = await db.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as database_name');
    console.log('✅ Database connection established:', result.rows[0]);
    client.release();
    
    console.log('🔄 Setting up payment gateway configurations...');
    
    // Check if payment_configurations table exists, if not create it
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'payment_configurations'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('📋 Creating payment_configurations table...');
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

      // Create indexes
      await db.query(`
        CREATE INDEX idx_payment_configurations_active ON payment_configurations(is_active);
        CREATE INDEX idx_payment_configurations_priority ON payment_configurations(priority DESC);
        CREATE INDEX idx_payment_configurations_provider ON payment_configurations(provider_name);
      `);
      console.log('✅ payment_configurations table created');
    } else {
      console.log('📋 payment_configurations table already exists');
    }

    // Check if health checks table exists, if not create it
    const healthTableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'payment_provider_health_checks'
      );
    `);

    if (!healthTableExists.rows[0].exists) {
      console.log('📋 Creating payment_provider_health_checks table...');
      await db.query(`
        CREATE TABLE payment_provider_health_checks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          config_id UUID NOT NULL REFERENCES payment_configurations(id) ON DELETE CASCADE,
          check_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pass', 'fail', 'warn')),
          response_time_ms INTEGER,
          error_message TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE INDEX idx_health_checks_config ON payment_provider_health_checks(config_id);
        CREATE INDEX idx_health_checks_created_at ON payment_provider_health_checks(created_at DESC);
      `);
      console.log('✅ payment_provider_health_checks table created');
    } else {
      console.log('📋 payment_provider_health_checks table already exists');
    }

    // Check if audit log table exists, if not create it
    const auditTableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'payment_config_audit_logs'
      );
    `);

    if (!auditTableExists.rows[0].exists) {
      console.log('📋 Creating payment_config_audit_logs table...');
      await db.query(`
        CREATE TABLE payment_config_audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          config_id UUID REFERENCES payment_configurations(id) ON DELETE CASCADE,
          admin_id UUID NOT NULL,
          action VARCHAR(50) NOT NULL,
          old_values JSONB DEFAULT '{}',
          new_values JSONB DEFAULT '{}',
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await db.query(`
        CREATE INDEX idx_audit_logs_config ON payment_config_audit_logs(config_id);
        CREATE INDEX idx_audit_logs_created_at ON payment_config_audit_logs(created_at DESC);
      `);
      console.log('✅ payment_config_audit_logs table created');
    } else {
      console.log('📋 payment_config_audit_logs table already exists');
    }

    // Check if configurations already exist
    const existingConfigs = await db.query(`
      SELECT provider_name FROM payment_configurations 
      WHERE provider_name IN ('stripe', 'cashfree');
    `);
    
    const existingProviders = existingConfigs.rows.map(row => row.provider_name);

    // Insert Stripe configuration if it doesn't exist
    if (!existingProviders.includes('stripe')) {
      console.log('💳 Adding Stripe payment configuration...');
      const stripeId = uuidv4();
      await db.query(`
        INSERT INTO payment_configurations (
          id, provider_name, provider_type, display_name, is_active, is_test_mode,
          configuration, webhook_url, priority, supported_currencies, 
          supported_countries, features, limits, metadata
        ) VALUES (
          $1, 'stripe', 'card', 'Stripe', false, true,
          $2, $3, 100, $4, $5, $6, $7, $8
        );
      `, [
        stripeId,
        JSON.stringify({
          secret_key: 'sk_test_your_stripe_secret_key',
          publishable_key: 'pk_test_your_stripe_publishable_key',
          webhook_secret: 'whsec_your_webhook_secret'
        }),
        `${process.env.BACKEND_URL || process.env.BASE_URL || 'http://localhost:5000'}/api/payments/webhook`,
        JSON.stringify(['USD', 'EUR', 'GBP', 'CAD', 'AUD']),
        JSON.stringify(['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE']),
        JSON.stringify({
          supports_subscriptions: true,
          supports_refunds: true,
          supports_partial_refunds: true,
          supports_saved_cards: true,
          supports_3d_secure: true
        }),
        JSON.stringify({
          min_amount: 50, // $0.50 minimum
          max_amount: 99999900, // $999,999 maximum
          daily_limit: null,
          monthly_limit: null
        }),
        JSON.stringify({
          description: 'Primary credit card processor',
          documentation_url: 'https://stripe.com/docs',
          support_email: 'support@stripe.com'
        })
      ]);
      console.log('✅ Stripe configuration added');
    } else {
      console.log('💳 Stripe configuration already exists');
    }

    // Insert Cashfree configuration if it doesn't exist
    if (!existingProviders.includes('cashfree')) {
      console.log('🇮🇳 Adding Cashfree payment configuration...');
      const cashfreeId = uuidv4();
      await db.query(`
        INSERT INTO payment_configurations (
          id, provider_name, provider_type, display_name, is_active, is_test_mode,
          configuration, webhook_url, priority, supported_currencies, 
          supported_countries, features, limits, metadata
        ) VALUES (
          $1, 'cashfree', 'card', 'Cashfree', false, true,
          $2, $3, 90, $4, $5, $6, $7, $8
        );
      `, [
        cashfreeId,
        JSON.stringify({
          app_id: 'your_cashfree_app_id',
          secret_key: 'your_cashfree_secret_key',
          is_test_mode: true
        }),
        `${process.env.BACKEND_URL || process.env.BASE_URL || 'http://localhost:5000'}/api/payments/cashfree/webhook`,
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
      console.log('✅ Cashfree configuration added');
    } else {
      console.log('🇮🇳 Cashfree configuration already exists');
    }

    // Update timestamps
    await db.query(`
      UPDATE payment_configurations 
      SET updated_at = NOW() 
      WHERE provider_name IN ('stripe', 'cashfree');
    `);

    console.log('✅ Payment gateway configurations setup completed');
    
    // Display current status
    const allConfigs = await db.query(`
      SELECT provider_name, display_name, is_active, is_test_mode, priority
      FROM payment_configurations 
      ORDER BY priority DESC, provider_name;
    `);
    
    console.log('📊 Current payment configurations:');
    allConfigs.rows.forEach(config => {
      console.log(`  ${config.display_name}: ${config.is_active ? '🟢' : '🔴'} ${config.is_test_mode ? '(TEST)' : '(LIVE)'} - Priority: ${config.priority}`);
    });

  } catch (error) {
    console.error('❌ Error setting up payment gateways:', error);
    throw error;
  } finally {
    // Close database connection
    await db.end();
    console.log('🔌 Database connection closed');
  }
}

// Run if called directly
console.log('🚀 Starting migration script...');
console.log('Module URL:', import.meta.url);
console.log('Process argv[1]:', process.argv[1]);

// Always run the migration when this script is executed
setupPaymentGateways()
  .then(() => {
    console.log('🎉 Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Migration failed:', error.message);
    console.error('💡 Please check your database connection settings:');
    console.error('  - DB_HOST:', process.env.DB_HOST || 'localhost');
    console.error('  - DB_PORT:', process.env.DB_PORT || '5432');
    console.error('  - DB_NAME:', process.env.DB_NAME || 'mockmate_db');
    console.error('  - DB_USER:', process.env.DB_USER || 'mockmate_user');
    console.error('  - DB_PASSWORD:', process.env.DB_PASSWORD ? '[CONFIGURED]' : '[NOT SET]');
    process.exit(1);
  });

export { setupPaymentGateways };
