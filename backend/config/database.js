import { Pool } from 'pg';
import { logger } from './logger.js';
import bcrypt from 'bcryptjs';

let pool;

const initializeDatabase = async () => {
  try {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'mockmate_db',
      user: process.env.DB_USER || 'mockmate_user',
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 300000, // 5 minutes - keep connections alive longer
      connectionTimeoutMillis: 10000, // 10 seconds - more time to establish connection
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000, // Enable TCP keep-alive
      query_timeout: 30000, // 30 seconds query timeout
      statement_timeout: 30000, // 30 seconds statement timeout
      allowExitOnIdle: false, // Don't exit on idle connections
    };

    // Only add password if it exists and is not empty
    if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
      dbConfig.password = String(process.env.DB_PASSWORD.trim());
    }

    pool = new Pool(dbConfig);

    // Add error handling for the pool
    pool.on('error', (err, client) => {
      logger.error('Database pool error:', {
        error: err.message,
        stack: err.stack,
        clientProcessId: client?.processID || 'unknown'
      });
    });

    pool.on('connect', (client) => {
      logger.debug('Database client connected:', { processId: client.processID });
    });

    pool.on('remove', (client) => {
      logger.debug('Database client removed:', { processId: client.processID });
    });

    // Test the connection with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const client = await pool.connect();
        await client.query('SELECT NOW() as current_time');
        client.release();
        logger.info('Database connection pool initialized successfully');
        break;
      } catch (error) {
        retryCount++;
        logger.warn(`Database connection attempt ${retryCount} failed:`, {
          error: error.message,
          retryCount,
          maxRetries
        });
        
        if (retryCount === maxRetries) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    // Extend database with helper methods
    extendDatabase();

    // Run migrations if in development
    if (process.env.NODE_ENV === 'development') {
      await runMigrations();
    }
  } catch (error) {
    logger.error('Error initializing database:', error);
    throw error;
  }
};

const runMigrations = async () => {
  try {
    logger.info('Running database migrations...');

    // Create tables if they don't exist
    await createTables();

    // Create default super admin user if not exists
    await createDefaultSuperAdmin();

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  }
};

