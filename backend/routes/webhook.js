import express from 'express';
import { cashfreeService } from '../services/CashfreeService.js';

const router = express.Router();

/**
 * NOTE: This is a legacy webhook endpoint.
 * The main Cashfree webhook handler is now located at:
 * /api/payments/cashfree/webhook in /routes/payments.js
 * 
 * This endpoint is kept for backward compatibility and debugging.
 */
router.post('/cashfree', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    
    if (!signature || !timestamp) {
      console.error('⚠️ Missing webhook signature or timestamp');
      return res.status(400).send('Missing webhook signature or timestamp');
    }

    // Verify webhook signature
    const isValid = cashfreeService.verifyWebhookSignature(req.body, signature, timestamp);
    if (!isValid) {
      console.error('⚠️ Cashfree webhook signature verification failed');
      return res.status(400).send('Invalid webhook signature');
    }

    console.log('✅ Cashfree webhook signature verified');
    
    const webhookData = JSON.parse(req.body.toString());
    const { type, data } = webhookData;
    
    console.log(`📩 Received Cashfree event: ${type}`);
    console.log('⚠️ WARNING: This is a legacy webhook endpoint!');
    console.log('⚠️ The main webhook handler is at /api/payments/cashfree/webhook');
    console.log('⚠️ Please update your Cashfree webhook URL to use the main handler');
    
    // Log the event but don't process it
    console.log('📝 Event data:', { type, orderId: data?.order?.order_id });
    
    res.json({ 
      success: true,
      message: 'Webhook received at legacy endpoint',
      note: 'Please use /api/payments/cashfree/webhook for actual processing'
    });
  } catch (error) {
    console.error('❌ Error handling legacy Cashfree webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Default route for any webhook calls to this endpoint
router.post('/', (req, res) => {
  console.log('⚠️ Legacy webhook endpoint accessed');
  console.log('⚠️ Stripe webhooks are no longer supported');
  console.log('⚠️ Please use Cashfree webhook at /api/payments/cashfree/webhook');
  
  res.status(410).json({
    error: 'Endpoint deprecated',
    message: 'Stripe webhooks are no longer supported. Please use Cashfree webhooks.',
    newEndpoint: '/api/payments/cashfree/webhook'
  });
});

export default router;
