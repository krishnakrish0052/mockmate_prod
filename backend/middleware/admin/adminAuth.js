import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

// Admin login rate limiting
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 login attempts per 15 minutes
  message: {
    error: 'Too many login attempts',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: 15 * 60, // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    return req.ip + ':' + (req.body?.username || 'anonymous');
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many login attempts',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 15 * 60,
    });
  },
});

// Admin authentication middleware with proper token validation
export const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'MISSING_TOKEN',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'MISSING_TOKEN',
      });
    }

    // Check if token is blacklisted
    const redis = req.app.locals.redis;
    if (redis && (await redis.isTokenBlacklisted(token))) {
      return res.status(401).json({
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED',
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'mockmate-admin',
        audience: 'mockmate-admin-panel',
      });
    } catch (jwtError) {
      console.log('JWT Verification failed:', jwtError.message);

      // Return proper error instead of fallback
      return res.status(401).json({
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID',
        details: jwtError.message,
      });
    }

    // Get admin from database to ensure account is still active
    const database = req.app.locals.database;
    if (database) {
      try {
        const admin = await database.getAdminById(decoded.adminId);
        if (!admin || !admin.is_active) {
          return res.status(401).json({
            error: 'Admin account not found or deactivated',
            code: 'ADMIN_DEACTIVATED',
          });
        }

        // Add admin info to request with fresh data
        req.admin = {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions || [],
          lastLogin: admin.last_login,
        };
      } catch (dbError) {
        console.error('Database error in admin auth:', dbError.message);
        // Fall back to token data if database is unavailable
        req.admin = {
          id: decoded.adminId,
          username: decoded.username,
          email: decoded.email,
          role: decoded.role,
          permissions: decoded.permissions || [],
          lastLogin: new Date(),
        };
      }
    } else {
      // No database available, use token data
      req.admin = {
        id: decoded.adminId,
        username: decoded.username,
        email: decoded.email,
        role: decoded.role,
        permissions: decoded.permissions || [],
        lastLogin: new Date(),
      };
    }

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);

    return res.status(500).json({
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR',
    });
  }
};

// Permission-based access control
export const requirePermission = requiredPermissions => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }

    const adminPermissions = req.admin.permissions || [];

    // Super admin has all permissions
    if (req.admin.role === 'super_admin') {
      return next();
    }

    // Check for wildcard permission
    if (adminPermissions.includes('*')) {
      return next();
    }

    // Check if admin has required permissions
    const hasPermission = Array.isArray(requiredPermissions)
      ? requiredPermissions.some(permission => adminPermissions.includes(permission))
      : adminPermissions.includes(requiredPermissions);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        required: requiredPermissions,
        current: adminPermissions,
      });
    }

    next();
  };
};

// Admin login function
export const loginAdmin = async (database, redis, username, password, ipAddress, userAgent) => {
  // Get admin by username
  const admin = await database.getAdminByUsername(username);

  if (!admin) {
    throw new Error('Invalid credentials');
  }

  if (!admin.is_active) {
    throw new Error('Admin account is deactivated');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, admin.password_hash);

  if (!isValidPassword) {
    // Log failed login attempt
    await database.logAdminActivity({
      adminId: admin.id,
      action: 'LOGIN_FAILED',
      ipAddress,
      userAgent,
      details: { reason: 'Invalid password' },
    });

    throw new Error('Invalid credentials');
  }

  // Generate JWT token
  const tokenPayload = {
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    permissions: admin.permissions || [],
  };

  const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    issuer: 'mockmate-admin',
    audience: 'mockmate-admin-panel',
  });

  const refreshToken = jwt.sign(
    { adminId: admin.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  // Store refresh token in Redis
  await redis.storeRefreshToken(admin.id, refreshToken);

  // Update last login timestamp
  await database.updateAdminLastLogin(admin.id, ipAddress, userAgent);

  // Log successful login
  await database.logAdminActivity({
    adminId: admin.id,
    action: 'LOGIN_SUCCESS',
    ipAddress,
    userAgent,
    details: { loginTime: new Date().toISOString() },
  });

  return {
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || [],
      lastLogin: new Date().toISOString(),
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    },
  };
};

// Token refresh function
export const refreshAdminToken = async (database, redis, refreshToken) => {
  // Verify refresh token
  const decoded = jwt.verify(
    refreshToken,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
  );

  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  // Check if refresh token is still valid in Redis
  const isValidRefreshToken = await redis.isRefreshTokenValid(decoded.adminId, refreshToken);

  if (!isValidRefreshToken) {
    throw new Error('Refresh token expired or revoked');
  }

  // Get updated admin data
  const admin = await database.getAdminById(decoded.adminId);

  if (!admin || !admin.is_active) {
    throw new Error('Admin account not found or deactivated');
  }

  // Generate new access token
  const tokenPayload = {
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    permissions: admin.permissions || [],
  };

  const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    issuer: 'mockmate-admin',
    audience: 'mockmate-admin-panel',
  });

  return {
    accessToken: newAccessToken,
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  };
};

// Logout function
export const logoutAdmin = async (database, redis, adminId, accessToken, refreshToken) => {
  // Blacklist the access token
  await redis.blacklistToken(accessToken);

  // Remove refresh token
  if (refreshToken) {
    await redis.removeRefreshToken(adminId, refreshToken);
  }

  // Log logout activity
  await database.logAdminActivity({
    adminId,
    action: 'LOGOUT',
    details: { logoutTime: new Date().toISOString() },
  });

  return { success: true };
};

// Create default super admin (for initial setup)
export const createDefaultSuperAdmin = async database => {
  try {
    // Check for existing admin by email (new primary identifier)
    const defaultEmail = 'admin@mockmate.com';
    const existingAdminByEmail = await database.getAdminByEmail(defaultEmail);
    if (existingAdminByEmail) {
      console.log(`Default admin already exists (email: ${defaultEmail})`);
      return existingAdminByEmail;
    }

    // Check for existing admin by username (fallback)
    const existingAdminByUsername = await database.getAdminByUsername(defaultEmail);
    if (existingAdminByUsername) {
      console.log(`Default admin already exists (username: ${defaultEmail})`);
      return existingAdminByUsername;
    }

    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'MockMateAdmin123!';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    const superAdmin = await database.createAdmin({
      username: defaultEmail, // Use email as username
      email: defaultEmail,
      passwordHash,
      role: 'super_admin',
      permissions: ['*'], // All permissions
      isActive: true,
      createdBy: null, // System created, no parent admin
      name: 'Admin User',
      firstName: 'Admin',
      lastName: 'User',
    });

    console.log('Default admin created:');
    console.log(`Username: ${defaultEmail}`);
    console.log(`Password: ${defaultPassword}`);
    console.log('Please change the password after first login!');

    return superAdmin;
  } catch (error) {
    // Handle duplicate key errors gracefully
    if (error.code === '23505') {
      console.log('Default super admin already exists (database constraint)');
      // Try to return existing admin
      try {
        const existingAdmin =
          (await database.getAdminByUsername('superadmin')) ||
          (await database.getAdminByEmail(process.env.DEFAULT_ADMIN_EMAIL || 'admin@mockmate.com'));
        if (existingAdmin) {
          return existingAdmin;
        }
      } catch (fetchError) {
        console.warn('Could not fetch existing admin:', fetchError.message);
      }
    }

    console.error('Failed to create default super admin:', error.message);
    // Don't throw error for admin setup - let the app continue
    console.log('Continuing server startup without creating default admin...');
    return null;
  }
};
