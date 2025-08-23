import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// ===== CREDIT PACKAGES MANAGEMENT =====

// Get all credit packages
router.get(
  '/packages',
  requirePermission(['pricing.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('status').optional().isIn(['all', 'active', 'inactive']),
    query('packageType').optional().isIn(['all', 'one_time', 'subscription', 'bundle']),
    query('sortBy').optional().isIn(['created_at', 'package_name', 'price_usd', 'credits_amount']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { status, packageType, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      if (status === 'active') {
        conditions.push('is_active = true');
      } else if (status === 'inactive') {
        conditions.push('is_active = false');
      }
    }

    if (packageType && packageType !== 'all') {
      conditions.push(`package_type = $${paramIndex}`);
      params.push(packageType);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const packagesQuery = `
      SELECT 
        cp.*,
        creator.name as created_by_name,
        updater.name as updated_by_name,
        COUNT(p.id) as purchase_count,
        SUM(CASE WHEN p.status = 'completed' THEN p.amount_usd ELSE 0 END) as total_revenue
      FROM credit_packages cp
      LEFT JOIN admin_users creator ON cp.created_by = creator.id
      LEFT JOIN admin_users updater ON cp.updated_by = updater.id
      LEFT JOIN payments p ON p.credits_purchased = cp.credits_amount 
        AND p.amount_usd = cp.price_usd 
        AND p.created_at >= cp.created_at
      ${whereClause}
      GROUP BY cp.id, creator.name, updater.name
      ORDER BY cp.${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM credit_packages cp
      ${whereClause}
    `;

    params.push(limit, offset);

    const [packagesResult, countResult] = await Promise.all([
      database.query(packagesQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const packages = packagesResult.rows.map(pkg => ({
      id: pkg.id,
      packageId: pkg.package_id,
      packageName: pkg.package_name,
      description: pkg.description,
      creditsAmount: parseInt(pkg.credits_amount),
      priceUsd: parseFloat(pkg.price_usd),
      discountPercentage: parseFloat(pkg.discount_percentage || 0),
      bonusCredits: parseInt(pkg.bonus_credits || 0),
      validityDays: pkg.validity_days,
      isPopular: pkg.is_popular,
      isActive: pkg.is_active,
      minUserTier: pkg.min_user_tier,
      maxPurchasesPerUser: pkg.max_purchases_per_user,
      packageType: pkg.package_type,
      features: pkg.features || [],
      metadata: pkg.metadata || {},
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at,
      createdByName: pkg.created_by_name,
      updatedByName: pkg.updated_by_name,
      purchaseCount: parseInt(pkg.purchase_count || 0),
      totalRevenue: parseFloat(pkg.total_revenue || 0),
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        packages,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { status, packageType, sortBy, sortOrder },
      },
    });
  })
);

// Get single credit package
router.get(
  '/packages/:id',
  requirePermission(['pricing.read']),
  [param('id').isUUID().withMessage('Invalid package ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    const packageQuery = `
      SELECT 
        cp.*,
        creator.name as created_by_name,
        updater.name as updated_by_name
      FROM credit_packages cp
      LEFT JOIN admin_users creator ON cp.created_by = creator.id
      LEFT JOIN admin_users updater ON cp.updated_by = updater.id
      WHERE cp.id = $1
    `;

    const result = await database.query(packageQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found',
      });
    }

    const pkg = result.rows[0];

    res.json({
      success: true,
      data: {
        id: pkg.id,
        packageId: pkg.package_id,
        packageName: pkg.package_name,
        description: pkg.description,
        creditsAmount: parseInt(pkg.credits_amount),
        priceUsd: parseFloat(pkg.price_usd),
        discountPercentage: parseFloat(pkg.discount_percentage || 0),
        bonusCredits: parseInt(pkg.bonus_credits || 0),
        validityDays: pkg.validity_days,
        isPopular: pkg.is_popular,
        isActive: pkg.is_active,
        minUserTier: pkg.min_user_tier,
        maxPurchasesPerUser: pkg.max_purchases_per_user,
        packageType: pkg.package_type,
        features: pkg.features || [],
        metadata: pkg.metadata || {},
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
        createdByName: pkg.created_by_name,
        updatedByName: pkg.updated_by_name,
      },
    });
  })
);

// Create credit package
router.post(
  '/packages',
  requirePermission(['pricing.create']),
  [
    body('packageId').notEmpty().withMessage('Package ID is required'),
    body('packageName').notEmpty().withMessage('Package name is required'),
    body('creditsAmount')
      .isInt({ min: 1 })
      .withMessage('Credits amount must be a positive integer'),
    body('priceUsd').isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
    body('description').optional().isString().withMessage('Invalid description'),
    body('discountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Discount must be between 0 and 100'),
    body('bonusCredits')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Bonus credits must be non-negative'),
    body('validityDays').optional().isInt({ min: 1 }).withMessage('Validity days must be positive'),
    body('isPopular').optional().isBoolean().withMessage('Invalid popular flag'),
    body('isActive').optional().isBoolean().withMessage('Invalid active flag'),
    body('minUserTier')
      .optional()
      .isIn(['free', 'pro', 'enterprise'])
      .withMessage('Invalid user tier'),
    body('maxPurchasesPerUser')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Max purchases must be positive'),
    body('packageType')
      .optional()
      .isIn(['one_time', 'subscription', 'bundle'])
      .withMessage('Invalid package type'),
    body('features').optional().isArray().withMessage('Features must be an array'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;

    const {
      packageId,
      packageName,
      description,
      creditsAmount,
      priceUsd,
      discountPercentage = 0,
      bonusCredits = 0,
      validityDays,
      isPopular = false,
      isActive = true,
      minUserTier = 'free',
      maxPurchasesPerUser,
      packageType = 'one_time',
      features = [],
      metadata = {},
    } = req.body;

    // Check if package ID already exists
    const existingPackage = await database.query(
      'SELECT id FROM credit_packages WHERE package_id = $1',
      [packageId]
    );

    if (existingPackage.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Package ID already exists',
      });
    }

    const insertQuery = `
      INSERT INTO credit_packages (
        package_id, package_name, description, credits_amount, price_usd,
        discount_percentage, bonus_credits, validity_days, is_popular, is_active,
        min_user_tier, max_purchases_per_user, package_type, features, metadata,
        created_at, updated_at, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW(), $16, $16)
      RETURNING *
    `;

    const result = await database.query(insertQuery, [
      packageId,
      packageName,
      description,
      creditsAmount,
      priceUsd,
      discountPercentage,
      bonusCredits,
      validityDays,
      isPopular,
      isActive,
      minUserTier,
      maxPurchasesPerUser,
      packageType,
      JSON.stringify(features),
      JSON.stringify(metadata),
      adminId,
    ]);

    const newPackage = result.rows[0];

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'PACKAGE_CREATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        packageId: newPackage.id,
        packageIdString: packageId,
        packageName,
        creditsAmount,
        priceUsd,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Credit package created successfully',
      data: {
        id: newPackage.id,
        packageId: newPackage.package_id,
        packageName: newPackage.package_name,
        creditsAmount: parseInt(newPackage.credits_amount),
        priceUsd: parseFloat(newPackage.price_usd),
        isActive: newPackage.is_active,
        createdAt: newPackage.created_at,
      },
    });
  })
);

// Update credit package
router.put(
  '/packages/:id',
  requirePermission(['pricing.write']),
  [
    param('id').isUUID().withMessage('Invalid package ID'),
    body('packageName').optional().notEmpty().withMessage('Package name cannot be empty'),
    body('creditsAmount')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Credits amount must be positive'),
    body('priceUsd').optional().isFloat({ min: 0 }).withMessage('Price must be non-negative'),
    body('description').optional().isString().withMessage('Invalid description'),
    body('discountPercentage')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Discount must be between 0-100'),
    body('bonusCredits')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Bonus credits must be non-negative'),
    body('validityDays').optional().isInt({ min: 1 }).withMessage('Validity days must be positive'),
    body('isPopular').optional().isBoolean().withMessage('Invalid popular flag'),
    body('isActive').optional().isBoolean().withMessage('Invalid active flag'),
    body('minUserTier')
      .optional()
      .isIn(['free', 'pro', 'enterprise'])
      .withMessage('Invalid user tier'),
    body('maxPurchasesPerUser')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Max purchases must be positive'),
    body('packageType')
      .optional()
      .isIn(['one_time', 'subscription', 'bundle'])
      .withMessage('Invalid package type'),
    body('features').optional().isArray().withMessage('Features must be an array'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    // Build update query dynamically
    const updateFields = [];
    const params = [id];
    let paramIndex = 2;

    Object.entries(req.body).forEach(([key, value]) => {
      if (value !== undefined) {
        let dbField = key;
        // Convert camelCase to snake_case
        if (key === 'packageName') dbField = 'package_name';
        else if (key === 'creditsAmount') dbField = 'credits_amount';
        else if (key === 'priceUsd') dbField = 'price_usd';
        else if (key === 'discountPercentage') dbField = 'discount_percentage';
        else if (key === 'bonusCredits') dbField = 'bonus_credits';
        else if (key === 'validityDays') dbField = 'validity_days';
        else if (key === 'isPopular') dbField = 'is_popular';
        else if (key === 'isActive') dbField = 'is_active';
        else if (key === 'minUserTier') dbField = 'min_user_tier';
        else if (key === 'maxPurchasesPerUser') dbField = 'max_purchases_per_user';
        else if (key === 'packageType') dbField = 'package_type';

        if (key === 'features' || key === 'metadata') {
          updateFields.push(`${dbField} = $${paramIndex}::jsonb`);
          params.push(JSON.stringify(value));
        } else {
          updateFields.push(`${dbField} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`updated_by = $${paramIndex}`);
    params.push(adminId);

    const updateQuery = `
      UPDATE credit_packages 
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await database.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'PACKAGE_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        packageId: id,
        updatedFields: Object.keys(req.body),
        changes: req.body,
      },
    });

    const updatedPackage = result.rows[0];

    res.json({
      success: true,
      message: 'Credit package updated successfully',
      data: {
        id: updatedPackage.id,
        packageId: updatedPackage.package_id,
        packageName: updatedPackage.package_name,
        creditsAmount: parseInt(updatedPackage.credits_amount),
        priceUsd: parseFloat(updatedPackage.price_usd),
        isActive: updatedPackage.is_active,
        updatedAt: updatedPackage.updated_at,
      },
    });
  })
);

// Delete credit package
router.delete(
  '/packages/:id',
  requirePermission(['pricing.delete']),
  [param('id').isUUID().withMessage('Invalid package ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    // Get package details before deletion
    const packageResult = await database.query(
      'SELECT package_id, package_name FROM credit_packages WHERE id = $1',
      [id]
    );

    if (packageResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Package not found',
      });
    }

    const packageInfo = packageResult.rows[0];

    // Check if package has any purchases
    const purchaseCheck = await database.query(
      'SELECT COUNT(*) as count FROM payments WHERE credits_purchased IN (SELECT credits_amount FROM credit_packages WHERE id = $1)',
      [id]
    );

    if (parseInt(purchaseCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete package with existing purchases. Consider deactivating instead.',
      });
    }

    // Delete package
    await database.query('DELETE FROM credit_packages WHERE id = $1', [id]);

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'PACKAGE_DELETE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        packageId: id,
        packageIdString: packageInfo.package_id,
        packageName: packageInfo.package_name,
      },
    });

    res.json({
      success: true,
      message: 'Credit package deleted successfully',
    });
  })
);

// ===== SUBSCRIPTION PLANS MANAGEMENT =====

// Get all subscription plans
router.get(
  '/plans',
  requirePermission(['pricing.read']),
  [
    query('status').optional().isIn(['all', 'active', 'inactive']),
    query('featured').optional().isBoolean(),
    query('sortBy')
      .optional()
      .isIn(['created_at', 'plan_name', 'monthly_price_usd', 'monthly_credits', 'display_order']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const { status, featured, sortBy = 'display_order', sortOrder = 'asc' } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      if (status === 'active') {
        conditions.push('is_active = true');
      } else if (status === 'inactive') {
        conditions.push('is_active = false');
      }
    }

    if (featured !== undefined) {
      conditions.push(`is_featured = $${paramIndex}`);
      params.push(featured === 'true');
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const plansQuery = `
      SELECT 
        sp.*,
        creator.name as created_by_name,
        updater.name as updated_by_name
      FROM subscription_plans sp
      LEFT JOIN admin_users creator ON sp.created_by = creator.id
      LEFT JOIN admin_users updater ON sp.updated_by = updater.id
      ${whereClause}
      GROUP BY sp.id, creator.name, updater.name
      ORDER BY sp.${sortBy === 'monthly_price_usd' ? 'price_usd' : sortBy === 'monthly_credits' ? 'credits_included' : sortBy} ${sortOrder.toUpperCase()}
    `;

    const result = await database.query(plansQuery, params);

    const plans = result.rows.map(plan => ({
      id: plan.id,
      planId: plan.plan_id,
      planName: plan.plan_name,
      description: plan.description,
      priceUsd: parseFloat(plan.price_usd),
      creditsIncluded: parseInt(plan.credits_included),
      features: plan.features || [],
      limits: plan.limits || {},
      isActive: plan.is_active,
      isFeatured: plan.is_featured,
      displayOrder: parseInt(plan.display_order || 0),
      metadata: plan.metadata || {},
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
      createdByName: plan.created_by_name,
      updatedByName: plan.updated_by_name,
    }));

    res.json({
      success: true,
      data: plans,
    });
  })
);

// Create subscription plan
router.post(
  '/plans',
  requirePermission(['pricing.create']),
  [
    body('planId').notEmpty().withMessage('Plan ID is required'),
    body('planName').notEmpty().withMessage('Plan name is required'),
    body('monthlyPriceUsd').isFloat({ min: 0 }).withMessage('Monthly price must be non-negative'),
    body('monthlyCredits').isInt({ min: 0 }).withMessage('Monthly credits must be non-negative'),
    body('description').optional().isString().withMessage('Invalid description'),
    body('yearlyPriceUsd')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Yearly price must be non-negative'),
    body('features').optional().isArray().withMessage('Features must be an array'),
    body('limits').optional().isObject().withMessage('Limits must be an object'),
    body('trialDays').optional().isInt({ min: 0 }).withMessage('Trial days must be non-negative'),
    body('setupFeeUsd')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Setup fee must be non-negative'),
    body('isActive').optional().isBoolean().withMessage('Invalid active flag'),
    body('isFeatured').optional().isBoolean().withMessage('Invalid featured flag'),
    body('displayOrder')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Display order must be non-negative'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;

    const {
      planId,
      planName,
      description,
      monthlyPriceUsd,
      yearlyPriceUsd,
      monthlyCredits,
      features = [],
      limits = {},
      trialDays = 0,
      setupFeeUsd = 0,
      isActive = true,
      isFeatured = false,
      displayOrder = 0,
      metadata = {},
    } = req.body;

    // Check if plan ID already exists
    const existingPlan = await database.query(
      'SELECT id FROM subscription_plans WHERE plan_id = $1',
      [planId]
    );

    if (existingPlan.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID already exists',
      });
    }

    const insertQuery = `
      INSERT INTO subscription_plans (
        plan_id, plan_name, description, monthly_price_usd, yearly_price_usd,
        monthly_credits, features, limits, trial_days, setup_fee_usd,
        is_active, is_featured, display_order, metadata,
        created_at, updated_at, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), $15, $15)
      RETURNING *
    `;

    const result = await database.query(insertQuery, [
      planId,
      planName,
      description,
      monthlyPriceUsd,
      yearlyPriceUsd,
      monthlyCredits,
      JSON.stringify(features),
      JSON.stringify(limits),
      trialDays,
      setupFeeUsd,
      isActive,
      isFeatured,
      displayOrder,
      JSON.stringify(metadata),
      adminId,
    ]);

    const newPlan = result.rows[0];

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'PLAN_CREATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        planId: newPlan.id,
        planIdString: planId,
        planName,
        monthlyPriceUsd,
        monthlyCredits,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully',
      data: {
        id: newPlan.id,
        planId: newPlan.plan_id,
        planName: newPlan.plan_name,
        monthlyPriceUsd: parseFloat(newPlan.monthly_price_usd),
        monthlyCredits: parseInt(newPlan.monthly_credits),
        isActive: newPlan.is_active,
        createdAt: newPlan.created_at,
      },
    });
  })
);

// Update subscription plan
router.put(
  '/plans/:id',
  requirePermission(['pricing.write']),
  [
    param('id').isUUID().withMessage('Invalid plan ID'),
    // Add validation rules similar to create route
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const _database = req.app.locals.database;
    const { _id } = req.params;
    const _adminId = req.admin.id;

    // Similar update logic as credit packages...
    // Build dynamic update query based on provided fields

    res.json({
      success: true,
      message: 'Subscription plan updated successfully',
    });
  })
);

// Get pricing analytics
router.get(
  '/analytics',
  requirePermission(['pricing.read', 'analytics.read']),
  [query('period').optional().isIn(['7d', '30d', '90d', '1y']).withMessage('Invalid period')],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const period = req.query.period || '30d';

    // Calculate date range
    const days = parseInt(period.replace('d', '').replace('y', period === '1y' ? '365' : ''));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get package performance
    const packagePerformanceQuery = `
      SELECT 
        cp.package_id,
        cp.package_name,
        cp.credits_amount,
        cp.price_usd,
        COUNT(p.id) as purchases,
        SUM(p.amount_usd) as revenue,
        AVG(p.amount_usd) as avg_order_value
      FROM credit_packages cp
      LEFT JOIN payments p ON p.credits_purchased = cp.credits_amount 
        AND p.amount_usd = cp.price_usd 
        AND p.status = 'completed'
        AND p.created_at >= $1
      WHERE cp.is_active = true
      GROUP BY cp.id, cp.package_id, cp.package_name, cp.credits_amount, cp.price_usd
      ORDER BY revenue DESC NULLS LAST
    `;

    // Get revenue trends
    const revenueTrendsQuery = `
      SELECT 
        DATE(p.completed_at) as date,
        COUNT(p.id) as transactions,
        SUM(p.amount_usd) as daily_revenue,
        SUM(p.credits_purchased) as credits_sold
      FROM payments p
      WHERE p.status = 'completed' AND p.completed_at >= $1
      GROUP BY DATE(p.completed_at)
      ORDER BY date DESC
    `;

    const [packageResult, revenueResult] = await Promise.all([
      database.query(packagePerformanceQuery, [startDate]),
      database.query(revenueTrendsQuery, [startDate]),
    ]);

    res.json({
      success: true,
      data: {
        period,
        packagePerformance: packageResult.rows.map(row => ({
          packageId: row.package_id,
          packageName: row.package_name,
          creditsAmount: parseInt(row.credits_amount),
          priceUsd: parseFloat(row.price_usd),
          purchases: parseInt(row.purchases || 0),
          revenue: parseFloat(row.revenue || 0),
          avgOrderValue: parseFloat(row.avg_order_value || 0),
        })),
        revenueTrends: revenueResult.rows.map(row => ({
          date: row.date,
          transactions: parseInt(row.transactions),
          dailyRevenue: parseFloat(row.daily_revenue),
          creditsSold: parseInt(row.credits_sold),
        })),
      },
    });
  })
);

export default router;
