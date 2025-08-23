import { logger } from '../config/logger.js';

class AuthWebSocketService {
  constructor(io, database) {
    this.io = io;
    this.db = database;
    this.adminNamespace = null;
    this.userSessions = new Map(); // Track user sessions
    this.adminSessions = new Set(); // Track admin sessions
  }

  /**
   * Initialize WebSocket namespaces for auth events
   */
  initialize() {
    // Create admin namespace for admin panel notifications
    this.adminNamespace = this.io.of('/admin-auth-events');

    // Handle admin connections
    this.adminNamespace.on('connection', socket => {
      logger.info('Admin connected to auth events namespace:', {
        socketId: socket.id,
        adminId: socket.handshake.auth?.adminId,
      });

      this.adminSessions.add(socket.id);

      // Handle admin authentication
      socket.on('authenticate', async data => {
        try {
          const { adminToken, adminId } = data;
          // Verify admin token here if needed
          socket.adminId = adminId;
          socket.emit('authenticated', { success: true });

          // Send current stats on connection
          const stats = await this.getCurrentStats();
          socket.emit('auth-stats', stats);
        } catch (error) {
          logger.error('Admin authentication failed:', error);
          socket.emit('authenticated', { success: false, error: error.message });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('Admin disconnected from auth events namespace:', socket.id);
        this.adminSessions.delete(socket.id);
      });
    });

    // Create user namespace for user-specific notifications
    this.io.of('/user-auth-events').on('connection', socket => {
      logger.info('User connected to auth events namespace:', socket.id);

      // Handle user authentication
      socket.on('authenticate', async data => {
        try {
          const { userId, firebaseUid } = data;
          socket.userId = userId;
          socket.firebaseUid = firebaseUid;

          // Track user session
          this.userSessions.set(firebaseUid, {
            socketId: socket.id,
            userId,
            connectedAt: new Date(),
            socket,
          });

          socket.emit('authenticated', { success: true });
        } catch (error) {
          logger.error('User authentication failed:', error);
          socket.emit('authenticated', { success: false, error: error.message });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('User disconnected from auth events namespace:', socket.id);

        // Remove from user sessions
        for (const [firebaseUid, session] of this.userSessions.entries()) {
          if (session.socketId === socket.id) {
            this.userSessions.delete(firebaseUid);
            break;
          }
        }
      });
    });

    logger.info('Auth WebSocket service initialized');
  }

  /**
   * Broadcast authentication event to admin dashboard
   */
  async broadcastAuthEvent(eventType, eventData) {
    if (!this.adminNamespace) return;

    const enrichedEventData = {
      ...eventData,
      timestamp: new Date().toISOString(),
      eventType,
    };

    try {
      // Broadcast to all admin sessions
      this.adminNamespace.emit('auth-event', enrichedEventData);

      // Log to database for persistence
      await this.logAuthEvent(eventType, eventData);

      logger.info('Auth event broadcasted:', {
        eventType,
        adminSessions: this.adminSessions.size,
        userId: eventData.userId,
      });
    } catch (error) {
      logger.error('Failed to broadcast auth event:', error);
    }
  }

  /**
   * Send notification to specific user
   */
  async notifyUser(firebaseUid, notification) {
    const session = this.userSessions.get(firebaseUid);

    if (session && session.socket) {
      session.socket.emit('notification', {
        ...notification,
        timestamp: new Date().toISOString(),
      });

      logger.info('User notification sent:', {
        firebaseUid,
        notificationType: notification.type,
      });
    }
  }

  /**
   * Handle user login event
   */
  async onUserLogin(userData, loginData = {}) {
    const eventData = {
      userId: userData.id,
      firebaseUid: userData.firebase_uid,
      email: userData.email,
      name: userData.name,
      provider: loginData.provider || 'email',
      ipAddress: loginData.ipAddress,
      userAgent: loginData.userAgent,
      location: loginData.location,
      deviceInfo: loginData.deviceInfo,
      isNewUser: loginData.isNewUser || false,
    };

    // Broadcast to admin dashboard
    await this.broadcastAuthEvent('user_login', eventData);

    // Send welcome notification to user
    await this.notifyUser(userData.firebase_uid, {
      type: 'login_success',
      title: 'Login Successful',
      message: `Welcome back, ${userData.name}!`,
      data: {
        loginTime: new Date().toISOString(),
        provider: eventData.provider,
      },
    });
  }

  /**
   * Handle user logout event
   */
  async onUserLogout(userData, logoutData = {}) {
    const eventData = {
      userId: userData.id,
      firebaseUid: userData.firebase_uid,
      email: userData.email,
      name: userData.name,
      sessionDuration: logoutData.sessionDuration,
      ipAddress: logoutData.ipAddress,
    };

    // Broadcast to admin dashboard
    await this.broadcastAuthEvent('user_logout', eventData);

    // Remove from active sessions
    this.userSessions.delete(userData.firebase_uid);
  }

  /**
   * Handle user registration event
   */
  async onUserRegistration(userData, registrationData = {}) {
    const eventData = {
      userId: userData.id,
      firebaseUid: userData.firebase_uid,
      email: userData.email,
      name: userData.name,
      provider: registrationData.provider || 'email',
      ipAddress: registrationData.ipAddress,
      userAgent: registrationData.userAgent,
      location: registrationData.location,
      registrationSource: registrationData.registrationSource,
    };

    // Broadcast to admin dashboard
    await this.broadcastAuthEvent('user_registration', eventData);

    // Send welcome notification to user
    await this.notifyUser(userData.firebase_uid, {
      type: 'registration_success',
      title: 'Welcome to MockMate!',
      message:
        'Your account has been created successfully. Please verify your email to get started.',
      data: {
        registrationTime: new Date().toISOString(),
        emailVerificationRequired: !userData.is_verified,
      },
    });
  }

  /**
   * Handle security event
   */
  async onSecurityEvent(eventType, userData, securityData = {}) {
    const eventData = {
      securityEventType: eventType,
      userId: userData.id,
      firebaseUid: userData.firebase_uid,
      email: userData.email,
      name: userData.name,
      severity: securityData.severity || 'medium',
      details: securityData.details || {},
      ipAddress: securityData.ipAddress,
      userAgent: securityData.userAgent,
      location: securityData.location,
    };

    // Broadcast to admin dashboard with high priority
    await this.broadcastAuthEvent('security_event', eventData);

    // Send security alert to user if applicable
    if (securityData.notifyUser) {
      await this.notifyUser(userData.firebase_uid, {
        type: 'security_alert',
        title: 'Security Alert',
        message: securityData.userMessage || 'Suspicious activity detected on your account',
        data: {
          eventType,
          timestamp: new Date().toISOString(),
          requiresAction: securityData.requiresAction || false,
        },
      });
    }
  }

  /**
   * Handle account changes (email, password, profile updates)
   */
  async onAccountChange(changeType, userData, changeData = {}) {
    const eventData = {
      changeType,
      userId: userData.id,
      firebaseUid: userData.firebase_uid,
      email: userData.email,
      name: userData.name,
      changes: changeData.changes || {},
      ipAddress: changeData.ipAddress,
      userAgent: changeData.userAgent,
    };

    // Broadcast to admin dashboard
    await this.broadcastAuthEvent('account_change', eventData);

    // Send confirmation to user
    await this.notifyUser(userData.firebase_uid, {
      type: 'account_change',
      title: 'Account Updated',
      message: changeData.userMessage || 'Your account information has been updated successfully',
      data: {
        changeType,
        timestamp: new Date().toISOString(),
        changes: changeData.changes,
      },
    });
  }

  /**
   * Handle provider linking/unlinking
   */
  async onProviderChange(action, userData, providerData = {}) {
    const eventData = {
      action, // 'linked' or 'unlinked'
      userId: userData.id,
      firebaseUid: userData.firebase_uid,
      email: userData.email,
      name: userData.name,
      provider: providerData.providerId,
      totalProviders: providerData.totalProviders || 1,
      ipAddress: providerData.ipAddress,
    };

    // Broadcast to admin dashboard
    await this.broadcastAuthEvent('provider_change', eventData);

    // Send confirmation to user
    await this.notifyUser(userData.firebase_uid, {
      type: 'provider_change',
      title: action === 'linked' ? 'Account Linked' : 'Account Unlinked',
      message: `Your ${providerData.providerName || providerData.providerId} account has been ${action} successfully`,
      data: {
        action,
        provider: providerData.providerId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Get current authentication statistics
   */
  async getCurrentStats() {
    try {
      const [
        activeSessionsResult,
        todayLoginsResult,
        todayRegistrationsResult,
        recentSecurityEventsResult,
      ] = await Promise.all([
        this.db.query(`
                    SELECT COUNT(*) as count FROM user_sessions 
                    WHERE is_active = true AND expires_at > NOW()
                `),
        this.db.query(`
                    SELECT COUNT(*) as count FROM user_auth_events 
                    WHERE event_type = 'login_success' AND created_at >= CURRENT_DATE
                `),
        this.db.query(`
                    SELECT COUNT(*) as count FROM users 
                    WHERE created_at >= CURRENT_DATE
                `),
        this.db.query(`
                    SELECT COUNT(*) as count FROM user_auth_events 
                    WHERE event_type = 'suspicious_activity' AND created_at >= NOW() - INTERVAL '24 hours'
                `),
      ]);

      return {
        activeSessions: parseInt(activeSessionsResult.rows[0].count),
        todayLogins: parseInt(todayLoginsResult.rows[0].count),
        todayRegistrations: parseInt(todayRegistrationsResult.rows[0].count),
        recentSecurityEvents: parseInt(recentSecurityEventsResult.rows[0].count),
        connectedAdmins: this.adminSessions.size,
        connectedUsers: this.userSessions.size,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get current stats:', error);
      return {
        activeSessions: 0,
        todayLogins: 0,
        todayRegistrations: 0,
        recentSecurityEvents: 0,
        connectedAdmins: this.adminSessions.size,
        connectedUsers: this.userSessions.size,
        lastUpdated: new Date().toISOString(),
        error: 'Failed to fetch database stats',
      };
    }
  }

  /**
   * Log auth event to database
   */
  async logAuthEvent(eventType, eventData) {
    try {
      await this.db.query(
        `
                INSERT INTO user_auth_events (
                    user_id, event_type, provider, ip_address, user_agent, 
                    location_data, device_info, details, created_at
                ) VALUES (
                    (SELECT id FROM users WHERE firebase_uid = $1), 
                    $2, $3, $4, $5, $6, $7, $8, NOW()
                )
            `,
        [
          eventData.firebaseUid,
          eventType,
          eventData.provider || null,
          eventData.ipAddress || null,
          eventData.userAgent || null,
          eventData.location ? JSON.stringify(eventData.location) : null,
          eventData.deviceInfo ? JSON.stringify(eventData.deviceInfo) : null,
          JSON.stringify(eventData),
        ]
      );
    } catch (error) {
      logger.error('Failed to log auth event to database:', error);
    }
  }

  /**
   * Send real-time stats update to all admin sessions
   */
  async broadcastStatsUpdate() {
    if (!this.adminNamespace || this.adminSessions.size === 0) return;

    try {
      const stats = await this.getCurrentStats();
      this.adminNamespace.emit('stats-update', stats);
    } catch (error) {
      logger.error('Failed to broadcast stats update:', error);
    }
  }

  /**
   * Start periodic stats broadcasting
   */
  startStatsUpdates(intervalMs = 30000) {
    // Update every 30 seconds
    setInterval(() => {
      this.broadcastStatsUpdate();
    }, intervalMs);

    logger.info('Real-time stats updates started');
  }

  /**
   * Get connected sessions info
   */
  getConnectionInfo() {
    return {
      adminSessions: this.adminSessions.size,
      userSessions: this.userSessions.size,
      userSessionDetails: Array.from(this.userSessions.entries()).map(([firebaseUid, session]) => ({
        firebaseUid,
        userId: session.userId,
        connectedAt: session.connectedAt,
        socketId: session.socketId,
      })),
    };
  }

  /**
   * Disconnect user session
   */
  disconnectUser(firebaseUid, reason = 'Admin action') {
    const session = this.userSessions.get(firebaseUid);

    if (session && session.socket) {
      session.socket.emit('force-disconnect', {
        reason,
        timestamp: new Date().toISOString(),
      });

      session.socket.disconnect(true);
      this.userSessions.delete(firebaseUid);

      logger.info('User session disconnected:', {
        firebaseUid,
        reason,
        socketId: session.socketId,
      });
    }
  }
}

export default AuthWebSocketService;
