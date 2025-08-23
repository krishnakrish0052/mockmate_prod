const { Server } = require('socket.io');
const { validateWebSocketAuth } = require('../middleware/auth');
const { pool } = require('../config/database');
const { cache, socketManager } = require('../config/redis');
const { logWebSocketEvent, logError } = require('../config/logger');
const aiService = require('../services/aiService');
const { v4: uuidv4 } = require('uuid');

let io;

const initializeWebSocket = server => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware for WebSocket
  io.use(validateWebSocketAuth);

  io.on('connection', async socket => {
    try {
      await handleConnection(socket);
    } catch (error) {
      logError(error, { context: 'WebSocket connection', socketId: socket.id });
      socket.disconnect();
    }
  });

  return io;
};

const handleConnection = async socket => {
  const userId = socket.userId;
  const userEmail = socket.userEmail;

  logWebSocketEvent('USER_CONNECTED', socket.id, userId, { userEmail });

  // Store connection in Redis
  await socketManager.addConnection(userId, socket.id);

  // Join user to their personal room
  socket.join(`user_${userId}`);

  // Set up event handlers
  setupSessionHandlers(socket);
  setupMessageHandlers(socket);
  setupDisconnectHandlers(socket);

  // Set up alert handlers if alert service is available
  if (global.alertService) {
    const { setupAlertHandlers } = await import('./alertSocketHandlers.js');
    setupAlertHandlers(socket, global.alertService);
  }

  // Send connection confirmation
  socket.emit('connected', {
    message: 'Connected successfully',
    userId,
    socketId: socket.id,
  });

  // Send initial alert count
  if (global.alertService) {
    try {
      const unreadCount = await global.alertService.getUnreadAlertCount(userId);
      socket.emit('alert_count_updated', {
        unreadCount,
        timestamp: new Date(),
      });
    } catch (error) {
      logError(error, { context: 'initial_alert_count', userId });
    }
  }
};

