import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { asyncHandler } from '../../middleware/admin/errorHandler.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import moment from 'moment';

const router = express.Router();

// Generate user activity report
router.post(
  '/users',
  requirePermission(['reports.generate']),
  [
    body('startDate').isISO8601().withMessage('Invalid start date'),
    body('endDate').isISO8601().withMessage('Invalid end date'),
    body('format').isIn(['json', 'csv', 'pdf']).withMessage('Invalid format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { startDate, endDate, format } = req.body;

    const userReportQuery = `
      SELECT 
        u.id,
        u.first_name || ' ' || COALESCE(u.last_name, '') as name,
        u.email,
        u.created_at,
        u.last_active,
        COUNT(s.id) as session_count,
        SUM(s.credits_used) as total_credits_used,
        AVG(s.interview_duration) as avg_session_duration
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id 
        AND s.created_at BETWEEN $1 AND $2
      WHERE u.created_at BETWEEN $1 AND $2
      GROUP BY u.id, u.first_name, u.last_name, u.email, u.created_at, u.last_active
      ORDER BY session_count DESC
    `;

    const result = await database.query(userReportQuery, [startDate, endDate]);

    const reportData = result.rows.map(row => ({
      id: row.id,
      name: row.name.trim(),
      email: row.email,
      createdAt: row.created_at,
      lastActive: row.last_active,
      sessionCount: parseInt(row.session_count || 0),
      totalCreditsUsed: parseInt(row.total_credits_used || 0),
      avgSessionDuration: parseFloat(row.avg_session_duration || 0),
    }));

    res.json({
      success: true,
      data: {
        type: 'user_activity',
        period: { startDate, endDate },
        format,
        records: reportData,
        totalRecords: reportData.length,
        generatedAt: new Date().toISOString(),
      },
    });
  })
);

// Generate session analysis report
router.post(
  '/sessions',
  requirePermission(['reports.generate']),
  [
    body('startDate').isISO8601().withMessage('Invalid start date'),
    body('endDate').isISO8601().withMessage('Invalid end date'),
    body('format').isIn(['json', 'csv', 'pdf']).withMessage('Invalid format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { startDate, endDate, format } = req.body;

    const sessionReportQuery = `
      SELECT 
        s.id,
        u.first_name || ' ' || COALESCE(u.last_name, '') as user_name,
        u.email as user_email,
        s.interview_type,
        s.difficulty_level,
        s.status,
        s.credits_used,
        s.interview_duration,
        s.created_at,
        s.started_at,
        s.completed_at,
        s.desktop_connected_at IS NOT NULL as used_desktop_app
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.created_at BETWEEN $1 AND $2
      ORDER BY s.created_at DESC
    `;

    const result = await database.query(sessionReportQuery, [startDate, endDate]);

    const reportData = result.rows.map(row => ({
      id: row.id,
      userName: row.user_name.trim(),
      userEmail: row.user_email,
      interviewType: row.interview_type,
      difficultyLevel: row.difficulty_level,
      status: row.status,
      creditsUsed: parseInt(row.credits_used || 0),
      duration: parseFloat(row.interview_duration || 0),
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      usedDesktopApp: row.used_desktop_app,
    }));

    res.json({
      success: true,
      data: {
        type: 'session_analysis',
        period: { startDate, endDate },
        format,
        records: reportData,
        totalRecords: reportData.length,
        generatedAt: new Date().toISOString(),
      },
    });
  })
);

