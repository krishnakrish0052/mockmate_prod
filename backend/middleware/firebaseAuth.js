import FirebaseAuthService from '../services/FirebaseAuthService.js';
import { DynamicConfigService } from '../services/DynamicConfigService.js';
import { getDatabase } from '../config/database.js';
import { logSecurityEvent, logger } from '../config/logger.js';

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

// Initialize Firebase service (singleton)
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

/**
 * Firebase Authentication Middleware
 * Verifies Firebase ID tokens and attaches user information to the request
 */
export const authenticateFirebaseToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authorization header missing or invalid format',
        code: 'MISSING_AUTH_HEADER',
      });
    }

    const idToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!idToken) {
      return res.status(401).json({
        error: 'Firebase ID token is required',
        code: 'MISSING_TOKEN',
      });
    }

    // Verify the Firebase ID token
    const firebase = await getFirebaseService();
    const tokenResult = await firebase.verifyIdToken(idToken);

    if (!tokenResult.success) {
      logSecurityEvent('FIREBASE_TOKEN_VERIFICATION_FAILED', {
        error: tokenResult.error,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(401).json({
        error: 'Invalid or expired Firebase token',
        code: 'INVALID_TOKEN',
      });
    }

    // Get local user data
    const localUser = await firebase.getUserByFirebaseUid(tokenResult.user.uid);

    if (!localUser) {
      return res.status(404).json({
        error: 'User not found in local database',
        code: 'USER_NOT_FOUND',
      });
    }

    // Check if user is verified
    if (!localUser.is_verified) {
      return res.status(403).json({
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    // Attach user information to request
    req.user = {
      id: localUser.id,
      firebase_uid: tokenResult.user.uid,
      email: tokenResult.user.email,
      name: localUser.name,
      first_name: localUser.first_name,
      last_name: localUser.last_name,
      credits: localUser.credits,
      subscription_tier: localUser.subscription_tier,
      is_verified: localUser.is_verified,
      authMethod: 'firebase',
    };

    req.firebaseUser = tokenResult.user;

    // Update last activity
    try {
      const pool = getPool();
      await pool.query('UPDATE users SET last_activity = NOW() WHERE id = $1', [localUser.id]);
    } catch (updateError) {
      logger.warn('Failed to update last activity:', updateError);
    }

    next();
  } catch (error) {
    logger.error('Firebase authentication middleware error:', error);

    return res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR',
    });
  }
};

/**
 * Optional Firebase Authentication Middleware
 * Similar to authenticateFirebaseToken but doesn't return error if no token provided
 */
export const optionalFirebaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // If no auth header, just continue without authentication
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const idToken = authHeader.substring(7);

    if (!idToken) {
      return next();
    }

    // Try to verify token, but don't fail if it's invalid
    try {
      const firebase = await getFirebaseService();
      const tokenResult = await firebase.verifyIdToken(idToken);

      if (tokenResult.success) {
        const localUser = await firebase.getUserByFirebaseUid(tokenResult.user.uid);

        if (localUser && localUser.is_verified) {
          req.user = {
            id: localUser.id,
            firebase_uid: tokenResult.user.uid,
            email: tokenResult.user.email,
            name: localUser.name,
            credits: localUser.credits,
            subscription_tier: localUser.subscription_tier,
            is_verified: localUser.is_verified,
            authMethod: 'firebase',
          };

          req.firebaseUser = tokenResult.user;
        }
      }
    } catch (tokenError) {
      logger.warn('Optional Firebase auth failed:', tokenError);
    }

    next();
  } catch (error) {
    logger.error('Optional Firebase authentication error:', error);
    next(); // Continue even if there's an error
  }
};

/**
 * Firebase Admin Authentication Middleware
 * Requires user to be an admin (checks both Firebase and local admin status)
 */
