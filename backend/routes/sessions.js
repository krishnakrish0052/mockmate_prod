import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, param, validationResult } from 'express-validator';
import { getDatabase } from '../config/database.js';
import { cache, sessionManager } from '../config/redis.js';
import { authenticateToken, requireCredits, userRateLimit } from '../middleware/auth.js';
import { logError, logSessionEvent } from '../config/logger.js';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

const router = express.Router();

// Validation rules
const createSessionValidation = [
  body('jobTitle')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Job title must be 2-100 characters'),
  body('jobDescription')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Job description cannot exceed 2000 characters'),
  body('difficulty')
    .isIn(['beginner', 'intermediate', 'advanced', 'easy', 'medium', 'hard', 'expert'])
    .withMessage(
      'Difficulty must be beginner, intermediate, advanced, easy, medium, hard, or expert'
    ),
  body('duration')
    .isInt({ min: 5, max: 120 })
    .withMessage('Duration must be between 5 and 120 minutes'),
  body('sessionType')
    .isIn(['behavioral', 'technical', 'mixed'])
    .withMessage('Session type must be behavioral, technical, or mixed'),
  body('resumeId').optional().isUUID().withMessage('Resume ID must be a valid UUID'),
];

const updateSessionValidation = [
  param('sessionId').isUUID().withMessage('Session ID must be a valid UUID'),
  body('status')
    .optional()
    .isIn(['created', 'active', 'paused', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  body('feedback')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Feedback cannot exceed 5000 characters'),
];

// Create a new interview session
router.post(
  '/create',
  authenticateToken,
  requireCredits(1),
  userRateLimit(10, 60000), // 10 sessions per minute
  createSessionValidation,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { jobTitle, jobDescription, difficulty, duration, sessionType, resumeId } = req.body;

      const sessionId = uuidv4();

      // Validate resume belongs to user if provided
      if (resumeId) {
        const pool = getPool();
        const resumeQuery = 'SELECT id FROM user_resumes WHERE id = $1 AND user_id = $2';
        const resumeResult = await pool.query(resumeQuery, [resumeId, req.user.id]);

        if (resumeResult.rows.length === 0) {
          return res.status(400).json({
            error: 'Resume not found or does not belong to user',
            code: 'INVALID_RESUME',
          });
        }
      }

      // Fixed credit cost: 1 credit per session regardless of duration or difficulty
      const totalCreditCost = 1;

      // Check if user has enough credits
      if (req.user.credits < totalCreditCost) {
        return res.status(403).json({
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: totalCreditCost,
          current: req.user.credits,
        });
      }

      // Create session in database with proper transaction handling
      const pool = getPool();
      const client = await pool.connect();
      let session;
      
      try {
        await client.query('BEGIN');
        
        // Verify user exists and get user info
        const userQuery = 'SELECT id, credits FROM users WHERE id = $1 AND is_active = true';
        const userResult = await client.query(userQuery, [req.user.id]);
        
        if (userResult.rows.length === 0) {
          throw new Error('User not found or inactive');
        }
        
        const user = userResult.rows[0];
        
        // Double-check credits in database
        if (user.credits < totalCreditCost) {
          throw new Error(`Insufficient credits: required ${totalCreditCost}, available ${user.credits}`);
        }
        
        const createSessionQuery = `
          INSERT INTO sessions (
            id, user_id, session_name, job_title, job_description, difficulty_level, 
            estimated_duration_minutes, interview_type, resume_id,
            status, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'created', CURRENT_TIMESTAMP)
          RETURNING *
        `;

        const sessionResult = await client.query(createSessionQuery, [
          sessionId,
          req.user.id,
          jobTitle, // Using job_title as session_name for now
          jobTitle,
          jobDescription || null,
          difficulty,
          duration,
          sessionType,
          resumeId || null,
        ]);

        if (sessionResult.rows.length === 0) {
          throw new Error('Failed to create session - no data returned');
        }
        
        session = sessionResult.rows[0];
        
        await client.query('COMMIT');
        console.log('✅ Session created successfully in database:', sessionId);
        
      } catch (dbError) {
        await client.query('ROLLBACK');
        console.error('❌ Database error during session creation:', dbError);
        
        // Handle specific error cases
        if (dbError.code === '23503') { // Foreign key violation
          return res.status(400).json({
            error: 'Invalid user reference or associated data not found',
            code: 'INVALID_USER_REFERENCE',
            details: 'The user account may not exist or be inactive'
          });
        } else if (dbError.code === '23505') { // Unique violation
          return res.status(409).json({
            error: 'Session with this ID already exists',
            code: 'DUPLICATE_SESSION_ID',
          });
        } else {
          throw dbError; // Re-throw to be caught by outer catch
        }
      } finally {
        client.release();
      }

      // Store session data in Redis for quick access (only if DB insert succeeded)
      try {
        await sessionManager.storeSession(
          sessionId,
          {
            userId: req.user.id,
            status: 'created',
            jobTitle,
            difficulty,
            duration,
            sessionType,
            creditCost: totalCreditCost,
            createdAt: session.created_at,
          },
          24 * 60 * 60
        ); // 24 hours
        console.log('✅ Session stored in Redis cache:', sessionId);
      } catch (redisError) {
        console.error('⚠️ Redis cache error (non-fatal):', redisError);
        // Don't fail the request if Redis fails, session is in DB
      }

      logSessionEvent('SESSION_CREATED', sessionId, req.user.id, {
        jobTitle,
        difficulty,
        duration,
        sessionType,
        creditCost: totalCreditCost,
      });

      res.status(201).json({
        message: 'Session created successfully',
        session: {
          id: session.id,
          jobTitle: session.job_title,
          jobDescription: session.job_description,
          difficulty: session.difficulty_level,
          duration: session.estimated_duration_minutes,
          sessionType: session.interview_type,
          resumeId: session.resume_id,
          creditCost: totalCreditCost, // Use calculated value since not stored in DB
          status: session.status,
          createdAt: session.created_at,
        },
      });
    } catch (error) {
      logError(error, { endpoint: 'sessions/create', userId: req.user?.id });
      res.status(500).json({
        error: 'Failed to create session',
        code: 'SESSION_CREATION_ERROR',
      });
    }
  }
);

// Start an interview session
router.post(
  '/:sessionId/start',
  authenticateToken,
  userRateLimit(5, 60000),
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;

      // Get session from database
      const pool = getPool();
      const sessionQuery = `
        SELECT * FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be started
      if (session.status !== 'created') {
        return res.status(400).json({
          error: `Session cannot be started from ${session.status} status`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      // Fixed credit cost: 1 credit per session regardless of duration or difficulty
      const creditCost = 1;

      // Check if user has enough credits
      if (req.user.credits < creditCost) {
        return res.status(403).json({
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: creditCost,
          current: req.user.credits,
        });
      }

      // Start transaction to deduct credits and start session
      await pool.query('BEGIN');

      try {
        // Deduct credits
        await pool.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [
          creditCost,
          req.user.id,
        ]);

        // Record credit transaction
        await pool.query(
          `
          INSERT INTO credit_transactions (
            user_id, session_id, credits_amount, transaction_type, description
          ) VALUES ($1, $2, $3, 'usage', $4)
        `,
          [
            req.user.id,
            sessionId,
            -creditCost, // Negative for deduction
            `Interview session: ${session.job_title}`,
          ]
        );

        // Update session status and start time
        await pool.query(
          `
          UPDATE sessions 
          SET status = 'active', started_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `,
          [sessionId]
        );

        await pool.query('COMMIT');

        // Update session in Redis
        const sessionData = (await sessionManager.getSession(sessionId)) || {};
        await sessionManager.storeSession(
          sessionId,
          {
            ...sessionData,
            status: 'active',
            startedAt: new Date(),
            creditsDeducted: true,
          },
          24 * 60 * 60
        );

        // Initialize session messages if needed
        await cache.set(`session_messages:${sessionId}`, [], 24 * 60 * 60);

        logSessionEvent('SESSION_STARTED', sessionId, req.user.id, {
          creditCost: creditCost,
          remainingCredits: req.user.credits - creditCost,
        });

        res.json({
          message: 'Session started successfully',
          session: {
            id: sessionId,
            status: 'active',
            startedAt: new Date(),
            creditCost: creditCost,
            remainingCredits: req.user.credits - creditCost,
          },
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/start',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to start session',
        code: 'SESSION_START_ERROR',
      });
    }
  }
);

// Get session details
router.get('/:sessionId', authenticateToken, [param('sessionId').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { sessionId } = req.params;

    // Get session from database with resume details
    const pool = getPool();
    const sessionQuery = `
        SELECT s.*, ur.file_name as resume_filename, ur.parsed_content as resume_content
        FROM sessions s
        LEFT JOIN user_resumes ur ON s.resume_id = ur.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
    const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    }

    const session = sessionResult.rows[0];

    // Get session messages
    const messagesQuery = `
        SELECT id, message_type, content, timestamp, metadata
        FROM interview_messages 
        WHERE session_id = $1 
        ORDER BY timestamp ASC
      `;
    const messagesResult = await pool.query(messagesQuery, [sessionId]);

    res.json({
      session: {
        id: session.id,
        jobTitle: session.job_title,
        jobDescription: session.job_description,
        difficulty: session.difficulty_level,
        duration: session.estimated_duration_minutes,
        sessionType: session.interview_type,
        status: session.status,
        creditCost: null, // Not stored in new schema
        createdAt: session.created_at,
        startedAt: session.started_at,
        completedAt: session.ended_at, // Use ended_at instead of completed_at
        feedback: session.session_notes, // Use session_notes instead of feedback
        score: null, // Not in new schema
        resume: session.resume_filename
          ? {
              id: session.resume_id,
              filename: session.resume_filename,
              content: session.resume_content,
            }
          : null,
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        type: msg.message_type,
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: msg.metadata,
      })),
    });
  } catch (error) {
    logError(error, {
      endpoint: 'sessions/get',
      userId: req.user?.id,
      sessionId: req.params.sessionId,
    });
    res.status(500).json({
      error: 'Failed to get session',
      code: 'SESSION_GET_ERROR',
    });
  }
});

