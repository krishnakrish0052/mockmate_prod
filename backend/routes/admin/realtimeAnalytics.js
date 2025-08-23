import express from 'express';
import { adminAuth, requirePermission } from '../../middleware/admin/adminAuth.js';
import { logger } from '../../config/logger.js';

const router = express.Router();

/**
 * Create real-time analytics admin routes
 */
export function createRealtimeAnalyticsRoutes(analyticsService, realtimeAnalyticsService) {
  // Apply admin authentication to all routes
  router.use(adminAuth);
  router.use(requirePermissions(['analytics', 'system_settings']));

  // Get real-time overview dashboard
  router.get('/overview', async (req, res) => {
    try {
      const overview = await realtimeAnalyticsService.getRealtimeOverview();

      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      logger.error('Failed to get realtime overview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve real-time overview',
        error: error.message,
      });
    }
  });

  // Get live user activity feed
  router.get('/activity-feed', async (req, res) => {
    try {
      const { limit = 50, actionType, userId } = req.query;

      // Get recent activities from the realtime service
      const activities = realtimeAnalyticsService.realtimeMetrics.recentActions
        .filter(activity => {
          if (actionType && activity.actionType !== actionType) return false;
          if (userId && activity.userId !== userId) return false;
          return true;
        })
        .slice(0, parseInt(limit));

      res.json({
        success: true,
        data: {
          activities,
          totalCount: activities.length,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get activity feed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve activity feed',
        error: error.message,
      });
    }
  });

  // Get active sessions monitoring
  router.get('/active-sessions', async (req, res) => {
    try {
      // Get current active sessions
      const activeSessions = Array.from(realtimeAnalyticsService.realtimeMetrics.activeSessions);

      // Get detailed session information from database
      const sessionDetails = await Promise.all(
        activeSessions.map(async sessionId => {
          try {
            const result = await req.app.locals.database.query(
              `
                            SELECT 
                                s.id,
                                s.user_id,
                                s.session_name,
                                s.job_title,
                                s.status,
                                s.started_at,
                                s.created_at,
                                u.email as user_email,
                                u.first_name,
                                u.last_name
                            FROM sessions s
                            JOIN users u ON s.user_id = u.id
                            WHERE s.id = $1
                        `,
              [sessionId]
            );

            return result.rows[0];
          } catch (error) {
            logger.error(`Failed to get session details for ${sessionId}:`, error);
            return null;
          }
        })
      );

      // Filter out null results
      const validSessions = sessionDetails.filter(session => session !== null);

      res.json({
        success: true,
        data: {
          activeSessions: validSessions,
          totalCount: validSessions.length,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get active sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve active sessions',
        error: error.message,
      });
    }
  });

  // Get connected users monitoring
  router.get('/connected-users', async (req, res) => {
    try {
      // Get connected users from WebSocket
      const connectedUsers = await realtimeAnalyticsService.getActiveAdminConnections();

      // Get additional user details if needed
      const userStats = {
        totalConnected: realtimeAnalyticsService.realtimeMetrics.activeUsers,
        adminConnections: connectedUsers.length,
        lastUpdated: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: {
          stats: userStats,
          adminConnections: connectedUsers,
        },
      });
    } catch (error) {
      logger.error('Failed to get connected users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve connected users',
        error: error.message,
      });
    }
  });

  // Get real-time metrics summary
  router.get('/metrics', async (req, res) => {
    try {
      const { timeRange = '1 hour' } = req.query;

      // Get current real-time metrics
      const currentMetrics = {
        activeUsers: realtimeAnalyticsService.realtimeMetrics.activeUsers,
        activeSessions: realtimeAnalyticsService.realtimeMetrics.activeSessions.size,
        currentPageViews: realtimeAnalyticsService.realtimeMetrics.currentPageViews,
        recentActionsCount: realtimeAnalyticsService.realtimeMetrics.recentActions.length,
      };

      // Get database metrics for comparison
      const dbMetrics = await analyticsService.getRealtimeAnalytics();

      res.json({
        success: true,
        data: {
          current: currentMetrics,
          database: dbMetrics,
          timeRange,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get real-time metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve real-time metrics',
        error: error.message,
      });
    }
  });

  // Get system health monitoring
  router.get('/system-health', async (req, res) => {
    try {
      const systemHealth = {
        server: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          nodeVersion: process.version,
        },
        database: {
          connected: !!req.app.locals.database,
          activeConnections: req.app.locals.database?.totalCount || 0,
        },
        websocket: {
          adminConnections: realtimeAnalyticsService.adminSockets.size,
          realtimeServiceActive: !!realtimeAnalyticsService.updateInterval,
        },
        analytics: {
          recentActions: realtimeAnalyticsService.realtimeMetrics.recentActions.length,
          activeUsers: realtimeAnalyticsService.realtimeMetrics.activeUsers,
          activeSessions: realtimeAnalyticsService.realtimeMetrics.activeSessions.size,
        },
        timestamp: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: systemHealth,
      });
    } catch (error) {
      logger.error('Failed to get system health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve system health',
        error: error.message,
      });
    }
  });

  // Send alert to admin dashboards
  router.post('/send-alert', async (req, res) => {
    try {
      const { type, message, data = {} } = req.body;

      if (!type || !message) {
        return res.status(400).json({
          success: false,
          message: 'Alert type and message are required',
        });
      }

      // Validate alert type
      const validTypes = ['info', 'warning', 'error', 'success'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid alert type. Must be one of: ' + validTypes.join(', '),
        });
      }

      // Send alert to all connected admin dashboards
      realtimeAnalyticsService.sendAlert(type, message, {
        ...data,
        sentBy: req.admin.username,
        sentAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: 'Alert sent successfully',
        data: {
          type,
          message,
          sentTo: realtimeAnalyticsService.adminSockets.size,
        },
      });
    } catch (error) {
      logger.error('Failed to send alert:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send alert',
        error: error.message,
      });
    }
  });

  // Get user activity timeline
  router.get('/user-timeline/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 50, timeRange = '24 hours' } = req.query;

      // Get user activities from real-time metrics
      const realtimeActivities = realtimeAnalyticsService.realtimeMetrics.recentActions
        .filter(activity => activity.userId === userId)
        .slice(0, parseInt(limit));

      // Get additional activities from database
      const interval = timeRange.replace(' ', '_');
      const dbActivities = await req.app.locals.database.query(
        `
                SELECT 
                    action_type,
                    action_details,
                    timestamp,
                    ip_address,
                    user_agent,
                    page_url
                FROM user_analytics
                WHERE user_id = $1 
                AND created_at >= NOW() - INTERVAL '${interval}'
                ORDER BY timestamp DESC
                LIMIT $2
            `,
        [userId, parseInt(limit)]
      );

      res.json({
        success: true,
        data: {
          userId,
          realtimeActivities,
          historicalActivities: dbActivities.rows,
          timeRange,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get user timeline:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user timeline',
        error: error.message,
      });
    }
  });

  // Get session monitoring details
  router.get('/session-details/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Get session details from database
      const sessionResult = await req.app.locals.database.query(
        `
                SELECT 
                    s.*,
                    u.email as user_email,
                    u.first_name,
                    u.last_name,
                    COUNT(im.id) as message_count
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                LEFT JOIN interview_messages im ON s.id = im.session_id
                WHERE s.id = $1
                GROUP BY s.id, u.id
            `,
        [sessionId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Session not found',
        });
      }

      const session = sessionResult.rows[0];

      // Get recent messages
      const messagesResult = await req.app.locals.database.query(
        `
                SELECT 
                    message_type,
                    content,
                    timestamp,
                    metadata
                FROM interview_messages
                WHERE session_id = $1
                ORDER BY timestamp DESC
                LIMIT 10
            `,
        [sessionId]
      );

      // Check if session is currently active in real-time
      const isActive = realtimeAnalyticsService.realtimeMetrics.activeSessions.has(sessionId);

      res.json({
        success: true,
        data: {
          session: {
            ...session,
            isCurrentlyActive: isActive,
          },
          recentMessages: messagesResult.rows,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Failed to get session details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve session details',
        error: error.message,
      });
    }
  });

  // Export real-time analytics data
  router.get('/export', async (req, res) => {
    try {
      const {
        format = 'json',
        includeRealtime = 'true',
        includeDatabase = 'true',
        timeRange = '1 hour',
      } = req.query;

      const exportData = {};

      if (includeRealtime === 'true') {
        exportData.realtime = {
          metrics: realtimeAnalyticsService.realtimeMetrics,
          adminConnections: realtimeAnalyticsService.getActiveAdminConnections(),
        };
      }

      if (includeDatabase === 'true') {
        exportData.database = await analyticsService.exportAnalyticsData({
          format: 'json',
          interval: timeRange.replace(' ', '_'),
          includeDetails: true,
        });
      }

      exportData.exportedAt = new Date().toISOString();
      exportData.exportedBy = req.admin.username;

      // Set appropriate headers
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="realtime-analytics-${Date.now()}.json"`
        );
        res.json(exportData);
      } else {
        res.status(400).json({
          success: false,
          message: 'Only JSON format is supported for real-time data export',
        });
      }
    } catch (error) {
      logger.error('Failed to export real-time analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export real-time analytics',
        error: error.message,
      });
    }
  });

  return router;
}

export default createRealtimeAnalyticsRoutes;