export const authenticateFirebaseAdmin = async (req, res, next) => {
  try {
    // First authenticate the Firebase token
    await new Promise((resolve, reject) => {
      authenticateFirebaseToken(req, res, err => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Check if user is admin
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    // Check local admin status
    const pool = getPool();
    const adminQuery = await pool.query(
      'SELECT id FROM admin_users WHERE email = $1 AND is_active = true',
      [req.user.email]
    );

    if (adminQuery.rows.length === 0) {
      logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS_ATTEMPT', {
        userId: req.user.id,
        email: req.user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      return res.status(403).json({
        error: 'Admin access required',
        code: 'ADMIN_ACCESS_REQUIRED',
      });
    }

    req.admin = {
      id: adminQuery.rows[0].id,
      ...req.user,
    };

    next();
  } catch (error) {
    logger.error('Firebase admin authentication error:', error);

    if (error.status) {
      return res.status(error.status).json(error);
    }

    return res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR',
    });
  }
};

/**
 * Role-based Access Control Middleware
 * Checks if user has specific roles or permissions
 */
export const requireFirebaseRole = requiredRoles => {
  return async (req, res, next) => {
    try {
      // First authenticate the Firebase token
      await new Promise((resolve, reject) => {
        authenticateFirebaseToken(req, res, err => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      // Get user roles from database
      const pool = getPool();
      const rolesQuery = await pool.query(
        `
        SELECT r.name as role_name, r.permissions 
        FROM user_roles ur 
        JOIN roles r ON ur.role_id = r.id 
        WHERE ur.user_id = $1 AND ur.is_active = true AND r.is_active = true
      `,
        [req.user.id]
      );

      const userRoles = rolesQuery.rows.map(row => row.role_name);
      const userPermissions = rolesQuery.rows.flatMap(row =>
        row.permissions ? JSON.parse(row.permissions) : []
      );

      // Check if user has required roles
      const hasRequiredRole = Array.isArray(requiredRoles)
        ? requiredRoles.some(role => userRoles.includes(role))
        : userRoles.includes(requiredRoles);

      if (!hasRequiredRole) {
        logSecurityEvent('INSUFFICIENT_ROLE_ACCESS_ATTEMPT', {
          userId: req.user.id,
          email: req.user.email,
          userRoles,
          requiredRoles,
          ip: req.ip,
        });

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredRoles,
          current: userRoles,
        });
      }

      req.userRoles = userRoles;
      req.userPermissions = userPermissions;

      next();
    } catch (error) {
      logger.error('Firebase role authentication error:', error);

      if (error.status) {
        return res.status(error.status).json(error);
      }

      return res.status(500).json({
        error: 'Authentication service error',
        code: 'AUTH_SERVICE_ERROR',
      });
    }
  };
};

/**
 * Subscription Tier Middleware
 * Checks if user has required subscription tier
 */
export const requireSubscriptionTier = requiredTier => {
  const tierHierarchy = {
    free: 0,
    basic: 1,
    premium: 2,
    enterprise: 3,
  };

  return async (req, res, next) => {
    try {
      // First authenticate the Firebase token
      await new Promise((resolve, reject) => {
        authenticateFirebaseToken(req, res, err => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const userTier = req.user.subscription_tier || 'free';
      const userTierLevel = tierHierarchy[userTier] || 0;
      const requiredTierLevel = tierHierarchy[requiredTier] || 0;

      if (userTierLevel < requiredTierLevel) {
        return res.status(402).json({
          error: 'Subscription upgrade required',
          code: 'SUBSCRIPTION_UPGRADE_REQUIRED',
          currentTier: userTier,
          requiredTier: requiredTier,
        });
      }

      next();
    } catch (error) {
      logger.error('Subscription tier middleware error:', error);

      if (error.status) {
        return res.status(error.status).json(error);
      }

      return res.status(500).json({
        error: 'Authentication service error',
        code: 'AUTH_SERVICE_ERROR',
      });
    }
  };
};

/**
 * Firebase Token Refresh Middleware
 * Handles token refresh automatically
 */
export const handleTokenRefresh = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const idToken = authHeader.substring(7);

    try {
      const firebase = await getFirebaseService();
      const tokenResult = await firebase.verifyIdToken(idToken);

      // If token is valid, continue
      if (tokenResult.success) {
        return next();
      }

      // If token is expired and we have a refresh token, suggest refresh
      if (tokenResult.error === 'Invalid or expired token') {
        return res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          shouldRefresh: true,
        });
      }
    } catch (error) {
      logger.warn('Token refresh check failed:', error);
    }

    next();
  } catch (error) {
    logger.error('Token refresh middleware error:', error);
    next();
  }
};

// Export default middleware as the standard Firebase auth
export default authenticateFirebaseToken;
