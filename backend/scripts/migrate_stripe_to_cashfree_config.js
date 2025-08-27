import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function migrateStripeToCashfreeConfig() {
  // Try different database configuration approaches
  let poolConfig;
  
  if (process.env.DATABASE_URL) {
    // If DATABASE_URL is provided, use it (common in production)
    poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  } else {
    // Use individual environment variables
    poolConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'mockmate_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || undefined, // Use undefined instead of empty string
    };
    
    // Remove undefined password to allow passwordless connections
    if (!process.env.DB_PASSWORD) {
      delete poolConfig.password;
    }
  }
  
  console.log('🔗 Connecting to database with config:', {
    host: poolConfig.host || 'via DATABASE_URL',
    port: poolConfig.port || 'via DATABASE_URL',
    database: poolConfig.database || 'via DATABASE_URL',
    user: poolConfig.user || 'via DATABASE_URL',
    hasPassword: !!poolConfig.password || !!poolConfig.connectionString
  });
  
  const pool = new Pool(poolConfig);

  try {
    console.log('🔄 Migrating Stripe configurations to Cashfree in system_config...\n');

    await pool.query('BEGIN');

    // First, let's check what Stripe configs exist
    const existingStripeConfigs = await pool.query(
      "SELECT config_key, config_value FROM system_config WHERE config_key LIKE '%stripe%'"
    );

    console.log('📋 Found Stripe configurations:');
    existingStripeConfigs.rows.forEach(row => {
      console.log(`   - ${row.config_key}: ${row.config_key.includes('secret') ? '[HIDDEN]' : row.config_value}`);
    });

    // Remove old Stripe configurations
    console.log('\n🗑️  Removing Stripe configurations...');
    const stripeKeys = ['stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret'];
    
    for (const key of stripeKeys) {
      const result = await pool.query(
        'DELETE FROM system_config WHERE config_key = $1',
        [key]
      );
      if (result.rowCount > 0) {
        console.log(`   ✅ Removed: ${key}`);
      } else {
        console.log(`   ⏩ Not found: ${key}`);
      }
    }

    // Add Cashfree configurations
    console.log('\n💰 Adding Cashfree configurations...');
    
    const cashfreeConfigs = [
      {
        key: 'cashfree_app_id',
        value: process.env.CASHFREE_APP_ID || 'your_cashfree_app_id',
        type: 'string',
        category: 'payment',
        description: 'Cashfree Application ID',
        sensitive: false,
        public: true,
      },
      {
        key: 'cashfree_secret_key',
        value: process.env.CASHFREE_SECRET_KEY || 'your_cashfree_secret_key',
        type: 'string',
        category: 'payment',
        description: 'Cashfree Secret Key',
        sensitive: true,
        public: false,
      },
      {
        key: 'cashfree_client_id',
        value: process.env.CASHFREE_CLIENT_ID || 'your_cashfree_client_id',
        type: 'string',
        category: 'payment',
        description: 'Cashfree Client ID',
        sensitive: false,
        public: true,
      },
      {
        key: 'cashfree_client_secret',
        value: process.env.CASHFREE_CLIENT_SECRET || 'your_cashfree_client_secret',
        type: 'string',
        category: 'payment',
        description: 'Cashfree Client Secret',
        sensitive: true,
        public: false,
      },
      {
        key: 'cashfree_environment',
        value: process.env.CASHFREE_ENVIRONMENT || 'sandbox',
        type: 'string',
        category: 'payment',
        description: 'Cashfree Environment (sandbox/production)',
        sensitive: false,
        public: false,
      },
    ];

    for (const config of cashfreeConfigs) {
      // Check if configuration already exists
      const existing = await pool.query(
        'SELECT id FROM system_config WHERE config_key = $1',
        [config.key]
      );

      if (existing.rows.length === 0) {
        // Insert new configuration
        const jsonValue = config.type === 'number' 
          ? Number(config.value) 
          : config.type === 'boolean' 
            ? config.value === 'true' || config.value === true
            : config.value;

        await pool.query(
          `
          INSERT INTO system_config (config_key, config_value, config_type, description, category, is_sensitive, is_public, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `,
          [
            config.key,
            JSON.stringify(jsonValue),
            config.type,
            config.description,
            config.category,
            config.sensitive,
            config.public,
          ]
        );

        console.log(`   ✅ Added: ${config.key} = ${config.sensitive ? '[HIDDEN]' : config.value}`);
      } else {
        console.log(`   ⏩ Already exists: ${config.key}`);
      }
    }

    await pool.query('COMMIT');

    console.log('\n📊 Migration Summary:');
    console.log(`   🗑️  Stripe configurations removed: ${stripeKeys.length}`);
    console.log(`   ✅ Cashfree configurations added: ${cashfreeConfigs.length}`);

    // Show current payment configurations
    console.log('\n💳 Current Payment Configurations:');
    const paymentConfigs = await pool.query(
      "SELECT config_key, config_value, is_sensitive FROM system_config WHERE category = 'payment' ORDER BY config_key"
    );

    paymentConfigs.rows.forEach(row => {
      let value;
      if (row.is_sensitive) {
        value = '[REDACTED]';
      } else {
        try {
          value = JSON.parse(row.config_value);
        } catch (e) {
          value = row.config_value; // fallback to raw value if JSON parsing fails
        }
      }
      console.log(`   - ${row.config_key}: ${value}`);
    });

    console.log('\n🎉 Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Update your Cashfree credentials in the dynamic config system');
    console.log('2. Verify payment configurations in admin panel');
    console.log('3. Test payment flow with Cashfree sandbox');
    console.log('4. Update production environment variables');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the migration
migrateStripeToCashfreeConfig().catch(error => {
  console.error('❌ Migration error:', error);
  process.exit(1);
});
