import { logger } from '../config/logger.js';

/**
 * Dynamic Configuration Service
 * Works with existing system_config table to provide runtime configuration management
 */
export class DynamicConfigService {
  constructor(database) {
    this.db = database;
    this.configCache = new Map();
    this.cacheTimeout = 300000; // 5 minutes
    this.initialized = false;
  }

  /**
   * Initialize the configuration service
   */
  async initialize() {
    try {
      if (!this.db) {
        throw new Error('Database connection not provided');
      }

      // Load all configurations into cache
      await this.loadConfigurations();

      // Set up cache cleanup interval
      setInterval(() => this.cleanupCache(), this.cacheTimeout);

      this.initialized = true;
      logger.info('DynamicConfigService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize DynamicConfigService:', error);
      throw error;
    }
  }

  /**
   * Load all configurations from database into cache
   */
  async loadConfigurations() {
    try {
      const query = `
        SELECT config_key, config_value, config_type, is_sensitive, is_public
        FROM system_config 
        ORDER BY config_key
      `;

      const result = await this.db.query(query);

      for (const row of result.rows) {
        const cacheKey = `config:${row.config_key}`;
        let value = row.config_value;

        // Parse JSON values back to appropriate types
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if parsing fails
          }
        }

        this.configCache.set(cacheKey, {
          value,
          type: row.config_type,
          isSensitive: row.is_sensitive,
          isPublic: row.is_public,
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
        return cached.value !== undefined && cached.value !== null ? cached.value : defaultValue;
      }
    }

    // Load from database if not in cache or cache expired
    try {
      const query = `
        SELECT config_value, config_type, is_sensitive, is_public
        FROM system_config 
        WHERE config_key = $1
      `;

      const result = await this.db.query(query, [key]);

      if (result.rows.length === 0) {
        return defaultValue;
      }

      const row = result.rows[0];
      let value = row.config_value;

      // Parse JSON values back to appropriate types
      if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if parsing fails
        }
      }

      // Cache the result
      const cacheData = {
        value,
        type: row.config_type,
        isSensitive: row.is_sensitive,
        isPublic: row.is_public,
        cachedAt: Date.now(),
      };

      this.configCache.set(cacheKey, cacheData);

      return value !== undefined && value !== null ? value : defaultValue;
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
      // Check if configuration exists
      const existingQuery = `
        SELECT id, config_type FROM system_config 
        WHERE config_key = $1
      `;

      const existingResult = await this.db.query(existingQuery, [key]);

      if (existingResult.rows.length === 0) {
        throw new Error(`Configuration key '${key}' not found`);
      }

      const existing = existingResult.rows[0];

      // Convert value to proper format for storage
      let storedValue = value;
      if (existing.config_type === 'number') {
        storedValue = Number(value);
      } else if (existing.config_type === 'boolean') {
        storedValue = Boolean(value);
      }

      // Update in database (store as JSON for complex types)
      const updateQuery = `
        UPDATE system_config 
        SET config_value = $1, updated_by = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;

      await this.db.query(updateQuery, [storedValue, updatedBy, existing.id]);

      // Clear cache for this configuration
      const cacheKey = `config:${key}`;
      this.configCache.delete(cacheKey);

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
   * Get all public configurations (for frontend)
   */
  async getPublicConfigurations() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const query = `
        SELECT config_key, config_value, config_type
        FROM system_config
        WHERE is_public = true
        ORDER BY config_key
      `;

      const result = await this.db.query(query);
      const configs = {};

      for (const row of result.rows) {
        let value = row.config_value;

        // Parse JSON values back to appropriate types
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if parsing fails
          }
        }

        configs[row.config_key] = value;
      }

      return configs;
    } catch (error) {
      logger.error('Failed to get public configurations:', error);
      throw error;
    }
  }

  /**
   * Get configurations by category
   */
  async getByCategory(category, includeSensitive = false) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      let query = `
        SELECT config_key, config_value, config_type, description, is_sensitive
        FROM system_config
        WHERE category = $1
      `;

      const params = [category];

      if (!includeSensitive) {
        query += ' AND is_sensitive = false';
      }

      query += ' ORDER BY config_key';

      const result = await this.db.query(query, params);
      const configs = {};

      for (const row of result.rows) {
        let value = row.config_value;

        // Parse JSON values back to appropriate types
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if parsing fails
          }
        }

        // Mask sensitive values in response
        if (row.is_sensitive && !includeSensitive) {
          value = '••••••••••••';
        }

        configs[row.config_key] = {
          value,
          description: row.description,
          type: row.config_type,
          isSensitive: row.is_sensitive,
        };
      }

      return configs;
    } catch (error) {
      logger.error(`Failed to get configurations for category '${category}':`, error);
      throw error;
    }
  }

  /**
   * Reload configuration from database (clears all caches)
   */
  async reload() {
    try {
      this.configCache.clear();
      await this.loadConfigurations();

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
   * Get all categories
   */
  async getCategories() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const query = `
        SELECT category, COUNT(*) as config_count
        FROM system_config
        GROUP BY category 
        ORDER BY category
      `;

      const result = await this.db.query(query);

      return result.rows.map(row => ({
        name: row.category,
        configCount: parseInt(row.config_count),
      }));
    } catch (error) {
      logger.error('Failed to get configuration categories:', error);
      throw error;
    }
  }

  /**
   * Get configuration statistics
   */
  async getStats() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const query = `
        SELECT 
          COUNT(*) as total_configs,
          COUNT(CASE WHEN is_public = true THEN 1 END) as public_configs,
          COUNT(CASE WHEN is_sensitive = true THEN 1 END) as sensitive_configs,
          COUNT(DISTINCT category) as categories
        FROM system_config
      `;

      const result = await this.db.query(query);

      return {
        totalConfigurations: parseInt(result.rows[0].total_configs),
        publicConfigurations: parseInt(result.rows[0].public_configs),
        sensitiveConfigurations: parseInt(result.rows[0].sensitive_configs),
        totalCategories: parseInt(result.rows[0].categories),
      };
    } catch (error) {
      logger.error('Failed to get configuration statistics:', error);
      throw error;
    }
  }

  /**
   * Create a singleton instance
   */
  static getInstance(database) {
    if (!DynamicConfigService.instance) {
      DynamicConfigService.instance = new DynamicConfigService(database);
    }
    return DynamicConfigService.instance;
  }
}

// Export convenience function for getting configuration values
export function createDynamicConfig(database) {
  const service = new DynamicConfigService(database);

  // Return a function that can be used like the old process.env
  const getConfig = async (key, defaultValue = null) => {
    return await service.get(key, defaultValue);
  };

  // Add service methods to the function
  getConfig.service = service;
  getConfig.get = (key, defaultValue) => service.get(key, defaultValue);
  getConfig.set = (key, value, updatedBy) => service.set(key, value, updatedBy);
  getConfig.getMany = keys => service.getMany(keys);
  getConfig.getPublic = () => service.getPublicConfigurations();
  getConfig.getByCategory = (category, includeSensitive) =>
    service.getByCategory(category, includeSensitive);
  getConfig.reload = () => service.reload();
  getConfig.getCategories = () => service.getCategories();
  getConfig.getStats = () => service.getStats();
  getConfig.initialize = () => service.initialize();

  return getConfig;
}
