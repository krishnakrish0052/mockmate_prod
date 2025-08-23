import { Pool } from 'pg';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'database-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

export class DatabaseService {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const config = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'mockmate',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: parseInt(process.env.DB_POOL_MAX || '20'),
        idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      };

      this.pool = new Pool(config);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      logger.info('Database connection established successfully');

      // Initialize admin tables if they don't exist
      await this.initializeAdminTables();
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async initializeAdminTables() {
    try {
      // Create admin users table
      await this.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
          permissions JSONB DEFAULT '[]',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          last_login TIMESTAMP,
          last_active TIMESTAMP,
          password_changed_at TIMESTAMP DEFAULT NOW(),
          created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
        );
      `);

      // Create admin activity logs table
      await this.query(`
        CREATE TABLE IF NOT EXISTS admin_activity_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
          action VARCHAR(100) NOT NULL,
          ip_address INET,
          user_agent TEXT,
          details JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Create indexes for performance
      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
        CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
        CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active);
        CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON admin_activity_logs(admin_id);
        CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);
        CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action ON admin_activity_logs(action);
      `);

      // Create system configuration table
      await this.query(`
        CREATE TABLE IF NOT EXISTS system_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          key VARCHAR(100) UNIQUE NOT NULL,
          value JSONB NOT NULL,
          description TEXT,
          category VARCHAR(50) DEFAULT 'general',
          is_sensitive BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
        );
      `);

      // Create system notifications table
      await this.query(`
        CREATE TABLE IF NOT EXISTS system_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'warning', 'error', 'success')),
          priority INTEGER DEFAULT 1,
          is_read BOOLEAN DEFAULT false,
          admin_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP
        );
      `);

      logger.info('Admin tables initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize admin tables:', error);
      throw error;
    }
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn('Slow query detected', {
          duration: `${duration}ms`,
          query: text.substring(0, 100),
        });
      }

      return result;
    } catch (error) {
      logger.error('Database query error:', {
        error: error.message,
        query: text.substring(0, 100),
        params: params.length,
      });
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Admin user management methods
  async getAdminById(adminId) {
    const result = await this.query('SELECT * FROM admin_users WHERE id = $1', [adminId]);
    return result.rows[0];
  }

  async getAdminByUsername(username) {
    const result = await this.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    return result.rows[0];
  }

  async getAdminByEmail(email) {
    const result = await this.query('SELECT * FROM admin_users WHERE email = $1', [email]);
    return result.rows[0];
  }

  async createAdmin(adminData) {
    const {
      username,
      email,
      passwordHash,
      role = 'admin',
      permissions = [],
      isActive = true,
      createdBy = null,
      firstName = null,
      lastName = null,
      name = null,
    } = adminData;

    // Generate name from firstName and lastName if not provided
    const fullName =
      name ||
      (firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || username || 'Admin User');

    const result = await this.query(
      `
      INSERT INTO admin_users (
        username, email, password_hash, role, permissions, is_active, created_by, name, first_name, last_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `,
      [
        username,
        email,
        passwordHash,
        role,
        JSON.stringify(permissions),
        isActive,
        createdBy,
        fullName,
        firstName,
        lastName,
      ]
    );

    return result.rows[0];
  }

  async updateAdminActivity(adminId) {
    await this.query('UPDATE admin_users SET last_active = NOW() WHERE id = $1', [adminId]);
  }

  async updateAdminLastLogin(adminId, ipAddress, userAgent) {
    await this.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [adminId]);

    // Log login activity
    await this.logAdminActivity({
      adminId,
      action: 'LOGIN',
      ipAddress,
      userAgent,
      details: { timestamp: new Date().toISOString() },
    });
  }

  async logAdminActivity({ adminId, action, ipAddress, userAgent, details = {} }) {
    await this.query(
      `
      INSERT INTO admin_activity_logs (admin_id, action, ip_address, user_agent, details)
      VALUES ($1, $2, $3, $4, $5)
    `,
      [adminId, action, ipAddress, userAgent, JSON.stringify(details)]
    );
  }

  // System configuration methods
  async getSystemConfig(key = null) {
    if (key) {
      const result = await this.query('SELECT * FROM system_config WHERE key = $1', [key]);
      return result.rows[0];
    }

    const result = await this.query('SELECT * FROM system_config ORDER BY category, key');
    return result.rows;
  }

  async setSystemConfig(
    key,
    value,
    description = null,
    category = 'general',
    isSensitive = false,
    updatedBy = null
  ) {
    const result = await this.query(
      `
      INSERT INTO system_config (key, value, description, category, is_sensitive, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        description = COALESCE(EXCLUDED.description, system_config.description),
        category = EXCLUDED.category,
        is_sensitive = EXCLUDED.is_sensitive,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      RETURNING *
    `,
      [key, JSON.stringify(value), description, category, isSensitive, updatedBy]
    );

    return result.rows[0];
  }

  async deleteSystemConfig(key) {
    await this.query('DELETE FROM system_config WHERE key = $1', [key]);
  }

  // System notifications methods
  async createSystemNotification({
    title,
    message,
    type = 'info',
    priority = 1,
    adminId = null,
    expiresAt = null,
  }) {
    const result = await this.query(
      `
      INSERT INTO system_notifications (title, message, type, priority, admin_id, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [title, message, type, priority, adminId, expiresAt]
    );

    return result.rows[0];
  }

  async getSystemNotifications(adminId = null, unreadOnly = false) {
    let query = `
      SELECT * FROM system_notifications
      WHERE (expires_at IS NULL OR expires_at > NOW())
    `;
    const params = [];

    if (adminId) {
      query += ' AND (admin_id IS NULL OR admin_id = $1)';
      params.push(adminId);
    }

    if (unreadOnly) {
      query += ' AND is_read = false';
    }

    query += ' ORDER BY priority DESC, created_at DESC';

    const result = await this.query(query, params);
    return result.rows;
  }

  async markNotificationAsRead(notificationId) {
    await this.query('UPDATE system_notifications SET is_read = true WHERE id = $1', [
      notificationId,
    ]);
  }

  // Analytics and reporting methods
  async getAnalyticsData(query, params = []) {
    try {
      const result = await this.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Analytics query failed:', { error: error.message, query });
      throw error;
    }
  }

  // System health and performance methods
  async getConnectionCount() {
    const result = await this.query(`
      SELECT COUNT(*) as total_connections,
             COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections,
             COUNT(CASE WHEN state = 'idle' THEN 1 END) as idle_connections
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
    `);
    return result.rows[0];
  }

  async getTableStats() {
    const result = await this.query(`
      SELECT 
        schemaname, tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        last_vacuum, last_autovacuum,
        last_analyze, last_autoanalyze
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `);
    return result.rows;
  }

  async getDatabaseSize() {
    const result = await this.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as database_size,
             pg_database_size(current_database()) as database_size_bytes
    `);
    return result.rows[0];
  }

  async getSlowQueries(limit = 10) {
    const result = await this.query(
      `
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
      FROM pg_stat_statements
      ORDER BY mean_time DESC
      LIMIT $1
    `,
      [limit]
    );
    return result.rows;
  }

  // Backup and maintenance methods
  async vacuum(tableName = null) {
    try {
      if (tableName) {
        await this.query(`VACUUM ANALYZE ${tableName}`);
        logger.info(`Vacuum completed for table: ${tableName}`);
      } else {
        await this.query('VACUUM ANALYZE');
        logger.info('Full database vacuum completed');
      }
    } catch (error) {
      logger.error('Vacuum operation failed:', error);
      throw error;
    }
  }

  async reindex(tableName = null) {
    try {
      if (tableName) {
        await this.query(`REINDEX TABLE ${tableName}`);
        logger.info(`Reindex completed for table: ${tableName}`);
      } else {
        await this.query('REINDEX DATABASE CONCURRENTLY');
        logger.info('Full database reindex completed');
      }
    } catch (error) {
      logger.error('Reindex operation failed:', error);
      throw error;
    }
  }

  // Connection health check
  async healthCheck() {
    try {
      const start = Date.now();
      await this.query('SELECT 1');
      const responseTime = Date.now() - start;

      const connectionStats = await this.getConnectionCount();
      const databaseSize = await this.getDatabaseSize();

      return {
        status: 'healthy',
        responseTime,
        connectionStats,
        databaseSize,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Graceful shutdown
  async close() {
    if (this.pool) {
      logger.info('Closing database connection pool...');
      await this.pool.end();
      this.isConnected = false;
      logger.info('Database connection pool closed');
    }
  }

  // Utility methods
  async executeMigration(migrationSql) {
    return this.transaction(async client => {
      const queries = migrationSql.split(';').filter(q => q.trim());

      for (const query of queries) {
        if (query.trim()) {
          await client.query(query);
        }
      }

      logger.info('Migration executed successfully');
    });
  }

  async getQueryExecution(query, params = []) {
    const explainResult = await this.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
      params
    );
    return explainResult.rows[0]['QUERY PLAN'][0];
  }
}

export default DatabaseService;
