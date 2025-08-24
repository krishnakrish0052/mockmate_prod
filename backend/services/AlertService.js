import { logger } from '../config/logger.js';

/**
 * AlertService - Manages alerts and notifications for the MockMate platform
 * Handles creating, updating, delivering, and tracking alerts for both users and admins
 */
export class AlertService {
  constructor(database, socketManager = null) {
    this.db = database;
    this.socketManager = socketManager;
  }

  /**
   * Create a new alert
   * @param {Object} alertData - Alert configuration
   * @param {string} alertData.title - Alert title
   * @param {string} alertData.message - Alert message
   * @param {string} alertData.alertType - Type of alert (info, warning, error, success, announcement)
   * @param {string} alertData.priority - Priority level (low, normal, high, critical)
   * @param {string} alertData.targetType - Target type (all, specific, role, admin)
   * @param {Array} alertData.targetUserIds - Array of specific user IDs (optional)
   * @param {Array} alertData.targetRoles - Array of roles (optional)
   * @param {string} alertData.actionUrl - Optional action URL
   * @param {string} alertData.actionText - Optional action button text
   * @param {string} alertData.icon - Optional icon identifier
   * @param {Date} alertData.startsAt - When alert becomes active
   * @param {Date} alertData.expiresAt - When alert expires
   * @param {string} alertData.createdBy - Admin user ID who created the alert
   * @returns {Promise<Object>} Created alert object
   */
  async createAlert(alertData) {
    try {
      const {
        title,
        message,
        alertType = 'info',
        priority = 'normal',
        targetType = 'all',
        targetUserIds = null,
        targetRoles = null,
        actionUrl = null,
        actionText = null,
        icon = null,
        startsAt = new Date(),
        expiresAt = null,
        createdBy,
      } = alertData;

      // Validate required fields
      if (!title || !message || !createdBy) {
        throw new Error('Title, message, and createdBy are required');
      }

      // Create alert using database function
      const alertQuery = `
        SELECT create_and_deliver_alert(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) as alert_id
      `;

      const result = await this.db.query(alertQuery, [
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
        createdBy,
      ]);

      const alertId = result.rows[0].alert_id;

      // Get the created alert with full details
      const createdAlert = await this.getAlert(alertId);

      // Emit real-time notifications via WebSocket
      await this.broadcastAlert(createdAlert);

      logger.info('Alert created successfully', {
        alertId,
        title,
        targetType,
        createdBy,
      });

      return createdAlert;
    } catch (error) {
      logger.error('Failed to create alert', { error: error.message, alertData });
      throw new Error(`Failed to create alert: ${error.message}`);
    }
  }

