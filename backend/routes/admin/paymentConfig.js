import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { adminAuth, requirePermission } from '../../middleware/admin/adminAuth.js';
import { PaymentConfigAuditLog, PaymentConfiguration } from '../../models/PaymentConfiguration.js';
import { PaymentService } from '../../services/PaymentService.js';
import { PaymentHealthCheckService } from '../../services/PaymentHealthCheckService.js';
import { logger } from '../../config/logger.js';

const router = express.Router();

// Middleware to extract admin info from request
const extractAdminInfo = (req, res, next) => {
  req.adminInfo = {
    id: req.admin?.id,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    sessionId: req.sessionID,
  };
  next();
};

// Apply admin authentication and admin info extraction to all routes
router.use(adminAuth);
router.use(extractAdminInfo);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

// GET /api/admin/payment-configs - Get all payment configurations
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('provider_type')
      .optional()
      .isIn(['card', 'wallet', 'bank_transfer', 'crypto', 'buy_now_pay_later']),
    query('is_active').optional().isBoolean().toBoolean(),
    query('is_test_mode').optional().isBoolean().toBoolean(),
    query('search').optional().isString().trim(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { page = 1, limit = 20, provider_type, is_active, is_test_mode, search } = req.query;

      const offset = (page - 1) * limit;
      const filters = {};

      if (provider_type) filters.provider_type = provider_type;
      if (typeof is_active === 'boolean') filters.is_active = is_active;
      if (typeof is_test_mode === 'boolean') filters.is_test_mode = is_test_mode;

      let configs = await PaymentConfiguration.findAll(limit, offset, filters);

      // Apply text search if provided
      if (search) {
        configs = configs.filter(
          config =>
            config.provider_name.toLowerCase().includes(search.toLowerCase()) ||
            config.display_name.toLowerCase().includes(search.toLowerCase())
        );
      }

      // Get total count for pagination
      const totalConfigs = await PaymentConfiguration.count(filters);

      res.json({
        success: true,
        data: {
          configs: configs.map(config => config.toJSON()),
          pagination: {
            page,
            limit,
            total: totalConfigs,
            totalPages: Math.ceil(totalConfigs / limit),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching payment configurations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment configurations',
        error: error.message,
      });
    }
  }
);

// GET /api/admin/payment-configs/:id - Get specific payment configuration
router.get('/:id', [param('id').isUUID(), handleValidationErrors], async (req, res) => {
  try {
    const config = await PaymentConfiguration.findById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Payment configuration not found',
      });
    }

    res.json({
      success: true,
      data: config.toJSON(),
    });
  } catch (error) {
    logger.error('Error fetching payment configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment configuration',
      error: error.message,
    });
  }
});

// POST /api/admin/payment-configs - Create new payment configuration
router.post(
  '/',
  [
    body('provider_name')
      .notEmpty()
      .withMessage('Provider name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Provider name must be 2-100 characters'),
    body('provider_type')
      .isIn(['card', 'wallet', 'bank_transfer', 'crypto', 'buy_now_pay_later'])
      .withMessage('Invalid provider type'),
    body('display_name')
      .notEmpty()
      .withMessage('Display name is required')
      .isLength({ min: 2, max: 200 })
      .withMessage('Display name must be 2-200 characters'),
    body('configuration').isObject().withMessage('Configuration must be an object'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
    body('is_test_mode').optional().isBoolean().withMessage('is_test_mode must be boolean'),
    body('priority')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Priority must be between 0 and 100'),
    body('supported_currencies')
      .optional()
      .isArray()
      .withMessage('Supported currencies must be an array'),
    body('supported_countries')
      .optional()
      .isArray()
      .withMessage('Supported countries must be an array'),
    body('webhook_url').optional().isURL().withMessage('Invalid webhook URL'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const configData = {
        ...req.body,
        created_by: req.adminInfo.id,
      };

      // Validate configuration based on provider
      const validationResult = await PaymentService.validateProviderConfiguration(
        req.body.provider_name,
        req.body.configuration
      );

      if (!validationResult.valid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider configuration',
          errors: validationResult.errors,
        });
      }

      const config = await PaymentConfiguration.create(configData);

      // Log the creation
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.adminInfo.id,
        'create',
        {},
        config.toJSON(),
        req.adminInfo.ip,
        req.adminInfo.userAgent
      );

      logger.info(`Payment configuration created: ${config.provider_name}`, {
        configId: config.id,
        adminId: req.adminInfo.id,
      });

      res.status(201).json({
        success: true,
        message: 'Payment configuration created successfully',
        data: config.toJSON(),
      });
    } catch (error) {
      logger.error('Error creating payment configuration:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create payment configuration',
        error: error.message,
      });
    }
  }
);

