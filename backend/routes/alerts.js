import express from 'express';
import { logger } from '../config/logger.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * User-facing alerts routes
 * These routes allow regular users to view and interact with their alerts
 */

/**
 * GET /api/alerts
 * Get alerts for the authenticated user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const includeRead = req.query.include_read === 'true';

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const alerts = await req.app.locals.alertService.getUserAlerts(userId, includeRead);

    res.json({
      success: true,
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    logger.error('Failed to get user alerts', { error: error.message, userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to retrieve alerts',
      message: 'An error occurred while fetching your alerts.',
    });
  }
});

/**
 * GET /api/alerts/count
 * Get unread alert count for the authenticated user
 */
router.get('/count', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.app.locals.alertService) {
      return res.json({
        success: true,
        data: { unreadCount: 0 },
      });
    }

    const unreadCount = await req.app.locals.alertService.getUnreadAlertCount(userId);

    res.json({
      success: true,
      data: { unreadCount },
    });
  } catch (error) {
    logger.error('Failed to get unread alert count', {
      error: error.message,
      userId: req.user?.id,
    });
    res.status(500).json({
      error: 'Failed to get alert count',
      message: 'An error occurred while fetching your alert count.',
    });
  }
});

/**
 * PUT /api/alerts/:id/read
 * Mark an alert as read for the authenticated user
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const success = await req.app.locals.alertService.markAlertAsRead(alertId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Alert marked as read',
      });
    } else {
      res.status(400).json({
        error: 'Failed to mark alert as read',
        message:
          'The alert could not be marked as read. It may not exist or may not be accessible to you.',
      });
    }
  } catch (error) {
    logger.error('Failed to mark alert as read', {
      error: error.message,
      alertId: req.params.id,
      userId: req.user?.id,
    });
    res.status(500).json({
      error: 'Failed to mark alert as read',
      message: 'An error occurred while updating the alert.',
    });
  }
});

/**
 * PUT /api/alerts/:id/dismiss
 * Dismiss an alert for the authenticated user
 */
router.put('/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    const success = await req.app.locals.alertService.dismissAlert(alertId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Alert dismissed',
      });
    } else {
      res.status(400).json({
        error: 'Failed to dismiss alert',
        message:
          'The alert could not be dismissed. It may not exist or may not be accessible to you.',
      });
    }
  } catch (error) {
    logger.error('Failed to dismiss alert', {
      error: error.message,
      alertId: req.params.id,
      userId: req.user?.id,
    });
    res.status(500).json({
      error: 'Failed to dismiss alert',
      message: 'An error occurred while dismissing the alert.',
    });
  }
});

/**
 * GET /api/alerts/:id
 * Get a specific alert for the authenticated user
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user.id;

    if (!req.app.locals.alertService) {
      return res.status(503).json({
        error: 'Alert service not available',
        message: 'The alert service is currently unavailable. Please try again later.',
      });
    }

    // Get user's alerts to ensure they have access to this specific alert
    const userAlerts = await req.app.locals.alertService.getUserAlerts(userId, true);
    const alert = userAlerts.find(a => a.id === alertId);

    if (!alert) {
      return res.status(404).json({
        error: 'Alert not found',
        message: 'The requested alert was not found or is not accessible to you.',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    logger.error('Failed to get alert', {
      error: error.message,
      alertId: req.params.id,
      userId: req.user?.id,
    });
    res.status(500).json({
      error: 'Failed to retrieve alert',
      message: 'An error occurred while fetching the alert.',
    });
  }
});

export default router;