// Update session (pause, resume, complete, cancel)
router.put('/:sessionId', authenticateToken, updateSessionValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { sessionId } = req.params;
    const { status, feedback } = req.body;

    // Get current session
    const pool = getPool();
    const sessionQuery = 'SELECT * FROM sessions WHERE id = $1 AND user_id = $2';
    const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    }

    const currentSession = sessionResult.rows[0];

    // Validate status transition
    const validTransitions = {
      created: ['active', 'cancelled'],
      active: ['paused', 'completed', 'cancelled'],
      paused: ['active', 'completed', 'cancelled'],
      completed: [], // No transitions allowed
      cancelled: [], // No transitions allowed
    };

    if (status && !validTransitions[currentSession.status].includes(status)) {
      return res.status(400).json({
        error: `Invalid status transition from ${currentSession.status} to ${status}`,
        code: 'INVALID_STATUS_TRANSITION',
        allowedTransitions: validTransitions[currentSession.status],
      });
    }

    // Build update query
    const updateFields = ['updated_at = CURRENT_TIMESTAMP'];
    const updateValues = [];
    let paramIndex = 1;

    if (status) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(status);

      if (status === 'completed') {
        updateFields.push(`ended_at = CURRENT_TIMESTAMP`);
      }
    }

    if (feedback !== undefined) {
      updateFields.push(`session_notes = $${paramIndex++}`);
      updateValues.push(feedback);
    }

    // Update session
    const updateQuery = `
        UPDATE sessions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;
    updateValues.push(sessionId, req.user.id);

    const updatedResult = await pool.query(updateQuery, updateValues);
    const updatedSession = updatedResult.rows[0];

    // Update Redis cache
    const sessionData = (await sessionManager.getSession(sessionId)) || {};
    await sessionManager.storeSession(
      sessionId,
      {
        ...sessionData,
        status: updatedSession.status,
        feedback: updatedSession.feedback,
        completedAt: updatedSession.completed_at,
        updatedAt: updatedSession.updated_at,
      },
      24 * 60 * 60
    );

    logSessionEvent('SESSION_UPDATED', sessionId, req.user.id, {
      previousStatus: currentSession.status,
      newStatus: updatedSession.status,
      hasFeedback: !!feedback,
    });

    res.json({
      message: 'Session updated successfully',
      session: {
        id: updatedSession.id,
        status: updatedSession.status,
        feedback: updatedSession.feedback,
        completedAt: updatedSession.completed_at,
        updatedAt: updatedSession.updated_at,
      },
    });
  } catch (error) {
    logError(error, {
      endpoint: 'sessions/update',
      userId: req.user?.id,
      sessionId: req.params.sessionId,
    });
    res.status(500).json({
      error: 'Failed to update session',
      code: 'SESSION_UPDATE_ERROR',
    });
  }
});

// Get user's sessions with pagination and filtering
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      sessionType,
      difficulty,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE conditions
    const conditions = ['user_id = $1'];
    const values = [req.user.id];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (sessionType) {
      conditions.push(`interview_type = $${paramIndex++}`);
      values.push(sessionType);
    }

    if (difficulty) {
      conditions.push(`difficulty_level = $${paramIndex++}`);
      values.push(difficulty);
    }

    // Validate sort parameters
    const allowedSortFields = ['created_at', 'started_at', 'ended_at', 'job_title', 'status'];
    const allowedSortOrders = ['asc', 'desc'];

    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = allowedSortOrders.includes(sortOrder.toLowerCase())
      ? sortOrder.toLowerCase()
      : 'desc';

    // Get sessions
    const pool = getPool();
    const sessionsQuery = `
        SELECT id, job_title, job_description, difficulty_level, estimated_duration_minutes,
               interview_type, status, created_at, started_at, ended_at
        FROM sessions 
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${finalSortBy} ${finalSortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
    values.push(parseInt(limit), offset);

    const sessionsResult = await pool.query(sessionsQuery, values);

    // Get total count
    const countQuery = `
        SELECT COUNT(*) as total
        FROM sessions 
        WHERE ${conditions.join(' AND ')}
      `;
    const countResult = await pool.query(countQuery, values.slice(0, -2)); // Remove limit and offset

    const totalSessions = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalSessions / parseInt(limit));

    res.json({
      sessions: sessionsResult.rows.map(session => ({
        id: session.id,
        jobTitle: session.job_title,
        jobDescription: session.job_description,
        difficulty: session.difficulty_level,
        duration: session.estimated_duration_minutes,
        sessionType: session.interview_type,
        status: session.status,
        creditCost: null, // Not stored in new schema
        score: null, // Not stored in new schema
        createdAt: session.created_at,
        startedAt: session.started_at,
        completedAt: session.ended_at,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalSessions,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'sessions/list', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to get sessions',
      code: 'SESSIONS_LIST_ERROR',
    });
  }
});