// PUT /api/admin/payment-configs/:id - Update payment configuration
router.put(
  '/:id',
  [
    param('id').isUUID(),
    body('provider_name')
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage('Provider name must be 2-100 characters'),
    body('provider_type')
      .optional()
      .isIn(['card', 'wallet', 'bank_transfer', 'crypto', 'buy_now_pay_later'])
      .withMessage('Invalid provider type'),
    body('display_name')
      .optional()
      .isLength({ min: 2, max: 200 })
      .withMessage('Display name must be 2-200 characters'),
    body('configuration').optional().isObject().withMessage('Configuration must be an object'),
    body('is_active').optional().isBoolean().withMessage('is_active must be boolean'),
    body('is_test_mode').optional().isBoolean().withMessage('is_test_mode must be boolean'),
    body('priority')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Priority must be between 0 and 100'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const config = await PaymentConfiguration.findById(req.params.id);

      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Payment configuration not found',
        });
      }

      const oldValues = config.toJSON();

      // Validate configuration if provided
      if (req.body.configuration) {
        const providerName = req.body.provider_name || config.provider_name;
        const validationResult = await PaymentService.validateProviderConfiguration(
          providerName,
          req.body.configuration
        );

        if (!validationResult.valid) {
          return res.status(400).json({
            success: false,
            message: 'Invalid provider configuration',
            errors: validationResult.errors,
          });
        }
      }

      await config.update(req.body, req.adminInfo.id);

      // Log the update
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.adminInfo.id,
        'update',
        oldValues,
        config.toJSON(),
        req.adminInfo.ip,
        req.adminInfo.userAgent
      );

      logger.info(`Payment configuration updated: ${config.provider_name}`, {
        configId: config.id,
        adminId: req.adminInfo.id,
      });

      res.json({
        success: true,
        message: 'Payment configuration updated successfully',
        data: config.toJSON(),
      });
    } catch (error) {
      logger.error('Error updating payment configuration:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update payment configuration',
        error: error.message,
      });
    }
  }
);

// DELETE /api/admin/payment-configs/:id - Delete (deactivate) payment configuration
router.delete('/:id', [param('id').isUUID(), handleValidationErrors], async (req, res) => {
  try {
    const config = await PaymentConfiguration.findById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Payment configuration not found',
      });
    }

    const oldValues = config.toJSON();
    await config.delete(req.adminInfo.id);

    // Log the deletion
    await PaymentConfigAuditLog.logChange(
      config.id,
      req.adminInfo.id,
      'delete',
      oldValues,
      { is_active: false },
      req.adminInfo.ip,
      req.adminInfo.userAgent
    );

    logger.info(`Payment configuration deleted: ${config.provider_name}`, {
      configId: config.id,
      adminId: req.adminInfo.id,
    });

    res.json({
      success: true,
      message: 'Payment configuration deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting payment configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment configuration',
      error: error.message,
    });
  }
});

// POST /api/admin/payment-configs/:id/test - Test payment configuration
router.post(
  '/:id/test',
  [
    param('id').isUUID(),
    body('test_type')
      .optional()
      .isIn(['connectivity', 'authentication', 'full_transaction'])
      .withMessage('Invalid test type'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const config = await PaymentConfiguration.findById(req.params.id);

      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Payment configuration not found',
        });
      }

      const testType = req.body.test_type || 'connectivity';
      const testResult = await PaymentHealthCheckService.runHealthCheck(config, testType);

      // Log the test
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.adminInfo.id,
        'test',
        { test_type: testType },
        testResult,
        req.adminInfo.ip,
        req.adminInfo.userAgent
      );

      logger.info(`Payment configuration tested: ${config.provider_name}`, {
        configId: config.id,
        testType,
        result: testResult.status,
        adminId: req.adminInfo.id,
      });

      res.json({
        success: true,
        message: 'Test completed',
        data: testResult,
      });
    } catch (error) {
      logger.error('Error testing payment configuration:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test payment configuration',
        error: error.message,
      });
    }
  }
);

