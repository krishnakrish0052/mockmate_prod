import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { getDatabase } from '../config/database.js';
import { cache } from '../config/redis.js';
import { authenticateToken, blacklistToken } from '../middleware/auth.js';
import { logError, logSecurityEvent, logger } from '../config/logger.js';
import FirebaseAuthService from '../services/FirebaseAuthService.js';
import { DynamicConfigService } from '../services/DynamicConfigService.js';

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

const router = express.Router();

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

// Rate limiting for auth endpoints
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts',
    code: 'AUTH_RATE_LIMIT',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'development' ? 100 : 3,
  message: {
    error: 'Too many registration attempts',
    code: 'REGISTRATION_RATE_LIMIT',
  },
});

// Validation rules
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters'),
  body('useFirebase').optional().isBoolean().withMessage('useFirebase must be a boolean'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('useFirebase').optional().isBoolean(),
];

// Helper function to generate JWT
const generateTokens = userId => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const refreshToken = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 * Enhanced registration with Firebase support
 */
router.post('/register', registrationRateLimit, registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { email, password, firstName, lastName, useFirebase = true } = req.body;
    const pool = getPool();
    const dynamicConfig = new DynamicConfigService(pool);
    await dynamicConfig.initialize();

    // Check if user already exists in local database
    const existingUser = await pool.query('SELECT id, firebase_uid FROM users WHERE email = $1', [
      email,
    ]);
    if (existingUser.rows.length > 0) {
      logSecurityEvent('REGISTRATION_DUPLICATE_EMAIL', {
        email,
        ip: req.ip,
      });
      return res.status(400).json({
        error: 'User already exists',
        code: 'USER_EXISTS',
      });
    }

    // Get starting credits from dynamic configuration
    const startingCredits = await dynamicConfig.get('new_user_starting_credits', 0);

    let firebaseUser = null;
    let localUser = null;

    if (useFirebase) {
      try {
        // Create user in Firebase
        const firebase = await getFirebaseService();
        const firebaseResult = await firebase.createUserWithEmail(email, password, {
          displayName: `${firstName} ${lastName}`,
          firstName,
          lastName,
        });

        if (!firebaseResult.success) {
          return res.status(400).json({
            error: 'Firebase registration failed',
            code: 'FIREBASE_REGISTRATION_ERROR',
            details: firebaseResult.error,
          });
        }

        firebaseUser = firebaseResult.user;

        // Get the synced local user
        localUser = await firebase.getUserByFirebaseUid(firebaseUser.uid);
      } catch (firebaseError) {
        logger.error('Firebase registration failed:', firebaseError);
        // Fall back to local registration
        useFirebase = false;
      }
    }

    if (!useFirebase || !localUser) {
      // Create user locally (fallback or primary method)
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const fullName = `${firstName} ${lastName}`;

      const newUserQuery = `
        INSERT INTO users (email, password_hash, first_name, last_name, name, credits, is_verified, firebase_uid)
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
        RETURNING id, email, first_name, last_name, name, credits, created_at, is_verified, firebase_uid
      `;

      const newUserResult = await pool.query(newUserQuery, [
        email,
        hashedPassword,
        firstName,
        lastName,
        fullName,
        startingCredits, // Dynamic starting credits
        firebaseUser?.uid || null,
      ]);

      localUser = newUserResult.rows[0];
    }

    // Send email verification
    try {
      if (useFirebase && firebaseUser) {
        // Firebase handles email verification
        logger.info('Firebase will handle email verification');
      } else {
        // Use local email verification
        const EmailVerificationService = (await import('../services/EmailVerificationService.js'))
          .default;
        const emailVerificationService = new EmailVerificationService(pool);
        await emailVerificationService.sendVerificationEmail(localUser);
      }
    } catch (emailError) {
      logger.error('Failed to send verification email:', emailError.message);
    }

    logSecurityEvent('USER_REGISTERED', {
      userId: localUser.id,
      email: localUser.email,
      ip: req.ip,
      method: useFirebase ? 'firebase' : 'local',
      emailVerificationRequired: true,
    });

    res.status(201).json({
      message:
        'Registration successful! Please check your email to verify your account before logging in.',
      user: {
        id: localUser.id,
        email: localUser.email,
        firstName: localUser.first_name,
        lastName: localUser.last_name,
        name: localUser.name,
        credits: localUser.credits,
        isVerified: localUser.is_verified,
        createdAt: localUser.created_at,
        authMethod: useFirebase ? 'firebase' : 'local',
      },
      requiresEmailVerification: true,
      firebase: firebaseUser
        ? {
            uid: firebaseUser.uid,
            emailVerified: firebaseUser.emailVerified,
          }
        : null,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    logError(error, { endpoint: 'register', ip: req.ip });
    res.status(500).json({
      error: 'Registration failed',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/auth/login
 * Enhanced login with Firebase support
 */
router.post('/login', authRateLimit, loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { email, password, useFirebase = true, firebaseIdToken } = req.body;
    const pool = getPool();

    let user = null;
    let authMethod = 'local';

    // If Firebase ID token is provided, verify it directly
    if (firebaseIdToken) {
      try {
        const firebase = await getFirebaseService();
        const tokenResult = await firebase.verifyIdToken(firebaseIdToken);

        if (tokenResult.success) {
          user = await firebase.getUserByFirebaseUid(tokenResult.user.uid);
          authMethod = 'firebase_token';
        }
      } catch (firebaseError) {
        logger.error('Firebase token verification failed:', firebaseError);
      }
    }

    // If Firebase login is requested and no token provided
    if (!user && useFirebase) {
      try {
        const firebase = await getFirebaseService();
        const firebaseResult = await firebase.signInWithEmail(email, password);

        if (firebaseResult.success) {
          user = await firebase.getUserByFirebaseUid(firebaseResult.user.uid);
          authMethod = 'firebase';
        }
      } catch (firebaseError) {
        logger.error('Firebase login failed:', firebaseError);
      }
    }

    // Fallback to local authentication
    if (!user) {
      const userQuery = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

      if (userQuery.rows.length === 0) {
        logSecurityEvent('LOGIN_FAILED_USER_NOT_FOUND', {
          email,
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        });
      }

      user = userQuery.rows[0];

      // Verify password for local auth
      if (!user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
        logSecurityEvent('LOGIN_FAILED_WRONG_PASSWORD', {
          userId: user.id,
          email: user.email,
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS',
        });
      }

      authMethod = 'local';
    }

    // Check if user is verified
    if (!user.is_verified) {
      return res.status(403).json({
        error: 'Please verify your email address before logging in',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET last_login = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token
    const refreshTokenId = crypto.randomBytes(32).toString('hex');
    await cache.setex(
      `refresh_token:${refreshTokenId}`,
      604800,
      JSON.stringify({
        userId: user.id,
        token: refreshToken,
        createdAt: new Date().toISOString(),
        authMethod,
      })
    );

    logSecurityEvent('USER_LOGIN_SUCCESS', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      authMethod,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        name: user.name,
        credits: user.credits,
        subscriptionTier: user.subscription_tier,
        isVerified: user.is_verified,
        authMethod,
      },
      tokens: {
        accessToken,
        refreshToken: refreshTokenId,
        expiresIn: '15m',
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    logError(error, { endpoint: 'login', ip: req.ip });
    res.status(500).json({
      error: 'Login failed',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * POST /api/auth/firebase-register
 * Direct Firebase registration endpoint
 */
router.post(
  '/firebase-register',
  registrationRateLimit,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').trim().isLength({ min: 2, max: 50 }),
    body('lastName').trim().isLength({ min: 2, max: 50 }),
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

      const { email, password, firstName, lastName } = req.body;
      const firebase = await getFirebaseService();

      // Create user in Firebase
      const result = await firebase.createUserWithEmail(email, password, {
        displayName: `${firstName} ${lastName}`,
        firstName,
        lastName,
      });

      if (!result.success) {
        return res.status(400).json({
          error: 'Firebase registration failed',
          code: 'FIREBASE_REGISTRATION_ERROR',
          details: result.error,
        });
      }

      const localUser = await firebase.getUserByFirebaseUid(result.user.uid);

      res.status(201).json({
        message: 'Firebase registration successful',
        user: {
          id: localUser.id,
          firebase_uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          emailVerified: result.user.emailVerified,
        },
      });
    } catch (error) {
      logger.error('Firebase registration error:', error);
      res.status(500).json({
        error: 'Firebase registration failed',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

/**
 * POST /api/auth/firebase-login
 * Direct Firebase login endpoint
 */
router.post(
  '/firebase-login',
  authRateLimit,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
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

      const { email, password } = req.body;
      const firebase = await getFirebaseService();

      // Sign in with Firebase
      const result = await firebase.signInWithEmail(email, password);

      if (!result.success) {
        return res.status(401).json({
          error: 'Firebase login failed',
          code: 'FIREBASE_LOGIN_ERROR',
          details: result.error,
        });
      }

      const localUser = await firebase.getUserByFirebaseUid(result.user.uid);

      res.json({
        message: 'Firebase login successful',
        user: {
          id: localUser.id,
          firebase_uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          emailVerified: result.user.emailVerified,
          credits: localUser.credits,
          subscription_tier: localUser.subscription_tier,
        },
      });
    } catch (error) {
      logger.error('Firebase login error:', error);
      res.status(500).json({
        error: 'Firebase login failed',
        code: 'INTERNAL_ERROR',
      });
    }
  }
);

export default router;