// Desktop connection endpoint - Connect desktop app to session
router.post(
  '/:sessionId/desktop-connect',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    try {
      const { sessionId } = req.params;
      const { desktop_app, app_version } = req.body;

      // Get session from database
      const pool = getPool();
      const sessionQuery = `
        SELECT s.*, ur.file_name as resume_filename, ur.parsed_content as resume_content
        FROM sessions s
        LEFT JOIN user_resumes ur ON s.resume_id = ur.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Session not found or access denied',
        });
      }

      const session = sessionResult.rows[0];

      // Update session to mark desktop as connected
      const updateQuery = `
        UPDATE sessions 
        SET desktop_connected = true, 
            websocket_connection_id = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;

      const connectionId = `desktop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await pool.query(updateQuery, [connectionId, sessionId]);

      // Update Redis session data
      const sessionData = (await sessionManager.getSession(sessionId)) || {};
      await sessionManager.storeSession(sessionId, {
        ...sessionData,
        desktop_connected: true,
        connection_id: connectionId,
        desktop_app_version: app_version || 'unknown',
        last_connected: new Date().toISOString(),
      });

      logSessionEvent('DESKTOP_CONNECTED', sessionId, req.user.id, {
        app_version,
        connection_id: connectionId,
      });

      // Return session info for desktop app
      res.json({
        success: true,
        message: 'Desktop app connected successfully',
        session: {
          id: session.id,
          status: session.status,
          job_title: session.job_title,
          company_name: session.company_name,
          job_description: session.job_description,
          interview_type: session.interview_type,
          difficulty_level: session.difficulty_level,
          estimated_duration_minutes: session.estimated_duration_minutes,
          created_at: session.created_at,
          desktop_connected: true,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/desktop-connect',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to connect desktop app to session',
        code: 'DESKTOP_CONNECTION_ERROR',
      });
    }
  }
);

// Desktop session activation - Start session and deduct credits (called by desktop app)
router.post(
  '/:sessionId/desktop-activate',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    try {
      const { sessionId } = req.params;
      const { desktop_app_version } = req.body;

      // Get session from database
      const pool = getPool();
      const sessionQuery = `
        SELECT * FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be activated
      if (session.status !== 'created') {
        return res.status(400).json({
          success: false,
          error: `Session cannot be activated from ${session.status} status`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      // Fixed credit cost: 1 credit per session regardless of duration or difficulty
      const creditCost = 1;

      // Check if user has enough credits
      if (req.user.credits < creditCost) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: creditCost,
          current: req.user.credits,
        });
      }

      // Start transaction to deduct credits and activate session
      await pool.query('BEGIN');

      try {
        // Deduct credits
        await pool.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [
          creditCost,
          req.user.id,
        ]);

        // Record credit transaction
        await pool.query(
          `
          INSERT INTO credit_transactions (
            user_id, session_id, credits_amount, transaction_type, description
          ) VALUES ($1, $2, $3, 'usage', $4)
        `,
          [
            req.user.id,
            sessionId,
            -creditCost, // Negative for deduction
            `Desktop interview session: ${session.job_title}`,
          ]
        );

        // Update session status and mark as activated by desktop
        await pool.query(
          `
          UPDATE sessions 
          SET status = 'active', 
              started_at = CURRENT_TIMESTAMP,
              desktop_connected = true,
              desktop_app_version = $1
          WHERE id = $2
        `,
          [desktop_app_version || 'unknown', sessionId]
        );

        await pool.query('COMMIT');

        // Update session in Redis
        const sessionData = (await sessionManager.getSession(sessionId)) || {};
        await sessionManager.storeSession(
          sessionId,
          {
            ...sessionData,
            status: 'active',
            startedAt: new Date(),
            creditsDeducted: true,
            desktop_connected: true,
            activatedByDesktop: true,
          },
          24 * 60 * 60
        );

        logSessionEvent('SESSION_ACTIVATED_BY_DESKTOP', sessionId, req.user.id, {
          creditCost: creditCost,
          remainingCredits: req.user.credits - creditCost,
          desktop_app_version,
        });

        res.json({
          success: true,
          message: 'Session activated successfully by desktop app',
          session: {
            id: sessionId,
            status: 'active',
            startedAt: new Date(),
            creditCost: creditCost,
            remainingCredits: req.user.credits - creditCost,
          },
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/desktop-activate',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to activate session',
        code: 'SESSION_ACTIVATION_ERROR',
      });
    }
  }
);

// Delete session (enhanced - allow deletion with confirmation)
router.delete('/:sessionId', authenticateToken, [param('sessionId').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { sessionId } = req.params;
    const { force = false } = req.query; // Allow force deletion for completed sessions

    // Check if session exists and belongs to user
    const pool = getPool();
    const sessionQuery = 'SELECT * FROM sessions WHERE id = $1 AND user_id = $2';
    const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    }

    const session = sessionResult.rows[0];

    // Allow deletion of 'created' sessions without confirmation
    // For other statuses, require force=true query parameter
    if (session.status !== 'created' && !force) {
      return res.status(400).json({
        error: 'Session has been started. Use force=true to delete completed sessions.',
        code: 'SESSION_DELETION_REQUIRES_CONFIRMATION',
        currentStatus: session.status,
        suggestion: 'Add ?force=true to the request to delete this session permanently',
      });
    }

    // Start transaction to delete session and all related data
    await pool.query('BEGIN');

    try {
      // Delete interview messages first (due to foreign key constraints)
      await pool.query('DELETE FROM interview_messages WHERE session_id = $1', [sessionId]);

      // Delete credit transactions related to this session
      await pool.query('DELETE FROM credit_transactions WHERE session_id = $1', [sessionId]);

      // Delete the session
      await pool.query('DELETE FROM sessions WHERE id = $1 AND user_id = $2', [
        sessionId,
        req.user.id,
      ]);

      await pool.query('COMMIT');

      // Remove from Redis
      await sessionManager.deleteSession(sessionId);
      await cache.del(`session_messages:${sessionId}`);

      logSessionEvent('SESSION_DELETED', sessionId, req.user.id, {
        force,
        status: session.status,
      });

      res.json({
        message: 'Session and all related data deleted successfully',
        deletedSession: {
          id: sessionId,
          status: session.status,
          jobTitle: session.job_title,
        },
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logError(error, {
      endpoint: 'sessions/delete',
      userId: req.user?.id,
      sessionId: req.params.sessionId,
    });
    res.status(500).json({
      error: 'Failed to delete session',
      code: 'SESSION_DELETE_ERROR',
    });
  }
});

// Edit session (only if not started)
router.patch(
  '/:sessionId/edit',
  authenticateToken,
  [
    param('sessionId').isUUID().withMessage('Session ID must be a valid UUID'),
    body('jobTitle')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Job title must be 2-100 characters'),
    body('jobDescription')
      .optional()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Job description cannot exceed 2000 characters'),
    body('difficulty')
      .optional()
      .isIn(['beginner', 'intermediate', 'advanced', 'easy', 'medium', 'hard', 'expert'])
      .withMessage(
        'Difficulty must be beginner, intermediate, advanced, easy, medium, hard, or expert'
      ),
    body('duration')
      .optional()
      .isInt({ min: 5, max: 120 })
      .withMessage('Duration must be between 5 and 120 minutes'),
    body('sessionType')
      .optional()
      .isIn(['behavioral', 'technical', 'mixed'])
      .withMessage('Session type must be behavioral, technical, or mixed'),
    body('sessionName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Session name must be 2-100 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const updateData = req.body;

      // Get current session
      const pool = getPool();
      const sessionQuery = 'SELECT * FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const currentSession = sessionResult.rows[0];

      // Only allow editing sessions that haven't started
      if (currentSession.status !== 'created') {
        return res.status(400).json({
          error: 'Can only edit sessions that have not been started',
          code: 'INVALID_SESSION_STATUS',
          currentStatus: currentSession.status,
        });
      }

      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (updateData.jobTitle !== undefined) {
        updateFields.push(`job_title = $${paramIndex}`);
        updateFields.push(`session_name = $${paramIndex}`); // Also update session_name
        updateValues.push(updateData.jobTitle);
        paramIndex++;
      }

      if (updateData.sessionName !== undefined) {
        updateFields.push(`session_name = $${paramIndex}`);
        updateValues.push(updateData.sessionName);
        paramIndex++;
      }

      if (updateData.jobDescription !== undefined) {
        updateFields.push(`job_description = $${paramIndex}`);
        updateValues.push(updateData.jobDescription);
        paramIndex++;
      }

      if (updateData.difficulty !== undefined) {
        updateFields.push(`difficulty_level = $${paramIndex}`);
        updateValues.push(updateData.difficulty);
        paramIndex++;
      }

      if (updateData.duration !== undefined) {
        updateFields.push(`estimated_duration_minutes = $${paramIndex}`);
        updateValues.push(updateData.duration);
        paramIndex++;
      }

      if (updateData.sessionType !== undefined) {
        updateFields.push(`interview_type = $${paramIndex}`);
        updateValues.push(updateData.sessionType);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          error: 'No fields provided for update',
          code: 'NO_UPDATE_FIELDS',
        });
      }

      // Add updated_at timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      // Execute update
      updateValues.push(sessionId, req.user.id);
      const updateQuery = `
        UPDATE sessions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
      `;

      const updatedResult = await pool.query(updateQuery, updateValues);
      const updatedSession = updatedResult.rows[0];

      // Update Redis cache
      const sessionData = (await sessionManager.getSession(sessionId)) || {};
      await sessionManager.storeSession(
        sessionId,
        {
          ...sessionData,
          jobTitle: updatedSession.job_title,
          difficulty: updatedSession.difficulty_level,
          duration: updatedSession.estimated_duration_minutes,
          sessionType: updatedSession.interview_type,
          updatedAt: updatedSession.updated_at,
        },
        24 * 60 * 60
      );

      logSessionEvent('SESSION_EDITED', sessionId, req.user.id, {
        updatedFields: Object.keys(updateData),
        previousData: {
          jobTitle: currentSession.job_title,
          difficulty: currentSession.difficulty_level,
          duration: currentSession.estimated_duration_minutes,
          sessionType: currentSession.interview_type,
        },
      });

      res.json({
        message: 'Session updated successfully',
        session: {
          id: updatedSession.id,
          sessionName: updatedSession.session_name,
          jobTitle: updatedSession.job_title,
          jobDescription: updatedSession.job_description,
          difficulty: updatedSession.difficulty_level,
          duration: updatedSession.estimated_duration_minutes,
          sessionType: updatedSession.interview_type,
          status: updatedSession.status,
          createdAt: updatedSession.created_at,
          updatedAt: updatedSession.updated_at,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/edit',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to edit session',
        code: 'SESSION_EDIT_ERROR',
      });
    }
  }
);

