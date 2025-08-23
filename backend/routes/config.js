import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { configService } from '../services/ConfigurationService.js';
import { logger } from '../config/logger.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for icon uploads
const iconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/icons');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `custom_icon_${timestamp}${ext}`);
  },
});

const iconUpload = multer({
  storage: iconStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg|ico/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  },
});

const router = express.Router();

/**
 * GET /api/config
 * Get client-accessible configurations for frontend applications
 */
router.get('/', async (req, res) => {
  try {
    // Get dynamic configuration service from app locals
    const dynamicConfig = req.app.locals.dynamicConfig;

    if (!dynamicConfig) {
      throw new Error('Dynamic configuration service not available');
    }

    // Get only public configurations (client-accessible)
    const configurations = await dynamicConfig.getPublic();
    
    // Add Stripe publishable key to public config
    const stripePublishableKey = await dynamicConfig.get('stripe_publishable_key', process.env.STRIPE_PUBLISHABLE_KEY);
    if (stripePublishableKey && !stripePublishableKey.includes('your_stripe_publishable_key')) {
      configurations.stripe_publishable_key = stripePublishableKey;
    }

    res.json({
      success: true,
      data: configurations,
      timestamp: new Date().toISOString(),
      environment: await dynamicConfig.get('node_env', 'development'),
    });
  } catch (error) {
    logger.error('Failed to get client configurations:', error);
    res.status(500).json({
      error: 'Configuration Error',
      code: 'CONFIG_FETCH_ERROR',
      message: 'Failed to fetch configurations',
    });
  }
});

/**
 * GET /api/config/feature-flags
 * Get active feature flags for the current environment
 */
