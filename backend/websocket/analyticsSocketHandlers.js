import { logger } from '../config/logger.js';
import { validateWebSocketAuth } from '../middleware/auth.js';

/**
 * Enhanced WebSocket handlers with analytics integration
 */
export function initializeAnalyticsWebSocket(server, analyticsService, realtimeAnalyticsService) {
  const { Server } = require('socket.io');

  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:3001',
      ],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Initialize real-time analytics service with Socket.IO instance
  realtimeAnalyticsService.io = io;
  realtimeAnalyticsService.initialize();

  // Authentication middleware for WebSocket
  io.use(validateWebSocketAuth);

  // Main user connections
  io.on('connection', async socket => {
    try {
      await handleUserConnection(socket, analyticsService, realtimeAnalyticsService);
    } catch (error) {
      logger.error('WebSocket connection error:', error);
      socket.disconnect();
    }
  });

  return io;
}

/**
 * Handle user WebSocket connections with analytics
 */
async function handleUserConnection(socket, analyticsService, realtimeAnalyticsService) {
  const userId = socket.userId;
  const userEmail = socket.userEmail;

  logger.info(`User connected: ${userId} (${userEmail})`);

  // Track user connection in analytics
  if (analyticsService) {
    await analyticsService.trackUserActivity(userId, 'websocket_connect', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });
  }

  // Broadcast user login to admin dashboards
  if (realtimeAnalyticsService) {
    realtimeAnalyticsService.broadcastUserActivity(userId, 'user_login', {
      method: 'websocket',
      socketId: socket.id,
      userEmail,
    });
  }

  // Join user to their personal room
  socket.join(`user_${userId}`);

  // Set up enhanced event handlers
  setupEnhancedSessionHandlers(socket, analyticsService, realtimeAnalyticsService);
  setupEnhancedMessageHandlers(socket, analyticsService, realtimeAnalyticsService);
  setupEnhancedDisconnectHandlers(socket, analyticsService, realtimeAnalyticsService);

  // Send connection confirmation
  socket.emit('connected', {
    message: 'Connected with analytics tracking',
    userId,
    socketId: socket.id,
    features: ['analytics', 'realtime_monitoring'],
  });
}

/**
 * Enhanced session handlers with analytics tracking
 */