const setupSessionHandlers = socket => {
  const userId = socket.userId;

  // Join interview session
  socket.on('join_session', async data => {
    try {
      const { sessionId } = data;

      if (!sessionId) {
        socket.emit('error', { message: 'Session ID is required' });
        return;
      }

      // Verify session belongs to user and is active
      const sessionQuery = `
        SELECT id, status, job_title, difficulty, session_type, duration_minutes
        FROM sessions 
        WHERE id = $1 AND user_id = $2 AND status IN ('active', 'paused')
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, userId]);

      if (sessionResult.rows.length === 0) {
        socket.emit('session_error', {
          message: 'Session not found or not accessible',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }

      const session = sessionResult.rows[0];

      // Join session room
      socket.join(`session_${sessionId}`);
      socket.currentSessionId = sessionId;

      logWebSocketEvent('SESSION_JOINED', socket.id, userId, { sessionId });

      // Send session details
      socket.emit('session_joined', {
        sessionId,
        status: session.status,
        jobTitle: session.job_title,
        difficulty: session.difficulty,
        sessionType: session.session_type,
        duration: session.duration_minutes,
      });

      // Send recent messages
      const messagesQuery = `
        SELECT id, message_type, content, timestamp, metadata
        FROM interview_messages 
        WHERE session_id = $1 
        ORDER BY timestamp DESC 
        LIMIT 20
      `;
      const messagesResult = await pool.query(messagesQuery, [sessionId]);

      socket.emit('session_messages', {
        messages: messagesResult.rows.reverse().map(msg => ({
          id: msg.id,
          type: msg.message_type,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata,
        })),
      });
    } catch (error) {
      logError(error, { context: 'join_session', userId, socketId: socket.id });
      socket.emit('session_error', {
        message: 'Failed to join session',
        code: 'SESSION_JOIN_ERROR',
      });
    }
  });

  // Leave interview session
  socket.on('leave_session', async data => {
    try {
      const sessionId = socket.currentSessionId;
      if (sessionId) {
        socket.leave(`session_${sessionId}`);
        socket.currentSessionId = null;

        logWebSocketEvent('SESSION_LEFT', socket.id, userId, { sessionId });

        socket.emit('session_left', { sessionId });
      }
    } catch (error) {
      logError(error, { context: 'leave_session', userId, socketId: socket.id });
    }
  });

  // Pause/Resume session
  socket.on('session_control', async data => {
    try {
      const { sessionId, action } = data;

      if (!sessionId || !['pause', 'resume'].includes(action)) {
        socket.emit('error', { message: 'Invalid session control request' });
        return;
      }

      // Verify session ownership
      const sessionQuery = 'SELECT status FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, userId]);

      if (sessionResult.rows.length === 0) {
        socket.emit('session_error', {
          message: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }

      const currentStatus = sessionResult.rows[0].status;
      const newStatus = action === 'pause' ? 'paused' : 'active';

      // Validate status transition
      if (action === 'pause' && currentStatus !== 'active') {
        socket.emit('session_error', {
          message: 'Can only pause active sessions',
          code: 'INVALID_STATUS_TRANSITION',
        });
        return;
      }

      if (action === 'resume' && currentStatus !== 'paused') {
        socket.emit('session_error', {
          message: 'Can only resume paused sessions',
          code: 'INVALID_STATUS_TRANSITION',
        });
        return;
      }

      // Update session status
      await pool.query(
        'UPDATE sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStatus, sessionId]
      );

      logWebSocketEvent('SESSION_CONTROL', socket.id, userId, { sessionId, action, newStatus });

      // Notify all clients in the session
      io.to(`session_${sessionId}`).emit('session_status_changed', {
        sessionId,
        status: newStatus,
        action,
      });
    } catch (error) {
      logError(error, { context: 'session_control', userId, socketId: socket.id });
      socket.emit('session_error', {
        message: 'Failed to control session',
        code: 'SESSION_CONTROL_ERROR',
      });
    }
  });
};

const setupMessageHandlers = socket => {
  const userId = socket.userId;

  // Handle user messages (questions, responses)
  socket.on('send_message', async data => {
    try {
      const { sessionId, content, messageType = 'answer' } = data;

      if (!sessionId || !content) {
        socket.emit('error', { message: 'Session ID and content are required' });
        return;
      }

      // Verify session is active and belongs to user
      const sessionQuery = `
        SELECT status, session_type, difficulty FROM sessions 
        WHERE id = $1 AND user_id = $2 AND status IN ('active', 'paused')
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, userId]);

      if (sessionResult.rows.length === 0) {
        socket.emit('message_error', {
          message: 'Session not found or not accessible',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }

      const session = sessionResult.rows[0];

      // Save user message to database
      const messageId = uuidv4();
      const insertMessageQuery = `
        INSERT INTO interview_messages (
          id, session_id, message_type, content, timestamp
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING id, timestamp
      `;

      const messageResult = await pool.query(insertMessageQuery, [
        messageId,
        sessionId,
        messageType,
        content,
      ]);

      const savedMessage = messageResult.rows[0];

      // Broadcast message to session
      const userMessage = {
        id: savedMessage.id,
        type: messageType,
        content,
        timestamp: savedMessage.timestamp,
        userId,
      };

      io.to(`session_${sessionId}`).emit('new_message', userMessage);

      logWebSocketEvent('MESSAGE_SENT', socket.id, userId, {
        sessionId,
        messageType,
        contentLength: content.length,
      });

      // Generate AI response if it's a user answer and session is active
      if (messageType === 'answer' && session.status === 'active') {
        await generateAIResponse(sessionId, content, session);
      }
    } catch (error) {
      logError(error, { context: 'send_message', userId, socketId: socket.id });
      socket.emit('message_error', {
        message: 'Failed to send message',
        code: 'MESSAGE_SEND_ERROR',
      });
    }
  });

  // Handle typing indicators
  socket.on('typing', data => {
    try {
      const { sessionId, isTyping } = data;
      if (sessionId) {
        socket.to(`session_${sessionId}`).emit('user_typing', {
          userId,
          isTyping,
          sessionId,
        });
      }
    } catch (error) {
      logError(error, { context: 'typing', userId, socketId: socket.id });
    }
  });
};

