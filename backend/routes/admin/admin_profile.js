import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Get current admin profile
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const adminId = req.admin.id;

    const result = await database.query(
      `
      SELECT 
        id, username, email, name, first_name, last_name, phone, avatar_url,
        role, permissions, department, job_title, timezone, is_active,
        two_factor_enabled, notification_preferences, created_at, last_login,
        last_active, password_changed_at
      FROM admin_users 
      WHERE id = $1
    `,
      [adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found',
      });
    }

    const admin = result.rows[0];

    res.json({
      success: true,
      data: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        name: admin.name,
        firstName: admin.first_name,
        lastName: admin.last_name,
        phone: admin.phone,
        avatarUrl: admin.avatar_url,
        role: admin.role,
        permissions: admin.permissions || [],
        department: admin.department,
        jobTitle: admin.job_title,
        timezone: admin.timezone,
        isActive: admin.is_active,
        twoFactorEnabled: admin.two_factor_enabled,
        notificationPreferences: admin.notification_preferences || {},
        createdAt: admin.created_at,
        lastLogin: admin.last_login,
        lastActive: admin.last_active,
        passwordChangedAt: admin.password_changed_at,
      },
    });
  })
);

// Update admin profile
router.put(
  '/me',
  [
    body('name').optional().isLength({ min: 1, max: 255 }).withMessage('Invalid name'),
    body('firstName').optional().isLength({ max: 100 }).withMessage('Invalid first name'),
    body('lastName').optional().isLength({ max: 100 }).withMessage('Invalid last name'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('phone').optional().isLength({ max: 20 }).withMessage('Invalid phone'),
    body('department').optional().isLength({ max: 100 }).withMessage('Invalid department'),
    body('jobTitle').optional().isLength({ max: 100 }).withMessage('Invalid job title'),
    body('timezone').optional().isLength({ max: 100 }).withMessage('Invalid timezone'),
    body('notificationPreferences')
      .optional()
      .isObject()
      .withMessage('Invalid notification preferences'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;

    const {
      name,
      firstName,
      lastName,
      email,
      phone,
      department,
      jobTitle,
      timezone,
      notificationPreferences,
    } = req.body;

    // Build update query dynamically
    const updateFields = [];
    const params = [adminId];
    let paramIndex = 2;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex}`);
      params.push(firstName);
      paramIndex++;
    }

    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex}`);
      params.push(lastName);
      paramIndex++;
    }

    if (email !== undefined) {
      // Check if email already exists
      const existingAdmin = await database.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [email, adminId]
      );
      if (existingAdmin.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists',
        });
      }

      updateFields.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }

    if (department !== undefined) {
      updateFields.push(`department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }

    if (jobTitle !== undefined) {
      updateFields.push(`job_title = $${paramIndex}`);
      params.push(jobTitle);
      paramIndex++;
    }

    if (timezone !== undefined) {
      updateFields.push(`timezone = $${paramIndex}`);
      params.push(timezone);
      paramIndex++;
    }

    if (notificationPreferences !== undefined) {
      updateFields.push(`notification_preferences = $${paramIndex}::jsonb`);
      params.push(JSON.stringify(notificationPreferences));
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updateFields.push(`updated_at = NOW()`);

    const updateQuery = `
      UPDATE admin_users 
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await database.query(updateQuery, params);
    const updatedAdmin = result.rows[0];

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'ADMIN_PROFILE_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        updatedFields: Object.keys(req.body),
        changes: req.body,
      },
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updatedAdmin.id,
        username: updatedAdmin.username,
        email: updatedAdmin.email,
        name: updatedAdmin.name,
        firstName: updatedAdmin.first_name,
        lastName: updatedAdmin.last_name,
        phone: updatedAdmin.phone,
        department: updatedAdmin.department,
        jobTitle: updatedAdmin.job_title,
        timezone: updatedAdmin.timezone,
        notificationPreferences: updatedAdmin.notification_preferences || {},
        updatedAt: updatedAdmin.updated_at,
      },
    });
  })
);

// Change password
router.post(
  '/me/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match');
      }
      return true;
    }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;
    const { currentPassword, newPassword } = req.body;

    // Get current admin
    const adminResult = await database.query(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [adminId]
    );

    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      adminResult.rows[0].password_hash
    );
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
      });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await database.query(
      `
      UPDATE admin_users 
      SET 
        password_hash = $1,
        password_changed_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
    `,
      [newPasswordHash, adminId]
    );

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'ADMIN_PASSWORD_CHANGE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        message: 'Admin changed their password',
      },
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  })
);

