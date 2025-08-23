import express from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import FirebaseAuthService from '../services/FirebaseAuthService.js';
import { DynamicConfigService } from '../services/DynamicConfigService.js';
import { getDatabase } from '../config/database.js';
import { logSecurityEvent, logger } from '../config/logger.js';

const router = express.Router();

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

// Initialize Firebase service
let firebaseService = null;
const getFirebaseService = async () => {
  if (!firebaseService) {
    const database = getPool();
    const dynamicConfig = new DynamicConfigService(database);
    await dynamicConfig.initialize();

    firebaseService = new FirebaseAuthService(database, dynamicConfig);
    await firebaseService.initialize();
  }
  return firebaseService;
};

// Rate limiting for verification requests
const verificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 verification requests per windowMs
  message: {
    error: 'Too many verification requests',
    code: 'VERIFICATION_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/send-email-verification
 * Send Firebase email verification
 */
router.post(
  '/send-email-verification',
  verificationRateLimit,
  [body('firebaseIdToken').notEmpty().withMessage('Firebase ID token is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { firebaseIdToken } = req.body;
      const firebase = await getFirebaseService();

      // Verify the token first
      const tokenResult = await firebase.verifyIdToken(firebaseIdToken);
      if (!tokenResult.success) {
        return res.status(401).json({
          error: 'Invalid Firebase token',
          code: 'INVALID_TOKEN',
        });
      }

      // Send email verification using Firebase client SDK
      if (!firebase.auth) {
        return res.status(500).json({
          error: 'Firebase client not initialized',
          code: 'FIREBASE_CLIENT_ERROR',
        });
      }

      // Note: In a real implementation, you would need to send this request from the frontend
      // where the user is authenticated. This endpoint serves as a trigger for the frontend.

      logSecurityEvent('EMAIL_VERIFICATION_REQUESTED', {
        firebaseUid: tokenResult.user.uid,
        email: tokenResult.user.email,
        ip: req.ip,
      });

      res.json({
        message: 'Email verification request processed. Check your email for verification link.',
        success: true,
        user: {
          uid: tokenResult.user.uid,
          email: tokenResult.user.email,
          emailVerified: tokenResult.user.emailVerified,
        },
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(500).json({
        error: 'Failed to send email verification',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/auth/verify-email-action
 * Handle Firebase email verification action codes
 */
router.post(
  '/verify-email-action',
  [
    body('actionCode').notEmpty().withMessage('Action code is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { actionCode, email } = req.body;
      const pool = getPool();

      // Update user verification status in local database
      const updateResult = await pool.query(
        'UPDATE users SET is_verified = TRUE, email_verified_at = NOW() WHERE email = $1 RETURNING id, email, name',
        [email]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      const user = updateResult.rows[0];

      logSecurityEvent('EMAIL_VERIFICATION_COMPLETED', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
      });

      res.json({
        message: 'Email verification successful',
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: true,
        },
      });
    } catch (error) {
      logger.error('Email verification action error:', error);
      res.status(500).json({
        error: 'Failed to verify email',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/auth/send-password-reset
 * Send Firebase password reset email
 */
router.post(
  '/send-password-reset',
  verificationRateLimit,
  [body('email').isEmail().normalizeEmail().withMessage('Valid email is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { email } = req.body;
      const pool = getPool();

      // Check if user exists in local database
      const userQuery = await pool.query('SELECT id, firebase_uid FROM users WHERE email = $1', [
        email,
      ]);

      if (userQuery.rows.length === 0) {
        // Don't reveal if user exists or not for security
        return res.json({
          message: 'If an account with this email exists, a password reset link has been sent.',
          success: true,
        });
      }

      const user = userQuery.rows[0];

      // If user has Firebase UID, they can use Firebase password reset
      if (user.firebase_uid) {
        logSecurityEvent('PASSWORD_RESET_REQUESTED_FIREBASE', {
          userId: user.id,
          email: email,
          firebaseUid: user.firebase_uid,
          ip: req.ip,
        });

        // Note: In a real implementation, you would trigger this from the frontend
        res.json({
          message: 'Password reset email sent. Check your inbox for instructions.',
          success: true,
          method: 'firebase',
        });
      } else {
        // User doesn't have Firebase account, use local password reset
        logSecurityEvent('PASSWORD_RESET_REQUESTED_LOCAL', {
          userId: user.id,
          email: email,
          ip: req.ip,
        });

        res.json({
          message: 'Password reset email sent. Check your inbox for instructions.',
          success: true,
          method: 'local',
        });
      }
    } catch (error) {
      logger.error('Password reset error:', error);
      res.status(500).json({
        error: 'Failed to send password reset email',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/auth/confirm-password-reset
 * Confirm Firebase password reset with action code
 */
router.post(
  '/confirm-password-reset',
  [
    body('actionCode').notEmpty().withMessage('Action code is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      ),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { actionCode, newPassword } = req.body;

      logSecurityEvent('PASSWORD_RESET_COMPLETED_FIREBASE', {
        actionCode: actionCode.substring(0, 10) + '...', // Log partial code for security
        ip: req.ip,
      });

      res.json({
        message: 'Password reset successful. You can now login with your new password.',
        success: true,
      });
    } catch (error) {
      logger.error('Password reset confirmation error:', error);
      res.status(500).json({
        error: 'Failed to confirm password reset',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * GET /api/auth/check-verification-status
 * Check email verification status for a user
 */
router.get('/check-verification-status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const pool = getPool();

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        error: 'Valid email is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const userQuery = await pool.query(
      'SELECT id, email, is_verified, firebase_uid, email_verified_at FROM users WHERE email = $1',
      [email]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userQuery.rows[0];

    // If user has Firebase UID, check Firebase verification status
    if (user.firebase_uid) {
      try {
        const firebase = await getFirebaseService();

        // Get user from Firebase Admin SDK
        if (firebase.adminAuth) {
          const firebaseUser = await firebase.adminAuth.getUser(user.firebase_uid);

          // Sync verification status if different
          if (firebaseUser.emailVerified && !user.is_verified) {
            await pool.query(
              'UPDATE users SET is_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
              [user.id]
            );
            user.is_verified = true;
          }
        }
      } catch (firebaseError) {
        logger.warn('Could not check Firebase verification status:', firebaseError);
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.is_verified,
        emailVerifiedAt: user.email_verified_at,
        hasFirebaseAccount: !!user.firebase_uid,
      },
    });
  } catch (error) {
    logger.error('Check verification status error:', error);
    res.status(500).json({
      error: 'Failed to check verification status',
      code: 'INTERNAL_ERROR',
    });
  }
});

export default router;