// Get detailed session history (questions and answers)
router.get(
  '/:sessionId/history',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { format = 'json' } = req.query;

      // Get session details
      const pool = getPool();
      const sessionQuery = `
        SELECT s.*, u.name as user_name, u.email as user_email,
               ur.file_name as resume_filename
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN user_resumes ur ON s.resume_id = ur.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Allow history for all sessions, but note when session is not completed
      // We'll show whatever data is available

      // Get detailed interview messages
      const messagesQuery = `
        SELECT id, message_type, content, timestamp, metadata
        FROM interview_messages 
        WHERE session_id = $1 
        ORDER BY timestamp ASC
      `;
      const messagesResult = await pool.query(messagesQuery, [sessionId]);

      // Process messages to create Q&A pairs
      const messages = messagesResult.rows;
      const qaHistory = [];
      const interactionLog = [];

      // Group questions with their answers
      let currentQuestion = null;
      let questionCount = 0;

      messages.forEach(msg => {
        interactionLog.push({
          id: msg.id,
          type: msg.message_type,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata || {},
        });

        // Handle both old and new message type formats
        const isQuestion = msg.message_type === 'question' || msg.message_type === 'ai_response';
        const isAnswer = msg.message_type === 'answer' || msg.message_type === 'user_message';
        const isFeedback = msg.message_type === 'feedback';

        if (isQuestion) {
          if (currentQuestion) {
            // Previous question without answer
            qaHistory.push({
              questionNumber: ++questionCount,
              question: currentQuestion.content,
              questionTime: currentQuestion.timestamp,
              answer: null,
              answerTime: null,
              responseTime: null,
              feedback: null,
            });
          }
          currentQuestion = msg;
        } else if (isAnswer && currentQuestion) {
          const responseTime = new Date(msg.timestamp) - new Date(currentQuestion.timestamp);
          qaHistory.push({
            questionNumber: ++questionCount,
            question: currentQuestion.content,
            questionTime: currentQuestion.timestamp,
            answer: msg.content,
            answerTime: msg.timestamp,
            responseTime: Math.round(responseTime / 1000), // seconds
            feedback: null, // Will be filled by feedback messages
          });
          currentQuestion = null;
        } else if (isFeedback && qaHistory.length > 0) {
          // Attach feedback to the last Q&A pair
          qaHistory[qaHistory.length - 1].feedback = msg.content;
        }
      });

      // Handle last question if no answer
      if (currentQuestion) {
        qaHistory.push({
          questionNumber: ++questionCount,
          question: currentQuestion.content,
          questionTime: currentQuestion.timestamp,
          answer: null,
          answerTime: null,
          responseTime: null,
          feedback: null,
        });
      }

      // Calculate session statistics
      const statistics = {
        totalQuestions: qaHistory.length,
        answeredQuestions: qaHistory.filter(qa => qa.answer).length,
        averageResponseTime: qaHistory
          .filter(qa => qa.responseTime)
          .reduce((acc, qa, _, arr) => acc + qa.responseTime / arr.length, 0),
        sessionDuration:
          session.started_at && session.ended_at
            ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000) // seconds
            : null,
        completionRate:
          qaHistory.length > 0
            ? Math.round((qaHistory.filter(qa => qa.answer).length / qaHistory.length) * 100)
            : 0,
      };

      const historyData = {
        session: {
          id: session.id,
          sessionName: session.session_name,
          jobTitle: session.job_title,
          jobDescription: session.job_description,
          difficulty: session.difficulty_level,
          sessionType: session.interview_type,
          status: session.status,
          createdAt: session.created_at,
          startedAt: session.started_at,
          completedAt: session.ended_at,
          user: {
            name: session.user_name,
            email: session.user_email,
          },
          resume: session.resume_filename || null,
        },
        qaHistory,
        interactionLog,
        statistics,
      };

      res.json(historyData);
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/history',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to get session history',
        code: 'SESSION_HISTORY_ERROR',
      });
    }
  }
);

// Download session history as PDF
router.get(
  '/:sessionId/download-pdf',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;

      // Get session history (reuse the history endpoint logic)
      const pool = getPool();
      const sessionQuery = `
        SELECT s.*, u.name as user_name, u.email as user_email,
               ur.file_name as resume_filename
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN user_resumes ur ON s.resume_id = ur.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      if (session.status !== 'completed') {
        return res.status(400).json({
          error: 'Can only download PDF for completed sessions',
          code: 'SESSION_NOT_COMPLETED',
          currentStatus: session.status,
        });
      }

      // Get messages and create Q&A history
      const messagesQuery = `
        SELECT id, message_type, content, timestamp, metadata
        FROM interview_messages 
        WHERE session_id = $1 
        ORDER BY timestamp ASC
      `;
      const messagesResult = await pool.query(messagesQuery, [sessionId]);
      const messages = messagesResult.rows;

      // Process messages (same logic as history endpoint)
      const qaHistory = [];
      let currentQuestion = null;
      let questionCount = 0;

      messages.forEach(msg => {
        if (msg.message_type === 'question') {
          if (currentQuestion) {
            qaHistory.push({
              questionNumber: ++questionCount,
              question: currentQuestion.content,
              questionTime: currentQuestion.timestamp,
              answer: null,
              answerTime: null,
              feedback: null,
            });
          }
          currentQuestion = msg;
        } else if (msg.message_type === 'answer' && currentQuestion) {
          const responseTime = new Date(msg.timestamp) - new Date(currentQuestion.timestamp);
          qaHistory.push({
            questionNumber: ++questionCount,
            question: currentQuestion.content,
            questionTime: currentQuestion.timestamp,
            answer: msg.content,
            answerTime: msg.timestamp,
            responseTime: Math.round(responseTime / 1000),
            feedback: null,
          });
          currentQuestion = null;
        } else if (msg.message_type === 'feedback' && qaHistory.length > 0) {
          qaHistory[qaHistory.length - 1].feedback = msg.content;
        }
      });

      // Handle last question
      if (currentQuestion) {
        qaHistory.push({
          questionNumber: ++questionCount,
          question: currentQuestion.content,
          questionTime: currentQuestion.timestamp,
          answer: null,
          answerTime: null,
          feedback: null,
        });
      }

      // Create PDF
      const doc = new PDFDocument({ margin: 50 });
      const filename = `interview-session-${sessionId}.pdf`;

      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Pipe the PDF to the response
      doc.pipe(res);

      // Add header
      doc.fontSize(20).text('MockMate Interview Session Report', { align: 'center' });
      doc.moveDown();

      // Session details
      doc.fontSize(16).text('Session Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Session Name: ${session.session_name || session.job_title}`);
      doc.text(`Job Title: ${session.job_title}`);
      doc.text(`Company: ${session.company_name || 'Not specified'}`);
      doc.text(`Difficulty: ${session.difficulty_level}`);
      doc.text(`Type: ${session.interview_type}`);
      doc.text(`Status: ${session.status}`);
      doc.text(`Created: ${new Date(session.created_at).toLocaleString()}`);
      if (session.started_at) {
        doc.text(`Started: ${new Date(session.started_at).toLocaleString()}`);
      }
      if (session.ended_at) {
        doc.text(`Completed: ${new Date(session.ended_at).toLocaleString()}`);
        const duration = Math.round(
          (new Date(session.ended_at) - new Date(session.started_at)) / 60000
        );
        doc.text(`Duration: ${duration} minutes`);
      }
      doc.moveDown();

      // User information
      doc.fontSize(16).text('Candidate Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Name: ${session.user_name}`);
      doc.text(`Email: ${session.user_email}`);
      if (session.resume_filename) {
        doc.text(`Resume: ${session.resume_filename}`);
      }
      doc.moveDown();

      // Statistics
      doc.fontSize(16).text('Session Statistics', { underline: true });
      doc.fontSize(12);
      const answeredCount = qaHistory.filter(qa => qa.answer).length;
      doc.text(`Total Questions: ${qaHistory.length}`);
      doc.text(`Answered Questions: ${answeredCount}`);
      doc.text(
        `Completion Rate: ${qaHistory.length > 0 ? Math.round((answeredCount / qaHistory.length) * 100) : 0}%`
      );

      const avgResponseTime = qaHistory
        .filter(qa => qa.responseTime)
        .reduce((acc, qa, _, arr) => acc + qa.responseTime / arr.length, 0);
      if (avgResponseTime > 0) {
        doc.text(`Average Response Time: ${Math.round(avgResponseTime)} seconds`);
      }
      doc.moveDown();

      // Questions and Answers
      if (qaHistory.length > 0) {
        doc.addPage();
        doc.fontSize(16).text('Interview Questions and Answers', { underline: true });
        doc.moveDown();

        qaHistory.forEach((qa, index) => {
          // Check if we need a new page
          if (doc.y > 700) {
            doc.addPage();
          }

          doc.fontSize(14).text(`Question ${qa.questionNumber}`, { underline: true });
          doc.fontSize(12).text(`Asked at: ${new Date(qa.questionTime).toLocaleString()}`);
          doc.fontSize(11).text(qa.question, { align: 'justify' });
          doc.moveDown(0.5);

          if (qa.answer) {
            doc.fontSize(14).text('Answer:', { underline: true });
            doc.fontSize(12).text(`Answered at: ${new Date(qa.answerTime).toLocaleString()}`);
            if (qa.responseTime) {
              doc.text(`Response Time: ${qa.responseTime} seconds`);
            }
            doc.fontSize(11).text(qa.answer, { align: 'justify' });

            if (qa.feedback) {
              doc.moveDown(0.5);
              doc.fontSize(14).text('Feedback:', { underline: true });
              doc.fontSize(11).text(qa.feedback, { align: 'justify' });
            }
          } else {
            doc.fontSize(12).text('No answer provided', { style: 'italic' });
          }

          doc.moveDown();

          // Add a separator line
          if (index < qaHistory.length - 1) {
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);
          }
        });
      }

      // Footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc
          .fontSize(10)
          .text(
            `Generated by MockMate on ${new Date().toLocaleString()}`,
            50,
            doc.page.height - 50,
            {
              align: 'center',
            }
          );
        doc.text(`Page ${i + 1} of ${pages.count}`, 50, doc.page.height - 35, {
          align: 'center',
        });
      }

      // Finalize the PDF
      doc.end();

      logSessionEvent('SESSION_PDF_DOWNLOADED', sessionId, req.user.id, {
        filename,
        questionsCount: qaHistory.length,
        answeredCount: answeredCount,
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/download-pdf',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to generate PDF',
        code: 'PDF_GENERATION_ERROR',
      });
    }
  }
);

