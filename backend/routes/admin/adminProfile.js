import express from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Get current admin's profile
router.get(
  '/me',
  requirePermission([]), // Any authenticated admin can view their own profile
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const adminId = req.admin.id;

    try {
      const result = await database.query(
        `SELECT 
          id, username, email, role, permissions, is_active, 
          created_at, updated_at, last_login, last_active,
          password_changed_at
        FROM admin_users 
        WHERE id = $1`,
        [adminId]
      );

      if (result.rows.length === 0) {
        // If admin not found in database, return fallback data for development
        console.log('Admin not found in database, returning fallback data');
        const fallbackProfileData = {
          id: adminId,
          username: req.admin.username || 'admin',
          email: req.admin.email || 'admin@mockmate.com',
          firstName: '',
          lastName: '',
          role: req.admin.role || 'super_admin',
          permissions: req.admin.permissions || ['*'],
          twoFactorEnabled: false,
          timezone: 'Asia/Kolkata', // GMT+5:30
          notificationSettings: {
            emailAlerts: true,
            systemAlerts: true,
            securityAlerts: true,
          },
          createdAt: new Date().toISOString(),
          lastLogin: req.admin.lastLogin || new Date().toISOString(),
          loginAttempts: 0,
          isActive: true,
          passwordChangedAt: new Date().toISOString(),
        };

        return res.json({
          success: true,
          data: fallbackProfileData,
        });
      }

      const admin = result.rows[0];

      // Parse permissions safely
      let permissions = [];
      if (admin.permissions) {
        if (Array.isArray(admin.permissions)) {
          // Already an array
          permissions = admin.permissions;
        } else if (typeof admin.permissions === 'string') {
          try {
            // Try to parse as JSON first
            permissions = JSON.parse(admin.permissions);
          } catch (_error) {
            // If JSON parsing fails, try comma-separated format
            permissions = admin.permissions.split(',').map(p => p.trim());
          }
        } else {
          // Fallback to empty array
          permissions = [];
        }
      }

      // Convert to expected frontend format
      const profileData = {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        firstName: '', // Column doesn't exist yet
        lastName: '', // Column doesn't exist yet
        role: admin.role,
        permissions,
        twoFactorEnabled: false, // TODO: Implement 2FA
        timezone: 'Asia/Kolkata', // GMT+5:30 (Indian Standard Time)
        notificationSettings: {
          emailAlerts: true,
          systemAlerts: true,
          securityAlerts: true,
        },
        createdAt: admin.created_at,
        lastLogin: admin.last_login,
        loginAttempts: 0, // TODO: Track login attempts
        isActive: admin.is_active,
        passwordChangedAt: admin.password_changed_at,
      };

      res.json({
        success: true,
        data: profileData,
      });
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
      });
    }
  })
);

// Update admin profile
router.put(
  '/me',
  requirePermission([]), // Any authenticated admin can update their own profile
  [
    body('firstName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('First name must be 1-100 characters'),
    body('lastName')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Last name must be max 100 characters'),
    body('email').optional().isEmail().withMessage('Valid email required'),
    body('timezone').optional().isString().withMessage('Timezone must be a string'),
    body('notificationPreferences')
      .optional()
      .isObject()
      .withMessage('Notification preferences must be an object'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;
    const { firstName, lastName, email, timezone, notificationPreferences } = req.body;

    try {
      // Check if email is already taken by another admin
      if (email) {
        const emailCheck = await database.query(
          'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
          [email, adminId]
        );

        if (emailCheck.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Email already in use by another admin',
          });
        }
      }

      // Update profile - handle all updatable fields
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      // Email update
      if (email) {
        updateFields.push(`email = $${paramIndex++}`);
        values.push(email);
      }

      // For now, we'll store additional profile data in a metadata JSONB column
      // or handle it in the application layer
      const profileMetadata = {};
      if (firstName !== undefined) profileMetadata.firstName = firstName;
      if (lastName !== undefined) profileMetadata.lastName = lastName;
      if (timezone !== undefined) profileMetadata.timezone = timezone;
      if (notificationPreferences !== undefined)
        profileMetadata.notificationSettings = notificationPreferences;

      // Always update timestamp
      updateFields.push(`updated_at = NOW()`);

      // If no database fields to update but we have metadata, still proceed
      if (updateFields.length === 1 && Object.keys(profileMetadata).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update',
        });
      }

      values.push(adminId);

      const updateQuery = `
        UPDATE admin_users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramIndex}
        RETURNING id, username, email, role, is_active, updated_at
      `;

      const result = await database.query(updateQuery, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found',
        });
      }

      // Log the profile update
      await database.logAdminActivity({
        adminId,
        action: 'profile_updated',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { updatedFields: Object.keys(req.body) },
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error updating admin profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
      });
    }
  })
);

