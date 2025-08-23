import { logger } from '../config/logger.js';

/**
 * Alert-specific WebSocket handlers
 * Manages real-time alert delivery and user interactions
 */

/**
 * Setup alert-related WebSocket event handlers
 * @param {Object} socket - Socket.io socket instance
 * @param {Object} alertService - Alert service instance
 */
export const setupAlertHandlers = (socket, alertService) => {
  const userId = socket.userId;
  const userEmail = socket.userEmail;

  // Join user to their personal alert room
  socket.join(`alerts_${userId}`);

  /**
   * Handle request for user's alerts
   */
  socket.on('get_alerts', async data => {
    try {
      const { includeRead = false } = data || {};

      if (!alertService) {
        socket.emit('alerts_error', {
          message: 'Alert service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      const alerts = await alertService.getUserAlerts(userId, includeRead);
      const unreadCount = await alertService.getUnreadAlertCount(userId);

      socket.emit('alerts_loaded', {
        alerts,
        unreadCount,
        timestamp: new Date(),
      });

      logger.info('Alerts loaded for user', { userId, alertCount: alerts.length, unreadCount });
    } catch (error) {
      logger.error('Failed to load alerts via WebSocket', { error: error.message, userId });
      socket.emit('alerts_error', {
        message: 'Failed to load alerts',
        code: 'LOAD_ERROR',
      });
    }
  });

  /**
   * Handle request for unread alert count
   */
  socket.on('get_alert_count', async () => {
    try {
      if (!alertService) {
        socket.emit('alert_count_updated', { unreadCount: 0 });
        return;
      }

      const unreadCount = await alertService.getUnreadAlertCount(userId);

      socket.emit('alert_count_updated', {
        unreadCount,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to get alert count via WebSocket', { error: error.message, userId });
      socket.emit('alert_count_updated', { unreadCount: 0 });
    }
  });

  /**
   * Handle marking alert as read
   */
  socket.on('mark_alert_read', async data => {
    try {
      const { alertId } = data;

      if (!alertId) {
        socket.emit('alert_action_error', {
          message: 'Alert ID is required',
          code: 'MISSING_ALERT_ID',
        });
        return;
      }

      if (!alertService) {
        socket.emit('alert_action_error', {
          message: 'Alert service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      const success = await alertService.markAlertAsRead(alertId, userId);

      if (success) {
        const unreadCount = await alertService.getUnreadAlertCount(userId);

        socket.emit('alert_marked_read', {
          alertId,
          unreadCount,
          timestamp: new Date(),
        });

        // Update alert count for the user
        socket.emit('alert_count_updated', {
          unreadCount,
          timestamp: new Date(),
        });

        logger.info('Alert marked as read via WebSocket', { alertId, userId });
      } else {
        socket.emit('alert_action_error', {
          message: 'Failed to mark alert as read',
          code: 'MARK_READ_FAILED',
        });
      }
    } catch (error) {
      logger.error('Failed to mark alert as read via WebSocket', {
        error: error.message,
        userId,
        alertId: data?.alertId,
      });
      socket.emit('alert_action_error', {
        message: 'Failed to mark alert as read',
        code: 'MARK_READ_ERROR',
      });
    }
  });

  /**
   * Handle dismissing alert
   */
  socket.on('dismiss_alert', async data => {
    try {
      const { alertId } = data;

      if (!alertId) {
        socket.emit('alert_action_error', {
          message: 'Alert ID is required',
          code: 'MISSING_ALERT_ID',
        });
        return;
      }

      if (!alertService) {
        socket.emit('alert_action_error', {
          message: 'Alert service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      const success = await alertService.dismissAlert(alertId, userId);

      if (success) {
        const unreadCount = await alertService.getUnreadAlertCount(userId);

        socket.emit('alert_dismissed', {
          alertId,
          unreadCount,
          timestamp: new Date(),
        });

        // Update alert count for the user
        socket.emit('alert_count_updated', {
          unreadCount,
          timestamp: new Date(),
        });

        logger.info('Alert dismissed via WebSocket', { alertId, userId });
      } else {
        socket.emit('alert_action_error', {
          message: 'Failed to dismiss alert',
          code: 'DISMISS_FAILED',
        });
      }
    } catch (error) {
      logger.error('Failed to dismiss alert via WebSocket', {
        error: error.message,
        userId,
        alertId: data?.alertId,
      });
      socket.emit('alert_action_error', {
        message: 'Failed to dismiss alert',
        code: 'DISMISS_ERROR',
      });
    }
  });

  /**
   * Handle request to refresh alerts
   */
  socket.on('refresh_alerts', async () => {
    try {
      if (!alertService) {
        socket.emit('alerts_error', {
          message: 'Alert service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      const alerts = await alertService.getUserAlerts(userId, false);
      const unreadCount = await alertService.getUnreadAlertCount(userId);

      socket.emit('alerts_refreshed', {
        alerts,
        unreadCount,
        timestamp: new Date(),
      });

      logger.info('Alerts refreshed for user', { userId, alertCount: alerts.length });
    } catch (error) {
      logger.error('Failed to refresh alerts via WebSocket', { error: error.message, userId });
      socket.emit('alerts_error', {
        message: 'Failed to refresh alerts',
        code: 'REFRESH_ERROR',
      });
    }
  });

  logger.info('Alert WebSocket handlers setup for user', { userId, userEmail });
};

/**
 * Broadcast alert to specific user
 * @param {Object} io - Socket.io server instance
 * @param {string} userId - Target user ID
 * @param {Object} alert - Alert object
 */
export const broadcastAlertToUser = (io, userId, alert) => {
  if (!io) {
    logger.warn('WebSocket server not available for alert broadcasting');
    return;
  }

  try {
    const alertPayload = {
      id: alert.id,
      title: alert.title,
      message: alert.message,
      alertType: alert.alert_type,
      priority: alert.priority,
      actionUrl: alert.action_url,
      actionText: alert.action_text,
      icon: alert.icon,
      isDismissible: alert.is_dismissible,
      createdAt: alert.created_at,
    };

    // Send to user's personal alert room
    io.to(`alerts_${userId}`).emit('new_alert', alertPayload);

    // Also send to user's general room for backward compatibility
    io.to(`user_${userId}`).emit('new_alert', alertPayload);

    logger.info('Alert broadcasted to user', { alertId: alert.id, userId });
  } catch (error) {
    logger.error('Failed to broadcast alert to user', {
      error: error.message,
      alertId: alert.id,
      userId,
    });
  }
};

/**
 * Broadcast alert update to specific user
 * @param {Object} io - Socket.io server instance
 * @param {string} userId - Target user ID
 * @param {Object} alertUpdate - Alert update data
 */
export const broadcastAlertUpdateToUser = (io, userId, alertUpdate) => {
  if (!io) {
    logger.warn('WebSocket server not available for alert update broadcasting');
    return;
  }

  try {
    // Send to user's personal alert room
    io.to(`alerts_${userId}`).emit('alert_updated', alertUpdate);

    // Also send to user's general room
    io.to(`user_${userId}`).emit('alert_updated', alertUpdate);

    logger.info('Alert update broadcasted to user', {
      alertId: alertUpdate.alertId,
      userId,
      action: alertUpdate.action,
    });
  } catch (error) {
    logger.error('Failed to broadcast alert update to user', { error: error.message, userId });
  }
};

/**
 * Broadcast alert deletion to specific user
 * @param {Object} io - Socket.io server instance
 * @param {string} userId - Target user ID
 * @param {string} alertId - Alert ID that was deleted
 */
export const broadcastAlertDeletionToUser = (io, userId, alertId) => {
  if (!io) {
    logger.warn('WebSocket server not available for alert deletion broadcasting');
    return;
  }

  try {
    const deletionPayload = {
      alertId,
      timestamp: new Date(),
    };

    // Send to user's personal alert room
    io.to(`alerts_${userId}`).emit('alert_deleted', deletionPayload);

    // Also send to user's general room
    io.to(`user_${userId}`).emit('alert_deleted', deletionPayload);

    logger.info('Alert deletion broadcasted to user', { alertId, userId });
  } catch (error) {
    logger.error('Failed to broadcast alert deletion to user', {
      error: error.message,
      alertId,
      userId,
    });
  }
};

/**
 * Broadcast alert count update to user
 * @param {Object} io - Socket.io server instance
 * @param {string} userId - Target user ID
 * @param {number} unreadCount - New unread count
 */
export const broadcastAlertCountToUser = (io, userId, unreadCount) => {
  if (!io) return;

  try {
    const countPayload = {
      unreadCount,
      timestamp: new Date(),
    };

    // Send to user's personal alert room
    io.to(`alerts_${userId}`).emit('alert_count_updated', countPayload);

    // Also send to user's general room
    io.to(`user_${userId}`).emit('alert_count_updated', countPayload);
  } catch (error) {
    logger.error('Failed to broadcast alert count to user', { error: error.message, userId });
  }
};

/**
 * Setup alert handlers for admin users
 * @param {Object} socket - Socket.io socket instance for admin
 * @param {Object} alertService - Alert service instance
 */
export const setupAdminAlertHandlers = (socket, alertService) => {
  const adminId = socket.adminId;
  const adminEmail = socket.adminEmail;

  // Join admin to alert management room
  socket.join(`admin_alerts`);

  /**
   * Handle admin request for alert overview
   */
  socket.on('get_admin_alerts', async data => {
    try {
      const { filters = {}, page = 1, limit = 20 } = data || {};

      if (!alertService) {
        socket.emit('admin_alerts_error', {
          message: 'Alert service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      const result = await alertService.getAdminAlerts(filters, page, limit);

      socket.emit('admin_alerts_loaded', {
        alerts: result.alerts,
        pagination: result.pagination,
        filters,
        timestamp: new Date(),
      });

      logger.info('Admin alerts loaded', { adminId, alertCount: result.alerts.length });
    } catch (error) {
      logger.error('Failed to load admin alerts via WebSocket', { error: error.message, adminId });
      socket.emit('admin_alerts_error', {
        message: 'Failed to load alerts',
        code: 'LOAD_ERROR',
      });
    }
  });

  /**
   * Handle admin request for alert analytics
   */
  socket.on('get_alert_analytics', async data => {
    try {
      const { alertId } = data || {};

      if (!alertService) {
        socket.emit('alert_analytics_error', {
          message: 'Alert service not available',
          code: 'SERVICE_UNAVAILABLE',
        });
        return;
      }

      const analytics = await alertService.getAlertAnalytics(alertId);

      socket.emit('alert_analytics_loaded', {
        analytics,
        alertId,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.error('Failed to load alert analytics via WebSocket', {
        error: error.message,
        adminId,
      });
      socket.emit('alert_analytics_error', {
        message: 'Failed to load analytics',
        code: 'ANALYTICS_ERROR',
      });
    }
  });

  logger.info('Admin alert WebSocket handlers setup', { adminId, adminEmail });
};

/**
 * Broadcast new alert notification to all admins
 * @param {Object} io - Socket.io server instance
 * @param {Object} alert - Alert object
 */
export const broadcastToAdmins = (io, alert) => {
  if (!io) return;

  try {
    const adminNotification = {
      type: 'alert_created',
      alert: {
        id: alert.id,
        title: alert.title,
        targetType: alert.target_type,
        priority: alert.priority,
        createdAt: alert.created_at,
      },
      timestamp: new Date(),
    };

    io.to('admin_alerts').emit('admin_notification', adminNotification);

    logger.info('Alert creation notification sent to admins', { alertId: alert.id });
  } catch (error) {
    logger.error('Failed to broadcast to admins', { error: error.message, alertId: alert.id });
  }
};

/**
 * Enhanced WebSocket manager for alerts
 */
export class AlertWebSocketManager {
  constructor(io, alertService) {
    this.io = io;
    this.alertService = alertService;
  }

  /**
   * Emit alert to specific user
   * @param {string} userId - Target user ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToUser(userId, event, data) {
    if (!this.io) return;

    try {
      // Send to user's personal room
      this.io.to(`user_${userId}`).emit(event, data);

      // Also send to alert-specific room
      this.io.to(`alerts_${userId}`).emit(event, data);
    } catch (error) {
      logger.error('Failed to emit to user', { error: error.message, userId, event });
    }
  }

  /**
   * Emit to all connected users
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToAll(event, data) {
    if (!this.io) return;

    try {
      this.io.emit(event, data);
    } catch (error) {
      logger.error('Failed to emit to all users', { error: error.message, event });
    }
  }

  /**
   * Emit to all admin users
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToAdmins(event, data) {
    if (!this.io) return;

    try {
      this.io.to('admin_alerts').emit(event, data);
    } catch (error) {
      logger.error('Failed to emit to admins', { error: error.message, event });
    }
  }

  /**
   * Get connected user count
   * @returns {Promise<number>} Number of connected users
   */
  async getConnectedUserCount() {
    try {
      if (!this.io) return 0;

      const sockets = await this.io.fetchSockets();
      return sockets.length;
    } catch (error) {
      logger.error('Failed to get connected user count', { error: error.message });
      return 0;
    }
  }

  /**
   * Check if user is connected
   * @param {string} userId - User ID to check
   * @returns {Promise<boolean>} Whether user is connected
   */
  async isUserConnected(userId) {
    try {
      if (!this.io) return false;

      const socketsInRoom = await this.io.in(`user_${userId}`).fetchSockets();
      return socketsInRoom.length > 0;
    } catch (error) {
      logger.error('Failed to check user connection', { error: error.message, userId });
      return false;
    }
  }

  /**
   * Deliver alert to user with delivery confirmation
   * @param {string} userId - Target user ID
   * @param {Object} alert - Alert object
   * @returns {Promise<boolean>} Whether alert was delivered
   */
  async deliverAlert(userId, alert) {
    try {
      const isConnected = await this.isUserConnected(userId);

      if (isConnected) {
        this.emitToUser(userId, 'new_alert', {
          id: alert.id,
          title: alert.title,
          message: alert.message,
          alertType: alert.alert_type,
          priority: alert.priority,
          actionUrl: alert.action_url,
          actionText: alert.action_text,
          icon: alert.icon,
          isDismissible: alert.is_dismissible,
          createdAt: alert.created_at,
        });

        // Also update the alert count
        const unreadCount = await this.alertService.getUnreadAlertCount(userId);
        this.emitToUser(userId, 'alert_count_updated', {
          unreadCount,
          timestamp: new Date(),
        });

        return true;
      }

      return false; // User not connected
    } catch (error) {
      logger.error('Failed to deliver alert', { error: error.message, userId, alertId: alert.id });
      return false;
    }
  }

  /**
   * Bulk deliver alerts to multiple users
   * @param {Array} userIds - Array of user IDs
   * @param {Object} alert - Alert object
   * @returns {Promise<Object>} Delivery results
   */
  async bulkDeliverAlert(userIds, alert) {
    const results = {
      delivered: 0,
      failed: 0,
      offline: 0,
    };

    try {
      for (const userId of userIds) {
        const delivered = await this.deliverAlert(userId, alert);
        if (delivered) {
          results.delivered++;
        } else {
          results.offline++;
        }
      }

      logger.info('Bulk alert delivery completed', {
        alertId: alert.id,
        totalUsers: userIds.length,
        results,
      });
    } catch (error) {
      logger.error('Failed bulk alert delivery', { error: error.message, alertId: alert.id });
      results.failed = userIds.length - results.delivered - results.offline;
    }

    return results;
  }
}

export default {
  setupAlertHandlers,
  setupAdminAlertHandlers,
  broadcastAlertToUser,
  broadcastAlertUpdateToUser,
  broadcastAlertDeletionToUser,
  broadcastAlertCountToUser,
  broadcastToAdmins,
  AlertWebSocketManager,
};
