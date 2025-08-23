import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import { PaymentConfigAuditLog, PaymentConfiguration } from '../../models/PaymentConfiguration.js';
import { logger } from '../../config/logger.js';

const router = express.Router();

// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Validation rules
const createConfigValidation = [
  body('provider_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Provider name must be 2-100 characters'),
  body('provider_type')
    .isIn(['gateway', 'wallet', 'bank_transfer', 'cryptocurrency'])
    .withMessage('Invalid provider type'),
  body('configuration').isObject().withMessage('Configuration must be a valid object'),
  body('priority')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Priority must be a non-negative integer'),
  body('supported_currencies')
    .optional()
    .isArray()
    .withMessage('Supported currencies must be an array'),
  body('supported_countries')
    .optional()
    .isArray()
    .withMessage('Supported countries must be an array'),
];

const updateConfigValidation = [
  param('configId').isUUID().withMessage('Invalid configuration ID'),
  body('provider_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Provider name must be 2-100 characters'),
  body('provider_type')
    .optional()
    .isIn(['gateway', 'wallet', 'bank_transfer', 'cryptocurrency'])
    .withMessage('Invalid provider type'),
  body('configuration').optional().isObject().withMessage('Configuration must be a valid object'),
  body('priority')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Priority must be a non-negative integer'),
];

// Get all payment configurations
router.get(
  '/',
  requirePermission(['payment_management', 'system_settings']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('provider_type')
      .optional()
      .isIn(['gateway', 'wallet', 'bank_transfer', 'cryptocurrency']),
    query('is_active').optional().isBoolean(),
    query('is_test_mode').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { page = 1, limit = 20, provider_type, is_active, is_test_mode } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const filters = {};

    if (provider_type) filters.provider_type = provider_type;
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (is_test_mode !== undefined) filters.is_test_mode = is_test_mode === 'true';

    try {
      const configurations = await PaymentConfiguration.findAll(parseInt(limit), offset, filters);
      const stats = await PaymentConfiguration.getProviderStats();

      res.json({
        success: true,
        data: {
          configurations: configurations.map(config => config.toJSON()),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: configurations.length,
          },
          stats,
        },
      });
    } catch (error) {
      logger.error('Error fetching payment configurations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch payment configurations',
      });
    }
  })
);

// Get single payment configuration
router.get(
  '/:configId',
  requirePermission(['payment_management', 'system_settings']),
  [param('configId').isUUID().withMessage('Invalid configuration ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
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
        error: 'Failed to fetch payment configuration',
      });
    }
  })
);

// Get configuration with full details (for admin internal use)
router.get(
  '/:configId/full',
  requirePermission(['payment_management']),
  [param('configId').isUUID().withMessage('Invalid configuration ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      // Log access to sensitive data
      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: 'VIEW_PAYMENT_CONFIG_SENSITIVE',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { configId: req.params.configId, provider: config.provider_name },
      });

      res.json({
        success: true,
        data: config.getFullData(),
      });
    } catch (error) {
      logger.error('Error fetching payment configuration full details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch payment configuration',
      });
    }
  })
);

// Create new payment configuration
router.post(
  '/',
  requirePermission(['payment_management']),
  createConfigValidation,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const configData = {
        ...req.body,
        created_by: req.admin.id,
      };

      const config = await PaymentConfiguration.create(configData);

      // Log the creation
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.admin.id,
        'CREATE',
        {},
        config.toJSON(),
        req.ip,
        req.get('User-Agent')
      );

      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: 'CREATE_PAYMENT_CONFIG',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { configId: config.id, provider: config.provider_name },
      });

      res.status(201).json({
        success: true,
        data: config.toJSON(),
        message: 'Payment configuration created successfully',
      });
    } catch (error) {
      logger.error('Error creating payment configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create payment configuration',
      });
    }
  })
);

// Update payment configuration
router.put(
  '/:configId',
  requirePermission(['payment_management']),
  updateConfigValidation,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      const oldValues = config.toJSON();
      await config.update(req.body, req.admin.id);

      // Log the update
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.admin.id,
        'UPDATE',
        oldValues,
        config.toJSON(),
        req.ip,
        req.get('User-Agent')
      );

      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: 'UPDATE_PAYMENT_CONFIG',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { configId: config.id, provider: config.provider_name },
      });

      res.json({
        success: true,
        data: config.toJSON(),
        message: 'Payment configuration updated successfully',
      });
    } catch (error) {
      logger.error('Error updating payment configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update payment configuration',
      });
    }
  })
);

// Toggle configuration status (activate/deactivate)
router.patch(
  '/:configId/toggle-status',
  requirePermission(['payment_management']),
  [
    param('configId').isUUID().withMessage('Invalid configuration ID'),
    body('is_active').isBoolean().withMessage('is_active must be a boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      const oldStatus = config.is_active;
      await config.toggleStatus(req.body.is_active, req.admin.id);

      // Log the status change
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.admin.id,
        req.body.is_active ? 'ACTIVATE' : 'DEACTIVATE',
        { is_active: oldStatus },
        { is_active: req.body.is_active },
        req.ip,
        req.get('User-Agent')
      );

      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: req.body.is_active ? 'ACTIVATE_PAYMENT_CONFIG' : 'DEACTIVATE_PAYMENT_CONFIG',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { configId: config.id, provider: config.provider_name },
      });

      res.json({
        success: true,
        data: config.toJSON(),
        message: `Payment configuration ${req.body.is_active ? 'activated' : 'deactivated'} successfully`,
      });
    } catch (error) {
      logger.error('Error toggling payment configuration status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update payment configuration status',
      });
    }
  })
);

