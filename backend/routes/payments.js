import express from 'express';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { body, param, validationResult } from 'express-validator';
import { getDatabase } from '../config/database.js';
import { cache } from '../config/redis.js';
import { authenticateToken, userRateLimit } from '../middleware/auth.js';
import { logError, logPaymentEvent } from '../config/logger.js';

// Stripe will be initialized lazily after we resolve credentials from dynamic config or env
let stripe = null;

// Get database pool instance
let pool = null;
const getPool = () => {
  if (!pool) {
    pool = getDatabase();
  }
  return pool;
};

const router = express.Router();

// Resolve Stripe credentials from dynamic config (preferred) with env fallback
async function getStripeClient(req) {
  if (stripe) return stripe;

  try {
    const dynamicConfig = req.app?.locals?.dynamicConfig;

    // Try dynamic config first
    const secretFromConfig = dynamicConfig ? await dynamicConfig.get('stripe_secret_key', null) : null;
    const secret = secretFromConfig || process.env.STRIPE_SECRET_KEY;

    if (!secret || /your_stripe_secret_key/i.test(secret)) {
      throw new Error('Stripe secret key is not configured. Please set via Admin > Configuration > Payment or .env');
    }

    stripe = new Stripe(secret);
    return stripe;
  } catch (err) {
    // Log and rethrow for handler to present a proper 500 with guidance
    logError(err, { component: 'payments', where: 'getStripeClient' });
    throw err;
  }
}

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

// Validation rules
const createPaymentIntentValidation = [
  body('packageId').notEmpty().withMessage('Package ID is required'),
  body('paymentMethodId').optional().isString().withMessage('Payment method ID must be a string'),
];

const confirmPaymentValidation = [
  body('paymentIntentId').isString().withMessage('Payment intent ID is required'),
];