// Get all admin users (super admin only)
router.get(
  '/',
  requirePermission(['admin.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('role').optional().isIn(['all', 'admin', 'super_admin']),
    query('status').optional().isIn(['all', 'active', 'inactive']),
    query('sortBy').optional().isIn(['created_at', 'last_login', 'name', 'email', 'role']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { search, role, status, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        name ILIKE $${paramIndex} OR 
        username ILIKE $${paramIndex} OR 
        email ILIKE $${paramIndex} OR
        first_name ILIKE $${paramIndex} OR
        last_name ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role && role !== 'all') {
      conditions.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (status && status !== 'all') {
      if (status === 'active') {
        conditions.push(`is_active = true`);
      } else if (status === 'inactive') {
        conditions.push(`is_active = false`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const adminsQuery = `
      SELECT 
        a.id, a.username, a.email, a.name, a.first_name, a.last_name,
        a.phone, a.avatar_url, a.role, a.department, a.job_title,
        a.is_active, a.two_factor_enabled, a.created_at, a.last_login,
        a.last_active, a.password_changed_at,
        creator.name as created_by_name,
        COUNT(aal.id) as activity_count
      FROM admin_users a
      LEFT JOIN admin_users creator ON a.created_by = creator.id
      LEFT JOIN admin_activity_log aal ON a.id = aal.admin_id
      ${whereClause}
      GROUP BY a.id, creator.name
      ORDER BY ${sortBy === 'activity_count' ? 'COUNT(aal.id)' : `a.${sortBy}`} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_users a
      ${whereClause}
    `;

    params.push(limit, offset);

    const [adminsResult, countResult] = await Promise.all([
      database.query(adminsQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const admins = adminsResult.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      name: row.name,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      role: row.role,
      department: row.department,
      jobTitle: row.job_title,
      isActive: row.is_active,
      twoFactorEnabled: row.two_factor_enabled,
      createdAt: row.created_at,
      lastLogin: row.last_login,
      lastActive: row.last_active,
      passwordChangedAt: row.password_changed_at,
      createdByName: row.created_by_name,
      activityCount: parseInt(row.activity_count || 0),
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        admins,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { search, role, status, sortBy, sortOrder },
      },
    });
  })
);

// Create new admin user (super admin only)
router.post(
  '/',
  requirePermission(['admin.create']),
  [
    body('username').isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').notEmpty().withMessage('Name is required'),
    body('role').isIn(['admin', 'super_admin']).withMessage('Invalid role'),
    body('firstName').optional().isLength({ max: 100 }).withMessage('Invalid first name'),
    body('lastName').optional().isLength({ max: 100 }).withMessage('Invalid last name'),
    body('phone').optional().isLength({ max: 20 }).withMessage('Invalid phone'),
    body('department').optional().isLength({ max: 100 }).withMessage('Invalid department'),
    body('jobTitle').optional().isLength({ max: 100 }).withMessage('Invalid job title'),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const creatorId = req.admin.id;

    const {
      username,
      email,
      password,
      name,
      role,
      firstName,
      lastName,
      phone,
      department,
      jobTitle,
      permissions = [],
    } = req.body;

    // Check if username or email already exists
    const existingAdmin = await database.query(
      'SELECT id FROM admin_users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create admin user
    const result = await database.query(
      `
      INSERT INTO admin_users (
        username, email, password_hash, name, role, permissions,
        first_name, last_name, phone, department, job_title,
        created_by, created_at, updated_at, password_changed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())
      RETURNING *
    `,
      [
        username,
        email,
        passwordHash,
        name,
        role,
        JSON.stringify(permissions),
        firstName,
        lastName,
        phone,
        department,
        jobTitle,
        creatorId,
      ]
    );

    const newAdmin = result.rows[0];

    // Log admin activity
    await database.logAdminActivity({
      adminId: creatorId,
      action: 'ADMIN_CREATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        newAdminId: newAdmin.id,
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.role,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        id: newAdmin.id,
        username: newAdmin.username,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
        isActive: newAdmin.is_active,
        createdAt: newAdmin.created_at,
      },
    });
  })
);

// Update admin user (super admin only)
router.put(
  '/:id',
  requirePermission(['admin.write']),
  [
    param('id').isUUID().withMessage('Invalid admin ID'),
    body('name').optional().isLength({ min: 1, max: 255 }).withMessage('Invalid name'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('role').optional().isIn(['admin', 'super_admin']).withMessage('Invalid role'),
    body('isActive').optional().isBoolean().withMessage('Invalid active status'),
    body('permissions').optional().isArray().withMessage('Permissions must be an array'),
    body('firstName').optional().isLength({ max: 100 }).withMessage('Invalid first name'),
    body('lastName').optional().isLength({ max: 100 }).withMessage('Invalid last name'),
    body('phone').optional().isLength({ max: 20 }).withMessage('Invalid phone'),
    body('department').optional().isLength({ max: 100 }).withMessage('Invalid department'),
    body('jobTitle').optional().isLength({ max: 100 }).withMessage('Invalid job title'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const updaterId = req.admin.id;

    // Prevent self-modification of critical fields
    if (id === updaterId && (req.body.role || req.body.isActive === false)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify your own role or active status',
      });
    }

    const {
      name,
      email,
      role,
      isActive,
      permissions,
      firstName,
      lastName,
      phone,
      department,
      jobTitle,
    } = req.body;

    // Build update query dynamically
    const updateFields = [];
    const params = [id];
    let paramIndex = 2;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (email !== undefined) {
      // Check if email already exists
      const existingAdmin = await database.query(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (existingAdmin.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists',
        });
      }

      updateFields.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (role !== undefined) {
      updateFields.push(`role = $${paramIndex}`);
      params.push(role);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (permissions !== undefined) {
      updateFields.push(`permissions = $${paramIndex}::jsonb`);
      params.push(JSON.stringify(permissions));
      paramIndex++;
    }

    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex}`);
      params.push(firstName);
      paramIndex++;
    }

    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex}`);
      params.push(lastName);
      paramIndex++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }

    if (department !== undefined) {
      updateFields.push(`department = $${paramIndex}`);
      params.push(department);
      paramIndex++;
    }

    if (jobTitle !== undefined) {
      updateFields.push(`job_title = $${paramIndex}`);
      params.push(jobTitle);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updateFields.push(`updated_at = NOW()`);

    const updateQuery = `
      UPDATE admin_users 
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await database.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId: updaterId,
      action: 'ADMIN_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        targetAdminId: id,
        updatedFields: Object.keys(req.body),
        changes: req.body,
      },
    });

    const updatedAdmin = result.rows[0];

    res.json({
      success: true,
      message: 'Admin user updated successfully',
      data: {
        id: updatedAdmin.id,
        username: updatedAdmin.username,
        email: updatedAdmin.email,
        name: updatedAdmin.name,
        role: updatedAdmin.role,
        isActive: updatedAdmin.is_active,
        permissions: updatedAdmin.permissions || [],
        firstName: updatedAdmin.first_name,
        lastName: updatedAdmin.last_name,
        phone: updatedAdmin.phone,
        department: updatedAdmin.department,
        jobTitle: updatedAdmin.job_title,
        updatedAt: updatedAdmin.updated_at,
      },
    });
  })
);

// Delete admin user (super admin only)
router.delete(
  '/:id',
  requirePermission(['admin.delete']),
  [param('id').isUUID().withMessage('Invalid admin ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const deleterId = req.admin.id;

    // Prevent self-deletion
    if (id === deleterId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
      });
    }

    // Get admin details before deletion
    const adminResult = await database.query(
      'SELECT username, email, name, role FROM admin_users WHERE id = $1',
      [id]
    );

    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found',
      });
    }

    const adminToDelete = adminResult.rows[0];

    // Delete admin user
    await database.query('DELETE FROM admin_users WHERE id = $1', [id]);

    // Log admin activity
    await database.logAdminActivity({
      adminId: deleterId,
      action: 'ADMIN_DELETE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        deletedAdminId: id,
        deletedAdminUsername: adminToDelete.username,
        deletedAdminEmail: adminToDelete.email,
        deletedAdminName: adminToDelete.name,
        deletedAdminRole: adminToDelete.role,
      },
    });

    res.json({
      success: true,
      message: 'Admin user deleted successfully',
    });
  })
);

// Toggle two-factor authentication
router.patch(
  '/2fa',
  [body('enabled').isBoolean().withMessage('Enabled must be a boolean')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;
    const { enabled } = req.body;

    // Update 2FA status
    const result = await database.query(
      `
      UPDATE admin_users 
      SET 
        two_factor_enabled = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING two_factor_enabled
    `,
      [enabled, adminId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: enabled ? 'ADMIN_2FA_ENABLE' : 'ADMIN_2FA_DISABLE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        message: `Admin ${enabled ? 'enabled' : 'disabled'} two-factor authentication`,
      },
    });

    res.json({
      success: true,
      message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        twoFactorEnabled: result.rows[0].two_factor_enabled,
      },
    });
  })
);

export default router;
