import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { configService } from '../../services/ConfigurationService.js';
import { logger } from '../../config/logger.js';
import { adminAuth } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(adminAuth);

// Validation error handler
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: errors.array(),
    });
  }
  next();
};

/**
 * GET /api/admin/configurations
 * Get all configuration categories and their configurations
 */
router.get('/', async (req, res) => {
  try {
    const { include_sensitive = 'false', category = null } = req.query;
    const includeSensitive = include_sensitive === 'true';

    let configurations;

    if (category) {
      // Get configurations by category
      configurations = await configService.getByCategory(category, includeSensitive);
    } else {
      // Get all configurations grouped by categories
      const query = `
                SELECT 
                    cc.name as category_name,
                    cc.display_name as category_display_name,
                    cc.description as category_description,
                    cc.icon as category_icon,
                    sc.id,
                    sc.config_key,
                    sc.display_name,
                    sc.description,
                    sc.config_value,
                    sc.default_value,
                    sc.value_type,
                    sc.is_required,
                    sc.is_sensitive,
                    sc.is_client_accessible,
                    sc.environment,
                    sc.restart_required,
                    sc.validation_rules,
                    sc.sort_order,
                    sc.created_at,
                    sc.updated_at
                FROM v_active_configurations sc
                JOIN configuration_categories cc ON cc.name = sc.category_name
                WHERE sc.environment IN ('all', $1)
                ${!includeSensitive ? 'AND sc.is_sensitive = false' : ''}
                ORDER BY cc.sort_order, sc.sort_order
            `;

      const result = await req.app.locals.database.query(query, [
        process.env.NODE_ENV || 'development',
      ]);

      // Group by categories
      const categoriesMap = {};

      for (const row of result.rows) {
        if (!categoriesMap[row.category_name]) {
          categoriesMap[row.category_name] = {
            name: row.category_name,
            displayName: row.category_display_name,
            description: row.category_description,
            icon: row.category_icon,
            configurations: [],
          };
        }

        let value = row.config_value || row.default_value;

        // Don't decrypt sensitive values in API response, just mask them
        if (row.is_sensitive && value) {
          value = '••••••••••••';
        }

        categoriesMap[row.category_name].configurations.push({
          id: row.id,
          key: row.config_key,
          displayName: row.display_name,
          description: row.description,
          value: value,
          defaultValue: row.default_value,
          type: row.value_type,
          isRequired: row.is_required,
          isSensitive: row.is_sensitive,
          isClientAccessible: row.is_client_accessible,
          environment: row.environment,
          restartRequired: row.restart_required,
          validationRules: row.validation_rules,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }

      configurations = Object.values(categoriesMap);
    }

    res.json({
      success: true,
      data: configurations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get configurations:', error);
    res.status(500).json({
      error: 'Server Error',
      code: 'CONFIGURATION_FETCH_ERROR',
      message: 'Failed to fetch configurations',
    });
  }
});

/**
 * GET /api/admin/configurations/categories
 * Get all configuration categories
 */
router.get('/categories', async (req, res) => {
  try {
    const query = `
            SELECT name, display_name, description, icon, sort_order
            FROM configuration_categories 
            WHERE is_active = true
            ORDER BY sort_order
        `;

    const result = await req.app.locals.database.query(query);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        name: row.name,
        displayName: row.display_name,
        description: row.description,
        icon: row.icon,
        sortOrder: row.sort_order,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get configuration categories:', error);
    res.status(500).json({
      error: 'Server Error',
      code: 'CATEGORIES_FETCH_ERROR',
      message: 'Failed to fetch configuration categories',
    });
  }
});

/**
 * GET /api/admin/configurations/:key
 * Get a specific configuration by key
 */
router.get(
  '/:key',
  [param('key').notEmpty().withMessage('Configuration key is required')],
  handleValidation,
  async (req, res) => {
    try {
      const { key } = req.params;
      const configuration = await configService.getWithMetadata(key);

      if (!configuration) {
        return res.status(404).json({
          error: 'Configuration Not Found',
          code: 'CONFIGURATION_NOT_FOUND',
          message: `Configuration with key '${key}' not found`,
        });
      }

      // Mask sensitive values
      if (configuration.isSensitive && configuration.value) {
        configuration.value = '••••••••••••';
      }

      res.json({
        success: true,
        data: configuration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get configuration:', error);
      res.status(500).json({
        error: 'Server Error',
        code: 'CONFIGURATION_FETCH_ERROR',
        message: 'Failed to fetch configuration',
      });
    }
  }
);

/**
 * PUT /api/admin/configurations/:key
 * Update a configuration value
 */
router.put(
  '/:key',
  [
    param('key').notEmpty().withMessage('Configuration key is required'),
    body('value').exists().withMessage('Configuration value is required'),
    body('reason').optional().isString().withMessage('Change reason must be a string'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { key } = req.params;
      const { value, reason } = req.body;
      const adminId = req.admin?.id;

      // Update the configuration
      await configService.set(key, value, adminId);

      // Record the change reason if provided
      if (reason) {
        const updateReasonQuery = `
                UPDATE configuration_history 
                SET change_reason = $1
                WHERE configuration_id = (
                    SELECT id FROM system_configurations WHERE config_key = $2
                ) 
                AND changed_by = $3
                ORDER BY changed_at DESC 
                LIMIT 1
            `;
        await req.app.locals.database.query(updateReasonQuery, [reason, key, adminId]);
      }

      // Get updated configuration for response
      const updatedConfig = await configService.getWithMetadata(key);

      // Mask sensitive values in response
      if (updatedConfig.isSensitive && updatedConfig.value) {
        updatedConfig.value = '••••••••••••';
      }

      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: updatedConfig,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to update configuration:', error);
      res.status(400).json({
        error: 'Configuration Update Error',
        code: 'CONFIGURATION_UPDATE_ERROR',
        message: error.message || 'Failed to update configuration',
      });
    }
  }
);

/**
 * POST /api/admin/configurations/batch-update
 * Update multiple configurations at once
 */
router.post(
  '/batch-update',
  [
    body('configurations').isArray().withMessage('Configurations must be an array'),
    body('configurations.*.key').notEmpty().withMessage('Each configuration must have a key'),
    body('configurations.*.value').exists().withMessage('Each configuration must have a value'),
    body('reason').optional().isString().withMessage('Change reason must be a string'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { configurations, reason } = req.body;
      const adminId = req.admin?.id;

      const results = [];
      const errors = [];

      for (const config of configurations) {
        try {
          await configService.set(config.key, config.value, adminId);
          results.push({
            key: config.key,
            success: true,
            message: 'Updated successfully',
          });
        } catch (error) {
          errors.push({
            key: config.key,
            success: false,
            error: error.message,
          });
        }
      }

      // Update change reasons if provided
      if (reason && results.length > 0) {
        for (const result of results) {
          if (result.success) {
            const updateReasonQuery = `
                        UPDATE configuration_history 
                        SET change_reason = $1
                        WHERE configuration_id = (
                            SELECT id FROM system_configurations WHERE config_key = $2
                        ) 
                        AND changed_by = $3
                        ORDER BY changed_at DESC 
                        LIMIT 1
                    `;
            await req.app.locals.database.query(updateReasonQuery, [reason, result.key, adminId]);
          }
        }
      }

      const success = errors.length === 0;
      const statusCode = success ? 200 : results.length > 0 ? 207 : 400; // 207 = Multi-Status

      res.status(statusCode).json({
        success,
        message: success
          ? 'All configurations updated successfully'
          : `${results.length} succeeded, ${errors.length} failed`,
        data: {
          succeeded: results,
          failed: errors,
          total: configurations.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to batch update configurations:', error);
      res.status(500).json({
        error: 'Batch Update Error',
        code: 'BATCH_UPDATE_ERROR',
        message: 'Failed to update configurations',
      });
    }
  }
);

/**
 * POST /api/admin/configurations/reload
 * Reload all configurations from database (clear cache)
 */
router.post('/reload', async (req, res) => {
  try {
    await configService.reload();

    res.json({
      success: true,
      message: 'Configuration cache reloaded successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to reload configurations:', error);
    res.status(500).json({
      error: 'Reload Error',
      code: 'CONFIGURATION_RELOAD_ERROR',
      message: 'Failed to reload configurations',
    });
  }
});

/**
 * GET /api/admin/configurations/:key/history
 * Get configuration change history
 */
router.get(
  '/:key/history',
  [
    param('key').notEmpty().withMessage('Configuration key is required'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { key } = req.params;
      const limit = parseInt(req.query.limit) || 20;
      const offset = parseInt(req.query.offset) || 0;

      const query = `
            SELECT 
                ch.id,
                ch.old_value,
                ch.new_value,
                ch.change_reason,
                ch.changed_at,
                ch.client_ip,
                ch.user_agent,
                au.username as changed_by_username,
                au.email as changed_by_email
            FROM configuration_history ch
            JOIN system_configurations sc ON ch.configuration_id = sc.id
            LEFT JOIN admin_users au ON ch.changed_by = au.id
            WHERE sc.config_key = $1
            ORDER BY ch.changed_at DESC
            LIMIT $2 OFFSET $3
        `;

      const countQuery = `
            SELECT COUNT(*) as total
            FROM configuration_history ch
            JOIN system_configurations sc ON ch.configuration_id = sc.id
            WHERE sc.config_key = $1
        `;

      const [historyResult, countResult] = await Promise.all([
        req.app.locals.database.query(query, [key, limit, offset]),
        req.app.locals.database.query(countQuery, [key]),
      ]);

      const total = parseInt(countResult.rows[0]?.total || 0);

      res.json({
        success: true,
        data: {
          history: historyResult.rows.map(row => ({
            id: row.id,
            oldValue: row.old_value === '' ? null : row.old_value,
            newValue: row.new_value === '' ? null : row.new_value,
            changeReason: row.change_reason,
            changedAt: row.changed_at,
            changedBy: {
              username: row.changed_by_username,
              email: row.changed_by_email,
            },
            clientInfo: {
              ip: row.client_ip,
              userAgent: row.user_agent,
            },
          })),
          pagination: {
            total,
            limit,
            offset,
            pages: Math.ceil(total / limit),
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get configuration history:', error);
      res.status(500).json({
        error: 'History Fetch Error',
        code: 'HISTORY_FETCH_ERROR',
        message: 'Failed to fetch configuration history',
      });
    }
  }
);

/**
 * POST /api/admin/configurations/validate
 * Validate a configuration value without saving
 */
router.post(
  '/validate',
  [
    body('key').notEmpty().withMessage('Configuration key is required'),
    body('value').exists().withMessage('Configuration value is required'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { key, value } = req.body;

      // Get configuration metadata
      const config = await configService.getWithMetadata(key);
      if (!config) {
        return res.status(404).json({
          error: 'Configuration Not Found',
          code: 'CONFIGURATION_NOT_FOUND',
          message: `Configuration with key '${key}' not found`,
        });
      }

      // Validate the value
      const isValid = await configService.validateConfigValue(
        key,
        value,
        config.type,
        config.validationRules
      );

      res.json({
        success: true,
        data: {
          key,
          value,
          isValid,
          type: config.type,
          validationRules: config.validationRules,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to validate configuration:', error);
      res.status(500).json({
        error: 'Validation Error',
        code: 'CONFIGURATION_VALIDATION_ERROR',
        message: 'Failed to validate configuration',
      });
    }
  }
);

/**
 * GET /api/admin/configurations/export
 * Export all configurations as JSON
 */
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', include_sensitive = 'false' } = req.query;
    const includeSensitive = include_sensitive === 'true';

    const configurations = await configService.getAll(includeSensitive);

    const exportData = {
      exported_at: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      include_sensitive: includeSensitive,
      configurations,
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="configurations-${Date.now()}.json"`
      );
      res.json(exportData);
    } else {
      res.status(400).json({
        error: 'Invalid Format',
        code: 'INVALID_FORMAT',
        message: 'Only JSON format is supported',
      });
    }
  } catch (error) {
    logger.error('Failed to export configurations:', error);
    res.status(500).json({
      error: 'Export Error',
      code: 'CONFIGURATION_EXPORT_ERROR',
      message: 'Failed to export configurations',
    });
  }
});

/**
 * POST /api/admin/configurations/import
 * Import configurations from JSON
 */
router.post(
  '/import',
  [
    body('configurations').isObject().withMessage('Configurations must be an object'),
    body('merge_strategy')
      .optional()
      .isIn(['replace', 'merge', 'skip_existing'])
      .withMessage('Invalid merge strategy'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { configurations, merge_strategy = 'merge' } = req.body;
      const adminId = req.admin?.id;

      const results = [];
      const errors = [];

      for (const [key, value] of Object.entries(configurations)) {
        try {
          // Check if configuration exists
          const existing = await configService.getWithMetadata(key);

          if (existing && merge_strategy === 'skip_existing') {
            results.push({
              key,
              success: true,
              action: 'skipped',
              message: 'Configuration exists and skip_existing strategy used',
            });
            continue;
          }

          if (!existing && merge_strategy === 'replace') {
            errors.push({
              key,
              success: false,
              error: 'Configuration does not exist and replace strategy used',
            });
            continue;
          }

          await configService.set(key, value, adminId);
          results.push({
            key,
            success: true,
            action: existing ? 'updated' : 'created',
            message: 'Configuration imported successfully',
          });
        } catch (error) {
          errors.push({
            key,
            success: false,
            error: error.message,
          });
        }
      }

      const success = errors.length === 0;
      const statusCode = success ? 200 : results.length > 0 ? 207 : 400;

      res.status(statusCode).json({
        success,
        message: success
          ? 'All configurations imported successfully'
          : `${results.length} succeeded, ${errors.length} failed`,
        data: {
          succeeded: results,
          failed: errors,
          total: Object.keys(configurations).length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to import configurations:', error);
      res.status(500).json({
        error: 'Import Error',
        code: 'CONFIGURATION_IMPORT_ERROR',
        message: 'Failed to import configurations',
      });
    }
  }
);

export default router;
