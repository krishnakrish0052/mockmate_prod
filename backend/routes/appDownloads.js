import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { requirePermission } from '../middleware/admin/adminAuth.js';
import path, { dirname } from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Helper function to detect platform from user agent
function detectPlatform(userAgent) {
  const ua = userAgent.toLowerCase();

  if (ua.includes('windows')) return 'windows';
  if (ua.includes('macintosh') || ua.includes('mac os x')) return 'macos';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';

  return null;
}

// Helper function to log download attempt
async function logDownloadAttempt(database, versionId, req, status = 'started') {
  try {
    await database.query(
      `
      INSERT INTO app_downloads_log (
        version_id, ip_address, user_agent, referrer, download_status
      ) VALUES ($1, $2, $3, $4, $5)
    `,
      [
        versionId,
        req.ip || req.connection.remoteAddress,
        req.get('User-Agent'),
        req.get('Referrer'),
        status,
      ]
    );
  } catch (error) {
    console.error('Error logging download attempt:', error);
  }
}

// Get available downloads (public endpoint)
router.get('/available', async (req, res) => {
  try {
    const database = req.app.locals.database;
    const userAgent = req.get('User-Agent') || '';
    const detectedPlatform = detectPlatform(userAgent);

    // Get all active app versions grouped by platform
    const result = await database.query(
      `
        SELECT 
          platform_name,
          platform_display_name,
          platform_icon,
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', id,
              'version', version,
              'displayName', display_name,
              'description', description,
              'fileName', file_name,
              'fileSize', file_size,
              'isBeta', is_beta,
              'isFeatured', is_featured,
              'isLatest', is_latest,
              'minOsVersion', min_os_version,
              'changelog', changelog,
              'releaseNotes', release_notes,
              'downloadCount', download_count,
              'createdAt', created_at
            ) ORDER BY version_code DESC
          ) as versions
        FROM v_active_app_versions
        GROUP BY platform_name, platform_display_name, platform_icon, platform_id
        ORDER BY 
          CASE platform_name
            WHEN $1 THEN 1  -- Prioritize detected platform
            WHEN 'windows' THEN 2
            WHEN 'macos' THEN 3
            WHEN 'linux' THEN 4
            ELSE 5
          END
      `,
      [detectedPlatform]
    );

    const platforms = result.rows.map(row => ({
      platform: row.platform_name,
      displayName: row.platform_display_name,
      icon: row.platform_icon,
      isDetected: row.platform_name === detectedPlatform,
      versions: row.versions,
    }));

    res.json({
      success: true,
      data: {
        platforms,
        detectedPlatform,
        totalPlatforms: platforms.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve available downloads',
      error: error.message,
    });
  }
});

// Get latest versions for each platform
router.get('/latest', async (req, res) => {
  try {
    const database = req.app.locals.database;

    const result = await database.query(`
        SELECT 
          platform_name,
          platform_display_name,
          platform_icon,
          id,
          version,
          display_name,
          description,
          file_name,
          file_size,
          is_beta,
          is_featured,
          min_os_version,
          changelog,
          release_notes,
          download_count,
          created_at
        FROM v_active_app_versions
        WHERE is_latest = TRUE
        ORDER BY 
          CASE platform_name
            WHEN 'windows' THEN 1
            WHEN 'macos' THEN 2
            WHEN 'linux' THEN 3
            ELSE 4
          END
      `);

    res.json({
      success: true,
      data: {
        latestVersions: result.rows,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve latest versions',
      error: error.message,
    });
  }
});

// Download app by version ID
router.get(
  '/download/:versionId',
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

      // Get version details
      const versionResult = await database.query(
        `
        SELECT 
          v.id,
          v.version,
          v.file_name,
          v.file_path,
          v.file_size,
          v.file_hash,
          v.display_name,
          p.display_name as platform_name
        FROM app_versions v
        JOIN app_platforms p ON v.platform_id = p.id
        WHERE v.id = $1 AND v.is_active = TRUE AND p.is_active = TRUE
      `,
        [versionId]
      );

      if (versionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'App version not found or inactive',
        });
      }

      const version = versionResult.rows[0];
      const filePath = path.join(__dirname, '../uploads/apps', version.file_path);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch (_fileError) {
        await logDownloadAttempt(database, versionId, req, 'failed');
        return res.status(404).json({
          success: false,
          message: 'App file not found on server',
        });
      }

      // Log download attempt
      await logDownloadAttempt(database, versionId, req, 'started');

      // Update download count
      await database.query(
        `
        UPDATE app_versions 
        SET download_count = download_count + 1
        WHERE id = $1
      `,
        [versionId]
      );

      // Set appropriate headers for download with proper MIME types
      // Always use the original filename for downloads to preserve proper extensions
      const originalFileName = version.file_name; // This has the correct extension
      const originalExt = path.extname(originalFileName || '').toLowerCase();
      
      // Use original filename for download - this ensures proper extension is preserved
      const finalDownloadName = originalFileName || 'app-download.exe';
      
      // Map file extensions to proper MIME types
      const mimeTypes = {
        '.exe': 'application/x-msdownload',
        '.msi': 'application/x-msi',
        '.dmg': 'application/x-apple-diskimage',
        '.pkg': 'application/x-newton-compatible-pkg',
        '.deb': 'application/vnd.debian.binary-package',
        '.rpm': 'application/x-rpm',
        '.appimage': 'application/x-executable',
        '.zip': 'application/zip',
        '.tar.gz': 'application/gzip'
      };
      
      const contentType = mimeTypes[originalExt] || 'application/octet-stream';
      
      res.setHeader('Content-Disposition', `attachment; filename="${finalDownloadName}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', version.file_size);
      res.setHeader('X-File-Hash', version.file_hash);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Stream the file
      const fileStream = await fs.open(filePath, 'r');
      const stream = fileStream.createReadStream();

      stream.pipe(res);

      stream.on('end', async () => {
        await logDownloadAttempt(database, versionId, req, 'completed');
        await fileStream.close();
      });

      stream.on('error', async error => {
        await logDownloadAttempt(database, versionId, req, 'failed');
        await fileStream.close();
        console.error('Download stream error:', error);
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to download app',
        error: error.message,
      });
    }
  }
);

// Download latest version for platform
router.get(
  '/download/latest/:platform',
  [param('platform').isIn(['windows', 'macos', 'linux']).withMessage('Invalid platform')],
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
      const { platform } = req.params;

      // Get latest version for platform
      const versionResult = await database.query(
        `
        SELECT id FROM v_active_app_versions
        WHERE platform_name = $1 AND is_latest = TRUE
        LIMIT 1
      `,
        [platform]
      );

      if (versionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No active version found for ${platform}`,
        });
      }

      // Redirect to the version-specific download
      const versionId = versionResult.rows[0].id;
      return res.redirect(`/api/apps/download/${versionId}`);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to download latest app',
        error: error.message,
      });
    }
  }
);

