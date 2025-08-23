import { logger } from '../config/logger.js';
import crypto from 'crypto';

class AuthProviderConfigService {
  constructor(database, dynamicConfig) {
    this.db = database;
    this.dynamicConfig = dynamicConfig;
    this.providers = new Map();
    this.initialized = false;
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      await this.createProviderConfigTable();
      await this.loadProviderConfigurations();
      this.initialized = true;

      logger.info('Auth Provider Configuration Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Auth Provider Configuration Service:', error);
      throw error;
    }
  }

  /**
   * Create provider configuration table
   */
  async createProviderConfigTable() {
    try {
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS auth_provider_configs (
                    id SERIAL PRIMARY KEY,
                    provider_id VARCHAR(100) NOT NULL UNIQUE,
                    provider_name VARCHAR(255) NOT NULL,
                    provider_type VARCHAR(100) NOT NULL,
                    is_enabled BOOLEAN DEFAULT false,
                    config_data JSONB NOT NULL,
                    encrypted_secrets BYTEA,
                    scopes TEXT[] DEFAULT ARRAY[]::TEXT[],
                    button_config JSONB DEFAULT '{}',
                    rate_limits JSONB DEFAULT '{}',
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_by UUID REFERENCES users(id),
                    updated_by UUID REFERENCES users(id)
                )
            `);

      // Create index for faster lookups
      await this.db.query(`
                CREATE INDEX IF NOT EXISTS idx_auth_provider_configs_enabled 
                ON auth_provider_configs(is_enabled) WHERE is_enabled = true
            `);

      logger.info('Auth provider configuration table created/verified');
    } catch (error) {
      logger.error('Failed to create provider config table:', error);
      throw error;
    }
  }

  /**
   * Load provider configurations from database
   */
  async loadProviderConfigurations() {
    try {
      const result = await this.db.query(`
                SELECT * FROM auth_provider_configs 
                ORDER BY provider_id
            `);

      this.providers.clear();

      for (const config of result.rows) {
        try {
          // Decrypt secrets if they exist
          let secrets = {};
          if (config.encrypted_secrets) {
            secrets = this.decryptSecrets(config.encrypted_secrets);
          }

          this.providers.set(config.provider_id, {
            id: config.id,
            providerId: config.provider_id,
            providerName: config.provider_name,
            providerType: config.provider_type,
            isEnabled: config.is_enabled,
            configData: config.config_data,
            secrets,
            scopes: config.scopes || [],
            buttonConfig: config.button_config || {},
            rateLimits: config.rate_limits || {},
            metadata: config.metadata || {},
            createdAt: config.created_at,
            updatedAt: config.updated_at,
          });
        } catch (decryptError) {
          logger.error('Failed to decrypt secrets for provider:', {
            providerId: config.provider_id,
            error: decryptError.message,
          });
        }
      }

      // If no providers exist, create default configurations
      if (this.providers.size === 0) {
        await this.createDefaultProviderConfigs();
      }

      logger.info('Auth provider configurations loaded:', {
        totalProviders: this.providers.size,
        enabledProviders: Array.from(this.providers.values()).filter(p => p.isEnabled).length,
      });
    } catch (error) {
      logger.error('Failed to load provider configurations:', error);
      throw error;
    }
  }

  /**
   * Create default provider configurations
   */
  async createDefaultProviderConfigs() {
    const defaultProviders = [
      {
        providerId: 'google.com',
        providerName: 'Google',
        providerType: 'oauth',
        configData: {
          authUrl: 'https://accounts.google.com/o/oauth2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
          responseType: 'code',
          grantType: 'authorization_code',
        },
        scopes: ['email', 'profile', 'openid'],
        buttonConfig: {
          text: 'Sign in with Google',
          backgroundColor: '#4285f4',
          textColor: '#ffffff',
          icon: 'google',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        isEnabled: false,
      },
      {
        providerId: 'facebook.com',
        providerName: 'Facebook',
        providerType: 'oauth',
        configData: {
          authUrl: 'https://www.facebook.com/v13.0/dialog/oauth',
          tokenUrl: 'https://graph.facebook.com/v13.0/oauth/access_token',
          userInfoUrl: 'https://graph.facebook.com/me',
          responseType: 'code',
          grantType: 'authorization_code',
        },
        scopes: ['email', 'public_profile'],
        buttonConfig: {
          text: 'Sign in with Facebook',
          backgroundColor: '#1877f2',
          textColor: '#ffffff',
          icon: 'facebook',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        isEnabled: false,
      },
      {
        providerId: 'github.com',
        providerName: 'GitHub',
        providerType: 'oauth',
        configData: {
          authUrl: 'https://github.com/login/oauth/authorize',
          tokenUrl: 'https://github.com/login/oauth/access_token',
          userInfoUrl: 'https://api.github.com/user',
          responseType: 'code',
          grantType: 'authorization_code',
        },
        scopes: ['user:email'],
        buttonConfig: {
          text: 'Sign in with GitHub',
          backgroundColor: '#333333',
          textColor: '#ffffff',
          icon: 'github',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        isEnabled: false,
      },
      {
        providerId: 'microsoft.com',
        providerName: 'Microsoft',
        providerType: 'oauth',
        configData: {
          authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
          responseType: 'code',
          grantType: 'authorization_code',
        },
        scopes: ['openid', 'email', 'profile'],
        buttonConfig: {
          text: 'Sign in with Microsoft',
          backgroundColor: '#00a1f1',
          textColor: '#ffffff',
          icon: 'microsoft',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        isEnabled: false,
      },
      {
        providerId: 'apple.com',
        providerName: 'Apple',
        providerType: 'oauth',
        configData: {
          authUrl: 'https://appleid.apple.com/auth/authorize',
          tokenUrl: 'https://appleid.apple.com/auth/token',
          responseType: 'code id_token',
          grantType: 'authorization_code',
        },
        scopes: ['name', 'email'],
        buttonConfig: {
          text: 'Sign in with Apple',
          backgroundColor: '#000000',
          textColor: '#ffffff',
          icon: 'apple',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        isEnabled: false,
      },
      {
        providerId: 'twitter.com',
        providerName: 'Twitter',
        providerType: 'oauth',
        configData: {
          authUrl: 'https://twitter.com/i/oauth2/authorize',
          tokenUrl: 'https://api.twitter.com/2/oauth2/token',
          userInfoUrl: 'https://api.twitter.com/2/users/me',
          responseType: 'code',
          grantType: 'authorization_code',
        },
        scopes: ['tweet.read', 'users.read'],
        buttonConfig: {
          text: 'Sign in with Twitter',
          backgroundColor: '#1da1f2',
          textColor: '#ffffff',
          icon: 'twitter',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 60,
          requestsPerHour: 1000,
        },
        isEnabled: false,
      },
      {
        providerId: 'email',
        providerName: 'Email/Password',
        providerType: 'email',
        configData: {
          requireEmailVerification: true,
          passwordMinLength: 6,
          passwordRequireUppercase: false,
          passwordRequireLowercase: false,
          passwordRequireNumbers: false,
          passwordRequireSymbols: false,
        },
        buttonConfig: {
          text: 'Sign in with Email',
          backgroundColor: '#6c757d',
          textColor: '#ffffff',
          icon: 'email',
          borderRadius: '4px',
        },
        rateLimits: {
          requestsPerMinute: 20,
          requestsPerHour: 200,
        },
        isEnabled: true,
      },
    ];

    for (const provider of defaultProviders) {
      await this.createProviderConfig(provider);
    }

    logger.info('Default auth provider configurations created');
  }

  /**
   * Create a new provider configuration
   */
  async createProviderConfig(configData) {
    try {
      // Separate secrets from config data
      const { secrets, ...cleanConfigData } = configData;
      const encryptedSecrets = secrets ? this.encryptSecrets(secrets) : null;

      const result = await this.db.query(
        `
                INSERT INTO auth_provider_configs (
                    provider_id, provider_name, provider_type, is_enabled,
                    config_data, encrypted_secrets, scopes, button_config,
                    rate_limits, metadata, created_at, updated_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11)
                RETURNING id
            `,
        [
          cleanConfigData.providerId,
          cleanConfigData.providerName,
          cleanConfigData.providerType,
          cleanConfigData.isEnabled || false,
          JSON.stringify(cleanConfigData.configData || {}),
          encryptedSecrets,
          cleanConfigData.scopes || [],
          JSON.stringify(cleanConfigData.buttonConfig || {}),
          JSON.stringify(cleanConfigData.rateLimits || {}),
          JSON.stringify(cleanConfigData.metadata || {}),
          cleanConfigData.createdBy || null,
        ]
      );

      const providerId = result.rows[0].id;

      // Add to in-memory cache
      this.providers.set(cleanConfigData.providerId, {
        id: providerId,
        ...cleanConfigData,
        secrets: secrets || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Auth provider configuration created:', {
        providerId: cleanConfigData.providerId,
        providerName: cleanConfigData.providerName,
      });

      return providerId;
    } catch (error) {
      logger.error('Failed to create provider configuration:', error);
      throw error;
    }
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(providerId, updates) {
    try {
      const existingConfig = this.providers.get(providerId);
      if (!existingConfig) {
        throw new Error('Provider configuration not found');
      }

      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.providerName) {
        setClause.push(`provider_name = $${paramIndex++}`);
        values.push(updates.providerName);
      }
      if (updates.isEnabled !== undefined) {
        setClause.push(`is_enabled = $${paramIndex++}`);
        values.push(updates.isEnabled);
      }
      if (updates.configData) {
        setClause.push(`config_data = $${paramIndex++}`);
        values.push(JSON.stringify(updates.configData));
      }
      if (updates.secrets) {
        setClause.push(`encrypted_secrets = $${paramIndex++}`);
        values.push(this.encryptSecrets(updates.secrets));
      }
      if (updates.scopes) {
        setClause.push(`scopes = $${paramIndex++}`);
        values.push(updates.scopes);
      }
      if (updates.buttonConfig) {
        setClause.push(`button_config = $${paramIndex++}`);
        values.push(JSON.stringify(updates.buttonConfig));
      }
      if (updates.rateLimits) {
        setClause.push(`rate_limits = $${paramIndex++}`);
        values.push(JSON.stringify(updates.rateLimits));
      }
      if (updates.metadata) {
        setClause.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updates.metadata));
      }
      if (updates.updatedBy) {
        setClause.push(`updated_by = $${paramIndex++}`);
        values.push(updates.updatedBy);
      }

      setClause.push(`updated_at = NOW()`);
      values.push(providerId);

      await this.db.query(
        `
                UPDATE auth_provider_configs 
                SET ${setClause.join(', ')} 
                WHERE provider_id = $${paramIndex}
            `,
        values
      );

      // Update in-memory cache
      this.providers.set(providerId, {
        ...existingConfig,
        ...updates,
        updatedAt: new Date(),
      });

      logger.info('Auth provider configuration updated:', {
        providerId,
        updates: Object.keys(updates),
      });

      return true;
    } catch (error) {
      logger.error('Failed to update provider configuration:', error);
      throw error;
    }
  }

  /**
   * Delete provider configuration
   */
  async deleteProviderConfig(providerId) {
    try {
      await this.db.query('DELETE FROM auth_provider_configs WHERE provider_id = $1', [providerId]);
      this.providers.delete(providerId);

      logger.info('Auth provider configuration deleted:', { providerId });
    } catch (error) {
      logger.error('Failed to delete provider configuration:', error);
      throw error;
    }
  }

  /**
   * Enable provider
   */
  async enableProvider(providerId) {
    try {
      const config = this.providers.get(providerId);
      if (!config) {
        throw new Error('Provider configuration not found');
      }

      // Validate that required secrets are present
      const requiredSecrets = this.getRequiredSecrets(config.providerType, providerId);
      const missingSecrets = requiredSecrets.filter(secret => !config.secrets[secret]);

      if (missingSecrets.length > 0) {
        throw new Error(`Missing required secrets: ${missingSecrets.join(', ')}`);
      }

      await this.updateProviderConfig(providerId, { isEnabled: true });

      logger.info('Auth provider enabled:', { providerId });
    } catch (error) {
      logger.error('Failed to enable provider:', error);
      throw error;
    }
  }

  /**
   * Disable provider
   */
  async disableProvider(providerId) {
    try {
      await this.updateProviderConfig(providerId, { isEnabled: false });

      logger.info('Auth provider disabled:', { providerId });
    } catch (error) {
      logger.error('Failed to disable provider:', error);
      throw error;
    }
  }

  /**
   * Get required secrets for a provider type
   */
  getRequiredSecrets(providerType, providerId) {
    const secretsMap = {
      oauth: ['clientId', 'clientSecret'],
      email: [],
    };

    // Special cases
    if (providerId === 'apple.com') {
      return ['clientId', 'teamId', 'keyId', 'privateKey'];
    }

    return secretsMap[providerType] || [];
  }

  /**
   * Test provider configuration
   */
  async testProviderConfig(providerId) {
    try {
      const config = this.providers.get(providerId);
      if (!config) {
        throw new Error('Provider configuration not found');
      }

      const testResults = {
        providerId,
        providerName: config.providerName,
        tests: [],
      };

      // Test 1: Check if required secrets are present
      const requiredSecrets = this.getRequiredSecrets(config.providerType, providerId);
      const missingSecrets = requiredSecrets.filter(secret => !config.secrets[secret]);

      testResults.tests.push({
        name: 'Required Secrets',
        passed: missingSecrets.length === 0,
        message:
          missingSecrets.length === 0
            ? 'All required secrets are present'
            : `Missing secrets: ${missingSecrets.join(', ')}`,
      });

      // Test 2: Check OAuth URLs (for OAuth providers)
      if (config.providerType === 'oauth') {
        const requiredUrls = ['authUrl', 'tokenUrl'];
        const missingUrls = requiredUrls.filter(url => !config.configData[url]);

        testResults.tests.push({
          name: 'OAuth URLs',
          passed: missingUrls.length === 0,
          message:
            missingUrls.length === 0
              ? 'All required OAuth URLs are configured'
              : `Missing URLs: ${missingUrls.join(', ')}`,
        });
      }

      // Test 3: Validate scopes
      testResults.tests.push({
        name: 'Scopes Configuration',
        passed: Array.isArray(config.scopes) && config.scopes.length > 0,
        message:
          Array.isArray(config.scopes) && config.scopes.length > 0
            ? `Scopes configured: ${config.scopes.join(', ')}`
            : 'No scopes configured',
      });

      // Test 4: Button configuration
      const hasButtonConfig =
        config.buttonConfig && config.buttonConfig.text && config.buttonConfig.backgroundColor;

      testResults.tests.push({
        name: 'Button Configuration',
        passed: hasButtonConfig,
        message: hasButtonConfig
          ? 'Button configuration is complete'
          : 'Button configuration is incomplete',
      });

      const passedTests = testResults.tests.filter(test => test.passed).length;
      const totalTests = testResults.tests.length;

      return {
        ...testResults,
        overallResult: passedTests === totalTests ? 'PASS' : 'FAIL',
        score: `${passedTests}/${totalTests}`,
        ready: passedTests === totalTests && !missingSecrets.length,
      };
    } catch (error) {
      logger.error('Failed to test provider configuration:', error);
      throw error;
    }
  }

  /**
   * Get client configuration for frontend (without secrets)
   */
  getClientConfiguration(providerId) {
    const config = this.providers.get(providerId);
    if (!config || !config.isEnabled) {
      return null;
    }

    return {
      providerId: config.providerId,
      providerName: config.providerName,
      providerType: config.providerType,
      scopes: config.scopes,
      buttonConfig: config.buttonConfig,
      rateLimits: {
        requestsPerMinute: config.rateLimits.requestsPerMinute,
      },
      // Only include non-sensitive config data
      authUrl: config.configData.authUrl,
      responseType: config.configData.responseType,
    };
  }

  /**
   * Get all enabled providers for frontend
   */
  getEnabledProvidersForClient() {
    const enabledProviders = [];

    for (const [providerId, config] of this.providers.entries()) {
      if (config.isEnabled) {
        const clientConfig = this.getClientConfiguration(providerId);
        if (clientConfig) {
          enabledProviders.push(clientConfig);
        }
      }
    }

    return enabledProviders;
  }

  /**
   * Get provider configuration (admin only - includes secrets)
   */
  getProviderConfiguration(providerId) {
    return this.providers.get(providerId);
  }

  /**
   * Get all provider configurations (admin only)
   */
  getAllProviderConfigurations() {
    return Array.from(this.providers.values());
  }

  /**
   * Import provider configuration from file
   */
  async importProviderConfig(configData) {
    try {
      // Validate configuration data
      if (!configData.providerId || !configData.providerName || !configData.providerType) {
        throw new Error('Invalid configuration data: missing required fields');
      }

      // Check if provider already exists
      if (this.providers.has(configData.providerId)) {
        throw new Error('Provider configuration already exists');
      }

      await this.createProviderConfig(configData);

      logger.info('Provider configuration imported:', {
        providerId: configData.providerId,
      });
    } catch (error) {
      logger.error('Failed to import provider configuration:', error);
      throw error;
    }
  }

  /**
   * Export provider configuration
   */
  exportProviderConfig(providerId, includeSecrets = false) {
    const config = this.providers.get(providerId);
    if (!config) {
      throw new Error('Provider configuration not found');
    }

    const exportData = {
      providerId: config.providerId,
      providerName: config.providerName,
      providerType: config.providerType,
      configData: config.configData,
      scopes: config.scopes,
      buttonConfig: config.buttonConfig,
      rateLimits: config.rateLimits,
      metadata: config.metadata,
    };

    if (includeSecrets) {
      exportData.secrets = config.secrets;
    }

    return exportData;
  }

  /**
   * Encrypt secrets
   */
  encryptSecrets(secrets) {
    try {
      const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
      let encrypted = cipher.update(JSON.stringify(secrets), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return Buffer.from(encrypted, 'hex');
    } catch (error) {
      logger.error('Failed to encrypt secrets:', error);
      throw error;
    }
  }

  /**
   * Decrypt secrets
   */
  decryptSecrets(encryptedBuffer) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(encryptedBuffer.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Failed to decrypt secrets:', error);
      throw error;
    }
  }

  /**
   * Generate provider statistics
   */
  async getProviderStatistics() {
    try {
      const stats = {
        totalProviders: this.providers.size,
        enabledProviders: 0,
        providerTypes: {},
        usage: {},
      };

      // Get basic stats
      for (const [providerId, config] of this.providers.entries()) {
        if (config.isEnabled) {
          stats.enabledProviders++;
        }

        // Count by type
        stats.providerTypes[config.providerType] =
          (stats.providerTypes[config.providerType] || 0) + 1;
      }

      // Get usage statistics from auth events
      const usageResult = await this.db.query(`
                SELECT provider, COUNT(*) as usage_count
                FROM user_auth_events 
                WHERE event_type IN ('login_success', 'user_registration') 
                  AND created_at >= NOW() - INTERVAL '30 days'
                  AND provider IS NOT NULL
                GROUP BY provider
                ORDER BY usage_count DESC
            `);

      usageResult.rows.forEach(row => {
        stats.usage[row.provider] = parseInt(row.usage_count);
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get provider statistics:', error);
      throw error;
    }
  }
}

export default AuthProviderConfigService;
