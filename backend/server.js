import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// Debug environment variables
if (process.env.NODE_ENV === 'development') {
  console.log('Environment variables loaded:');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '[SET]' : '[NOT SET]');
  console.log('DB_HOST:', process.env.DB_HOST || '[NOT SET]');
  console.log('DB_USER:', process.env.DB_USER || '[NOT SET]');
  console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : '[NOT SET]');
}

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getDatabase, initializeDatabase } from './config/database.js';
import { adminAuthManager, closeRedis, initializeRedis } from './config/redis.js';
import { logger, requestLogger } from './config/logger.js';
// import { initializeWebSocket } from './websocket/socketHandlers.js';

// Import payment services
import { PaymentService } from './services/PaymentService.js';
import { PaymentHealthCheckService } from './services/PaymentHealthCheckService.js';
import { PaymentWebhookService } from './services/PaymentWebhookService.js';

// Import dynamic configuration service
import { createDynamicConfig } from './services/DynamicConfigService.js';

// Import AlertService
import { AlertService } from './services/AlertService.js';

// Import web routes
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import resumeRoutes from './routes/resumes.js';
import paymentRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhook.js';

// Import admin routes
import adminRoutes from './routes/admin/admin.js';
import adminProfileRoutes from './routes/admin/adminProfile.js';
import paymentConfigRoutes from './routes/admin/paymentConfig.js';
import configurationAdminRoutes from './routes/admin/configurationAdmin.js';
import dynamicConfigAdminRoutes from './routes/admin/dynamic-config.js';
import systemAdminRoutes from './routes/admin/system.js';
import iconManagementRoutes from './routes/admin/iconManagement.js';
import appManagementRoutes from './routes/admin/appManagement.js';
import alertRoutes from './routes/admin/alerts.js';
import appDownloadRoutes from './routes/appDownloads.js';
import { adminAuth } from './middleware/admin/adminAuth.js';

// Import email template routes
import { createEmailTemplateRoutes } from './routes/admin/emailTemplates.js';

// Import email notification routes
import emailNotificationRoutes from './routes/admin/emailNotifications.js';

// Import client configuration routes
import configRoutes from './routes/config.js';

// Import email verification routes
import emailVerificationRoutes from './routes/emailVerification.js';

// Import Firebase authentication routes
import firebaseAuthRoutes from './routes/firebaseAuth.js';
import firebaseAdminRoutes from './routes/firebaseAdmin.js';

// Import analytics system
import AnalyticsService from './services/AnalyticsService.js';
import { createAnalyticsMiddleware } from './middleware/analyticsMiddleware.js';
import { createAnalyticsRoutes } from './routes/analyticsRoutes.js';

// Import middleware
import { authenticateToken } from './middleware/auth.js';

// Import debug routes
import debugUploadRoutes from './debug-upload.js';

const app = express();
const server = http.createServer(app);

// We'll initialize Socket.IO after setting up dynamic config
let io;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://mock-mate.com',
  'https://www.mock-mate.com',
  'https://api.mock-mate.com',
  'https://backend.mock-mate.com'
];

// Add environment-specific origins
if (process.env.CORS_ORIGINS) {
  allowedOrigins.push(...process.env.CORS_ORIGINS.split(','));
}
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Remove duplicates
const uniqueOrigins = [...new Set(allowedOrigins)];

console.log('CORS allowed origins:', uniqueOrigins);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      
      if (uniqueOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With', 
      'Accept', 
      'Origin',
      'X-File-Name',
      'Cache-Control',
      'X-Requested-With'
    ],
    exposedHeaders: ['Content-Length', 'X-File-Hash'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  skip: (req) => {
    // Skip rate limiting for file uploads (they take longer and are typically one-off)
    return req.path.includes('/upload') || req.path.includes('/versions/upload');
  }
});
app.use('/api/', limiter);

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parsing middleware  
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// Static files for uploaded resumes
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Static files for icons (publicly accessible)
app.use('/icons', express.static(path.join(__dirname, 'uploads/icons')));