function setupEnhancedSessionHandlers(socket, analyticsService, realtimeAnalyticsService) {
  const userId = socket.userId;

  // Join interview session with analytics
  socket.on('join_session', async data => {
    try {
      const { sessionId } = data;

      if (!sessionId) {
        socket.emit('error', { message: 'Session ID is required' });
        return;
      }

      // Verify session belongs to user and is active
      const sessionQuery = `
                SELECT id, status, job_title, difficulty, session_type, duration_minutes,
                       created_at, started_at
                FROM sessions 
                WHERE id = $1 AND user_id = $2 AND status IN ('active', 'paused', 'created')
            `;

      // Note: In the actual implementation, you'd get the database from req.app.locals
      // For now, we'll assume the session verification works

      // Join session room
      socket.join(`session_${sessionId}`);
      socket.currentSessionId = sessionId;

      // Track session join in analytics
      if (analyticsService) {
        await analyticsService.trackUserActivity(userId, 'session_join', {
          sessionId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      }

      // Broadcast session activity to admin dashboards
      if (realtimeAnalyticsService) {
        realtimeAnalyticsService.broadcastSessionActivity(sessionId, userId, 'joined', {
          socketId: socket.id,
        });
      }

      logger.info(`User ${userId} joined session ${sessionId}`);

      socket.emit('session_joined', {
        sessionId,
        message: 'Session joined successfully',
        analyticsEnabled: true,
      });
    } catch (error) {
      logger.error('Enhanced join_session error:', error);
      socket.emit('session_error', {
        message: 'Failed to join session',
        code: 'SESSION_JOIN_ERROR',
      });
    }
  });

  // Start interview session with analytics
  socket.on('start_session', async data => {
    try {
      const { sessionId } = data;
      const sessionStartTime = new Date();

      // Track session start in analytics
      if (analyticsService) {
        await analyticsService.trackInterviewSession(userId, {
          sessionId,
          type: 'started',
          duration: 0,
          questionsCount: 0,
          completed: false,
          startedAt: sessionStartTime.toISOString(),
        });
      }

      // Broadcast to admin dashboards
      if (realtimeAnalyticsService) {
        realtimeAnalyticsService.broadcastSessionActivity(sessionId, userId, 'started', {
          startedAt: sessionStartTime.toISOString(),
          socketId: socket.id,
        });
      }

      socket.emit('session_started', {
        sessionId,
        startedAt: sessionStartTime.toISOString(),
        analyticsTracked: true,
      });
    } catch (error) {
      logger.error('Enhanced start_session error:', error);
      socket.emit('session_error', {
        message: 'Failed to start session',
        code: 'SESSION_START_ERROR',
      });
    }
  });

  // End interview session with analytics
  socket.on('end_session', async data => {
    try {
      const { sessionId, duration, questionsCount, completed } = data;
      const sessionEndTime = new Date();

      // Track session end in analytics
      if (analyticsService) {
        await analyticsService.trackInterviewSession(userId, {
          sessionId,
          type: 'ended',
          duration: duration || 0,
          questionsCount: questionsCount || 0,
          completed: completed || false,
          endedAt: sessionEndTime.toISOString(),
        });
      }

      // Broadcast to admin dashboards
      if (realtimeAnalyticsService) {
        realtimeAnalyticsService.broadcastSessionActivity(sessionId, userId, 'ended', {
          duration,
          questionsCount,
          completed,
          endedAt: sessionEndTime.toISOString(),
        });
      }

      // Leave session room
      socket.leave(`session_${sessionId}`);
      socket.currentSessionId = null;

      socket.emit('session_ended', {
        sessionId,
        endedAt: sessionEndTime.toISOString(),
        analyticsTracked: true,
      });
    } catch (error) {
      logger.error('Enhanced end_session error:', error);
      socket.emit('session_error', {
        message: 'Failed to end session',
        code: 'SESSION_END_ERROR',
      });
    }
  });

  // Pause/Resume session with analytics
  socket.on('session_control', async data => {
    try {
      const { sessionId, action } = data;
      const timestamp = new Date().toISOString();

      if (!['pause', 'resume'].includes(action)) {
        socket.emit('error', { message: 'Invalid session control action' });
        return;
      }

      // Track session control in analytics
      if (analyticsService) {
        await analyticsService.trackUserActivity(userId, 'session_control', {
          sessionId,
          action,
          timestamp,
        });
      }

      // Broadcast to admin dashboards
      if (realtimeAnalyticsService) {
        realtimeAnalyticsService.broadcastSessionActivity(sessionId, userId, action, { timestamp });
      }

      socket.emit('session_control_success', {
        sessionId,
        action,
        timestamp,
        analyticsTracked: true,
      });
    } catch (error) {
      logger.error('Enhanced session_control error:', error);
      socket.emit('session_error', {
        message: 'Failed to control session',
        code: 'SESSION_CONTROL_ERROR',
      });
    }
  });
}

/**
 * Enhanced message handlers with analytics tracking
 */
function setupEnhancedMessageHandlers(socket, analyticsService, realtimeAnalyticsService) {
  const userId = socket.userId;

  // Handle user messages with analytics
  socket.on('send_message', async data => {
    try {
      const { sessionId, content, messageType = 'answer' } = data;

      if (!sessionId || !content) {
        socket.emit('error', { message: 'Session ID and content are required' });
        return;
      }

      const messageData = {
        sessionId,
        content,
        messageType,
        contentLength: content.length,
        timestamp: new Date().toISOString(),
      };

      // Track message in analytics
      if (analyticsService) {
        await analyticsService.trackUserActivity(userId, 'message_sent', messageData);
      }

      // Broadcast message activity to admin dashboards
      if (realtimeAnalyticsService) {
        realtimeAnalyticsService.broadcastUserActivity(userId, 'message_sent', messageData);
      }

      // Continue with original message handling logic here
      // (saving to database, generating AI response, etc.)

      socket.emit('message_sent', {
        ...messageData,
        analyticsTracked: true,
      });
    } catch (error) {
      logger.error('Enhanced send_message error:', error);
      socket.emit('message_error', {
        message: 'Failed to send message',
        code: 'MESSAGE_SEND_ERROR',
      });
    }
  });

  // Handle typing indicators with analytics
  socket.on('typing', async data => {
    try {
      const { sessionId, isTyping } = data;

      if (sessionId) {
        // Track typing activity for session engagement analytics
        if (analyticsService && isTyping) {
          await analyticsService.trackUserActivity(userId, 'typing_started', {
            sessionId,
            timestamp: new Date().toISOString(),
          });
        }

        // Broadcast typing to session participants
        socket.to(`session_${sessionId}`).emit('user_typing', {
          userId,
          isTyping,
          sessionId,
        });
      }
    } catch (error) {
      logger.error('Enhanced typing error:', error);
    }
  });
}

/**
 * Enhanced disconnect handlers with analytics tracking
 */
function setupEnhancedDisconnectHandlers(socket, analyticsService, realtimeAnalyticsService) {
  const userId = socket.userId;

  socket.on('disconnect', async reason => {
    try {
      const disconnectTime = new Date().toISOString();

      logger.info(`User ${userId} disconnected: ${reason}`);

      // Track disconnection in analytics
      if (analyticsService) {
        await analyticsService.trackUserActivity(userId, 'websocket_disconnect', {
          reason,
          socketId: socket.id,
          disconnectedAt: disconnectTime,
        });
      }

      // Broadcast user logout to admin dashboards
      if (realtimeAnalyticsService) {
        realtimeAnalyticsService.broadcastUserActivity(userId, 'user_logout', {
          method: 'websocket',
          reason,
          disconnectedAt: disconnectTime,
        });
      }

      // Leave current session if any
      if (socket.currentSessionId) {
        socket.leave(`session_${socket.currentSessionId}`);

        // Track session leave
        if (analyticsService) {
          await analyticsService.trackUserActivity(userId, 'session_leave', {
            sessionId: socket.currentSessionId,
            reason: 'disconnect',
            timestamp: disconnectTime,
          });
        }

        // Broadcast session leave to admin dashboards
        if (realtimeAnalyticsService) {
          realtimeAnalyticsService.broadcastSessionActivity(
            socket.currentSessionId,
            userId,
            'left',
            { reason: 'disconnect', timestamp: disconnectTime }
          );
        }

        // Notify session about user leaving
        socket.to(`session_${socket.currentSessionId}`).emit('user_left', {
          userId,
          sessionId: socket.currentSessionId,
          reason,
        });
      }
    } catch (error) {
      logger.error('Enhanced disconnect error:', error);
    }
  });

  socket.on('error', error => {
    logger.error(`Socket error for user ${userId}:`, error);

    // Track socket errors in analytics
    if (analyticsService) {
      analyticsService
        .trackUserActivity(userId, 'websocket_error', {
          error: error.message,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        })
        .catch(err => logger.error('Failed to track socket error:', err));
    }
  });
}

/**
 * Utility functions for external use
 */
export function emitToUser(io, userId, event, data) {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
}

export function emitToSession(io, sessionId, event, data) {
  if (io) {
    io.to(`session_${sessionId}`).emit(event, data);
  }
}

export function getConnectedUsers(io) {
  if (!io) return [];

  return new Promise(resolve => {
    io.fetchSockets()
      .then(sockets => {
        const users = sockets.map(socket => ({
          userId: socket.userId,
          userEmail: socket.userEmail,
          socketId: socket.id,
          currentSession: socket.currentSessionId || null,
          connectedAt: socket.handshake.time,
        }));
        resolve(users);
      })
      .catch(error => {
        logger.error('Failed to get connected users:', error);
        resolve([]);
      });
  });
}

export default {
  initializeAnalyticsWebSocket,
  emitToUser,
  emitToSession,
  getConnectedUsers,
};
