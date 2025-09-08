import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, param, validationResult } from 'express-validator';
import { getDatabase } from '../config/database.js';
import { cache } from '../config/redis.js';
import { authenticateToken, userRateLimit } from '../middleware/auth.js';
import { logError, logPaymentEvent } from '../config/logger.js';
import { paymentService } from '../services/PaymentService.js';
import { cashfreeService } from '../services/CashfreeService.js';

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

const router = express.Router();

// Helper function to get active credit packages from database
async function getActiveCreditPackages() {
  const pool = getPool();
  const query = `
    SELECT 
      package_id, package_name, description, credits_amount, price_usd,
      discount_percentage, bonus_credits, is_popular, features
    FROM credit_packages 
    WHERE is_active = true 
    ORDER BY is_popular DESC, price_usd ASC
  `;

  const result = await pool.query(query);

  const packages = {};
  result.rows.forEach(pkg => {
    const finalPrice = pkg.price_usd * (1 - (pkg.discount_percentage || 0) / 100);
    const totalCredits = parseInt(pkg.credits_amount) + parseInt(pkg.bonus_credits || 0);

    packages[pkg.package_id] = {
      credits: totalCredits,
      price: Math.round(finalPrice * 100), // Convert to cents
      basePrice: Math.round(pkg.price_usd * 100),
      name: pkg.package_name,
      description: pkg.description,
      popular: pkg.is_popular,
      discount: pkg.discount_percentage || 0,
      bonusCredits: pkg.bonus_credits || 0,
      features: pkg.features || [],
    };
  });

  return packages;
}

// Helper function to get active subscription plans from database
async function getActiveSubscriptionPlans() {
  const pool = getPool();
  const query = `
    SELECT 
      plan_id, plan_name, description, price_usd, credits_included,
      features, is_active, is_featured, display_order
    FROM subscription_plans 
    WHERE is_active = true 
    ORDER BY is_featured DESC, display_order ASC, price_usd ASC
  `;

  const result = await pool.query(query);
  return result.rows;
}

// Helper function to identify payment gateway from payment record
function identifyPaymentGateway(paymentRecord) {
  if (paymentRecord.cashfree_order_id) {
    return { gateway: 'cashfree', id: paymentRecord.cashfree_order_id, type: 'order' };
  }
  if (paymentRecord.cashfree_link_id) {
    return { gateway: 'cashfree', id: paymentRecord.cashfree_link_id, type: 'link' };
  }
  return { gateway: 'unknown', id: null, type: 'unknown' };
}

