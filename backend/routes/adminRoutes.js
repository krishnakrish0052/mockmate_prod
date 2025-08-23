import express from 'express';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import {
  createRateLimit,
  handleApiError,
  handleValidationErrors,
  logRequest,
  validateApiKeyGeneration,
  validateAuthProvider,
  validateDateRange,
  validatePagination,
  validateRulesDeployment,
  validateRulesTemplate,
  validateTenantCreation,
  validateTenantUpdate,
  validateUserToTenant,
} from '../middleware/validationMiddleware.js';

// Import Controllers
import TenantController from '../controllers/tenantController.js';
import FirebaseRulesController from '../controllers/firebaseRulesController.js';
import AuthProviderController from '../controllers/authProviderController.js';
import AdminDashboardController from '../controllers/adminDashboardController.js';

// Import Services
import TenantManagementService from '../services/TenantManagementService.js';
import FirebaseRulesIntegrationService from '../services/FirebaseRulesIntegrationService.js';
import AuthProviderConfigService from '../services/AuthProviderConfigService.js';

const router = express.Router();

// Apply middleware to all admin routes
router.use(logRequest);
router.use(requireAdmin);
router.use(createRateLimit(15 * 60 * 1000, 500)); // 500 requests per 15 minutes for admin

// Initialize Services and Controllers
const createAdminRouter = (database, dynamicConfig) => {
  // Initialize Services
  const tenantService = new TenantManagementService(database, dynamicConfig);
  const firebaseRulesService = new FirebaseRulesIntegrationService(database, dynamicConfig);
  const authProviderService = new AuthProviderConfigService(database, dynamicConfig);

  // Initialize Controllers
  const tenantController = new TenantController(tenantService);
  const firebaseRulesController = new FirebaseRulesController(firebaseRulesService);
  const authProviderController = new AuthProviderController(authProviderService);
  const dashboardController = new AdminDashboardController(
    tenantService,
    firebaseRulesService,
    authProviderService
  );

  // =============================================================================
  // DASHBOARD ROUTES
  // =============================================================================

  /**
   * Dashboard Overview
   */
  router.get('/dashboard', dashboardController.getDashboardOverview.bind(dashboardController));

  /**
   * Quick Stats for Widgets
   */
  router.get('/dashboard/stats', dashboardController.getQuickStats.bind(dashboardController));

  /**
   * Analytics Data
   */
  router.get(
    '/dashboard/analytics',
    validateDateRange,
    handleValidationErrors,
    dashboardController.getAnalytics.bind(dashboardController)
  );

  /**
   * Activity Feed
   */
  router.get(
    '/dashboard/activity',
    validatePagination,
    handleValidationErrors,
    dashboardController.getActivityFeed.bind(dashboardController)
  );

  /**
   * System Status and Health
   */
  router.get('/system/status', dashboardController.getSystemStatus.bind(dashboardController));

  // =============================================================================
  // TENANT MANAGEMENT ROUTES
  // =============================================================================

  /**
   * Tenant CRUD Operations
   */
  router.get(
    '/tenants',
    validatePagination,
    handleValidationErrors,
    tenantController.getAllTenants.bind(tenantController)
  );

  router.get('/tenants/:tenantId', tenantController.getTenant.bind(tenantController));

  router.post(
    '/tenants',
    validateTenantCreation,
    handleValidationErrors,
    tenantController.createTenant.bind(tenantController)
  );

  router.put(
    '/tenants/:tenantId',
    validateTenantUpdate,
    handleValidationErrors,
    tenantController.updateTenant.bind(tenantController)
  );

  router.delete('/tenants/:tenantId', tenantController.deleteTenant.bind(tenantController));

  /**
   * Tenant Statistics and Dashboard
   */
  router.get(
    '/tenants/:tenantId/stats',
    tenantController.getTenantStatistics.bind(tenantController)
  );

  router.get(
    '/tenants/:tenantId/dashboard',
    tenantController.getTenantDashboard.bind(tenantController)
  );

  /**
   * Tenant User Management
   */
  router.get(
    '/tenants/:tenantId/users',
    validatePagination,
    handleValidationErrors,
    tenantController.getTenantUsers.bind(tenantController)
  );

  router.post(
    '/tenants/:tenantId/users',
    validateUserToTenant,
    handleValidationErrors,
    tenantController.addUserToTenant.bind(tenantController)
  );

  router.delete(
    '/tenants/:tenantId/users/:userId',
    tenantController.removeUserFromTenant.bind(tenantController)
  );

  router.get('/users/:userId/tenants', tenantController.getUserTenants.bind(tenantController));

  /**
   * Tenant API Key Management
   */
  router.post(
    '/tenants/:tenantId/api-keys',
    validateApiKeyGeneration,
    handleValidationErrors,
    tenantController.generateApiKey.bind(tenantController)
  );

  router.post('/tenants/api-keys/validate', tenantController.validateApiKey.bind(tenantController));

  /**
   * Domain-based Tenant Lookup
   */
  router.get(
    '/tenants/by-domain/:domain',
    tenantController.getTenantByDomain.bind(tenantController)
  );

  /**
   * Tenant Limits
   */
  router.get(
    '/tenants/:tenantId/limits',
    tenantController.checkTenantLimits.bind(tenantController)
  );

  // =============================================================================
  // FIREBASE RULES MANAGEMENT ROUTES
  // =============================================================================

  /**
   * Rules Templates CRUD
   */
  router.get(
    '/firebase-rules/templates',
    validatePagination,
    handleValidationErrors,
    firebaseRulesController.getAllRulesTemplates.bind(firebaseRulesController)
  );

  router.get(
    '/firebase-rules/templates/:templateId',
    firebaseRulesController.getRulesTemplate.bind(firebaseRulesController)
  );

  router.post(
    '/firebase-rules/templates',
    validateRulesTemplate,
    handleValidationErrors,
    firebaseRulesController.createRulesTemplate.bind(firebaseRulesController)
  );

  router.put(
    '/firebase-rules/templates/:templateId',
    validateRulesTemplate,
    handleValidationErrors,
    firebaseRulesController.updateRulesTemplate.bind(firebaseRulesController)
  );

  router.delete(
    '/firebase-rules/templates/:templateId',
    firebaseRulesController.deleteRulesTemplate.bind(firebaseRulesController)
  );

  /**
   * Rules Template Operations
   */
  router.post(
    '/firebase-rules/templates/:templateId/test',
    firebaseRulesController.testRulesTemplate.bind(firebaseRulesController)
  );

  router.post(
    '/firebase-rules/templates/:templateId/generate',
    firebaseRulesController.generateRules.bind(firebaseRulesController)
  );

  router.post(
    '/firebase-rules/templates/:templateId/clone',
    firebaseRulesController.cloneRulesTemplate.bind(firebaseRulesController)
  );

  router.get(
    '/firebase-rules/templates/:templateId/variables',
    firebaseRulesController.getTemplateVariables.bind(firebaseRulesController)
  );

  /**
   * Rules Deployment
   */
  router.post(
    '/firebase-rules/deploy',
    validateRulesDeployment,
    handleValidationErrors,
    firebaseRulesController.deployRules.bind(firebaseRulesController)
  );

  router.post(
    '/firebase-rules/simulate',
    firebaseRulesController.simulateDeployment.bind(firebaseRulesController)
  );

  router.post(
    '/firebase-rules/validate',
    firebaseRulesController.validateRulesSyntax.bind(firebaseRulesController)
  );

  /**
   * Deployment Management
   */
  router.get(
    '/firebase-rules/deployments',
    validatePagination,
    handleValidationErrors,
    firebaseRulesController.getDeploymentHistory.bind(firebaseRulesController)
  );

  router.get(
    '/firebase-rules/deployments/:deploymentId',
    firebaseRulesController.getDeploymentStatus.bind(firebaseRulesController)
  );

  router.post(
    '/firebase-rules/deployments/:deploymentId/rollback',
    firebaseRulesController.rollbackDeployment.bind(firebaseRulesController)
  );

  /**
   * Active Rules
   */
  router.get(
    '/firebase-rules/tenants/:tenantId/active',
    firebaseRulesController.getActiveRules.bind(firebaseRulesController)
  );

  /**
   * Templates by Category
   */
  router.get(
    '/firebase-rules/categories/:category/templates',
    firebaseRulesController.getTemplatesByCategory.bind(firebaseRulesController)
  );

  // =============================================================================
  // AUTH PROVIDER MANAGEMENT ROUTES
  // =============================================================================

  /**
   * Provider Configuration CRUD
   */
  router.get(
    '/auth-providers',
    authProviderController.getAllProviders.bind(authProviderController)
  );

  router.get(
    '/auth-providers/enabled',
    authProviderController.getEnabledProviders.bind(authProviderController)
  );

  router.get(
    '/auth-providers/available',
    authProviderController.getAvailableProviders.bind(authProviderController)
  );

  router.get(
    '/auth-providers/:provider',
    authProviderController.getProvider.bind(authProviderController)
  );

  router.put(
    '/auth-providers/:provider',
    validateAuthProvider,
    handleValidationErrors,
    authProviderController.upsertProvider.bind(authProviderController)
  );

  router.delete(
    '/auth-providers/:provider',
    authProviderController.deleteProvider.bind(authProviderController)
  );

  /**
   * Provider Operations
   */
  router.post(
    '/auth-providers/:provider/enable',
    authProviderController.enableProvider.bind(authProviderController)
  );

  router.post(
    '/auth-providers/:provider/disable',
    authProviderController.disableProvider.bind(authProviderController)
  );

  router.post(
    '/auth-providers/:provider/test',
    authProviderController.testProvider.bind(authProviderController)
  );

  router.post(
    '/auth-providers/:provider/reset',
    authProviderController.resetProviderToDefaults.bind(authProviderController)
  );

  /**
   * Provider Secrets Management
   */
  router.put(
    '/auth-providers/:provider/secrets',
    authProviderController.updateProviderSecrets.bind(authProviderController)
  );

  /**
   * Provider Templates and Configuration
   */
  router.get(
    '/auth-providers/:provider/template',
    authProviderController.getProviderTemplate.bind(authProviderController)
  );

  router.post(
    '/auth-providers/:provider/validate',
    authProviderController.validateProviderConfig.bind(authProviderController)
  );

  /**
   * Provider Rate Limits
   */
  router.get(
    '/auth-providers/:provider/rate-limits',
    authProviderController.getProviderRateLimits.bind(authProviderController)
  );

  router.put(
    '/auth-providers/:provider/rate-limits',
    authProviderController.updateProviderRateLimits.bind(authProviderController)
  );

  /**
   * Provider Statistics
   */
  router.get(
    '/auth-providers/:provider/stats',
    authProviderController.getProviderStatistics.bind(authProviderController)
  );

  router.get(
    '/auth-providers/stats/overall',
    authProviderController.getOverallStatistics.bind(authProviderController)
  );

  router.get(
    '/auth-providers/dashboard',
    authProviderController.getProviderDashboard.bind(authProviderController)
  );

  /**
   * Bulk Operations
   */
  router.post(
    '/auth-providers/bulk-update',
    authProviderController.bulkUpdateProviders.bind(authProviderController)
  );

  // =============================================================================
  // HEALTH AND MONITORING ROUTES
  // =============================================================================

  /**
   * Service Health Checks
   */
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          tenantService: tenantService.initialized,
          firebaseRulesService: firebaseRulesService.initialized,
          authProviderService: authProviderService.initialized,
        },
      },
    });
  });

  /**
   * API Information
   */
  router.get('/info', (req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Firebase Admin API',
        version: '1.0.0',
        description: 'Comprehensive admin API for Firebase multi-tenant management',
        endpoints: {
          dashboard: '/admin/dashboard',
          tenants: '/admin/tenants',
          firebaseRules: '/admin/firebase-rules',
          authProviders: '/admin/auth-providers',
        },
        documentation: '/admin/docs', // Could link to API documentation
      },
    });
  });

  // =============================================================================
  // ERROR HANDLING
  // =============================================================================

  // Apply error handling middleware
  router.use(handleApiError);

  return router;
};

export default createAdminRouter;
