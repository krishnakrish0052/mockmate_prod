import express from 'express';
import { body, query, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import FirebaseAuthService from '../services/FirebaseAuthService.js';
import FirebaseAnalyticsService from '../services/FirebaseAnalyticsService.js';
import { logger } from '../config/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Rate limiting for admin requests
const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs for admin operations
  message: {
    error: 'Too Many Admin Requests',
    message: 'Too many admin requests, please try again later.',
    code: 'ADMIN_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/firebase-admin/analytics/users
 * Get comprehensive user analytics
 */
router.get(
  '/analytics/users',
  authenticateToken,
  adminRateLimit,
  [
    query('timeframe')
      .optional()
      .isIn(['7 days', '30 days', '90 days', '1 year'])
      .withMessage('Timeframe must be one of: 7 days, 30 days, 90 days, 1 year'),
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

      const { timeframe = '30 days' } = req.query;
      const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);

      const result = await analyticsService.getUserAnalytics(timeframe);

      if (!result.success) {
        return res.status(500).json({
          error: 'Analytics Error',
          code: 'ANALYTICS_ERROR',
          message: result.error,
        });
      }

      res.json({
        success: true,
        data: result.data,
        timeframe,
      });
    } catch (error) {
      logger.error('Failed to get user analytics:', error);
      res.status(500).json({
        error: 'Analytics Error',
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve user analytics',
      });
    }
  }
);

/**
 * GET /api/firebase-admin/analytics/auth-events
 * Get authentication events analytics
 */
router.get(
  '/analytics/auth-events',
  authenticateToken,
  adminRateLimit,
  [query('timeframe').optional().isIn(['7 days', '30 days', '90 days', '1 year'])],
  async (req, res) => {
    try {
      const { timeframe = '30 days' } = req.query;
      const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);

      const result = await analyticsService.getAuthEventsAnalytics(timeframe);

      if (!result.success) {
        return res.status(500).json({
          error: 'Analytics Error',
          code: 'ANALYTICS_ERROR',
          message: result.error,
        });
      }

      res.json({
        success: true,
        data: result.data,
        timeframe,
      });
    } catch (error) {
      logger.error('Failed to get auth events analytics:', error);
      res.status(500).json({
        error: 'Analytics Error',
        code: 'ANALYTICS_ERROR',
        message: 'Failed to retrieve authentication events analytics',
      });
    }
  }
);

/**
 * GET /api/firebase-admin/analytics/devices-sessions
 * Get device and session analytics
 */
router.get('/analytics/devices-sessions', authenticateToken, adminRateLimit, async (req, res) => {
  try {
    const { timeframe = '30 days' } = req.query;
    const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);

    const result = await analyticsService.getDeviceSessionAnalytics(timeframe);

    if (!result.success) {
      return res.status(500).json({
        error: 'Analytics Error',
        code: 'ANALYTICS_ERROR',
        message: result.error,
      });
    }

    res.json({
      success: true,
      data: result.data,
      timeframe,
    });
  } catch (error) {
    logger.error('Failed to get device/session analytics:', error);
    res.status(500).json({
      error: 'Analytics Error',
      code: 'ANALYTICS_ERROR',
      message: 'Failed to retrieve device and session analytics',
    });
  }
});

/**
 * GET /api/firebase-admin/analytics/security
 * Get security analytics
 */
router.get('/analytics/security', authenticateToken, adminRateLimit, async (req, res) => {
  try {
    const { timeframe = '30 days' } = req.query;
    const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);

    const result = await analyticsService.getSecurityAnalytics(timeframe);

    if (!result.success) {
      return res.status(500).json({
        error: 'Analytics Error',
        code: 'ANALYTICS_ERROR',
        message: result.error,
      });
    }

    res.json({
      success: true,
      data: result.data,
      timeframe,
    });
  } catch (error) {
    logger.error('Failed to get security analytics:', error);
    res.status(500).json({
      error: 'Analytics Error',
      code: 'ANALYTICS_ERROR',
      message: 'Failed to retrieve security analytics',
    });
  }
});

