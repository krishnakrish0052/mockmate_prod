import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { getDatabase } from '../config/database.js';
import { DynamicConfigService } from '../services/DynamicConfigService.js';

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

// Initialize dynamic config service
let dynamicConfig = null;
const getDynamicConfig = async () => {
  if (!dynamicConfig) {
    const database = getPool();
    dynamicConfig = new DynamicConfigService(database);
    await dynamicConfig.initialize();
  }
  return dynamicConfig;
};

import { authenticateToken, blacklistToken } from '../middleware/auth.js';
import { logError, logSecurityEvent, logger } from '../config/logger.js';

const router = express.Router();

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
  max: process.env.NODE_ENV === 'development' ? 100 : 3, // Allow more attempts in development
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
];

const loginValidation = [body('email').isEmail().normalizeEmail(), body('password').notEmpty()];

const passwordResetRequestValidation = [body('email').isEmail().normalizeEmail()];

const passwordResetValidation = [
  body('token').notEmpty(),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
];

// Helper function to generate JWT
const generateTokens = userId => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const refreshToken = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });

  return { accessToken, refreshToken };
};

// Register endpoint
router.post('/register', registrationRateLimit, registerValidation, async (req, res) => {
  try {
    // Debug logging
    console.log('=== REGISTRATION REQUEST DEBUG ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);

    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', JSON.stringify(errors.array(), null, 2));
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    console.log('Validation passed, proceeding with registration...');

    const { email, password, firstName, lastName } = req.body;

    const pool = getPool();
    const config = await getDynamicConfig();

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
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

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Get starting credits from dynamic configuration
    const startingCredits = await config.get('new_user_starting_credits', 0);

    // Create user (initially unverified)
    const newUserQuery = `
      INSERT INTO users (email, password_hash, first_name, last_name, credits, is_verified)
      VALUES ($1, $2, $3, $4, $5, FALSE)
      RETURNING id, email, first_name, last_name, credits, created_at, is_verified
    `;

    const newUser = await pool.query(newUserQuery, [
      email,
      hashedPassword,
      firstName,
      lastName,
      startingCredits, // Dynamic starting credits
    ]);

    const user = newUser.rows[0];

    // Send email verification
    try {
      const EmailVerificationServiceModule = await import('../services/EmailVerificationService.js');
      const EmailVerificationService = EmailVerificationServiceModule.default;
      const emailVerificationService = new EmailVerificationService(pool);

      const verificationResult = await emailVerificationService.sendVerificationEmail(user);
      console.log('Verification email sent:', verificationResult.messageId);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      // Don't fail registration if email fails, but log it
    }

    logSecurityEvent('USER_REGISTERED', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
      emailVerificationRequired: true,
    });

    // Return success without tokens (require email verification first)
    res.status(201).json({
      message:
        'Registration successful! Please check your email to verify your account before logging in.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        credits: user.credits,
        isVerified: user.is_verified,
        createdAt: user.created_at,
      },
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error('Registration error:', error);
    logError(error, { endpoint: 'register', ip: req.ip });
    res.status(500).json({
      error: 'Registration failed',
      code: 'REGISTRATION_ERROR',
      message: error.message,
    });
  }
});

// Login endpoint
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

    const { email, password } = req.body;
    const pool = getPool();

    // Check if user exists and is active
    const userQuery = `
      SELECT id, email, password_hash, first_name, last_name, credits, is_active, is_verified, failed_login_attempts, locked_until
      FROM users WHERE email = $1
    `;
    const userResult = await pool.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      logSecurityEvent('LOGIN_ATTEMPT_INVALID_EMAIL', {
        email,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const user = userResult.rows[0];

    // Check if account is active
    if (!user.is_active) {
      logSecurityEvent('LOGIN_ATTEMPT_INACTIVE_ACCOUNT', {
        userId: user.id,
        email,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    // Check if email is verified
    if (!user.is_verified) {
      logSecurityEvent('LOGIN_ATTEMPT_UNVERIFIED_EMAIL', {
        userId: user.id,
        email,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Email not verified. Please check your email and click the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
        canResendVerification: true,
      });
    }

    // Check if account is locked
    if (user.locked_until && user.locked_until > new Date()) {
      logSecurityEvent('LOGIN_ATTEMPT_LOCKED_ACCOUNT', {
        userId: user.id,
        email,
        ip: req.ip,
        lockedUntil: user.locked_until,
      });
      return res.status(423).json({
        error: 'Account is temporarily locked',
        code: 'ACCOUNT_LOCKED',
        lockedUntil: user.locked_until,
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      // Increment failed login attempts
      const failedAttempts = (user.failed_login_attempts || 0) + 1;
      let lockedUntil = null;

      // Lock account after 5 failed attempts for 30 minutes
      if (failedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      }

      await pool.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
        [failedAttempts, lockedUntil, user.id]
      );

      logSecurityEvent('LOGIN_FAILED', {
        userId: user.id,
        email,
        ip: req.ip,
        failedAttempts,
        locked: !!lockedUntil,
      });

      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    // Reset failed login attempts on successful login
    await pool.query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Clean up old refresh tokens and store new one
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    logSecurityEvent('USER_LOGIN', {
      userId: user.id,
      email: user.email,
      ip: req.ip,
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        credits: user.credits,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'login', ip: req.ip });
    res.status(500).json({
      error: 'Login failed',
      code: 'LOGIN_ERROR',
    });
  }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        code: 'REFRESH_TOKEN_REQUIRED',
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        error: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    const pool = getPool();

    // Check if refresh token exists in database
    const tokenQuery = 'SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1';
    const tokenResult = await pool.query(tokenQuery, [refreshToken]);

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is expired
    if (tokenData.expires_at < new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      return res.status(401).json({
        error: 'Refresh token expired',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    // Check if user still exists and is active
    const userQuery = 'SELECT id, email, is_active FROM users WHERE id = $1';
    const userResult = await pool.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      return res.status(401).json({
        error: 'Invalid user',
        code: 'INVALID_USER',
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(decoded.userId);

    // Update refresh token in database
    await pool.query('UPDATE refresh_tokens SET token = $1, expires_at = $2 WHERE user_id = $3', [
      newRefreshToken,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      decoded.userId,
    ]);

    res.json({
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    logError(error, { endpoint: 'refresh', ip: req.ip });
    res.status(500).json({
      error: 'Token refresh failed',
      code: 'REFRESH_ERROR',
    });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    // Blacklist the access token
    await blacklistToken(token);

    const pool = getPool();

    // Remove refresh token from database
    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

    logSecurityEvent('USER_LOGOUT', {
      userId: req.user.id,
      ip: req.ip,
    });

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    logError(error, { endpoint: 'logout', userId: req.user?.id, ip: req.ip });
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR',
    });
  }
});

// Password reset request
router.post(
  '/password-reset-request',
  authRateLimit,
  passwordResetRequestValidation,
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

      // Check if user exists (don't reveal if email exists or not)
      const userQuery = 'SELECT id FROM users WHERE email = $1 AND is_active = true';
      const userResult = await pool.query(userQuery, [email]);

      // Always respond with success to prevent email enumeration
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Store reset token
        await pool.query(
          'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3, created_at = CURRENT_TIMESTAMP',
          [userId, resetToken, resetExpires]
        );

        // Send password reset email
        try {
          const userDetails = await pool.query(
            'SELECT first_name, name FROM users WHERE id = $1', 
            [userId]
          );
          const user = userDetails.rows[0];
          
          const { emailService } = await import('../services/EmailService.js');
          await emailService.sendPasswordResetEmail(
            {
              id: userId,
              email: email,
              first_name: user.first_name,
              name: user.name
            },
            resetToken,
            {
              ip: req.ip,
              userAgent: req.get('User-Agent') || 'Unknown',
              location: 'Unknown' // Could integrate with IP geolocation service
            }
          );
          
          logger.info(`Password reset email sent to ${email}`, {
            userId,
            ip: req.ip
          });
        } catch (emailError) {
          logger.error('Failed to send password reset email:', {
            userId,
            email,
            error: emailError.message
          });
          // Don't fail the request if email fails - security consideration
        }

        logSecurityEvent('PASSWORD_RESET_REQUESTED', {
          userId,
          email,
          ip: req.ip,
        });
      }

      res.json({
        message: 'If the email exists, a password reset link has been sent',
      });
    } catch (error) {
      logError(error, { endpoint: 'password-reset-request', ip: req.ip });
      res.status(500).json({
        error: 'Password reset request failed',
        code: 'PASSWORD_RESET_REQUEST_ERROR',
      });
    }
  }
);

// Password reset
router.post('/password-reset', authRateLimit, passwordResetValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { token, password } = req.body;
    const pool = getPool();

    // Find valid reset token
    const resetQuery = `
      SELECT pr.user_id, u.email 
      FROM password_resets pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.token = $1 AND pr.expires_at > CURRENT_TIMESTAMP AND u.is_active = true
    `;
    const resetResult = await pool.query(resetQuery, [token]);

    if (resetResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid or expired reset token',
        code: 'INVALID_RESET_TOKEN',
      });
    }

    const { user_id: userId, email } = resetResult.rows[0];

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await pool.query('BEGIN');
    try {
      await pool.query(
        'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2',
        [hashedPassword, userId]
      );

      await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);

      // Invalidate all refresh tokens for this user
      await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

      await pool.query('COMMIT');

      logSecurityEvent('PASSWORD_RESET_COMPLETED', {
        userId,
        email,
        ip: req.ip,
      });

      res.json({
        message: 'Password reset successfully',
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logError(error, { endpoint: 'password-reset', ip: req.ip });
    res.status(500).json({
      error: 'Password reset failed',
      code: 'PASSWORD_RESET_ERROR',
    });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();

    const userQuery = `
      SELECT id, email, first_name, last_name, name, credits, created_at, last_activity
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
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        name: user.name,
        credits: user.credits,
        createdAt: user.created_at,
        lastActivity: user.last_activity,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'me', userId: req.user?.id, ip: req.ip });
    res.status(500).json({
      error: 'Failed to get user info',
      code: 'USER_INFO_ERROR',
    });
  }
});

export default router;