// Helper function to get payment record by Cashfree order ID or link ID
async function getPaymentRecordByGatewayId(gatewayId, userId) {
  const pool = getPool();
  
  // Use the database function to find payment by gateway ID (works for both orders and links)
  const paymentQuery = `
    SELECT * FROM find_payment_by_gateway_id($1, $2)
  `;
  
  const result = await pool.query(paymentQuery, [gatewayId, userId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const paymentRecord = result.rows[0];
  
  return {
    ...paymentRecord,
    gateway: paymentRecord.gateway,
    gatewayId: gatewayId,
    gatewayType: paymentRecord.gateway_type,
  };
}

// Helper function to confirm payment with Cashfree gateway
async function confirmPaymentWithGateway(paymentRecord, req) {
  const gatewayInfo = identifyPaymentGateway(paymentRecord);
  
  if (gatewayInfo.gateway === 'cashfree') {
    await paymentService.initializeProviders();
    const activeProviders = paymentService.getActiveProviders();
    const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
    
    if (!cashfreeProvider) {
      throw new Error('Cashfree gateway not available');
    }
    
    const orderStatus = await paymentService.confirmPayment(
      gatewayInfo.id, 
      null, 
      cashfreeProvider.configId
    );
    return orderStatus.data;
  }
  
  throw new Error(`Unsupported payment gateway: ${gatewayInfo.gateway}`);
}

// Validation rules
const createPaymentIntentValidation = [
  body('packageId').notEmpty().withMessage('Package ID is required'),
  body('useOneClickCheckout').optional().isBoolean().withMessage('useOneClickCheckout must be boolean'),
];

const confirmPaymentValidation = [
  body('paymentIntentId').isString().withMessage('Payment intent ID is required'),
];

// Get available credit packages
router.get('/packages', async (req, res) => {
  try {
    const CREDIT_PACKAGES = await getActiveCreditPackages();
    const packages = Object.entries(CREDIT_PACKAGES).map(([id, pkg]) => ({
      id,
      ...pkg,
      priceFormatted: `$${(pkg.price / 100).toFixed(2)}`,
      basePriceFormatted: `$${(pkg.basePrice / 100).toFixed(2)}`,
      creditsPerDollar: (pkg.credits / (pkg.price / 100)).toFixed(2),
      savings: pkg.discount > 0 ? `$${((pkg.basePrice - pkg.price) / 100).toFixed(2)}` : null,
      savingsPercentage: pkg.discount > 0 ? `${pkg.discount}%` : null,
    }));

    res.json({
      success: true,
      packages: packages.sort((a, b) => a.price - b.price),
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/packages' });
    res.status(500).json({
      error: 'Failed to get credit packages',
      code: 'PACKAGES_ERROR',
    });
  }
});

// Get available subscription plans (public endpoint for landing page)
router.get('/plans', async (req, res) => {
  try {
    const plans = await getActiveSubscriptionPlans();
    const formattedPlans = plans.map(plan => ({
      planId: plan.plan_id,
      planName: plan.plan_name,
      description: plan.description,
      priceUsd: parseFloat(plan.price_usd),
      creditsIncluded: plan.credits_included,
      features: plan.features || [],
      isActive: plan.is_active,
      isFeatured: plan.is_featured,
      displayOrder: plan.display_order || 999,
    }));

    res.json({
      success: true,
      data: formattedPlans.sort((a, b) => a.displayOrder - b.displayOrder),
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/plans' });
    res.status(500).json({
      error: 'Failed to get subscription plans',
      code: 'PLANS_ERROR',
    });
  }
});

// Get available payment gateways
router.get('/gateways', async (req, res) => {
  try {
    // Initialize payment service to get active providers
    await paymentService.initializeProviders();
    const activeProviders = paymentService.getActiveProviders();
    
    const gateways = activeProviders.map(provider => ({
      id: provider.type,
      name: provider.displayName || provider.providerName,
      active: true, // Only active providers are returned
      priority: provider.priority,
      supportedCurrencies: ['USD', 'INR'], // Will be properly configured per provider
      supportedCountries: ['US', 'IN'],
      type: provider.type,
      configId: provider.configId,
    }));

    res.json({
      success: true,
      gateways,
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/gateways' });
    res.status(500).json({
      error: 'Failed to get payment gateways',
      code: 'GATEWAYS_ERROR',
    });
  }
});

// Create payment intent
router.post(
  '/create-payment-intent',
  authenticateToken,
  userRateLimit(5, 60000), // 5 payment attempts per minute
  createPaymentIntentValidation,
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

      const { packageId, useOneClickCheckout = false } = req.body;
      const CREDIT_PACKAGES = await getActiveCreditPackages();
      const creditPackage = CREDIT_PACKAGES[packageId];

      if (!creditPackage) {
        return res.status(400).json({
          error: 'Invalid package',
          code: 'INVALID_PACKAGE',
        });
      }

      let paymentIntent;
      const paymentProvider = 'cashfree';
      const pool = getPool();
      const paymentId = uuidv4();
      const checkoutType = useOneClickCheckout ? 'oneclick' : 'standard';
      // Create Cashfree order
      try {
        await paymentService.initializeProviders();
        const activeProviders = paymentService.getActiveProviders();
        const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
        
        if (!cashfreeProvider) {
          throw new Error('Cashfree gateway not available or not configured');
        }

        const metadata = {
          userId: req.user.id.toString(),
          packageId,
          credits: creditPackage.credits.toString(),
          customerName: req.user.name || 'Customer',
          customerEmail: req.user.email,
          customerPhone: req.user.phone || '9999999999', // Default phone for users without phone
          description: `${creditPackage.name} - ${creditPackage.credits} credits`,
          returnUrl: `${process.env.FRONTEND_URL || 'https://mock-mate.com'}/payment/success`,
          notifyUrl: `${process.env.BACKEND_URL || 'https://api.mock-mate.com'}/api/payments/cashfree/webhook`,
        };

        // Convert price from USD cents to INR (approximate conversion)
        const amountInINR = Math.round((creditPackage.price / 100) * 83); // 1 USD ≈ 83 INR

        const cashfreeOrder = await paymentService.createPaymentIntent(
          amountInINR,
          'INR',
          metadata,
          req.user.id,
          'IN',
          { useOneClickCheckout }
        );

        paymentIntent = cashfreeOrder.data;

        // Store payment record for Cashfree
        if (useOneClickCheckout && paymentIntent.isOneClickCheckout) {
          // Store one-click checkout payment
          await pool.query(
            `
            INSERT INTO payments (
              id, user_id, cashfree_link_id, cf_link_id, package_id, 
              credits, amount, status, payment_provider, checkout_type,
              payment_link_url, link_created_at, link_expiry_at, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'cashfree', 'oneclick', $8, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP)
          `,
            [
              paymentId,
              req.user.id,
              paymentIntent.linkId,
              paymentIntent.cfLinkId,
              packageId,
              creditPackage.credits,
              creditPackage.price, // Store original USD price
              paymentIntent.paymentLink,
              new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
            ]
          );
        } else {
          // Store standard order payment
          await pool.query(
            `
            INSERT INTO payments (
              id, user_id, cashfree_order_id, package_id, 
              credits, amount, status, payment_provider, checkout_type, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'cashfree', 'standard', CURRENT_TIMESTAMP)
          `,
            [
              paymentId,
              req.user.id,
              paymentIntent.orderId,
              packageId,
              creditPackage.credits,
              creditPackage.price, // Store original USD price
            ]
          );
        }

      } catch (error) {
        throw new Error(`Cashfree payment creation failed: ${error.message}`);
      }

      logPaymentEvent('PAYMENT_INTENT_CREATED', req.user.id, creditPackage.price, {
        paymentIntentId: paymentIntent.id || paymentIntent.cfOrderId,
        packageId,
        credits: creditPackage.credits,
        gateway: paymentProvider,
      });

      res.json({
        paymentIntent: {
          id: paymentIntent.id || paymentIntent.cfOrderId || paymentIntent.linkId,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status || paymentIntent.orderStatus || paymentIntent.linkStatus,
          paymentLink: paymentIntent.paymentLink, // For Cashfree
          orderToken: paymentIntent.orderToken, // For Cashfree
          isOneClickCheckout: paymentIntent.isOneClickCheckout || false,
          checkoutType: checkoutType,
        },
        package: {
          id: packageId,
          ...creditPackage,
        },
        gateway: paymentProvider,
      });
    } catch (error) {
      logError(error, { endpoint: 'payments/create-payment-intent', userId: req.user?.id });
      res.status(500).json({
        error: 'Failed to create payment intent',
        code: 'PAYMENT_INTENT_ERROR',
        message: error.message,
      });
    }
  }
);

// Confirm payment (for manual confirmation)
router.post('/confirm-payment', authenticateToken, confirmPaymentValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { paymentIntentId } = req.body;

    // Get payment record using multi-gateway helper
    const paymentRecord = await getPaymentRecordByGatewayId(paymentIntentId, req.user.id);

    if (!paymentRecord) {
      return res.status(404).json({
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND',
      });
    }

    // Confirm payment using appropriate gateway
    const confirmedPayment = await confirmPaymentWithGateway(paymentRecord, req);

    logPaymentEvent('PAYMENT_CONFIRMATION_ATTEMPTED', req.user.id, paymentRecord.amount, {
      paymentIntentId,
      gateway: paymentRecord.gateway,
      status: confirmedPayment.status || confirmedPayment.order_status,
    });

    res.json({
      paymentIntent: {
        id: confirmedPayment.id || confirmedPayment.order_id,
        status: confirmedPayment.status || confirmedPayment.order_status,
        clientSecret: confirmedPayment.client_secret,
        gateway: paymentRecord.gateway,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/confirm-payment', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to confirm payment',
      code: 'PAYMENT_CONFIRMATION_ERROR',
      message: error.message,
    });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE conditions
    const conditions = ['user_id = $1'];
    const values = [req.user.id];
    let paramIndex = 2;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    // Get payments
    const pool = getPool();
    const paymentsQuery = `
        SELECT id, package_id, credits, amount, status, created_at, updated_at
        FROM payments 
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
    values.push(parseInt(limit), offset);

    const paymentsResult = await pool.query(paymentsQuery, values);

    // Get total count
    const countQuery = `
        SELECT COUNT(*) as total
        FROM payments 
        WHERE ${conditions.join(' AND ')}
      `;
    const countResult = await pool.query(countQuery, values.slice(0, -2));

    const totalPayments = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalPayments / parseInt(limit));

    const CREDIT_PACKAGES = await getActiveCreditPackages();
    
    res.json({
      payments: paymentsResult.rows.map(payment => ({
        id: payment.id,
        packageId: payment.package_id,
        packageName: CREDIT_PACKAGES[payment.package_id]?.name || 'Unknown',
        credits: payment.credits,
        amount: payment.amount,
        amountFormatted: `$${(payment.amount / 100).toFixed(2)}`,
        status: payment.status,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPayments,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/history', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to get payment history',
      code: 'PAYMENT_HISTORY_ERROR',
    });
  }
});

// Get payment details
router.get('/:paymentId', authenticateToken, [param('paymentId').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { paymentId } = req.params;

    const pool = getPool();
    const paymentQuery = `
        SELECT * FROM payments 
        WHERE id = $1 AND user_id = $2
      `;
    const paymentResult = await pool.query(paymentQuery, [paymentId, req.user.id]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND',
      });
    }

    const payment = paymentResult.rows[0];
    const gatewayInfo = identifyPaymentGateway(payment);
    const CREDIT_PACKAGES = await getActiveCreditPackages();
    const packageInfo = CREDIT_PACKAGES[payment.package_id];

    // Get gateway-specific payment details
    let gatewayDetails = null;
    let gatewayStatus = null;

    try {
      if (gatewayInfo.gateway === 'cashfree') {
        await paymentService.initializeProviders();
        const activeProviders = paymentService.getActiveProviders();
        const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
        
        if (cashfreeProvider) {
          const orderStatus = await paymentService.confirmPayment(
            gatewayInfo.id, 
            null, 
            cashfreeProvider.configId
          );
          gatewayDetails = {
            orderStatus: orderStatus.data.order_status,
            paymentMethod: orderStatus.data.payment_method,
            orderAmount: orderStatus.data.order_amount,
            orderCurrency: orderStatus.data.order_currency,
          };
          gatewayStatus = orderStatus.data.order_status;
        }
      }
    } catch (gatewayError) {
      // Log error but don't fail the request
      logError(gatewayError, {
        paymentId,
        gateway: gatewayInfo.gateway,
        gatewayId: gatewayInfo.id,
      });
    }

    res.json({
      payment: {
        id: payment.id,
        packageId: payment.package_id,
        packageName: packageInfo?.name || 'Unknown',
        credits: payment.credits,
        amount: payment.amount,
        amountFormatted: `$${(payment.amount / 100).toFixed(2)}`,
        status: payment.status,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
        gateway: gatewayInfo.gateway,
        gatewayId: gatewayInfo.id,
        gatewayStatus,
        gatewayDetails,
        provider: payment.payment_provider,
      },
    });
  } catch (error) {
    logError(error, {
      endpoint: 'payments/get',
      userId: req.user?.id,
      paymentId: req.params.paymentId,
    });
    res.status(500).json({
      error: 'Failed to get payment details',
      code: 'PAYMENT_GET_ERROR',
    });
  }
});

// Process successful payment immediately (called from frontend after payment confirmation)
router.post('/process-payment-success', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    
    if (!paymentIntentId) {
      return res.status(400).json({
        error: 'Payment intent ID is required',
        code: 'MISSING_PAYMENT_INTENT_ID'
      });
    }
    
    console.log(`🔄 Processing payment success for intent: ${paymentIntentId}`);
    
    // Get payment record using multi-gateway helper
    const payment = await getPaymentRecordByGatewayId(paymentIntentId, req.user.id);
    
    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND'
      });
    }
    
    // Check if payment is already completed (prevent double-processing)
    if (payment.status === 'completed') {
      console.log(`✅ Payment ${paymentIntentId} already processed, skipping`);
      return res.json({
        success: true,
        message: 'Payment already processed',
        alreadyProcessed: true
      });
    }
    
    let verificationResult = null;
    
    // Verify payment status with Cashfree gateway
    if (payment.gateway === 'cashfree') {
      // Get order status from Cashfree
      await paymentService.initializeProviders();
      const activeProviders = paymentService.getActiveProviders();
      const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
      
      if (!cashfreeProvider) {
        throw new Error('Cashfree gateway not available');
      }
      
      const orderStatus = await paymentService.confirmPayment(
        paymentIntentId, 
        null, 
        cashfreeProvider.configId
      );
      
      if (orderStatus.data.order_status !== 'PAID') {
        console.warn(`⚠️ Cashfree order ${paymentIntentId} status is ${orderStatus.data.order_status}, not PAID`);
        return res.status(400).json({
          error: 'Payment not yet completed',
          code: 'PAYMENT_NOT_COMPLETED',
          status: orderStatus.data.order_status
        });
      }
      
      verificationResult = {
        id: paymentIntentId,
        amount: payment.amount,
        metadata: {
          userId: req.user.id.toString(),
          packageId: payment.package_id,
          credits: payment.credits.toString()
        }
      };
    } else {
      throw new Error(`Unsupported payment gateway: ${payment.gateway}`);
    }
    
    // Use the existing payment success handler
    await handlePaymentSuccess(verificationResult);
    
    console.log(`✅ Payment ${paymentIntentId} processed successfully via ${payment.gateway}`);
    
    // Return success response
    res.json({
      success: true,
      message: 'Payment processed and credits added successfully',
      creditsAdded: payment.credits,
      gateway: payment.gateway
    });
    
  } catch (error) {
    console.error('❌ Error processing payment success:', error);
    logError(error, { 
      endpoint: 'payments/process-payment-success', 
      userId: req.user?.id,
      paymentIntentId: req.body?.paymentIntentId
    });
    
    res.status(500).json({
      error: 'Failed to process payment success',
      code: 'PAYMENT_PROCESSING_ERROR',
      message: error.message
    });
  }
});


// Helper function to handle successful payments (gateway-agnostic)
async function handlePaymentSuccess(paymentIntent) {
  const { userId, packageId, credits } = paymentIntent.metadata;
  
  console.log('🔄 Processing successful payment:', {
    paymentIntentId: paymentIntent.id,
    userId,
    packageId,
    credits,
    amount: paymentIntent.amount
  });
  
  const pool = getPool();
  
  // Validate required metadata
  if (!userId || !credits) {
    const error = new Error(`Missing required metadata: userId=${userId}, credits=${credits}`);
    logError(error, { paymentIntentId: paymentIntent.id, metadata: paymentIntent.metadata });
    throw error;
  }

  await pool.query('BEGIN');

  try {
    // Update payment status - check cashfree ID
    console.log('📝 Updating payment status to completed...');
    const paymentUpdateResult = await pool.query(
      `
      UPDATE payments 
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE cashfree_order_id = $1
      RETURNING id, user_id, credits, payment_provider
    `,
      [paymentIntent.id]
    );
    
    if (paymentUpdateResult.rows.length === 0) {
      throw new Error(`Payment record not found for payment ID: ${paymentIntent.id}`);
    }
    
    const paymentRecord = paymentUpdateResult.rows[0];
    console.log('✅ Payment status updated:', paymentRecord);

    // Add credits to user account
    console.log(`💰 Adding ${credits} credits to user ${userId}...`);
    const userUpdateResult = await pool.query(
      `
      UPDATE users 
      SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, credits
    `,
      [parseInt(credits), userId]
    );
    
    if (userUpdateResult.rows.length === 0) {
      throw new Error(`User not found: ${userId}`);
    }
    
    console.log('✅ Credits added to user:', userUpdateResult.rows[0]);

    // Record credit transaction
    console.log('📊 Recording credit transaction...');
    const description = `Credit purchase via Cashfree - Package ${packageId}`;
      
    const transactionResult = await pool.query(
      `
      INSERT INTO credit_transactions (
        user_id, credits_amount, transaction_type, description, created_at
      ) VALUES ($1, $2, 'purchase', $3, CURRENT_TIMESTAMP)
      RETURNING id, user_id, credits_amount
    `,
      [
        userId,
        parseInt(credits),
        description,
      ]
    );
    
    console.log('✅ Credit transaction recorded:', transactionResult.rows[0]);

    await pool.query('COMMIT');
    console.log('✅ Transaction committed successfully');

    const eventName = 'CASHFREE_PAYMENT_COMPLETED';
      
    logPaymentEvent(eventName, userId, paymentIntent.amount, {
      paymentIntentId: paymentIntent.id,
      packageId,
      credits: parseInt(credits),
      finalUserCredits: userUpdateResult.rows[0].credits,
      gateway: paymentRecord.payment_provider,
    });

    // Clear user cache to force fresh credit fetch
    await cache.del(`user:${userId}`);
    console.log('✅ User cache cleared');
    
    console.log('🎉 Payment processing completed successfully!');
  } catch (error) {
    console.error('❌ Error in handlePaymentSuccess:', error);
    await pool.query('ROLLBACK');
    console.log('↩️ Transaction rolled back');
    logError(error, { 
      paymentIntentId: paymentIntent.id, 
      userId, 
      packageId, 
      credits,
      context: 'handlePaymentSuccess' 
    });
    throw error;
  }
}


// Get Cashfree order status
router.get('/cashfree/status/:orderId', authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Verify the order belongs to the user
    const pool = getPool();
    const paymentQuery = `
      SELECT * FROM payments 
      WHERE cashfree_order_id = $1 AND user_id = $2
    `;
    const paymentResult = await pool.query(paymentQuery, [orderId, req.user.id]);
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Order not found',
        code: 'ORDER_NOT_FOUND',
      });
    }
    
    // Get order status from Cashfree
    await paymentService.initializeProviders();
    const activeProviders = paymentService.getActiveProviders();
    const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
    
    if (!cashfreeProvider) {
      return res.status(500).json({
        error: 'Cashfree service not available',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    
    const orderStatus = await paymentService.confirmPayment(orderId, null, cashfreeProvider.configId);
    
    res.json({
      success: true,
      data: orderStatus.data,
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/cashfree/status', orderId: req.params.orderId });
    res.status(500).json({
      error: 'Failed to get order status',
      code: 'ORDER_STATUS_ERROR',
      message: error.message,
    });
  }
});

// Cashfree webhook handler
router.post('/cashfree/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    
    if (!signature || !timestamp) {
      return res.status(400).send('Missing webhook signature or timestamp');
    }

    // Verify webhook signature
    const isValid = cashfreeService.verifyWebhookSignature(req.body, signature, timestamp);
    if (!isValid) {
      return res.status(400).send('Invalid webhook signature');
    }

    const webhookData = JSON.parse(req.body.toString());
    const { type, data } = webhookData;

    console.log('Cashfree webhook received:', { type, orderId: data?.order?.order_id });

    switch (type) {
      case 'PAYMENT_SUCCESS_WEBHOOK':
        await handleCashfreePaymentSuccess(data);
        break;
      case 'PAYMENT_FAILED_WEBHOOK':
        await handleCashfreePaymentFailed(data);
        break;
      case 'PAYMENT_USER_DROPPED_WEBHOOK':
        await handleCashfreePaymentCanceled(data);
        break;
      default:
        console.log(`Unhandled Cashfree webhook type: ${type}`);
    }

    res.json({ success: true });
  } catch (error) {
    logError(error, { endpoint: 'payments/cashfree/webhook' });
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Helper function to handle successful Cashfree payments
async function handleCashfreePaymentSuccess(data) {
  const { order, payment } = data;
  const pool = getPool();

  try {
    // Get payment record from database
    const paymentQuery = `
      SELECT * FROM payments 
      WHERE cashfree_order_id = $1
    `;
    const paymentResult = await pool.query(paymentQuery, [order.order_id]);
    
    if (paymentResult.rows.length === 0) {
      throw new Error(`Payment record not found for Cashfree order: ${order.order_id}`);
    }

    const paymentRecord = paymentResult.rows[0];
    
    if (paymentRecord.status === 'completed') {
      console.log(`Cashfree payment ${order.order_id} already processed`);
      return;
    }

    await pool.query('BEGIN');

    // Update payment status
    await pool.query(
      `
      UPDATE payments 
      SET status = 'completed', 
          cashfree_payment_id = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE cashfree_order_id = $1
    `,
      [order.order_id, payment.cf_payment_id]
    );

    // Add credits to user account
    await pool.query(
      `
      UPDATE users 
      SET credits = credits + $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `,
      [parseInt(paymentRecord.credits), paymentRecord.user_id]
    );

    // Record credit transaction
    await pool.query(
      `
      INSERT INTO credit_transactions (
        user_id, credits_amount, transaction_type, description, created_at
      ) VALUES ($1, $2, 'purchase', $3, CURRENT_TIMESTAMP)
    `,
      [
        paymentRecord.user_id,
        parseInt(paymentRecord.credits),
        `Credit purchase via Cashfree - Order ${order.order_id}`,
      ]
    );

    await pool.query('COMMIT');

    // Clear user cache
    await cache.del(`user:${paymentRecord.user_id}`);

    logPaymentEvent('CASHFREE_PAYMENT_COMPLETED', paymentRecord.user_id, paymentRecord.amount, {
      orderId: order.order_id,
      paymentId: payment.cf_payment_id,
      credits: paymentRecord.credits,
    });

    console.log(`Cashfree payment processed successfully: ${order.order_id}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    logError(error, { 
      context: 'handleCashfreePaymentSuccess', 
      orderId: order?.order_id 
    });
    throw error;
  }
}

// Helper function to handle failed Cashfree payments
async function handleCashfreePaymentFailed(data) {
  const { order } = data;
  const pool = getPool();
  
  try {
    await pool.query(
      `
      UPDATE payments 
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE cashfree_order_id = $1
    `,
      [order.order_id]
    );

    logPaymentEvent('CASHFREE_PAYMENT_FAILED', null, null, {
      orderId: order.order_id,
      reason: 'Payment failed',
    });
  } catch (error) {
    logError(error, { context: 'handleCashfreePaymentFailed', orderId: order?.order_id });
  }
}

// Helper function to handle canceled Cashfree payments
async function handleCashfreePaymentCanceled(data) {
  const { order } = data;
  const pool = getPool();
  
  try {
    await pool.query(
      `
      UPDATE payments 
      SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
      WHERE cashfree_order_id = $1
    `,
      [order.order_id]
    );

    logPaymentEvent('CASHFREE_PAYMENT_CANCELED', null, null, {
      orderId: order.order_id,
    });
  } catch (error) {
    logError(error, { context: 'handleCashfreePaymentCanceled', orderId: order?.order_id });
  }
}

// Create one-click checkout link (dedicated endpoint)
router.post(
  '/create-oneclick-checkout',
  authenticateToken,
  userRateLimit(5, 60000), // 5 payment attempts per minute
  createPaymentIntentValidation,
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

      const { packageId } = req.body;
      const CREDIT_PACKAGES = await getActiveCreditPackages();
      const creditPackage = CREDIT_PACKAGES[packageId];

      if (!creditPackage) {
        return res.status(400).json({
          error: 'Invalid package',
          code: 'INVALID_PACKAGE',
        });
      }

      let paymentIntent;
      const paymentProvider = 'cashfree';
      const pool = getPool();
      const paymentId = uuidv4();

      // Force one-click checkout
      try {
        await paymentService.initializeProviders();
        const activeProviders = paymentService.getActiveProviders();
        const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
        
        if (!cashfreeProvider) {
          throw new Error('Cashfree gateway not available or not configured');
        }

        const metadata = {
          userId: req.user.id.toString(),
          packageId,
          credits: creditPackage.credits.toString(),
          customerName: req.user.name || 'Customer',
          customerEmail: req.user.email,
          customerPhone: req.user.phone || '9999999999', // Default phone for users without phone
          description: `${creditPackage.name} - ${creditPackage.credits} credits`,
          returnUrl: `${process.env.FRONTEND_URL || 'https://mock-mate.com'}/payment/success`,
          notifyUrl: `${process.env.BACKEND_URL || 'https://api.mock-mate.com'}/api/payments/cashfree/webhook`,
        };

        // Convert price from USD cents to INR (approximate conversion)
        const amountInINR = Math.round((creditPackage.price / 100) * 83); // 1 USD ≈ 83 INR

        const cashfreeOrder = await paymentService.createPaymentIntent(
          amountInINR,
          'INR',
          metadata,
          req.user.id,
          'IN',
          { useOneClickCheckout: true }
        );

        paymentIntent = cashfreeOrder.data;

        // Store one-click checkout payment
        await pool.query(
          `
          INSERT INTO payments (
            id, user_id, cashfree_link_id, cf_link_id, package_id, 
            credits, amount, status, payment_provider, checkout_type,
            payment_link_url, link_created_at, link_expiry_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'cashfree', 'oneclick', $8, CURRENT_TIMESTAMP, $9, CURRENT_TIMESTAMP)
        `,
          [
            paymentId,
            req.user.id,
            paymentIntent.linkId,
            paymentIntent.cfLinkId,
            packageId,
            creditPackage.credits,
            creditPackage.price, // Store original USD price
            paymentIntent.paymentLink,
            new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
          ]
        );

      } catch (error) {
        throw new Error(`Cashfree one-click checkout creation failed: ${error.message}`);
      }

      logPaymentEvent('ONECLICK_CHECKOUT_CREATED', req.user.id, creditPackage.price, {
        linkId: paymentIntent.linkId,
        packageId,
        credits: creditPackage.credits,
        gateway: paymentProvider,
      });

      res.json({
        success: true,
        paymentLink: paymentIntent.paymentLink,
        linkId: paymentIntent.linkId,
        package: {
          id: packageId,
          ...creditPackage,
        },
        gateway: paymentProvider,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      logError(error, { endpoint: 'payments/create-oneclick-checkout', userId: req.user?.id });
      res.status(500).json({
        error: 'Failed to create one-click checkout',
        code: 'ONECLICK_CHECKOUT_ERROR',
        message: error.message,
      });
    }
  }
);

// Get payment link status
router.get('/cashfree/link-status/:linkId', authenticateToken, async (req, res) => {
  try {
    const { linkId } = req.params;
    
    // Verify the link belongs to the user
    const pool = getPool();
    const paymentQuery = `
      SELECT * FROM payments 
      WHERE cashfree_link_id = $1 AND user_id = $2
    `;
    const paymentResult = await pool.query(paymentQuery, [linkId, req.user.id]);
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Payment link not found',
        code: 'LINK_NOT_FOUND',
      });
    }
    
    // Get link status from Cashfree
    await paymentService.initializeProviders();
    const activeProviders = paymentService.getActiveProviders();
    const cashfreeProvider = activeProviders.find(p => p.type === 'cashfree');
    
    if (!cashfreeProvider) {
      return res.status(500).json({
        error: 'Cashfree service not available',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
    
    const providerClient = paymentService.getProviderClient(cashfreeProvider.configId);
    const linkStatus = await providerClient.getPaymentLinkStatus(linkId);
    
    res.json({
      success: true,
      data: linkStatus.data,
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/cashfree/link-status', linkId: req.params.linkId });
    res.status(500).json({
      error: 'Failed to get payment link status',
      code: 'LINK_STATUS_ERROR',
      message: error.message,
    });
  }
});

export default router;
