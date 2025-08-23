import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../../middleware/admin/errorHandler.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Get all environment configurations
router.get(
  '/environments',
  requirePermission(['config.read']),
  [
    query('application').optional().isString().withMessage('Invalid application name'),
    query('environment').optional().isString().withMessage('Invalid environment'),
    query('category').optional().isString().withMessage('Invalid category'),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const { application, environment, category } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (application) {
      conditions.push(`application_name = $${paramIndex}`);
      params.push(application);
      paramIndex++;
    }

    if (environment) {
      conditions.push(`environment = $${paramIndex}`);
      params.push(environment);
      paramIndex++;
    }

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const configsQuery = `
      SELECT 
        id, application_name, environment, config_key, 
        CASE 
          WHEN is_sensitive = true THEN '[REDACTED]'
          ELSE config_value 
        END as config_value,
        config_type, description, category, is_sensitive, is_required,
        validation_pattern, created_at, updated_at,
        admin_users.name as updated_by_name
      FROM environment_configurations ec
      LEFT JOIN admin_users ON ec.updated_by = admin_users.id
      ${whereClause}
      ORDER BY application_name, environment, category, config_key
    `;

    const result = await database.query(configsQuery, params);

    // Group configurations by application and environment
    const groupedConfigs = {};

    result.rows.forEach(config => {
      const appName = config.application_name;
      const envName = config.environment;

      if (!groupedConfigs[appName]) {
        groupedConfigs[appName] = {};
      }

      if (!groupedConfigs[appName][envName]) {
        groupedConfigs[appName][envName] = {};
      }

      if (!groupedConfigs[appName][envName][config.category]) {
        groupedConfigs[appName][envName][config.category] = [];
      }

      groupedConfigs[appName][envName][config.category].push({
        id: config.id,
        key: config.config_key,
        value: config.config_value,
        type: config.config_type,
        description: config.description,
        isSensitive: config.is_sensitive,
        isRequired: config.is_required,
        validationPattern: config.validation_pattern,
        updatedAt: config.updated_at,
        updatedByName: config.updated_by_name,
      });
    });

    res.json({
      success: true,
      data: groupedConfigs,
    });
  })
);

// Update environment configuration
router.put(
  '/environments/:id',
  requirePermission(['config.write']),
  [
    param('id').isUUID().withMessage('Invalid configuration ID'),
    body('value').notEmpty().withMessage('Configuration value is required'),
    body('description').optional().isString().withMessage('Invalid description'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { value, description } = req.body;
    const adminId = req.admin.id;

    // Get current configuration
    const currentConfig = await database.query(
      'SELECT * FROM environment_configurations WHERE id = $1',
      [id]
    );

    if (currentConfig.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found',
      });
    }

    const config = currentConfig.rows[0];

    // Validate value based on type and pattern
    if (config.config_type === 'number' && isNaN(value)) {
      return res.status(400).json({
        success: false,
        message: 'Value must be a number',
      });
    }

    if (config.config_type === 'boolean' && !['true', 'false'].includes(value.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Value must be true or false',
      });
    }

    if (config.validation_pattern) {
      const pattern = new RegExp(config.validation_pattern);
      if (!pattern.test(value)) {
        return res.status(400).json({
          success: false,
          message: 'Value does not match required pattern',
        });
      }
    }

    // Update configuration
    const updateQuery = `
      UPDATE environment_configurations 
      SET 
        config_value = $1,
        description = COALESCE($2, description),
        updated_at = NOW(),
        updated_by = $3
      WHERE id = $4
      RETURNING *
    `;

    const result = await database.query(updateQuery, [value, description, adminId, id]);
    const updatedConfig = result.rows[0];

    // Generate new .env file content
    await generateEnvFile(database, config.application_name, config.environment);

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'CONFIG_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        configId: id,
        application: config.application_name,
        environment: config.environment,
        key: config.config_key,
        oldValue: config.is_sensitive ? '[REDACTED]' : config.config_value,
        newValue: config.is_sensitive ? '[REDACTED]' : value,
      },
    });

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: {
        id: updatedConfig.id,
        key: updatedConfig.config_key,
        value: updatedConfig.is_sensitive ? '[REDACTED]' : updatedConfig.config_value,
        type: updatedConfig.config_type,
        description: updatedConfig.description,
        updatedAt: updatedConfig.updated_at,
      },
    });
  })
);

