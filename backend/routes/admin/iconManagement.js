import express from 'express';
import multer from 'multer';
import path, { dirname } from 'path';
import { promises as fs } from 'fs';
import { body, validationResult } from 'express-validator';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Configure multer for icon uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/icons');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Keep original filename for icons, but ensure uniqueness if needed
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const finalName = `${name}${ext}`;
    cb(null, finalName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.png', '.jpg', '.jpeg', '.svg', '.ico'];
  const fileExt = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(
      new Error('Invalid file type. Only PNG, JPG, JPEG, SVG, and ICO files are allowed for icons.')
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for icons
  },
});

// Helper function to copy icons to frontend directories
async function syncIconsToFrontends() {
  const iconsDir = path.join(__dirname, '../../uploads/icons');
  const webappDir = path.join(__dirname, '../../webapp/public');
  const adminDir = path.join(__dirname, '../../admin-frontend/public');

  try {
    // Ensure directories exist
    await fs.mkdir(webappDir, { recursive: true });
    await fs.mkdir(adminDir, { recursive: true });

    const icons = await fs.readdir(iconsDir);
    const imageFiles = icons.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.png', '.jpg', '.jpeg', '.svg', '.ico'].includes(ext);
    });

    for (const icon of imageFiles) {
      const sourcePath = path.join(iconsDir, icon);
      const webappDestPath = path.join(webappDir, icon);
      const adminDestPath = path.join(adminDir, icon);

      // Copy to both frontend directories
      await fs.copyFile(sourcePath, webappDestPath);
      await fs.copyFile(sourcePath, adminDestPath);
    }

    return imageFiles;
  } catch (error) {
    throw new Error(`Failed to sync icons: ${error.message}`);
  }
}

// Get all available icons
router.get('/icons', requirePermission(['config.read']), async (req, res) => {
  try {
    const iconsDir = path.join(__dirname, '../../uploads/icons');

    let icons = [];
    try {
      const files = await fs.readdir(iconsDir);
      icons = files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.png', '.jpg', '.jpeg', '.svg', '.ico'].includes(ext);
        })
        .map(file => ({
          filename: file,
          path: `/icons/${file}`,
          size: null, // We could add file size info here if needed
        }));
    } catch (_error) {
      // Directory might not exist yet
      icons = [];
    }

    res.json({
      success: true,
      data: {
        icons,
        totalIcons: icons.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve icons',
      error: error.message,
    });
  }
});

// Upload new icon
router.post(
  '/icons/upload',
  requirePermission(['config.write']),
  upload.single('icon'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No icon file provided',
        });
      }

      const { originalname, filename, size } = req.file;

      // Sync icons to frontend directories
      await syncIconsToFrontends();

      // Update system configuration if this is a standard icon
      const database = req.app.locals.database;
      if (database) {
        const iconConfigMap = {
          'mockmate_16x16.png': 'app_icon_16',
          'mockmate_32x32.png': 'app_icon_32',
          'mockmate_64x64.png': 'app_favicon',
          'mockmate_128x128.png': 'app_logo',
          'mockmate_256x256.png': 'app_icon_256',
        };

        const configKey = iconConfigMap[filename];
        if (configKey) {
          await database.query(
            `
            INSERT INTO system_config (config_key, config_value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (config_key)
            DO UPDATE SET 
              config_value = EXCLUDED.config_value,
              updated_at = NOW()
          `,
            [configKey, `/${filename}`]
          );
        }
      }

      res.json({
        success: true,
        message: 'Icon uploaded successfully',
        data: {
          filename,
          originalName: originalname,
          size,
          path: `/${filename}`,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to upload icon',
        error: error.message,
      });
    }
  }
);

// Delete icon
router.delete('/icons/:filename', requirePermission(['config.write']), async (req, res) => {
  try {
    const { filename } = req.params;

    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename',
      });
    }

    const iconsDir = path.join(__dirname, '../../uploads/icons');
    const filePath = path.join(iconsDir, filename);

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (_error) {
      return res.status(404).json({
        success: false,
        message: 'Icon not found',
      });
    }

    // Delete the file
    await fs.unlink(filePath);

    // Also remove from frontend directories
    const webappPath = path.join(__dirname, '../../webapp/public', filename);
    const adminPath = path.join(__dirname, '../../admin-frontend/public', filename);

    try {
      await fs.unlink(webappPath);
    } catch (_e) {
      // File might not exist in webapp
    }

    try {
      await fs.unlink(adminPath);
    } catch (_e) {
      // File might not exist in admin
    }

    res.json({
      success: true,
      message: 'Icon deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete icon',
      error: error.message,
    });
  }
});

// Sync icons to frontend applications
router.post('/icons/sync', requirePermission(['config.write']), async (req, res) => {
  try {
    const syncedIcons = await syncIconsToFrontends();

    res.json({
      success: true,
      message: 'Icons synced successfully to frontend applications',
      data: {
        syncedIcons,
        totalSynced: syncedIcons.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to sync icons',
      error: error.message,
    });
  }
});

// Update icon configuration in system config
router.patch(
  '/icons/config',
  requirePermission(['config.write']),
  [
    body('iconConfigs').isObject().withMessage('Icon configs must be an object'),
    body('iconConfigs.*').isString().withMessage('Icon path must be a string'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const database = req.app.locals.database;
      const { iconConfigs } = req.body;
      const adminId = req.admin.id;

      // Update configurations
      const updates = [];
      for (const [key, value] of Object.entries(iconConfigs)) {
        updates.push(
          database.query(
            `
            INSERT INTO system_config (config_key, config_value, updated_by, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (config_key)
            DO UPDATE SET 
              config_value = EXCLUDED.config_value,
              updated_by = EXCLUDED.updated_by,
              updated_at = EXCLUDED.updated_at
          `,
            [key, value, adminId]
          )
        );
      }

      await Promise.all(updates);

      res.json({
        success: true,
        message: 'Icon configuration updated successfully',
        data: { updatedKeys: Object.keys(iconConfigs) },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update icon configuration',
        error: error.message,
      });
    }
  }
);

export default router;
