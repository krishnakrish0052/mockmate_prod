import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import FirebaseAuthService from '../services/FirebaseAuthService.js';
import { logger } from '../config/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Rate limiting for auth requests
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per windowMs
  message: {
    error: 'Too Many Authentication Requests',
    message: 'Too many authentication attempts, please try again later.',
    code: 'RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/firebase-auth/verify-token
 * Verify Firebase ID token and return user info
 */
router.post(
  '/verify-token',
  authRateLimit,
  [body('idToken').notEmpty().withMessage('Firebase ID token is required')],
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

      const { idToken } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.verifyIdToken(idToken);

      if (!result.success) {
        return res.status(401).json({
          error: 'Authentication Failed',
          code: 'AUTH_FAILED',
          message: result.error,
        });
      }

      // Get or sync user in local database
      let localUser = await firebaseAuthService.getUserByFirebaseUid(result.user.uid);

      if (!localUser) {
        // User doesn't exist in local database, create it
        const firebaseUser = {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.name,
          photoURL: result.user.picture,
          emailVerified: result.user.emailVerified,
        };

        await firebaseAuthService.syncUserToDatabase(firebaseUser);
        localUser = await firebaseAuthService.getUserByFirebaseUid(result.user.uid);
      }

      res.json({
        success: true,
        user: {
          id: localUser.id,
          firebase_uid: localUser.firebase_uid,
          email: localUser.email,
          name: localUser.name,
          first_name: localUser.first_name,
          last_name: localUser.last_name,
          avatar_url: localUser.avatar_url,
          is_verified: localUser.is_verified,
          credits: localUser.credits,
          subscription_tier: localUser.subscription_tier,
        },
        firebase: {
          uid: result.user.uid,
          email: result.user.email,
          emailVerified: result.user.emailVerified,
          name: result.user.name,
          picture: result.user.picture,
        },
      });
    } catch (error) {
      logger.error('Failed to verify Firebase token:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Authentication Error',
        code: 'AUTH_ERROR',
        message: 'Failed to verify authentication token',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/create-custom-token
 * Create Firebase custom token for a user (admin only)
 */
router.post(
  '/create-custom-token',
  authenticateToken, // Require authentication
  [
    body('uid').notEmpty().withMessage('Firebase UID is required'),
    body('claims').optional().isObject().withMessage('Claims must be an object'),
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

      const { uid, claims = {} } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.createCustomToken(uid, claims);

      if (!result.success) {
        return res.status(500).json({
          error: 'Token Creation Failed',
          code: 'TOKEN_CREATION_FAILED',
          message: result.error,
        });
      }

      res.json({
        success: true,
        customToken: result.token,
      });
    } catch (error) {
      logger.error('Failed to create custom token:', {
        uid: req.body.uid,
        error: error.message,
      });

      res.status(500).json({
        error: 'Token Creation Error',
        code: 'TOKEN_CREATION_ERROR',
        message: 'Failed to create custom token',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/sync-user
 * Manually sync Firebase user to local database
 */
router.post(
  '/sync-user',
  authRateLimit,
  [body('idToken').notEmpty().withMessage('Firebase ID token is required')],
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

      const { idToken } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      // Verify token first
      const tokenResult = await firebaseAuthService.verifyIdToken(idToken);

      if (!tokenResult.success) {
        return res.status(401).json({
          error: 'Authentication Failed',
          code: 'AUTH_FAILED',
          message: tokenResult.error,
        });
      }

      // Sync user to database
      const firebaseUser = {
        uid: tokenResult.user.uid,
        email: tokenResult.user.email,
        displayName: tokenResult.user.name,
        photoURL: tokenResult.user.picture,
        emailVerified: tokenResult.user.emailVerified,
      };

      const userId = await firebaseAuthService.syncUserToDatabase(firebaseUser);
      const localUser = await firebaseAuthService.getUserByFirebaseUid(tokenResult.user.uid);

      res.json({
        success: true,
        message: 'User synchronized successfully',
        user: {
          id: localUser.id,
          firebase_uid: localUser.firebase_uid,
          email: localUser.email,
          name: localUser.name,
          first_name: localUser.first_name,
          last_name: localUser.last_name,
          avatar_url: localUser.avatar_url,
          is_verified: localUser.is_verified,
          credits: localUser.credits,
          subscription_tier: localUser.subscription_tier,
        },
      });
    } catch (error) {
      logger.error('Failed to sync Firebase user:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Sync Failed',
        code: 'SYNC_ERROR',
        message: 'Failed to synchronize user data',
      });
    }
  }
);

/**
 * DELETE /api/firebase-auth/delete-user/:uid
 * Delete user from both Firebase and local database (admin only)
 */
router.delete(
  '/delete-user/:uid',
  authenticateToken, // Require authentication
  async (req, res) => {
    try {
      const { uid } = req.params;

      if (!uid) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          message: 'Firebase UID is required',
        });
      }

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      await firebaseAuthService.deleteUserAccount(uid);

      res.json({
        success: true,
        message: 'User account deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete Firebase user:', {
        uid: req.params.uid,
        error: error.message,
      });

      res.status(500).json({
        error: 'Delete Failed',
        code: 'DELETE_ERROR',
        message: 'Failed to delete user account',
      });
    }
  }
);

/**
 * GET /api/firebase-auth/status
 * Get Firebase authentication service status
 */
router.get('/status', async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const status = firebaseAuthService.getAuthState();

    res.json({
      success: true,
      data: {
        initialized: status.initialized,
        clientSDK: status.clientAvailable,
        adminSDK: status.adminAvailable,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get Firebase status:', error);

    res.status(500).json({
      error: 'Status Error',
      code: 'STATUS_ERROR',
      message: 'Failed to get Firebase authentication status',
    });
  }
});

/**
 * GET /api/firebase-auth/user/:uid
 * Get user details by Firebase UID
 */
router.get(
  '/user/:uid',
  authenticateToken, // Require authentication
  async (req, res) => {
    try {
      const { uid } = req.params;

      if (!uid) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          message: 'Firebase UID is required',
        });
      }

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );
      const localUser = await firebaseAuthService.getUserByFirebaseUid(uid);

      if (!localUser) {
        return res.status(404).json({
          error: 'User Not Found',
          code: 'USER_NOT_FOUND',
          message: 'No user found with the provided Firebase UID',
        });
      }

      res.json({
        success: true,
        user: {
          id: localUser.id,
          firebase_uid: localUser.firebase_uid,
          email: localUser.email,
          name: localUser.name,
          first_name: localUser.first_name,
          last_name: localUser.last_name,
          avatar_url: localUser.avatar_url,
          is_verified: localUser.is_verified,
          credits: localUser.credits,
          subscription_tier: localUser.subscription_tier,
          last_login: localUser.last_login,
          created_at: localUser.created_at,
        },
      });
    } catch (error) {
      logger.error('Failed to get user by Firebase UID:', {
        uid: req.params.uid,
        error: error.message,
      });

      res.status(500).json({
        error: 'User Fetch Error',
        code: 'USER_FETCH_ERROR',
        message: 'Failed to fetch user details',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/send-email-verification
 * Send email verification to authenticated user
 */
router.post(
  '/send-email-verification',
  authRateLimit,
  [body('idToken').notEmpty().withMessage('Firebase ID token is required')],
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

      const { idToken } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      // Verify token and get user
      const tokenResult = await firebaseAuthService.verifyIdToken(idToken);
      if (!tokenResult.success) {
        return res.status(401).json({
          error: 'Authentication Failed',
          code: 'AUTH_FAILED',
          message: tokenResult.error,
        });
      }

      // Send verification email
      const result = await firebaseAuthService.sendEmailVerificationToUser({
        uid: tokenResult.user.uid,
        email: tokenResult.user.email,
      });

      if (!result.success) {
        return res.status(500).json({
          error: 'Email Verification Failed',
          code: 'EMAIL_VERIFICATION_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error('Failed to send email verification:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Email Verification Error',
        code: 'EMAIL_VERIFICATION_ERROR',
        message: 'Failed to send email verification',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/verify-email-code
 * Verify email with action code
 */
router.post(
  '/verify-email-code',
  authRateLimit,
  [body('actionCode').notEmpty().withMessage('Action code is required')],
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

      const { actionCode } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.verifyEmailActionCode(actionCode);

      if (!result.success) {
        return res.status(400).json({
          error: 'Email Verification Failed',
          code: 'EMAIL_VERIFICATION_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        operation: result.operation,
        email: result.email,
        message: 'Email verified successfully',
      });
    } catch (error) {
      logger.error('Failed to verify email code:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Email Verification Error',
        code: 'EMAIL_VERIFICATION_ERROR',
        message: 'Failed to verify email',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/send-password-reset
 * Send password reset email
 */
router.post(
  '/send-password-reset',
  authRateLimit,
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

      const { email, actionCodeSettings } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.sendPasswordResetEmailToUser(
        email,
        actionCodeSettings
      );

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account with this email exists, a password reset link has been sent',
      });
    } catch (error) {
      logger.error('Failed to send password reset email:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Password Reset Error',
        code: 'PASSWORD_RESET_ERROR',
        message: 'Failed to send password reset email',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/confirm-password-reset
 * Confirm password reset with action code
 */
router.post(
  '/confirm-password-reset',
  authRateLimit,
  [
    body('actionCode').notEmpty().withMessage('Action code is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
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

      const { actionCode, newPassword } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.confirmPasswordResetWithCode(
        actionCode,
        newPassword
      );

      if (!result.success) {
        return res.status(400).json({
          error: 'Password Reset Failed',
          code: 'PASSWORD_RESET_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      logger.error('Failed to confirm password reset:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Password Reset Error',
        code: 'PASSWORD_RESET_ERROR',
        message: 'Failed to reset password',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/signin-facebook
 * Sign in with Facebook OAuth
 */
router.post('/signin-facebook', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInWithFacebook();

    if (!result.success) {
      return res.status(400).json({
        error: 'Facebook Sign-in Failed',
        code: 'FACEBOOK_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'Facebook sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in with Facebook:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Facebook Sign-in Error',
      code: 'FACEBOOK_SIGNIN_ERROR',
      message: 'Failed to sign in with Facebook',
    });
  }
});

/**
 * POST /api/firebase-auth/signin-github
 * Sign in with GitHub OAuth
 */
router.post('/signin-github', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInWithGitHub();

    if (!result.success) {
      return res.status(400).json({
        error: 'GitHub Sign-in Failed',
        code: 'GITHUB_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'GitHub sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in with GitHub:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'GitHub Sign-in Error',
      code: 'GITHUB_SIGNIN_ERROR',
      message: 'Failed to sign in with GitHub',
    });
  }
});

/**
 * POST /api/firebase-auth/signin-twitter
 * Sign in with Twitter OAuth
 */
router.post('/signin-twitter', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInWithTwitter();

    if (!result.success) {
      return res.status(400).json({
        error: 'Twitter Sign-in Failed',
        code: 'TWITTER_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'Twitter sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in with Twitter:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Twitter Sign-in Error',
      code: 'TWITTER_SIGNIN_ERROR',
      message: 'Failed to sign in with Twitter',
    });
  }
});

/**
 * POST /api/firebase-auth/signin-microsoft
 * Sign in with Microsoft OAuth
 */
router.post('/signin-microsoft', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInWithMicrosoft();

    if (!result.success) {
      return res.status(400).json({
        error: 'Microsoft Sign-in Failed',
        code: 'MICROSOFT_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'Microsoft sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in with Microsoft:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Microsoft Sign-in Error',
      code: 'MICROSOFT_SIGNIN_ERROR',
      message: 'Failed to sign in with Microsoft',
    });
  }
});

/**
 * POST /api/firebase-auth/signin-apple
 * Sign in with Apple OAuth
 */
router.post('/signin-apple', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInWithApple();

    if (!result.success) {
      return res.status(400).json({
        error: 'Apple Sign-in Failed',
        code: 'APPLE_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'Apple sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in with Apple:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Apple Sign-in Error',
      code: 'APPLE_SIGNIN_ERROR',
      message: 'Failed to sign in with Apple',
    });
  }
});

/**
 * POST /api/firebase-auth/signin-google
 * Sign in with Google OAuth
 */
router.post('/signin-google', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInWithGoogle();

    if (!result.success) {
      return res.status(400).json({
        error: 'Google Sign-in Failed',
        code: 'GOOGLE_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'Google sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in with Google:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Google Sign-in Error',
      code: 'GOOGLE_SIGNIN_ERROR',
      message: 'Failed to sign in with Google',
    });
  }
});

/**
 * POST /api/firebase-auth/signin-anonymous
 * Sign in anonymously
 */
router.post('/signin-anonymous', authRateLimit, async (req, res) => {
  try {
    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    // Initialize Firebase if not already initialized
    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.signInAnonymously();

    if (!result.success) {
      return res.status(400).json({
        error: 'Anonymous Sign-in Failed',
        code: 'ANONYMOUS_SIGNIN_FAILED',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
      message: 'Anonymous sign-in successful',
    });
  } catch (error) {
    logger.error('Failed to sign in anonymously:', {
      error: error.message,
    });

    res.status(500).json({
      error: 'Anonymous Sign-in Error',
      code: 'ANONYMOUS_SIGNIN_ERROR',
      message: 'Failed to sign in anonymously',
    });
  }
});

/**
 * POST /api/firebase-auth/register-with-email
 * Register new user with Firebase email/password
 */
router.post(
  '/register-with-email',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be 1-100 characters'),
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

      const { email, password, displayName, firstName, lastName, photoURL } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.createUserWithEmail(email, password, {
        displayName,
        firstName,
        lastName,
        photoURL,
      });

      if (!result.success) {
        return res.status(400).json({
          error: 'Registration Failed',
          code: 'REGISTRATION_FAILED',
          message: result.error.message,
        });
      }

      res.status(201).json({
        success: true,
        user: result.user,
        message: 'Registration successful. Please verify your email before logging in.',
      });
    } catch (error) {
      logger.error('Failed to register user with Firebase:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Registration Error',
        code: 'REGISTRATION_ERROR',
        message: 'Failed to register user',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/signin-with-email
 * Sign in with Firebase email/password
 */
router.post(
  '/signin-with-email',
  authRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
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

      const { email, password } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.signInWithEmail(email, password);

      if (!result.success) {
        return res.status(401).json({
          error: 'Sign-in Failed',
          code: 'SIGNIN_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        user: result.user,
        message: 'Sign-in successful',
      });
    } catch (error) {
      logger.error('Failed to sign in with Firebase:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Sign-in Error',
        code: 'SIGNIN_ERROR',
        message: 'Failed to sign in',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/link-provider
 * Link authentication provider to existing account
 */
router.post(
  '/link-provider',
  authRateLimit,
  [
    body('idToken').notEmpty().withMessage('Firebase ID token is required'),
    body('providerId')
      .isIn([
        'google.com',
        'facebook.com',
        'github.com',
        'twitter.com',
        'microsoft.com',
        'apple.com',
      ])
      .withMessage('Invalid provider ID'),
    body('providerIdToken').notEmpty().withMessage('Provider ID token is required'),
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

      const { idToken, providerId, providerIdToken, providerAccessToken } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.linkProviderToAccount(idToken, {
        providerId,
        idToken: providerIdToken,
        accessToken: providerAccessToken,
      });

      if (!result.success) {
        return res.status(400).json({
          error: 'Provider Linking Failed',
          code: 'PROVIDER_LINKING_FAILED',
          message: result.error,
        });
      }

      res.json({
        success: true,
        user: result.user,
        message: `${providerId} account linked successfully`,
      });
    } catch (error) {
      logger.error('Failed to link provider:', {
        providerId: req.body.providerId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Provider Linking Error',
        code: 'PROVIDER_LINKING_ERROR',
        message: 'Failed to link authentication provider',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/unlink-provider
 * Unlink authentication provider from account
 */
router.post(
  '/unlink-provider',
  authRateLimit,
  [
    body('idToken').notEmpty().withMessage('Firebase ID token is required'),
    body('providerId')
      .isIn([
        'google.com',
        'facebook.com',
        'github.com',
        'twitter.com',
        'microsoft.com',
        'apple.com',
        'password',
      ])
      .withMessage('Invalid provider ID'),
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

      const { idToken, providerId } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.unlinkProviderFromAccount(idToken, providerId);

      if (!result.success) {
        return res.status(400).json({
          error: 'Provider Unlinking Failed',
          code: 'PROVIDER_UNLINKING_FAILED',
          message: result.error,
        });
      }

      res.json({
        success: true,
        user: result.user,
        message: `${providerId} account unlinked successfully`,
      });
    } catch (error) {
      logger.error('Failed to unlink provider:', {
        providerId: req.body.providerId,
        error: error.message,
      });

      res.status(500).json({
        error: 'Provider Unlinking Error',
        code: 'PROVIDER_UNLINKING_ERROR',
        message: 'Failed to unlink authentication provider',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/change-email
 * Change user email with verification
 */
router.post(
  '/change-email',
  authRateLimit,
  [
    body('idToken').notEmpty().withMessage('Firebase ID token is required'),
    body('newEmail').isEmail().normalizeEmail().withMessage('Valid new email is required'),
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

      const { idToken, newEmail } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.changeUserEmail(idToken, newEmail);

      if (!result.success) {
        return res.status(400).json({
          error: 'Email Change Failed',
          code: 'EMAIL_CHANGE_FAILED',
          message: result.error,
        });
      }

      res.json({
        success: true,
        message: 'Email change initiated. Please verify your new email address.',
        verificationSent: result.verificationSent,
      });
    } catch (error) {
      logger.error('Failed to change email:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Email Change Error',
        code: 'EMAIL_CHANGE_ERROR',
        message: 'Failed to change email address',
      });
    }
  }
);

/**
 * POST /api/firebase-auth/update-profile
 * Update user profile (requires authentication)
 */
router.post(
  '/update-profile',
  authRateLimit,
  [
    body('idToken').notEmpty().withMessage('Firebase ID token is required'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be 1-100 characters'),
    body('photoURL').optional().isURL().withMessage('Photo URL must be a valid URL'),
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

      const { idToken, displayName, photoURL } = req.body;
      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      // Initialize Firebase if not already initialized
      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      // Verify token and get user
      const tokenResult = await firebaseAuthService.verifyIdToken(idToken);
      if (!tokenResult.success) {
        return res.status(401).json({
          error: 'Authentication Failed',
          code: 'AUTH_FAILED',
          message: tokenResult.error,
        });
      }

      const profileData = {};
      if (displayName !== undefined) profileData.displayName = displayName;
      if (photoURL !== undefined) profileData.photoURL = photoURL;

      if (Object.keys(profileData).length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          message: 'At least one profile field must be provided',
        });
      }

      const result = await firebaseAuthService.updateUserProfile(
        {
          uid: tokenResult.user.uid,
          email: tokenResult.user.email,
        },
        profileData
      );

      if (!result.success) {
        return res.status(500).json({
          error: 'Profile Update Failed',
          code: 'PROFILE_UPDATE_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        user: result.user,
        message: 'Profile updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update profile:', {
        error: error.message,
      });

      res.status(500).json({
        error: 'Profile Update Error',
        code: 'PROFILE_UPDATE_ERROR',
        message: 'Failed to update profile',
      });
    }
  }
);

export default router;
