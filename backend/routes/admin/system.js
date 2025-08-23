import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../../middleware/admin/errorHandler.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const router = express.Router();
const _execAsync = util.promisify(exec);

// Get system health status using database function
router.get(
  '/health',
  requirePermission(['system.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    try {
      // Use the check_system_health database function
      const healthResult = await database.query('SELECT check_system_health()');
      const healthData = healthResult.rows[0].check_system_health;

      res.json({
        success: true,
        data: healthData,
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        message: 'System health check failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// Get detailed system health status (legacy endpoint)
router.get(
  '/health/detailed',
  requirePermission(['system.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    try {
      // Database health check
      const dbStart = Date.now();
      await database.query('SELECT 1');
      const dbLatency = Date.now() - dbStart;

      // Redis health check (if available)
      let redisHealth = { status: 'unknown', latency: null };
      try {
        const redisService = req.app.locals.redisService;
        if (redisService && redisService.ping) {
          const redisStart = Date.now();
          await redisService.ping();
          redisHealth = {
            status: 'healthy',
            latency: Date.now() - redisStart,
          };
        }
      } catch (error) {
        redisHealth = { status: 'unhealthy', error: error.message };
      }

      // System metrics
      const systemInfo = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: os.loadavg(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpuCount: os.cpus().length,
      };

      // Database connection pool info (if available)
      let dbPoolInfo = null;
      if (database.pool) {
        dbPoolInfo = {
          totalConnections: database.pool.totalCount || 0,
          idleConnections: database.pool.idleCount || 0,
          waitingClients: database.pool.waitingCount || 0,
        };
      }

      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: {
            status: dbLatency < 1000 ? 'healthy' : 'degraded',
            latency: dbLatency,
            pool: dbPoolInfo,
          },
          redis: redisHealth,
        },
        system: systemInfo,
      };

      res.json({
        success: true,
        data: healthStatus,
      });
    } catch (error) {
      res.status(503).json({
        success: false,
        message: 'System health check failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  })
);

// Get system configuration
router.get(
  '/config',
  requirePermission(['system.read', 'config.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    // Get system configuration from database
    const configQuery = `
      SELECT config_key, config_value, description, is_sensitive, updated_at
      FROM system_config
      ORDER BY config_key
    `;

    const result = await database.query(configQuery);

    const config = result.rows.reduce((acc, row) => {
      acc[row.config_key] = {
        value: row.is_sensitive ? '[REDACTED]' : row.config_value,
        description: row.description,
        isSensitive: row.is_sensitive,
        updatedAt: row.updated_at,
      };
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        configuration: config,
        lastUpdated: new Date().toISOString(),
      },
    });
  })
);

// Update system configuration
router.patch(
  '/config',
  requirePermission(['system.write', 'config.write']),
  [
    body('updates').isArray().withMessage('Updates must be an array'),
    body('updates.*.key').notEmpty().withMessage('Configuration key is required'),
    body('updates.*.value').exists().withMessage('Configuration value is required'),
    body('updates.*.description').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { updates } = req.body;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      const updatedConfigs = [];

      for (const update of updates) {
        const { key, value, description } = update;

        // Update or insert configuration
        const upsertQuery = `
          INSERT INTO system_config (config_key, config_value, description, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (config_key)
          DO UPDATE SET 
            config_value = EXCLUDED.config_value,
            description = COALESCE(EXCLUDED.description, system_config.description),
            updated_at = NOW()
          RETURNING *
        `;

        const result = await database.query(upsertQuery, [key, value, description]);
        updatedConfigs.push(result.rows[0]);
      }

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'CONFIG_UPDATED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          updatedKeys: updates.map(u => u.key),
          count: updates.length,
        },
      });

      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Configuration updated successfully',
        data: {
          updatedConfigs: updatedConfigs.map(config => ({
            key: config.config_key,
            value: config.is_sensitive ? '[REDACTED]' : config.config_value,
            description: config.description,
            updatedAt: config.updated_at,
          })),
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

// Get system logs
router.get(
  '/logs',
  requirePermission(['system.read', 'logs.read']),
  [
    query('level').optional().isIn(['all', 'error', 'warn', 'info', 'debug']),
    query('source').optional().isString(),
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Invalid limit'),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format'),
    query('search').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;
    const { level, source, dateFrom, dateTo, search } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (level && level !== 'all') {
      conditions.push(`level = $${paramIndex}`);
      params.push(level);
      paramIndex++;
    }

    if (source) {
      conditions.push(`source ILIKE $${paramIndex}`);
      params.push(`%${source}%`);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(message ILIKE $${paramIndex} OR metadata::text ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const logsQuery = `
      SELECT id, level, source, message, metadata, created_at
      FROM system_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_logs
      ${whereClause}
    `;

    params.push(limit, offset);

    const [logsResult, countResult] = await Promise.all([
      database.query(logsQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const logs = logsResult.rows.map(row => ({
      id: row.id,
      level: row.level,
      source: row.source,
      message: row.message,
      metadata: row.metadata,
      timestamp: row.created_at,
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { level, source, dateFrom, dateTo, search },
      },
    });
  })
);

// Get admin activity logs
router.get(
  '/admin-activity',
  requirePermission(['system.read', 'audit.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('action').optional().isString(),
    query('adminId').optional().isUUID().withMessage('Invalid admin ID'),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format'),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const { action, adminId, dateFrom, dateTo } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (action) {
      conditions.push(`aal.action ILIKE $${paramIndex}`);
      params.push(`%${action}%`);
      paramIndex++;
    }

    if (adminId) {
      conditions.push(`aal.admin_id = $${paramIndex}`);
      params.push(adminId);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`aal.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`aal.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const activityQuery = `
      SELECT 
        aal.id,
        aal.action,
        aal.ip_address,
        aal.user_agent,
        aal.details,
        aal.created_at,
        au.email as admin_email,
        au.name as admin_name
      FROM admin_activity_log aal
      JOIN admin_users au ON aal.admin_id = au.id
      ${whereClause}
      ORDER BY aal.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM admin_activity_log aal
      JOIN admin_users au ON aal.admin_id = au.id
      ${whereClause}
    `;

    params.push(limit, offset);

    const [activityResult, countResult] = await Promise.all([
      database.query(activityQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const activities = activityResult.rows.map(row => ({
      id: row.id,
      action: row.action,
      admin: {
        email: row.admin_email,
        name: row.admin_name,
      },
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      details: row.details,
      timestamp: row.created_at,
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        activities,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { action, adminId, dateFrom, dateTo },
      },
    });
  })
);

// Get system alerts
router.get(
  '/alerts',
  requirePermission(['system.read', 'alerts.read']),
  [
    query('severity').optional().isIn(['all', 'low', 'medium', 'high', 'critical']),
    query('status').optional().isIn(['all', 'active', 'acknowledged', 'resolved']),
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { severity, status } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (severity && severity !== 'all') {
      conditions.push(`severity = $${paramIndex}`);
      params.push(severity);
      paramIndex++;
    }

    if (status && status !== 'all') {
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const alertsQuery = `
      SELECT *
      FROM system_alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_alerts
      ${whereClause}
    `;

    params.push(limit, offset);

    const [alertsResult, countResult] = await Promise.all([
      database.query(alertsQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const alerts = alertsResult.rows.map(row => ({
      id: row.id,
      type: row.alert_type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.created_at,
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { severity, status },
      },
    });
  })
);

// Acknowledge system alert
router.post(
  '/alerts/:id/acknowledge',
  requirePermission(['system.write', 'alerts.write']),
  [param('id').isUUID().withMessage('Invalid alert ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    const updateQuery = `
      UPDATE system_alerts
      SET status = 'acknowledged',
          acknowledged_at = NOW(),
          metadata = COALESCE(metadata, '{}') || $2
      WHERE id = $1 AND status = 'active'
      RETURNING *
    `;

    const metadata = JSON.stringify({
      acknowledgedBy: adminId,
      acknowledgedAt: new Date().toISOString(),
    });

    const result = await database.query(updateQuery, [id, metadata]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found or already acknowledged',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'ALERT_ACKNOWLEDGED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { alertId: id },
    });

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      data: {
        id,
        acknowledgedAt: new Date().toISOString(),
      },
    });
  })
);

// Resolve system alert
router.post(
  '/alerts/:id/resolve',
  requirePermission(['system.write', 'alerts.write']),
  [param('id').isUUID().withMessage('Invalid alert ID'), body('resolution').optional().isString()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { resolution = 'Resolved by admin' } = req.body;
    const adminId = req.admin.id;

    const updateQuery = `
      UPDATE system_alerts
      SET status = 'resolved',
          resolved_at = NOW(),
          metadata = COALESCE(metadata, '{}') || $2
      WHERE id = $1 AND status IN ('active', 'acknowledged')
      RETURNING *
    `;

    const metadata = JSON.stringify({
      resolvedBy: adminId,
      resolvedAt: new Date().toISOString(),
      resolution,
    });

    const result = await database.query(updateQuery, [id, metadata]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found or already resolved',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'ALERT_RESOLVED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: { alertId: id, resolution },
    });

    res.json({
      success: true,
      message: 'Alert resolved successfully',
      data: {
        id,
        resolvedAt: new Date().toISOString(),
        resolution,
      },
    });
  })
);

// Database maintenance operations
router.post(
  '/maintenance/database',
  requirePermission(['system.write', 'maintenance.execute']),
  [
    body('operation').isIn(['vacuum', 'analyze', 'reindex']).withMessage('Invalid operation'),
    body('tables').optional().isArray().withMessage('Tables must be an array'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { operation, tables = [] } = req.body;
    const adminId = req.admin.id;

    try {
      let queries = [];

      switch (operation) {
        case 'vacuum':
          if (tables.length > 0) {
            queries = tables.map(table => `VACUUM ANALYZE ${table}`);
          } else {
            queries = ['VACUUM ANALYZE'];
          }
          break;
        case 'analyze':
          if (tables.length > 0) {
            queries = tables.map(table => `ANALYZE ${table}`);
          } else {
            queries = ['ANALYZE'];
          }
          break;
        case 'reindex':
          if (tables.length > 0) {
            queries = tables.map(table => `REINDEX TABLE ${table}`);
          } else {
            queries = ['REINDEX DATABASE'];
          }
          break;
      }

      const results = [];
      for (const query of queries) {
        const start = Date.now();
        await database.query(query);
        results.push({
          query,
          duration: Date.now() - start,
        });
      }

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'MAINTENANCE_EXECUTED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { operation, tables, results },
      });

      res.json({
        success: true,
        message: `Database ${operation} completed successfully`,
        data: {
          operation,
          tables: tables.length > 0 ? tables : ['all'],
          results,
        },
      });
    } catch (error) {
      // Log failed maintenance
      await database.logAdminActivity({
        adminId,
        action: 'MAINTENANCE_FAILED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { operation, tables, error: error.message },
      });

      throw error;
    }
  })
);

// Get real-time active users and sessions
router.get(
  '/realtime/active',
  requirePermission(['system.read', 'realtime.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    const activeUsersQuery = `
      SELECT 
        u.id,
        u.name,
        u.email,
        s.id as session_id,
        s.session_name,
        s.status as session_status,
        s.started_at,
        s.desktop_connected_at,
        CASE 
          WHEN s.desktop_connected_at > NOW() - INTERVAL '2 minutes' THEN 'desktop'
          ELSE 'web'
        END as connection_type
      FROM users u
      JOIN sessions s ON u.id = s.user_id
      WHERE s.status = 'active'
      AND (
        s.desktop_connected_at > NOW() - INTERVAL '2 minutes'
        OR s.started_at > NOW() - INTERVAL '30 minutes'
      )
      ORDER BY s.started_at DESC
    `;

    const result = await database.query(activeUsersQuery);

    const activeUsers = result.rows.map(row => ({
      userId: row.id,
      userName: row.name,
      userEmail: row.email,
      sessionId: row.session_id,
      sessionName: row.session_name,
      sessionStatus: row.session_status,
      startedAt: row.started_at,
      connectionType: row.connection_type,
      isDesktopConnected: row.desktop_connected_at !== null,
    }));

    res.json({
      success: true,
      data: {
        activeUsers,
        totalActive: activeUsers.length,
        desktopConnections: activeUsers.filter(u => u.connectionType === 'desktop').length,
        webConnections: activeUsers.filter(u => u.connectionType === 'web').length,
        timestamp: new Date().toISOString(),
      },
    });
  })
);

// Block/unblock user
router.post(
  '/users/:userId/block',
  requirePermission(['users.write', 'users.block']),
  [
    param('userId').isUUID().withMessage('Invalid user ID'),
    body('reason').notEmpty().withMessage('Block reason is required'),
    body('duration')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Duration must be a positive integer (hours)'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { userId } = req.params;
    const { reason, duration } = req.body;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      // Update user suspension status
      const updateUserQuery = `
        UPDATE users 
        SET 
          is_suspended = true,
          suspension_reason = $2,
          suspended_until = CASE 
            WHEN $3::integer IS NOT NULL THEN NOW() + ($3::text || ' hours')::INTERVAL
            ELSE NULL
          END,
          suspended_at = NOW(),
          suspended_by = $4
        WHERE id = $1
        RETURNING id, name, email, is_suspended, suspended_until
      `;

      const userResult = await database.query(updateUserQuery, [userId, reason, duration, adminId]);

      if (userResult.rows.length === 0) {
        await database.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Terminate any active sessions
      await database.query(
        `UPDATE sessions 
         SET status = 'cancelled', 
             ended_at = NOW(),
             session_notes = COALESCE(session_notes, '') || E'\n' || $2
         WHERE user_id = $1 AND status = 'active'`,
        [userId, `Session terminated due to user suspension: ${reason}`]
      );

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'USER_BLOCKED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          userId,
          reason,
          duration,
          userName: userResult.rows[0].name,
          userEmail: userResult.rows[0].email,
        },
      });

      await database.query('COMMIT');

      const user = userResult.rows[0];

      res.json({
        success: true,
        message: 'User blocked successfully',
        data: {
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          isBlocked: user.is_suspended,
          blockedUntil: user.suspended_until,
          reason,
        },
      });

      // Broadcast real-time update
      req.app.locals.broadcast('user_blocked', {
        userId,
        reason,
        blockedBy: adminId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

// Unblock user
router.post(
  '/users/:userId/unblock',
  requirePermission(['users.write', 'users.unblock']),
  [param('userId').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { userId } = req.params;
    const adminId = req.admin.id;

    const updateUserQuery = `
      UPDATE users 
      SET 
        is_suspended = false,
        suspension_reason = NULL,
        suspended_until = NULL,
        suspended_at = NULL,
        suspended_by = NULL
      WHERE id = $1 AND is_suspended = true
      RETURNING id, name, email, is_suspended
    `;

    const result = await database.query(updateUserQuery, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or not currently blocked',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'USER_UNBLOCKED',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        userId,
        userName: result.rows[0].name,
        userEmail: result.rows[0].email,
      },
    });

    const user = result.rows[0];

    res.json({
      success: true,
      message: 'User unblocked successfully',
      data: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        isBlocked: user.is_suspended,
      },
    });

    // Broadcast real-time update
    req.app.locals.broadcast('user_unblocked', {
      userId,
      unblockedBy: adminId,
      timestamp: new Date().toISOString(),
    });
  })
);

// Clear cache (if applicable)
router.post(
  '/cache/clear',
  requirePermission(['system.write', 'cache.clear']),
  [body('pattern').optional().isString()],
  asyncHandler(async (req, res) => {
    const { pattern } = req.body;
    const adminId = req.admin.id;

    try {
      const redisService = req.app.locals.redisService;
      if (!redisService) {
        return res.status(400).json({
          success: false,
          message: 'Redis service not available',
        });
      }

      let clearedKeys = 0;
      if (pattern) {
        // Clear keys matching pattern
        const keys = await redisService.keys(pattern);
        if (keys.length > 0) {
          await redisService.del(...keys);
          clearedKeys = keys.length;
        }
      } else {
        // Clear all keys
        await redisService.flushall();
        clearedKeys = 'all';
      }

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'CACHE_CLEARED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: { pattern, clearedKeys },
      });

      res.json({
        success: true,
        message: 'Cache cleared successfully',
        data: {
          pattern: pattern || 'all',
          clearedKeys,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache',
        error: error.message,
      });
    }
  })
);

export default router;
