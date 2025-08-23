import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Get all sessions with pagination and filtering
router.get(
  '/',
  requirePermission(['sessions.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('status').optional().isIn(['all', 'created', 'active', 'completed', 'cancelled']),
    query('type').optional().isIn(['all', 'technical', 'behavioral', 'mixed']),
    query('difficulty').optional().isIn(['all', 'easy', 'medium', 'hard']),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('sortBy')
      .optional()
      .isIn(['created_at', 'started_at', 'ended_at', 'duration', 'credits_used']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format'),
  ],
  asyncHandler(async (req, res) => {
    const _database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const {
      status,
      type,
      difficulty,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
    } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      conditions.push(`s.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (type && type !== 'all') {
      conditions.push(`s.interview_type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (difficulty && difficulty !== 'all') {
      conditions.push(`s.difficulty_level = $${paramIndex}`);
      params.push(difficulty);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        s.session_name ILIKE $${paramIndex} OR 
        s.company_name ILIKE $${paramIndex} OR 
        s.job_title ILIKE $${paramIndex} OR
        u.name ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`s.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`s.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sessionsQuery = `
      SELECT 
        s.id,
        s.session_name,
        s.company_name,
        s.job_title,
        s.interview_type,
        s.difficulty_level,
        s.status,
        s.credits_used,
        s.interview_duration,
        s.desktop_connected,
        s.created_at,
        s.started_at,
        s.ended_at,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        COUNT(im.id) as message_count,
        COUNT(CASE WHEN im.message_type = 'question' THEN 1 END) as questions_count,
        COUNT(CASE WHEN im.message_type = 'answer' THEN 1 END) as answers_count
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN interview_messages im ON s.id = im.session_id
      ${whereClause}
      GROUP BY s.id, s.session_name, s.company_name, s.job_title, s.interview_type, 
               s.difficulty_level, s.status, s.credits_used, s.interview_duration,
               s.desktop_connected, s.created_at, s.started_at, s.ended_at,
               u.id, u.name, u.email
      ORDER BY s.${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      ${whereClause}
    `;

    params.push(limit, offset);

    const [sessionsResult, countResult] = await Promise.all([
      _database.query(sessionsQuery, params),
      _database.query(countQuery, params.slice(0, -2)),
    ]);

    const sessions = sessionsResult.rows.map(row => {
      // Calculate duration from timestamps if interview_duration is null/0
      let duration = parseInt(row.interview_duration || 0);

      if (duration === 0 && row.started_at && row.ended_at) {
        const startTime = new Date(row.started_at);
        const endTime = new Date(row.ended_at);
        duration = Math.round((endTime - startTime) / (1000 * 60)); // Convert to minutes
      }

      return {
        id: row.id,
        sessionName: row.session_name,
        companyName: row.company_name,
        jobTitle: row.job_title,
        interviewType: row.interview_type,
        difficultyLevel: row.difficulty_level,
        status: row.status,
        creditsUsed: parseInt(row.credits_used || 0),
        duration: duration,
        desktopConnected: row.desktop_connected,
        createdAt: row.created_at,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        user: {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
        },
        messageCount: parseInt(row.message_count || 0),
        questionsCount: parseInt(row.questions_count || 0),
        answersCount: parseInt(row.answers_count || 0),
      };
    });

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { status, type, difficulty, search, sortBy, sortOrder, dateFrom, dateTo },
      },
    });
  })
);

// Get session details by ID
router.get(
  '/:id',
  requirePermission(['sessions.read']),
  [param('id').isUUID().withMessage('Invalid session ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    // Get session details
    const sessionQuery = `
      SELECT 
        s.*,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.credits as user_credits,
        COUNT(im.id) as total_messages,
        COUNT(CASE WHEN im.message_type = 'question' THEN 1 END) as questions_count,
        COUNT(CASE WHEN im.message_type = 'answer' THEN 1 END) as answers_count,
        AVG(CASE WHEN sa.overall_performance_score IS NOT NULL THEN sa.overall_performance_score END) as performance_score
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN interview_messages im ON s.id = im.session_id
      LEFT JOIN session_analytics sa ON s.id = sa.session_id
      WHERE s.id = $1
      GROUP BY s.id, u.id, u.name, u.email, u.credits
    `;

    // Get interview messages
    const messagesQuery = `
      SELECT 
        id,
        message_type,
        content,
        metadata,
        timestamp,
        ai_confidence_score
      FROM interview_messages
      WHERE session_id = $1
      ORDER BY timestamp ASC
    `;

    // Get interview questions and answers from interview_messages
    const questionsQuery = `
      WITH numbered_messages AS (
        SELECT 
          id,
          message_type,
          content,
          timestamp,
          metadata,
          ROW_NUMBER() OVER (ORDER BY timestamp) as message_order
        FROM interview_messages
        WHERE session_id = $1
        ORDER BY timestamp
      ),
      questions AS (
        SELECT 
          id as question_id,
          message_order as question_number,
          content as question_text,
          COALESCE((metadata->>'category'), 'general') as question_type,
          COALESCE((metadata->>'difficulty'), 'medium') as difficulty_level,
          COALESCE((metadata->>'category'), 'general') as category,
          timestamp as time_asked,
          COALESCE((metadata->>'expectedDuration')::int * 60, 300) as time_limit_seconds,
          metadata
        FROM numbered_messages
        WHERE message_type = 'question'
      ),
      answers AS (
        SELECT 
          id as answer_id,
          content as answer_text,
          timestamp as time_started,
          timestamp as time_submitted,
          COALESCE((metadata->>'responseTime')::int, 0) as duration_seconds,
          true as is_complete,
          COALESCE((metadata->>'aiScore')::decimal, null) as ai_score,
          COALESCE((metadata->>'aiFeedback'), null) as ai_feedback,
          COALESCE((metadata->>'keywords'), '[]'::text) as keywords_mentioned,
          COALESCE((metadata->>'questionId'), null) as question_id_ref,
          message_order
        FROM numbered_messages
        WHERE message_type = 'answer'
      )
      SELECT 
        q.question_id,
        q.question_number,
        q.question_text,
        q.question_type,
        q.difficulty_level,
        q.category,
        q.time_asked,
        q.time_limit_seconds,
        a.answer_id,
        a.answer_text,
        a.time_started,
        a.time_submitted,
        a.duration_seconds,
        a.is_complete,
        a.ai_score,
        a.ai_feedback,
        a.keywords_mentioned
      FROM questions q
      LEFT JOIN answers a ON (
        a.question_id_ref::text = q.question_id::text 
        OR a.message_order = q.question_number + 1
      )
      ORDER BY q.question_number
    `;

    // Get session analytics if available
    const analyticsQuery = `
      SELECT *
      FROM session_analytics
      WHERE session_id = $1
    `;

    const [sessionResult, messagesResult, questionsResult, analyticsResult] = await Promise.all([
      database.query(sessionQuery, [id]),
      database.query(messagesQuery, [id]),
      database.query(questionsQuery, [id]),
      database.query(analyticsQuery, [id]),
    ]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    const session = sessionResult.rows[0];
    const messages = messagesResult.rows;
    const questionsData = questionsResult.rows;
    const analytics = analyticsResult.rows[0] || null;

    // Calculate duration from timestamps if interview_duration is null/0
    let duration = parseInt(session.interview_duration || 0);

    if (duration === 0 && session.started_at && session.ended_at) {
      const startTime = new Date(session.started_at);
      const endTime = new Date(session.ended_at);
      duration = Math.round((endTime - startTime) / (1000 * 60)); // Convert to minutes
    }

    const sessionData = {
      id: session.id,
      sessionName: session.session_name,
      companyName: session.company_name,
      jobTitle: session.job_title,
      jobDescription: session.job_description,
      interviewType: session.interview_type,
      difficultyLevel: session.difficulty_level,
      status: session.status,
      creditsUsed: parseInt(session.credits_used || 0),
      duration: duration,
      desktopConnected: session.desktop_connected,
      createdAt: session.created_at,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      sessionConfig: session.session_config,
      sessionNotes: session.session_notes,
      user: {
        id: session.user_id,
        name: session.user_name,
        email: session.user_email,
        credits: parseInt(session.user_credits || 0),
      },
      statistics: {
        totalMessages: parseInt(session.total_messages || 0),
        questionsCount: parseInt(session.questions_count || 0),
        answersCount: parseInt(session.answers_count || 0),
        performanceScore: session.performance_score ? parseFloat(session.performance_score) : null,
      },
    };

    const messageData = messages.map(msg => ({
      id: msg.id,
      type: msg.message_type,
      content: msg.content,
      metadata: msg.metadata,
      timestamp: msg.timestamp,
      confidence: msg.ai_confidence_score ? parseFloat(msg.ai_confidence_score) : null,
    }));

    const analyticsData = analytics
      ? {
          totalQuestionsAsked: analytics.total_questions_asked,
          totalAnswersGiven: analytics.total_answers_given,
          avgResponseTime: analytics.average_response_time_seconds,
          communicationScore: analytics.communication_score,
          technicalAccuracyScore: analytics.technical_accuracy_score,
          confidenceScore: analytics.confidence_score,
          completenessScore: analytics.completeness_score,
          overallScore: analytics.overall_performance_score,
          strengths: analytics.strengths,
          improvementAreas: analytics.improvement_areas,
          recommendations: analytics.recommendations,
          aiModel: analytics.ai_model_used,
        }
      : null;

    // Process questions and answers data
    const questionsWithAnswers = questionsData.map(row => ({
      id: row.question_id,
      questionNumber: row.question_number,
      questionText: row.question_text,
      questionType: row.question_type,
      difficultyLevel: row.difficulty_level,
      category: row.category,
      timeAsked: row.time_asked,
      timeLimitSeconds: row.time_limit_seconds,
      answer: row.answer_id
        ? {
            id: row.answer_id,
            answerText: row.answer_text,
            timeStarted: row.time_started,
            timeSubmitted: row.time_submitted,
            durationSeconds: row.duration_seconds,
            isComplete: row.is_complete,
            aiScore: row.ai_score ? parseFloat(row.ai_score) : null,
            aiFeedback: row.ai_feedback,
            keywordsMentioned: row.keywords_mentioned || [],
          }
        : null,
    }));

    res.json({
      success: true,
      data: {
        session: sessionData,
        messages: messageData,
        questions: questionsWithAnswers,
        analytics: analyticsData,
      },
    });
  })
);

// Terminate active session
router.post(
  '/:id/terminate',
  requirePermission(['sessions.write', 'sessions.terminate']),
  [
    param('id').isUUID().withMessage('Invalid session ID'),
    body('reason').optional().isLength({ min: 1, max: 255 }).withMessage('Invalid reason'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { reason = 'Terminated by admin' } = req.body;
    const adminId = req.admin.id;

    // Check if session exists and is active
    const sessionQuery = `
      SELECT id, status, user_id, session_name
      FROM sessions 
      WHERE id = $1
    `;

    const sessionResult = await database.query(sessionQuery, [id]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    const session = sessionResult.rows[0];

    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Cannot terminate session with status: ${session.status}`,
      });
    }

    try {
      await database.query('BEGIN');

      // Update session status
      const updateQuery = `
        UPDATE sessions 
        SET status = 'cancelled', 
            ended_at = NOW(), 
            session_notes = COALESCE(session_notes, '') || CASE 
              WHEN session_notes IS NOT NULL AND session_notes != '' THEN E'\n' || $2 
              ELSE $2 
            END
        WHERE id = $1
        RETURNING ended_at
      `;

      await database.query(updateQuery, [id, `Admin termination: ${reason}`]);

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'SESSION_TERMINATED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          sessionId: id,
          sessionName: session.session_name,
          userId: session.user_id,
          reason,
        },
      });

      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Session terminated successfully',
        data: {
          sessionId: id,
          terminatedAt: new Date().toISOString(),
          reason,
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

// Get session statistics
router.get(
  '/stats/summary',
  requirePermission(['sessions.read', 'analytics.read']),
  [query('period').optional().isIn(['24h', '7d', '30d', '90d']).withMessage('Invalid period')],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const period = req.query.period || '30d';

    // Calculate date range
    let intervalQuery;
    switch (period) {
      case '24h':
        intervalQuery = "NOW() - INTERVAL '24 hours'";
        break;
      case '7d':
        intervalQuery = "NOW() - INTERVAL '7 days'";
        break;
      case '30d':
        intervalQuery = "NOW() - INTERVAL '30 days'";
        break;
      case '90d':
        intervalQuery = "NOW() - INTERVAL '90 days'";
        break;
      default:
        intervalQuery = "NOW() - INTERVAL '30 days'";
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_sessions,
        COUNT(CASE WHEN desktop_connected = true THEN 1 END) as desktop_sessions,
        AVG(CASE WHEN interview_duration IS NOT NULL THEN interview_duration END) as avg_duration,
        SUM(credits_used) as total_credits_used,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(credits_used) as avg_credits_per_session,
        COUNT(CASE WHEN interview_type = 'technical' THEN 1 END) as technical_sessions,
        COUNT(CASE WHEN interview_type = 'behavioral' THEN 1 END) as behavioral_sessions,
        COUNT(CASE WHEN difficulty_level = 'easy' THEN 1 END) as easy_sessions,
        COUNT(CASE WHEN difficulty_level = 'medium' THEN 1 END) as medium_sessions,
        COUNT(CASE WHEN difficulty_level = 'hard' THEN 1 END) as hard_sessions
      FROM sessions
      WHERE created_at >= ${intervalQuery}
    `;

    const result = await database.query(statsQuery);
    const stats = result.rows[0];

    const completionRate =
      stats.total_sessions > 0
        ? parseFloat(((stats.completed_sessions / stats.total_sessions) * 100).toFixed(2))
        : 0;

    const desktopAdoptionRate =
      stats.total_sessions > 0
        ? parseFloat(((stats.desktop_sessions / stats.total_sessions) * 100).toFixed(2))
        : 0;

    res.json({
      success: true,
      data: {
        period,
        overview: {
          totalSessions: parseInt(stats.total_sessions || 0),
          completedSessions: parseInt(stats.completed_sessions || 0),
          activeSessions: parseInt(stats.active_sessions || 0),
          cancelledSessions: parseInt(stats.cancelled_sessions || 0),
          uniqueUsers: parseInt(stats.unique_users || 0),
          completionRate,
          desktopAdoptionRate,
        },
        performance: {
          avgDuration: parseFloat(stats.avg_duration || 0),
          totalCreditsUsed: parseInt(stats.total_credits_used || 0),
          avgCreditsPerSession: parseFloat(stats.avg_credits_per_session || 0),
        },
        breakdown: {
          byType: {
            technical: parseInt(stats.technical_sessions || 0),
            behavioral: parseInt(stats.behavioral_sessions || 0),
          },
          byDifficulty: {
            easy: parseInt(stats.easy_sessions || 0),
            medium: parseInt(stats.medium_sessions || 0),
            hard: parseInt(stats.hard_sessions || 0),
          },
        },
      },
    });
  })
);

// Export session data
router.post(
  '/export',
  requirePermission(['sessions.read', 'data.export']),
  [
    body('format').isIn(['csv', 'json']).withMessage('Invalid format'),
    body('filters').optional().isObject(),
    body('includeMessages').optional().isBoolean(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { format, filters = {}, includeMessages = false } = req.body;

    // This would implement the actual export functionality
    // For now, return a placeholder response
    res.json({
      success: true,
      message: 'Export initiated',
      data: {
        format,
        includeMessages,
        filters,
        status: 'processing',
        estimatedCompletionTime: '2-5 minutes',
        downloadLink: `/api/sessions/download/export_${Date.now()}.${format}`,
      },
    });
  })
);

export default router;