// Add new environment configuration
router.post(
  '/environments',
  requirePermission(['config.create']),
  [
    body('applicationName').notEmpty().withMessage('Application name is required'),
    body('environment').notEmpty().withMessage('Environment is required'),
    body('configKey').notEmpty().withMessage('Configuration key is required'),
    body('configValue').notEmpty().withMessage('Configuration value is required'),
    body('configType')
      .isIn(['string', 'number', 'boolean', 'json'])
      .withMessage('Invalid config type'),
    body('category').notEmpty().withMessage('Category is required'),
    body('description').optional().isString().withMessage('Invalid description'),
    body('isSensitive').optional().isBoolean().withMessage('Invalid sensitive flag'),
    body('isRequired').optional().isBoolean().withMessage('Invalid required flag'),
    body('validationPattern').optional().isString().withMessage('Invalid validation pattern'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const adminId = req.admin.id;

    const {
      applicationName,
      environment,
      configKey,
      configValue,
      configType,
      category,
      description,
      isSensitive = false,
      isRequired = false,
      validationPattern,
    } = req.body;

    // Check if configuration already exists
    const existingConfig = await database.query(
      'SELECT id FROM environment_configurations WHERE application_name = $1 AND environment = $2 AND config_key = $3',
      [applicationName, environment, configKey]
    );

    if (existingConfig.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Configuration already exists for this application and environment',
      });
    }

    // Create new configuration
    const insertQuery = `
      INSERT INTO environment_configurations (
        application_name, environment, config_key, config_value, config_type,
        description, category, is_sensitive, is_required, validation_pattern,
        created_at, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), $11)
      RETURNING *
    `;

    const result = await database.query(insertQuery, [
      applicationName,
      environment,
      configKey,
      configValue,
      configType,
      description,
      category,
      isSensitive,
      isRequired,
      validationPattern,
      adminId,
    ]);

    const newConfig = result.rows[0];

    // Generate new .env file content
    await generateEnvFile(database, applicationName, environment);

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'CONFIG_CREATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        configId: newConfig.id,
        application: applicationName,
        environment,
        key: configKey,
        category,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Configuration created successfully',
      data: {
        id: newConfig.id,
        applicationName: newConfig.application_name,
        environment: newConfig.environment,
        key: newConfig.config_key,
        value: newConfig.is_sensitive ? '[REDACTED]' : newConfig.config_value,
        type: newConfig.config_type,
        category: newConfig.category,
        description: newConfig.description,
        isSensitive: newConfig.is_sensitive,
        isRequired: newConfig.is_required,
        createdAt: newConfig.created_at,
      },
    });
  })
);

// Delete environment configuration
router.delete(
  '/environments/:id',
  requirePermission(['config.delete']),
  [param('id').isUUID().withMessage('Invalid configuration ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    // Get configuration details before deletion
    const configResult = await database.query(
      'SELECT * FROM environment_configurations WHERE id = $1',
      [id]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Configuration not found',
      });
    }

    const config = configResult.rows[0];

    // Check if configuration is required
    if (config.is_required) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete required configuration',
      });
    }

    // Delete configuration
    await database.query('DELETE FROM environment_configurations WHERE id = $1', [id]);

    // Generate new .env file content
    await generateEnvFile(database, config.application_name, config.environment);

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'CONFIG_DELETE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        configId: id,
        application: config.application_name,
        environment: config.environment,
        key: config.config_key,
        category: config.category,
      },
    });

    res.json({
      success: true,
      message: 'Configuration deleted successfully',
    });
  })
);