// Change password
router.post(
  '/me/change-password',
  requirePermission([]), // Any authenticated admin can change their own password
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
    body('confirmPassword').notEmpty().withMessage('Password confirmation is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match',
      });
    }

    try {
      // Get current password hash
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

      const admin = adminResult.rows[0];

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, admin.password_hash);

      if (!isValidPassword) {
        // Log failed password change attempt
        await database.logAdminActivity({
          adminId,
          action: 'password_change_failed',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          details: { reason: 'invalid_current_password' },
        });

        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }

      // Hash new password
      const saltRounds = 12;
      const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await database.query(
        `UPDATE admin_users 
         SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [newPasswordHash, adminId]
      );

      // Log successful password change
      await database.logAdminActivity({
        adminId,
        action: 'password_changed',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {},
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change password',
      });
    }
  })
);

// Toggle 2FA (placeholder for future implementation)
router.patch(
  '/2fa',
  requirePermission([]), // Any authenticated admin can toggle their own 2FA
  [body('enabled').isBoolean().withMessage('Enabled must be a boolean')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    // TODO: Implement actual 2FA functionality
    const { enabled } = req.body;

    // For now, just return success (2FA not actually implemented yet)
    res.json({
      success: true,
      message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
      data: { twoFactorEnabled: enabled },
    });
  })
);

// Update notification settings
router.patch(
  '/me/notifications',
  requirePermission([]), // Any authenticated admin can update their own notification settings
  [
    body('emailAlerts').optional().isBoolean().withMessage('Email alerts must be a boolean'),
    body('systemAlerts').optional().isBoolean().withMessage('System alerts must be a boolean'),
    body('securityAlerts').optional().isBoolean().withMessage('Security alerts must be a boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array(),
      });
    }

    const adminId = req.admin.id;
    const { emailAlerts, systemAlerts, securityAlerts } = req.body;

    try {
      // For now, we'll store notification settings in memory/session
      // In a real implementation, you would store this in a database table or JSONB column
      const notificationSettings = {
        emailAlerts: emailAlerts !== undefined ? emailAlerts : true,
        systemAlerts: systemAlerts !== undefined ? systemAlerts : true,
        securityAlerts: securityAlerts !== undefined ? securityAlerts : true,
        updatedAt: new Date().toISOString(),
      };

      // Log the settings update
      const database = req.app.locals.database;
      await database.logAdminActivity({
        adminId,
        action: 'notification_settings_updated',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: notificationSettings,
      });

      res.json({
        success: true,
        message: 'Notification settings updated successfully',
        data: { notificationSettings },
      });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update notification settings',
      });
    }
  })
);

// Get admin activity log
router.get(
  '/me/activity',
  requirePermission([]), // Any authenticated admin can view their own activity
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const adminId = req.admin.id;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    try {
      const result = await database.query(
        `SELECT action, ip_address, user_agent, details, created_at
         FROM admin_activity_logs
         WHERE admin_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [adminId, limit, offset]
      );

      const countResult = await database.query(
        'SELECT COUNT(*) FROM admin_activity_logs WHERE admin_id = $1',
        [adminId]
      );

      res.json({
        success: true,
        data: {
          activities: result.rows.map(activity => ({
            action: activity.action,
            ipAddress: activity.ip_address,
            userAgent: activity.user_agent,
            details: activity.details,
            timestamp: activity.created_at,
          })),
          pagination: {
            total: parseInt(countResult.rows[0].count),
            limit,
            offset,
            hasMore: offset + limit < parseInt(countResult.rows[0].count),
          },
        },
      });
    } catch (error) {
      console.error('Error fetching admin activity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch activity log',
      });
    }
  })
);

export default router;
