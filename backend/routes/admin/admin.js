import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import {
  adminLoginLimiter,
  loginAdmin,
  logoutAdmin,
  refreshAdminToken,
  requirePermission,
} from '../../middleware/admin/adminAuth.js';

// Import sub-routes
import enhancedUsersRoutes from './enhanced_users.js';
import analyticsRoutes from './analytics.js';
import sessionsRoutes from './sessions.js';
import configRoutes from './configuration.js';
import pricingRoutes from './pricing_management.js';
import adminProfileRoutes from './admin_profile.js';
import reportsRoutes from './reports.js';
import emailNotificationsRoutes from './emailNotifications.js';

const router = express.Router();

// Admin login endpoint (public - no auth required)
router.post(
  '/login',
  adminLoginLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3-50 characters'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';

    try {
      const database = req.app.locals.database;
      const redis = req.app.locals.redis;

      const result = await loginAdmin(database, redis, username, password, ipAddress, userAgent);

      res.json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (_error) {
      // Generic error message for security
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }
  })
);

// Admin login endpoint with auth prefix (public - no auth required)
router.post(
  '/auth/login',
  adminLoginLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3-50 characters'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';

    try {
      const database = req.app.locals.database;
      const redis = req.app.locals.redis;

      const result = await loginAdmin(database, redis, username, password, ipAddress, userAgent);

      res.json({
        success: true,
        message: 'Login successful',
        data: result,
      });
    } catch (_error) {
      // Generic error message for security
      res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }
  })
);

// Token refresh endpoint (public - uses refresh token)
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { refreshToken } = req.body;

    try {
      const database = req.app.locals.database;
      const redis = req.app.locals.redis;

      const result = await refreshAdminToken(database, redis, refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: result,
      });
    } catch (_error) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }
  })
);

