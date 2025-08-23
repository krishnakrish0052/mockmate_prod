import jwt from 'jsonwebtoken';
import { getDatabase } from '../config/database.js';
import { cache } from '../config/redis.js';
import { logSecurityEvent } from '../config/logger.js';

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

// JWT Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', {
      ip: req.ip,
      url: req.url,
      userAgent: req.get('User-Agent'),
    });
    return res.status(401).json({
      error: 'Access token required',
      code: 'TOKEN_REQUIRED',
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if token is blacklisted (for logout functionality)
    const blacklisted = await cache.exists(`blacklist:${token}`);
    if (blacklisted) {
      logSecurityEvent('BLACKLISTED_TOKEN_USED', {
        userId: decoded.userId,
        ip: req.ip,
        token: token.substring(0, 20) + '...',
      });
      return res.status(401).json({
        error: 'Token has been invalidated',
        code: 'TOKEN_BLACKLISTED',
      });
    }

    // Get user from database to ensure they still exist and are active
    const pool = getPool();
    const userQuery =
      'SELECT id, email, created_at, credits FROM users WHERE id = $1 AND is_active = true';
    const userResult = await pool.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0) {
      logSecurityEvent('INVALID_USER_TOKEN', {
        userId: decoded.userId,
        ip: req.ip,
      });
      return res.status(401).json({
        error: 'Invalid user token',
        code: 'USER_NOT_FOUND',
      });
    }

    // Check if token is expired (additional check beyond JWT expiry)
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    // Attach user info to request
    req.user = {
      id: userResult.rows[0].id,
      email: userResult.rows[0].email,
      credits: userResult.rows[0].credits,
      createdAt: userResult.rows[0].created_at,
    };

    // Update last activity
    await pool.query('UPDATE users SET last_activity = CURRENT_TIMESTAMP WHERE id = $1', [
      req.user.id,
    ]);

    next();
  } catch (_error) {
    logSecurityEvent('TOKEN_VERIFICATION_FAILED', {
      error: _error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    if (_error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (_error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(500).json({
      error: 'Token verification failed',
      code: 'TOKEN_VERIFICATION_ERROR',
    });
  }
};

// Optional authentication - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pool = getPool();
    const userQuery =
      'SELECT id, email, created_at, credits FROM users WHERE id = $1 AND is_active = true';
    const userResult = await pool.query(userQuery, [decoded.userId]);

    if (userResult.rows.length > 0) {
      req.user = {
        id: userResult.rows[0].id,
        email: userResult.rows[0].email,
        credits: userResult.rows[0].credits,
        createdAt: userResult.rows[0].created_at,
      };
    } else {
      req.user = null;
    }
  } catch (_error) {
    req.user = null;
  }

  next();
};

// Check if user has enough credits
const requireCredits = (minimumCredits = 1) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    // Get current credits from database (real-time check)
    const pool = getPool();
    const creditQuery = 'SELECT credits FROM users WHERE id = $1';
    const creditResult = await pool.query(creditQuery, [req.user.id]);

    if (creditResult.rows.length === 0) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const currentCredits = creditResult.rows[0].credits;
    req.user.credits = currentCredits; // Update user object with current credits

    if (currentCredits < minimumCredits) {
      logSecurityEvent('INSUFFICIENT_CREDITS_ACCESS', {
        userId: req.user.id,
        requiredCredits: minimumCredits,
        currentCredits,
        ip: req.ip,
      });

      return res.status(403).json({
        error: 'Insufficient credits',
        code: 'INSUFFICIENT_CREDITS',
        required: minimumCredits,
        current: currentCredits,
      });
    }

    next();
  };
};

// Admin role check
const requireAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  try {
    const pool = getPool();
    const adminQuery = 'SELECT role FROM users WHERE id = $1';
    const adminResult = await pool.query(adminQuery, [req.user.id]);

    if (adminResult.rows.length === 0 || adminResult.rows[0].role !== 'admin') {
      logSecurityEvent('UNAUTHORIZED_ADMIN_ACCESS', {
        userId: req.user.id,
        ip: req.ip,
        url: req.url,
      });

      return res.status(403).json({
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED',
      });
    }

    next();
  } catch (_error) {
    return res.status(500).json({
      error: 'Authorization check failed',
      code: 'AUTH_CHECK_ERROR',
    });
  }
};

// Session validation for WebSocket connections
const validateWebSocketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check user exists and is active
    const pool = getPool();
    const userQuery = 'SELECT id, email, credits FROM users WHERE id = $1 AND is_active = true';
    const userResult = await pool.query(userQuery, [decoded.userId]);

    if (userResult.rows.length === 0) {
      return next(new Error('Invalid user'));
    }

    socket.userId = userResult.rows[0].id;
    socket.userEmail = userResult.rows[0].email;
    socket.userCredits = userResult.rows[0].credits;

    next();
  } catch (_error) {
    next(new Error('Invalid token'));
  }
};

// Rate limiting per user
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(); // Skip rate limiting for non-authenticated requests
    }

    const key = `rate_limit:${req.user.id}:${req.route?.path || req.path}`;
    const requests = await cache.increment(key, windowMs / 1000);

    if (requests > maxRequests) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        userId: req.user.id,
        path: req.path,
        requests,
        limit: maxRequests,
        ip: req.ip,
      });

      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: windowMs / 1000,
      });
    }

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': Math.max(0, maxRequests - requests),
      'X-RateLimit-Reset': new Date(Date.now() + windowMs).toISOString(),
    });

    next();
  };
};

// Blacklist token (for logout)
const blacklistToken = async (token, expiry = 24 * 60 * 60) => {
  await cache.set(`blacklist:${token}`, true, expiry);
};

export {
  authenticateToken,
  optionalAuth,
  requireCredits,
  requireAdmin,
  validateWebSocketAuth,
  userRateLimit,
  blacklistToken,
};
