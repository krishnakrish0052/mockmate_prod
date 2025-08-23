import express from 'express';
import { body, param, validationResult } from 'express-validator';
// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Get system configuration
router.get(
  '/',
  requirePermission(['config.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    // Get system configuration from database
    const configQuery = `
      SELECT 
        config_key,
        config_value,
        config_type,
        description,
        is_public,
        updated_at
      FROM system_config
      ORDER BY config_key
    `;

    const result = await database.query(configQuery);

    const config = {};
    result.rows.forEach(row => {
      config[row.config_key] = {
        value: row.config_value,
        type: row.config_type,
        description: row.description,
        isPublic: row.is_public,
        updatedAt: row.updated_at,
      };
    });

    res.json({
      success: true,
      data: config,
    });
  })
);

// Update configuration
router.put(
  '/',
  requirePermission(['config.write']),
  [
    body('configs').isObject().withMessage('Configs must be an object'),
    body('configs.*').exists().withMessage('Config value is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { configs } = req.body;
    const adminId = req.admin.id;

    // Update configurations
    const updates = [];
    for (const [key, value] of Object.entries(configs)) {
      updates.push(
        database.query(
          `
          INSERT INTO system_config (config_key, config_value, updated_by, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (config_key)
          DO UPDATE SET 
            config_value = EXCLUDED.config_value,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
        `,
          [key, JSON.stringify(value), adminId]
        )
      );
    }

    await Promise.all(updates);

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: { updatedKeys: Object.keys(configs) },
    });
  })
);

// Get public configuration (for frontend)
router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    const publicConfigQuery = `
      SELECT config_key, config_value, config_type
      FROM system_config
      WHERE is_public = true
      ORDER BY config_key
    `;

    const result = await database.query(publicConfigQuery);

    const config = {};
    result.rows.forEach(row => {
      config[row.config_key] = row.config_value;
    });

    res.json({
      success: true,
      data: config,
    });
  })
);

// Get environment configurations
router.get(
  '/environments',
  requirePermission(['config.read', 'environments.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    const envQuery = `
      SELECT 
        environment_name,
        config_data,
        is_active,
        description,
        updated_at,
        updated_by
      FROM environment_configs
      ORDER BY environment_name
    `;

    const result = await database.query(envQuery);

    const environments = result.rows.map(row => ({
      name: row.environment_name,
      config: row.config_data,
      isActive: row.is_active,
      description: row.description,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));

    res.json({
      success: true,
      data: {
        environments,
        totalEnvironments: environments.length,
      },
    });
  })
);

// Update environment configuration
router.put(
  '/environments/:name',
  requirePermission(['config.write', 'environments.write']),
  [
    param('name').notEmpty().withMessage('Environment name is required'),
    body('config').isObject().withMessage('Config must be an object'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { name } = req.params;
    const { config, description, isActive = true } = req.body;
    const adminId = req.admin.id;

    const upsertQuery = `
      INSERT INTO environment_configs (environment_name, config_data, description, is_active, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (environment_name)
      DO UPDATE SET 
        config_data = EXCLUDED.config_data,
        description = COALESCE(EXCLUDED.description, environment_configs.description),
        is_active = EXCLUDED.is_active,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;

    const result = await database.query(upsertQuery, [
      name,
      JSON.stringify(config),
      description,
      isActive,
      adminId,
    ]);

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'ENVIRONMENT_CONFIG_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        environmentName: name,
        configKeys: Object.keys(config),
        isActive,
      },
    });

    res.json({
      success: true,
      message: 'Environment configuration updated successfully',
      data: {
        name: result.rows[0].environment_name,
        updatedAt: result.rows[0].updated_at,
        isActive: result.rows[0].is_active,
      },
    });
  })
);

