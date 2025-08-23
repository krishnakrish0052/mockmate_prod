import crypto from 'crypto';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { cache } from '../config/redis.js';

/**
 * Dynamic Configuration Service
 * Manages system configurations with encryption, caching, and real-time updates
 */
export class ConfigurationService {
  constructor() {
    this.db = null;
    this.encryptionKey = null;
    this.configCache = new Map();
    this.listeners = new Map(); // For real-time configuration updates
    this.cacheTimeout = 300000; // 5 minutes cache timeout
    this.initialized = false;
  }

  /**
   * Initialize the configuration service
   */
  async initialize() {
    try {
      this.db = getDatabase();

      // Generate or get encryption key
      await this.initializeEncryption();

      // Load initial configurations into cache
      await this.loadConfigurations();

      // Set up cache cleanup interval
      setInterval(() => this.cleanupCache(), this.cacheTimeout);

      this.initialized = true;
      logger.info('ConfigurationService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ConfigurationService:', error);
      throw error;
    }
  }

  /**
   * Initialize encryption key for sensitive configurations
   */
  async initializeEncryption() {
    // In production, this should be loaded from a secure key management service
    const keySource = process.env.CONFIG_ENCRYPTION_KEY || 'default-key-change-in-production';
    this.encryptionKey = crypto.scryptSync(keySource, 'salt', 32);
  }

  /**
   * Encrypt sensitive configuration values
   */
  encrypt(text) {
    if (!text) return '';

    const _iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return _iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive configuration values
   */
  decrypt(encryptedText) {
    if (!encryptedText) return '';

    try {
      const [ivHex, encrypted] = encryptedText.split(':');
      if (!ivHex || !encrypted) return encryptedText; // Not encrypted

      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.warn('Failed to decrypt configuration value:', error.message);
      return encryptedText; // Return as is if decryption fails
    }
  }

  /**
   * Load all configurations from database into cache
   */
  async loadConfigurations() {
    try {
      const query = `
                SELECT 
                    config_key,
                    config_value,
                    default_value,
                    value_type,
                    is_sensitive,
                    is_client_accessible,
                    environment,
                    validation_rules
                FROM v_active_configurations
                WHERE environment IN ('all', $1)
                ORDER BY sort_order
            `;

      const result = await this.db.query(query, [process.env.NODE_ENV || 'development']);

      for (const row of result.rows) {
        const cacheKey = `config:${row.config_key}`;
        let value = row.config_value || row.default_value;

        // Decrypt sensitive values
        if (row.is_sensitive && value) {
          value = this.decrypt(value);
        }

        // Parse typed values
        value = this.parseConfigValue(value, row.value_type);

        this.configCache.set(cacheKey, {
          value,
          type: row.value_type,
          isSensitive: row.is_sensitive,
          isClientAccessible: row.is_client_accessible,
          environment: row.environment,
          validationRules: row.validation_rules,
          cachedAt: Date.now(),
        });
      }

      logger.info(`Loaded ${result.rows.length} configurations into cache`);
    } catch (error) {
      logger.error('Failed to load configurations:', error);
      throw error;
    }
  }

  /**
   * Parse configuration value based on type
   */
  parseConfigValue(value, type) {
    if (value === null || value === undefined) return value;

    switch (type) {
      case 'number':
        return Number(value);
      case 'boolean':
        return ['true', 't', '1', 'yes', 'on'].includes(String(value).toLowerCase());
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'array':
        if (Array.isArray(value)) return value;
        return String(value)
          .split(',')
          .map(v => v.trim())
          .filter(v => v);
      default:
        return value;
    }
  }

  /**
   * Get a configuration value
   */
  async get(key, defaultValue = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    const cacheKey = `config:${key}`;

    // Check memory cache first
    if (this.configCache.has(cacheKey)) {
      const cached = this.configCache.get(cacheKey);

      // Check if cache is still valid
      if (Date.now() - cached.cachedAt < this.cacheTimeout) {
        return cached.value !== undefined ? cached.value : defaultValue;
      }
    }

    // Try Redis cache
    const redisKey = `config:${key}`;
    const cached = await cache.get(redisKey);
    if (cached) {
      this.configCache.set(cacheKey, {
        ...cached,
        cachedAt: Date.now(),
      });
      return cached.value !== undefined ? cached.value : defaultValue;
    }

    // Load from database
    try {
      const query = `
                SELECT 
                    config_value,
                    default_value,
                    value_type,
                    is_sensitive,
                    is_client_accessible,
                    environment,
                    validation_rules
                FROM system_configurations sc
                JOIN configuration_categories cc ON sc.category_id = cc.id
                WHERE sc.config_key = $1 
                  AND sc.is_active = true 
                  AND cc.is_active = true
                  AND sc.environment IN ('all', $2)
            `;

      const result = await this.db.query(query, [key, process.env.NODE_ENV || 'development']);

      if (result.rows.length === 0) {
        return defaultValue;
      }

      const row = result.rows[0];
      let value = row.config_value || row.default_value;

      // Decrypt if sensitive
      if (row.is_sensitive && value) {
        value = this.decrypt(value);
      }

      // Parse typed value
      value = this.parseConfigValue(value, row.value_type);

      // Cache the result
      const cacheData = {
        value,
        type: row.value_type,
        isSensitive: row.is_sensitive,
        isClientAccessible: row.is_client_accessible,
        environment: row.environment,
        validationRules: row.validation_rules,
        cachedAt: Date.now(),
      };

      this.configCache.set(cacheKey, cacheData);
      await cache.set(redisKey, cacheData, 300); // 5 minutes

      return value !== undefined ? value : defaultValue;
    } catch (error) {
      logger.error(`Failed to get configuration '${key}':`, error);
      return defaultValue;
    }
  }

  /**
   * Set a configuration value
   */
  async set(key, value, updatedBy = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get existing configuration for validation
      const existingQuery = `
                SELECT id, value_type, validation_rules, is_sensitive
                FROM system_configurations 
                WHERE config_key = $1 AND is_active = true
            `;

      const existingResult = await this.db.query(existingQuery, [key]);

      if (existingResult.rows.length === 0) {
        throw new Error(`Configuration key '${key}' not found`);
      }

      const existing = existingResult.rows[0];

      // Validate the value
      const isValid = await this.validateConfigValue(
        key,
        value,
        existing.value_type,
        existing.validation_rules
      );
      if (!isValid) {
        throw new Error(`Invalid value for configuration '${key}'`);
      }

      // Encrypt if sensitive
      let storedValue = value;
      if (existing.is_sensitive && value) {
        storedValue = this.encrypt(String(value));
      }

      // Update in database
      const updateQuery = `
                UPDATE system_configurations 
                SET config_value = $1, updated_by = $2, updated_at = NOW()
                WHERE id = $3
                RETURNING *
            `;

      await this.db.query(updateQuery, [storedValue, updatedBy, existing.id]);

      // Clear caches
      const cacheKey = `config:${key}`;
      this.configCache.delete(cacheKey);
      await cache.del(`config:${key}`);

      // Notify listeners
      this.notifyConfigChange(key, value);

      logger.info(`Configuration '${key}' updated successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to set configuration '${key}':`, error);
      throw error;
    }
  }