// Token validation endpoint (protected - validates current token)
router.get(
  '/validate-token',
  asyncHandler(async (req, res) => {
    // This endpoint is protected by adminAuth middleware
    // If we reach here, the token is valid
    res.json({
      success: true,
      message: 'Token is valid',
      data: {
        admin: req.admin,
        tokenValid: true,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

// Admin logout endpoint
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    try {
      const database = req.app.locals.database;
      const redis = req.app.locals.redis;

      // Extract token from header
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.substring(7); // Remove 'Bearer '
      const { refreshToken } = req.body;

      if (req.admin && accessToken) {
        await logoutAdmin(database, redis, req.admin.id, accessToken, refreshToken);
      }

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (_error) {
      // Even if logout fails, return success for security
      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    }
  })
);

// Profile routes are now handled by the separate admin_profile.js router mounted at /profile

// Get all admins (super admin only)
router.get(
  '/admins',
  requirePermission(['admin.read', 'user.management']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
    query('role').optional().isIn(['admin', 'super_admin']).withMessage('Invalid role'),
    query('status').optional().isIn(['active', 'inactive']).withMessage('Invalid status'),
    query('search').optional().isLength({ max: 100 }).withMessage('Search term too long'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const database = req.app.locals.database;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '20');
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (req.query.role) {
      conditions.push(`role = $${paramIndex++}`);
      params.push(req.query.role);
    }

    if (req.query.status) {
      const isActive = req.query.status === 'active';
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(isActive);
    }

    if (req.query.search) {
      conditions.push(`(username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
      params.push(`%${req.query.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get admins with activity counts
    const adminsQuery = `
      SELECT 
        a.id, a.username, a.email, a.role, a.is_active,
        a.created_at, a.last_login, a.last_active, a.created_by,
        COUNT(DISTINCT aal.id) as activity_count
      FROM admin_users a
      LEFT JOIN admin_activity_logs aal ON a.id = aal.admin_id
      ${whereClause}
      GROUP BY a.id, a.username, a.email, a.role, a.is_active, 
               a.created_at, a.last_login, a.last_active, a.created_by
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_users a
      ${whereClause}
    `;

    const [adminsResult, countResult] = await Promise.all([
      database.query(adminsQuery, params.slice(0, -2)), // Remove limit/offset for count
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const totalAdmins = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalAdmins / limit);

    res.json({
      success: true,
      data: {
        admins: adminsResult.rows.map(admin => ({
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          isActive: admin.is_active,
          createdAt: admin.created_at,
          lastLogin: admin.last_login,
          lastActive: admin.last_active,
          createdBy: admin.created_by,
          activityCount: parseInt(admin.activity_count || 0),
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalAdmins,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  })
);

// Create new admin (super admin only)
router.post(
  '/admins',
  requirePermission(['admin.create', 'user.management']),
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-50 characters, alphanumeric, underscore, or dash only'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain uppercase, lowercase, number and special character'),
    body('role').isIn(['admin', 'super_admin']).withMessage('Role must be admin or super_admin'),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { username, email, password, role, permissions = [] } = req.body;
    const database = req.app.locals.database;

    // Check if username or email already exists
    const existingAdminResult = await database.query(
      'SELECT id, username, email FROM admin_users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingAdminResult.rows.length > 0) {
      const existing = existingAdminResult.rows[0];
      const conflict = existing.username === username ? 'username' : 'email';

      return res.status(409).json({
        success: false,
        error: `${conflict.charAt(0).toUpperCase() + conflict.slice(1)} already exists`,
        code: `${conflict.toUpperCase()}_ALREADY_EXISTS`,
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin
    const createAdminQuery = `
      INSERT INTO admin_users (
        username, email, password_hash, role, permissions, 
        is_active, created_by, created_at
      ) VALUES ($1, $2, $3, $4, $5, true, $6, NOW())
      RETURNING id, username, email, role, is_active, created_at
    `;

    const newAdminResult = await database.query(createAdminQuery, [
      username,
      email,
      passwordHash,
      role,
      JSON.stringify(permissions),
      req.admin.id,
    ]);

    const newAdmin = newAdminResult.rows[0];

    // Log admin creation
    await database.logAdminActivity({
      adminId: req.admin.id,
      action: 'ADMIN_CREATED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        newAdminId: newAdmin.id,
        username: newAdmin.username,
        role: newAdmin.role,
        permissions,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        admin: {
          id: newAdmin.id,
          username: newAdmin.username,
          email: newAdmin.email,
          role: newAdmin.role,
          isActive: newAdmin.is_active,
          createdAt: newAdmin.created_at,
        },
      },
    });
  })
);

// Update admin (super admin only or self for limited fields)
router.put(
  '/admins/:adminId',
  requirePermission(['admin.update', 'user.management']),
  [
    param('adminId').isUUID().withMessage('Valid admin ID required'),
    body('email').optional().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'super_admin']),
    body('permissions').optional().isArray(),
    body('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { adminId } = req.params;
    const { email, role, permissions, isActive } = req.body;
    const database = req.app.locals.database;

    // Check if admin exists
    const adminQuery = 'SELECT * FROM admin_users WHERE id = $1';
    const adminResult = await database.query(adminQuery, [adminId]);

    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
      });
    }

    const targetAdmin = adminResult.rows[0];

    // Prevent self-deactivation
    if (adminId === req.admin.id && isActive === false) {
      return res.status(400).json({
        success: false,
        error: 'Cannot deactivate your own account',
        code: 'CANNOT_DEACTIVATE_SELF',
      });
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (email && email !== targetAdmin.email) {
      // Check email uniqueness
      const emailCheckResult = await database.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [email, adminId]
      );

      if (emailCheckResult.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Email already in use',
        });
      }

      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }

    if (role && role !== targetAdmin.role) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }

    if (permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(permissions));
    }

    if (isActive !== undefined && isActive !== targetAdmin.is_active) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided',
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(adminId);

    const updateQuery = `
      UPDATE admin_users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, email, role, is_active, updated_at
    `;

    const updateResult = await database.query(updateQuery, values);
    const updatedAdmin = updateResult.rows[0];

    // Log admin update
    await database.logAdminActivity({
      adminId: req.admin.id,
      action: 'ADMIN_UPDATED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        updatedAdminId: adminId,
        updatedFields: Object.keys(req.body),
        previousData: {
          email: targetAdmin.email,
          role: targetAdmin.role,
          isActive: targetAdmin.is_active,
        },
      },
    });

    res.json({
      success: true,
      message: 'Admin updated successfully',
      data: {
        admin: {
          id: updatedAdmin.id,
          username: updatedAdmin.username,
          email: updatedAdmin.email,
          role: updatedAdmin.role,
          isActive: updatedAdmin.is_active,
          updatedAt: updatedAdmin.updated_at,
        },
      },
    });
  })
);

// Delete admin (super admin only, cannot delete self)
router.delete(
  '/admins/:adminId',
  requirePermission(['admin.delete', 'user.management']),
  [param('adminId').isUUID().withMessage('Valid admin ID required')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { adminId } = req.params;
    const database = req.app.locals.database;

    // Prevent self-deletion
    if (adminId === req.admin.id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
        code: 'CANNOT_DELETE_SELF',
      });
    }

    // Check if admin exists
    const adminResult = await database.query(
      'SELECT username, role FROM admin_users WHERE id = $1',
      [adminId]
    );

    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
      });
    }

    const targetAdmin = adminResult.rows[0];

    // Delete admin (cascade should handle related records)
    await database.query('DELETE FROM admin_users WHERE id = $1', [adminId]);

    // Log admin deletion
    await database.logAdminActivity({
      adminId: req.admin.id,
      action: 'ADMIN_DELETED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        deletedAdminId: adminId,
        deletedUsername: targetAdmin.username,
        deletedRole: targetAdmin.role,
      },
    });

    res.json({
      success: true,
      message: 'Admin deleted successfully',
    });
  })
);

