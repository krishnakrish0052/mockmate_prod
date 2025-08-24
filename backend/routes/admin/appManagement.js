import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { body, param, validationResult } from 'express-validator';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Configure multer for app uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/apps');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Keep original filename but add timestamp to avoid conflicts
    const timestamp = Date.now();
    // More conservative sanitization - only replace dangerous characters
    const originalName = file.originalname.replace(/[\\/:*?"<>|]/g, '_');
    // Ensure we don't have double extensions or security issues
    const sanitizedName = originalName.replace(/\.\.+/g, '.').replace(/^\.|\.$/, '');
    cb(null, `${timestamp}_${sanitizedName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    '.exe': 'application/x-msdownload',
    '.msi': 'application/x-msi',
    '.dmg': 'application/x-apple-diskimage',
    '.pkg': 'application/octet-stream',
    '.deb': 'application/x-debian-package',
    '.rpm': 'application/x-rpm',
    '.AppImage': 'application/x-executable',
    '.zip': 'application/zip',
    '.tar.gz': 'application/gzip',
  };

  const fileExt = path.extname(file.originalname).toLowerCase();

  if (Object.keys(allowedTypes).includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${Object.keys(allowedTypes).join(', ')}`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
});

// Helper function to calculate file hash
async function calculateFileHash(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

// Helper function to convert version string to version code
function versionToCode(version) {
  const parts = version.split('.').map(part => parseInt(part) || 0);
  // Support up to 3 parts (major.minor.patch)
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;
  return major * 10000 + minor * 100 + patch;
}

// Get all platforms
router.get('/platforms', requirePermission(['app.read']), async (req, res) => {
  try {
    const database = req.app.locals.database;

    const result = await database.query(`
        SELECT 
          id, name, display_name, icon, sort_order, is_active,
          created_at, updated_at
        FROM app_platforms
        ORDER BY sort_order, display_name
      `);

    res.json({
      success: true,
      data: {
        platforms: result.rows,
        totalPlatforms: result.rows.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve platforms',
      error: error.message,
    });
  }
});

// Get all app versions
router.get('/versions', requirePermission(['app.read']), async (req, res) => {
  try {
    const database = req.app.locals.database;
    const { platform, page = 1, limit = 20 } = req.query;

    let query = `
        SELECT * FROM v_active_app_versions
      `;
    const params = [];

    if (platform) {
      query += ` WHERE platform_name = $1`;
      params.push(platform);
    }

    query += ` ORDER BY platform_display_name, version_code DESC`;

    // Add pagination
    const offset = (page - 1) * limit;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM v_active_app_versions`;
    const countParams = [];
    if (platform) {
      countQuery += ` WHERE platform_name = $1`;
      countParams.push(platform);
    }

    const countResult = await database.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: {
        versions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve app versions',
      error: error.message,
    });
  }
});

// Alternative CORS-friendly upload endpoint
router.post(
  '/versions/upload-cors-bypass',
  (req, res, next) => {
    // Add CORS headers manually
    res.header('Access-Control-Allow-Origin', 'https://mock-mate.com');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  },
  requirePermission(['app.write']),
  upload.single('appFile'),
  [
    body('platformId').isUUID().withMessage('Valid platform ID is required'),
    body('version')
      .matches(/^\d+\.\d+\.\d+$/)
      .withMessage('Version must be in format x.y.z'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('displayName').optional().isString().withMessage('Display name must be a string'),
    body('minOsVersion').optional().isString().withMessage('Minimum OS version must be a string'),
    body('changelog').optional().isString().withMessage('Changelog must be a string'),
    body('releaseNotes').optional().isString().withMessage('Release notes must be a string'),
    body('isBeta').optional().isBoolean().withMessage('Is beta must be a boolean'),
    body('isFeatured').optional().isBoolean().withMessage('Is featured must be a boolean'),
  ],
  async (req, res) => {
    // Same logic as original upload endpoint
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'App file is required',
        });
      }

      const database = req.app.locals.database;
      const {
        platformId,
        version,
        description,
        displayName,
        minOsVersion,
        changelog,
        releaseNotes,
        isBeta,
        isFeatured,
      } = req.body;

      const versionCode = versionToCode(version);
      const fileHash = await calculateFileHash(req.file.path);

      // Check if version already exists for this platform
      const existingVersion = await database.query(
        `SELECT id FROM app_versions WHERE platform_id = $1 AND version = $2`,
        [platformId, version]
      );

      if (existingVersion.rows.length > 0) {
        // Clean up uploaded file
        await fs.unlink(req.file.path);
        return res.status(400).json({
          success: false,
          message: `Version ${version} already exists for this platform`,
        });
      }

      // Insert new version
      const insertResult = await database.query(
        `
        INSERT INTO app_versions (
          platform_id, version, version_code, display_name, description,
          file_name, file_path, file_size, file_hash, min_os_version,
          changelog, release_notes, is_beta, is_featured, is_active, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
      `,
        [
          platformId,
          version,
          versionCode,
          displayName || req.file.originalname,
          description || `App version ${version}`,
          req.file.originalname, // Store original filename for downloads
          req.file.path.replace(__dirname, '').replace(/\\/g, '/'),
          req.file.size,
          fileHash,
          minOsVersion,
          changelog,
          releaseNotes,
          isBeta === 'true',
          isFeatured === 'true',
          true,
          req.user.id,
        ]
      );

      const newVersionId = insertResult.rows[0].id;

      res.status(201).json({
        success: true,
        message: 'App version uploaded successfully',
        data: {
          versionId: newVersionId,
          version,
          fileName: req.file.filename,
          fileSize: req.file.size,
          hash: fileHash,
        },
      });
    } catch (error) {
      // Clean up uploaded file on error
      if (req.file && req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up uploaded file:', unlinkError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload app version',
        error: error.message,
      });
    }
  }
);

// Original upload endpoint
router.post(
  '/versions/upload',
  requirePermission(['app.write']),
  upload.single('appFile'),
  [
    body('platformId').isUUID().withMessage('Valid platform ID is required'),
    body('version')
      .matches(/^\d+\.\d+\.\d+$/)
      .withMessage('Version must be in format x.y.z'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('displayName').optional().isString().withMessage('Display name must be a string'),
    body('minOsVersion').optional().isString().withMessage('Minimum OS version must be a string'),
    body('changelog').optional().isString().withMessage('Changelog must be a string'),
    body('releaseNotes').optional().isString().withMessage('Release notes must be a string'),
    body('isBeta').optional().isBoolean().withMessage('Is beta must be a boolean'),
    body('isFeatured').optional().isBoolean().withMessage('Is featured must be a boolean'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'App file is required',
        });
      }

      const database = req.app.locals.database;
      const {
        platformId,
        version,
        description,
        displayName,
        minOsVersion,
        changelog,
        releaseNotes,
        isBeta = false,
        isFeatured = false,
      } = req.body;

      const { originalname, filename, size, path: filePath } = req.file;

      // Calculate file hash for integrity
      const fileHash = await calculateFileHash(filePath);

      // Convert version to version code
      const versionCode = versionToCode(version);

      // Check if version already exists for this platform
      const existingVersion = await database.query(
        `
        SELECT id FROM app_versions 
        WHERE platform_id = $1 AND version = $2
      `,
        [platformId, version]
      );

      if (existingVersion.rows.length > 0) {
        // Clean up uploaded file
        await fs.unlink(filePath);
        return res.status(400).json({
          success: false,
          message: `Version ${version} already exists for this platform`,
        });
      }

      // Insert new version
      const insertResult = await database.query(
        `
        INSERT INTO app_versions (
          platform_id, version, version_code, display_name, description,
          file_name, file_path, file_size, file_hash,
          is_beta, is_featured, min_os_version, changelog, release_notes,
          created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        RETURNING *
      `,
        [
          platformId,
          version,
          versionCode,
          displayName || null,
          description || null,
          originalname, // Store original filename for downloads
          filename,
          size,
          fileHash,
          isBeta,
          isFeatured,
          minOsVersion || null,
          changelog || null,
          releaseNotes || null,
          req.admin.id,
        ]
      );

      const newVersion = insertResult.rows[0];

      res.json({
        success: true,
        message: 'App version uploaded successfully',
        data: {
          version: newVersion,
          file: {
            originalName: originalname,
            fileName: filename,
            size,
            hash: fileHash,
          },
        },
      });
    } catch (error) {
      // Clean up uploaded file on error
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up uploaded file:', unlinkError);
        }
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload app version',
        error: error.message,
      });
    }
  }
);

// Update app version metadata
router.put(
  '/versions/:versionId',
  requirePermission(['app.write']),
  [
    param('versionId').isUUID().withMessage('Valid version ID is required'),
    body('description').optional().isString().withMessage('Description must be a string'),
    body('displayName').optional().isString().withMessage('Display name must be a string'),
    body('minOsVersion').optional().isString().withMessage('Minimum OS version must be a string'),
    body('changelog').optional().isString().withMessage('Changelog must be a string'),
    body('releaseNotes').optional().isString().withMessage('Release notes must be a string'),
    body('isBeta').optional().isBoolean().withMessage('Is beta must be a boolean'),
    body('isFeatured').optional().isBoolean().withMessage('Is featured must be a boolean'),
    body('isActive').optional().isBoolean().withMessage('Is active must be a boolean'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const database = req.app.locals.database;
      const { versionId } = req.params;
      const updates = req.body;

      // Check if version exists
      const existingVersion = await database.query(
        `
        SELECT id FROM app_versions WHERE id = $1
      `,
        [versionId]
      );

      if (existingVersion.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'App version not found',
        });
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          const dbField =
            key === 'displayName'
              ? 'display_name'
              : key === 'minOsVersion'
                ? 'min_os_version'
                : key === 'releaseNotes'
                  ? 'release_notes'
                  : key === 'isBeta'
                    ? 'is_beta'
                    : key === 'isFeatured'
                      ? 'is_featured'
                      : key === 'isActive'
                        ? 'is_active'
                        : key;

          updateFields.push(`${dbField} = $${paramCount}`);
          updateValues.push(value);
          paramCount++;
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
        });
      }

      // Add updated_by and updated_at
      updateFields.push(`updated_by = $${paramCount}`, `updated_at = NOW()`);
      updateValues.push(req.admin.id);

      const updateQuery = `
        UPDATE app_versions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount + 1}
        RETURNING *
      `;
      updateValues.push(versionId);

      const result = await database.query(updateQuery, updateValues);

      res.json({
        success: true,
        message: 'App version updated successfully',
        data: {
          version: result.rows[0],
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update app version',
        error: error.message,
      });
    }
  }
);

// Delete app version
router.delete(
  '/versions/:versionId',
  requirePermission(['app.delete']),
  [param('versionId').isUUID().withMessage('Valid version ID is required')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const database = req.app.locals.database;
      const { versionId } = req.params;

      // Get version details to delete the file
      const versionResult = await database.query(
        `
        SELECT file_path FROM app_versions WHERE id = $1
      `,
        [versionId]
      );

      if (versionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'App version not found',
        });
      }

      const version = versionResult.rows[0];
      const filePath = path.join(__dirname, '../../uploads/apps', version.file_path);

      // Delete the version from database
      await database.query(
        `
        DELETE FROM app_versions WHERE id = $1
      `,
        [versionId]
      );

      // Try to delete the physical file
      try {
        await fs.unlink(filePath);
      } catch (fileError) {
        console.error('Error deleting app file:', fileError);
        // Don't fail the request if file deletion fails
      }

      res.json({
        success: true,
        message: 'App version deleted successfully',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete app version',
        error: error.message,
      });
    }
  }
);

// Get download statistics
router.get('/statistics', requirePermission(['app.read']), async (req, res) => {
  try {
    const database = req.app.locals.database;
    const { days = 30 } = req.query;

    // Get download counts by platform
    const platformStats = await database.query(
      `
        SELECT 
          p.display_name as platform,
          COALESCE(COUNT(dl.id), 0) as download_count,
          COALESCE(COUNT(DISTINCT dl.ip_address), 0) as unique_downloads
        FROM app_platforms p
        LEFT JOIN app_versions v ON p.id = v.platform_id
        LEFT JOIN app_downloads_log dl ON v.id = dl.version_id
          AND dl.download_started_at >= NOW() - MAKE_INTERVAL(days => $1)
        WHERE p.is_active = TRUE
        GROUP BY p.id, p.display_name
        ORDER BY download_count DESC
      `,
      [parseInt(days)]
    );

    // Get version stats
    const versionStats = await database.query(
      `
        SELECT 
          p.display_name as platform,
          v.version,
          COALESCE(v.download_count, 0) as download_count,
          COALESCE(COUNT(dl.id), 0) as recent_downloads
        FROM v_active_app_versions v
        LEFT JOIN app_downloads_log dl ON v.id = dl.version_id
          AND dl.download_started_at >= NOW() - MAKE_INTERVAL(days => $1)
        JOIN app_platforms p ON v.platform_id = p.id
        GROUP BY p.display_name, v.version, v.download_count, p.sort_order, v.version_code
        ORDER BY p.sort_order, v.version_code DESC
      `,
      [parseInt(days)]
    );

    // Get daily download trends
    const dailyTrends = await database.query(
      `
        SELECT 
          DATE(dl.download_started_at) as date,
          COUNT(dl.id) as downloads
        FROM app_downloads_log dl
        WHERE dl.download_started_at >= NOW() - MAKE_INTERVAL(days => $1)
        GROUP BY DATE(dl.download_started_at)
        ORDER BY date
      `,
      [parseInt(days)]
    );

    res.json({
      success: true,
      data: {
        platformStats: platformStats.rows,
        versionStats: versionStats.rows,
        dailyTrends: dailyTrends.rows,
        period: `${days} days`,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
      error: error.message,
    });
  }
});

export default router;
