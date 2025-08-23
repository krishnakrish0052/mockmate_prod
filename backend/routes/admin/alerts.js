import express from 'express';
import { logger } from '../../config/logger.js';
import { adminAuth } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

/**
 * Admin alerts routes
 * These routes allow admins to create, manage, and analyze alerts
 */

/**
 * GET /api/admin/alerts
 * Get all alerts with filtering and pagination (admin only)
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const filters = {
      alertType: req.query.alert_type,
      priority: req.query.priority,
      targetType: req.query.target_type,
      status: req.query.status,
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key] === undefined) {
        delete filters[key];
      }
    });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await req.app.locals.alertService.getAdminAlerts(filters, page, limit);

    res.json({
      success: true,
      data: result.alerts,
      pagination: result.pagination,
      filters: filters,
    });
  } catch (error) {
    logger.error('Failed to get admin alerts', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to retrieve alerts',
      message: 'An error occurred while fetching alerts.',
    });
  }
});

/**
 * POST /api/admin/alerts
 * Create a new alert (admin only)
 */
router.post('/', adminAuth, async (req, res) => {
  try {
    const adminId = req.admin.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const {
      title,
      message,
      alertType,
      priority,
      targetType,
      targetUserIds,
      targetRoles,
      actionUrl,
      actionText,
      icon,
      startsAt,
      expiresAt,
      isDismissible,
    } = req.body;

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title and message are required.',
        details: {
          title: !title ? 'Title is required' : null,
          message: !message ? 'Message is required' : null,
        },
      });
    }

    const alertData = {
      title: title.trim(),
      message: message.trim(),
      alertType: alertType || 'info',
      priority: priority || 'normal',
      targetType: targetType || 'all',
      targetUserIds: targetUserIds || null,
      targetRoles: targetRoles || null,
      actionUrl: actionUrl || null,
      actionText: actionText || null,
      icon: icon || null,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isDismissible: isDismissible !== false, // Default to true
      createdBy: adminId,
    };

    const createdAlert = await req.app.locals.alertService.createAlert(alertData);

    res.status(201).json({
      success: true,
      data: createdAlert,
      message: 'Alert created successfully',
    });
  } catch (error) {
    logger.error('Failed to create alert', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to create alert',
      message: error.message.includes('required')
        ? error.message
        : 'An error occurred while creating the alert.',
    });
  }
});

/**
 * PUT /api/admin/alerts/:id
 * Update an existing alert (admin only)
 */
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const alertId = req.params.id;
    const adminId = req.admin.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const updateData = {};
    const allowedFields = [
      'title',
      'message',
      'alertType',
      'priority',
      'targetType',
      'targetUserIds',
      'targetRoles',
      'actionUrl',
      'actionText',
      'icon',
      'startsAt',
      'expiresAt',
      'isActive',
      'isDismissible',
    ];

    // Filter and validate update data
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        // Convert camelCase to snake_case for database
        const dbField = field.replace(/([A-Z])/g, '_$1').toLowerCase();
        updateData[dbField] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        message: 'Please provide at least one valid field to update.',
      });
    }

    const updatedAlert = await req.app.locals.alertService.updateAlert(
      alertId,
      updateData,
      adminId
    );

    res.json({
      success: true,
      data: updatedAlert,
      message: 'Alert updated successfully',
    });
  } catch (error) {
    logger.error('Failed to update alert', {
      error: error.message,
      alertId: req.params.id,
      adminId: req.admin?.id,
    });
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to update alert',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/admin/alerts/:id
 * Delete an alert (admin only)
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const alertId = req.params.id;
    const adminId = req.admin.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const success = await req.app.locals.alertService.deleteAlert(alertId, adminId);

    if (success) {
      res.json({
        success: true,
        message: 'Alert deleted successfully',
      });
    } else {
      res.status(404).json({
        error: 'Alert not found',
        message: 'The requested alert was not found.',
      });
    }
  } catch (error) {
    logger.error('Failed to delete alert', {
      error: error.message,
      alertId: req.params.id,
      adminId: req.admin?.id,
    });
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to delete alert',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/alerts/:id
 * Get a specific alert with full details (admin only)
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const alertId = req.params.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const alert = await req.app.locals.alertService.getAlert(alertId);

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    logger.error('Failed to get alert', {
      error: error.message,
      alertId: req.params.id,
      adminId: req.admin?.id,
    });
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to retrieve alert',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/alerts/:id/analytics
 * Get analytics for a specific alert (admin only)
 */
router.get('/:id/analytics', adminAuth, async (req, res) => {
  try {
    const alertId = req.params.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const analytics = await req.app.locals.alertService.getAlertAnalytics(alertId);

    if (!analytics) {
      return res.status(404).json({
        error: 'Analytics not found',
        message: 'Analytics data for this alert was not found.',
      });
    }

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get alert analytics', {
      error: error.message,
      alertId: req.params.id,
      adminId: req.admin?.id,
    });
    res.status(500).json({
      error: 'Failed to retrieve analytics',
      message: 'An error occurred while fetching alert analytics.',
    });
  }
});

/**
 * GET /api/admin/alerts/analytics/summary
 * Get overall alert system analytics (admin only)
 */
router.get('/analytics/summary', adminAuth, async (req, res) => {
  try {
    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const analytics = await req.app.locals.alertService.getAlertAnalytics();

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    logger.error('Failed to get alert analytics summary', {
      error: error.message,
      adminId: req.admin?.id,
    });
    res.status(500).json({
      error: 'Failed to retrieve analytics',
      message: 'An error occurred while fetching alert analytics.',
    });
  }
});

