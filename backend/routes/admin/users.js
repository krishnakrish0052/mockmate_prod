import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../../middleware/admin/errorHandler.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Get all users with pagination and filtering
router.get(
  '/',
  requirePermission(['users.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('status').optional().isIn(['all', 'active', 'inactive', 'suspended']),
    query('sortBy').optional().isIn(['created_at', 'last_active', 'session_count', 'credits']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || 'all';
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder || 'desc';

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        COALESCE(u.first_name, '') ILIKE $${paramIndex} OR 
        COALESCE(u.last_name, '') ILIKE $${paramIndex} OR 
        u.name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status !== 'all') {
      if (status === 'active') {
        conditions.push(`u.last_active > NOW() - INTERVAL '7 days'`);
      } else if (status === 'inactive') {
        conditions.push(`(u.last_active <= NOW() - INTERVAL '7 days' OR u.last_active IS NULL)`);
      } else if (status === 'suspended') {
        conditions.push(`u.is_suspended = true`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const usersQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.credits,
        u.created_at,
        u.last_active,
        u.is_suspended,
        COUNT(s.id) as session_count,
        SUM(s.credits_used) as total_credits_used,
        MAX(s.created_at) as last_session_date
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      ${whereClause}
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.credits, u.created_at, u.last_active, u.is_suspended
      ORDER BY ${sortBy === 'session_count' ? 'COUNT(s.id)' : `u.${sortBy}`} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      ${whereClause}
    `;

    params.push(limit, offset);

    const [usersResult, countResult] = await Promise.all([
      database.query(usersQuery, params),
      database.query(countQuery, params.slice(0, -2)), // Remove limit and offset for count query
    ]);

    const users = usersResult.rows.map(row => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      credits: parseInt(row.credits || 0),
      createdAt: row.created_at,
      lastActive: row.last_active,
      isSuspended: row.is_suspended,
      sessionCount: parseInt(row.session_count || 0),
      totalCreditsUsed: parseInt(row.total_credits_used || 0),
      lastSessionDate: row.last_session_date,
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { search, status, sortBy, sortOrder },
      },
    });
  })
);

// Get user details by ID
router.get(
  '/:id',
  requirePermission(['users.read']),
  [param('id').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    // Get user details with session statistics
    const userQuery = `
      SELECT 
        u.*,
        COUNT(s.id) as total_sessions,
        SUM(s.credits_used) as total_credits_used,
        AVG(s.interview_duration) as avg_session_duration,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_sessions,
        MAX(s.created_at) as last_session_date
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `;

    // Get recent sessions
    const recentSessionsQuery = `
      SELECT 
        id,
        interview_type,
        difficulty_level,
        status,
        credits_used,
        interview_duration,
        created_at,
        started_at,
        completed_at
      FROM sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;

    // Get credit transaction history
    const creditHistoryQuery = `
      SELECT 
        transaction_type,
        credits_amount,
        description,
        created_at
      FROM credit_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const [userResult, sessionsResult, creditResult] = await Promise.all([
      database.query(userQuery, [id]),
      database.query(recentSessionsQuery, [id]),
      database.query(creditHistoryQuery, [id]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = userResult.rows[0];
    const userData = {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      credits: parseInt(user.credits || 0),
      createdAt: user.created_at,
      lastActive: user.last_active,
      isSuspended: user.is_suspended,
      profile: {
        totalSessions: parseInt(user.total_sessions || 0),
        completedSessions: parseInt(user.completed_sessions || 0),
        totalCreditsUsed: parseInt(user.total_credits_used || 0),
        avgSessionDuration: parseFloat(user.avg_session_duration || 0),
        lastSessionDate: user.last_session_date,
        completionRate:
          user.total_sessions > 0
            ? parseFloat(((user.completed_sessions / user.total_sessions) * 100).toFixed(2))
            : 0,
      },
    };

    const recentSessions = sessionsResult.rows.map(row => ({
      id: row.id,
      interviewType: row.interview_type,
      difficultyLevel: row.difficulty_level,
      status: row.status,
      creditsUsed: parseInt(row.credits_used || 0),
      duration: parseFloat(row.interview_duration || 0),
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));

    const creditHistory = creditResult.rows.map(row => ({
      type: row.transaction_type,
      amount: parseInt(row.credits_amount),
      description: row.description,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: {
        user: userData,
        recentSessions,
        creditHistory,
      },
    });
  })
);

// Update user details
router.put(
  '/:id',
  requirePermission(['users.write']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('credits').optional().isInt({ min: 0 }).withMessage('Credits must be a positive integer'),
    body('isSuspended').optional().isBoolean().withMessage('isSuspended must be boolean'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { credits, isSuspended } = req.body;

    // Check if user exists
    const userExistsQuery = `SELECT id FROM users WHERE id = $1`;
    const userExists = await database.query(userExistsQuery, [id]);

    if (userExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [id];
    let paramIndex = 2;

    if (credits !== undefined) {
      updates.push(`credits = $${paramIndex}`);
      params.push(credits);
      paramIndex++;
    }

    if (isSuspended !== undefined) {
      updates.push(`is_suspended = $${paramIndex}`);
      params.push(isSuspended);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
      });
    }

    const updateQuery = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING id, first_name, last_name, email, credits, is_suspended, updated_at
    `;

    const result = await database.query(updateQuery, params);
    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: updatedUser.id,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        credits: parseInt(updatedUser.credits),
        isSuspended: updatedUser.is_suspended,
        updatedAt: updatedUser.updated_at,
      },
    });
  })
);

