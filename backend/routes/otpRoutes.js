import express from 'express';
import { body, validationResult } from 'express-validator';
import { _param } from 'express-validator';

import database from '../config/database.js';
import OTPService from '../services/OTPService.js';
import { logger } from '../config/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const otpService = new OTPService(database);

// Rate limiting for OTP operations
const otpGenerationLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 OTP generation attempts per window
  message: { error: 'Too many OTP generation attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerificationLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 verification attempts per window
  message: { error: 'Too many verification attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/otp/send-email-verification
 * Send email verification OTP
 */
router.post(
  '/send-email-verification',
  otpGenerationLimit,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { email } = req.body;

      // Find user by email
      const userResult = await database.query(
        'SELECT id, email, first_name, name, is_verified FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const user = userResult.rows[0];

      if (user.is_verified) {
        return res.status(400).json({
          success: false,
          error: 'Email already verified',
        });
      }

      // Send OTP
      const result = await otpService.sendEmailVerificationOTP(user);

      res.status(200).json({
        success: true,
        message: 'Email verification OTP sent',
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Send email verification OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send verification OTP',
      });
    }
  }
);

/**
 * POST /api/otp/verify-email
 * Verify email with OTP code
 */
router.post(
  '/verify-email',
  otpVerificationLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('otpCode').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { email, otpCode } = req.body;

      // Find user by email
      const userResult = await database.query(
        'SELECT id, email, is_verified FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const user = userResult.rows[0];

      if (user.is_verified) {
        return res.status(400).json({
          success: false,
          error: 'Email already verified',
        });
      }

      // Verify OTP
      const result = await otpService.verifyEmailWithOTP(user.id, otpCode);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(200).json({
        success: true,
        message: 'Email verified successfully',
      });
    } catch (error) {
      logger.error('Verify email OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify email',
      });
    }
  }
);

/**
 * POST /api/otp/send-password-reset
 * Send password reset OTP
 */
router.post(
  '/send-password-reset',
  otpGenerationLimit,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { email } = req.body;

      // Find user by email
      const userResult = await database.query(
        'SELECT id, email, first_name, name FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        // Don't reveal if user exists - security best practice
        return res.status(200).json({
          success: true,
          message: 'If the email exists, a reset OTP has been sent',
        });
      }

      const user = userResult.rows[0];

      // Send OTP
      const result = await otpService.sendPasswordResetOTP(user);

      res.status(200).json({
        success: true,
        message: 'Password reset OTP sent',
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Send password reset OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send password reset OTP',
      });
    }
  }
);

/**
 * POST /api/otp/reset-password
 * Reset password with OTP code
 */
router.post(
  '/reset-password',
  otpVerificationLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('otpCode').isLength({ min: 6, max: 6 }).isNumeric(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { email, otpCode, newPassword } = req.body;

      // Find user by email
      const userResult = await database.query('SELECT id, email FROM users WHERE email = $1', [
        email,
      ]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const user = userResult.rows[0];

      // Reset password with OTP
      const result = await otpService.resetPasswordWithOTP(user.id, otpCode, newPassword);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(200).json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      logger.error('Reset password with OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset password',
      });
    }
  }
);

/**
 * POST /api/otp/send-password-change
 * Send password change OTP (requires authentication)
 */
router.post('/send-password-change', authenticateToken, otpGenerationLimit, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user data
    const userResult = await database.query(
      'SELECT id, email, first_name, name FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const user = userResult.rows[0];

    // Send OTP
    const result = await otpService.sendPasswordChangeOTP(user);

    res.status(200).json({
      success: true,
      message: 'Password change OTP sent',
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    logger.error('Send password change OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send password change OTP',
    });
  }
});

/**
 * POST /api/otp/send-login-2fa
 * Send login 2FA OTP
 */
router.post(
  '/send-login-2fa',
  otpGenerationLimit,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { email } = req.body;

      // Find user by email
      const userResult = await database.query(
        'SELECT id, email, first_name, name FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const user = userResult.rows[0];

      // Send OTP
      const result = await otpService.sendLogin2FAOTP(user);

      res.status(200).json({
        success: true,
        message: 'Login 2FA OTP sent',
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      logger.error('Send login 2FA OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send login 2FA OTP',
      });
    }
  }
);

/**
 * POST /api/otp/verify-login-2fa
 * Verify login 2FA OTP
 */
router.post(
  '/verify-login-2fa',
  otpVerificationLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('otpCode').isLength({ min: 6, max: 6 }).isNumeric(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { email, otpCode } = req.body;

      // Find user by email
      const userResult = await database.query('SELECT id, email FROM users WHERE email = $1', [
        email,
      ]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found',
        });
      }

      const user = userResult.rows[0];

      // Verify OTP
      const result = await otpService.verifyOTP(user.id, 'login_2fa', otpCode);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(200).json({
        success: true,
        message: '2FA verification successful',
        verified: true,
      });
    } catch (error) {
      logger.error('Verify login 2FA OTP error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify 2FA OTP',
      });
    }
  }
);

/**
 * GET /api/otp/stats (Admin only)
 * Get OTP usage statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (you'll need to implement this check based on your user model)
    // const isAdmin = req.user.role === 'admin' || req.user.is_admin;
    // if (!isAdmin) {
    //     return res.status(403).json({
    //         success: false,
    //         error: 'Access denied'
    //     });
    // }

    const timeframe = req.query.timeframe || '24 hours';
    const stats = await otpService.getOTPStats(timeframe);

    res.status(200).json({
      success: true,
      stats,
      timeframe,
    });
  } catch (error) {
    logger.error('Get OTP stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get OTP statistics',
    });
  }
});

/**
 * POST /api/otp/cleanup (Admin only)
 * Cleanup expired OTPs
 */
router.post('/cleanup', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    // const isAdmin = req.user.role === 'admin' || req.user.is_admin;
    // if (!isAdmin) {
    //     return res.status(403).json({
    //         success: false,
    //         error: 'Access denied'
    //     });
    // }

    const cleanedCount = await otpService.cleanupExpiredOTPs();

    res.status(200).json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired OTP codes`,
      cleanedCount,
    });
  } catch (error) {
    logger.error('Cleanup OTPs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup OTPs',
    });
  }
});

export default router;