// ========================================
// Phase 3: Desktop App Integration Endpoints
// ========================================

// Generate temporary desktop authentication token
router.post(
  '/:sessionId/generate-desktop-token',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;

      // Validate session exists and belongs to user
      const pool = getPool();
      const sessionQuery = `
        SELECT id, status, user_id
        FROM sessions
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be connected to
      if (session.status !== 'created') {
        return res.status(400).json({
          error: `Session cannot be connected from ${session.status} status`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      // Generate temporary token (valid for 10 minutes)
      const tempToken = uuidv4();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store temporary token in cache
      await cache.setex(
        `desktop_temp_token:${tempToken}`,
        600,
        JSON.stringify({
          userId: req.user.id,
          sessionId: sessionId,
          createdAt: new Date(),
          expiresAt: expiresAt,
        })
      );

      logSessionEvent('DESKTOP_TEMP_TOKEN_GENERATED', sessionId, req.user.id, {
        tempToken: tempToken.substring(0, 8) + '...', // Log partial token for debugging
        expiresAt: expiresAt,
      });

      res.json({
        message: 'Temporary desktop token generated successfully',
        tempToken: tempToken,
        expiresAt: expiresAt,
        sessionId: sessionId,
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/generate-desktop-token',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to generate desktop token',
        code: 'DESKTOP_TOKEN_ERROR',
      });
    }
  }
);

// Authenticate with temporary token and connect desktop app
router.post(
  '/:sessionId/connect-with-temp-token',
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { tempToken, desktop_version, platform } = req.body;

      if (!tempToken) {
        return res.status(400).json({
          error: 'Temporary token is required',
          code: 'MISSING_TEMP_TOKEN',
        });
      }

      // Validate temporary token from cache
      const tokenData = await cache.get(`desktop_temp_token:${tempToken}`);
      if (!tokenData) {
        return res.status(401).json({
          error: 'Invalid or expired temporary token',
          code: 'INVALID_TEMP_TOKEN',
        });
      }

      let parsedTokenData;
      try {
        parsedTokenData = JSON.parse(tokenData);
      } catch (parseError) {
        return res.status(401).json({
          error: 'Invalid temporary token format',
          code: 'INVALID_TEMP_TOKEN_FORMAT',
        });
      }

      // Check token expiration
      if (new Date() > new Date(parsedTokenData.expiresAt)) {
        return res.status(401).json({
          error: 'Temporary token has expired',
          code: 'TEMP_TOKEN_EXPIRED',
        });
      }

      // Verify session matches token
      if (parsedTokenData.sessionId !== sessionId) {
        return res.status(401).json({
          error: 'Token session mismatch',
          code: 'SESSION_TOKEN_MISMATCH',
        });
      }

      // Get session and user data
      const pool = getPool();
      const sessionQuery = `
        SELECT s.*, u.first_name, u.last_name, u.email, u.credits,
               ur.file_name as resume_filename, ur.parsed_content as resume_content
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN user_resumes ur ON s.resume_id = ur.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, parsedTokenData.userId]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be connected to
      if (session.status !== 'created') {
        return res.status(400).json({
          error: `Session cannot be connected from ${session.status} status`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      // Record desktop connection
      await pool.query(
        `
        INSERT INTO session_connections (
          session_id, desktop_app_version, connected_at
        ) VALUES ($1, $2, NOW())
      `,
        [sessionId, desktop_version || 'unknown']
      );

      // Update session with desktop connection info
      await pool.query(
        `
        UPDATE sessions 
        SET desktop_connected_at = NOW(), desktop_version = $2
        WHERE id = $1
      `,
        [sessionId, desktop_version]
      );

      // Immediately activate the session and deduct credits
      const creditCost = 1;
      if (session.credits < creditCost) {
        return res.status(403).json({
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: creditCost,
          current: session.credits,
        });
      }

      // Start transaction for credit deduction and session activation
      await pool.query('BEGIN');

      try {
        // Deduct 1 credit for session activation
        await pool.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [
          parsedTokenData.userId,
        ]);

        // Record credit transaction
        await pool.query(
          `
          INSERT INTO credit_transactions (
            user_id, session_id, credits_amount, transaction_type, description
          ) VALUES ($1, $2, $3, 'usage', $4)
        `,
          [
            parsedTokenData.userId,
            sessionId,
            -creditCost,
            `Desktop auto-activation: ${session.job_title}`,
          ]
        );

        // Update session status to active
        await pool.query(
          `
          UPDATE sessions 
          SET status = 'active', started_at = NOW(), 
              desktop_connected = true, credits_used = 1
          WHERE id = $1
        `,
          [sessionId]
        );

        await pool.query('COMMIT');

        // Clean up temporary token
        await cache.del(`desktop_temp_token:${tempToken}`);

        logSessionEvent('DESKTOP_CONNECTED_WITH_TEMP_TOKEN', sessionId, parsedTokenData.userId, {
          desktopVersion: desktop_version,
          platform: platform,
          autoActivated: true,
          creditsDeducted: creditCost,
        });

        res.json({
          success: true,
          message: 'Desktop app connected and session activated successfully',
          session: {
            id: session.id,
            jobTitle: session.job_title,
            jobDescription: session.job_description,
            difficulty: session.difficulty_level,
            sessionType: session.interview_type,
            status: 'active',
            startedAt: new Date(),
            creditsDeducted: creditCost,
            remainingCredits: session.credits - creditCost,
            resume: session.resume_filename
              ? {
                  filename: session.resume_filename,
                  content: session.resume_content,
                }
              : null,
            user: {
              id: session.user_id,
              name: `${session.first_name || ''} ${session.last_name || ''}`.trim(),
              email: session.email,
              credits: session.credits - creditCost,
            },
            desktopConnectedAt: new Date(),
            estimatedDuration: session.estimated_duration_minutes || 60,
          },
          authentication: {
            authenticated: true,
            userId: parsedTokenData.userId,
            method: 'temporary_token',
          },
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/connect-with-temp-token',
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to connect desktop app with temporary token',
        code: 'TEMP_TOKEN_CONNECTION_ERROR',
      });
    }
  }
);