// Get subscription settings
router.get(
  '/subscriptions',
  requirePermission(['config.read', 'subscriptions.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    const subscriptionQuery = `
      SELECT 
        plan_id,
        plan_name,
        price_usd,
        price_currency,
        credits_included,
        features,
        is_active,
        created_at,
        updated_at
      FROM subscription_plans
      ORDER BY price_usd ASC
    `;

    const result = await database.query(subscriptionQuery);

    const plans = result.rows.map(row => ({
      id: row.plan_id,
      name: row.plan_name,
      price: parseFloat(row.price_usd),
      currency: row.price_currency,
      creditsIncluded: parseInt(row.credits_included),
      features: row.features,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    res.json({
      success: true,
      data: {
        plans,
        totalPlans: plans.length,
        activePlans: plans.filter(p => p.isActive).length,
      },
    });
  })
);

// Create or update subscription plan
router.put(
  '/subscriptions/:planId',
  requirePermission(['config.write', 'subscriptions.write']),
  [
    param('planId').notEmpty().withMessage('Plan ID is required'),
    body('name').notEmpty().withMessage('Plan name is required'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('currency').isIn(['USD', 'EUR', 'GBP']).withMessage('Invalid currency'),
    body('creditsIncluded').isInt({ min: 0 }).withMessage('Credits must be a positive integer'),
    body('features').isArray().withMessage('Features must be an array'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { planId } = req.params;
    const { name, price, currency, creditsIncluded, features, isActive = true } = req.body;
    const adminId = req.admin.id;

    const upsertQuery = `
      INSERT INTO subscription_plans (plan_id, plan_name, price_usd, price_currency, credits_included, features, is_active, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (plan_id)
      DO UPDATE SET 
        plan_name = EXCLUDED.plan_name,
        price_usd = EXCLUDED.price_usd,
        price_currency = EXCLUDED.price_currency,
        credits_included = EXCLUDED.credits_included,
        features = EXCLUDED.features,
        is_active = EXCLUDED.is_active,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;

    const result = await database.query(upsertQuery, [
      planId,
      name,
      price,
      currency,
      creditsIncluded,
      JSON.stringify(features),
      isActive,
    ]);

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'SUBSCRIPTION_PLAN_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        planId,
        planName: name,
        price,
        currency,
        creditsIncluded,
        isActive,
      },
    });

    const plan = result.rows[0];

    res.json({
      success: true,
      message: 'Subscription plan updated successfully',
      data: {
        id: plan.plan_id,
        name: plan.plan_name,
        price: parseFloat(plan.price_usd),
        currency: plan.price_currency,
        creditsIncluded: parseInt(plan.credits_included),
        features: plan.features,
        isActive: plan.is_active,
        updatedAt: plan.updated_at,
      },
    });
  })
);

// Delete subscription plan
router.delete(
  '/subscriptions/:planId',
  requirePermission(['config.write', 'subscriptions.delete']),
  [param('planId').notEmpty().withMessage('Plan ID is required')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { planId } = req.params;
    const adminId = req.admin.id;

    // Check if plan has active subscribers
    const subscriberCheckQuery = `
      SELECT COUNT(*) as subscriber_count
      FROM user_subscriptions
      WHERE plan_id = $1 AND status IN ('active', 'trialing')
    `;

    const subscriberResult = await database.query(subscriberCheckQuery, [planId]);
    const subscriberCount = parseInt(subscriberResult.rows[0].subscriber_count);

    if (subscriberCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan with ${subscriberCount} active subscribers. Deactivate the plan instead.`,
      });
    }

    // Delete the plan
    const deleteQuery = `
      DELETE FROM subscription_plans
      WHERE plan_id = $1
      RETURNING plan_name
    `;

    const result = await database.query(deleteQuery, [planId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'SUBSCRIPTION_PLAN_DELETED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        planId,
        planName: result.rows[0].plan_name,
      },
    });

    res.json({
      success: true,
      message: 'Subscription plan deleted successfully',
      data: {
        planId,
        deletedAt: new Date().toISOString(),
      },
    });
  })
);

// Get application features configuration
router.get(
  '/features',
  requirePermission(['config.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    const featuresQuery = `
      SELECT 
        feature_key,
        is_enabled,
        description,
        config_data,
        updated_at
      FROM feature_flags
      ORDER BY feature_key
    `;

    const result = await database.query(featuresQuery);

    const features = {};
    result.rows.forEach(row => {
      features[row.feature_key] = {
        enabled: row.is_enabled,
        description: row.description,
        config: row.config_data,
        updatedAt: row.updated_at,
      };
    });

    res.json({
      success: true,
      data: {
        features,
        totalFeatures: Object.keys(features).length,
        enabledFeatures: Object.values(features).filter(f => f.enabled).length,
      },
    });
  })
);

// Update feature flags
router.patch(
  '/features',
  requirePermission(['config.write', 'features.write']),
  [body('features').isObject().withMessage('Features must be an object')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { features } = req.body;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      const updatedFeatures = [];

      for (const [featureKey, config] of Object.entries(features)) {
        const { enabled, description, data } = config;

        const upsertQuery = `
          INSERT INTO feature_flags (feature_key, is_enabled, description, config_data, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (feature_key)
          DO UPDATE SET 
            is_enabled = EXCLUDED.is_enabled,
            description = COALESCE(EXCLUDED.description, feature_flags.description),
            config_data = EXCLUDED.config_data,
            updated_at = EXCLUDED.updated_at
          RETURNING *
        `;

        const result = await database.query(upsertQuery, [
          featureKey,
          enabled,
          description,
          data ? JSON.stringify(data) : null,
        ]);

        updatedFeatures.push(result.rows[0]);
      }

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'FEATURE_FLAGS_UPDATED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          updatedFeatures: Object.keys(features),
          count: Object.keys(features).length,
        },
      });

      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Feature flags updated successfully',
        data: {
          updatedFeatures: updatedFeatures.map(feature => ({
            key: feature.feature_key,
            enabled: feature.is_enabled,
            updatedAt: feature.updated_at,
          })),
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

export default router;