/**
 * GET /api/firebase-admin/analytics/realtime
 * Get real-time statistics
 */
router.get('/analytics/realtime', authenticateToken, adminRateLimit, async (req, res) => {
  try {
    const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);
    const result = await analyticsService.getRealTimeStats();

    if (!result.success) {
      return res.status(500).json({
        error: 'Analytics Error',
        code: 'ANALYTICS_ERROR',
        message: result.error,
      });
    }

    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get real-time stats:', error);
    res.status(500).json({
      error: 'Analytics Error',
      code: 'ANALYTICS_ERROR',
      message: 'Failed to retrieve real-time statistics',
    });
  }
});

/**
 * GET /api/firebase-admin/users/search
 * Search and filter users
 */
router.get(
  '/users/search',
  authenticateToken,
  adminRateLimit,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('email').optional().isLength({ min: 1 }),
    query('name').optional().isLength({ min: 1 }),
    query('provider')
      .optional()
      .isIn([
        'email',
        'google',
        'facebook',
        'github',
        'twitter',
        'microsoft',
        'apple',
        'anonymous',
      ]),
    query('isVerified').optional().isBoolean(),
    query('isActive').optional().isBoolean(),
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

      const {
        page = 1,
        limit = 50,
        email,
        name,
        provider,
        isVerified,
        isActive,
        createdAfter,
        createdBefore,
      } = req.query;

      const filters = {};
      if (email) filters.email = email;
      if (name) filters.name = name;
      if (provider) filters.provider = provider;
      if (isVerified !== undefined) filters.isVerified = isVerified === 'true';
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (createdAfter) filters.createdAfter = new Date(createdAfter);
      if (createdBefore) filters.createdBefore = new Date(createdBefore);

      const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);
      const result = await analyticsService.searchUsers(filters, parseInt(page), parseInt(limit));

      if (!result.success) {
        return res.status(500).json({
          error: 'Search Error',
          code: 'SEARCH_ERROR',
          message: result.error,
        });
      }

      res.json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      logger.error('Failed to search users:', error);
      res.status(500).json({
        error: 'Search Error',
        code: 'SEARCH_ERROR',
        message: 'Failed to search users',
      });
    }
  }
);

/**
 * GET /api/firebase-admin/logs/auth
 * Get authentication logs
 */
router.get(
  '/logs/auth',
  authenticateToken,
  adminRateLimit,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('userId').optional().isInt({ min: 1 }),
    query('eventType').optional().isLength({ min: 1 }),
    query('provider').optional().isLength({ min: 1 }),
    query('ipAddress').optional().isIP(),
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

      const {
        page = 1,
        limit = 100,
        userId,
        eventType,
        provider,
        ipAddress,
        dateFrom,
        dateTo,
      } = req.query;

      const filters = {};
      if (userId) filters.userId = parseInt(userId);
      if (eventType) filters.eventType = eventType;
      if (provider) filters.provider = provider;
      if (ipAddress) filters.ipAddress = ipAddress;
      if (dateFrom) filters.dateFrom = new Date(dateFrom);
      if (dateTo) filters.dateTo = new Date(dateTo);

      const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);
      const result = await analyticsService.getAuthLogs(filters, parseInt(page), parseInt(limit));

      if (!result.success) {
        return res.status(500).json({
          error: 'Logs Error',
          code: 'LOGS_ERROR',
          message: result.error,
        });
      }

      res.json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      logger.error('Failed to get auth logs:', error);
      res.status(500).json({
        error: 'Logs Error',
        code: 'LOGS_ERROR',
        message: 'Failed to retrieve authentication logs',
      });
    }
  }
);

/**
 * GET /api/firebase-admin/export/users
 * Export users data as CSV
 */