// POST /api/admin/payment-configs/:id/toggle-status - Toggle active status
router.post(
  '/:id/toggle-status',
  [
    param('id').isUUID(),
    body('is_active').isBoolean().withMessage('is_active must be boolean'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const config = await PaymentConfiguration.findById(req.params.id);

      if (!config) {
        return res.status(404).json({
          success: false,
          message: 'Payment configuration not found',
        });
      }

      const oldValues = { is_active: config.is_active };
      await config.toggleStatus(req.body.is_active, req.adminInfo.id);

      const action = req.body.is_active ? 'activate' : 'deactivate';

      // Log the status change
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.adminInfo.id,
        action,
        oldValues,
        { is_active: req.body.is_active },
        req.adminInfo.ip,
        req.adminInfo.userAgent
      );

      logger.info(`Payment configuration ${action}d: ${config.provider_name}`, {
        configId: config.id,
        adminId: req.adminInfo.id,
      });

      res.json({
        success: true,
        message: `Payment configuration ${action}d successfully`,
        data: config.toJSON(),
      });
    } catch (error) {
      logger.error('Error toggling payment configuration status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to toggle payment configuration status',
        error: error.message,
      });
    }
  }
);

// GET /api/admin/payment-configs/:id/audit-log - Get audit log for configuration
router.get(
  '/:id/audit-log',
  [
    param('id').isUUID(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const auditLogs = await PaymentConfigAuditLog.getConfigAuditLogs(
        req.params.id,
        limit,
        offset
      );

      res.json({
        success: true,
        data: {
          logs: auditLogs,
          pagination: {
            page,
            limit,
            total: auditLogs.length,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching audit log:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch audit log',
        error: error.message,
      });
    }
  }
);

// GET /api/admin/payment-configs/analytics/provider-stats - Get provider statistics
router.get('/analytics/provider-stats', async (req, res) => {
  try {
    const stats = await PaymentConfiguration.getProviderStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error fetching provider statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch provider statistics',
      error: error.message,
    });
  }
});

// GET /api/admin/payment-configs/active - Get active configurations only
router.get('/active', async (req, res) => {
  try {
    const activeConfigs = await PaymentConfiguration.getActiveConfigurations(
      req.query.test_mode === 'true'
    );

    res.json({
      success: true,
      data: activeConfigs.map(config => config.toJSON()),
    });
  } catch (error) {
    logger.error('Error fetching active configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active configurations',
      error: error.message,
    });
  }
});

// POST /api/admin/payment-configs/bulk-health-check - Run health check on all active configs
router.post('/bulk-health-check', async (req, res) => {
  try {
    const activeConfigs = await PaymentConfiguration.getActiveConfigurations();
    const healthCheckResults = [];

    for (const config of activeConfigs) {
      try {
        const result = await PaymentHealthCheckService.runHealthCheck(config, 'connectivity');
        healthCheckResults.push({
          configId: config.id,
          provider: config.provider_name,
          result,
        });
      } catch (error) {
        healthCheckResults.push({
          configId: config.id,
          provider: config.provider_name,
          result: {
            status: 'fail',
            error: error.message,
          },
        });
      }
    }

    // Log bulk health check
    await PaymentConfigAuditLog.logChange(
      null,
      req.adminInfo.id,
      'health_check',
      { type: 'bulk' },
      { results: healthCheckResults.map(r => ({ provider: r.provider, status: r.result.status })) },
      req.adminInfo.ip,
      req.adminInfo.userAgent
    );

    logger.info('Bulk health check completed', {
      totalConfigs: activeConfigs.length,
      adminId: req.adminInfo.id,
    });

    res.json({
      success: true,
      message: 'Bulk health check completed',
      data: healthCheckResults,
    });
  } catch (error) {
    logger.error('Error running bulk health check:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run bulk health check',
      error: error.message,
    });
  }
});

export default router;