// Desktop app authentication endpoint
router.post(
  '/:sessionId/connect-desktop',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { user_id, desktop_version, platform } = req.body;

      // Validate session exists and belongs to user
      const pool = getPool();
      const sessionQuery = `
        SELECT s.*, u.first_name, u.last_name, u.email, u.credits
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be connected to
      if (session.status !== 'created') {
        return res.status(400).json({
          error: `Session cannot be connected from ${session.status} status`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      // Record desktop connection
      await pool.query(
        `
        INSERT INTO session_connections (
          session_id, desktop_app_version, connected_at
        ) VALUES ($1, $2, NOW())
      `,
        [sessionId, desktop_version || 'unknown']
      );

      // Update session with desktop connection info
      await pool.query(
        `
        UPDATE sessions 
        SET desktop_connected_at = NOW(), desktop_version = $2
        WHERE id = $1
      `,
        [sessionId, desktop_version]
      );

      logSessionEvent('DESKTOP_CONNECTED', sessionId, req.user.id, {
        desktopVersion: desktop_version,
        platform: platform,
      });

      res.json({
        message: 'Desktop app connected successfully',
        session: {
          id: session.id,
          jobTitle: session.job_title,
          jobDescription: session.job_description,
          difficulty: session.difficulty_level,
          sessionType: session.interview_type,
          status: session.status,
          resumeContent: null, // Will be fetched separately if needed
          user: {
            id: session.user_id,
            name: `${session.first_name || ''} ${session.last_name || ''}`.trim(),
            email: session.email,
            credits: session.credits,
          },
          desktopConnectedAt: new Date(),
          estimatedDuration: session.estimated_duration_minutes || 60,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/connect-desktop',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to connect desktop app',
        code: 'DESKTOP_CONNECTION_ERROR',
      });
    }
  }
);

// Activate session with credit deduction (called by desktop app)
router.post(
  '/:sessionId/activate',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { user_id } = req.body;

      const pool = getPool();

      // Get session and user data
      const sessionQuery = `
        SELECT s.*, u.credits, u.first_name, u.last_name
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = $1 AND s.user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be activated
      if (session.status !== 'created') {
        return res.status(400).json({
          error: `Session cannot be activated from ${session.status} status`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      // Check if user has enough credits (minimum 1 credit for activation)
      if (session.credits < 1) {
        return res.status(403).json({
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: 1,
          current: session.credits,
        });
      }

      // Start transaction for credit deduction and session activation
      await pool.query('BEGIN');

      try {
        // Deduct 1 credit for session activation
        await pool.query('UPDATE users SET credits = credits - 1 WHERE id = $1', [req.user.id]);

        // Record credit transaction
        await pool.query(
          `
          INSERT INTO credit_transactions (
            user_id, session_id, credits_amount, transaction_type, description
          ) VALUES ($1, $2, $3, 'usage', $4)
        `,
          [
            req.user.id,
            sessionId,
            -1, // -1 credit for activation
            `Desktop app activation: ${session.job_title}`,
          ]
        );

        // Update session status to active
        await pool.query(
          `
          UPDATE sessions 
          SET status = 'active', started_at = NOW(), credits_used = 1
          WHERE id = $1
        `,
          [sessionId]
        );

        // Update session connection with credit deduction
        await pool.query(
          `
          UPDATE session_connections 
          SET credits_deducted = 1
          WHERE session_id = $1 AND disconnected_at IS NULL
        `,
          [sessionId]
        );

        await pool.query('COMMIT');

        logSessionEvent('SESSION_ACTIVATED', sessionId, req.user.id, {
          creditsDeducted: 1,
          remainingCredits: session.credits - 1,
        });

        res.json({
          success: true,
          message: 'Session activated successfully',
          session: {
            id: sessionId,
            status: 'active',
            startedAt: new Date(),
            creditsDeducted: 1,
          },
          remainingCredits: session.credits - 1,
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/activate',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to activate session',
        code: 'SESSION_ACTIVATION_ERROR',
      });
    }
  }
);

// Store Q&A in interview_messages (unified approach)
router.post(
  '/:sessionId/store-question',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { questionText, questionNumber, category, difficultyLevel, metadata = {} } = req.body;

      // Validate session belongs to user and is active
      const pool = getPool();
      const sessionQuery = 'SELECT status FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];
      if (session.status !== 'active') {
        return res.status(400).json({
          error: 'Session must be active to store questions',
          code: 'INVALID_SESSION_STATUS',
        });
      }

      // Store question in interview_messages table
      const messageMetadata = {
        questionNumber: questionNumber || 1,
        category: category || 'general',
        difficulty: difficultyLevel || 'medium',
        source: 'desktop_app',
        ...metadata,
      };

      const questionResult = await pool.query(
        `
        INSERT INTO interview_messages (
          session_id, message_type, content, timestamp, metadata
        ) VALUES ($1, $2, $3, NOW(), $4)
        RETURNING id, timestamp
      `,
        [sessionId, 'question', questionText, JSON.stringify(messageMetadata)]
      );

      const questionMessage = questionResult.rows[0];

      logSessionEvent('QUESTION_STORED_UNIFIED', sessionId, req.user.id, {
        questionId: questionMessage.id,
        questionNumber: questionNumber,
        category: category,
      });

      res.json({
        message: 'Question stored successfully',
        question: {
          id: questionMessage.id,
          sessionId: sessionId,
          questionNumber: questionNumber,
          storedAt: questionMessage.timestamp,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/store-question',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to store question',
        code: 'QUESTION_STORAGE_ERROR',
      });
    }
  }
);

router.post(
  '/:sessionId/store-answer',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const {
        answerText,
        questionId, // The message ID of the question
        responseTime,
        metadata = {},
      } = req.body;

      // Validate session belongs to user and is active
      const pool = getPool();
      const sessionQuery = 'SELECT status FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];
      if (session.status !== 'active') {
        return res.status(400).json({
          error: 'Session must be active to store answers',
          code: 'INVALID_SESSION_STATUS',
        });
      }

      // Store answer in interview_messages table
      const messageMetadata = {
        questionId: questionId,
        responseTime: responseTime,
        source: 'desktop_app',
        ...metadata,
      };

      const answerResult = await pool.query(
        `
        INSERT INTO interview_messages (
          session_id, message_type, content, timestamp, metadata, parent_message_id
        ) VALUES ($1, $2, $3, NOW(), $4, $5)
        RETURNING id, timestamp
      `,
        [
          sessionId,
          'answer',
          answerText,
          JSON.stringify(messageMetadata),
          questionId, // Link to the question message
        ]
      );

      const answerMessage = answerResult.rows[0];

      logSessionEvent('ANSWER_STORED_UNIFIED', sessionId, req.user.id, {
        answerId: answerMessage.id,
        questionId: questionId,
        responseTime: responseTime,
      });

      res.json({
        message: 'Answer stored successfully',
        answer: {
          id: answerMessage.id,
          questionId: questionId,
          sessionId: sessionId,
          storedAt: answerMessage.timestamp,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/store-answer',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to store answer',
        code: 'ANSWER_STORAGE_ERROR',
      });
    }
  }
);

