import { logger } from '../config/logger.js';

class TenantController {
  constructor(tenantService) {
    this.tenantService = tenantService;
  }

  /**
   * Get all tenants
   */
  async getAllTenants(req, res) {
    try {
      const { page = 1, limit = 10, search, status } = req.query;
      const offset = (page - 1) * limit;

      let tenants = this.tenantService.getAllTenants();

      // Apply filters
      if (search) {
        tenants = tenants.filter(
          tenant =>
            tenant.name.toLowerCase().includes(search.toLowerCase()) ||
            tenant.displayName.toLowerCase().includes(search.toLowerCase()) ||
            tenant.tenantId.toLowerCase().includes(search.toLowerCase())
        );
      }

      if (status) {
        tenants = tenants.filter(tenant => tenant.status === status);
      }

      // Apply pagination
      const total = tenants.length;
      const paginatedTenants = tenants.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          tenants: paginatedTenants,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
            hasNext: offset + limit < total,
            hasPrev: page > 1,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get tenants:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tenants',
        code: 'FETCH_TENANTS_ERROR',
      });
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const tenant = this.tenantService.getTenant(tenantId);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { tenant },
      });
    } catch (error) {
      logger.error('Failed to get tenant:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tenant',
        code: 'FETCH_TENANT_ERROR',
      });
    }
  }

  /**
   * Create new tenant
   */
  async createTenant(req, res) {
    try {
      const tenantData = {
        ...req.body,
        createdBy: req.admin?.id,
      };

      const result = await this.tenantService.createTenant(tenantData);

      res.status(201).json({
        success: true,
        message: 'Tenant created successfully',
        data: {
          tenantId: result.tenantId,
          apiKey: result.apiKey,
          firebaseTenantId: result.firebaseTenantId,
        },
      });
    } catch (error) {
      logger.error('Failed to create tenant:', error);

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: error.message,
          code: 'TENANT_EXISTS',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create tenant',
        code: 'CREATE_TENANT_ERROR',
      });
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const updates = {
        ...req.body,
        updatedBy: req.admin?.id,
      };

      await this.tenantService.updateTenant(tenantId, updates);

      const updatedTenant = this.tenantService.getTenant(tenantId);

      res.json({
        success: true,
        message: 'Tenant updated successfully',
        data: { tenant: updatedTenant },
      });
    } catch (error) {
      logger.error('Failed to update tenant:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TENANT_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update tenant',
        code: 'UPDATE_TENANT_ERROR',
      });
    }
  }

  /**
   * Delete tenant
   */
  async deleteTenant(req, res) {
    try {
      const { tenantId } = req.params;

      await this.tenantService.deleteTenant(tenantId);

      res.json({
        success: true,
        message: 'Tenant deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete tenant:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TENANT_NOT_FOUND',
        });
      }

      if (error.message.includes('Cannot delete')) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'TENANT_DELETE_RESTRICTED',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete tenant',
        code: 'DELETE_TENANT_ERROR',
      });
    }
  }

  /**
   * Get tenant statistics
   */
  async getTenantStatistics(req, res) {
    try {
      const { tenantId } = req.params;

      const stats = await this.tenantService.getTenantStatistics(tenantId);

      res.json({
        success: true,
        data: { statistics: stats },
      });
    } catch (error) {
      logger.error('Failed to get tenant statistics:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TENANT_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tenant statistics',
        code: 'FETCH_STATS_ERROR',
      });
    }
  }

  /**
   * Get tenant users
   */
  async getTenantUsers(req, res) {
    try {
      const { tenantId } = req.params;
      const { page = 1, limit = 50, role, search } = req.query;
      const offset = (page - 1) * limit;

      const options = {
        limit: parseInt(limit),
        offset,
        role,
        search,
      };

      const result = await this.tenantService.getTenantUsers(tenantId, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get tenant users:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tenant users',
        code: 'FETCH_TENANT_USERS_ERROR',
      });
    }
  }

  /**
   * Add user to tenant
   */
  async addUserToTenant(req, res) {
    try {
      const { tenantId } = req.params;
      const { userId, role = 'user', permissions = [] } = req.body;

      await this.tenantService.addUserToTenant(tenantId, userId, role, permissions);

      res.status(201).json({
        success: true,
        message: 'User added to tenant successfully',
      });
    } catch (error) {
      logger.error('Failed to add user to tenant:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TENANT_NOT_FOUND',
        });
      }

      if (error.message.includes('limit reached')) {
        return res.status(429).json({
          success: false,
          error: error.message,
          code: 'USER_LIMIT_EXCEEDED',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to add user to tenant',
        code: 'ADD_USER_ERROR',
      });
    }
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(req, res) {
    try {
      const { tenantId, userId } = req.params;

      await this.tenantService.removeUserFromTenant(tenantId, userId);

      res.json({
        success: true,
        message: 'User removed from tenant successfully',
      });
    } catch (error) {
      logger.error('Failed to remove user from tenant:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to remove user from tenant',
        code: 'REMOVE_USER_ERROR',
      });
    }
  }

  /**
   * Get user's tenants
   */
  async getUserTenants(req, res) {
    try {
      const { userId } = req.params;

      const tenants = await this.tenantService.getUserTenants(userId);

      res.json({
        success: true,
        data: { tenants },
      });
    } catch (error) {
      logger.error('Failed to get user tenants:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user tenants',
        code: 'FETCH_USER_TENANTS_ERROR',
      });
    }
  }

  /**
   * Generate API key for tenant
   */
  async generateApiKey(req, res) {
    try {
      const { tenantId } = req.params;
      const { keyName, permissions = [], expiresAt } = req.body;

      const result = await this.tenantService.generateTenantApiKey(
        tenantId,
        keyName,
        permissions,
        expiresAt ? new Date(expiresAt) : null
      );

      res.status(201).json({
        success: true,
        message: 'API key generated successfully',
        data: {
          apiKey: result.apiKey,
          keyPrefix: result.keyPrefix,
          permissions: result.permissions,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      logger.error('Failed to generate API key:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TENANT_NOT_FOUND',
        });
      }

      if (error.message.includes('limit reached')) {
        return res.status(429).json({
          success: false,
          error: error.message,
          code: 'API_KEY_LIMIT_EXCEEDED',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to generate API key',
        code: 'GENERATE_API_KEY_ERROR',
      });
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(req, res) {
    try {
      const { apiKey } = req.body;

      const validation = await this.tenantService.validateTenantApiKey(apiKey);

      res.json({
        success: true,
        data: {
          valid: validation.valid,
          ...(validation.valid && {
            tenantId: validation.tenantId,
            permissions: validation.permissions,
          }),
          ...(!validation.valid && {
            error: validation.error,
          }),
        },
      });
    } catch (error) {
      logger.error('Failed to validate API key:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate API key',
        code: 'VALIDATE_API_KEY_ERROR',
      });
    }
  }

  /**
   * Get tenant by domain
   */
  async getTenantByDomain(req, res) {
    try {
      const { domain } = req.params;

      const tenant = this.tenantService.getTenantByDomain(domain);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant not found for domain',
          code: 'TENANT_NOT_FOUND',
        });
      }

      // Return limited tenant info for domain lookup
      res.json({
        success: true,
        data: {
          tenant: {
            tenantId: tenant.tenantId,
            name: tenant.name,
            displayName: tenant.displayName,
            domain: tenant.domain,
            subdomain: tenant.subdomain,
            branding: tenant.branding,
            settings: tenant.settings,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get tenant by domain:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tenant by domain',
        code: 'FETCH_TENANT_BY_DOMAIN_ERROR',
      });
    }
  }

  /**
   * Check tenant limits
   */
  async checkTenantLimits(req, res) {
    try {
      const { tenantId } = req.params;
      const { limitType, currentUsage } = req.query;

      const limitCheck = this.tenantService.checkTenantLimits(
        tenantId,
        limitType,
        parseInt(currentUsage) || 0
      );

      res.json({
        success: true,
        data: { limitCheck },
      });
    } catch (error) {
      logger.error('Failed to check tenant limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check tenant limits',
        code: 'CHECK_LIMITS_ERROR',
      });
    }
  }

  /**
   * Get tenant dashboard overview
   */
  async getTenantDashboard(req, res) {
    try {
      const { tenantId } = req.params;

      const [tenant, stats] = await Promise.all([
        this.tenantService.getTenant(tenantId),
        this.tenantService.getTenantStatistics(tenantId),
      ]);

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'Tenant not found',
          code: 'TENANT_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: {
          tenant: {
            ...tenant,
            // Remove sensitive information
            apiKeyHash: undefined,
            webhookSecret: undefined,
          },
          statistics: stats,
        },
      });
    } catch (error) {
      logger.error('Failed to get tenant dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve tenant dashboard',
        code: 'FETCH_DASHBOARD_ERROR',
      });
    }
  }
}

export default TenantController;
