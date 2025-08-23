import { logger } from '../config/logger.js';

/**
 * Middleware to require admin authentication
 * This middleware should be used after the adminAuth middleware
 */
export const requireAdmin = (req, res, next) => {
  try {
    // Check if admin is authenticated (should be set by adminAuth middleware)
    if (!req.admin) {
      return res.status(401).json({
        error: 'Admin authentication required',
        code: 'ADMIN_AUTH_REQUIRED',
      });
    }

    // Check if admin account is active
    if (!req.admin.isActive && req.admin.is_active !== true) {
      return res.status(403).json({
        error: 'Admin account is deactivated',
        code: 'ADMIN_ACCOUNT_DEACTIVATED',
      });
    }

    next();
  } catch (error) {
    logger.error('Admin middleware error:', error);
    return res.status(500).json({
      error: 'Admin authorization service error',
      code: 'ADMIN_AUTH_SERVICE_ERROR',
    });
  }
};

/**
 * Middleware to require super admin role
 */
export const requireSuperAdmin = (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({
        error: 'Admin authentication required',
        code: 'ADMIN_AUTH_REQUIRED',
      });
    }

    if (req.admin.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Super admin access required',
        code: 'SUPER_ADMIN_REQUIRED',
      });
    }

    next();
  } catch (error) {
    logger.error('Super admin middleware error:', error);
    return res.status(500).json({
      error: 'Admin authorization service error',
      code: 'ADMIN_AUTH_SERVICE_ERROR',
    });
  }
};

/**
 * Middleware to require specific permissions
 */
export const requirePermissions = requiredPermissions => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({
          error: 'Admin authentication required',
          code: 'ADMIN_AUTH_REQUIRED',
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
    } catch (error) {
      logger.error('Permission middleware error:', error);
      return res.status(500).json({
        error: 'Admin authorization service error',
        code: 'ADMIN_AUTH_SERVICE_ERROR',
      });
    }
  };
};

/**
 * Middleware to require analytics permissions specifically
 */
export const requireAnalyticsPermission = requirePermissions([
  'analytics',
  'analytics.read',
  'system_settings',
]);

export default {
  requireAdmin,
  requireSuperAdmin,
  requirePermissions,
  requireAnalyticsPermission,
};
