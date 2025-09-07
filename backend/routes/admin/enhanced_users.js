import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
// Create asyncHandler utility
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import _bcrypt from 'bcryptjs';

const router = express.Router();

// Get comprehensive user list with advanced filtering and detailed information
router.get(
  '/',
  requirePermission(['users.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('status')
      .optional()
      .isIn(['all', 'active', 'inactive', 'suspended', 'verified', 'unverified']),
    query('subscription_tier').optional().isIn(['all', 'free', 'pro', 'enterprise']),
    query('sortBy')
      .optional()
      .isIn([
        'created_at',
        'registrationDate',
        'last_activity',
        'total_sessions',
        'total_spent_usd',
        'credits',
        'name',
        'email',
      ]),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format'),
    query('registrationSource').optional().isString(),
    query('country').optional().isString(),
    query('hasSpent').optional().isBoolean(),
    query('minSessions').optional().isInt({ min: 0 }),
    query('maxSessions').optional().isInt({ min: 0 }),
    query('tags').optional().isString(),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const {
      search,
      status,
      subscription_tier,
      sortBy = 'created_at',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      registrationSource,
      country,
      hasSpent,
      minSessions,
      maxSessions,
      tags,
    } = req.query;

    // Build complex WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (search) {
      conditions.push(`(
        u.name ILIKE $${paramIndex} OR 
        u.first_name ILIKE $${paramIndex} OR 
        u.last_name ILIKE $${paramIndex} OR 
        u.email ILIKE $${paramIndex} OR
        u.phone ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      switch (status) {
        case 'active':
          conditions.push(`u.is_active = true AND u.is_suspended = false`);
          break;
        case 'inactive':
          conditions.push(`u.is_active = false`);
          break;
        case 'suspended':
          conditions.push(`u.is_suspended = true`);
          break;
        case 'verified':
          conditions.push(`u.is_verified = true`);
          break;
        case 'unverified':
          conditions.push(`u.is_verified = false`);
          break;
      }
    }

    if (subscription_tier && subscription_tier !== 'all') {
      conditions.push(`u.subscription_tier = $${paramIndex}`);
      params.push(subscription_tier);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`u.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`u.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    if (registrationSource) {
      conditions.push(`u.registration_source = $${paramIndex}`);
      params.push(registrationSource);
      paramIndex++;
    }

    if (country) {
      conditions.push(`u.country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    if (hasSpent === 'true') {
      conditions.push(`u.total_spent_usd > 0`);
    } else if (hasSpent === 'false') {
      conditions.push(`(u.total_spent_usd = 0 OR u.total_spent_usd IS NULL)`);
    }

    if (minSessions) {
      conditions.push(`u.total_sessions_completed >= $${paramIndex}`);
      params.push(parseInt(minSessions));
      paramIndex++;
    }

    if (maxSessions) {
      conditions.push(`u.total_sessions_completed <= $${paramIndex}`);
      params.push(parseInt(maxSessions));
      paramIndex++;
    }

    if (tags) {
      conditions.push(`u.tags @> $${paramIndex}::jsonb`);
      params.push(JSON.stringify([tags]));
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Map frontend sortBy parameters to actual database columns
    const getSortColumn = sortBy => {
      switch (sortBy) {
        case 'registrationDate':
          return 'u.created_at';
        case 'session_count':
          return 'COUNT(DISTINCT s.id)';
        case 'payment_count':
          return 'COUNT(DISTINCT p.id)';
        case 'total_sessions':
          return 'u.total_sessions_completed';
        case 'total_spent_usd':
          return 'u.total_spent_usd';
        case 'credits':
          return 'u.credits';
        case 'name':
          return 'u.name';
        case 'email':
          return 'u.email';
        case 'last_activity':
          return 'u.last_activity';
        case 'created_at':
        default:
          return 'u.created_at';
      }
    };

    const sortColumn = getSortColumn(sortBy);

    const usersQuery = `
      SELECT 
        u.id, u.name, u.first_name, u.last_name, u.email, u.phone, u.country,
        u.credits, u.subscription_tier, u.is_active, u.is_verified, u.is_suspended,
        u.suspension_reason, u.suspended_at, u.suspended_by, u.admin_notes,
        u.registration_source, u.registration_ip, u.created_at, u.last_activity,
        u.total_sessions_completed, u.total_spent_usd, u.lifetime_value_usd, u.tags,
        u.marketing_consent, u.email_verified_at, u.avatar_url,
        
        -- Session statistics
        COUNT(DISTINCT s.id) as session_count,
        COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN s.id END) as completed_sessions,
        COUNT(DISTINCT CASE WHEN s.created_at >= NOW() - INTERVAL '30 days' THEN s.id END) as recent_sessions,
        AVG(CASE WHEN s.total_duration_minutes > 0 THEN s.total_duration_minutes END) as avg_session_duration,
        
        -- Payment statistics
        COUNT(DISTINCT p.id) as payment_count,
        SUM(CASE WHEN p.status = 'completed' THEN p.amount_usd ELSE 0 END) as total_payments,
        MAX(p.completed_at) as last_payment_date,
        
        -- Credit statistics
        COUNT(DISTINCT ct.id) as credit_transaction_count,
        SUM(CASE WHEN ct.transaction_type = 'usage' THEN ABS(ct.credits_amount) ELSE 0 END) as total_credits_used,
        
        -- Admin info
        admin_suspender.name as suspended_by_name
        
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      LEFT JOIN payments p ON u.id = p.user_id
      LEFT JOIN credit_transactions ct ON u.id = ct.user_id
      LEFT JOIN admin_users admin_suspender ON u.suspended_by = admin_suspender.id
      ${whereClause}
      GROUP BY u.id, admin_suspender.name
      ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      LEFT JOIN payments p ON u.id = p.user_id
      LEFT JOIN credit_transactions ct ON u.id = ct.user_id
      ${whereClause}
    `;

    params.push(limit, offset);

    const [usersResult, countResult] = await Promise.all([
      database.query(usersQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const users = usersResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      country: row.country,
      avatarUrl: row.avatar_url,

      // Account status
      credits: parseInt(row.credits || 0),
      subscriptionTier: row.subscription_tier,
      isActive: row.is_active,
      isVerified: row.is_verified,
      isSuspended: row.is_suspended,
      suspensionReason: row.suspension_reason,
      suspendedAt: row.suspended_at,
      suspendedByName: row.suspended_by_name,

      // Registration info
      registrationSource: row.registration_source,
      registrationIp: row.registration_ip,
      createdAt: row.created_at,
      lastActivity: row.last_activity,
      emailVerifiedAt: row.email_verified_at,

      // Statistics
      totalSessions: parseInt(row.total_sessions_completed || 0),
      sessionCount: parseInt(row.session_count || 0),
      completedSessions: parseInt(row.completed_sessions || 0),
      recentSessions: parseInt(row.recent_sessions || 0),
      avgSessionDuration: parseFloat(row.avg_session_duration || 0),

      // Financial
      totalSpent: parseFloat(row.total_spent_usd || 0),
      lifetimeValue: parseFloat(row.lifetime_value_usd || 0),
      paymentCount: parseInt(row.payment_count || 0),
      totalPayments: parseFloat(row.total_payments || 0),
      lastPaymentDate: row.last_payment_date,

      // Credits
      creditTransactionCount: parseInt(row.credit_transaction_count || 0),
      totalCreditsUsed: parseInt(row.total_credits_used || 0),

      // Admin
      adminNotes: row.admin_notes,
      tags: row.tags || [],
      marketingConsent: row.marketing_consent,
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN is_suspended = true THEN 1 END) as suspended_users,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30d,
        AVG(credits) as avg_credits,
        SUM(total_spent_usd) as total_revenue,
        COUNT(CASE WHEN subscription_tier = 'free' THEN 1 END) as free_tier_users,
        COUNT(CASE WHEN subscription_tier = 'pro' THEN 1 END) as pro_tier_users,
        COUNT(CASE WHEN subscription_tier = 'enterprise' THEN 1 END) as enterprise_tier_users
      FROM users
      ${whereClause}
    `;

    const summaryResult = await database.query(summaryQuery, params.slice(0, -2));
    const summary = summaryResult.rows[0];

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
        summary: {
          totalUsers: parseInt(summary.total_users || 0),
          activeUsers: parseInt(summary.active_users || 0),
          suspendedUsers: parseInt(summary.suspended_users || 0),
          verifiedUsers: parseInt(summary.verified_users || 0),
          newUsers30d: parseInt(summary.new_users_30d || 0),
          avgCredits: parseFloat(summary.avg_credits || 0),
          totalRevenue: parseFloat(summary.total_revenue || 0),
          tierDistribution: {
            free: parseInt(summary.free_tier_users || 0),
            pro: parseInt(summary.pro_tier_users || 0),
            enterprise: parseInt(summary.enterprise_tier_users || 0),
          },
        },
        filters: {
          search,
          status,
          subscription_tier,
          sortBy,
          sortOrder,
          dateFrom,
          dateTo,
          registrationSource,
          country,
          hasSpent,
          minSessions,
          maxSessions,
          tags,
        },
      },
    });
  })
);

// Get detailed user profile with comprehensive information
router.get(
  '/:id/profile',
  requirePermission(['users.read']),
  [param('id').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    // Get comprehensive user profile
    const userQuery = `
      SELECT 
        u.*,
        admin_suspender.name as suspended_by_name,
        admin_suspender.email as suspended_by_email
      FROM users u
      LEFT JOIN admin_users admin_suspender ON u.suspended_by = admin_suspender.id
      WHERE u.id = $1
    `;

    // Get user sessions with detailed info
    const sessionsQuery = `
      SELECT 
        s.id, s.session_name, s.company_name, s.job_title, s.interview_type,
        s.difficulty_level, s.status, s.total_duration_minutes, s.desktop_connected,
        s.created_at, s.started_at, s.ended_at,
        COUNT(im.id) as message_count,
        sa.overall_performance_score
      FROM sessions s
      LEFT JOIN interview_messages im ON s.id = im.session_id
      LEFT JOIN session_analytics sa ON s.id = sa.session_id
      WHERE s.user_id = $1
      GROUP BY s.id, sa.overall_performance_score
      ORDER BY s.created_at DESC
      LIMIT 20
    `;

    // Get payment history
    const paymentsQuery = `
      SELECT 
        p.id, p.amount_usd, p.credits_purchased, p.payment_provider,
        p.payment_method_type, p.status, p.created_at, p.completed_at,
        p.subscription_period_months, p.failure_reason
      FROM payments p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 20
    `;

    // Get credit transaction history
    const creditHistoryQuery = `
      SELECT 
        ct.id, ct.transaction_type, ct.credits_amount, ct.description,
        ct.created_at, ct.cost_usd, ct.payment_reference,
        s.session_name, p.payment_provider, 
        admin_user.name as admin_name
      FROM credit_transactions ct
      LEFT JOIN sessions s ON ct.session_id = s.id
      LEFT JOIN payments p ON ct.payment_id = p.id
      LEFT JOIN users admin_user ON ct.admin_user_id = admin_user.id
      WHERE ct.user_id = $1
      ORDER BY ct.created_at DESC
      LIMIT 50
    `;

    // Get activity logs
    const activityQuery = `
      SELECT 
        ual.activity_type, ual.activity_category, ual.description,
        ual.ip_address, ual.created_at, ual.metadata,
        s.session_name
      FROM user_activity_logs ual
      LEFT JOIN sessions s ON ual.session_id = s.id
      WHERE ual.user_id = $1
      ORDER BY ual.created_at DESC
      LIMIT 50
    `;

    // Get user resumes
    const resumesQuery = `
      SELECT 
        ur.id, ur.file_name, ur.original_filename, ur.file_size_bytes,
        ur.parsing_status, ur.career_level, ur.total_experience_years,
        ur.completeness_score, ur.ats_score, ur.created_at, ur.is_active,
        ur.skills, ur.experience_summary
      FROM user_resumes ur
      WHERE ur.user_id = $1
      ORDER BY ur.created_at DESC
    `;

    const [
      userResult,
      sessionsResult,
      paymentsResult,
      creditResult,
      activityResult,
      resumesResult,
    ] = await Promise.all([
      database.query(userQuery, [id]),
      database.query(sessionsQuery, [id]),
      database.query(paymentsQuery, [id]),
      database.query(creditHistoryQuery, [id]),
      database.query(activityQuery, [id]),
      database.query(resumesQuery, [id]),
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      data: {
        profile: {
          id: user.id,
          name: user.name,
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          country: user.country,
          timezone: user.timezone,
          avatarUrl: user.avatar_url,

          // Account details
          credits: parseInt(user.credits || 0),
          subscriptionTier: user.subscription_tier,
          isActive: user.is_active,
          isVerified: user.is_verified,
          isSuspended: user.is_suspended,
          suspensionReason: user.suspension_reason,
          suspendedAt: user.suspended_at,
          suspendedBy: user.suspended_by
            ? {
                name: user.suspended_by_name,
                email: user.suspended_by_email,
              }
            : null,

          // Registration info
          registrationSource: user.registration_source,
          registrationIp: user.registration_ip,
          createdAt: user.created_at,
          lastActivity: user.last_activity,
          lastLogin: user.last_login,
          loginCount: parseInt(user.login_count || 0),

          // Email verification
          emailVerifiedAt: user.email_verified_at,

          // Statistics
          totalSessions: parseInt(user.total_sessions || 0),
          totalSpent: parseFloat(user.total_spent_usd || 0),
          lifetimeValue: parseFloat(user.lifetime_value_usd || 0),

          // Admin fields
          adminNotes: user.admin_notes,
          tags: user.tags || [],
          marketingConsent: user.marketing_consent,

          // Settings
          preferences: user.preferences || {},
        },
        sessions: sessionsResult.rows.map(session => ({
          id: session.id,
          sessionName: session.session_name,
          companyName: session.company_name,
          jobTitle: session.job_title,
          interviewType: session.interview_type,
          difficultyLevel: session.difficulty_level,
          status: session.status,
          duration: session.total_duration_minutes,
          desktopConnected: session.desktop_connected,
          messageCount: parseInt(session.message_count || 0),
          performanceScore: session.overall_performance_score,
          createdAt: session.created_at,
          startedAt: session.started_at,
          endedAt: session.ended_at,
        })),
        payments: paymentsResult.rows.map(payment => ({
          id: payment.id,
          amount: parseFloat(payment.amount_usd || 0),
          creditsPurchased: parseInt(payment.credits_purchased || 0),
          provider: payment.payment_provider,
          methodType: payment.payment_method_type,
          status: payment.status,
          subscriptionMonths: payment.subscription_period_months,
          failureReason: payment.failure_reason,
          createdAt: payment.created_at,
          completedAt: payment.completed_at,
        })),
        creditHistory: creditResult.rows.map(credit => ({
          id: credit.id,
          type: credit.transaction_type,
          amount: parseInt(credit.credits_amount || 0),
          description: credit.description,
          cost: parseFloat(credit.cost_usd || 0),
          paymentReference: credit.payment_reference,
          sessionName: credit.session_name,
          paymentProvider: credit.payment_provider,
          adminName: credit.admin_name,
          createdAt: credit.created_at,
        })),
        activity: activityResult.rows.map(activity => ({
          type: activity.activity_type,
          category: activity.activity_category,
          description: activity.description,
          ipAddress: activity.ip_address,
          sessionName: activity.session_name,
          metadata: activity.metadata || {},
          createdAt: activity.created_at,
        })),
        resumes: resumesResult.rows.map(resume => ({
          id: resume.id,
          fileName: resume.file_name,
          originalFilename: resume.original_filename,
          fileSizeBytes: resume.file_size_bytes,
          parsingStatus: resume.parsing_status,
          careerLevel: resume.career_level,
          totalExperienceYears: resume.total_experience_years,
          completenessScore: resume.completeness_score,
          atsScore: resume.ats_score,
          isActive: resume.is_active,
          skills: resume.skills || [],
          experienceSummary: resume.experience_summary || {},
          createdAt: resume.created_at,
        })),
      },
    });
  })
);

// Update admin notes only (PATCH method for partial updates)
router.patch(
  '/:id',
  requirePermission(['users.write']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('admin_notes').optional().isString().withMessage('Invalid admin notes'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { admin_notes } = req.body;
    const adminId = req.admin.id;

    // Check if user exists
    const userCheck = await database.query('SELECT name, email FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Update admin notes
    const result = await database.query(
      'UPDATE users SET admin_notes = $1, updated_at = NOW() WHERE id = $2 RETURNING admin_notes',
      [admin_notes, id]
    );

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'USER_ADMIN_NOTES_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        userId: id,
        userName: userCheck.rows[0].name,
        userEmail: userCheck.rows[0].email,
        adminNotes: admin_notes,
      },
    });

    res.json({
      success: true,
      message: 'Admin notes updated successfully',
      data: {
        user: {
          id,
          admin_notes: result.rows[0].admin_notes,
        },
      },
    });
  })
);

// Update user profile and admin fields
router.put(
  '/:id',
  requirePermission(['users.write']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('name').optional().isLength({ min: 1, max: 255 }).withMessage('Invalid name'),
    body('firstName').optional().isLength({ max: 100 }).withMessage('Invalid first name'),
    body('lastName').optional().isLength({ max: 100 }).withMessage('Invalid last name'),
    body('email').optional().isEmail().withMessage('Invalid email'),
    body('phone').optional().isLength({ max: 20 }).withMessage('Invalid phone'),
    body('country').optional().isLength({ max: 100 }).withMessage('Invalid country'),
    body('subscriptionTier')
      .optional()
      .isIn(['free', 'pro', 'enterprise'])
      .withMessage('Invalid subscription tier'),
    body('isActive').optional().isBoolean().withMessage('Invalid active status'),
    body('adminNotes').optional().isString().withMessage('Invalid admin notes'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('marketingConsent').optional().isBoolean().withMessage('Invalid marketing consent'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    const {
      name,
      firstName,
      lastName,
      email,
      phone,
      country,
      subscriptionTier,
      isActive,
      adminNotes,
      tags,
      marketingConsent,
    } = req.body;

    // Build update query dynamically
    const updateFields = [];
    const params = [id];
    let paramIndex = 2;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (firstName !== undefined) {
      updateFields.push(`first_name = $${paramIndex}`);
      params.push(firstName);
      paramIndex++;
    }

    if (lastName !== undefined) {
      updateFields.push(`last_name = $${paramIndex}`);
      params.push(lastName);
      paramIndex++;
    }

    if (email !== undefined) {
      // Check if email already exists
      const existingUser = await database.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, id]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists',
        });
      }

      updateFields.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }

    if (country !== undefined) {
      updateFields.push(`country = $${paramIndex}`);
      params.push(country);
      paramIndex++;
    }

    if (subscriptionTier !== undefined) {
      updateFields.push(`subscription_tier = $${paramIndex}`);
      params.push(subscriptionTier);
      paramIndex++;
    }

    if (isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (adminNotes !== undefined) {
      updateFields.push(`admin_notes = $${paramIndex}`);
      params.push(adminNotes);
      paramIndex++;
    }

    if (tags !== undefined) {
      updateFields.push(`tags = $${paramIndex}::jsonb`);
      params.push(JSON.stringify(tags));
      paramIndex++;
    }

    if (marketingConsent !== undefined) {
      updateFields.push(`marketing_consent = $${paramIndex}`);
      params.push(marketingConsent);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }

    updateFields.push(`updated_at = NOW()`);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await database.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'USER_UPDATE',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        userId: id,
        updatedFields: Object.keys(req.body),
        changes: req.body,
      },
    });

    const updatedUser = result.rows[0];

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        country: updatedUser.country,
        subscriptionTier: updatedUser.subscription_tier,
        isActive: updatedUser.is_active,
        adminNotes: updatedUser.admin_notes,
        tags: updatedUser.tags || [],
        marketingConsent: updatedUser.marketing_consent,
        updatedAt: updatedUser.updated_at,
      },
    });
  })
);

// Suspend/Unsuspend user
router.post(
  '/:id/suspend',
  requirePermission(['users.suspend']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('reason').notEmpty().withMessage('Suspension reason is required'),
    body('suspendUntil').optional().isISO8601().withMessage('Invalid suspension end date'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { reason, suspendUntil } = req.body;
    const adminId = req.admin.id;

    const result = await database.query(
      `
      UPDATE users 
      SET 
        is_suspended = true,
        suspension_reason = $2,
        suspended_at = NOW(),
        suspended_by = $3,
        suspended_until = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING name, email
    `,
      [id, reason, adminId, suspendUntil || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'USER_SUSPEND',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        userId: id,
        userName: result.rows[0].name,
        userEmail: result.rows[0].email,
        reason,
        suspendUntil,
      },
    });

    res.json({
      success: true,
      message: 'User suspended successfully',
    });
  })
);

// Unsuspend user
router.post(
  '/:id/unsuspend',
  requirePermission(['users.suspend']),
  [param('id').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    const result = await database.query(
      `
      UPDATE users 
      SET 
        is_suspended = false,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        suspended_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING name, email
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Log admin activity
    await database.logAdminActivity({
      adminId,
      action: 'USER_UNSUSPEND',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      details: {
        userId: id,
        userName: result.rows[0].name,
        userEmail: result.rows[0].email,
      },
    });

    res.json({
      success: true,
      message: 'User unsuspended successfully',
    });
  })
);

// Get user activity history
router.get(
  '/:id/history',
  requirePermission(['users.read']),
  [param('id').isUUID().withMessage('Invalid user ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    // Get user activity history from multiple sources
    const activityQuery = `
      SELECT 
        ual.id,
        ual.activity_type,
        ual.description,
        ual.ip_address,
        ual.created_at,
        ual.metadata,
        s.session_name
      FROM user_activity_logs ual
      LEFT JOIN sessions s ON ual.session_id = s.id
      WHERE ual.user_id = $1
      
      UNION ALL
      
      SELECT 
        ct.id,
        CASE 
          WHEN ct.transaction_type = 'usage' THEN 'credit_usage'
          WHEN ct.transaction_type = 'purchase' THEN 'credit_purchase'
          WHEN ct.transaction_type = 'adjustment' THEN 'credit_adjustment'
          ELSE 'credit_' || ct.transaction_type
        END as activity_type,
        ct.description,
        NULL as ip_address,
        ct.created_at,
        json_build_object(
          'credits_amount', ct.credits_amount,
          'admin_user_id', ct.admin_user_id,
          'session_id', ct.session_id,
          'payment_id', ct.payment_id
        ) as metadata,
        s.session_name
      FROM credit_transactions ct
      LEFT JOIN sessions s ON ct.session_id = s.id
      WHERE ct.user_id = $1
      
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const historyResult = await database.query(activityQuery, [id]);

    const history = historyResult.rows.map(row => ({
      id: row.id,
      activity_type: row.activity_type,
      description: row.description,
      metadata: row.metadata || {},
      created_at: row.created_at,
      session_name: row.session_name,
      ip_address: row.ip_address,
    }));

    res.json({
      success: true,
      data: {
        history,
      },
    });
  })
);

// Adjust user credits
router.post(
  '/:id/credits/adjust',
  requirePermission(['users.credits']),
  [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('amount').isInt().withMessage('Credit amount must be an integer'),
    body('reason').notEmpty().withMessage('Reason is required'),
    body('type')
      .isIn(['adjustment', 'bonus', 'admin_grant', 'refund'])
      .withMessage('Invalid transaction type'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { amount, reason, type } = req.body;
    const adminId = req.admin.id;

    await database.transaction(async client => {
      // Get current user credits
      const userResult = await client.query(
        'SELECT credits, name, email FROM users WHERE id = $1',
        [id]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentCredits = parseInt(userResult.rows[0].credits || 0);
      const newCredits = Math.max(0, currentCredits + amount);

      // Update user credits
      await client.query('UPDATE users SET credits = $1, updated_at = NOW() WHERE id = $2', [
        newCredits,
        id,
      ]);

      // Record credit transaction
      await client.query(
        `
        INSERT INTO credit_transactions (
          user_id, transaction_type, credits_amount, description,
          admin_user_id, admin_notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `,
        [id, type, amount, reason, adminId, reason]
      );

      // Log admin activity
      await client.query(
        `
        INSERT INTO admin_activity_log (
          admin_id, action, ip_address, user_agent, details, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
        [
          adminId,
          'USER_CREDIT_ADJUST',
          req.ip,
          req.get('User-Agent'),
          JSON.stringify({
            userId: id,
            userName: userResult.rows[0].name,
            userEmail: userResult.rows[0].email,
            creditsBefore: currentCredits,
            creditsAfter: newCredits,
            adjustment: amount,
            type,
            reason,
          }),
        ]
      );

      return { currentCredits, newCredits, user: userResult.rows[0] };
    });

    res.json({
      success: true,
      message: 'User credits adjusted successfully',
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
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const adminId = req.admin.id;

    try {
      await database.query('BEGIN');

      // Check if user exists and get user details
      const userExistsQuery = `
        SELECT id, name, first_name, last_name, email, is_active, is_suspended 
        FROM users WHERE id = $1
      `;
      const userExists = await database.query(userExistsQuery, [id]);

      if (userExists.rows.length === 0) {
        await database.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      const user = userExists.rows[0];
      const userName =
        user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User';

      // Check if user has active sessions (prevent deletion of users with active sessions)
      const activeSessionsQuery = `
        SELECT COUNT(*) as active_count 
        FROM sessions 
        WHERE user_id = $1 AND status IN ('active', 'in_progress', 'started')
      `;
      const activeSessions = await database.query(activeSessionsQuery, [id]);

      if (parseInt(activeSessions.rows[0].active_count) > 0) {
        await database.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Cannot delete user with active sessions. Please end all active sessions first.',
        });
      }

      // Create deleted_users table if it doesn't exist (for audit purposes)
      const createArchiveTableQuery = `
        CREATE TABLE IF NOT EXISTS deleted_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          original_user_id UUID NOT NULL,
          user_data JSONB NOT NULL,
          deleted_by UUID NOT NULL REFERENCES admin_users(id),
          deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          restored_at TIMESTAMP WITH TIME ZONE,
          restored_by UUID REFERENCES admin_users(id)
        )
      `;
      await database.query(createArchiveTableQuery);

      // Archive user data before deletion
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
      await database.query(archiveUserQuery, [id, adminId]);

      // Delete related data in correct order to avoid foreign key violations
      // Use safe delete approach - only delete from tables that exist

      // Helper function to safely delete from table if it exists
      const safeDelete = async (tableName, condition, params) => {
        try {
          const checkTableQuery = `
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name = $1
            )
          `;
          const tableExists = await database.query(checkTableQuery, [tableName]);

          if (tableExists.rows[0].exists) {
            await database.query(`DELETE FROM ${tableName} WHERE ${condition}`, params);
            console.log(`Deleted from ${tableName}`);
          } else {
            console.log(`Table ${tableName} doesn't exist, skipping`);
          }
        } catch (error) {
          console.warn(`Error deleting from ${tableName}:`, error.message);
          // Continue with other deletions
        }
      };

      // Delete user activity logs
      await safeDelete('user_activity_logs', 'user_id = $1', [id]);

      // Delete user resumes
      await safeDelete('user_resumes', 'user_id = $1', [id]);

      // Delete credit transactions
      await safeDelete('credit_transactions', 'user_id = $1', [id]);

      // Delete session-related data (delete child tables first)
      await safeDelete(
        'session_analytics',
        'session_id IN (SELECT id FROM sessions WHERE user_id = $1)',
        [id]
      );
      await safeDelete(
        'interview_messages',
        'session_id IN (SELECT id FROM sessions WHERE user_id = $1)',
        [id]
      );
      await safeDelete(
        'session_feedback',
        'session_id IN (SELECT id FROM sessions WHERE user_id = $1)',
        [id]
      );

      // Delete sessions
      await safeDelete('sessions', 'user_id = $1', [id]);

      // Delete payments/subscriptions if they exist
      await safeDelete('payments', 'user_id = $1', [id]);

      // Finally, delete the user
      const deleteUserQuery = `DELETE FROM users WHERE id = $1`;
      await database.query(deleteUserQuery, [id]);

      await database.query('COMMIT');

      // Log admin activity
      await database.query(
        `
        INSERT INTO admin_activity_log (
          admin_id, action, ip_address, user_agent, details, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `,
        [
          adminId,
          'USER_DELETE',
          req.ip,
          req.get('User-Agent'),
          JSON.stringify({
            userId: id,
            userName: userName,
            userEmail: user.email,
            deletedAt: new Date().toISOString(),
          }),
        ]
      );

      console.log(`User ${user.email} (ID: ${id}) deleted by admin ${adminId}`);

      res.json({
        success: true,
        message: 'User deleted successfully',
        data: {
          deletedUserId: id,
          deletedUserEmail: user.email,
          deletedUserName: userName,
          deletedAt: new Date().toISOString(),
          deletedBy: adminId,
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      console.error('Error deleting user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  })
);

export default router;