// Get system settings
router.get(
  '/system',
  requirePermission(['config.read']),
  [
    query('group').optional().isString().withMessage('Invalid group'),
    query('onlyActive').optional().isBoolean().withMessage('Invalid onlyActive flag'),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const { group, onlyActive = 'true' } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (group) {
      conditions.push(`setting_group = $${paramIndex}`);
      params.push(group);
      paramIndex++;
    }

    if (onlyActive === 'true') {
      conditions.push('is_active = true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const settingsQuery = `
      SELECT 
        id, setting_group, setting_key, setting_value, setting_type,
        display_name, description, is_public, is_required, validation_rules,
        default_value, display_order, is_active, updated_at,
        admin_users.name as updated_by_name
      FROM system_settings ss
      LEFT JOIN admin_users ON ss.updated_by = admin_users.id
      ${whereClause}
      ORDER BY setting_group, display_order, setting_key
    `;

    const result = await database.query(settingsQuery, params);

    // Group settings by group
    const groupedSettings = {};

    result.rows.forEach(setting => {
      const groupName = setting.setting_group;

      if (!groupedSettings[groupName]) {
        groupedSettings[groupName] = [];
      }

      groupedSettings[groupName].push({
        id: setting.id,
        key: setting.setting_key,
        value: setting.setting_value,
        type: setting.setting_type,
        displayName: setting.display_name,
        description: setting.description,
        isPublic: setting.is_public,
        isRequired: setting.is_required,
        validationRules: setting.validation_rules || {},
        defaultValue: setting.default_value,
        displayOrder: setting.display_order,
        isActive: setting.is_active,
        updatedAt: setting.updated_at,
        updatedByName: setting.updated_by_name,
      });
    });

    res.json({
      success: true,
      data: groupedSettings,
    });
  })
);

// Update system setting
router.put(
  '/system/:id',
  requirePermission(['config.write']),
  [
    param('id').isUUID().withMessage('Invalid setting ID'),
    body('value').notEmpty().withMessage('Setting value is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { value } = req.body;
    const adminId = req.admin.id;

    // Get current setting
    const currentSetting = await database.query('SELECT * FROM system_settings WHERE id = $1', [
      id,
    ]);

    if (currentSetting.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found',
      });
    }

    const setting = currentSetting.rows[0];

    // Validate value based on type and rules
    const validationRules = setting.validation_rules || {};

    if (setting.setting_type === 'number') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        return res.status(400).json({
          success: false,
          message: 'Value must be a number',
        });
      }

      if (validationRules.min !== undefined && numValue < validationRules.min) {
        return res.status(400).json({
          success: false,
          message: `Value must be at least ${validationRules.min}`,
        });
      }

      if (validationRules.max !== undefined && numValue > validationRules.max) {
        return res.status(400).json({
          success: false,
          message: `Value must be at most ${validationRules.max}`,
        });
      }
    }

    if (setting.setting_type === 'boolean' && !['true', 'false'].includes(value.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Value must be true or false',
      });
    }

    if (setting.setting_type === 'string') {
      if (validationRules.minLength && value.length < validationRules.minLength) {
        return res.status(400).json({
          success: false,
          message: `Value must be at least ${validationRules.minLength} characters`,
        });
      }

      if (validationRules.maxLength && value.length > validationRules.maxLength) {
        return res.status(400).json({
          success: false,
          message: `Value must be at most ${validationRules.maxLength} characters`,
        });
      }

      if (validationRules.pattern) {
        const pattern = new RegExp(validationRules.pattern);
        if (!pattern.test(value)) {
          return res.status(400).json({
            success: false,
            message: 'Value does not match required pattern',
          });
        }
      }
    }

    // Update setting
    const updateQuery = `
      UPDATE system_settings 
      SET 
        setting_value = $1,
        updated_at = NOW(),
        updated_by = $2
      WHERE id = $3
      RETURNING *
    `;

    const result = await database.query(updateQuery, [value, adminId, id]);
    const updatedSetting = result.rows[0];

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'SYSTEM_SETTING_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        settingId: id,
        group: setting.setting_group,
        key: setting.setting_key,
        oldValue: setting.setting_value,
        newValue: value,
      },
    });

    res.json({
      success: true,
      message: 'System setting updated successfully',
      data: {
        id: updatedSetting.id,
        group: updatedSetting.setting_group,
        key: updatedSetting.setting_key,
        value: updatedSetting.setting_value,
        type: updatedSetting.setting_type,
        displayName: updatedSetting.display_name,
        updatedAt: updatedSetting.updated_at,
      },
    });
  })
);

// Generate .env file for specific application and environment
async function generateEnvFile(database, applicationName, environment) {
  try {
    const result = await database.query(
      `
      SELECT config_key, config_value, description, category
      FROM environment_configurations
      WHERE application_name = $1 AND environment = $2
      ORDER BY category, config_key
    `,
      [applicationName, environment]
    );

    let envContent = `# ${applicationName.toUpperCase()} - ${environment.toUpperCase()} Environment Configuration\n`;
    envContent += `# Generated automatically by Admin Panel\n`;
    envContent += `# Last updated: ${new Date().toISOString()}\n\n`;

    let currentCategory = '';

    result.rows.forEach(config => {
      // Add category comment if changed
      const category = config.category || 'general';
      if (category !== currentCategory) {
        envContent += `\n# ${category.charAt(0).toUpperCase() + category.slice(1)} Configuration\n`;
        currentCategory = category;
      }

      // Add description as comment if available
      if (config.description) {
        envContent += `# ${config.description}\n`;
      }

      envContent += `${config.config_key}=${config.config_value}\n`;
    });

    // Determine file path based on application with more robust path resolution
    let targetDirectory;
    const projectRoot = process.cwd(); // Get current working directory

    switch (applicationName.toLowerCase()) {
      case 'webapp_backend':
      case 'webapp-backend':
        targetDirectory = path.join(projectRoot, '..', '..', 'webapp', 'backend');
        break;
      case 'webapp_frontend':
      case 'webapp-frontend':
        targetDirectory = path.join(projectRoot, '..', '..', 'webapp', 'frontend');
        break;
      case 'admin_panel':
      case 'admin-panel':
      case 'admin_frontend':
      case 'admin-frontend':
        targetDirectory = path.join(projectRoot, '..');
        break;
      case 'desktop_app':
      case 'desktop-app':
        targetDirectory = path.join(projectRoot, '..', '..', 'desktop-app');
        break;
      default:
        console.warn(`Unknown application: ${applicationName}`);
        return;
    }

    // Create directory if it doesn't exist
    try {
      await fs.mkdir(targetDirectory, { recursive: true });
    } catch (mkdirError) {
      if (mkdirError.code !== 'EEXIST') {
        throw mkdirError;
      }
    }

    // Write .env file
    const envFilePath = path.join(targetDirectory, '.env');
    await fs.writeFile(envFilePath, envContent, 'utf8');

    console.log(`Generated .env file for ${applicationName}/${environment}: ${envFilePath}`);
    return envFilePath;
  } catch (error) {
    console.error('Error generating .env file:', error);
    throw error; // Re-throw to handle in calling function
  }
}

// Generate .env file endpoint
router.post(
  '/environments/generate-env/:application/:environment',
  requirePermission(['config.write']),
  [
    param('application').notEmpty().withMessage('Application name is required'),
    param('environment').notEmpty().withMessage('Environment is required'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { application, environment } = req.params;
    const adminId = req.admin.id;

    try {
      await generateEnvFile(database, application, environment);

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'ENV_FILE_GENERATE',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          application,
          environment,
        },
      });

      res.json({
        success: true,
        message: `.env file generated successfully for ${application}/${environment}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate .env file',
        error: error.message,
      });
    }
  })
);

// Backup all configurations
router.get(
  '/backup',
  requirePermission(['config.read', 'config.backup']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const adminId = req.admin.id;

    try {
      // Get all environment configurations
      const envConfigs = await database.query(`
        SELECT 
          application_name, environment, config_key, config_value, config_type,
          description, category, is_sensitive, is_required, validation_pattern,
          created_at, updated_at
        FROM environment_configurations
        ORDER BY application_name, environment, config_key
      `);

      // Get all system settings
      const systemSettings = await database.query(`
        SELECT 
          setting_group, setting_key, setting_value, setting_type, display_name,
          description, is_public, is_required, validation_rules, default_value,
          display_order, is_active, created_at, updated_at
        FROM system_settings
        ORDER BY setting_group, setting_key
      `);

      const backup = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        environment_configurations: envConfigs.rows,
        system_settings: systemSettings.rows,
      };

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'CONFIG_BACKUP_EXPORT',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          environmentConfigCount: envConfigs.rows.length,
          systemSettingsCount: systemSettings.rows.length,
        },
      });

      res.json({
        success: true,
        data: backup,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create configuration backup',
        error: error.message,
      });
    }
  })
);

// Restore configurations from backup
router.post(
  '/restore',
  requirePermission(['config.write', 'config.restore']),
  [
    body('backup').isObject().withMessage('Backup data is required'),
    body('backup.environment_configurations')
      .isArray()
      .withMessage('Environment configurations must be an array'),
    body('backup.system_settings').isArray().withMessage('System settings must be an array'),
    body('overwrite').optional().isBoolean().withMessage('Overwrite flag must be boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { backup, overwrite = false } = req.body;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      let envConfigsRestored = 0;
      let systemSettingsRestored = 0;
      const conflicts = [];

      // Restore environment configurations
      for (const config of backup.environment_configurations) {
        try {
          const insertQuery = `
            INSERT INTO environment_configurations (
              application_name, environment, config_key, config_value, config_type,
              description, category, is_sensitive, is_required, validation_pattern,
              created_at, updated_at, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12)
            ${
              overwrite
                ? `
              ON CONFLICT (application_name, environment, config_key)
              DO UPDATE SET 
                config_value = EXCLUDED.config_value,
                config_type = EXCLUDED.config_type,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                is_sensitive = EXCLUDED.is_sensitive,
                is_required = EXCLUDED.is_required,
                validation_pattern = EXCLUDED.validation_pattern,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            `
                : ''
            }
          `;

          await database.query(insertQuery, [
            config.application_name,
            config.environment,
            config.config_key,
            config.config_value,
            config.config_type,
            config.description,
            config.category,
            config.is_sensitive,
            config.is_required,
            config.validation_pattern,
            config.created_at,
            adminId,
          ]);

          envConfigsRestored++;
        } catch (error) {
          if (error.code === '23505' && !overwrite) {
            // Unique constraint violation
            conflicts.push({
              type: 'environment_configuration',
              key: `${config.application_name}/${config.environment}/${config.config_key}`,
            });
          } else {
            throw error;
          }
        }
      }

      // Restore system settings
      for (const setting of backup.system_settings) {
        try {
          const insertQuery = `
            INSERT INTO system_settings (
              setting_group, setting_key, setting_value, setting_type, display_name,
              description, is_public, is_required, validation_rules, default_value,
              display_order, is_active, created_at, updated_at, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14)
            ${
              overwrite
                ? `
              ON CONFLICT (setting_group, setting_key)
              DO UPDATE SET 
                setting_value = EXCLUDED.setting_value,
                setting_type = EXCLUDED.setting_type,
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description,
                is_public = EXCLUDED.is_public,
                is_required = EXCLUDED.is_required,
                validation_rules = EXCLUDED.validation_rules,
                default_value = EXCLUDED.default_value,
                display_order = EXCLUDED.display_order,
                is_active = EXCLUDED.is_active,
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            `
                : ''
            }
          `;

          await database.query(insertQuery, [
            setting.setting_group,
            setting.setting_key,
            setting.setting_value,
            setting.setting_type,
            setting.display_name,
            setting.description,
            setting.is_public,
            setting.is_required,
            setting.validation_rules,
            setting.default_value,
            setting.display_order,
            setting.is_active,
            setting.created_at,
            adminId,
          ]);

          systemSettingsRestored++;
        } catch (error) {
          if (error.code === '23505' && !overwrite) {
            // Unique constraint violation
            conflicts.push({
              type: 'system_setting',
              key: `${setting.setting_group}/${setting.setting_key}`,
            });
          } else {
            throw error;
          }
        }
      }

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'CONFIG_BACKUP_RESTORE',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          envConfigsRestored,
          systemSettingsRestored,
          conflicts: conflicts.length,
          overwrite,
        },
      });

      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Configuration backup restored successfully',
        data: {
          environmentConfigurationsRestored: envConfigsRestored,
          systemSettingsRestored: systemSettingsRestored,
          conflicts: conflicts.length > 0 ? conflicts : undefined,
          message:
            conflicts.length > 0
              ? 'Some configurations were skipped due to conflicts. Use overwrite=true to replace existing values.'
              : undefined,
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      res.status(500).json({
        success: false,
        message: 'Failed to restore configuration backup',
        error: error.message,
      });
    }
  })
);

export default router;