const setupDisconnectHandlers = socket => {
  const userId = socket.userId;

  socket.on('disconnect', async reason => {
    try {
      logWebSocketEvent('USER_DISCONNECTED', socket.id, userId, { reason });

      // Remove connection from Redis
      await socketManager.removeConnection(userId);

      // Leave current session if any
      if (socket.currentSessionId) {
        socket.leave(`session_${socket.currentSessionId}`);

        // Notify session about user leaving
        socket.to(`session_${socket.currentSessionId}`).emit('user_left', {
          userId,
          sessionId: socket.currentSessionId,
        });
      }
    } catch (error) {
      logError(error, { context: 'disconnect', userId, socketId: socket.id });
    }
  });

  socket.on('error', error => {
    logError(error, { context: 'socket_error', userId, socketId: socket.id });
  });
};

const generateAIResponse = async (sessionId, userMessage, session) => {
  try {
    // Get conversation history
    const historyQuery = `
      SELECT message_type, content 
      FROM interview_messages 
      WHERE session_id = $1 
      ORDER BY timestamp ASC 
      LIMIT 10
    `;
    const historyResult = await pool.query(historyQuery, [sessionId]);

    const conversationHistory = historyResult.rows.map(msg => ({
      role: msg.message_type === 'answer' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Generate AI response
    const aiResponse = await aiService.generateInterviewResponse(
      userMessage,
      session.session_type,
      session.difficulty,
      conversationHistory
    );

    if (aiResponse) {
      // Save AI response to database
      const messageId = uuidv4();
      const insertAIMessageQuery = `
        INSERT INTO interview_messages (
          id, session_id, message_type, content, timestamp, metadata
        ) VALUES ($1, $2, 'question', $3, CURRENT_TIMESTAMP, $4)
        RETURNING id, timestamp
      `;

      const metadata = {
        type: 'interview_question',
        difficulty: session.difficulty,
        sessionType: session.session_type,
      };

      const aiMessageResult = await pool.query(insertAIMessageQuery, [
        messageId,
        sessionId,
        aiResponse,
        JSON.stringify(metadata),
      ]);

      const savedAIMessage = aiMessageResult.rows[0];

      // Broadcast AI response to session
      const responseMessage = {
        id: savedAIMessage.id,
        type: 'ai_response',
        content: aiResponse,
        timestamp: savedAIMessage.timestamp,
        metadata,
      };

      io.to(`session_${sessionId}`).emit('new_message', responseMessage);

      logWebSocketEvent('AI_RESPONSE_SENT', null, null, {
        sessionId,
        responseLength: aiResponse.length,
      });
    }
  } catch (error) {
    logError(error, { context: 'generateAIResponse', sessionId });

    // Send error message to session
    io.to(`session_${sessionId}`).emit('ai_error', {
      message: 'Failed to generate AI response',
      code: 'AI_RESPONSE_ERROR',
    });
  }
};

// Utility functions for external use
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

const emitToSession = (sessionId, event, data) => {
  if (io) {
    io.to(`session_${sessionId}`).emit(event, data);
  }
};

const getConnectedUsers = async () => {
  if (!io) return [];

  const sockets = await io.fetchSockets();
  return sockets.map(socket => ({
    userId: socket.userId,
    userEmail: socket.userEmail,
    socketId: socket.id,
    currentSession: socket.currentSessionId || null,
  }));
};

const isUserConnected = async userId => {
  const connection = await socketManager.getConnection(userId);
  return !!connection;
};

module.exports = {
  initializeWebSocket,
  emitToUser,
  emitToSession,
  getConnectedUsers,
  isUserConnected,
  // Export the io instance for alert service
  getIO: () => io,
};
