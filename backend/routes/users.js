import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { getDatabase } from '../config/database.js';
import { logger, logError, logSecurityEvent } from '../config/logger.js';

const router = express.Router();

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

// Validation rules
const profileUpdateValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
];

const passwordChangeValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
];

/**
 * GET /api/users/profile
 * Get current user profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    
    const userQuery = `
      SELECT id, email, first_name, last_name, name, credits, created_at, last_activity, is_verified
      FROM users WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [req.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        name: user.name,
        credits: user.credits,
        createdAt: user.created_at,
        lastActivity: user.last_activity,
        isVerified: user.is_verified,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'get-profile', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to get user profile',
      code: 'PROFILE_GET_ERROR',
    });
  }
});

/**
 * PUT /api/users/profile
 * Update user profile information
 */
router.put('/profile', authenticateToken, profileUpdateValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { firstName, lastName, email } = req.body;
    const pool = getPool();

    // Check if email is already taken by another user
    if (email !== req.user.email) {
      const existingUserQuery = 'SELECT id FROM users WHERE email = $1 AND id != $2';
      const existingUser = await pool.query(existingUserQuery, [email, req.user.id]);
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: 'Email address is already in use',
          code: 'EMAIL_TAKEN',
        });
      }
    }

    // Update user profile
    const updateQuery = `
      UPDATE users 
      SET first_name = $1, last_name = $2, email = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING id, email, first_name, last_name, name, credits, created_at, updated_at
    `;
    
    const result = await pool.query(updateQuery, [
      firstName,
      lastName,
      email,
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const updatedUser = result.rows[0];

    // If email changed, mark as unverified and send verification email
    let emailVerificationRequired = false;
    if (email !== req.user.email) {
      await pool.query('UPDATE users SET is_verified = FALSE WHERE id = $1', [req.user.id]);
      emailVerificationRequired = true;

      // TODO: Send email verification
      logger.info('Email changed, verification required', {
        userId: req.user.id,
        oldEmail: req.user.email,
        newEmail: email,
      });
    }

    logSecurityEvent('PROFILE_UPDATED', {
      userId: req.user.id,
      email: email,
      emailChanged: email !== req.user.email,
      ip: req.ip,
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        name: updatedUser.name,
        credits: updatedUser.credits,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at,
      },
      emailVerificationRequired,
    });
  } catch (error) {
    logError(error, { endpoint: 'update-profile', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to update profile',
      code: 'PROFILE_UPDATE_ERROR',
    });
  }
});

/**
 * POST /api/users/change-password
 * Change user password
 */
router.post('/change-password', authenticateToken, passwordChangeValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { currentPassword, newPassword } = req.body;
    const pool = getPool();

    // Get current user with password hash
    const userQuery = `
      SELECT id, email, password_hash, first_name, last_name
      FROM users WHERE id = $1
    `;
    const userResult = await pool.query(userQuery, [req.user.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      logSecurityEvent('PASSWORD_CHANGE_FAILED_INVALID_CURRENT', {
        userId: req.user.id,
        email: user.email,
        ip: req.ip,
      });

      return res.status(400).json({
        error: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear any existing reset tokens
    await pool.query('BEGIN');
    try {
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hashedNewPassword, req.user.id]
      );

      // Clear any password reset tokens
      await pool.query('DELETE FROM password_resets WHERE user_id = $1', [req.user.id]);

      // Invalidate all refresh tokens to force re-login
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

      await pool.query('COMMIT');

      logSecurityEvent('PASSWORD_CHANGED', {
        userId: req.user.id,
        email: user.email,
        ip: req.ip,
      });

      // Send password change confirmation email
      try {
        const { emailService } = await import('../services/EmailService.js');
        await emailService.sendPasswordChangeConfirmation({
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          name: user.first_name,
        });
      } catch (emailError) {
        logger.error('Failed to send password change confirmation email:', {
          userId: user.id,
          error: emailError.message,
        });
      }

      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again.',
        requiresRelogin: true,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logError(error, { endpoint: 'change-password', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to change password',
      code: 'PASSWORD_CHANGE_ERROR',
    });
  }
});

/**
 * DELETE /api/users/profile
 * Delete user account (soft delete)
 */
router.delete('/profile', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();

    // Soft delete user account
    await pool.query('BEGIN');
    try {
      // Deactivate account
      await pool.query(
        'UPDATE users SET is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
        [req.user.id]
      );

      // Clear refresh tokens
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

      // Clear password reset tokens
      await pool.query('DELETE FROM password_resets WHERE user_id = $1', [req.user.id]);

      // Clear email verification tokens
      await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [req.user.id]);

      await pool.query('COMMIT');

      logSecurityEvent('ACCOUNT_DELETED', {
        userId: req.user.id,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: 'Account deleted successfully',
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logError(error, { endpoint: 'delete-account', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to delete account',
      code: 'ACCOUNT_DELETE_ERROR',
    });
  }
});

export default router;
