import { getDatabase } from '../config/database.js';

class PaymentConfiguration {
  constructor(data = {}) {
    this.id = data.id;
    this.provider_name = data.provider_name;
    this.provider_type = data.provider_type;
    this.is_active = data.is_active;
    this.is_test_mode = data.is_test_mode;
    this.configuration = data.configuration;
    this.webhook_url = data.webhook_url;
    this.webhook_secret = data.webhook_secret;
    this.priority = data.priority;
    this.supported_currencies = data.supported_currencies;
    this.supported_countries = data.supported_countries;
    this.features = data.features;
    this.limits = data.limits;
    this.metadata = data.metadata;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
  }

  // Create a new payment configuration
  static async create(configData) {
    const db = getDatabase();
    const {
      provider_name,
      provider_type,
      is_active = true,
      is_test_mode = true,
      configuration,
      webhook_url = null,
      webhook_secret = null,
      priority = 0,
      supported_currencies = ['USD'],
      supported_countries = ['US'],
      features = {},
      limits = {},
      metadata = {},
      created_by,
    } = configData;

    const query = `
      INSERT INTO payment_configurations (
        provider_name, provider_type, is_active, is_test_mode, configuration,
        webhook_url, webhook_secret, priority, supported_currencies, 
        supported_countries, features, limits, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await db.query(query, [
      provider_name,
      provider_type,
      is_active,
      is_test_mode,
      JSON.stringify(configuration),
      webhook_url,
      webhook_secret,
      priority,
      JSON.stringify(supported_currencies),
      JSON.stringify(supported_countries),
      JSON.stringify(features),
      JSON.stringify(limits),
      JSON.stringify(metadata),
      created_by,
    ]);

    return new PaymentConfiguration(result.rows[0]);
  }

  // Find configuration by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM payment_configurations WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new PaymentConfiguration(result.rows[0]);
  }

  // Find configuration by provider name
  static async findByProvider(providerName) {
    const db = getDatabase();
    const query =
      'SELECT * FROM payment_configurations WHERE provider_name = $1 ORDER BY priority DESC';
    const result = await db.query(query, [providerName]);

    return result.rows.map(row => new PaymentConfiguration(row));
  }

  // Get active payment configurations
  static async getActiveConfigurations(testMode = false) {
    const db = getDatabase();
    const query = `
      SELECT * FROM payment_configurations 
      WHERE is_active = true AND is_test_mode = $1
      ORDER BY priority DESC, provider_name ASC
    `;
    const result = await db.query(query, [testMode]);

    return result.rows.map(row => new PaymentConfiguration(row));
  }

  // Get count of configurations with filters
  static async count(filters = {}) {
    const db = getDatabase();
    let query = `SELECT COUNT(*) FROM payment_configurations`;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.provider_type) {
      conditions.push(`provider_type = $${paramIndex++}`);
      params.push(filters.provider_type);
    }

    if (filters.is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filters.is_active);
    }

    if (filters.is_test_mode !== undefined) {
      conditions.push(`is_test_mode = $${paramIndex++}`);
      params.push(filters.is_test_mode);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count);
  }

  // Get all configurations with pagination
  static async findAll(limit = 20, offset = 0, filters = {}) {
    const db = getDatabase();
    let query = `SELECT * FROM payment_configurations`;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.provider_type) {
      conditions.push(`provider_type = $${paramIndex++}`);
      params.push(filters.provider_type);
    }

    if (filters.is_active !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(filters.is_active);
    }

    if (filters.is_test_mode !== undefined) {
      conditions.push(`is_test_mode = $${paramIndex++}`);
      params.push(filters.is_test_mode);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY priority DESC, provider_name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows.map(row => new PaymentConfiguration(row));
  }

  // Update payment configuration
  async update(updates, updatedBy) {
    const db = getDatabase();
    const allowedUpdates = [
      'provider_name',
      'provider_type',
      'is_active',
      'is_test_mode',
      'configuration',
      'webhook_url',
      'webhook_secret',
      'priority',
      'supported_currencies',
      'supported_countries',
      'features',
      'limits',
      'metadata',
    ];

    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        fields.push(`${key} = $${paramIndex++}`);

        // Handle JSON fields
        if (
          [
            'configuration',
            'supported_currencies',
            'supported_countries',
            'features',
            'limits',
            'metadata',
          ].includes(key)
        ) {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${paramIndex++}`);
    values.push(updatedBy);
    values.push(this.id);