  /**
   * Get alerts for a specific user
   * @param {string} userId - User ID
   * @param {boolean} includeRead - Whether to include already read alerts
   * @returns {Promise<Array>} Array of user alerts
   */
  async getUserAlerts(userId, includeRead = false) {
    try {
      const query = `SELECT * FROM get_user_alerts($1, $2)`;
      const result = await this.db.query(query, [userId, includeRead]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get user alerts', { error: error.message, userId });
      throw new Error(`Failed to get user alerts: ${error.message}`);
    }
  }

  /**
   * Get alert by ID
   * @param {string} alertId - Alert ID
   * @returns {Promise<Object>} Alert object
   */
  async getAlert(alertId) {
    try {
      const query = `
        SELECT a.*, COALESCE(au.name, au.username) as created_by_name
        FROM alerts a
        LEFT JOIN admin_users au ON a.created_by = au.id
        WHERE a.id = $1
      `;
      const result = await this.db.query(query, [alertId]);

      if (result.rows.length === 0) {
        throw new Error('Alert not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get alert', { error: error.message, alertId });
      throw new Error(`Failed to get alert: ${error.message}`);
    }
  }

  /**
   * Get all alerts for admin dashboard
   * @param {Object} filters - Filter options
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Paginated alerts with analytics
   */
  async getAdminAlerts(filters = {}, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      // Build dynamic where conditions based on filters
      if (filters.alertType) {
        whereConditions.push(`alert_type = $${paramIndex}`);
        queryParams.push(filters.alertType);
        paramIndex++;
      }

      if (filters.priority) {
        whereConditions.push(`priority = $${paramIndex}`);
        queryParams.push(filters.priority);
        paramIndex++;
      }

      if (filters.targetType) {
        whereConditions.push(`target_type = $${paramIndex}`);
        queryParams.push(filters.targetType);
        paramIndex++;
      }

      if (filters.status) {
        if (filters.status === 'active') {
          whereConditions.push(
            `is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) AND starts_at <= NOW()`
          );
        } else if (filters.status === 'expired') {
          whereConditions.push(`expires_at IS NOT NULL AND expires_at <= NOW()`);
        } else if (filters.status === 'scheduled') {
          whereConditions.push(`starts_at > NOW()`);
        } else if (filters.status === 'inactive') {
          whereConditions.push(`is_active = FALSE`);
        }
      }

      const whereClause =
        whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM admin_alert_overview
        ${whereClause}
      `;
      queryParams.push(limit, offset);

      const countResult = await this.db.query(countQuery, queryParams.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0].total);

      // Get paginated results
      const alertsQuery = `
        SELECT *
        FROM admin_alert_overview
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const alertsResult = await this.db.query(alertsQuery, queryParams);

      return {
        alerts: alertsResult.rows,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1,
        },
      };
    } catch (error) {
      logger.error('Failed to get admin alerts', { error: error.message, filters });
      throw new Error(`Failed to get admin alerts: ${error.message}`);
    }
  }