// Generate revenue report
router.post(
  '/revenue',
  requirePermission(['reports.generate', 'financial.read']),
  [
    body('startDate').isISO8601().withMessage('Invalid start date'),
    body('endDate').isISO8601().withMessage('Invalid end date'),
    body('format').isIn(['json', 'csv', 'pdf']).withMessage('Invalid format'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { startDate, endDate, format } = req.body;

    // Query to get actual revenue from payments (both one-time and subscription)
    const revenueReportQuery = `
      WITH daily_revenue AS (
        SELECT 
          DATE(p.completed_at) as transaction_date,
          -- One-time credit purchases
          COUNT(CASE WHEN p.subscription_period_months IS NULL THEN 1 END) as credit_purchases,
          SUM(CASE WHEN p.subscription_period_months IS NULL THEN p.amount_usd ELSE 0 END) as credit_revenue,
          SUM(CASE WHEN p.subscription_period_months IS NULL THEN p.credits_purchased ELSE 0 END) as credits_sold,
          -- Subscription purchases  
          COUNT(CASE WHEN p.subscription_period_months IS NOT NULL THEN 1 END) as subscription_purchases,
          SUM(CASE WHEN p.subscription_period_months IS NOT NULL THEN p.amount_usd ELSE 0 END) as subscription_revenue,
          -- Overall totals
          COUNT(*) as total_transactions,
          SUM(p.amount_usd) as total_revenue,
          SUM(p.discount_amount) as total_discounts,
          SUM(p.tax_amount) as total_taxes,
          COUNT(DISTINCT p.user_id) as unique_customers
        FROM payments p
        WHERE p.completed_at BETWEEN $1 AND $2
        AND p.status = 'completed'
        GROUP BY DATE(p.completed_at)
      )
      SELECT 
        transaction_date,
        credit_purchases,
        credit_revenue,
        credits_sold,
        subscription_purchases, 
        subscription_revenue,
        total_transactions,
        total_revenue,
        total_discounts,
        total_taxes,
        unique_customers,
        -- Calculate average values
        CASE WHEN credit_purchases > 0 THEN credit_revenue / credit_purchases ELSE 0 END as avg_credit_purchase_value,
        CASE WHEN credits_sold > 0 THEN credit_revenue / credits_sold ELSE 0 END as revenue_per_credit,
        CASE WHEN subscription_purchases > 0 THEN subscription_revenue / subscription_purchases ELSE 0 END as avg_subscription_value
      FROM daily_revenue
      ORDER BY transaction_date
    `;

    const result = await database.query(revenueReportQuery, [startDate, endDate]);

    const reportData = result.rows.map(row => ({
      date: moment(row.transaction_date).format('YYYY-MM-DD'),
      creditPurchases: parseInt(row.credit_purchases || 0),
      creditRevenue: parseFloat(row.credit_revenue || 0),
      creditsSold: parseInt(row.credits_sold || 0),
      subscriptionPurchases: parseInt(row.subscription_purchases || 0),
      subscriptionRevenue: parseFloat(row.subscription_revenue || 0),
      totalTransactions: parseInt(row.total_transactions || 0),
      totalRevenue: parseFloat(row.total_revenue || 0),
      totalDiscounts: parseFloat(row.total_discounts || 0),
      totalTaxes: parseFloat(row.total_taxes || 0),
      uniqueCustomers: parseInt(row.unique_customers || 0),
      avgCreditPurchaseValue: parseFloat(row.avg_credit_purchase_value || 0),
      revenuePerCredit: parseFloat(row.revenue_per_credit || 0),
      avgSubscriptionValue: parseFloat(row.avg_subscription_value || 0),
    }));

    // Calculate summary totals
    const summary = {
      totalRevenue: reportData.reduce((sum, day) => sum + day.totalRevenue, 0),
      totalCreditRevenue: reportData.reduce((sum, day) => sum + day.creditRevenue, 0),
      totalSubscriptionRevenue: reportData.reduce((sum, day) => sum + day.subscriptionRevenue, 0),
      totalCredits: reportData.reduce((sum, day) => sum + day.creditsSold, 0),
      totalTransactions: reportData.reduce((sum, day) => sum + day.totalTransactions, 0),
      totalCreditPurchases: reportData.reduce((sum, day) => sum + day.creditPurchases, 0),
      totalSubscriptionPurchases: reportData.reduce(
        (sum, day) => sum + day.subscriptionPurchases,
        0
      ),
      totalDiscounts: reportData.reduce((sum, day) => sum + day.totalDiscounts, 0),
      totalTaxes: reportData.reduce((sum, day) => sum + day.totalTaxes, 0),
      uniqueCustomers: new Set(
        reportData.flatMap(day =>
          Array.from({ length: day.uniqueCustomers }, (_, i) => `${day.date}-${i}`)
        )
      ).size,
      avgRevenuePerDay:
        reportData.length > 0
          ? reportData.reduce((sum, day) => sum + day.totalRevenue, 0) / reportData.length
          : 0,
      avgTransactionsPerDay:
        reportData.length > 0
          ? reportData.reduce((sum, day) => sum + day.totalTransactions, 0) / reportData.length
          : 0,
    };

    res.json({
      success: true,
      data: {
        type: 'revenue_analysis',
        period: { startDate, endDate },
        format,
        records: reportData,
        totalRecords: reportData.length,
        summary,
        generatedAt: new Date().toISOString(),
      },
    });
  })
);

// Get available report templates
router.get(
  '/templates',
  requirePermission(['reports.read']),
  asyncHandler(async (req, res) => {
    const templates = [
      {
        id: 'user_activity',
        name: 'User Activity Report',
        description: 'Detailed analysis of user engagement and session activity',
        parameters: ['startDate', 'endDate', 'format'],
        formats: ['json', 'csv', 'pdf'],
      },
      {
        id: 'session_analysis',
        name: 'Session Analysis Report',
        description: 'Comprehensive breakdown of interview sessions',
        parameters: ['startDate', 'endDate', 'format'],
        formats: ['json', 'csv', 'pdf'],
      },
      {
        id: 'revenue_analysis',
        name: 'Revenue Analysis Report',
        description:
          'Comprehensive financial performance analysis based on actual payments, including credit purchases, subscriptions, taxes, and discounts',
        parameters: ['startDate', 'endDate', 'format'],
        formats: ['json', 'csv', 'pdf'],
      },
    ];

    res.json({
      success: true,
      data: templates,
    });
  })
);

// Get report history
router.get(
  '/history',
  requirePermission(['reports.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
  ],
  asyncHandler(async (req, res) => {
    // Since the report_history table doesn't exist yet, return mock data
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Mock report history data
    const mockHistory = [
      {
        id: 'rpt_001',
        type: 'user_activity',
        parameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          format: 'json',
        },
        status: 'completed',
        generatedBy: 'admin@example.com',
        createdAt: '2024-01-31T10:00:00Z',
        completedAt: '2024-01-31T10:02:15Z',
        fileSize: 15420,
        downloadCount: 3,
      },
      {
        id: 'rpt_002',
        type: 'session_analysis',
        parameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          format: 'csv',
        },
        status: 'completed',
        generatedBy: 'admin@example.com',
        createdAt: '2024-01-30T14:30:00Z',
        completedAt: '2024-01-30T14:33:45Z',
        fileSize: 28934,
        downloadCount: 1,
      },
      {
        id: 'rpt_003',
        type: 'revenue_analysis',
        parameters: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          format: 'pdf',
        },
        status: 'processing',
        generatedBy: 'admin@example.com',
        createdAt: '2024-02-01T09:15:00Z',
        completedAt: null,
        fileSize: 0,
        downloadCount: 0,
      },
    ];

    // Simulate pagination
    const totalRecords = mockHistory.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedHistory = mockHistory.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        reports: paginatedHistory,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
    });
  })
);

export default router;