  /**
   * Get multiple configurations
   */
  async getMany(keys) {
    const result = {};
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    return result;
  }

  /**
   * Get all configurations (excluding sensitive ones unless specified)
   */
  async getAll(includeSensitive = false, clientAccessibleOnly = false) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      let query = `
                SELECT 
                    config_key,
                    config_value,
                    default_value,
                    value_type,
                    is_sensitive,
                    is_client_accessible,
                    environment,
                    validation_rules
                FROM v_active_configurations
                WHERE environment IN ('all', $1)
            `;

      const params = [process.env.NODE_ENV || 'development'];

      if (!includeSensitive) {
        query += ' AND is_sensitive = false';
      }

      if (clientAccessibleOnly) {
        query += ' AND is_client_accessible = true';
      }

      query += ' ORDER BY sort_order';

      const result = await this.db.query(query, params);
      const configs = {};

      for (const row of result.rows) {
        let value = row.config_value || row.default_value;

        // Decrypt sensitive values if requested
        if (includeSensitive && row.is_sensitive && value) {
          value = this.decrypt(value);
        }

        // Parse typed values
        value = this.parseConfigValue(value, row.value_type);

        configs[row.config_key] = value;
      }

      return configs;
    } catch (error) {
      logger.error('Failed to get all configurations:', error);
      throw error;
    }
  }

  /**
   * Get configurations by category
   */
  async getByCategory(categoryName, includeSensitive = false) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      let query = `
                SELECT 
                    config_key,
                    config_value,
                    default_value,
                    value_type,
                    is_sensitive,
                    display_name,
                    description
                FROM v_active_configurations
                WHERE category_name = $1 
                  AND environment IN ('all', $2)
            `;

      const params = [categoryName, process.env.NODE_ENV || 'development'];

      if (!includeSensitive) {
        query += ' AND is_sensitive = false';
      }

      query += ' ORDER BY sort_order';

      const result = await this.db.query(query, params);
      const configs = {};

      for (const row of result.rows) {
        let value = row.config_value || row.default_value;

        // Decrypt sensitive values if requested
        if (includeSensitive && row.is_sensitive && value) {
          value = this.decrypt(value);
        }

        // Parse typed values
        value = this.parseConfigValue(value, row.value_type);

        configs[row.config_key] = {
          value,
          displayName: row.display_name,
          description: row.description,
          type: row.value_type,
          isSensitive: row.is_sensitive,
        };
      }

      return configs;
    } catch (error) {
      logger.error(`Failed to get configurations for category '${categoryName}':`, error);
      throw error;
    }
  }

  /**
   * Validate configuration value
   */
  async validateConfigValue(key, value, type, validationRules) {
    try {
      // Use database validation function
      const query = 'SELECT validate_configuration_value($1, $2, $3, $4) as is_valid';
      const result = await this.db.query(query, [key, String(value), type, validationRules]);

      return result.rows[0]?.is_valid === true;
    } catch (error) {
      logger.error(`Validation failed for '${key}':`, error);
      return false;
    }
  }

  /**
   * Reload configuration from database (clears all caches)
   */
  async reload() {
    try {
      this.configCache.clear();
      await this.loadConfigurations();

      // Clear Redis cache
      const redisKeys = await cache.keys('config:*');
      if (redisKeys.length > 0) {
        await cache.del(redisKeys);
      }

      logger.info('Configuration cache reloaded successfully');
    } catch (error) {
      logger.error('Failed to reload configurations:', error);
      throw error;
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    let cleanupCount = 0;

    for (const [key, cached] of this.configCache.entries()) {
      if (now - cached.cachedAt > this.cacheTimeout) {
        this.configCache.delete(key);
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      logger.debug(`Cleaned up ${cleanupCount} expired configuration cache entries`);
    }
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
  }

  /**
   * Unsubscribe from configuration changes
   */
  unsubscribe(key, callback) {
    if (this.listeners.has(key)) {
      this.listeners.get(key).delete(callback);
      if (this.listeners.get(key).size === 0) {
        this.listeners.delete(key);
      }
    }
  }

  /**
   * Notify listeners of configuration changes
   */
  notifyConfigChange(key, newValue) {
    if (this.listeners.has(key)) {
      for (const callback of this.listeners.get(key)) {
        try {
          callback(newValue, key);
        } catch (error) {
          logger.error('Error in configuration change listener:', error);
        }
      }
    }

    // Also notify wildcard listeners
    if (this.listeners.has('*')) {
      for (const callback of this.listeners.get('*')) {
        try {
          callback(newValue, key);
        } catch (error) {
          logger.error('Error in wildcard configuration change listener:', error);
        }
      }
    }
  }

  /**
   * Get configuration with metadata
   */
  async getWithMetadata(key) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const query = `
                SELECT 
                    sc.*,
                    cc.name as category_name,
                    cc.display_name as category_display_name
                FROM system_configurations sc
                JOIN configuration_categories cc ON sc.category_id = cc.id
                WHERE sc.config_key = $1 
                  AND sc.is_active = true 
                  AND cc.is_active = true
                  AND sc.environment IN ('all', $2)
            `;

      const result = await this.db.query(query, [key, process.env.NODE_ENV || 'development']);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      let value = row.config_value || row.default_value;

      // Decrypt if sensitive (only for server-side usage)
      if (row.is_sensitive && value) {
        value = this.decrypt(value);
      }

      // Parse typed value
      value = this.parseConfigValue(value, row.value_type);

      return {
        key: row.config_key,
        value,
        displayName: row.display_name,
        description: row.description,
        type: row.value_type,
        defaultValue: row.default_value,
        isSensitive: row.is_sensitive,
        isClientAccessible: row.is_client_accessible,
        environment: row.environment,
        restartRequired: row.restart_required,
        validationRules: row.validation_rules,
        category: {
          name: row.category_name,
          displayName: row.category_display_name,
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error(`Failed to get configuration metadata for '${key}':`, error);
      throw error;
    }
  }

  /**
   * Create a singleton instance
   */
  static getInstance() {
    if (!ConfigurationService.instance) {
      ConfigurationService.instance = new ConfigurationService();
    }
    return ConfigurationService.instance;
  }
}

// Export singleton instance
export const configService = ConfigurationService.getInstance();