/**
 * GET /api/admin/alerts/templates
 * Get alert templates (admin only)
 */
router.get('/templates', adminAuth, async (req, res) => {
  try {
    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const templates = await req.app.locals.alertService.getAlertTemplates();

    res.json({
      success: true,
      data: templates,
      count: templates.length,
    });
  } catch (error) {
    logger.error('Failed to get alert templates', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to retrieve templates',
      message: 'An error occurred while fetching alert templates.',
    });
  }
});

/**
 * POST /api/admin/alerts/from-template
 * Create alert from template (admin only)
 */
router.post('/from-template', adminAuth, async (req, res) => {
  try {
    const adminId = req.admin.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const { templateId, variables, overrides } = req.body;

    if (!templateId) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Template ID is required.',
      });
    }

    const createdAlert = await req.app.locals.alertService.createAlertFromTemplate(
      templateId,
      variables || {},
      overrides || {},
      adminId
    );

    res.status(201).json({
      success: true,
      data: createdAlert,
      message: 'Alert created from template successfully',
    });
  } catch (error) {
    logger.error('Failed to create alert from template', {
      error: error.message,
      adminId: req.admin?.id,
      templateId: req.body?.templateId,
    });
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: 'Failed to create alert from template',
      message: error.message,
    });
  }
});

/**
 * POST /api/admin/alerts/broadcast
 * Broadcast immediate alert to all users (admin only)
 */
router.post('/broadcast', adminAuth, async (req, res) => {
  try {
    const adminId = req.admin.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const { title, message, alertType, priority, actionUrl, actionText, icon } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title and message are required for broadcast alerts.',
      });
    }

    const alertData = {
      title: title.trim(),
      message: message.trim(),
      alertType: alertType || 'announcement',
      priority: priority || 'high',
      targetType: 'all',
      actionUrl: actionUrl || null,
      actionText: actionText || null,
      icon: icon || 'megaphone',
      startsAt: new Date(),
      expiresAt: null,
      createdBy: adminId,
    };

    const createdAlert = await req.app.locals.alertService.createAlert(alertData);

    res.status(201).json({
      success: true,
      data: createdAlert,
      message: 'Broadcast alert sent successfully',
    });
  } catch (error) {
    logger.error('Failed to broadcast alert', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to broadcast alert',
      message: 'An error occurred while broadcasting the alert.',
    });
  }
});

/**
 * POST /api/admin/alerts/targeted
 * Send targeted alert to specific users (admin only)
 */
router.post('/targeted', adminAuth, async (req, res) => {
  try {
    const adminId = req.admin.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const {
      title,
      message,
      alertType,
      priority,
      targetUserIds,
      actionUrl,
      actionText,
      icon,
      startsAt,
      expiresAt,
    } = req.body;

    if (
      !title ||
      !message ||
      !targetUserIds ||
      !Array.isArray(targetUserIds) ||
      targetUserIds.length === 0
    ) {
      return res.status(400).json({
        error: 'Validation error',
        message: 'Title, message, and target user IDs are required.',
        details: {
          title: !title ? 'Title is required' : null,
          message: !message ? 'Message is required' : null,
          targetUserIds:
            !targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0
              ? 'At least one target user ID is required'
              : null,
        },
      });
    }

    const alertData = {
      title: title.trim(),
      message: message.trim(),
      alertType: alertType || 'info',
      priority: priority || 'normal',
      targetType: 'specific',
      targetUserIds,
      actionUrl: actionUrl || null,
      actionText: actionText || null,
      icon: icon || null,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: adminId,
    };

    const createdAlert = await req.app.locals.alertService.createAlert(alertData);

    res.status(201).json({
      success: true,
      data: createdAlert,
      message: `Targeted alert sent to ${targetUserIds.length} users successfully`,
    });
  } catch (error) {
    logger.error('Failed to send targeted alert', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to send targeted alert',
      message: 'An error occurred while sending the targeted alert.',
    });
  }
});

/**
 * GET /api/admin/alerts/users/search
 * Search users for targeting (admin only)
 */
router.get('/users/search', adminAuth, async (req, res) => {
  try {
    const searchTerm = req.query.q;
    const limit = parseInt(req.query.limit) || 10;

    if (!searchTerm || searchTerm.trim().length < 2) {
      return res.status(400).json({
        error: 'Invalid search term',
        message: 'Search term must be at least 2 characters long.',
      });
    }

    const query = `
      SELECT id, name, email, avatar_url, is_active, created_at
      FROM users
      WHERE (
        name ILIKE $1 OR
        email ILIKE $1
      )
      AND is_active = TRUE
      ORDER BY name ASC
      LIMIT $2
    `;

    const searchPattern = `%${searchTerm.trim()}%`;
    const result = await req.app.locals.database.query(query, [searchPattern, limit]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      searchTerm,
    });
  } catch (error) {
    logger.error('Failed to search users', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to search users',
      message: 'An error occurred while searching for users.',
    });
  }
});

/**
 * DELETE /api/admin/alerts/cleanup
 * Clean up expired alerts (admin only)
 */
router.delete('/cleanup', adminAuth, async (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 30;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const result = await req.app.locals.alertService.cleanupExpiredAlerts(daysToKeep);

    res.json({
      success: true,
      data: result,
      message: `Cleanup completed. ${result.deletedCount} expired alerts removed.`,
    });
  } catch (error) {
    logger.error('Failed to cleanup alerts', { error: error.message, adminId: req.admin?.id });
    res.status(500).json({
      error: 'Failed to cleanup alerts',
      message: 'An error occurred while cleaning up expired alerts.',
    });
  }
});

export default router;