// Get admin activity logs
router.get(
  '/activity',
  requirePermission(['admin.read', 'logs.read']),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('admin_id').optional().isUUID(),
    query('action').optional().isLength({ max: 50 }),
    query('from_date').optional().isISO8601(),
    query('to_date').optional().isISO8601(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const database = req.app.locals.database;
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '50');
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (req.query.admin_id) {
      conditions.push(`aal.admin_id = $${paramIndex++}`);
      params.push(req.query.admin_id);
    }

    if (req.query.action) {
      conditions.push(`aal.action ILIKE $${paramIndex++}`);
      params.push(`%${req.query.action}%`);
    }

    if (req.query.from_date) {
      conditions.push(`aal.created_at >= $${paramIndex++}`);
      params.push(req.query.from_date);
    }

    if (req.query.to_date) {
      conditions.push(`aal.created_at <= $${paramIndex++}`);
      params.push(req.query.to_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get activity logs with admin details
    const activityQuery = `
      SELECT 
        aal.id, aal.admin_id, aal.action, aal.ip_address, 
        aal.user_agent, aal.created_at, aal.details,
        au.username, au.role
      FROM admin_activity_logs aal
      LEFT JOIN admin_users au ON aal.admin_id = au.id
      ${whereClause}
      ORDER BY aal.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_activity_logs aal
      ${whereClause}
    `;

    const [activityResult, countResult] = await Promise.all([
      database.query(activityQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const totalActivities = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalActivities / limit);

    res.json({
      success: true,
      data: {
        activities: activityResult.rows.map(activity => ({
          id: activity.id,
          adminId: activity.admin_id,
          adminUsername: activity.username || 'Deleted Admin',
          adminRole: activity.role,
          action: activity.action,
          ipAddress: activity.ip_address,
          userAgent: activity.user_agent,
          timestamp: activity.created_at,
          details: activity.details,
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalActivities,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  })
);

// Mount sub-routes
router.use('/users-enhanced', enhancedUsersRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/sessions', sessionsRoutes);
router.use('/config', configRoutes);
router.use('/pricing', pricingRoutes);
router.use('/profile', adminProfileRoutes);
router.use('/reports', reportsRoutes);
router.use('/email-notifications', emailNotificationsRoutes);

export default router;