// Add credits to user account
router.post(
  '/:id/credits',
  requirePermission(['users.write', 'credits.manage']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
    body('description')
      .optional()
      .isLength({ min: 1, max: 255 })
      .withMessage('Invalid description'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { amount, description = 'Manual credit addition by admin' } = req.body;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      // Update user credits
      const updateCreditsQuery = `
        UPDATE users 
        SET credits = credits + $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, first_name, last_name, credits
      `;

      const userResult = await database.query(updateCreditsQuery, [amount, id]);

      if (userResult.rows.length === 0) {
        await database.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Create credit transaction record
      const transactionQuery = `
        INSERT INTO credit_transactions (user_id, transaction_type, credits_amount, description, created_by, created_at)
        VALUES ($1, 'admin_grant', $2, $3, $4, NOW())
        RETURNING id
      `;

      await database.query(transactionQuery, [id, amount, description, adminId]);
      await database.query('COMMIT');

      const user = userResult.rows[0];

      res.json({
        success: true,
        message: 'Credits added successfully',
        data: {
          userId: user.id,
          userName: `${user.first_name} ${user.last_name}`.trim(),
          creditsAdded: amount,
          newCreditsBalance: parseInt(user.credits),
          description,
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

// Get user statistics summary
router.get(
  '/stats/summary',
  requirePermission(['users.read', 'analytics.read']),
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;

    const statsQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN last_active > NOW() - INTERVAL '7 days' THEN 1 END) as active_users,
        COUNT(CASE WHEN last_active <= NOW() - INTERVAL '7 days' OR last_active IS NULL THEN 1 END) as inactive_users,
        COUNT(CASE WHEN is_suspended = true THEN 1 END) as suspended_users,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d,
        AVG(credits) as avg_credits,
        SUM(credits) as total_credits_in_system
      FROM users
    `;

    const result = await database.query(statsQuery);
    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        totalUsers: parseInt(stats.total_users || 0),
        activeUsers: parseInt(stats.active_users || 0),
        inactiveUsers: parseInt(stats.inactive_users || 0),
        suspendedUsers: parseInt(stats.suspended_users || 0),
        newUsers30d: parseInt(stats.new_users_30d || 0),
        avgCredits: parseFloat(stats.avg_credits || 0),
        totalCreditsInSystem: parseInt(stats.total_credits_in_system || 0),
      },
    });
  })
);

// Delete user
router.delete(
  '/:id',
  requirePermission(['users.delete', 'users.write']),
  [param('id').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      // Check if user exists
      const userExistsQuery = `SELECT id, first_name, last_name, email FROM users WHERE id = $1`;
      const userExists = await database.query(userExistsQuery, [id]);

      if (userExists.rows.length === 0) {
        await database.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      const user = userExists.rows[0];

      // Check if user has active sessions (optional - you might want to prevent deletion of users with active sessions)
      const activeSessionsQuery = `
        SELECT COUNT(*) as active_count 
        FROM sessions 
        WHERE user_id = $1 AND status = 'active'
      `;
      const activeSessions = await database.query(activeSessionsQuery, [id]);

      if (parseInt(activeSessions.rows[0].active_count) > 0) {
        await database.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Cannot delete user with active sessions. Please end all active sessions first.',
        });
      }

      // Archive user data instead of hard deletion for audit purposes
      // First, create an archive record
      const archiveUserQuery = `
        INSERT INTO deleted_users (original_user_id, user_data, deleted_by, deleted_at)
        SELECT 
          id,
          row_to_json(users.*) as user_data,
          $2,
          NOW()
        FROM users 
        WHERE id = $1
        RETURNING id
      `;

      // Create deleted_users table if it doesn't exist
      const createArchiveTableQuery = `
        CREATE TABLE IF NOT EXISTS deleted_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          original_user_id UUID NOT NULL,
          user_data JSONB NOT NULL,
          deleted_by UUID NOT NULL REFERENCES admin_users(id),
          deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;

      await database.query(createArchiveTableQuery);
      await database.query(archiveUserQuery, [id, adminId]);

      // Delete related data in correct order to avoid foreign key violations

      // Delete credit transactions
      await database.query('DELETE FROM credit_transactions WHERE user_id = $1', [id]);

      // Delete user sessions (and their related data)
      await database.query(
        'DELETE FROM session_feedback WHERE session_id IN (SELECT id FROM sessions WHERE user_id = $1)',
        [id]
      );
      await database.query('DELETE FROM sessions WHERE user_id = $1', [id]);

      // Delete payments/subscriptions if they exist
      await database.query('DELETE FROM payments WHERE user_id = $1', [id]);

      // Finally, delete the user
      const deleteUserQuery = `DELETE FROM users WHERE id = $1`;
      await database.query(deleteUserQuery, [id]);

      await database.query('COMMIT');

      // Log the deletion for audit
      console.log(`User ${user.email} (ID: ${id}) deleted by admin ${adminId}`);

      res.json({
        success: true,
        message: 'User deleted successfully',
        data: {
          deletedUserId: id,
          deletedUserEmail: user.email,
          deletedUserName: `${user.first_name} ${user.last_name}`.trim(),
          deletedAt: new Date().toISOString(),
          deletedBy: adminId,
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

// Restore deleted user (admin recovery feature)
router.post(
  '/restore/:originalUserId',
  requirePermission(['users.write', 'users.restore']),
  [param('originalUserId').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { originalUserId } = req.params;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      // Check if deleted user exists
      const deletedUserQuery = `
        SELECT id, user_data, deleted_at 
        FROM deleted_users 
        WHERE original_user_id = $1 
        ORDER BY deleted_at DESC 
        LIMIT 1
      `;
      const deletedUserResult = await database.query(deletedUserQuery, [originalUserId]);

      if (deletedUserResult.rows.length === 0) {
        await database.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Deleted user record not found',
        });
      }

      const { user_data: userData, deleted_at: deletedAt } = deletedUserResult.rows[0];

      // Check if user with same email already exists
      const existingUserQuery = `SELECT id FROM users WHERE email = $1`;
      const existingUser = await database.query(existingUserQuery, [userData.email]);

      if (existingUser.rows.length > 0) {
        await database.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Cannot restore user: A user with this email already exists',
        });
      }

      // Restore the user (create new record with same data but new timestamps)
      const restoreUserQuery = `
        INSERT INTO users (
          id, first_name, last_name, email, password_hash, credits, 
          created_at, updated_at, last_active, is_suspended
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9
        )
        RETURNING id, email, first_name, last_name
      `;

      const restoredUser = await database.query(restoreUserQuery, [
        userData.id,
        userData.first_name,
        userData.last_name,
        userData.email,
        userData.password_hash,
        userData.credits || 0,
        userData.created_at,
        userData.last_active,
        false, // Restore as not suspended
      ]);

      // Mark the deleted record as restored
      await database.query(
        'UPDATE deleted_users SET restored_at = NOW(), restored_by = $1 WHERE original_user_id = $2',
        [adminId, originalUserId]
      );

      await database.query('COMMIT');

      const restored = restoredUser.rows[0];
      res.json({
        success: true,
        message: 'User restored successfully',
        data: {
          restoredUserId: restored.id,
          restoredUserEmail: restored.email,
          restoredUserName: `${restored.first_name} ${restored.last_name}`.trim(),
          originallyDeletedAt: deletedAt,
          restoredAt: new Date().toISOString(),
          restoredBy: adminId,
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

export default router;