// Analytics middleware will be added after database initialization
// Placeholder for analytics routes that will be added after initialization
let analyticsRoutes;

// Web API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/payments', paymentRoutes);
// User profile routes will be added dynamically after database initialization

// Configuration routes (public for frontend access)
// Apply admin auth to specific icon management routes
app.use('/api/config/icons/upload', adminAuth);
app.use('/api/config/icons/settings', adminAuth);
app.use('/api/config/icons/list', adminAuth);
app.use('/api/config', configRoutes);

// Debug endpoint to check paths and database
app.get('/api/debug-templates', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { Pool } = await import('pg');

    // Check various possible template directories
    const possiblePaths = [
      'email-templates',
      './email-templates',
      '../email-templates',
      path.resolve('email-templates'),
      path.join(process.cwd(), 'email-templates'),
    ];

    let foundPath = null;
    let templates = [];

    for (const testPath of possiblePaths) {
      try {
        const files = await fs.readdir(testPath);
        const htmlFiles = files.filter(f => f.endsWith('.html'));
        if (htmlFiles.length > 0) {
          foundPath = testPath;
          templates = htmlFiles;
          break;
        }
      } catch (e) {
        // Path doesn't exist, continue
      }
    }

    // Check database connection and existing templates
    let dbStatus = 'Unknown';
    let existingTemplates = 0;

    try {
      const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'mockmate_db',
        user: process.env.DB_USER || 'mockmate_user',
        password: process.env.DB_PASSWORD ? String(process.env.DB_PASSWORD.trim()) : undefined,
      });
      const client = await pool.connect();
      const result = await client.query('SELECT COUNT(*) as count FROM email_templates');
      existingTemplates = parseInt(result.rows[0].count);
      client.release();
      await pool.end();
      dbStatus = 'Connected';
    } catch (dbError) {
      dbStatus = `Error: ${dbError.message}`;
    }

    res.json({
      serverInfo: {
        cwd: process.cwd(),
        nodeVersion: process.version,
        platform: process.platform,
      },
      templateSearch: {
        foundPath,
        resolvedPath: foundPath ? path.resolve(foundPath) : null,
        templatesFound: templates,
        totalTemplates: templates.length,
      },
      database: {
        status: dbStatus,
        existingTemplates,
        databaseUrl: process.env.DATABASE_URL ? '[CONFIGURED]' : '[NOT SET]',
      },
    });
  } catch (error) {
    res.json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Public email template import endpoint for testing
app.post('/api/import-email-templates', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { Pool } = await import('pg');

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Use the path that actually works based on debug endpoint
    const TEMPLATES_DIR = path.resolve('../email-templates');

    // List all HTML files in the directory
    const files = await fs.readdir(TEMPLATES_DIR);
    const htmlFiles = files.filter(file => file.endsWith('.html'));

    if (htmlFiles.length === 0) {
      return res.status(404).json({ error: 'No HTML templates found to import' });
    }

    const client = await pool.connect();
    let importedCount = 0;

    try {
      await client.query('BEGIN');

      // Get first available user as creator
      const userQuery = 'SELECT id FROM users LIMIT 1';
      const userResult = await client.query(userQuery);
      const userId = userResult.rows[0]?.id || 1; // fallback to ID 1

      // Import each template
      for (const fileName of htmlFiles) {
        const filePath = path.join(TEMPLATES_DIR, fileName);
        const content = await fs.readFile(filePath, 'utf8');

        // Skip base template
        if (fileName === 'base-template.html') {
          continue;
        }

        const name = path.basename(fileName, '.html');
        const displayName = name
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Determine category
        let category = 'General';
        if (
          name.includes('verification') ||
          name.includes('onboarding') ||
          name.includes('welcome') ||
          name.includes('password-reset')
        ) {
          category = 'Authentication';
        } else if (
          name.includes('interview') ||
          name.includes('reminder') ||
          name.includes('invitation')
        ) {
          category = 'Notifications';
        } else if (name.includes('feedback')) {
          category = 'Feedback';
        } else if (name.includes('billing') || name.includes('subscription')) {
          category = 'Billing';
        }

        // Extract subject from content or create default
        let subject = `${displayName} Notification`;
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          subject = titleMatch[1];
        }

        // Check if template already exists
        const existingQuery = 'SELECT id FROM email_templates WHERE template_name = $1';
        const existingResult = await client.query(existingQuery, [name]);

        if (existingResult.rows.length === 0) {
          // Insert new template
          await client.query(
            `
            INSERT INTO email_templates (
              template_name, template_type, subject, template_content, 
              variables, is_active, created_at, updated_at, created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $7)
          `,
            [name, 'notification', subject, content, JSON.stringify([]), true, userId]
          );

          importedCount++;
        }
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Successfully imported ${importedCount} email templates`,
        imported_count: importedCount,
        total_files: htmlFiles.length - 1, // Exclude base-template.html
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error importing email templates:', error);
    res.status(500).json({ error: 'Failed to import email templates: ' + error.message });
  }
});

// Email verification routes (public)
app.use('/api/email-verification', emailVerificationRoutes);

// Firebase authentication routes (public)
app.use('/api/firebase-auth', firebaseAuthRoutes);

// Firebase admin routes (requires authentication)
app.use(
  '/api/firebase-admin',
  (req, res, next) => {
    return adminAuth(req, res, next);
  },
  firebaseAdminRoutes
);

// Admin pricing management route (must be before general /api/admin route)
app.use(
  '/api/admin/pricing-management',
  (req, res, next) => {
    // Apply admin authentication
    return adminAuth(req, res, next);
  },
  (req, res, next) => {
    // Redirect all admin pricing management routes to the correct pricing endpoint
    req.url = '/pricing' + req.path;
    // Forward to admin routes
    return adminRoutes(req, res, next);
  }
);

// Payment Configuration Admin Routes (must come before general admin routes)
app.use('/api/admin/payment-configs', paymentConfigRoutes);

// Dynamic Configuration Admin Routes
app.use('/api/admin/dynamic-config', dynamicConfigAdminRoutes);

// System Admin Routes (must come before general admin routes)
app.use(
  '/api/admin/system',
  (req, res, next) => {
    return adminAuth(req, res, next);
  },
  systemAdminRoutes
);

// Icon Management Routes
app.use(
  '/api/admin/icons',
  (req, res, next) => {
    return adminAuth(req, res, next);
  },
  iconManagementRoutes
);

// Add explicit CORS handling for upload endpoint
app.options('/api/admin/apps/versions/upload', cors());

// App Management Routes (Admin)
app.use(
  '/api/admin/apps',
  (req, res, next) => {
    return adminAuth(req, res, next);
  },
  appManagementRoutes
);

// App Downloads Routes (Public)
app.use('/api/apps', appDownloadRoutes);

// Alert Routes (Admin)
app.use(
  '/api/admin/alerts',
  (req, res, next) => {
    return adminAuth(req, res, next);
  },
  alertRoutes
);

// Note: Removed fallback template route to allow proper service routes to handle requests

// Email automation endpoint (fallback)
app.get(
  '/api/admin/email-automations',
  (req, res, next) => {
    // Apply admin authentication
    return adminAuth(req, res, next);
  },
  (req, res) => {
    // Simple fallback response for email automations
    res.json({
      success: true,
      data: [],
      message: 'Email automation feature is not yet implemented. Coming soon!',
    });
  }
);

// Email template routes will be added dynamically during server initialization
// For now, add a temporary route that will be replaced
let emailTemplateRoutesPlaceholder;
// Email template categories route
app.get('/api/admin/email-templates/categories', adminAuth, async (req, res) => {
  try {
    // Simple fallback categories for now - can be enhanced later
    const categories = [
      { id: 1, name: 'Authentication', description: 'User authentication and account related emails', color: '#10b981', icon: 'shield' },
      { id: 2, name: 'Notifications', description: 'System and user notifications', color: '#3b82f6', icon: 'bell' },
      { id: 3, name: 'Billing', description: 'Payment and subscription related emails', color: '#f59e0b', icon: 'currency' },
      { id: 4, name: 'Feedback', description: 'User feedback and survey emails', color: '#8b5cf6', icon: 'chat' },
      { id: 5, name: 'General', description: 'General purpose email templates', color: '#6b7280', icon: 'document' },
    ];

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Failed to get email template categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve email template categories',
      error: error.message,
    });
  }
});

// Get individual email template by ID
app.get('/api/admin/email-templates/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const database = req.app.locals.database;
    if (!database) {
      throw new Error('Database not initialized');
    }

    // Try to determine if ID is numeric or UUID
    const isNumeric = /^\d+$/.test(id);
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    let query, queryParams;
    if (isNumeric) {
      // Search by numeric ID
      query = `
        SELECT id, template_name, template_name as name, subject as subject_template,
               template_content as html_template, usage_notes as description, 
               category_id, is_active, created_at, updated_at
        FROM email_templates
        WHERE id = $1
      `;
      queryParams = [parseInt(id)];
    } else if (isUUID) {
      // Search by UUID (if the ID column is UUID type)
      query = `
        SELECT id, template_name, template_name as name, subject as subject_template,
               template_content as html_template, usage_notes as description, 
               category_id, is_active, created_at, updated_at
        FROM email_templates
        WHERE id::text = $1
      `;
      queryParams = [id];
    } else {
      // Search by template name
      query = `
        SELECT id, template_name, template_name as name, subject as subject_template,
               template_content as html_template, usage_notes as description, 
               category_id, is_active, created_at, updated_at
        FROM email_templates
        WHERE template_name = $1
      `;
      queryParams = [id];
    }

    const result = await database.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }

    const template = result.rows[0];
    
    res.json({
      success: true,
      data: {
        template: template,
        html_content: template.html_template || template.template_content || '<p>No HTML content available</p>',
      },
    });
  } catch (error) {
    console.error('Failed to get email template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve email template',
      error: error.message,
    });
  }
});

// Direct email templates route (for GET requests)
app.get('/api/admin/email-templates', adminAuth, async (req, res) => {
  try {
    // Query database directly for email templates
    const database = req.app.locals.database;
    if (!database) {
      throw new Error('Database not initialized');
    }

    const query = `
      SELECT id, template_name, template_name as name, subject as subject_template,
             usage_notes as description, category_id, is_active, created_at
      FROM email_templates
      WHERE is_active = true
      ORDER BY category_id, template_name
    `;

    const result = await database.query(query);

    res.json({
      success: true,
      data: {
        templates: result.rows,
      },
    });
  } catch (error) {
    console.error('Failed to get email templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve email templates',
      error: error.message,
    });
  }
});

// Fallback for other email template routes
app.use('/api/admin/email-templates', (req, res, next) => {
  if (emailTemplateRoutesPlaceholder) {
    return emailTemplateRoutesPlaceholder(req, res, next);
  } else {
    res.status(503).json({
      error: 'Email template service is initializing',
      message: 'Please try again in a moment',
    });
  }
});

// Admin API Routes (with authentication middleware)
app.use(
  '/api/admin',
  (req, res, next) => {
    // Skip authentication for login routes
    if (req.path === '/login' || req.path === '/auth/login' || req.path === '/refresh') {
      return next();
    }
    // Apply admin authentication for all other admin routes
    return adminAuth(req, res, next);
  },
  adminRoutes
);

// Admin profile route
app.use(
  '/api/admin-profile',
  (req, res, next) => {
    // Apply admin authentication
    return adminAuth(req, res, next);
  },
  adminProfileRoutes
);

// Pricing management route (for backward compatibility)
app.use(
  '/api/pricing-management',
  (req, res, next) => {
    // Apply admin authentication
    return adminAuth(req, res, next);
  },
  (req, res, next) => {
    // Redirect all pricing management routes to the correct pricing endpoint
    req.url = '/pricing' + req.path;
    return adminRoutes(req, res, next);
  }
);

// Debug upload routes (temporary for debugging)
app.use('/api/debug', debugUploadRoutes);

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: 'CORS is working correctly',
    origin: req.headers.origin || 'No origin header',
    timestamp: new Date().toISOString(),
    corsAllowedOrigins: uniqueOrigins,
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'MockMate API Server',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/api/health',
  });
});

// Error handling middleware
app.use((err, req, res, _next) => {
  logger.error('Unhandled Error', { error: err.message, stack: err.stack });

  // Handle known error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: err.details || err.message,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: 'Server Error',
    code: 'SERVER_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 5001;

// Initialize database and start server
async function startServer() {
  try {
    console.log('🚀 Starting MockMate server...');
    
    // Initialize database connection
    console.log('📊 Initializing database...');
    await initializeDatabase();
    logger.info('Database connected successfully');
    console.log('✅ Database initialization complete');

    // Initialize Redis connection
    console.log('🔴 Initializing Redis...');
    await initializeRedis();
    logger.info('Redis connected successfully');
    console.log('✅ Redis initialization complete');

    // Attach database and Redis to app.locals for use in routes
    app.locals.database = getDatabase();
    app.locals.redis = adminAuthManager; // Use adminAuthManager for Redis operations

    // Now that database is initialized, we can safely import and register userProfile routes
    console.log('🔗 Loading user profile routes...');
    const userProfileRoutes = await import('./routes/userProfile.js');
    app.use('/api/user-profile', userProfileRoutes.default);
    console.log('✅ User profile routes registered');
    logger.info('User profile routes registered at /api/user-profile');

    // Initialize dynamic configuration service
    const dynamicConfig = createDynamicConfig(getDatabase());
    await dynamicConfig.initialize();
    app.locals.dynamicConfig = dynamicConfig;
    logger.info('Dynamic configuration service initialized successfully');

    // Initialize services with dynamic configuration
    const { EmailService } = await import('./services/EmailService.js');
    const FirebaseAuthService = await import('./services/FirebaseAuthService.js');

    const emailService = new EmailService(dynamicConfig);
    await emailService.initialize();
    app.locals.emailService = emailService;
    logger.info('Email service initialized with dynamic configuration');

    const firebaseAuthService = new FirebaseAuthService.default(getDatabase(), dynamicConfig);
    await firebaseAuthService.initialize();
    app.locals.firebaseAuthService = firebaseAuthService;
    logger.info('Firebase auth service initialized with dynamic configuration');

    // Initialize analytics service
    const analyticsService = new AnalyticsService(getDatabase());
    app.locals.analyticsService = analyticsService;
    logger.info('Analytics service initialized');

    // Initialize email template service with fallback
    let emailTemplateService;
    try {
      const EmailTemplateServiceAdapted = await import('./services/EmailTemplateServiceAdapted.js');
      emailTemplateService = new EmailTemplateServiceAdapted.default(getDatabase());
      app.locals.emailTemplateService = emailTemplateService;
      logger.info('Email template service initialized');
    } catch (emailServiceError) {
      logger.error(
        'Email template service initialization failed, using fallback:',
        emailServiceError.message
      );
      // Create a minimal fallback service
      emailTemplateService = {
        getTemplates: () => Promise.resolve({ templates: [], pagination: {} }),
        getTemplate: () => Promise.reject(new Error('Email template service unavailable')),
        createTemplate: () => Promise.reject(new Error('Email template service unavailable')),
        updateTemplate: () => Promise.reject(new Error('Email template service unavailable')),
        deleteTemplate: () => Promise.reject(new Error('Email template service unavailable')),
      };
      app.locals.emailTemplateService = emailTemplateService;
    }

    // Add analytics middleware (should be added after the database is initialized but before routes)
    const analyticsMiddleware = createAnalyticsMiddleware(analyticsService);
    app.use(analyticsMiddleware);
    logger.info('Analytics middleware registered');

    // Add analytics routes for admin dashboard
    analyticsRoutes = createAnalyticsRoutes(analyticsService);
    app.use('/api/admin/analytics', analyticsRoutes);
    logger.info('Analytics routes registered at /api/admin/analytics');

    // Initialize email notification service
    let emailNotificationService;
    try {
      const EmailNotificationService = await import('./services/EmailNotificationService.js');
      emailNotificationService = new EmailNotificationService.default();
      app.locals.emailNotificationService = emailNotificationService;
      logger.info('Email notification service initialized successfully');
    } catch (emailNotificationError) {
      logger.error(
        'Email notification service initialization failed:',
        emailNotificationError.message
      );
      // Create a fallback service
      emailNotificationService = {
        getAllUsers: () => Promise.resolve([]),
        createEmailCampaign: () =>
          Promise.reject(new Error('Email notification service unavailable')),
        sendBulkEmail: () => Promise.reject(new Error('Email notification service unavailable')),
        getCampaigns: () => Promise.resolve([]),
        getCampaignDetails: () =>
          Promise.reject(new Error('Email notification service unavailable')),
        getCampaignAnalytics: () =>
          Promise.resolve({ totalRecipients: 0, successCount: 0, failureCount: 0 }),
      };
      app.locals.emailNotificationService = emailNotificationService;
    }

    // Register email notification routes
    app.use(
      '/api/admin/email-notifications',
      (req, res, next) => {
        return adminAuth(req, res, next);
      },
      emailNotificationRoutes
    );
    logger.info('Email notification routes registered at /api/admin/email-notifications');

    // Replace the placeholder with actual email template routes
    const emailTemplateRoutes = createEmailTemplateRoutes(emailTemplateService);
    // Create a combined middleware that applies auth and then the routes
    emailTemplateRoutesPlaceholder = (req, res, next) => {
      // Apply admin authentication first
      return adminAuth(req, res, authErr => {
        if (authErr) return next(authErr);
        // Then apply the email template routes
        return emailTemplateRoutes(req, res, next);
      });
    };
    logger.info('Email template routes registered at /api/admin/email-templates');

    // Now initialize Socket.IO with dynamic config
    const corsOrigins = await dynamicConfig.get('cors_origins', 'http://localhost:3000');
    io = new SocketServer(server, {
      cors: {
        origin: corsOrigins.split(',').map(origin => origin.trim()),
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    logger.info('Socket.IO initialized with dynamic configuration');

    // Initialize alert service after Socket.IO is ready
    console.log('🚨 Initializing alert service...');
    const alertService = new AlertService(getDatabase(), io); // Pass Socket.IO for real-time notifications
    app.locals.alertService = alertService;
    logger.info('Alert service initialized successfully');
    console.log('✅ Alert service initialization complete');

    // Initialize payment services
    try {
      const paymentService = new PaymentService();
      await paymentService.initializeProviders();
      logger.info('Payment providers initialized successfully');

      const healthCheckService = new PaymentHealthCheckService();
      await healthCheckService.startHealthChecks();
      logger.info('Payment health check service started');

      const webhookService = new PaymentWebhookService();
      await webhookService.registerWebhooksForActiveProviders();
      logger.info('Payment webhooks registered');

      // Attach services to app.locals for use in routes
      app.locals.paymentService = paymentService;
      app.locals.healthCheckService = healthCheckService;
      app.locals.webhookService = webhookService;
    } catch (error) {
      logger.warn(
        'Payment services initialization failed (continuing without payment services):',
        error.message
      );
    }

    // Initialize WebSocket
    // initializeWebSocket(server);
    // logger.info('WebSocket server initialized');

    // Start server
    server.listen(PORT, () => {
      logger.info(`MockMate API Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`CORS Origins: ${process.env.CORS_ORIGINS || 'http://localhost:3000'}`);
      logger.info('Admin routes mounted at /api/admin');
    });

    // Graceful shutdown handling
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    // Close database connections
    // db.close() - implement based on your database client

    // Close Redis connection
    await closeRedis();

    logger.info('All connections closed. Exiting...');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();

export { app, server, io };
