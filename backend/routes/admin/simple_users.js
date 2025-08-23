import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../../middleware/admin/errorHandler.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Get simplified user list that works with the actual database structure
router.get(
  '/',
  requirePermission(['users.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('status').optional().isIn(['all', 'active', 'inactive', 'suspended']),
    query('subscription_tier').optional().isIn(['all', 'free', 'pro', 'enterprise']),
    query('sortBy').optional().isIn(['created_at', 'last_activity', 'credits', 'name', 'email']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const {
      search,
      status,
      subscription_tier,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    // Map frontend sortBy parameters to database columns
    const sortByMapping = {
      created_at: 'created_at',
      registrationDate: 'created_at',
      last_activity: 'last_activity',
      lastActivity: 'last_activity',
      credits: 'credits',
      name: 'name',
      email: 'email',
    };

    const validSortBy = sortByMapping[sortBy] || 'created_at';
    const validSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        u.name ILIKE $${paramIndex} OR 
        u.first_name ILIKE $${paramIndex} OR 
        u.last_name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      switch (status) {
        case 'active':
          conditions.push(`u.is_active = true AND u.is_suspended = false`);
          break;
        case 'inactive':
          conditions.push(`u.is_active = false`);
          break;
        case 'suspended':
          conditions.push(`u.is_suspended = true`);
          break;
      }
    }

    if (subscription_tier && subscription_tier !== 'all') {
      conditions.push(`u.subscription_tier = $${paramIndex}`);
      params.push(subscription_tier);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const usersQuery = `
      SELECT 
        u.id, u.name, u.first_name, u.last_name, u.email, u.phone,
        u.credits, u.subscription_tier, u.is_active, u.is_verified, u.is_suspended,
        u.suspension_reason, u.suspended_at, u.admin_notes,
        u.created_at, u.last_activity, u.total_sessions, u.total_spent_usd,
        u.avatar_url,
        
        -- Get session count from sessions table
        COUNT(DISTINCT s.id) as session_count,
        COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_sessions,
        
        -- Get payment info
        COUNT(DISTINCT p.id) as payment_count,
        COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount_usd ELSE 0 END), 0) as total_payments
        
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      LEFT JOIN payments p ON u.id = p.user_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.${validSortBy} ${validSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      ${whereClause}
    `;

    params.push(limit, offset);

    try {
      const [usersResult, countResult] = await Promise.all([
        database.query(usersQuery, params),
        database.query(countQuery, params.slice(0, -2)),
      ]);

      const users = usersResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        avatarUrl: row.avatar_url,

        // Account status
        credits: parseInt(row.credits || 0),
        subscriptionTier: row.subscription_tier,
        isActive: row.is_active,
        isVerified: row.is_verified,
        isSuspended: row.is_suspended,
        suspensionReason: row.suspension_reason,

        // Registration info
        registrationDate: row.created_at,
        lastActivity: row.last_activity,

        // Statistics
        totalSessions: parseInt(row.total_sessions || 0),
        sessionCount: parseInt(row.session_count || 0),
        completedSessions: parseInt(row.completed_sessions || 0),

        // Financial
        totalSpent: parseFloat(row.total_spent_usd || 0),
        paymentCount: parseInt(row.payment_count || 0),
        totalPayments: parseFloat(row.total_payments || 0),

        // Admin
        adminNotes: row.admin_notes,
      }));

      const totalRecords = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalRecords / limit);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page,
            limit,
            totalRecords,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        },
      });
    } catch (error) {
      console.error('Database query error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error.message,
      });
    }
  })
);

// Suspend user
router.patch(
  '/:id/suspend',
  requirePermission(['users.suspend']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('reason').optional().isString().withMessage('Reason must be a string'),
    body('admin_notes').optional().isString().withMessage('Admin notes must be a string'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { reason = 'Suspended by admin', admin_notes } = req.body;

    try {
      const result = await database.query(
        `UPDATE users 
         SET is_suspended = true, 
             suspension_reason = $1, 
             suspended_at = NOW(), 
             admin_notes = $2,
             updated_at = NOW()
         WHERE id = $3 
         RETURNING id, email, is_suspended`,
        [reason, admin_notes, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        message: 'User suspended successfully',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error suspending user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to suspend user',
        error: error.message,
      });
    }
  })
);

// Unsuspend user
router.patch(
  '/:id/unsuspend',
  requirePermission(['users.suspend']),
  [param('id').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    try {
      const result = await database.query(
        `UPDATE users 
         SET is_suspended = false, 
             suspension_reason = NULL, 
             suspended_at = NULL,
             updated_at = NOW()
         WHERE id = $1 
         RETURNING id, email, is_suspended`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        message: 'User unsuspended successfully',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error unsuspending user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unsuspend user',
        error: error.message,
      });
    }
  })
);

// Update user credits
router.patch(
  '/:id/credits',
  requirePermission(['users.credits']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('credits').isInt({ min: 0 }).withMessage('Credits must be a non-negative integer'),
    body('admin_notes').optional().isString().withMessage('Admin notes must be a string'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { credits, admin_notes } = req.body;

    try {
      const result = await database.query(
        `UPDATE users 
         SET credits = $1, 
             admin_notes = $2,
             updated_at = NOW()
         WHERE id = $3 
         RETURNING id, email, credits`,
        [credits, admin_notes, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        message: 'User credits updated successfully',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating user credits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user credits',
        error: error.message,
      });
    }
  })
);

export default router;
