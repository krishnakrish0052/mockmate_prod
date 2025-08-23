import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
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
 * GET /api/admin/dynamic-config
 * Get all configurations grouped by category
 */
router.get('/', async (req, res) => {
  try {
    const { include_sensitive = 'false', category = null } = req.query;
    const includeSensitive = include_sensitive === 'true';
    const dynamicConfig = req.app.locals.dynamicConfig;

    if (category) {
      // Get configurations by specific category
      const configurations = await dynamicConfig.getByCategory(category, includeSensitive);

      res.json({
        success: true,
        data: {
          category,
          configurations,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Get all categories and their configurations
      const categories = await dynamicConfig.getCategories();
      const allConfigs = {};

      for (const cat of categories) {
        allConfigs[cat.name] = await dynamicConfig.getByCategory(cat.name, includeSensitive);
      }

      res.json({
        success: true,
        data: {
          categories,
          configurations: allConfigs,
          stats: await dynamicConfig.getStats(),
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Failed to get dynamic configurations:', error);
    res.status(500).json({
      error: 'Server Error',
      code: 'CONFIGURATION_FETCH_ERROR',
      message: 'Failed to fetch configurations',
    });
  }
});

/**
 * GET /api/admin/dynamic-config/categories
 * Get all configuration categories
 */
router.get('/categories', async (req, res) => {
  try {
    const dynamicConfig = req.app.locals.dynamicConfig;
    const categories = await dynamicConfig.getCategories();

    res.json({
      success: true,
      data: categories,
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
 * GET /api/admin/dynamic-config/stats
 * Get configuration statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const dynamicConfig = req.app.locals.dynamicConfig;
    const stats = await dynamicConfig.getStats();

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get configuration statistics:', error);
    res.status(500).json({
      error: 'Server Error',
      code: 'STATS_FETCH_ERROR',
      message: 'Failed to fetch configuration statistics',
    });
  }
});

/**
 * GET /api/admin/dynamic-config/:key
 * Get a specific configuration by key
 */
router.get(
  '/:key',
  [param('key').notEmpty().withMessage('Configuration key is required')],
  handleValidation,
  async (req, res) => {
    try {
      const { key } = req.params;
      const _dynamicConfig = req.app.locals.dynamicConfig;

      // Get configuration details from database
      const query = `
      SELECT 
        config_key,
        config_value,
        config_type,
        description,
        category,
        is_sensitive,
        is_public,
        created_at,
        updated_at
      FROM system_config 
      WHERE config_key = $1
    `;

      const result = await req.app.locals.database.query(query, [key]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Configuration Not Found',
          code: 'CONFIGURATION_NOT_FOUND',
          message: `Configuration with key '${key}' not found`,
        });
      }

      const config = result.rows[0];
      let value = config.config_value;

      // Parse JSON values if they exist
      if (value && typeof value !== 'string') {
        // Value is already parsed
      } else if (typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      // Mask sensitive values
      if (config.is_sensitive && value) {
        value = '••••••••••••';
      }

      res.json({
        success: true,
        data: {
          key: config.config_key,
          value,
          type: config.config_type,
          description: config.description,
          category: config.category,
          isSensitive: config.is_sensitive,
          isPublic: config.is_public,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
        },
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
 * PUT /api/admin/dynamic-config/:key
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
      const dynamicConfig = req.app.locals.dynamicConfig;

      // Update the configuration
      await dynamicConfig.set(key, value, adminId);

      // Log the change if reason provided
      if (reason) {
        await req.app.locals.database.query(
          'INSERT INTO admin_activity_logs (admin_id, action, details, created_at) VALUES ($1, $2, $3, NOW())',
          [
            adminId,
            'CONFIGURATION_UPDATED',
            JSON.stringify({
              configKey: key,
              newValue: typeof value === 'string' ? value : JSON.stringify(value),
              reason: reason,
            }),
          ]
        );
      }

      // Get updated configuration for response
      const updatedValue = await dynamicConfig.get(key);

      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: {
          key,
          value: updatedValue,
          updatedAt: new Date().toISOString(),
        },
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
 * POST /api/admin/dynamic-config/batch-update
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
      const dynamicConfig = req.app.locals.dynamicConfig;

      const results = [];
      const errors = [];

      for (const config of configurations) {
        try {
          await dynamicConfig.set(config.key, config.value, adminId);
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

      // Log batch update if reason provided
      if (reason && results.length > 0) {
        await req.app.locals.database.query(
          'INSERT INTO admin_activity_logs (admin_id, action, details, created_at) VALUES ($1, $2, $3, NOW())',
          [
            adminId,
            'CONFIGURATION_BATCH_UPDATED',
            JSON.stringify({
              updatedKeys: results.filter(r => r.success).map(r => r.key),
              failedKeys: errors.map(e => e.key),
              reason: reason,
            }),
          ]
        );
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
 * POST /api/admin/dynamic-config/reload
 * Reload all configurations from database (clear cache)
 */
router.post('/reload', async (req, res) => {
  try {
    const dynamicConfig = req.app.locals.dynamicConfig;
    await dynamicConfig.reload();

    // Log the reload action
    const adminId = req.admin?.id;
    if (adminId) {
      await req.app.locals.database.query(
        'INSERT INTO admin_activity_logs (admin_id, action, details, created_at) VALUES ($1, $2, $3, NOW())',
        [
          adminId,
          'CONFIGURATION_RELOADED',
          JSON.stringify({
            action: 'Configuration cache cleared and reloaded',
          }),
        ]
      );
    }

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
 * GET /api/admin/dynamic-config/export
 * Export all configurations as JSON
 */
router.get(
  '/export',
  [
    query('include_sensitive')
      .optional()
      .isIn(['true', 'false'])
      .withMessage('include_sensitive must be true or false'),
  ],
  handleValidation,
  async (req, res) => {
    try {
      const { include_sensitive = 'false' } = req.query;
      const includeSensitive = include_sensitive === 'true';
      const dynamicConfig = req.app.locals.dynamicConfig;

      // Get all categories and their configurations
      const categories = await dynamicConfig.getCategories();
      const allConfigs = {};

      for (const cat of categories) {
        allConfigs[cat.name] = await dynamicConfig.getByCategory(cat.name, includeSensitive);
      }

      const exportData = {
        exported_at: new Date().toISOString(),
        exported_by: req.admin?.username || 'system',
        environment: await dynamicConfig.get('node_env', 'development'),
        include_sensitive: includeSensitive,
        categories,
        configurations: allConfigs,
        stats: await dynamicConfig.getStats(),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="dynamic-configurations-${Date.now()}.json"`
      );
      res.json(exportData);
    } catch (error) {
      logger.error('Failed to export configurations:', error);
      res.status(500).json({
        error: 'Export Error',
        code: 'CONFIGURATION_EXPORT_ERROR',
        message: 'Failed to export configurations',
      });
    }
  }
);

/**
 * POST /api/admin/dynamic-config/validate
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

      // Get configuration metadata from database
      const query = `
      SELECT config_key, config_type, description, is_sensitive
      FROM system_config 
      WHERE config_key = $1
    `;

      const result = await req.app.locals.database.query(query, [key]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Configuration Not Found',
          code: 'CONFIGURATION_NOT_FOUND',
          message: `Configuration with key '${key}' not found`,
        });
      }

      const config = result.rows[0];
      let isValid = true;
      let validationMessage = 'Value is valid';

      // Basic type validation
      try {
        switch (config.config_type) {
          case 'number':
            if (isNaN(Number(value))) {
              isValid = false;
              validationMessage = 'Value must be a valid number';
            }
            break;
          case 'boolean':
            if (
              typeof value !== 'boolean' &&
              !['true', 'false', '1', '0'].includes(String(value).toLowerCase())
            ) {
              isValid = false;
              validationMessage = 'Value must be a boolean (true/false)';
            }
            break;
          case 'json':
            try {
              JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
            } catch {
              isValid = false;
              validationMessage = 'Value must be valid JSON';
            }
            break;
          default:
            // String type - always valid
            break;
        }
      } catch (error) {
        isValid = false;
        validationMessage = 'Validation failed: ' + error.message;
      }

      res.json({
        success: true,
        data: {
          key,
          value,
          isValid,
          validationMessage,
          type: config.config_type,
          description: config.description,
          isSensitive: config.is_sensitive,
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

export default router;