// Check for updates
router.get(
  '/updates/check',
  [
    query('platform').isIn(['windows', 'macos', 'linux']).withMessage('Valid platform is required'),
    query('currentVersion')
      .matches(/^\d+\.\d+\.\d+$/)
      .withMessage('Current version must be in format x.y.z'),
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
      const { platform, currentVersion } = req.query;

      // Convert version to version code for comparison
      function versionToCode(version) {
        const parts = version.split('.').map(part => parseInt(part) || 0);
        const major = parts[0] || 0;
        const minor = parts[1] || 0;
        const patch = parts[2] || 0;
        return major * 10000 + minor * 100 + patch;
      }

      const currentVersionCode = versionToCode(currentVersion);

      // Get platform ID
      const platformResult = await database.query(
        `
        SELECT id FROM app_platforms WHERE name = $1 AND is_active = TRUE
      `,
        [platform]
      );

      if (platformResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid platform',
        });
      }

      const platformId = platformResult.rows[0].id;

      // Get latest version for platform
      const latestVersionResult = await database.query(
        `
        SELECT 
          id, version, version_code, display_name, description,
          changelog, release_notes, file_size, is_beta
        FROM app_versions
        WHERE platform_id = $1 AND is_active = TRUE
        ORDER BY version_code DESC
        LIMIT 1
      `,
        [platformId]
      );

      // Log the update check
      const hasUpdate =
        latestVersionResult.rows.length > 0 &&
        latestVersionResult.rows[0].version_code > currentVersionCode;
      const latestVersion = latestVersionResult.rows[0];

      await database.query(
        `
        INSERT INTO app_update_checks (
          platform_id, current_version, current_version_code,
          ip_address, user_agent, has_update, latest_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          platformId,
          currentVersion,
          currentVersionCode,
          req.ip || req.connection.remoteAddress,
          req.get('User-Agent'),
          hasUpdate,
          latestVersion?.version,
        ]
      );

      if (!hasUpdate) {
        return res.json({
          success: true,
          hasUpdate: false,
          message: 'You have the latest version',
          current: {
            version: currentVersion,
            versionCode: currentVersionCode,
          },
        });
      }

      res.json({
        success: true,
        hasUpdate: true,
        current: {
          version: currentVersion,
          versionCode: currentVersionCode,
        },
        latest: {
          id: latestVersion.id,
          version: latestVersion.version,
          versionCode: latestVersion.version_code,
          displayName: latestVersion.display_name,
          description: latestVersion.description,
          changelog: latestVersion.changelog,
          releaseNotes: latestVersion.release_notes,
          fileSize: latestVersion.file_size,
          isBeta: latestVersion.is_beta,
          downloadUrl: `/api/apps/download/${latestVersion.id}`,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to check for updates',
        error: error.message,
      });
    }
  }
);

// Get download info without downloading
router.get(
  '/info/:versionId',
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

      const result = await database.query(
        `
        SELECT 
          id, platform_name, platform_display_name, platform_icon,
          version, display_name, description, file_name, file_size,
          is_beta, is_featured, is_latest, min_os_version,
          changelog, release_notes, download_count, created_at
        FROM v_active_app_versions
        WHERE id = $1
      `,
        [versionId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'App version not found',
        });
      }

      res.json({
        success: true,
        data: {
          version: result.rows[0],
          downloadUrl: `/api/apps/download/${versionId}`,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve version info',
        error: error.message,
      });
    }
  }
);

export default router;