router.get('/export/users', authenticateToken, adminRateLimit, async (req, res) => {
  try {
    const { email, name, provider, isVerified, isActive, createdAfter, createdBefore } = req.query;

    const filters = {};
    if (email) filters.email = email;
    if (name) filters.name = name;
    if (provider) filters.provider = provider;
    if (isVerified !== undefined) filters.isVerified = isVerified === 'true';
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (createdAfter) filters.createdAfter = new Date(createdAfter);
    if (createdBefore) filters.createdBefore = new Date(createdBefore);

    const analyticsService = new FirebaseAnalyticsService(req.app.locals.database);
    const result = await analyticsService.exportUsersData(filters);

    if (!result.success) {
      return res.status(500).json({
        error: 'Export Error',
        code: 'EXPORT_ERROR',
        message: result.error,
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=users_export_${Date.now()}.csv`);
    res.send(result.data.csv);
  } catch (error) {
    logger.error('Failed to export users data:', error);
    res.status(500).json({
      error: 'Export Error',
      code: 'EXPORT_ERROR',
      message: 'Failed to export users data',
    });
  }
});

/**
 * POST /api/firebase-admin/users/create
 * Create user via Admin SDK with custom claims
 */
router.post(
  '/users/create',
  authenticateToken,
  adminRateLimit,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('displayName')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Display name must be 1-100 characters'),
    body('emailVerified').optional().isBoolean(),
    body('disabled').optional().isBoolean(),
    body('customClaims').optional().isObject(),
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

      const {
        email,
        password,
        displayName,
        photoURL,
        emailVerified,
        disabled,
        customClaims = {},
      } = req.body;

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.createUserWithClaims(
        {
          email,
          password,
          displayName,
          photoURL,
          emailVerified,
          disabled,
        },
        customClaims
      );

      if (!result.success) {
        return res.status(400).json({
          error: 'User Creation Failed',
          code: 'USER_CREATION_FAILED',
          message: result.error.message,
        });
      }

      res.status(201).json({
        success: true,
        user: result.user,
        message: 'User created successfully via Admin SDK',
      });
    } catch (error) {
      logger.error('Failed to create user via admin:', error);
      res.status(500).json({
        error: 'User Creation Error',
        code: 'USER_CREATION_ERROR',
        message: 'Failed to create user',
      });
    }
  }
);

/**
 * PUT /api/firebase-admin/users/:uid
 * Update user via Admin SDK
 */
router.put(
  '/users/:uid',
  authenticateToken,
  adminRateLimit,
  [
    body('email').optional().isEmail().normalizeEmail(),
    body('displayName').optional().isLength({ min: 1, max: 100 }),
    body('photoURL').optional().isURL(),
    body('emailVerified').optional().isBoolean(),
    body('disabled').optional().isBoolean(),
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

      const { uid } = req.params;
      const updates = {};

      if (req.body.email !== undefined) updates.email = req.body.email;
      if (req.body.displayName !== undefined) updates.displayName = req.body.displayName;
      if (req.body.photoURL !== undefined) updates.photoURL = req.body.photoURL;
      if (req.body.emailVerified !== undefined) updates.emailVerified = req.body.emailVerified;
      if (req.body.disabled !== undefined) updates.disabled = req.body.disabled;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: 'Validation Error',
          code: 'VALIDATION_ERROR',
          message: 'At least one field must be provided for update',
        });
      }

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.updateUserViaAdmin(uid, updates);

      if (!result.success) {
        return res.status(400).json({
          error: 'User Update Failed',
          code: 'USER_UPDATE_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        user: result.user,
        message: 'User updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update user via admin:', error);
      res.status(500).json({
        error: 'User Update Error',
        code: 'USER_UPDATE_ERROR',
        message: 'Failed to update user',
      });
    }
  }
);

/**
 * PUT /api/firebase-admin/users/:uid/claims
 * Set custom claims for user
 */
router.put(
  '/users/:uid/claims',
  authenticateToken,
  adminRateLimit,
  [body('claims').isObject().withMessage('Claims must be an object')],
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

      const { uid } = req.params;
      const { claims } = req.body;

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.setCustomClaims(uid, claims);

      if (!result.success) {
        return res.status(400).json({
          error: 'Claims Update Failed',
          code: 'CLAIMS_UPDATE_FAILED',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        claims: result.claims,
        message: 'Custom claims updated successfully',
      });
    } catch (error) {
      logger.error('Failed to set custom claims:', error);
      res.status(500).json({
        error: 'Claims Update Error',
        code: 'CLAIMS_UPDATE_ERROR',
        message: 'Failed to update custom claims',
      });
    }
  }
);

/**
 * POST /api/firebase-admin/users/bulk-operation
 * Perform bulk operations on users
 */
router.post(
  '/users/bulk-operation',
  authenticateToken,
  adminRateLimit,
  [
    body('operation')
      .isIn(['disable', 'enable', 'delete', 'setClaims'])
      .withMessage('Operation must be one of: disable, enable, delete, setClaims'),
    body('userIds')
      .isArray({ min: 1, max: 100 })
      .withMessage('User IDs must be an array with 1-100 items'),
    body('data').optional().isObject(),
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

      const { operation, userIds, data = {} } = req.body;

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.bulkUserOperation(operation, userIds, data);

      if (!result.success) {
        return res.status(500).json({
          error: 'Bulk Operation Failed',
          code: 'BULK_OPERATION_FAILED',
          message: result.error,
        });
      }

      res.json({
        success: true,
        ...result,
        message: `Bulk ${operation} operation completed`,
      });
    } catch (error) {
      logger.error('Failed to perform bulk operation:', error);
      res.status(500).json({
        error: 'Bulk Operation Error',
        code: 'BULK_OPERATION_ERROR',
        message: 'Failed to perform bulk operation',
      });
    }
  }
);

/**
 * GET /api/firebase-admin/users/:uid/details
 * Get detailed user information via Admin SDK
 */
router.get('/users/:uid/details', authenticateToken, adminRateLimit, async (req, res) => {
  try {
    const { uid } = req.params;

    const firebaseAuthService = new FirebaseAuthService(
      req.app.locals.database,
      req.app.locals.dynamicConfig
    );

    if (!firebaseAuthService.initialized) {
      await firebaseAuthService.initialize();
    }

    const result = await firebaseAuthService.getUserByUid(uid);

    if (!result.success) {
      return res.status(404).json({
        error: 'User Not Found',
        code: 'USER_NOT_FOUND',
        message: result.error.message,
      });
    }

    res.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    logger.error('Failed to get user details:', error);
    res.status(500).json({
      error: 'User Details Error',
      code: 'USER_DETAILS_ERROR',
      message: 'Failed to retrieve user details',
    });
  }
});

/**
 * GET /api/firebase-admin/users/list
 * List users with pagination via Admin SDK
 */
router.get(
  '/users/list',
  authenticateToken,
  adminRateLimit,
  [
    query('maxResults').optional().isInt({ min: 1, max: 1000 }),
    query('pageToken').optional().isLength({ min: 1 }),
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

      const { maxResults = 100, pageToken } = req.query;

      const firebaseAuthService = new FirebaseAuthService(
        req.app.locals.database,
        req.app.locals.dynamicConfig
      );

      if (!firebaseAuthService.initialized) {
        await firebaseAuthService.initialize();
      }

      const result = await firebaseAuthService.listUsers(parseInt(maxResults), pageToken);

      if (!result.success) {
        return res.status(500).json({
          error: 'User List Error',
          code: 'USER_LIST_ERROR',
          message: result.error.message,
        });
      }

      res.json({
        success: true,
        users: result.users,
        pageToken: result.pageToken,
      });
    } catch (error) {
      logger.error('Failed to list users:', error);
      res.status(500).json({
        error: 'User List Error',
        code: 'USER_LIST_ERROR',
        message: 'Failed to list users',
      });
    }
  }
);

export default router;
