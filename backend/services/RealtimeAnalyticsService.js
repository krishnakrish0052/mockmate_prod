import { logger } from '../config/logger.js';
import { Server as SocketServer } from 'socket.io';

class RealtimeAnalyticsService {
  constructor(analyticsService, io) {
    this.analyticsService = analyticsService;
    this.io = io;
    this.adminSockets = new Map(); // Track admin socket connections
    this.realtimeMetrics = {
      activeUsers: 0,
      recentActions: [],
      activeSessions: new Set(),
      currentPageViews: 0,
    };
    this.updateInterval = null;
  }

  /**
   * Initialize the real-time analytics service
   */
  initialize() {
    logger.info('Initializing Real-time Analytics Service...');

    // Set up admin socket namespace
    this.adminNamespace = this.io.of('/admin-analytics');

    // Handle admin connections
    this.adminNamespace.on('connection', socket => {
      this.handleAdminConnection(socket);
    });

    // Start periodic updates
    this.startPeriodicUpdates();

    logger.info('Real-time Analytics Service initialized');
  }

  /**
   * Handle admin socket connections
   */
  handleAdminConnection(socket) {
    logger.info(`Admin analytics client connected: ${socket.id}`);

    // Store admin socket connection
    this.adminSockets.set(socket.id, {
      socket,
      connectedAt: new Date(),
      subscriptions: new Set(),
    });

    // Handle admin authentication
    socket.on('authenticate', async data => {
      try {
        const { token } = data;

        // In a real implementation, verify the admin token here
        // For now, we'll assume the connection is valid

        socket.authenticated = true;
        socket.emit('authenticated', { success: true });

        // Send initial analytics data
        await this.sendInitialData(socket);
      } catch (error) {
        logger.error('Admin analytics authentication failed:', error);
        socket.emit('auth_error', { message: 'Authentication failed' });
        socket.disconnect();
      }
    });

    // Handle subscription requests
    socket.on('subscribe', data => {
      const { events } = data;
      const connection = this.adminSockets.get(socket.id);

      if (connection && Array.isArray(events)) {
        events.forEach(event => connection.subscriptions.add(event));
        socket.emit('subscribed', { events });
        logger.debug(`Admin ${socket.id} subscribed to: ${events.join(', ')}`);
      }
    });

    // Handle unsubscription requests
    socket.on('unsubscribe', data => {
      const { events } = data;
      const connection = this.adminSockets.get(socket.id);

      if (connection && Array.isArray(events)) {
        events.forEach(event => connection.subscriptions.delete(event));
        socket.emit('unsubscribed', { events });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Admin analytics client disconnected: ${socket.id}`);
      this.adminSockets.delete(socket.id);
    });
  }

  /**
   * Send initial analytics data to newly connected admin
   */
  async sendInitialData(socket) {
    try {
      // Get real-time data
      const realtimeData = await this.analyticsService.getRealtimeAnalytics();

      // Get dashboard overview
      const dashboardData = await this.analyticsService.getDashboardAnalytics('24 hours');

      // Send initial data
      socket.emit('initial_data', {
        realtime: realtimeData,
        dashboard: dashboardData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to send initial analytics data:', error);
    }
  }

  /**
   * Broadcast user activity event to admin dashboards
   */
  broadcastUserActivity(userId, actionType, actionDetails, request = null) {
    const activityEvent = {
      userId,
      actionType,
      actionDetails,
      timestamp: new Date().toISOString(),
      ipAddress: this.extractIPAddress(request),
      userAgent: request?.get('User-Agent'),
      sessionId: request?.sessionID || request?.session?.id,
    };

    // Add to recent actions buffer
    this.realtimeMetrics.recentActions.unshift(activityEvent);
    if (this.realtimeMetrics.recentActions.length > 50) {
      this.realtimeMetrics.recentActions.pop();
    }

    // Broadcast to subscribed admins
    this.broadcastToSubscribed('user_activity', activityEvent);

    // Update specific metrics based on action type
    this.updateRealtimeMetrics(actionType, actionDetails);
  }

  /**
   * Update real-time metrics based on activity
   */
  updateRealtimeMetrics(actionType, actionDetails) {
    switch (actionType) {
      case 'user_login':
        this.realtimeMetrics.activeUsers++;
        break;
      case 'user_logout':
        this.realtimeMetrics.activeUsers = Math.max(0, this.realtimeMetrics.activeUsers - 1);
        break;
      case 'interview_session':
        if (actionDetails.started) {
          this.realtimeMetrics.activeSessions.add(actionDetails.sessionId);
        } else if (actionDetails.ended) {
          this.realtimeMetrics.activeSessions.delete(actionDetails.sessionId);
        }
        break;
      case 'page_visit':
        this.realtimeMetrics.currentPageViews++;
        break;
    }
  }

  /**
   * Broadcast session activity
   */
  broadcastSessionActivity(sessionId, userId, activity, details = {}) {
    const sessionEvent = {
      sessionId,
      userId,
      activity, // 'started', 'ended', 'paused', 'resumed'
      details,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToSubscribed('session_activity', sessionEvent);

    // Update active sessions tracking
    if (activity === 'started') {
      this.realtimeMetrics.activeSessions.add(sessionId);
    } else if (activity === 'ended') {
      this.realtimeMetrics.activeSessions.delete(sessionId);
    }
  }

  /**
   * Broadcast payment activity
   */
  broadcastPaymentActivity(userId, paymentDetails) {
    const paymentEvent = {
      userId,
      amount: paymentDetails.amount,
      currency: paymentDetails.currency,
      status: paymentDetails.status,
      provider: paymentDetails.provider,
      credits: paymentDetails.credits,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToSubscribed('payment_activity', paymentEvent);
  }

  /**
   * Broadcast system metrics
   */
  broadcastSystemMetrics(metrics) {
    this.broadcastToSubscribed('system_metrics', {
      ...metrics,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast to subscribed admin clients
   */
  broadcastToSubscribed(eventType, data) {
    this.adminSockets.forEach((connection, socketId) => {
      if (connection.socket.authenticated && connection.subscriptions.has(eventType)) {
        connection.socket.emit(eventType, data);
      }
    });
  }

  /**
   * Start periodic updates for real-time metrics
   */
  startPeriodicUpdates() {
    // Update every 30 seconds
    this.updateInterval = setInterval(async () => {
      try {
        await this.sendPeriodicUpdates();
      } catch (error) {
        logger.error('Failed to send periodic analytics updates:', error);
      }
    }, 30000);

    // Send immediate metrics every 5 seconds
    this.metricsInterval = setInterval(async () => {
      try {
        await this.sendImmediateMetrics();
      } catch (error) {
        logger.error('Failed to send immediate metrics:', error);
      }
    }, 5000);
  }

  /**
   * Send periodic analytics updates
   */
  async sendPeriodicUpdates() {
    try {
      // Get updated analytics data
      const realtimeData = await this.analyticsService.getRealtimeAnalytics();
      const dashboardData = await this.analyticsService.getDashboardAnalytics('24 hours');

      // Broadcast to all subscribed admins
      this.broadcastToSubscribed('periodic_update', {
        realtime: realtimeData,
        dashboard: dashboardData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get periodic analytics updates:', error);
    }
  }

  /**
   * Send immediate metrics (active users, current sessions, etc.)
   */
  async sendImmediateMetrics() {
    const metrics = {
      activeUsers: this.realtimeMetrics.activeUsers,
      activeSessions: this.realtimeMetrics.activeSessions.size,
      recentActions: this.realtimeMetrics.recentActions.slice(0, 10),
      currentPageViews: this.realtimeMetrics.currentPageViews,
      timestamp: new Date().toISOString(),
    };

    this.broadcastToSubscribed('immediate_metrics', metrics);

    // Reset page views counter
    this.realtimeMetrics.currentPageViews = 0;
  }

  /**
   * Get current active admin connections
   */
  getActiveAdminConnections() {
    return Array.from(this.adminSockets.values()).map(connection => ({
      socketId: connection.socket.id,
      connectedAt: connection.connectedAt,
      subscriptions: Array.from(connection.subscriptions),
      authenticated: connection.socket.authenticated,
    }));
  }

  /**
   * Send custom alert to admin dashboards
   */
  sendAlert(type, message, data = {}) {
    this.broadcastToSubscribed('alert', {
      type, // 'info', 'warning', 'error', 'success'
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get comprehensive real-time overview
   */
  async getRealtimeOverview() {
    try {
      const dbMetrics = await this.analyticsService.getRealtimeAnalytics();

      return {
        ...dbMetrics,
        activeUsers: this.realtimeMetrics.activeUsers,
        activeSessions: this.realtimeMetrics.activeSessions.size,
        recentActions: this.realtimeMetrics.recentActions.slice(0, 20),
        adminConnections: this.adminSockets.size,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get realtime overview:', error);
      throw error;
    }
  }

  /**
   * Helper method to extract IP address
   */
  extractIPAddress(request) {
    if (!request) return null;

    return (
      request.ip ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      (request.headers &&
        (request.headers['x-forwarded-for'] ||
          request.headers['x-real-ip'] ||
          request.headers['x-client-ip'])) ||
      '127.0.0.1'
    );
  }

  /**
   * Clean up and stop the service
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Disconnect all admin sockets
    this.adminSockets.forEach(connection => {
      connection.socket.disconnect();
    });

    this.adminSockets.clear();
    logger.info('Real-time Analytics Service destroyed');
  }
}

export default RealtimeAnalyticsService;