router.get('/feature-flags', async (req, res) => {
  try {
    const query = `
            SELECT 
                flag_name,
                is_enabled,
                rollout_percentage,
                target_users,
                target_groups,
                conditions
            FROM feature_flags
            WHERE environment IN ('all', $1)
            ORDER BY flag_name
        `;

    const db = req.app.locals.database;
    const result = await db.query(query, [process.env.NODE_ENV || 'development']);

    const featureFlags = {};

    for (const row of result.rows) {
      featureFlags[row.flag_name] = {
        enabled: row.is_enabled,
        rolloutPercentage: row.rollout_percentage,
        targetUsers: row.target_users,
        targetGroups: row.target_groups,
        conditions: row.conditions,
      };
    }

    res.json({
      success: true,
      data: featureFlags,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    logger.error('Failed to get feature flags:', error);
    res.status(500).json({
      error: 'Feature Flags Error',
      code: 'FEATURE_FLAGS_FETCH_ERROR',
      message: 'Failed to fetch feature flags',
    });
  }
});

/**
 * GET /api/config/icons
 * Get current icon configuration for the web app
 */
router.get('/icons', async (req, res) => {
  try {
    const db = req.app.locals.database;

    // Get icon configuration from system_configurations table
    const iconQuery = `
            SELECT config_key, config_value
            FROM system_configurations 
            WHERE config_key IN ('app_favicon', 'app_logo', 'app_title', 'app_icon_16', 'app_icon_32', 'app_icon_128', 'app_icon_256')
              AND is_active = true
        `;

    const iconResult = await db.query(iconQuery);
    const iconConfig = {};

    for (const row of iconResult.rows) {
      iconConfig[row.config_key] = row.config_value;
    }

    // Provide defaults if not configured
    const response = {
      success: true,
      favicon: iconConfig.app_favicon || '/mockmate_32x32.png',
      logo: iconConfig.app_logo || '/mockmate_128x128.png',
      title: iconConfig.app_title || 'MockMate - AI-powered Interview Platform',
      icons: {
        '16x16': iconConfig.app_icon_16 || '/mockmate_16x16.png',
        '32x32': iconConfig.app_icon_32 || '/mockmate_32x32.png',
        '128x128': iconConfig.app_icon_128 || '/mockmate_128x128.png',
        '256x256': iconConfig.app_icon_256 || '/mockmate_256x256.png',
      },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    logger.error('Failed to get icon configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Icon Configuration Error',
      message: 'Failed to fetch icon configuration',
    });
  }
});

/**
 * POST /api/config/icons/upload
 * Upload new icon files (Admin only)
 */
router.post(
  '/icons/upload',
  iconUpload.fields([
    { name: 'favicon', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'icon16', maxCount: 1 },
    { name: 'icon32', maxCount: 1 },
    { name: 'icon128', maxCount: 1 },
    { name: 'icon256', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // Check admin authentication
      if (!req.admin) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
          message: 'Admin access required',
        });
      }

      const db = req.app.locals.database;
      const uploadedFiles = {};

      // Process uploaded files
      if (req.files) {
        for (const [key, files] of Object.entries(req.files)) {
          if (files && files.length > 0) {
            const file = files[0];
            const relativePath = `/uploads/icons/${file.filename}`;
            uploadedFiles[key] = relativePath;
          }
        }
      }

      // Update database with new icon paths
      const updates = [];
      if (uploadedFiles.favicon) {
        updates.push(['app_favicon', uploadedFiles.favicon]);
      }
      if (uploadedFiles.logo) {
        updates.push(['app_logo', uploadedFiles.logo]);
      }
      if (uploadedFiles.icon16) {
        updates.push(['app_icon_16', uploadedFiles.icon16]);
      }
      if (uploadedFiles.icon32) {
        updates.push(['app_icon_32', uploadedFiles.icon32]);
      }
      if (uploadedFiles.icon128) {
        updates.push(['app_icon_128', uploadedFiles.icon128]);
      }
      if (uploadedFiles.icon256) {
        updates.push(['app_icon_256', uploadedFiles.icon256]);
      }

      // Insert or update configuration
      for (const [key, value] of updates) {
        await db.query(
          `
                UPDATE system_configurations 
                SET config_value = $1, updated_at = NOW(), updated_by = $2
                WHERE config_key = $3
            `,
          [value, req.admin.id || 'admin', key]
        );
      }

      logger.info(`Icon configuration updated by user ${req.admin.id || 'admin'}`, {
        uploadedFiles,
      });

      res.json({
        success: true,
        message: 'Icons uploaded successfully',
        uploadedFiles,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to upload icons:', error);
      res.status(500).json({
        success: false,
        error: 'Upload Error',
        message: 'Failed to upload icons',
      });
    }
  }
);

/**
 * PUT /api/config/icons/settings
 * Update icon settings (Admin only)
 */
router.put('/icons/settings', async (req, res) => {
  try {
    // Check admin authentication
    if (!req.admin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Admin access required',
      });
    }

    const { title, favicon, logo, icons } = req.body;
    const db = req.app.locals.database;

    const updates = [];

    if (title) {
      updates.push(['app_title', title]);
    }
    if (favicon) {
      updates.push(['app_favicon', favicon]);
    }
    if (logo) {
      updates.push(['app_logo', logo]);
    }
    if (icons) {
      if (icons['16x16']) updates.push(['app_icon_16', icons['16x16']]);
      if (icons['32x32']) updates.push(['app_icon_32', icons['32x32']]);
      if (icons['128x128']) updates.push(['app_icon_128', icons['128x128']]);
      if (icons['256x256']) updates.push(['app_icon_256', icons['256x256']]);
    }

    // Update configuration
    for (const [key, value] of updates) {
      await db.query(
        `
                UPDATE system_configurations 
                SET config_value = $1, updated_at = NOW(), updated_by = $2
                WHERE config_key = $3
            `,
        [value, req.admin.id || 'admin', key]
      );
    }

    logger.info(`Icon settings updated by user ${req.admin.id || 'admin'}`, { updates });

    res.json({
      success: true,
      message: 'Icon settings updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to update icon settings:', error);
    res.status(500).json({
      success: false,
      error: 'Update Error',
      message: 'Failed to update icon settings',
    });
  }
});

/**
 * GET /api/config/icons/list
 * List available icon files (Admin only)
 */
router.get('/icons/list', async (req, res) => {
  try {
    // Check admin authentication
    if (!req.admin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'Admin access required',
      });
    }

    const iconsDir = path.join(__dirname, '../../uploads/icons');

    try {
      const files = await fs.readdir(iconsDir);
      const iconFiles = files
        .filter(file => /\.(png|jpg|jpeg|gif|svg|ico)$/i.test(file))
        .map(file => ({
          filename: file,
          url: `/uploads/icons/${file}`,
          size: null, // We could add file size here if needed
          created: null, // We could add creation date here if needed
        }));

      res.json({
        success: true,
        icons: iconFiles,
        count: iconFiles.length,
        timestamp: new Date().toISOString(),
      });
    } catch (_dirError) {
      res.json({
        success: true,
        icons: [],
        count: 0,
        message: 'Icons directory not found or empty',
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    logger.error('Failed to list icons:', error);
    res.status(500).json({
      success: false,
      error: 'List Error',
      message: 'Failed to list icons',
    });
  }
});

// Helper function to get icon config (reused from GET /icons endpoint)
async function _getIconConfig() {
  // This will need database access, but for now we'll return defaults
  // In a real implementation, you'd pass the database instance here
  return {
    title: 'MockMate - AI-powered Interview Platform',
    favicon: '/mockmate_32x32.png',
    logo: '/mockmate_128x128.png',
    icons: {
      '16x16': '/mockmate_16x16.png',
      '32x32': '/mockmate_32x32.png',
      '128x128': '/mockmate_128x128.png',
      '256x256': '/mockmate_256x256.png',
    },
  };
}

/**
 * GET /api/config/manifest
 * Serve dynamic manifest.json with current icon configuration
 */
router.get('/manifest', async (req, res) => {
  try {
    const db = req.app.locals.database;

    // Get icon configuration from system_configurations table (same as /icons endpoint)
    const iconQuery = `
            SELECT config_key, config_value
            FROM system_configurations 
            WHERE config_key IN ('app_favicon', 'app_logo', 'app_title', 'app_icon_16', 'app_icon_32', 'app_icon_128', 'app_icon_256')
              AND is_active = true
        `;

    const iconResult = await db.query(iconQuery);
    const iconConfig = {};

    for (const row of iconResult.rows) {
      iconConfig[row.config_key] = row.config_value;
    }

    const manifest = {
      name: iconConfig.app_title || 'MockMate - AI-powered Interview Platform',
      short_name: 'MockMate',
      description: 'AI-powered interview platform for candidates and recruiters',
      start_url: '/',
      display: 'standalone',
      theme_color: '#1f2937',
      background_color: '#ffffff',
      orientation: 'portrait',
      scope: '/',
      icons: [
        {
          src: iconConfig.app_icon_16 || '/mockmate_16x16.png',
          sizes: '16x16',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: iconConfig.app_icon_32 || '/mockmate_32x32.png',
          sizes: '32x32',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: iconConfig.app_icon_128 || '/mockmate_128x128.png',
          sizes: '128x128',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: iconConfig.app_icon_256 || '/mockmate_256x256.png',
          sizes: '256x256',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
  } catch (error) {
    logger.error('Error serving dynamic manifest:', error);
    res.status(500).json({ success: false, message: 'Failed to generate manifest' });
  }
});

/**
 * GET /api/config/:category
 * Get client-accessible configurations for a specific category (fallback route)
 */
router.get('/:category', async (req, res) => {
  try {
    const { category } = req.params;

    // Get configurations for the specified category (non-sensitive, client-accessible only)
    const query = `
            SELECT 
                config_key,
                config_value,
                default_value,
                value_type
            FROM v_active_configurations
            WHERE category_name = $1 
              AND environment IN ('all', $2)
              AND is_client_accessible = true
              AND is_sensitive = false
            ORDER BY sort_order
        `;

    const db = req.app.locals.database;
    const result = await db.query(query, [category, process.env.NODE_ENV || 'development']);

    const configurations = {};

    for (const row of result.rows) {
      let value = row.config_value || row.default_value;

      // Parse typed values
      switch (row.value_type) {
        case 'number':
          value = Number(value);
          break;
        case 'boolean':
          value = ['true', 't', '1', 'yes', 'on'].includes(String(value).toLowerCase());
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if JSON parsing fails
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            value = String(value)
              .split(',')
              .map(v => v.trim())
              .filter(v => v);
          }
          break;
      }

      configurations[row.config_key] = value;
    }

    res.json({
      success: true,
      data: configurations,
      category,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    logger.error(
      `Failed to get client configurations for category '${req.params.category}':`,
      error
    );
    res.status(500).json({
      error: 'Configuration Error',
      code: 'CONFIG_FETCH_ERROR',
      message: 'Failed to fetch configurations',
    });
  }
});

export default router;
