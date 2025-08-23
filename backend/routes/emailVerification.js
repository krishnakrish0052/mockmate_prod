import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import EmailVerificationService from '../services/EmailVerificationService.js';
import { logger } from '../config/logger.js';

const router = express.Router();

// Rate limiting for verification requests
const verificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: {
    error: 'Too Many Verification Requests',
    message: 'Too many verification attempts, please try again later.',
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resendRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1, // 1 request per minute
  message: {
    error: 'Too Many Resend Requests',
    message: 'Please wait before requesting another verification email.',
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/email-verification/send
 * Send verification email to user
 */
router.post(
  '/send',
  verificationRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('userId').optional().isUUID().withMessage('User ID must be a valid UUID'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { email, userId } = req.body;
      const emailVerificationService = new EmailVerificationService(req.app.locals.database);

      let user;

      if (userId) {
        // Get user by ID
        const result = await req.app.locals.database.query('SELECT * FROM users WHERE id = $1', [
          userId,
        ]);
        user = result.rows[0];
      } else {
        // Get user by email
        const result = await req.app.locals.database.query('SELECT * FROM users WHERE email = $1', [
          email,
        ]);
        user = result.rows[0];
      }

      if (!user) {
        return res.status(404).json({
          error: 'User Not Found',
          code: 'USER_NOT_FOUND',
          message: 'No user found with the provided email or ID',
        });
      }

      if (user.is_verified) {
        return res.status(400).json({
          error: 'Already Verified',
          code: 'ALREADY_VERIFIED',
          message: 'This email address is already verified',
        });
      }

      // Send verification email
      const result = await emailVerificationService.sendVerificationEmail(user);

      res.json({
        success: true,
        message: 'Verification email sent successfully',
        data: {
          email: user.email,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      logger.error('Failed to send verification email:', {
        email: req.body.email,
        userId: req.body.userId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Email Send Failed',
        code: 'EMAIL_SEND_ERROR',
        message: 'Failed to send verification email',
      });
    }
  }
);

/**
 * POST /api/email-verification/resend
 * Resend verification email
 */
router.post(
  '/resend',
  resendRateLimit,
  [body('email').isEmail().normalizeEmail().withMessage('Valid email is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { email } = req.body;
      const emailVerificationService = new EmailVerificationService(req.app.locals.database);

      const result = await emailVerificationService.resendVerificationEmail(email);

      if (!result.success) {
        const statusCode = result.code === 'USER_NOT_FOUND' ? 404 : 400;
        return res.status(statusCode).json({
          error: result.error,
          code: result.code,
          message: result.error,
        });
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error('Failed to resend verification email:', {
        email: req.body.email,
        error: error.message,
      });

      res.status(500).json({
        error: 'Resend Failed',
        code: 'RESEND_ERROR',
        message: 'Failed to resend verification email',
      });
    }
  }
);

/**
 * GET /api/email-verification/verify/:token
 * Verify email with token
 */
router.get(
  '/verify/:token',
  verificationRateLimit,
  [
    param('token')
      .isLength({ min: 32, max: 128 })
      .isAlphanumeric()
      .withMessage('Invalid verification token format'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { token } = req.params;
      const emailVerificationService = new EmailVerificationService(req.app.locals.database);

      const result = await emailVerificationService.verifyEmailToken(token);

      if (!result.success) {
        const statusCode =
          result.code === 'INVALID_TOKEN' || result.code === 'TOKEN_EXPIRED' ? 400 : 500;
        return res.status(statusCode).json({
          error: result.error,
          code: result.code,
          message: result.error,
        });
      }

      res.json({
        success: true,
        message: result.message,
        data: {
          userId: result.userId,
          email: result.email,
          alreadyVerified: result.alreadyVerified || false,
        },
      });
    } catch (error) {
      logger.error('Failed to verify email token:', {
        token: req.params.token?.substring(0, 8) + '...',
        error: error.message,
      });

      res.status(500).json({
        error: 'Verification Failed',
        code: 'VERIFICATION_ERROR',
        message: 'Failed to verify email token',
      });
    }
  }
);

/**
 * POST /api/email-verification/verify
 * Verify email with token via POST (alternative endpoint)
 */
router.post(
  '/verify',
  verificationRateLimit,
  [
    body('token')
      .isLength({ min: 32, max: 128 })
      .isAlphanumeric()
      .withMessage('Invalid verification token format'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { token } = req.body;
      const emailVerificationService = new EmailVerificationService(req.app.locals.database);

      const result = await emailVerificationService.verifyEmailToken(token);

      if (!result.success) {
        const statusCode =
          result.code === 'INVALID_TOKEN' || result.code === 'TOKEN_EXPIRED' ? 400 : 500;
        return res.status(statusCode).json({
          error: result.error,
          code: result.code,
          message: result.error,
        });
      }

      res.json({
        success: true,
        message: result.message,
        data: {
          userId: result.userId,
          email: result.email,
          alreadyVerified: result.alreadyVerified || false,
        },
      });
    } catch (error) {
      logger.error('Failed to verify email token:', {
        token: req.body.token?.substring(0, 8) + '...',
        error: error.message,
      });

      res.status(500).json({
        error: 'Verification Failed',
        code: 'VERIFICATION_ERROR',
        message: 'Failed to verify email token',
      });
    }
  }
);

/**
 * GET /api/email-verification/status/:email
 * Check verification status of an email
 */
router.get(
  '/status/:email',
  [param('email').isEmail().normalizeEmail().withMessage('Valid email is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const email = req.params.email;

      // Get user verification status
      const userResult = await req.app.locals.database.query(
        'SELECT id, email, is_verified, created_at FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User Not Found',
          code: 'USER_NOT_FOUND',
          message: 'No user found with this email address',
        });
      }

      const user = userResult.rows[0];

      // Get pending verification token if any
      let pendingToken = null;
      if (!user.is_verified) {
        const tokenResult = await req.app.locals.database.query(
          'SELECT expires_at, created_at FROM email_verification_tokens WHERE user_id = $1 AND is_used = FALSE AND expires_at > NOW()',
          [user.id]
        );

        if (tokenResult.rows.length > 0) {
          pendingToken = {
            expiresAt: tokenResult.rows[0].expires_at,
            createdAt: tokenResult.rows[0].created_at,
          };
        }
      }

      res.json({
        success: true,
        data: {
          email: user.email,
          isVerified: user.is_verified,
          userCreatedAt: user.created_at,
          pendingVerification: pendingToken,
        },
      });
    } catch (error) {
      logger.error('Failed to get verification status:', {
        email: req.params.email,
        error: error.message,
      });

      res.status(500).json({
        error: 'Status Check Failed',
        code: 'STATUS_ERROR',
        message: 'Failed to check verification status',
      });
    }
  }
);

/**
 * DELETE /api/email-verification/cleanup
 * Clean up expired tokens (admin only)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    const emailVerificationService = new EmailVerificationService(req.app.locals.database);
    const cleanedCount = await emailVerificationService.cleanupExpiredTokens();

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired tokens`,
      data: {
        cleanedTokens: cleanedCount,
      },
    });
  } catch (error) {
    logger.error('Failed to cleanup expired tokens:', error);

    res.status(500).json({
      error: 'Cleanup Failed',
      code: 'CLEANUP_ERROR',
      message: 'Failed to cleanup expired tokens',
    });
  }
});

/**
 * GET /api/email-verification/stats
 * Get verification statistics (admin only)
 */
router.get('/stats', async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '24 hours';
    const emailVerificationService = new EmailVerificationService(req.app.locals.database);

    const stats = await emailVerificationService.getVerificationStats(timeframe);

    res.json({
      success: true,
      data: stats,
      timeframe,
    });
  } catch (error) {
    logger.error('Failed to get verification stats:', error);

    res.status(500).json({
      error: 'Stats Failed',
      code: 'STATS_ERROR',
      message: 'Failed to get verification statistics',
    });
  }
});

export default router;
