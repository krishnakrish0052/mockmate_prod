import { body, param, query, validationResult } from 'express-validator';
import { logger } from '../config/logger.js';

/**
 * Validation error handler
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors.array(),
    });
  }
  next();
};

/**
 * Tenant validation rules
 */
export const validateTenantCreation = [
  body('tenantId')
    .isLength({ min: 3, max: 50 })
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Tenant ID must be 3-50 characters, lowercase letters, numbers, and hyphens only'),
  body('name')
    .isLength({ min: 1, max: 255 })
    .withMessage('Name is required and must be less than 255 characters'),
  body('displayName')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Display name must be less than 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('domain').optional().isFQDN().withMessage('Domain must be a valid FQDN'),
  body('subdomain')
    .optional()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain must contain only lowercase letters, numbers, and hyphens'),
  body('settings').optional().isObject().withMessage('Settings must be an object'),
  body('features').optional().isObject().withMessage('Features must be an object'),
  body('limits').optional().isObject().withMessage('Limits must be an object'),
];

export const validateTenantUpdate = [
  param('tenantId').notEmpty().withMessage('Tenant ID is required'),
  body('name')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Name must be 1-255 characters'),
  body('displayName')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Display name must be less than 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('domain').optional().isFQDN().withMessage('Domain must be a valid FQDN'),
  body('subdomain')
    .optional()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain must contain only lowercase letters, numbers, and hyphens'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended'])
    .withMessage('Status must be active, inactive, or suspended'),
];

/**
 * User validation rules
 */
export const validateUserToTenant = [
  param('tenantId').notEmpty().withMessage('Tenant ID is required'),
  body('userId').isUUID().withMessage('User ID must be a valid UUID'),
  body('role')
    .optional()
    .isIn(['admin', 'manager', 'user', 'viewer'])
    .withMessage('Role must be admin, manager, user, or viewer'),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
];

/**
 * API key validation rules
 */
export const validateApiKeyGeneration = [
  param('tenantId').notEmpty().withMessage('Tenant ID is required'),
  body('keyName')
    .isLength({ min: 1, max: 255 })
    .withMessage('Key name is required and must be less than 255 characters'),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
  body('expiresAt').optional().isISO8601().withMessage('Expires at must be a valid ISO 8601 date'),
];

/**
 * Firebase rules validation rules
 */
export const validateRulesTemplate = [
  body('name')
    .isLength({ min: 1, max: 255 })
    .withMessage('Template name is required and must be less than 255 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('category')
    .isIn(['authentication', 'authorization', 'validation', 'custom'])
    .withMessage('Category must be authentication, authorization, validation, or custom'),
  body('rules').notEmpty().withMessage('Rules content is required'),
  body('variables').optional().isObject().withMessage('Variables must be an object'),
  body('isActive').optional().isBoolean().withMessage('IsActive must be a boolean'),
];

export const validateRulesDeployment = [
  body('templateId').isUUID().withMessage('Template ID must be a valid UUID'),
  body('tenantId').notEmpty().withMessage('Tenant ID is required'),
  body('variables').optional().isObject().withMessage('Variables must be an object'),
  body('isDryRun').optional().isBoolean().withMessage('isDryRun must be a boolean'),
];

/**
 * Auth provider validation rules
 */
export const validateAuthProvider = [
  body('provider')
    .isIn(['google', 'facebook', 'github', 'microsoft', 'apple', 'twitter', 'email'])
    .withMessage('Provider must be google, facebook, github, microsoft, apple, twitter, or email'),
  body('displayName')
    .isLength({ min: 1, max: 255 })
    .withMessage('Display name is required and must be less than 255 characters'),
  body('clientId')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Client ID cannot be empty if provided'),
  body('clientSecret')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Client secret cannot be empty if provided'),
  body('scopes').optional().isArray().withMessage('Scopes must be an array'),
  body('buttonStyle').optional().isObject().withMessage('Button style must be an object'),
  body('rateLimit').optional().isObject().withMessage('Rate limit must be an object'),
];

/**
 * Query validation rules
 */
export const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isLength({ max: 255 })
    .withMessage('Search term must be less than 255 characters'),
];

export const validateDateRange = [
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
];

/**
 * Tenant API key authentication middleware
 */
export const authenticateTenantApiKey = tenantService => {
  return async (req, res, next) => {
    try {
      const apiKey = req.headers['x-api-key'];

      if (!apiKey) {
        return res.status(401).json({
          error: 'API key required',
          code: 'API_KEY_REQUIRED',
        });
      }

      const validation = await tenantService.validateTenantApiKey(apiKey);

      if (!validation.valid) {
        return res.status(401).json({
          error: validation.error,
          code: 'INVALID_API_KEY',
        });
      }

      req.tenant = {
        tenantId: validation.tenantId,
        permissions: validation.permissions,
        limits: validation.limits,
        settings: validation.settings,
      };

      next();
    } catch (error) {
      logger.error('Tenant API key auth error:', error);
      res.status(500).json({
        error: 'API key validation failed',
        code: 'AUTH_ERROR',
      });
    }
  };
};

/**
 * Rate limiting middleware
 */
export const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip + (req.tenant?.tenantId || '');
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!requests.has(key)) {
      requests.set(key, []);
    }

    const userRequests = requests.get(key);

    // Remove old requests outside the window
    while (userRequests.length > 0 && userRequests[0] < windowStart) {
      userRequests.shift();
    }

    if (userRequests.length >= max) {
      return res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
      });
    }

    userRequests.push(now);
    next();
  };
};

/**
 * Error handling middleware
 */
export const handleApiError = (error, req, res, _next) => {
  logger.error('API Error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    user: req.admin?.id,
    tenant: req.tenant?.tenantId,
  });

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: error.details,
    });
  }

  if (error.message.includes('not found')) {
    return res.status(404).json({
      error: error.message,
      code: 'NOT_FOUND',
    });
  }

  if (error.message.includes('already exists')) {
    return res.status(409).json({
      error: error.message,
      code: 'CONFLICT',
    });
  }

  if (error.message.includes('limit reached')) {
    return res.status(429).json({
      error: error.message,
      code: 'LIMIT_EXCEEDED',
    });
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { details: error.message }),
  });
};

/**
 * Request logging middleware
 */
export const logRequest = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('API Request:', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      user: req.admin?.id,
      tenant: req.tenant?.tenantId,
      ip: req.ip,
    });
  });

  next();
};