// Toggle test mode
router.patch(
  '/:configId/toggle-test-mode',
  requirePermission(['payment_management']),
  [
    param('configId').isUUID().withMessage('Invalid configuration ID'),
    body('is_test_mode').isBoolean().withMessage('is_test_mode must be a boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      const oldTestMode = config.is_test_mode;
      await config.toggleTestMode(req.body.is_test_mode, req.admin.id);

      // Log the test mode change
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.admin.id,
        req.body.is_test_mode ? 'ENABLE_TEST_MODE' : 'DISABLE_TEST_MODE',
        { is_test_mode: oldTestMode },
        { is_test_mode: req.body.is_test_mode },
        req.ip,
        req.get('User-Agent')
      );

      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: req.body.is_test_mode ? 'ENABLE_PAYMENT_TEST_MODE' : 'DISABLE_PAYMENT_TEST_MODE',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { configId: config.id, provider: config.provider_name },
      });

      res.json({
        success: true,
        data: config.toJSON(),
        message: `Test mode ${req.body.is_test_mode ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      logger.error('Error toggling test mode:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update test mode',
      });
    }
  })
);

// Update configuration priority
router.patch(
  '/:configId/priority',
  requirePermission(['payment_management']),
  [
    param('configId').isUUID().withMessage('Invalid configuration ID'),
    body('priority').isInt({ min: 0 }).withMessage('Priority must be a non-negative integer'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      const oldPriority = config.priority;
      await config.updatePriority(req.body.priority, req.admin.id);

      // Log the priority change
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.admin.id,
        'UPDATE_PRIORITY',
        { priority: oldPriority },
        { priority: req.body.priority },
        req.ip,
        req.get('User-Agent')
      );

      res.json({
        success: true,
        data: config.toJSON(),
        message: 'Priority updated successfully',
      });
    } catch (error) {
      logger.error('Error updating priority:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update priority',
      });
    }
  })
);

// Test payment configuration
router.post(
  '/:configId/test',
  requirePermission(['payment_management']),
  [param('configId').isUUID().withMessage('Invalid configuration ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      const testResult = await config.testConfiguration();

      // Log the test
      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: 'TEST_PAYMENT_CONFIG',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          configId: config.id,
          provider: config.provider_name,
          testResult: testResult.valid,
        },
      });

      res.json({
        success: true,
        data: testResult,
        message: 'Configuration test completed',
      });
    } catch (error) {
      logger.error('Error testing payment configuration:', error);
      res.status(400).json({
        success: false,
        error: error.message || 'Configuration test failed',
      });
    }
  })
);

// Delete payment configuration (soft delete)
router.delete(
  '/:configId',
  requirePermission(['payment_management']),
  [param('configId').isUUID().withMessage('Invalid configuration ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const config = await PaymentConfiguration.findById(req.params.configId);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'Payment configuration not found',
        });
      }

      const oldValues = config.toJSON();
      await config.delete(req.admin.id);

      // Log the deletion
      await PaymentConfigAuditLog.logChange(
        config.id,
        req.admin.id,
        'DELETE',
        oldValues,
        { is_active: false },
        req.ip,
        req.get('User-Agent')
      );

      await req.app.locals.database.logAdminActivity({
        adminId: req.admin.id,
        action: 'DELETE_PAYMENT_CONFIG',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { configId: config.id, provider: config.provider_name },
      });

      res.json({
        success: true,
        message: 'Payment configuration deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting payment configuration:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete payment configuration',
      });
    }
  })
);

// Get configuration audit logs
router.get(
  '/:configId/audit-logs',
  requirePermission(['payment_management', 'system_settings']),
  [
    param('configId').isUUID().withMessage('Invalid configuration ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
      const auditLogs = await PaymentConfigAuditLog.getConfigAuditLogs(
        req.params.configId,
        parseInt(limit),
        offset
      );

      res.json({
        success: true,
        data: {
          auditLogs,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: auditLogs.length,
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching audit logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch audit logs',
      });
    }
  })
);

// Get active configurations by provider
router.get(
  '/provider/:providerName',
  requirePermission(['payment_management', 'system_settings']),
  [param('providerName').notEmpty().withMessage('Provider name is required')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    try {
      const configurations = await PaymentConfiguration.findByProvider(req.params.providerName);

      res.json({
        success: true,
        data: configurations.map(config => config.toJSON()),
      });
    } catch (error) {
      logger.error('Error fetching configurations by provider:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch configurations',
      });
    }
  })
);

// Get payment provider statistics
router.get(
  '/stats/providers',
  requirePermission(['payment_management', 'analytics']),
  asyncHandler(async (req, res) => {
    try {
      const stats = await PaymentConfiguration.getProviderStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching provider stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch provider statistics',
      });
    }
  })
);

export default router;
