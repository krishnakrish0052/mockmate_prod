import express from 'express';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Webhook signing secret - use the one from Stripe CLI for local development
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_6b086e6c4767b7e5fe4a6b3fcb16bcf2033928e3e47e36b8b83df549cd80ea38';

// This should be above any middleware that parses the body as JSON
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('✅ Webhook signature verified');
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📩 Received event: ${event.type}`);

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        console.log('💰 PaymentIntent succeeded:', paymentIntent.id);
        
        // TODO: Update user credits in database
        // You'll need to get the user ID from payment_intent.metadata
        // and add the purchased credits to their account
        
        await handlePaymentSuccess(paymentIntent);
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.log('❌ PaymentIntent failed:', paymentIntent.id);
        
        await handlePaymentFailure(paymentIntent);
        break;
      }
      
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('🛒 Checkout session completed:', session.id);
        
        // Handle checkout completion if using Checkout Sessions
        break;
      }
      
      default:
        console.log(`🤷 Unhandled event type: ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.json({ received: true });
    
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handlePaymentSuccess(paymentIntent) {
  try {
    console.log('⚠️ WARNING: This webhook handler is NOT being used!');
    console.log('⚠️ The actual webhook handler is in /routes/payments.js at /api/payments/webhook');
    console.log('🔄 Processing successful payment (FALLBACK HANDLER):', paymentIntent.id);
    
    // Extract metadata
    const { userId, packageId, credits } = paymentIntent.metadata || {};
    
    if (!userId || !credits) {
      console.error('❌ Missing required metadata in payment intent');
      return;
    }
    
    console.error('❌ CREDITS NOT BEING ADDED - This handler is incomplete!');
    console.error('❌ Make sure your Stripe webhook points to: /api/payments/webhook');
    console.log(`⚠️ Would have added ${credits} credits to user ${userId} if this was the correct handler`);
    
  } catch (error) {
    console.error('❌ Error processing payment success (FALLBACK):', error);
    throw error;
  }
}

async function handlePaymentFailure(paymentIntent) {
  try {
    console.log('⚠️ Processing failed payment:', paymentIntent.id);
    
    // You might want to:
    // 1. Log the failure
    // 2. Notify the user
    // 3. Clean up any temporary data
    
    const { userId } = paymentIntent.metadata || {};
    if (userId) {
      console.log(`❌ Payment failed for user ${userId}`);
    }
    
  } catch (error) {
    console.error('❌ Error processing payment failure:', error);
    throw error;
  }
}

export default router;
