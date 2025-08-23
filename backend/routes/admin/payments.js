import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../../middleware/admin/errorHandler.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Get all payments with pagination and filtering
router.get(
  '/',
  requirePermission(['payments.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('status')
      .optional()
      .isIn(['all', 'pending', 'completed', 'failed', 'refunded', 'cancelled']),
    query('paymentMethod')
      .optional()
      .isIn(['all', 'credit_card', 'paypal', 'bank_transfer', 'digital_wallet']),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('sortBy').optional().isIn(['created_at', 'amount', 'status', 'payment_method']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format'),
    query('minAmount').optional().isFloat({ min: 0 }).withMessage('Invalid minimum amount'),
    query('maxAmount').optional().isFloat({ min: 0 }).withMessage('Invalid maximum amount'),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const {
      status,
      paymentMethod,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
    } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      conditions.push(`p.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (paymentMethod && paymentMethod !== 'all') {
      conditions.push(`p.payment_method = $${paramIndex}`);
      params.push(paymentMethod);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        p.transaction_id ILIKE $${paramIndex} OR 
        p.gateway_transaction_id ILIKE $${paramIndex} OR 
        u.name ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`p.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`p.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    if (minAmount !== undefined) {
      conditions.push(`p.amount >= $${paramIndex}`);
      params.push(parseFloat(minAmount));
      paramIndex++;
    }

    if (maxAmount !== undefined) {
      conditions.push(`p.amount <= $${paramIndex}`);
      params.push(parseFloat(maxAmount));
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const paymentsQuery = `
      SELECT 
        p.id,
        p.transaction_id,
        p.amount,
        p.currency,
        p.status,
        p.payment_method,
        p.gateway_transaction_id,
        p.gateway_response,
        p.credits_purchased,
        p.created_at,
        p.processed_at,
        p.refunded_at,
        p.refund_amount,
        p.refund_reason,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.credits as user_current_credits
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY p.${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM payments p
      JOIN users u ON p.user_id = u.id
      ${whereClause}
    `;

    params.push(limit, offset);

    const [paymentsResult, countResult] = await Promise.all([
      database.query(paymentsQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const payments = paymentsResult.rows.map(row => ({
      id: row.id,
      transactionId: row.transaction_id,
      amount: parseFloat(row.amount || 0),
      currency: row.currency,
      status: row.status,
      paymentMethod: row.payment_method,
      gatewayTransactionId: row.gateway_transaction_id,
      gatewayResponse: row.gateway_response,
      creditsPurchased: parseInt(row.credits_purchased || 0),
      createdAt: row.created_at,
      processedAt: row.processed_at,
      refundedAt: row.refunded_at,
      refundAmount: row.refund_amount ? parseFloat(row.refund_amount) : null,
      refundReason: row.refund_reason,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        currentCredits: parseInt(row.user_current_credits || 0),
      },
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: {
          status,
          paymentMethod,
          search,
          sortBy,
          sortOrder,
          dateFrom,
          dateTo,
          minAmount,
          maxAmount,
        },
      },
    });
  })
);

// Get payment details by ID
router.get(
  '/:id',
  requirePermission(['payments.read']),
  [param('id').isUUID().withMessage('Invalid payment ID')],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;

    const paymentQuery = `
      SELECT 
        p.*,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.credits as user_current_credits,
        u.created_at as user_joined_at
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `;

    // Get related credit transactions
    const creditTransactionsQuery = `
      SELECT *
      FROM credit_transactions
      WHERE payment_id = $1
      ORDER BY created_at DESC
    `;

    const [paymentResult, creditTransactionsResult] = await Promise.all([
      database.query(paymentQuery, [id]),
      database.query(creditTransactionsQuery, [id]),
    ]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    const payment = paymentResult.rows[0];
    const creditTransactions = creditTransactionsResult.rows;

    const paymentData = {
      id: payment.id,
      transactionId: payment.transaction_id,
      amount: parseFloat(payment.amount || 0),
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.payment_method,
      gatewayTransactionId: payment.gateway_transaction_id,
      gatewayResponse: payment.gateway_response,
      creditsPurchased: parseInt(payment.credits_purchased || 0),
      createdAt: payment.created_at,
      processedAt: payment.processed_at,
      refundedAt: payment.refunded_at,
      refundAmount: payment.refund_amount ? parseFloat(payment.refund_amount) : null,
      refundReason: payment.refund_reason,
      metadata: payment.metadata,
      user: {
        id: payment.user_id,
        name: payment.user_name,
        email: payment.user_email,
        currentCredits: parseInt(payment.user_current_credits || 0),
        joinedAt: payment.user_joined_at,
      },
    };

    const transactionData = creditTransactions.map(tx => ({
      id: tx.id,
      type: tx.transaction_type,
      amount: parseInt(tx.amount || 0),
      balanceBefore: parseInt(tx.balance_before || 0),
      balanceAfter: parseInt(tx.balance_after || 0),
      description: tx.description,
      createdAt: tx.created_at,
      metadata: tx.metadata,
    }));

    res.json({
      success: true,
      data: {
        payment: paymentData,
        creditTransactions: transactionData,
      },
    });
  })
);

// Process refund for a payment
router.post(
  '/:id/refund',
  requirePermission(['payments.write', 'payments.refund']),
  [
    param('id').isUUID().withMessage('Invalid payment ID'),
    body('amount').isFloat({ min: 0 }).withMessage('Invalid refund amount'),
    body('reason')
      .notEmpty()
      .isLength({ min: 1, max: 500 })
      .withMessage('Refund reason is required'),
    body('deductCredits').optional().isBoolean().withMessage('Invalid deductCredits value'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const database = req.app.locals.database;
    const { id } = req.params;
    const { amount, reason, deductCredits = true } = req.body;
    const adminId = req.admin.id;

    // Get payment details
    const paymentQuery = `
      SELECT p.*, u.credits as user_credits
      FROM payments p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `;

    const paymentResult = await database.query(paymentQuery, [id]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    const payment = paymentResult.rows[0];

    // Validate refund eligibility
    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `Cannot refund payment with status: ${payment.status}`,
      });
    }

    const totalRefunded = parseFloat(payment.refund_amount || 0);
    const maxRefundAmount = parseFloat(payment.amount) - totalRefunded;

    if (amount > maxRefundAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount cannot exceed ${maxRefundAmount.toFixed(2)} ${payment.currency}`,
      });
    }

    try {
      await database.query('BEGIN');

      // Update payment with refund information
      const refundAmount = totalRefunded + amount;
      const newStatus = refundAmount >= parseFloat(payment.amount) ? 'refunded' : 'completed';

      const updatePaymentQuery = `
        UPDATE payments 
        SET refund_amount = $2,
            refund_reason = CASE 
              WHEN refund_reason IS NULL THEN $3
              ELSE refund_reason || E'\n' || $3
            END,
            refunded_at = CASE 
              WHEN refunded_at IS NULL THEN NOW()
              ELSE refunded_at
            END,
            status = $4,
            metadata = COALESCE(metadata, '{}') || $5
        WHERE id = $1
        RETURNING *
      `;

      const refundMetadata = JSON.stringify({
        refundedBy: adminId,
        refundedAt: new Date().toISOString(),
        partialRefund: newStatus !== 'refunded',
      });

      await database.query(updatePaymentQuery, [
        id,
        refundAmount,
        reason,
        newStatus,
        refundMetadata,
      ]);

      // Deduct credits from user if requested
      if (deductCredits && payment.credits_purchased > 0) {
        const creditsToDeduct = Math.floor(
          (amount / parseFloat(payment.amount)) * payment.credits_purchased
        );

        if (creditsToDeduct > 0) {
          const userCredits = parseInt(payment.user_credits || 0);
          const finalCredits = Math.max(0, userCredits - creditsToDeduct);

          // Update user credits
          await database.query('UPDATE users SET credits = $1 WHERE id = $2', [
            finalCredits,
            payment.user_id,
          ]);

          // Record credit transaction
          await database.query(
            `INSERT INTO credit_transactions (
              user_id, transaction_type, amount, balance_before, balance_after, 
              description, payment_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              payment.user_id,
              'refund_deduction',
              -creditsToDeduct,
              userCredits,
              finalCredits,
              `Credit deduction for refund: ${reason}`,
              id,
            ]
          );
        }
      }

      // Log admin activity
      await database.logAdminActivity({
        adminId,
        action: 'PAYMENT_REFUNDED',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        details: {
          paymentId: id,
          transactionId: payment.transaction_id,
          userId: payment.user_id,
          refundAmount: amount,
          currency: payment.currency,
          reason,
          deductCredits,
        },
      });

      await database.query('COMMIT');

      res.json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          paymentId: id,
          refundAmount: amount,
          currency: payment.currency,
          totalRefunded: refundAmount,
          status: newStatus,
          processedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  })
);

// Get payment statistics
router.get(
  '/stats/summary',
  requirePermission(['payments.read', 'analytics.read']),
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
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_payments,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
        SUM(refund_amount) as total_refunded,
        AVG(CASE WHEN status = 'completed' THEN amount END) as avg_payment_amount,
        SUM(CASE WHEN status = 'completed' THEN credits_purchased ELSE 0 END) as total_credits_sold,
        COUNT(DISTINCT user_id) as unique_paying_users,
        COUNT(CASE WHEN payment_method = 'credit_card' THEN 1 END) as credit_card_payments,
        COUNT(CASE WHEN payment_method = 'paypal' THEN 1 END) as paypal_payments,
        COUNT(CASE WHEN payment_method = 'bank_transfer' THEN 1 END) as bank_transfer_payments
      FROM payments
      WHERE created_at >= ${intervalQuery}
    `;

    const result = await database.query(statsQuery);
    const stats = result.rows[0];

    const successRate =
      stats.total_payments > 0
        ? parseFloat(((stats.completed_payments / stats.total_payments) * 100).toFixed(2))
        : 0;

    const refundRate =
      stats.completed_payments > 0
        ? parseFloat(((stats.refunded_payments / stats.completed_payments) * 100).toFixed(2))
        : 0;

    const netRevenue = parseFloat(stats.total_revenue || 0) - parseFloat(stats.total_refunded || 0);

    res.json({
      success: true,
      data: {
        period,
        overview: {
          totalPayments: parseInt(stats.total_payments || 0),
          completedPayments: parseInt(stats.completed_payments || 0),
          failedPayments: parseInt(stats.failed_payments || 0),
          refundedPayments: parseInt(stats.refunded_payments || 0),
          pendingPayments: parseInt(stats.pending_payments || 0),
          uniquePayingUsers: parseInt(stats.unique_paying_users || 0),
          successRate,
          refundRate,
        },
        revenue: {
          totalRevenue: parseFloat(stats.total_revenue || 0),
          totalRefunded: parseFloat(stats.total_refunded || 0),
          netRevenue,
          avgPaymentAmount: parseFloat(stats.avg_payment_amount || 0),
          totalCreditsSold: parseInt(stats.total_credits_sold || 0),
        },
        paymentMethods: {
          creditCard: parseInt(stats.credit_card_payments || 0),
          paypal: parseInt(stats.paypal_payments || 0),
          bankTransfer: parseInt(stats.bank_transfer_payments || 0),
        },
      },
    });
  })
);

// Get credit transactions with pagination and filtering
router.get(
  '/credits/transactions',
  requirePermission(['payments.read', 'credits.read']),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Invalid page number'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
    query('type')
      .optional()
      .isIn(['all', 'purchase', 'usage', 'refund', 'refund_deduction', 'bonus', 'adjustment']),
    query('search').optional().isLength({ min: 1 }).withMessage('Search term too short'),
    query('sortBy').optional().isIn(['created_at', 'amount', 'balance_after']),
    query('sortOrder').optional().isIn(['asc', 'desc']),
    query('dateFrom').optional().isISO8601().withMessage('Invalid date format'),
    query('dateTo').optional().isISO8601().withMessage('Invalid date format'),
  ],
  asyncHandler(async (req, res) => {
    const database = req.app.locals.database;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { type, search, sortBy = 'created_at', sortOrder = 'desc', dateFrom, dateTo } = req.query;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (type && type !== 'all') {
      conditions.push(`ct.transaction_type = $${paramIndex}`);
      params.push(type);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(
        ct.description ILIKE $${paramIndex} OR 
        u.name ILIKE $${paramIndex} OR
        u.email ILIKE $${paramIndex}
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (dateFrom) {
      conditions.push(`ct.created_at >= $${paramIndex}`);
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      conditions.push(`ct.created_at <= $${paramIndex}`);
      params.push(dateTo);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const transactionsQuery = `
      SELECT 
        ct.*,
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.credits as user_current_credits,
        p.transaction_id as payment_transaction_id,
        s.session_name
      FROM credit_transactions ct
      JOIN users u ON ct.user_id = u.id
      LEFT JOIN payments p ON ct.payment_id = p.id
      LEFT JOIN sessions s ON ct.session_id = s.id
      ${whereClause}
      ORDER BY ct.${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM credit_transactions ct
      JOIN users u ON ct.user_id = u.id
      ${whereClause}
    `;

    params.push(limit, offset);

    const [transactionsResult, countResult] = await Promise.all([
      database.query(transactionsQuery, params),
      database.query(countQuery, params.slice(0, -2)),
    ]);

    const transactions = transactionsResult.rows.map(row => ({
      id: row.id,
      type: row.transaction_type,
      amount: parseInt(row.amount || 0),
      balanceBefore: parseInt(row.balance_before || 0),
      balanceAfter: parseInt(row.balance_after || 0),
      description: row.description,
      createdAt: row.created_at,
      metadata: row.metadata,
      user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
        currentCredits: parseInt(row.user_current_credits || 0),
      },
      paymentTransactionId: row.payment_transaction_id,
      sessionName: row.session_name,
    }));

    const totalRecords = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalRecords / limit);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
        filters: { type, search, sortBy, sortOrder, dateFrom, dateTo },
      },
    });
  })
);

export default router;