  /**
   * Mark alert as read for a user
   * @param {string} alertId - Alert ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async markAlertAsRead(alertId, userId) {
    try {
      const query = `SELECT mark_alert_as_read($1, $2) as success`;
      const result = await this.db.query(query, [alertId, userId]);

      const success = result.rows[0].success;

      if (success) {
        // Emit real-time update
        if (this.socketManager) {
          this.socketManager.emitToUser(userId, 'alert_updated', {
            alertId,
            action: 'read',
            timestamp: new Date(),
          });
        }
      }

      return success;
    } catch (error) {
      logger.error('Failed to mark alert as read', { error: error.message, alertId, userId });
      throw new Error(`Failed to mark alert as read: ${error.message}`);
    }
  }

  /**
   * Dismiss alert for a user
   * @param {string} alertId - Alert ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async dismissAlert(alertId, userId) {
    try {
      const query = `SELECT dismiss_alert($1, $2) as success`;
      const result = await this.db.query(query, [alertId, userId]);

      const success = result.rows[0].success;

      if (success) {
        // Emit real-time update
        if (this.socketManager) {
          this.socketManager.emitToUser(userId, 'alert_updated', {
            alertId,
            action: 'dismissed',
            timestamp: new Date(),
          });
        }
      }

      return success;
    } catch (error) {
      logger.error('Failed to dismiss alert', { error: error.message, alertId, userId });
      throw new Error(`Failed to dismiss alert: ${error.message}`);
    }
  }

  /**
   * Update an existing alert
   * @param {string} alertId - Alert ID
   * @param {Object} updateData - Fields to update
   * @param {string} updatedBy - Admin user ID making the update
   * @returns {Promise<Object>} Updated alert object
   */
  async updateAlert(alertId, updateData, updatedBy) {
    try {
      const allowedFields = [
        'title',
        'message',
        'alert_type',
        'priority',
        'target_type',
        'target_user_ids',
        'target_roles',
        'action_url',
        'action_text',
        'icon',
        'starts_at',
        'expires_at',
        'is_active',
        'is_dismissible',
      ];

      const updates = [];
      const values = [];
      let paramIndex = 1;

      Object.keys(updateData).forEach(field => {
        if (allowedFields.includes(field)) {
          updates.push(`${field} = $${paramIndex}`);
          values.push(updateData[field]);
          paramIndex++;
        }
      });

      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      updates.push(`updated_at = NOW()`);
      updates.push(`updated_by = $${paramIndex}`);
      values.push(updatedBy);
      values.push(alertId);

      const query = `
        UPDATE alerts 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Alert not found');
      }

      const updatedAlert = result.rows[0];

      // Broadcast update to affected users
      await this.broadcastAlertUpdate(updatedAlert);

      logger.info('Alert updated successfully', { alertId, updatedBy });

      return updatedAlert;
    } catch (error) {
      logger.error('Failed to update alert', { error: error.message, alertId, updateData });
      throw new Error(`Failed to update alert: ${error.message}`);
    }
  }

  /**
   * Delete an alert
   * @param {string} alertId - Alert ID
   * @param {string} deletedBy - Admin user ID deleting the alert
   * @returns {Promise<boolean>} Success status
   */
  async deleteAlert(alertId, deletedBy) {
    try {
      // Get alert details before deletion for broadcasting
      const alert = await this.getAlert(alertId);

      const query = `DELETE FROM alerts WHERE id = $1`;
      const result = await this.db.query(query, [alertId]);

      if (result.rowCount === 0) {
        throw new Error('Alert not found');
      }

      // Broadcast deletion to affected users
      await this.broadcastAlertDeletion(alert);

      logger.info('Alert deleted successfully', { alertId, deletedBy });

      return true;
    } catch (error) {
      logger.error('Failed to delete alert', { error: error.message, alertId });
      throw new Error(`Failed to delete alert: ${error.message}`);
    }
  }

  /**
   * Get alert templates
   * @returns {Promise<Array>} Array of alert templates
   */
  async getAlertTemplates() {
    try {
      const query = `
        SELECT at.*, COALESCE(au.name, au.username) as created_by_name
        FROM alert_templates at
        LEFT JOIN admin_users au ON at.created_by = au.id
        WHERE at.is_active = TRUE
        ORDER BY at.name
      `;
      const result = await this.db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get alert templates', { error: error.message });
      throw new Error(`Failed to get alert templates: ${error.message}`);
    }
  }

  /**
   * Create alert from template
   * @param {string} templateId - Template ID
   * @param {Object} variables - Variables to replace in template
   * @param {Object} overrides - Override template settings
   * @param {string} createdBy - Admin user ID
   * @returns {Promise<Object>} Created alert object
   */
  async createAlertFromTemplate(templateId, variables = {}, overrides = {}, createdBy) {
    try {
      // Get template
      const templateQuery = `SELECT * FROM alert_templates WHERE id = $1 AND is_active = TRUE`;
      const templateResult = await this.db.query(templateQuery, [templateId]);

      if (templateResult.rows.length === 0) {
        throw new Error('Alert template not found');
      }

      const template = templateResult.rows[0];

      // Replace variables in title and message
      let title = template.title_template;
      let message = template.message_template;

      Object.keys(variables).forEach(key => {
        const placeholder = `{{${key}}}`;
        title = title.replace(new RegExp(placeholder, 'g'), variables[key]);
        message = message.replace(new RegExp(placeholder, 'g'), variables[key]);
      });

      // Create alert data with template and overrides
      const alertData = {
        title,
        message,
        alertType: overrides.alertType || template.alert_type,
        priority: overrides.priority || template.priority,
        targetType: overrides.targetType || 'all',
        targetUserIds: overrides.targetUserIds || null,
        targetRoles: overrides.targetRoles || null,
        actionUrl: overrides.actionUrl || null,
        actionText: overrides.actionText || null,
        icon: overrides.icon || template.icon,
        startsAt: overrides.startsAt || new Date(),
        expiresAt: overrides.expiresAt || null,
        createdBy,
      };

      return await this.createAlert(alertData);
    } catch (error) {
      logger.error('Failed to create alert from template', { error: error.message, templateId });
      throw new Error(`Failed to create alert from template: ${error.message}`);
    }
  }

  /**
   * Get alert analytics
   * @param {string} alertId - Alert ID (optional, if not provided returns summary for all alerts)
   * @returns {Promise<Object>} Alert analytics data
   */
  async getAlertAnalytics(alertId = null) {
    try {
      if (alertId) {
        // Get analytics for specific alert
        const query = `
          SELECT aa.*, a.title, a.created_at as alert_created_at
          FROM alert_analytics aa
          JOIN alerts a ON aa.alert_id = a.id
          WHERE aa.alert_id = $1
        `;
        const result = await this.db.query(query, [alertId]);
        return result.rows[0] || null;
      } else {
        // Get summary analytics
        const query = `
          SELECT 
            COUNT(DISTINCT a.id) as total_alerts,
            COUNT(DISTINCT CASE WHEN a.is_active = TRUE THEN a.id END) as active_alerts,
            SUM(aa.total_recipients) as total_recipients_all_time,
            AVG(aa.delivery_rate) as avg_delivery_rate,
            AVG(aa.read_rate) as avg_read_rate,
            COUNT(DISTINCT CASE WHEN aa.read_count > 0 THEN aa.alert_id END) as alerts_with_engagement
          FROM alerts a
          LEFT JOIN alert_analytics aa ON a.id = aa.alert_id
        `;
        const result = await this.db.query(query);
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Failed to get alert analytics', { error: error.message, alertId });
      throw new Error(`Failed to get alert analytics: ${error.message}`);
    }
  }

  /**
   * Get unread alert count for a user
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of unread alerts
   */
  async getUnreadAlertCount(userId) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM get_user_alerts($1, FALSE)
      `;
      const result = await this.db.query(query, [userId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Failed to get unread alert count', { error: error.message, userId });
      return 0;
    }
  }

  /**
   * Broadcast alert to users via WebSocket
   * @param {Object} alert - Alert object
   */
  async broadcastAlert(alert) {
    if (!this.socketManager) {
      logger.warn('No WebSocket manager available for alert broadcasting');
      return;
    }

    try {
      // Get target users based on alert configuration
      const targetUsers = await this.getAlertTargetUsers(alert);

      // Broadcast to each target user
      for (const userId of targetUsers) {
        this.socketManager.emitToUser(userId, 'new_alert', {
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
      }

      logger.info('Alert broadcasted successfully', {
        alertId: alert.id,
        targetUserCount: targetUsers.length,
      });
    } catch (error) {
      logger.error('Failed to broadcast alert', { error: error.message, alertId: alert.id });
    }
  }

  /**
   * Broadcast alert update to users
   * @param {Object} alert - Updated alert object
   */
  async broadcastAlertUpdate(alert) {
    if (!this.socketManager) return;

    try {
      const targetUsers = await this.getAlertTargetUsers(alert);

      for (const userId of targetUsers) {
        this.socketManager.emitToUser(userId, 'alert_updated', {
          id: alert.id,
          title: alert.title,
          message: alert.message,
          alertType: alert.alert_type,
          priority: alert.priority,
          actionUrl: alert.action_url,
          actionText: alert.action_text,
          icon: alert.icon,
          isDismissible: alert.is_dismissible,
          isActive: alert.is_active,
          updatedAt: alert.updated_at,
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast alert update', { error: error.message, alertId: alert.id });
    }
  }

  /**
   * Broadcast alert deletion to users
   * @param {Object} alert - Deleted alert object
   */
  async broadcastAlertDeletion(alert) {
    if (!this.socketManager) return;

    try {
      const targetUsers = await this.getAlertTargetUsers(alert);

      for (const userId of targetUsers) {
        this.socketManager.emitToUser(userId, 'alert_deleted', {
          alertId: alert.id,
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast alert deletion', {
        error: error.message,
        alertId: alert.id,
      });
    }
  }

  /**
   * Get target user IDs for an alert
   * @param {Object} alert - Alert object
   * @returns {Promise<Array>} Array of user IDs
   */
  async getAlertTargetUsers(alert) {
    try {
      let query;
      let params = [];

      switch (alert.target_type) {
        case 'all':
          query = `SELECT id FROM users WHERE is_active = TRUE`;
          break;
        case 'specific':
          if (!alert.target_user_ids || alert.target_user_ids.length === 0) {
            return [];
          }
          query = `SELECT id FROM users WHERE id = ANY($1) AND is_active = TRUE`;
          params = [alert.target_user_ids];
          break;
        case 'admin':
          query = `SELECT id FROM admin_users WHERE is_active = TRUE`;
          break;
        default:
          return [];
      }

      const result = await this.db.query(query, params);
      return result.rows.map(row => row.id);
    } catch (error) {
      logger.error('Failed to get alert target users', { error: error.message, alertId: alert.id });
      return [];
    }
  }

  /**
   * Send automatic alerts based on system events
   * @param {string} eventType - Type of event that triggered the alert
   * @param {Object} eventData - Event-specific data
   */
  async sendAutomaticAlert(eventType, eventData) {
    try {
      let alertData = null;

      switch (eventType) {
        case 'user_registered':
          alertData = {
            title: 'Welcome to MockMate!',
            message: `Thank you for joining MockMate, ${eventData.userName}. You have ${eventData.credits} free credits to start your interview practice.`,
            alertType: 'success',
            priority: 'normal',
            targetType: 'specific',
            targetUserIds: [eventData.userId],
            icon: 'user-plus',
            createdBy: eventData.createdBy || null,
          };
          break;

        case 'low_credits':
          alertData = {
            title: 'Low Credits Warning',
            message: `You have ${eventData.credits} credits remaining. Purchase more credits to continue using MockMate.`,
            alertType: 'warning',
            priority: 'high',
            targetType: 'specific',
            targetUserIds: [eventData.userId],
            actionUrl: '/pricing',
            actionText: 'Buy Credits',
            icon: 'credit-card',
            createdBy: eventData.createdBy || null,
          };
          break;

        case 'payment_successful':
          alertData = {
            title: 'Payment Successful',
            message: `Your payment of $${eventData.amount} was successful. ${eventData.credits} credits have been added to your account.`,
            alertType: 'success',
            priority: 'normal',
            targetType: 'specific',
            targetUserIds: [eventData.userId],
            icon: 'check-circle',
            createdBy: eventData.createdBy || null,
          };
          break;

        default:
          logger.warn('Unknown automatic alert event type', { eventType });
          return null;
      }

      if (alertData && alertData.createdBy) {
        return await this.createAlert(alertData);
      }
    } catch (error) {
      logger.error('Failed to send automatic alert', {
        error: error.message,
        eventType,
        eventData,
      });
    }
  }

  /**
   * Clean up expired alerts and old recipient data
   * @param {number} daysToKeep - Number of days to keep expired alerts
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupExpiredAlerts(daysToKeep = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // Delete expired alerts and their related data
      const deleteQuery = `
        DELETE FROM alerts 
        WHERE expires_at IS NOT NULL 
        AND expires_at < $1
        AND created_at < $1
      `;

      const result = await this.db.query(deleteQuery, [cutoffDate]);

      logger.info('Expired alerts cleanup completed', {
        deletedCount: result.rowCount,
        cutoffDate,
      });

      return {
        deletedCount: result.rowCount,
        cutoffDate,
      };
    } catch (error) {
      logger.error('Failed to cleanup expired alerts', { error: error.message });
      throw new Error(`Failed to cleanup expired alerts: ${error.message}`);
    }
  }

  /**
   * Set WebSocket manager for real-time features
   * @param {Object} socketManager - WebSocket manager instance
   */
  setSocketManager(socketManager) {
    this.socketManager = socketManager;
  }
}

export default AlertService;