// Legacy: Sync question from desktop app (keep for backward compatibility)
router.post(
  '/:sessionId/questions',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const {
        questionNumber,
        questionText,
        category,
        difficultyLevel,
        expectedDuration,
        aiContext,
      } = req.body;

      // Validate session belongs to user and is active
      const pool = getPool();
      const sessionQuery = 'SELECT status FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];
      if (session.status !== 'active') {
        return res.status(400).json({
          error: 'Session must be active to store questions',
          code: 'INVALID_SESSION_STATUS',
        });
      }

      // Insert question into database
      const questionResult = await pool.query(
        `
        INSERT INTO interview_questions (
          session_id, question_number, question_text, category, 
          difficulty_level, expected_duration, ai_context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
        [
          sessionId,
          questionNumber,
          questionText,
          category || 'general',
          difficultyLevel || 'intermediate',
          expectedDuration || 5,
          aiContext ? JSON.stringify(aiContext) : null,
        ]
      );

      const questionId = questionResult.rows[0].id;

      logSessionEvent('QUESTION_STORED', sessionId, req.user.id, {
        questionId: questionId,
        questionNumber: questionNumber,
        category: category,
      });

      res.json({
        message: 'Question stored successfully',
        question: {
          id: questionId,
          sessionId: sessionId,
          questionNumber: questionNumber,
          storedAt: new Date(),
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/questions',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to store question',
        code: 'QUESTION_STORAGE_ERROR',
      });
    }
  }
);

// Sync answer from desktop app
router.post(
  '/:sessionId/answers',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { questionId, answerText, responseTime, aiFeedback, aiScore } = req.body;

      // Validate session belongs to user and is active
      const pool = getPool();
      const sessionQuery = 'SELECT status FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];
      if (session.status !== 'active') {
        return res.status(400).json({
          error: 'Session must be active to store answers',
          code: 'INVALID_SESSION_STATUS',
        });
      }

      // Validate question exists and belongs to this session
      const questionQuery = 'SELECT id FROM interview_questions WHERE id = $1 AND session_id = $2';
      const questionResult = await pool.query(questionQuery, [questionId, sessionId]);

      if (questionResult.rows.length === 0) {
        return res.status(400).json({
          error: 'Question not found or does not belong to this session',
          code: 'INVALID_QUESTION',
        });
      }

      // Insert answer into database
      const answerResult = await pool.query(
        `
        INSERT INTO interview_answers (
          question_id, session_id, answer_text, response_time, 
          ai_feedback, ai_score
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
        [questionId, sessionId, answerText, responseTime, aiFeedback, aiScore]
      );

      const answerId = answerResult.rows[0].id;

      logSessionEvent('ANSWER_STORED', sessionId, req.user.id, {
        answerId: answerId,
        questionId: questionId,
        responseTime: responseTime,
        aiScore: aiScore,
      });

      res.json({
        message: 'Answer stored successfully',
        answer: {
          id: answerId,
          questionId: questionId,
          sessionId: sessionId,
          storedAt: new Date(),
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/answers',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to store answer',
        code: 'ANSWER_STORAGE_ERROR',
      });
    }
  }
);

// Desktop heartbeat endpoint
router.post(
  '/:sessionId/heartbeat',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { elapsedMinutes, creditsUsed, currentStatus } = req.body;

      // Validate session belongs to user
      const pool = getPool();
      const sessionQuery = 'SELECT id FROM sessions WHERE id = $1 AND user_id = $2';
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      // Update session activity and duration
      await pool.query(
        `
        UPDATE sessions 
        SET total_duration_minutes = $1, status = $2,
            desktop_connected_at = NOW()
        WHERE id = $3
      `,
        [elapsedMinutes || 0, currentStatus || 'active', sessionId]
      );

      // Update user last_active
      await pool.query(
        `
        UPDATE users SET last_active = NOW() WHERE id = $1
      `,
        [req.user.id]
      );

      res.json({
        message: 'Heartbeat received',
        timestamp: new Date(),
        sessionActive: true,
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/heartbeat',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to process heartbeat',
        code: 'HEARTBEAT_ERROR',
      });
    }
  }
);

// Complete session (called by desktop app)
router.post(
  '/:sessionId/complete',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { finalDuration, totalCreditsUsed, sessionNotes } = req.body;

      // Validate session belongs to user and is active
      const pool = getPool();
      const sessionQuery = `
        SELECT status, total_duration_minutes 
        FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];
      if (session.status === 'completed') {
        return res.status(400).json({
          error: 'Session already completed',
          code: 'SESSION_ALREADY_COMPLETED',
        });
      }

      // Complete the session
      await pool.query(
        `
        UPDATE sessions 
        SET status = 'completed', ended_at = NOW(), 
            total_duration_minutes = $1, session_notes = $2
        WHERE id = $3
      `,
        [finalDuration || session.total_duration_minutes, sessionNotes, sessionId]
      );

      // Close any open session connections
      await pool.query(
        `
        UPDATE session_connections 
        SET disconnected_at = NOW()
        WHERE session_id = $1 AND disconnected_at IS NULL
      `,
        [sessionId]
      );

      // Get session analytics
      const analyticsQuery = `
        SELECT total_questions, total_answers, average_score, actual_duration_minutes
        FROM session_analytics 
        WHERE session_id = $1
      `;
      const analyticsResult = await pool.query(analyticsQuery, [sessionId]);
      const analytics = analyticsResult.rows[0] || {};

      logSessionEvent('SESSION_COMPLETED', sessionId, req.user.id, {
        finalDuration: finalDuration,
        totalCreditsUsed: totalCreditsUsed,
        totalQuestions: analytics.total_questions,
        totalAnswers: analytics.total_answers,
        averageScore: analytics.average_score,
      });

      res.json({
        message: 'Session completed successfully',
        session: {
          id: sessionId,
          status: 'completed',
          completedAt: new Date(),
          finalDuration: finalDuration,
          creditsUsed: totalCreditsUsed,
          analytics: {
            totalQuestions: analytics.total_questions || 0,
            totalAnswers: analytics.total_answers || 0,
            averageScore: analytics.average_score,
            actualDuration: analytics.actual_duration_minutes,
          },
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/complete',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to complete session',
        code: 'SESSION_COMPLETION_ERROR',
      });
    }
  }
);

// Get session analytics (for desktop app and web app)
router.get(
  '/:sessionId/analytics',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;

      // Get comprehensive session analytics
      const pool = getPool();
      const analyticsQuery = `
        SELECT * FROM session_analytics WHERE session_id = $1
      `;
      const analyticsResult = await pool.query(analyticsQuery, [sessionId]);

      if (analyticsResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const analytics = analyticsResult.rows[0];

      // Verify user owns this session
      if (analytics.user_id !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED',
        });
      }

      // Get detailed questions and answers
      const questionsQuery = `
        SELECT iq.*, ia.answer_text, ia.response_time, ia.ai_score, ia.ai_feedback
        FROM interview_questions iq
        LEFT JOIN interview_answers ia ON iq.id = ia.question_id
        WHERE iq.session_id = $1
        ORDER BY iq.question_number
      `;
      const questionsResult = await pool.query(questionsQuery, [sessionId]);

      res.json({
        analytics: {
          sessionId: analytics.session_id,
          jobTitle: analytics.job_title,
          difficulty: analytics.difficulty_level,
          status: analytics.status,
          createdAt: analytics.created_at,
          startedAt: analytics.started_at,
          completedAt: analytics.ended_at,
          desktopConnectedAt: analytics.desktop_connected_at,
          duration: {
            planned: null, // Not in current schema
            actual: analytics.actual_duration_minutes,
            tracked: analytics.total_duration_minutes,
          },
          credits: {
            used: analytics.credits_used,
          },
          questions: {
            total: analytics.total_questions || 0,
            answered: analytics.total_answers || 0,
            averageScore: analytics.average_score,
            totalResponseTime: analytics.total_response_time,
          },
          performance: {
            completionRate:
              analytics.total_questions > 0
                ? (((analytics.total_answers || 0) / analytics.total_questions) * 100).toFixed(1)
                : 0,
            averageResponseTime:
              analytics.total_answers > 0
                ? Math.round((analytics.total_response_time || 0) / analytics.total_answers)
                : 0,
          },
        },
        questions: questionsResult.rows.map(q => ({
          id: q.id,
          number: q.question_number,
          text: q.question_text,
          category: q.category,
          difficulty: q.difficulty_level,
          expectedDuration: q.expected_duration,
          askedAt: q.asked_at,
          answer: q.answer_text
            ? {
                text: q.answer_text,
                responseTime: q.response_time,
                aiScore: q.ai_score,
                aiFeedback: q.ai_feedback,
              }
            : null,
        })),
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/analytics',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to get session analytics',
        code: 'ANALYTICS_ERROR',
      });
    }
  }
);

// Check session status (for desktop app monitoring)
router.get(
  '/:sessionId/status',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;

      // Get session status from database
      const pool = getPool();
      const sessionQuery = `
        SELECT id, status, desktop_connected, started_at, ended_at, 
               websocket_connection_id, total_duration_minutes
        FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Calculate if session was stopped externally
      const wasStoppedExternally = session.status === 'completed' || session.status === 'cancelled';

      res.json({
        sessionId: session.id,
        status: session.status,
        desktopConnected: session.desktop_connected,
        active: session.status === 'active',
        stoppedExternally: wasStoppedExternally,
        duration: session.total_duration_minutes,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        connectionId: session.websocket_connection_id,
        timestamp: new Date(),
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/status',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to get session status',
        code: 'SESSION_STATUS_ERROR',
      });
    }
  }
);