    const query = `
      UPDATE payment_configurations 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Payment configuration not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  // Delete payment configuration (soft delete by deactivating)
  async delete(deletedBy) {
    return await this.update({ is_active: false }, deletedBy);
  }

  // Hard delete payment configuration
  static async hardDelete(id) {
    const db = getDatabase();
    const query = 'DELETE FROM payment_configurations WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);

    return result.rows.length > 0;
  }

  // Test payment configuration
  async testConfiguration() {
    // This method should be implemented based on specific provider requirements
    // For now, we'll just validate the configuration structure
    const requiredFields = this.getRequiredFieldsForProvider();
    const config = JSON.parse(this.configuration || '{}');

    for (const field of requiredFields) {
      if (!config[field]) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    return {
      valid: true,
      provider: this.provider_name,
      testMode: this.is_test_mode,
      message: 'Configuration validation passed',
    };
  }

  // Get required fields for specific provider
  getRequiredFieldsForProvider() {
    const providerRequirements = {
      stripe: ['secret_key', 'publishable_key'],
      paypal: ['client_id', 'client_secret'],
      razorpay: ['key_id', 'key_secret'],
      square: ['access_token', 'application_id'],
      braintree: ['merchant_id', 'public_key', 'private_key'],
      cashfree: ['app_id', 'secret_key'],
    };

    return providerRequirements[this.provider_name.toLowerCase()] || [];
  }

  // Get safe configuration (without sensitive data)
  getSafeConfiguration() {
    const config = JSON.parse(this.configuration || '{}');
    const safeConfig = { ...config };

    // Remove sensitive fields
    const sensitiveFields = [
      'secret_key',
      'private_key',
      'client_secret',
      'key_secret',
      'access_token',
      'refresh_token',
      'webhook_secret',
    ];

    sensitiveFields.forEach(field => {
      if (safeConfig[field]) {
        safeConfig[field] = '••••••••';
      }
    });

    return safeConfig;
  }

  // Convert to JSON (safe for client)
  toJSON() {
    const { webhook_secret: _webhook_secret, configuration: _configuration, ...safeData } = this;
    return {
      ...safeData,
      configuration: this.getSafeConfiguration(),
      supported_currencies: JSON.parse(this.supported_currencies || '["USD"]'),
      supported_countries: JSON.parse(this.supported_countries || '["US"]'),
      features: JSON.parse(this.features || '{}'),
      limits: JSON.parse(this.limits || '{}'),
      metadata: JSON.parse(this.metadata || '{}'),
    };
  }

  // Get full data (for internal use with sensitive information)
  getFullData() {
    return {
      ...this,
      configuration: JSON.parse(this.configuration || '{}'),
      supported_currencies: JSON.parse(this.supported_currencies || '["USD"]'),
      supported_countries: JSON.parse(this.supported_countries || '["US"]'),
      features: JSON.parse(this.features || '{}'),
      limits: JSON.parse(this.limits || '{}'),
      metadata: JSON.parse(this.metadata || '{}'),
    };
  }

  // Get provider statistics
  static async getProviderStats() {
    const db = getDatabase();
    const query = `
      SELECT 
        provider_name,
        provider_type,
        COUNT(*) as total_configs,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_configs,
        COUNT(CASE WHEN is_test_mode = true THEN 1 END) as test_configs
      FROM payment_configurations 
      GROUP BY provider_name, provider_type
      ORDER BY provider_name
    `;

    const result = await db.query(query);
    return result.rows;
  }

  // Enable/disable configuration
  async toggleStatus(isActive, updatedBy) {
    return await this.update({ is_active: isActive }, updatedBy);
  }

  // Switch test mode
  async toggleTestMode(isTestMode, updatedBy) {
    return await this.update({ is_test_mode: isTestMode }, updatedBy);
  }

  // Update priority
  async updatePriority(priority, updatedBy) {
    return await this.update({ priority: parseInt(priority) }, updatedBy);
  }
}

// Payment Configuration Audit Log class
class PaymentConfigAuditLog {
  constructor(data = {}) {
    this.id = data.id;
    this.config_id = data.config_id;
    this.admin_id = data.admin_id;
    this.action = data.action;
    this.old_values = data.old_values;
    this.new_values = data.new_values;
    this.ip_address = data.ip_address;
    this.user_agent = data.user_agent;
    this.created_at = data.created_at;
  }

  // Log configuration changes
  static async logChange(configId, adminId, action, oldValues, newValues, ipAddress, userAgent) {
    const db = getDatabase();
    const query = `
      INSERT INTO payment_config_audit_logs (
        config_id, admin_id, action, old_values, new_values, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await db.query(query, [
      configId,
      adminId,
      action,
      JSON.stringify(oldValues || {}),
      JSON.stringify(newValues || {}),
      ipAddress,
      userAgent,
    ]);

    return new PaymentConfigAuditLog(result.rows[0]);
  }

  // Get audit logs for a configuration
  static async getConfigAuditLogs(configId, limit = 50, offset = 0) {
    const db = getDatabase();
    const query = `
      SELECT pal.*, au.username as admin_username
      FROM payment_config_audit_logs pal
      JOIN admin_users au ON pal.admin_id = au.id
      WHERE pal.config_id = $1
      ORDER BY pal.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [configId, limit, offset]);
    return result.rows.map(row => new PaymentConfigAuditLog(row));
  }
}

export { PaymentConfiguration, PaymentConfigAuditLog };
