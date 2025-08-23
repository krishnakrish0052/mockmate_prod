import winston from 'winston';

// Configure error logger
const errorLogger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'admin-panel-errors' },
  transports: [
    new winston.transports.File({ filename: 'logs/errors.log', level: 'error' }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

// Custom error classes
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.field = field;
  }
}

export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

export class RateLimitError extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.retryAfter = retryAfter;
  }
}

export class ServiceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.statusCode = 503;
  }
}

// Main error handler middleware
export const errorHandler = (error, req, res, next) => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  // Extract error details
  const errorId = generateErrorId();
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  let code = error.code || 'INTERNAL_ERROR';
  let details = null;

  // Handle specific error types
  switch (error.name) {
    case 'ValidationError':
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      details = {
        field: error.field,
        value: error.value,
      };
      break;

    case 'CastError':
      statusCode = 400;
      code = 'INVALID_ID_FORMAT';
      message = 'Invalid ID format provided';
      break;

    case 'JsonWebTokenError':
      statusCode = 401;
      code = 'INVALID_TOKEN';
      message = 'Invalid authentication token';
      break;

    case 'TokenExpiredError':
      statusCode = 401;
      code = 'TOKEN_EXPIRED';
      message = 'Authentication token has expired';
      break;

    case 'MulterError':
      statusCode = 400;
      code = 'FILE_UPLOAD_ERROR';
      message = handleMulterError(error);
      break;

    case 'MongoError':
    case 'MongoServerError': {
      const mongoError = handleMongoError(error);
      statusCode = mongoError.statusCode;
      code = mongoError.code;
      message = mongoError.message;
      break;
    }

    case 'SequelizeError':
    case 'PostgresError': {
      const dbError = handleDatabaseError(error);
      statusCode = dbError.statusCode;
      code = dbError.code;
      message = dbError.message;
      break;
    }

    case 'RedisError':
      statusCode = 503;
      code = 'CACHE_SERVICE_ERROR';
      message = 'Cache service temporarily unavailable';
      break;

    case 'TimeoutError':
      statusCode = 504;
      code = 'REQUEST_TIMEOUT';
      message = 'Request timeout';
      break;

    default:
      // Handle HTTP errors
      if (error.status) {
        statusCode = error.status;
      }

      // Handle axios/fetch errors
      if (error.response) {
        statusCode = error.response.status || 500;
        message = error.response.data?.message || message;
      }
      break;
  }

  // Log error details
  const errorContext = {
    errorId,
    statusCode,
    code,
    message,
    stack: error.stack,
    request: {
      method: req.method,
      url: req.originalUrl,
      headers: filterSensitiveHeaders(req.headers),
      body: filterSensitiveData(req.body),
      query: req.query,
      params: req.params,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      admin: req.admin
        ? {
            id: req.admin.id,
            username: req.admin.username,
          }
        : null,
    },
  };

  // Log based on severity
  if (statusCode >= 500) {
    errorLogger.error('Server error occurred', errorContext);
  } else if (statusCode >= 400) {
    errorLogger.warn('Client error occurred', errorContext);
  } else {
    errorLogger.info('Error handled', errorContext);
  }

  // Prepare response
  const errorResponse = {
    error: {
      id: errorId,
      code,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
    },
  };

  // Add details for client errors (4xx)
  if (statusCode >= 400 && statusCode < 500) {
    if (details) {
      errorResponse.error.details = details;
    }

    // Add validation errors
    if (error.errors && Array.isArray(error.errors)) {
      errorResponse.error.validation = error.errors.map(err => ({
        field: err.path || err.param,
        message: err.message || err.msg,
        value: err.value,
      }));
    }
  }

  // Add retry information for rate limit errors
  if (error.retryAfter) {
    errorResponse.error.retryAfter = error.retryAfter;
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
    errorResponse.error.message = 'Internal server error';
    delete errorResponse.error.details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = fn => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Helper functions
function generateErrorId() {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function handleMulterError(error) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File too large';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files';
    case 'LIMIT_FIELD_KEY':
      return 'Field name too long';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value too long';
    case 'LIMIT_PART_COUNT':
      return 'Too many parts';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'MISSING_FIELD_NAME':
      return 'Missing field name';
    default:
      return 'File upload error';
  }
}

function handleMongoError(error) {
  let statusCode = 500;
  let code = 'DATABASE_ERROR';
  let message = 'Database operation failed';

  if (error.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY_ERROR';
    message = 'Resource already exists';

    // Extract duplicate field from error message
    const match = error.message.match(/index: (.+)_/);
    if (match) {
      message = `${match[1]} already exists`;
    }
  }

  return { statusCode, code, message };
}

function handleDatabaseError(error) {
  let statusCode = 500;
  let code = 'DATABASE_ERROR';
  let message = 'Database operation failed';

  // PostgreSQL specific errors
  if (error.code) {
    switch (error.code) {
      case '23505': // unique_violation
        statusCode = 409;
        code = 'DUPLICATE_KEY_ERROR';
        message = 'Resource already exists';
        break;
      case '23503': // foreign_key_violation
        statusCode = 400;
        code = 'FOREIGN_KEY_CONSTRAINT';
        message = 'Referenced resource does not exist';
        break;
      case '23502': // not_null_violation
        statusCode = 400;
        code = 'MISSING_REQUIRED_FIELD';
        message = 'Required field is missing';
        break;
      case '42703': // undefined_column
        statusCode = 400;
        code = 'INVALID_FIELD';
        message = 'Invalid field specified';
        break;
    }
  }

  return { statusCode, code, message };
}

function filterSensitiveHeaders(headers) {
  const filtered = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie'];

  sensitiveHeaders.forEach(header => {
    if (filtered[header]) {
      filtered[header] = '[FILTERED]';
    }
  });

  return filtered;
}

function filterSensitiveData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const filtered = { ...data };
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'auth',
    'api_key',
    'apiKey',
    'access_token',
    'refresh_token',
  ];

  sensitiveFields.forEach(field => {
    if (filtered[field]) {
      filtered[field] = '[FILTERED]';
    }
  });

  return filtered;
}

// 404 handler for unknown routes
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ENDPOINT_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
      statusCode: 404,
      timestamp: new Date().toISOString(),
    },
  });
};

export default errorHandler;