// Desktop app disconnect (graceful disconnection from desktop)
router.post(
  '/:sessionId/disconnect',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { reason, saveProgress = true } = req.body;

      // Validate session belongs to user
      const pool = getPool();
      const sessionQuery = `
        SELECT id, status, desktop_connected, started_at
        FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      const disconnectTimestamp = new Date();
      const disconnectReason = reason || 'Desktop app disconnected';

      // Update session to mark desktop as disconnected
      const updateQuery = `
        UPDATE sessions 
        SET desktop_connected = false, 
            websocket_connection_id = NULL,
            session_notes = COALESCE(session_notes, '') || $1
        WHERE id = $2
        RETURNING *
      `;

      const disconnectNote = `\n[${disconnectTimestamp.toISOString()}] Desktop disconnected. Reason: ${disconnectReason}`;
      await pool.query(updateQuery, [disconnectNote, sessionId]);

      // Close any open session connections
      await pool.query(
        `
        UPDATE session_connections 
        SET disconnected_at = $1
        WHERE session_id = $2 AND disconnected_at IS NULL
      `,
        [disconnectTimestamp, sessionId]
      );

      // Clear session from Redis cache
      try {
        await sessionManager.deleteSession(sessionId);
        await cache.del(`session_messages:${sessionId}`);
      } catch (cacheError) {
        console.warn('Failed to clear session cache:', cacheError);
      }

      logSessionEvent('DESKTOP_DISCONNECTED', sessionId, req.user.id, {
        reason: disconnectReason,
        wasActive: session.status === 'active',
        saveProgress,
      });

      res.json({
        message: 'Desktop app disconnected successfully',
        session: {
          id: sessionId,
          disconnectedAt: disconnectTimestamp,
          reason: disconnectReason,
          canReconnect: session.status === 'active' || session.status === 'paused',
          status: session.status,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/disconnect',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to disconnect session',
        code: 'SESSION_DISCONNECT_ERROR',
      });
    }
  }
);

// Stop/Disconnect session endpoint - Stop an active session from web app
router.post(
  '/:sessionId/stop',
  authenticateToken,
  [param('sessionId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { sessionId } = req.params;
      const { reason, forceStop = false } = req.body;

      // Validate session belongs to user
      const pool = getPool();
      const sessionQuery = `
        SELECT id, user_id, status, desktop_connected, total_duration_minutes
        FROM sessions 
        WHERE id = $1 AND user_id = $2
      `;
      const sessionResult = await pool.query(sessionQuery, [sessionId, req.user.id]);

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found or access denied',
          code: 'SESSION_NOT_FOUND',
        });
      }

      const session = sessionResult.rows[0];

      // Check if session can be stopped
      if (session.status === 'completed') {
        return res.status(400).json({
          error: 'Session is already completed',
          code: 'SESSION_ALREADY_COMPLETED',
          currentStatus: session.status,
        });
      }

      if (session.status === 'cancelled') {
        return res.status(400).json({
          error: 'Session is already cancelled',
          code: 'SESSION_ALREADY_CANCELLED',
          currentStatus: session.status,
        });
      }

      // Only allow stopping 'created' or 'active' sessions
      if (!['created', 'active'].includes(session.status) && !forceStop) {
        return res.status(400).json({
          error: `Session with status '${session.status}' cannot be stopped. Use forceStop=true to override.`,
          code: 'INVALID_SESSION_STATUS',
          currentStatus: session.status,
        });
      }

      const stopTimestamp = new Date();
      const stopReason = reason || 'Stopped from web interface';

      // Determine new status based on current status
      const newStatus = session.status === 'created' ? 'cancelled' : 'completed';

      // Start transaction to update session and related data
      await pool.query('BEGIN');

      try {
        // Update session status and end time
        const updateQuery = `
          UPDATE sessions 
          SET status = $1, 
              ended_at = $2,
              session_notes = COALESCE(session_notes, '') || $3,
              desktop_connected = false
          WHERE id = $4
          RETURNING *
        `;

        const stopNote = `\n[${stopTimestamp.toISOString()}] Session stopped from web interface. Reason: ${stopReason}`;
        const updateResult = await pool.query(updateQuery, [
          newStatus,
          stopTimestamp,
          stopNote,
          sessionId,
        ]);
        const updatedSession = updateResult.rows[0];

        // Close any open session connections
        await pool.query(
          `
          UPDATE session_connections 
          SET disconnected_at = $1
          WHERE session_id = $2 AND disconnected_at IS NULL
        `,
          [stopTimestamp, sessionId]
        );

        // If session was active, record final duration
        if (session.status === 'active') {
          // Calculate session duration if not already set
          let finalDuration = session.total_duration_minutes;
          if (!finalDuration && updatedSession.started_at) {
            const durationMs = stopTimestamp - new Date(updatedSession.started_at);
            finalDuration = Math.ceil(durationMs / (1000 * 60)); // Convert to minutes
          }

          // Update final duration
          if (finalDuration > 0) {
            await pool.query(
              `
              UPDATE sessions 
              SET total_duration_minutes = $1
              WHERE id = $2
            `,
              [finalDuration, sessionId]
            );
          }
        }

        await pool.query('COMMIT');

        // Clear session from Redis cache
        try {
          await sessionManager.deleteSession(sessionId);
          await cache.del(`session_messages:${sessionId}`);
        } catch (cacheError) {
          // Log cache error but don't fail the request
          console.warn('Failed to clear session cache:', cacheError);
        }

        // Log the session stop event
        logSessionEvent('SESSION_STOPPED_FROM_WEB', sessionId, req.user.id, {
          previousStatus: session.status,
          newStatus: newStatus,
          reason: stopReason,
          desktopConnected: session.desktop_connected,
          forceStop: forceStop,
          finalDuration: finalDuration || session.total_duration_minutes,
        });

        res.json({
          message: `Session ${newStatus} successfully`,
          session: {
            id: sessionId,
            status: newStatus,
            stoppedAt: stopTimestamp,
            reason: stopReason,
            wasActive: session.status === 'active',
            desktopWasConnected: session.desktop_connected,
            finalDuration: finalDuration || session.total_duration_minutes,
          },
        });
      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logError(error, {
        endpoint: 'sessions/stop',
        userId: req.user?.id,
        sessionId: req.params.sessionId,
      });
      res.status(500).json({
        error: 'Failed to stop session',
        code: 'SESSION_STOP_ERROR',
      });
    }
  }
);

export default router;