const createTables = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        google_id VARCHAR(255) UNIQUE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        avatar_url VARCHAR(500),
        credits INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        is_verified BOOLEAN DEFAULT FALSE,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        last_login TIMESTAMP,
        last_activity TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // User Sessions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        job_title VARCHAR(255),
        job_description TEXT,
        status VARCHAR(50) DEFAULT 'created',
        desktop_connected BOOLEAN DEFAULT FALSE,
        websocket_connection_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        total_duration_minutes INTEGER DEFAULT 0
      )
    `);

    // Interview Messages Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS interview_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
        message_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        metadata JSONB
      )
    `);

    // User Resume Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_resumes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        content TEXT,
        file_size INTEGER DEFAULT 0,
        analysis JSONB DEFAULT '{}'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Credit Transactions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        session_id UUID REFERENCES sessions(id),
        transaction_type VARCHAR(50) NOT NULL,
        credits_amount INTEGER NOT NULL,
        cost_usd DECIMAL(10,2),
        payment_method VARCHAR(100),
        payment_reference VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Payment History Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        amount_usd DECIMAL(10,2) NOT NULL,
        credits_purchased INTEGER NOT NULL,
        payment_provider VARCHAR(100) NOT NULL,
        payment_reference VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);

    // Refresh Tokens Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Password Reset Tokens Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_user_reset UNIQUE(user_id)
      )
    `);

    // Admin Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
        permissions JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        created_by UUID REFERENCES admin_users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP,
        last_active TIMESTAMP DEFAULT NOW(),
        password_changed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Admin Activity Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        ip_address INET,
        user_agent TEXT,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Credit Packages Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_packages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        package_id VARCHAR(100) UNIQUE NOT NULL,
        package_name VARCHAR(255) NOT NULL,
        description TEXT,
        credits_amount INTEGER NOT NULL,
        price_usd DECIMAL(10,2) NOT NULL,
        discount_percentage DECIMAL(5,2) DEFAULT 0,
        bonus_credits INTEGER DEFAULT 0,
        validity_days INTEGER,
        is_popular BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        min_user_tier VARCHAR(50) DEFAULT 'free' CHECK (min_user_tier IN ('free', 'pro', 'enterprise')),
        max_purchases_per_user INTEGER,
        package_type VARCHAR(50) DEFAULT 'one_time' CHECK (package_type IN ('one_time', 'subscription', 'bundle')),
        features JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by UUID REFERENCES admin_users(id),
        updated_by UUID REFERENCES admin_users(id)
      )
    `);

    // Subscription Plans Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_id VARCHAR(100) UNIQUE NOT NULL,
        plan_name VARCHAR(255) NOT NULL,
        description TEXT,
        monthly_price_usd DECIMAL(10,2) NOT NULL,
        yearly_price_usd DECIMAL(10,2),
        monthly_credits INTEGER NOT NULL,
        features JSONB DEFAULT '[]'::jsonb,
        limits JSONB DEFAULT '{}'::jsonb,
        trial_days INTEGER DEFAULT 0,
        setup_fee_usd DECIMAL(10,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        is_featured BOOLEAN DEFAULT FALSE,
        display_order INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by UUID REFERENCES admin_users(id),
        updated_by UUID REFERENCES admin_users(id)
      )
    `);

    // User Subscriptions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        plan_id VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')),
        started_at TIMESTAMP DEFAULT NOW(),
        ends_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        payment_provider VARCHAR(100),
        external_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Payment Configurations Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_name VARCHAR(100) NOT NULL,
        provider_type VARCHAR(50) DEFAULT 'gateway' CHECK (provider_type IN ('gateway', 'wallet', 'bank_transfer', 'cryptocurrency')),
        is_active BOOLEAN DEFAULT TRUE,
        is_test_mode BOOLEAN DEFAULT TRUE,
        configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
        webhook_url VARCHAR(500),
        webhook_secret VARCHAR(255),
        priority INTEGER DEFAULT 0,
        supported_currencies JSONB DEFAULT '["USD"]'::jsonb,
        supported_countries JSONB DEFAULT '["US"]'::jsonb,
        features JSONB DEFAULT '{}'::jsonb,
        limits JSONB DEFAULT '{}'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by UUID REFERENCES admin_users(id),
        updated_by UUID REFERENCES admin_users(id)
      )
    `);

    // Payment Configuration Audit Logs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_config_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_id UUID REFERENCES payment_configurations(id) ON DELETE CASCADE,
        admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        old_values JSONB DEFAULT '{}'::jsonb,
        new_values JSONB DEFAULT '{}'::jsonb,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Payment Provider Status Table (for monitoring)
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_provider_status (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        config_id UUID REFERENCES payment_configurations(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'error', 'disabled')),
        last_check_at TIMESTAMP DEFAULT NOW(),
        last_success_at TIMESTAMP,
        last_error_at TIMESTAMP,
        error_message TEXT,
        success_rate DECIMAL(5,2) DEFAULT 100.00,
        response_time_ms INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_interview_messages_session_id ON interview_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
      CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
      CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
      CREATE INDEX IF NOT EXISTS idx_admin_activity_admin_id ON admin_activity_logs(admin_id);
      CREATE INDEX IF NOT EXISTS idx_admin_activity_created_at ON admin_activity_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_credit_packages_package_id ON credit_packages(package_id);
      CREATE INDEX IF NOT EXISTS idx_credit_packages_is_active ON credit_packages(is_active);
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_id ON subscription_plans(plan_id);
      CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON user_subscriptions(plan_id);
      CREATE INDEX IF NOT EXISTS idx_payment_configurations_provider_name ON payment_configurations(provider_name);
      CREATE INDEX IF NOT EXISTS idx_payment_configurations_is_active ON payment_configurations(is_active);
      CREATE INDEX IF NOT EXISTS idx_payment_configurations_is_test_mode ON payment_configurations(is_test_mode);
      CREATE INDEX IF NOT EXISTS idx_payment_configurations_priority ON payment_configurations(priority);
      CREATE INDEX IF NOT EXISTS idx_payment_config_audit_logs_config_id ON payment_config_audit_logs(config_id);
      CREATE INDEX IF NOT EXISTS idx_payment_config_audit_logs_admin_id ON payment_config_audit_logs(admin_id);
      CREATE INDEX IF NOT EXISTS idx_payment_provider_status_config_id ON payment_provider_status(config_id);
      CREATE INDEX IF NOT EXISTS idx_payment_provider_status_status ON payment_provider_status(status);
    `);

    await client.query('COMMIT');
    logger.info('All database tables created successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const createDefaultSuperAdmin = async () => {
  const client = await pool.connect();

  try {
    // Check if any admin users exist
    const existingAdmins = await client.query('SELECT COUNT(*) FROM admin_users');

    if (parseInt(existingAdmins.rows[0].count) === 0) {
      // Create default super admin user
      const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
      const defaultEmail = process.env.ADMIN_EMAIL || 'admin@mockmate.com';
      const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';

      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

      await client.query(
        `
        INSERT INTO admin_users (username, email, password_hash, role, permissions, is_active)
        VALUES ($1, $2, $3, 'super_admin', $4, true)
      `,
        [
          defaultUsername,
          defaultEmail,
          passwordHash,
          JSON.stringify([
            'user_management',
            'admin_management',
            'system_settings',
            'analytics',
            'content_management',
            'payment_management',
            'pricing.read',
            'pricing.write',
            'pricing.create',
            'pricing.delete',
          ]),
        ]
      );

      logger.info(`Default super admin created with username: ${defaultUsername}`);
      if (process.env.NODE_ENV === 'development') {
        logger.info(`Default admin password: ${defaultPassword} (Change this in production!)`);
      }
    } else {
      logger.info('Admin users already exist, skipping default admin creation');
    }
  } catch (error) {
    logger.error('Error creating default super admin:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getDatabase = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
};

const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    logger.info('Database connection pool closed');
  }
};

// Helper methods for admin operations
const getAdminByUsername = async username => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM admin_users WHERE username = $1 AND is_active = true',
      [username]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

const getAdminByEmail = async email => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM admin_users WHERE email = $1 AND is_active = true',
      [email]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

const getAdminById = async id => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM admin_users WHERE id = $1 AND is_active = true',
      [id]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
};

const updateAdminLastLogin = async (adminId, _ipAddress, _userAgent) => {
  const client = await pool.connect();
  try {
    await client.query(
      'UPDATE admin_users SET last_login = NOW(), last_active = NOW() WHERE id = $1',
      [adminId]
    );
  } finally {
    client.release();
  }
};

const logAdminActivity = async ({ adminId, action, ipAddress, userAgent, details }) => {
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO admin_activity_logs (admin_id, action, ip_address, user_agent, details) VALUES ($1, $2, $3, $4, $5)',
      [adminId, action, ipAddress, userAgent, JSON.stringify(details || {})]
    );
  } catch (error) {
    logger.error('Error logging admin activity:', error);
    // Don't throw error to avoid breaking the main flow
  } finally {
    client.release();
  }
};

// Extend database pool with helper methods
const extendDatabase = () => {
  if (pool) {
    pool.getAdminByUsername = getAdminByUsername;
    pool.getAdminByEmail = getAdminByEmail;
    pool.getAdminById = getAdminById;
    pool.updateAdminLastLogin = updateAdminLastLogin;
    pool.logAdminActivity = logAdminActivity;
  }
};

export {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  runMigrations,
  getAdminByUsername,
  getAdminByEmail,
  getAdminById,
  updateAdminLastLogin,
  logAdminActivity,
};
