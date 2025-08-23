import admin from 'firebase-admin';
import { logger } from '../config/logger.js';
import crypto from 'crypto';

class TenantManagementService {
  constructor(database, dynamicConfig) {
    this.db = database;
    this.dynamicConfig = dynamicConfig;
    this.adminAuth = null;
    this.tenants = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the tenant management service
   */
  async initialize() {
    try {
      if (admin.apps.length > 0) {
        this.adminAuth = admin.auth();
      }

      await this.createTenantTables();
      await this.loadTenants();
      this.initialized = true;

      logger.info('Tenant Management Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Tenant Management Service:', error);
      throw error;
    }
  }

  /**
   * Create tenant-related database tables
   */
  async createTenantTables() {
    try {
      // Tenants table
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS tenants (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id VARCHAR(255) UNIQUE NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    display_name VARCHAR(255) NOT NULL,
                    description TEXT,
                    domain VARCHAR(255),
                    subdomain VARCHAR(100),
                    status VARCHAR(50) DEFAULT 'active',
                    settings JSONB DEFAULT '{}',
                    branding JSONB DEFAULT '{}',
                    features JSONB DEFAULT '{}',
                    limits JSONB DEFAULT '{}',
                    firebase_tenant_id VARCHAR(255),
                    api_key_hash VARCHAR(255),
                    webhook_url TEXT,
                    webhook_secret VARCHAR(255),
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_by UUID REFERENCES users(id),
                    updated_by UUID REFERENCES users(id)
                )
            `);

      // Tenant users table (for multi-tenant user isolation)
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS tenant_users (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    role VARCHAR(100) DEFAULT 'user',
                    permissions JSONB DEFAULT '[]',
                    status VARCHAR(50) DEFAULT 'active',
                    metadata JSONB DEFAULT '{}',
                    joined_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(tenant_id, user_id)
                )
            `);

      // Tenant API keys table
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS tenant_api_keys (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                    key_name VARCHAR(255) NOT NULL,
                    key_hash VARCHAR(255) NOT NULL,
                    key_prefix VARCHAR(50) NOT NULL,
                    permissions JSONB DEFAULT '[]',
                    last_used_at TIMESTAMP,
                    expires_at TIMESTAMP,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW(),
                    created_by UUID REFERENCES users(id)
                )
            `);

      // Tenant domains table
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS tenant_domains (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                    domain VARCHAR(255) NOT NULL,
                    domain_type VARCHAR(50) DEFAULT 'custom', -- 'custom', 'subdomain'
                    is_verified BOOLEAN DEFAULT false,
                    verification_token VARCHAR(255),
                    ssl_enabled BOOLEAN DEFAULT false,
                    redirect_urls TEXT[],
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(domain)
                )
            `);

      // Create indexes for performance
      await this.db.query(`
                CREATE INDEX IF NOT EXISTS idx_tenants_tenant_id ON tenants(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
                CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
                CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
                CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant_id ON tenant_api_keys(tenant_id);
                CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant_id ON tenant_domains(tenant_id);
            `);

      logger.info('Tenant management tables created/verified');
    } catch (error) {
      logger.error('Failed to create tenant tables:', error);
      throw error;
    }
  }

  /**
   * Load tenants from database
   */
  async loadTenants() {
    try {
      const result = await this.db.query(`
                SELECT t.*, 
                       COUNT(tu.id) as user_count,
                       COUNT(tak.id) as api_key_count
                FROM tenants t
                LEFT JOIN tenant_users tu ON t.id = tu.tenant_id AND tu.status = 'active'
                LEFT JOIN tenant_api_keys tak ON t.id = tak.tenant_id AND tak.is_active = true
                GROUP BY t.id
                ORDER BY t.created_at DESC
            `);

      this.tenants.clear();

      result.rows.forEach(tenant => {
        this.tenants.set(tenant.tenant_id, {
          id: tenant.id,
          tenantId: tenant.tenant_id,
          name: tenant.name,
          displayName: tenant.display_name,
          description: tenant.description,
          domain: tenant.domain,
          subdomain: tenant.subdomain,
          status: tenant.status,
          settings: tenant.settings || {},
          branding: tenant.branding || {},
          features: tenant.features || {},
          limits: tenant.limits || {},
          firebaseTenantId: tenant.firebase_tenant_id,
          apiKeyHash: tenant.api_key_hash,
          webhookUrl: tenant.webhook_url,
          webhookSecret: tenant.webhook_secret,
          userCount: parseInt(tenant.user_count) || 0,
          apiKeyCount: parseInt(tenant.api_key_count) || 0,
          createdAt: tenant.created_at,
          updatedAt: tenant.updated_at,
        });
      });

      // If no tenants exist, create default tenant
      if (this.tenants.size === 0) {
        await this.createDefaultTenant();
      }

      logger.info('Tenants loaded:', {
        totalTenants: this.tenants.size,
        activeTenants: Array.from(this.tenants.values()).filter(t => t.status === 'active').length,
      });
    } catch (error) {
      logger.error('Failed to load tenants:', error);
      throw error;
    }
  }

  /**
   * Create default tenant
   */
  async createDefaultTenant() {
    const defaultTenant = {
      tenantId: 'default',
      name: 'default',
      displayName: 'Default Tenant',
      description: 'Default tenant for single-tenant installations',
      domain: 'localhost',
      settings: {
        allowSignups: true,
        requireEmailVerification: false,
        sessionTimeout: 24 * 60 * 60, // 24 hours
      },
      features: {
        multipleProviders: true,
        customBranding: false,
        advancedAnalytics: false,
        sso: false,
      },
      limits: {
        maxUsers: 10000,
        maxApiKeys: 10,
        maxDomains: 5,
        rateLimit: {
          requestsPerMinute: 1000,
          requestsPerHour: 10000,
        },
      },
      status: 'active',
    };

    await this.createTenant(defaultTenant);
    logger.info('Default tenant created');
  }

  /**
   * Create a new tenant
   */
  async createTenant(tenantData) {
    try {
      // Validate tenant data
      if (!tenantData.tenantId || !tenantData.name) {
        throw new Error('Tenant ID and name are required');
      }

      // Check if tenant already exists
      if (this.tenants.has(tenantData.tenantId)) {
        throw new Error('Tenant already exists');
      }

      // Generate Firebase tenant if enabled
      let firebaseTenantId = null;
      if (this.adminAuth) {
        try {
          // Note: This would require Firebase Auth Multi-tenancy API
          // For now, we'll simulate it
          firebaseTenantId = `firebase_${tenantData.tenantId}`;
          logger.info('Firebase tenant would be created:', { firebaseTenantId });
        } catch (firebaseError) {
          logger.warn('Firebase tenant creation failed:', firebaseError.message);
        }
      }

      // Generate API key
      const apiKey = this.generateApiKey(tenantData.tenantId);
      const apiKeyHash = this.hashApiKey(apiKey);

      const result = await this.db.query(
        `
                INSERT INTO tenants (
                    tenant_id, name, display_name, description, domain, subdomain,
                    status, settings, branding, features, limits,
                    firebase_tenant_id, api_key_hash, webhook_url, webhook_secret,
                    created_at, updated_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), $16)
                RETURNING id
            `,
        [
          tenantData.tenantId,
          tenantData.name,
          tenantData.displayName || tenantData.name,
          tenantData.description || '',
          tenantData.domain || null,
          tenantData.subdomain || null,
          tenantData.status || 'active',
          JSON.stringify(tenantData.settings || {}),
          JSON.stringify(tenantData.branding || {}),
          JSON.stringify(tenantData.features || {}),
          JSON.stringify(tenantData.limits || {}),
          firebaseTenantId,
          apiKeyHash,
          tenantData.webhookUrl || null,
          tenantData.webhookSecret || null,
          tenantData.createdBy || null,
        ]
      );

      const tenantId = result.rows[0].id;

      // Add to in-memory cache
      this.tenants.set(tenantData.tenantId, {
        id: tenantId,
        ...tenantData,
        firebaseTenantId,
        apiKeyHash,
        userCount: 0,
        apiKeyCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Tenant created:', {
        tenantId: tenantData.tenantId,
        name: tenantData.name,
      });

      return {
        tenantId: tenantData.tenantId,
        apiKey: apiKey,
        firebaseTenantId,
      };
    } catch (error) {
      logger.error('Failed to create tenant:', error);
      throw error;
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId, updates) {
    try {
      const existingTenant = this.tenants.get(tenantId);
      if (!existingTenant) {
        throw new Error('Tenant not found');
      }

      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.displayName) {
        setClause.push(`display_name = $${paramIndex++}`);
        values.push(updates.displayName);
      }
      if (updates.description !== undefined) {
        setClause.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.domain) {
        setClause.push(`domain = $${paramIndex++}`);
        values.push(updates.domain);
      }
      if (updates.subdomain) {
        setClause.push(`subdomain = $${paramIndex++}`);
        values.push(updates.subdomain);
      }
      if (updates.status) {
        setClause.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.settings) {
        setClause.push(`settings = $${paramIndex++}`);
        values.push(JSON.stringify(updates.settings));
      }
      if (updates.branding) {
        setClause.push(`branding = $${paramIndex++}`);
        values.push(JSON.stringify(updates.branding));
      }
      if (updates.features) {
        setClause.push(`features = $${paramIndex++}`);
        values.push(JSON.stringify(updates.features));
      }
      if (updates.limits) {
        setClause.push(`limits = $${paramIndex++}`);
        values.push(JSON.stringify(updates.limits));
      }
      if (updates.webhookUrl !== undefined) {
        setClause.push(`webhook_url = $${paramIndex++}`);
        values.push(updates.webhookUrl);
      }
      if (updates.webhookSecret !== undefined) {
        setClause.push(`webhook_secret = $${paramIndex++}`);
        values.push(updates.webhookSecret);
      }
      if (updates.updatedBy) {
        setClause.push(`updated_by = $${paramIndex++}`);
        values.push(updates.updatedBy);
      }

      setClause.push(`updated_at = NOW()`);
      values.push(tenantId);

      await this.db.query(
        `
                UPDATE tenants 
                SET ${setClause.join(', ')} 
                WHERE tenant_id = $${paramIndex}
            `,
        values
      );

      // Update in-memory cache
      this.tenants.set(tenantId, {
        ...existingTenant,
        ...updates,
        updatedAt: new Date(),
      });

      logger.info('Tenant updated:', {
        tenantId,
        updates: Object.keys(updates),
      });
    } catch (error) {
      logger.error('Failed to update tenant:', error);
      throw error;
    }
  }

  /**
   * Delete tenant
   */
  async deleteTenant(tenantId) {
    try {
      const tenant = this.tenants.get(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Don't allow deleting default tenant
      if (tenantId === 'default') {
        throw new Error('Cannot delete default tenant');
      }

      // Check if tenant has users
      if (tenant.userCount > 0) {
        throw new Error('Cannot delete tenant with active users');
      }

      await this.db.query('DELETE FROM tenants WHERE tenant_id = $1', [tenantId]);
      this.tenants.delete(tenantId);

      // Delete Firebase tenant if exists
      if (tenant.firebaseTenantId && this.adminAuth) {
        try {
          // Note: This would use Firebase Multi-tenancy API
          logger.info('Firebase tenant would be deleted:', {
            firebaseTenantId: tenant.firebaseTenantId,
          });
        } catch (firebaseError) {
          logger.warn('Firebase tenant deletion failed:', firebaseError.message);
        }
      }

      logger.info('Tenant deleted:', { tenantId });
    } catch (error) {
      logger.error('Failed to delete tenant:', error);
      throw error;
    }
  }

  /**
   * Add user to tenant
   */
  async addUserToTenant(tenantId, userId, role = 'user', permissions = []) {
    try {
      const tenant = this.tenants.get(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Check tenant user limits
      if (tenant.limits.maxUsers && tenant.userCount >= tenant.limits.maxUsers) {
        throw new Error('Tenant user limit reached');
      }

      await this.db.query(
        `
                INSERT INTO tenant_users (tenant_id, user_id, role, permissions, status, joined_at)
                VALUES (
                    (SELECT id FROM tenants WHERE tenant_id = $1),
                    $2, $3, $4, 'active', NOW()
                )
                ON CONFLICT (tenant_id, user_id) 
                DO UPDATE SET role = $3, permissions = $4, status = 'active'
            `,
        [tenantId, userId, role, JSON.stringify(permissions)]
      );

      // Update tenant user count
      this.tenants.get(tenantId).userCount++;

      logger.info('User added to tenant:', {
        tenantId,
        userId,
        role,
      });
    } catch (error) {
      logger.error('Failed to add user to tenant:', error);
      throw error;
    }
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(tenantId, userId) {
    try {
      await this.db.query(
        `
                DELETE FROM tenant_users 
                WHERE tenant_id = (SELECT id FROM tenants WHERE tenant_id = $1) 
                  AND user_id = $2
            `,
        [tenantId, userId]
      );

      // Update tenant user count
      const tenant = this.tenants.get(tenantId);
      if (tenant) {
        tenant.userCount = Math.max(0, tenant.userCount - 1);
      }

      logger.info('User removed from tenant:', {
        tenantId,
        userId,
      });
    } catch (error) {
      logger.error('Failed to remove user from tenant:', error);
      throw error;
    }
  }

  /**
   * Get user's tenants
   */
  async getUserTenants(userId) {
    try {
      const result = await this.db.query(
        `
                SELECT t.tenant_id, t.name, t.display_name, tu.role, tu.permissions, tu.joined_at
                FROM tenant_users tu
                JOIN tenants t ON tu.tenant_id = t.id
                WHERE tu.user_id = $1 AND tu.status = 'active' AND t.status = 'active'
                ORDER BY tu.joined_at DESC
            `,
        [userId]
      );

      return result.rows.map(row => ({
        tenantId: row.tenant_id,
        name: row.name,
        displayName: row.display_name,
        role: row.role,
        permissions: row.permissions || [],
        joinedAt: row.joined_at,
      }));
    } catch (error) {
      logger.error('Failed to get user tenants:', error);
      throw error;
    }
  }

  /**
   * Get tenant users
   */
  async getTenantUsers(tenantId, options = {}) {
    try {
      const { limit = 50, offset = 0, role = null, search = null } = options;

      let whereClause =
        "tu.tenant_id = (SELECT id FROM tenants WHERE tenant_id = $1) AND tu.status = 'active'";
      const values = [tenantId];
      let paramIndex = 2;

      if (role) {
        whereClause += ` AND tu.role = $${paramIndex++}`;
        values.push(role);
      }

      if (search) {
        whereClause += ` AND (u.name ILIKE $${paramIndex++} OR u.email ILIKE $${paramIndex++})`;
        values.push(`%${search}%`, `%${search}%`);
      }

      const result = await this.db.query(
        `
                SELECT u.id, u.email, u.name, u.avatar_url, u.is_verified,
                       tu.role, tu.permissions, tu.joined_at, tu.metadata,
                       u.last_login, u.created_at
                FROM tenant_users tu
                JOIN users u ON tu.user_id = u.id
                WHERE ${whereClause}
                ORDER BY tu.joined_at DESC
                LIMIT $${paramIndex++} OFFSET $${paramIndex++}
            `,
        [...values, limit, offset]
      );

      const countResult = await this.db.query(
        `
                SELECT COUNT(*) as total
                FROM tenant_users tu
                JOIN users u ON tu.user_id = u.id
                WHERE ${whereClause}
            `,
        values
      );

      return {
        users: result.rows.map(row => ({
          id: row.id,
          email: row.email,
          name: row.name,
          avatarUrl: row.avatar_url,
          isVerified: row.is_verified,
          role: row.role,
          permissions: row.permissions || [],
          joinedAt: row.joined_at,
          metadata: row.metadata || {},
          lastLogin: row.last_login,
          createdAt: row.created_at,
        })),
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit,
          offset,
          hasMore: parseInt(countResult.rows[0].total) > offset + limit,
        },
      };
    } catch (error) {
      logger.error('Failed to get tenant users:', error);
      throw error;
    }
  }

  /**
   * Generate API key for tenant
   */
  async generateTenantApiKey(tenantId, keyName, permissions = [], expiresAt = null) {
    try {
      const tenant = this.tenants.get(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Check API key limits
      if (tenant.limits.maxApiKeys && tenant.apiKeyCount >= tenant.limits.maxApiKeys) {
        throw new Error('Tenant API key limit reached');
      }

      const apiKey = this.generateApiKey(tenantId);
      const keyHash = this.hashApiKey(apiKey);
      const keyPrefix = apiKey.substring(0, 8);

      await this.db.query(
        `
                INSERT INTO tenant_api_keys (
                    tenant_id, key_name, key_hash, key_prefix, permissions, 
                    expires_at, is_active, created_at
                ) VALUES (
                    (SELECT id FROM tenants WHERE tenant_id = $1),
                    $2, $3, $4, $5, $6, true, NOW()
                )
            `,
        [tenantId, keyName, keyHash, keyPrefix, JSON.stringify(permissions), expiresAt]
      );

      // Update tenant API key count
      this.tenants.get(tenantId).apiKeyCount++;

      logger.info('Tenant API key generated:', {
        tenantId,
        keyName,
        keyPrefix,
      });

      return {
        apiKey,
        keyPrefix,
        permissions,
        expiresAt,
      };
    } catch (error) {
      logger.error('Failed to generate tenant API key:', error);
      throw error;
    }
  }

  /**
   * Validate tenant API key
   */
  async validateTenantApiKey(apiKey) {
    try {
      const keyHash = this.hashApiKey(apiKey);

      const result = await this.db.query(
        `
                SELECT tak.*, t.tenant_id, t.status as tenant_status,
                       t.limits, t.settings
                FROM tenant_api_keys tak
                JOIN tenants t ON tak.tenant_id = t.id
                WHERE tak.key_hash = $1 
                  AND tak.is_active = true 
                  AND (tak.expires_at IS NULL OR tak.expires_at > NOW())
                  AND t.status = 'active'
            `,
        [keyHash]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: 'Invalid or expired API key' };
      }

      const keyData = result.rows[0];

      // Update last used timestamp
      await this.db.query(
        `
                UPDATE tenant_api_keys 
                SET last_used_at = NOW() 
                WHERE id = $1
            `,
        [keyData.id]
      );

      return {
        valid: true,
        tenantId: keyData.tenant_id,
        permissions: keyData.permissions || [],
        limits: keyData.limits || {},
        settings: keyData.settings || {},
      };
    } catch (error) {
      logger.error('Failed to validate tenant API key:', error);
      return { valid: false, error: 'API key validation failed' };
    }
  }

  /**
   * Get tenant by ID
   */
  getTenant(tenantId) {
    return this.tenants.get(tenantId);
  }

  /**
   * Get all tenants
   */
  getAllTenants() {
    return Array.from(this.tenants.values());
  }

  /**
   * Get tenant statistics
   */
  async getTenantStatistics(tenantId) {
    try {
      const tenant = this.tenants.get(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      const [usersResult, authEventsResult, activeSessionsResult] = await Promise.all([
        this.db.query(
          `
                    SELECT COUNT(*) as total_users,
                           COUNT(CASE WHEN tu.status = 'active' THEN 1 END) as active_users,
                           COUNT(CASE WHEN u.created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d
                    FROM tenant_users tu
                    JOIN users u ON tu.user_id = u.id
                    WHERE tu.tenant_id = (SELECT id FROM tenants WHERE tenant_id = $1)
                `,
          [tenantId]
        ),

        this.db.query(
          `
                    SELECT COUNT(*) as total_events,
                           COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as events_24h,
                           COUNT(CASE WHEN event_type = 'login_success' AND created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as logins_24h
                    FROM user_auth_events uae
                    JOIN tenant_users tu ON uae.user_id = tu.user_id
                    WHERE tu.tenant_id = (SELECT id FROM tenants WHERE tenant_id = $1)
                `,
          [tenantId]
        ),

        this.db.query(
          `
                    SELECT COUNT(*) as active_sessions
                    FROM user_sessions us
                    JOIN tenant_users tu ON us.user_id = tu.user_id
                    WHERE tu.tenant_id = (SELECT id FROM tenants WHERE tenant_id = $1)
                      AND us.is_active = true
                      AND us.expires_at > NOW()
                `,
          [tenantId]
        ),
      ]);

      return {
        tenantId,
        users: {
          total: parseInt(usersResult.rows[0].total_users),
          active: parseInt(usersResult.rows[0].active_users),
          newLast30Days: parseInt(usersResult.rows[0].new_users_30d),
        },
        events: {
          total: parseInt(authEventsResult.rows[0].total_events),
          last24Hours: parseInt(authEventsResult.rows[0].events_24h),
          loginsLast24Hours: parseInt(authEventsResult.rows[0].logins_24h),
        },
        sessions: {
          active: parseInt(activeSessionsResult.rows[0].active_sessions),
        },
        limits: tenant.limits,
        usage: {
          userLimitUsage: tenant.limits.maxUsers
            ? (tenant.userCount / tenant.limits.maxUsers) * 100
            : 0,
          apiKeyLimitUsage: tenant.limits.maxApiKeys
            ? (tenant.apiKeyCount / tenant.limits.maxApiKeys) * 100
            : 0,
        },
      };
    } catch (error) {
      logger.error('Failed to get tenant statistics:', error);
      throw error;
    }
  }

  /**
   * Generate API key
   */
  generateApiKey(tenantId) {
    const prefix = tenantId.substring(0, 4);
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${randomBytes}`;
  }

  /**
   * Hash API key
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Check tenant limits
   */
  checkTenantLimits(tenantId, limitType, currentUsage) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant || !tenant.limits[limitType]) {
      return { withinLimit: true };
    }

    const limit = tenant.limits[limitType];
    const withinLimit = currentUsage < limit;

    return {
      withinLimit,
      limit,
      currentUsage,
      remainingUsage: withinLimit ? limit - currentUsage : 0,
    };
  }

  /**
   * Get tenant by domain
   */
  getTenantByDomain(domain) {
    for (const [tenantId, tenant] of this.tenants.entries()) {
      if (tenant.domain === domain || tenant.subdomain === domain) {
        return tenant;
      }
    }
    return null;
  }
}

export default TenantManagementService;