const webhookValidation = [
  body().custom((value, { req }) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      throw new Error('Missing stripe signature');
    }
    return true;
  }),
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

      const { packageId, paymentMethodId } = req.body;
      const CREDIT_PACKAGES = await getActiveCreditPackages();
      const creditPackage = CREDIT_PACKAGES[packageId];

      if (!creditPackage) {
        return res.status(400).json({
          error: 'Invalid package',
          code: 'INVALID_PACKAGE',
        });
      }

      // Initialize Stripe with dynamic credentials
      const stripeClient = await getStripeClient(req);

      // Create payment intent with Stripe
      const paymentIntentData = {
        amount: creditPackage.price,
        currency: 'usd',
        metadata: {
          userId: req.user.id.toString(),
          packageId,
          credits: creditPackage.credits.toString(),
        },
        description: `${creditPackage.name} - ${creditPackage.credits} credits`,
        receipt_email: req.user.email,
      };

      // Add payment method if provided
      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.confirmation_method = 'manual';
        paymentIntentData.confirm = true;
        paymentIntentData.return_url = `${process.env.FRONTEND_URL}/payment/success`;
      }

      const paymentIntent = await stripeClient.paymentIntents.create(paymentIntentData);

      // Store payment record in database
      const pool = getPool();
      const paymentId = uuidv4();
      await pool.query(
        `
        INSERT INTO payments (
          id, user_id, stripe_payment_intent_id, package_id, 
          credits, amount, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP)
      `,
        [
          paymentId,
          req.user.id,
          paymentIntent.id,
          packageId,
          creditPackage.credits,
          creditPackage.price,
        ]
      );

      logPaymentEvent('PAYMENT_INTENT_CREATED', req.user.id, creditPackage.price, {
        paymentIntentId: paymentIntent.id,
        packageId,
        credits: creditPackage.credits,
      });

      res.json({
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          status: paymentIntent.status,
        },
        package: {
          id: packageId,
          ...creditPackage,
        },
      });
    } catch (error) {
      logError(error, { endpoint: 'payments/create-payment-intent', userId: req.user?.id });

      if (error.type === 'StripeCardError') {
        res.status(400).json({
          error: error.message,
          code: 'CARD_ERROR',
        });
      } else {
        res.status(500).json({
          error: 'Failed to create payment intent',
          code: 'PAYMENT_INTENT_ERROR',
        });
      }
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

    // Verify payment intent belongs to user
    const pool = getPool();
    const paymentQuery =
      'SELECT * FROM payments WHERE stripe_payment_intent_id = $1 AND user_id = $2';
    const paymentResult = await pool.query(paymentQuery, [paymentIntentId, req.user.id]);

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND',
      });
    }

    // Initialize Stripe with dynamic credentials
    const stripeClient = await getStripeClient(req);
    
    // Confirm payment intent with Stripe
    const paymentIntent = await stripeClient.paymentIntents.confirm(paymentIntentId);

    logPaymentEvent('PAYMENT_CONFIRMATION_ATTEMPTED', req.user.id, paymentResult.rows[0].amount, {
      paymentIntentId,
      status: paymentIntent.status,
    });

    res.json({
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'payments/confirm-payment', userId: req.user?.id });

    if (error.type === 'StripeCardError') {
      res.status(400).json({
        error: error.message,
        code: 'CARD_ERROR',
      });
    } else {
      res.status(500).json({
        error: 'Failed to confirm payment',
        code: 'PAYMENT_CONFIRMATION_ERROR',
      });
    }
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
    const CREDIT_PACKAGES = await getActiveCreditPackages();
    const packageInfo = CREDIT_PACKAGES[payment.package_id];

    // Get Stripe payment intent details if needed
    let stripeDetails = null;
    if (payment.stripe_payment_intent_id) {
      try {
        const stripeClient = await getStripeClient(req);
        stripeDetails = await stripeClient.paymentIntents.retrieve(payment.stripe_payment_intent_id);
      } catch (stripeError) {
        logError(stripeError, {
          paymentId,
          stripePaymentIntentId: payment.stripe_payment_intent_id,
        });
      }
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
        stripeStatus: stripeDetails?.status || null,
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

// Process successful payment immediately (called from frontend after Stripe confirmation)
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
    
    // Get payment record from database
    const pool = getPool();
    const paymentQuery = `
      SELECT * FROM payments 
      WHERE stripe_payment_intent_id = $1 AND user_id = $2
    `;
    const paymentResult = await pool.query(paymentQuery, [paymentIntentId, req.user.id]);
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Payment not found',
        code: 'PAYMENT_NOT_FOUND'
      });
    }
    
    const payment = paymentResult.rows[0];
    
    // Check if payment is already completed (prevent double-processing)
    if (payment.status === 'completed') {
      console.log(`✅ Payment ${paymentIntentId} already processed, skipping`);
      return res.json({
        success: true,
        message: 'Payment already processed',
        alreadyProcessed: true
      });
    }
    
    // Verify with Stripe that the payment actually succeeded
    const stripeClient = await getStripeClient(req);
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      console.warn(`⚠️ Payment intent ${paymentIntentId} status is ${paymentIntent.status}, not succeeded`);
      return res.status(400).json({
        error: 'Payment not yet succeeded',
        code: 'PAYMENT_NOT_SUCCEEDED',
        status: paymentIntent.status
      });
    }
    
    // Create a mock payment intent object for the existing handler
    const mockPaymentIntent = {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: {
        userId: req.user.id.toString(),
        packageId: payment.package_id,
        credits: payment.credits.toString()
      }
    };
    
    // Use the existing payment success handler
    await handlePaymentSuccess(mockPaymentIntent);
    
    console.log(`✅ Payment ${paymentIntentId} processed successfully`);
    
    // Return success response
    res.json({
      success: true,
      message: 'Payment processed and credits added successfully',
      creditsAdded: payment.credits
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

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  const sig = req.headers['stripe-signature'];

  try {
    // Get webhook secret from dynamic config or env
    const dynamicConfig = req.app?.locals?.dynamicConfig;
    const webhookSecret = dynamicConfig ? await dynamicConfig.get('stripe_webhook_secret', null) : null;
    const secret = webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!secret || /your_webhook_secret/i.test(secret)) {
      throw new Error('Stripe webhook secret is not configured');
    }
    
    const stripeClient = await getStripeClient(req);
    event = stripeClient.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    logError(err, { endpoint: 'payments/webhook' });
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logError(error, { endpoint: 'payments/webhook', eventType: event.type });
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Helper function to handle successful payments
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
    // Update payment status
    console.log('📝 Updating payment status to completed...');
    const paymentUpdateResult = await pool.query(
      `
      UPDATE payments 
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE stripe_payment_intent_id = $1
      RETURNING id, user_id, credits
    `,
      [paymentIntent.id]
    );
    
    if (paymentUpdateResult.rows.length === 0) {
      throw new Error(`Payment record not found for payment intent: ${paymentIntent.id}`);
    }
    
    console.log('✅ Payment status updated:', paymentUpdateResult.rows[0]);

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
    const transactionResult = await pool.query(
      `
      INSERT INTO credit_transactions (
        user_id, credits_amount, transaction_type, description, created_at
      ) VALUES ($1, $2, 'credit', $3, CURRENT_TIMESTAMP)
      RETURNING id, user_id, credits_amount
    `,
      [
        userId,
        parseInt(credits),
        `Credit purchase: Package ${packageId}`,
      ]
    );
    
    console.log('✅ Credit transaction recorded:', transactionResult.rows[0]);

    await pool.query('COMMIT');
    console.log('✅ Transaction committed successfully');

    logPaymentEvent('PAYMENT_COMPLETED', userId, paymentIntent.amount, {
      paymentIntentId: paymentIntent.id,
      packageId,
      credits: parseInt(credits),
      finalUserCredits: userUpdateResult.rows[0].credits,
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

// Helper function to handle failed payments
async function handlePaymentFailed(paymentIntent) {
  const pool = getPool();
  try {
    await pool.query(
      `
      UPDATE payments 
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE stripe_payment_intent_id = $1
    `,
      [paymentIntent.id]
    );

    logPaymentEvent('PAYMENT_FAILED', paymentIntent.metadata.userId, paymentIntent.amount, {
      paymentIntentId: paymentIntent.id,
      reason: paymentIntent.last_payment_error?.message || 'Unknown error',
    });
  } catch (error) {
    logError(error, { context: 'handlePaymentFailed', paymentIntentId: paymentIntent.id });
  }
}

// Helper function to handle canceled payments
async function handlePaymentCanceled(paymentIntent) {
  const pool = getPool();
  try {
    await pool.query(
      `
      UPDATE payments 
      SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
      WHERE stripe_payment_intent_id = $1
    `,
      [paymentIntent.id]
    );

    logPaymentEvent('PAYMENT_CANCELED', paymentIntent.metadata.userId, paymentIntent.amount, {
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    logError(error, { context: 'handlePaymentCanceled', paymentIntentId: paymentIntent.id });
  }
}

export default router;
