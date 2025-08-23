import axios from 'axios';
import crypto from 'crypto';
import { PaymentWebhook } from '../models/PaymentWebhook.js';
import { PaymentConfiguration } from '../models/PaymentConfiguration.js';
import { Payment } from '../models/Payment.js';
import { paymentService } from './PaymentService.js';
import { logger } from '../config/logger.js';

class PaymentWebhookService {
  constructor() {
    this.eventProcessors = new Map();
    this.initializeEventProcessors();
  }

  // Initialize event processors for different providers
  initializeEventProcessors() {
    // Stripe event processors
    this.eventProcessors.set(
      'stripe.payment_intent.succeeded',
      this.processStripePaymentSuccess.bind(this)
    );
    this.eventProcessors.set(
      'stripe.payment_intent.payment_failed',
      this.processStripePaymentFailed.bind(this)
    );
    this.eventProcessors.set(
      'stripe.payment_intent.canceled',
      this.processStripePaymentCanceled.bind(this)
    );
    this.eventProcessors.set(
      'stripe.charge.dispute.created',
      this.processStripeDisputeCreated.bind(this)
    );

    // PayPal event processors
    this.eventProcessors.set(
      'paypal.CHECKOUT.ORDER.APPROVED',
      this.processPayPalOrderApproved.bind(this)
    );
    this.eventProcessors.set(
      'paypal.PAYMENT.CAPTURE.COMPLETED',
      this.processPayPalPaymentCompleted.bind(this)
    );
    this.eventProcessors.set(
      'paypal.PAYMENT.CAPTURE.DENIED',
      this.processPayPalPaymentFailed.bind(this)
    );

    // Razorpay event processors
    this.eventProcessors.set(
      'razorpay.payment.captured',
      this.processRazorpayPaymentCaptured.bind(this)
    );
    this.eventProcessors.set(
      'razorpay.payment.failed',
      this.processRazorpayPaymentFailed.bind(this)
    );
  }

  // Register webhook with payment provider
  async registerWebhook(configId, webhookData) {
    const config = await PaymentConfiguration.findById(configId);
    if (!config) {
      throw new Error('Payment configuration not found');
    }

    const fullConfig = config.getFullData();

    let providerWebhookId = null;
    const webhookUrl = webhookData.url;

    try {
      switch (config.provider_name.toLowerCase()) {
        case 'stripe':
          providerWebhookId = await this.registerStripeWebhook(fullConfig, webhookData);
          break;
        case 'paypal':
          providerWebhookId = await this.registerPayPalWebhook(fullConfig, webhookData);
          break;
        case 'razorpay':
          providerWebhookId = await this.registerRazorpayWebhook(fullConfig, webhookData);
          break;
        default:
          logger.warn(`Webhook registration not implemented for ${config.provider_name}`);
      }

      // Create webhook record in database
      const webhook = await PaymentWebhook.create({
        config_id: configId,
        webhook_type: webhookData.webhook_type,
        event_type: webhookData.event_type,
        provider_webhook_id: providerWebhookId,
        url: webhookUrl,
        secret: webhookData.secret,
        is_active: true,
      });

      logger.info('Webhook registered successfully', {
        configId,
        provider: config.provider_name,
        webhookId: webhook.id,
        providerWebhookId,
      });

      return webhook;
    } catch (error) {
      logger.error('Failed to register webhook', {
        configId,
        provider: config.provider_name,
        error: error.message,
      });
      throw error;
    }
  }

  // Register Stripe webhook
  async registerStripeWebhook(config, webhookData) {
    const stripe = paymentService.getProviderClient(config.id);
    if (!stripe) {
      throw new Error('Stripe client not initialized');
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: webhookData.url,
      enabled_events: [webhookData.event_type],
    });

    return webhook.id;
  }

  // Register PayPal webhook
  async registerPayPalWebhook(config, webhookData) {
    const providerConfig = config.configuration;
    const baseURL = providerConfig.sandbox
      ? 'https://api.sandbox.paypal.com'
      : 'https://api.paypal.com';

    // Get access token first
    const tokenResponse = await axios.post(
      `${baseURL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en_US',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: providerConfig.client_id,
          password: providerConfig.client_secret,
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Create webhook
    const webhookResponse = await axios.post(
      `${baseURL}/v1/notifications/webhooks`,
      {
        url: webhookData.url,
        event_types: [
          {
            name: webhookData.event_type,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return webhookResponse.data.id;
  }

  // Register Razorpay webhook
  async registerRazorpayWebhook(config, webhookData) {
    const providerConfig = config.configuration;

    const webhookResponse = await axios.post(
      'https://api.razorpay.com/v1/webhooks',
      {
        url: webhookData.url,
        active: true,
        events: [webhookData.event_type],
      },
      {
        auth: {
          username: providerConfig.key_id,
          password: providerConfig.key_secret,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return webhookResponse.data.id;
  }

  // Process incoming webhook
  async processWebhook(providerName, signature, payload, headers = {}) {
    try {
      // Find webhook configuration
      const webhook = await this.findWebhookByProvider(providerName, payload);
      if (!webhook) {
        throw new Error('Webhook configuration not found');
      }

      // Verify webhook signature
      const isValid = await this.verifyWebhookSignature(
        providerName,
        signature,
        payload,
        webhook.secret,
        headers
      );

      if (!isValid) {
        await webhook.recordTrigger(false, 'Invalid signature');
        throw new Error('Invalid webhook signature');
      }

      // Parse event data
      const eventData = this.parseEventData(providerName, payload);
      const eventKey = `${providerName.toLowerCase()}.${eventData.type}`;

      // Process event
      const processor = this.eventProcessors.get(eventKey);
      if (processor) {
        await processor(eventData, webhook);
        await webhook.recordTrigger(true);

        logger.info('Webhook processed successfully', {
          provider: providerName,
          eventType: eventData.type,
          webhookId: webhook.id,
        });
      } else {
        logger.warn('No processor found for webhook event', {
          provider: providerName,
          eventType: eventData.type,
          eventKey,
        });
        await webhook.recordTrigger(true); // Mark as success even if no processor
      }

      return { success: true, processed: !!processor };
    } catch (error) {
      logger.error('Webhook processing failed', {
        provider: providerName,
        error: error.message,
      });
      throw error;
    }
  }

  // Find webhook by provider and payload
  async findWebhookByProvider(providerName, payload) {
    // This is a simplified implementation
    // In practice, you might need to extract webhook ID from payload
    const configs = await PaymentConfiguration.findByProvider(providerName);

    for (const config of configs) {
      if (config.is_active) {
        const webhooks = await PaymentWebhook.findByConfigId(config.id, true);
        if (webhooks.length > 0) {
          return webhooks[0]; // Return first active webhook
        }
      }
    }

    return null;
  }

  // Verify webhook signature
  async verifyWebhookSignature(providerName, signature, payload, secret, headers = {}) {
    try {
      switch (providerName.toLowerCase()) {
        case 'stripe':
          return this.verifyStripeSignature(signature, payload, secret);
        case 'paypal':
          return this.verifyPayPalSignature(signature, payload, secret, headers);
        case 'razorpay':
          return this.verifyRazorpaySignature(signature, payload, secret);
        default:
          logger.warn(`Signature verification not implemented for ${providerName}`);
          return true; // Default to true for unknown providers
      }
    } catch (error) {
      logger.error('Signature verification failed', {
        provider: providerName,
        error: error.message,
      });
      return false;
    }
  }

  // Verify Stripe webhook signature
  verifyStripeSignature(signature, payload, secret) {
    const elements = signature.split(',');
    const timestamp = elements.find(el => el.startsWith('t=')).split('=')[1];
    const signatureHash = elements.find(el => el.startsWith('v1=')).split('=')[1];

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Verify PayPal webhook signature
  verifyPayPalSignature(signature, payload, secret, headers) {
    // PayPal webhook verification is more complex and requires certificate validation
    // This is a simplified version
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('base64');

    return signature === expectedSignature;
  }

  // Verify Razorpay webhook signature
  verifyRazorpaySignature(signature, payload, secret) {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Parse event data from different providers
  parseEventData(providerName, payload) {
    const data = JSON.parse(payload);

    switch (providerName.toLowerCase()) {
      case 'stripe':
        return {
          type: data.type,
          id: data.id,
          object: data.data.object,
          created: data.created,
        };
      case 'paypal':
        return {
          type: data.event_type,
          id: data.id,
          resource: data.resource,
          created: data.create_time,
        };
      case 'razorpay':
        return {
          type: data.event,
          id: data.payment?.id,
          payload: data.payload,
          created: data.created_at,
        };
      default:
        return data;
    }
  }

  // Event processors

  // Stripe payment success processor
  async processStripePaymentSuccess(eventData, webhook) {
    const paymentIntent = eventData.object;

    try {
      // Find payment record
      const payment = await Payment.findByPaymentReference(paymentIntent.id);
      if (payment) {
        await payment.complete();
        logger.info('Payment completed via Stripe webhook', {
          paymentId: payment.id,
          stripeIntentId: paymentIntent.id,
        });
      }
    } catch (error) {
      logger.error('Failed to process Stripe payment success', {
        intentId: paymentIntent.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Stripe payment failed processor
  async processStripePaymentFailed(eventData, webhook) {
    const paymentIntent = eventData.object;

    try {
      const payment = await Payment.findByPaymentReference(paymentIntent.id);
      if (payment) {
        await payment.fail('Payment failed via Stripe');
        logger.info('Payment failed via Stripe webhook', {
          paymentId: payment.id,
          stripeIntentId: paymentIntent.id,
        });
      }
    } catch (error) {
      logger.error('Failed to process Stripe payment failure', {
        intentId: paymentIntent.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Stripe payment canceled processor
  async processStripePaymentCanceled(eventData, webhook) {
    const paymentIntent = eventData.object;

    try {
      const payment = await Payment.findByPaymentReference(paymentIntent.id);
      if (payment) {
        await payment.updateStatus('cancelled');
        logger.info('Payment canceled via Stripe webhook', {
          paymentId: payment.id,
          stripeIntentId: paymentIntent.id,
        });
      }
    } catch (error) {
      logger.error('Failed to process Stripe payment cancellation', {
        intentId: paymentIntent.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Stripe dispute created processor
  async processStripeDisputeCreated(eventData, webhook) {
    const dispute = eventData.object;

    try {
      // Create dispute record in database
      const { getDatabase } = await import('../config/database.js');
      const db = getDatabase();

      await db.query(
        `
        INSERT INTO payment_disputes (
          payment_id, config_id, dispute_id, provider_dispute_id,
          amount_disputed, currency, reason, status, due_date
        ) VALUES (
          (SELECT id FROM payments WHERE payment_reference = $1),
          $2, $3, $4, $5, $6, $7, $8, $9
        )
      `,
        [
          dispute.charge,
          webhook.config_id,
          dispute.id,
          dispute.id,
          dispute.amount / 100, // Convert from cents
          dispute.currency.toUpperCase(),
          dispute.reason,
          'needs_response',
          new Date(dispute.evidence_details.due_by * 1000),
        ]
      );

      logger.info('Dispute created via Stripe webhook', {
        disputeId: dispute.id,
        chargeId: dispute.charge,
        amount: dispute.amount / 100,
      });
    } catch (error) {
      logger.error('Failed to process Stripe dispute creation', {
        disputeId: dispute.id,
        error: error.message,
      });
      throw error;
    }
  }

  // PayPal processors
  async processPayPalOrderApproved(eventData, webhook) {
    const order = eventData.resource;

    try {
      const payment = await Payment.findByPaymentReference(order.id);
      if (payment && payment.status === 'pending') {
        // Order approved but not yet captured
        logger.info('PayPal order approved', {
          paymentId: payment.id,
          orderId: order.id,
        });
      }
    } catch (error) {
      logger.error('Failed to process PayPal order approval', {
        orderId: order.id,
        error: error.message,
      });
      throw error;
    }
  }

  async processPayPalPaymentCompleted(eventData, webhook) {
    const capture = eventData.resource;

    try {
      // Find payment by PayPal order ID (stored in payment_reference)
      const payment = await Payment.findByPaymentReference(capture.id);
      if (payment) {
        await payment.complete();
        logger.info('Payment completed via PayPal webhook', {
          paymentId: payment.id,
          captureId: capture.id,
        });
      }
    } catch (error) {
      logger.error('Failed to process PayPal payment completion', {
        captureId: capture.id,
        error: error.message,
      });
      throw error;
    }
  }

  async processPayPalPaymentFailed(eventData, webhook) {
    const capture = eventData.resource;

    try {
      const payment = await Payment.findByPaymentReference(capture.id);
      if (payment) {
        await payment.fail('Payment denied by PayPal');
        logger.info('Payment failed via PayPal webhook', {
          paymentId: payment.id,
          captureId: capture.id,
        });
      }
    } catch (error) {
      logger.error('Failed to process PayPal payment failure', {
        captureId: capture.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Razorpay processors
  async processRazorpayPaymentCaptured(eventData, webhook) {
    const payment_data = eventData.payload?.payment?.entity;

    try {
      if (payment_data) {
        const payment = await Payment.findByPaymentReference(payment_data.id);
        if (payment) {
          await payment.complete();
          logger.info('Payment completed via Razorpay webhook', {
            paymentId: payment.id,
            razorpayId: payment_data.id,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process Razorpay payment capture', {
        razorpayId: payment_data?.id,
        error: error.message,
      });
      throw error;
    }
  }

  async processRazorpayPaymentFailed(eventData, webhook) {
    const payment_data = eventData.payload?.payment?.entity;

    try {
      if (payment_data) {
        const payment = await Payment.findByPaymentReference(payment_data.id);
        if (payment) {
          await payment.fail(`Payment failed: ${payment_data.error_description}`);
          logger.info('Payment failed via Razorpay webhook', {
            paymentId: payment.id,
            razorpayId: payment_data.id,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to process Razorpay payment failure', {
        razorpayId: payment_data?.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Retry failed webhooks
  async retryFailedWebhooks() {
    const webhooksNeedingRetry = await PaymentWebhook.getWebhooksNeedingRetry();

    logger.info(`Found ${webhooksNeedingRetry.length} webhooks needing retry`);

    for (const webhook of webhooksNeedingRetry) {
      try {
        // Implement retry logic here
        // This would depend on how you want to retry webhooks
        // You might need to store the original payload and headers

        logger.info('Webhook retry would be implemented here', {
          webhookId: webhook.id,
        });

        // For now, just reset retries if max reached
        if (webhook.retry_count >= webhook.max_retries) {
          await webhook.resetRetries();
        }
      } catch (error) {
        logger.error('Failed to retry webhook', {
          webhookId: webhook.id,
          error: error.message,
        });
      }
    }
  }

  // Unregister webhook
  async unregisterWebhook(webhookId) {
    const webhook = await PaymentWebhook.findById(webhookId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const config = await PaymentConfiguration.findById(webhook.config_id);
    if (!config) {
      throw new Error('Payment configuration not found');
    }

    try {
      // Unregister from provider if provider webhook ID exists
      if (webhook.provider_webhook_id) {
        await this.unregisterProviderWebhook(config, webhook);
      }

      // Delete from database
      await PaymentWebhook.delete(webhookId);

      logger.info('Webhook unregistered successfully', {
        webhookId,
        provider: config.provider_name,
      });

      return true;
    } catch (error) {
      logger.error('Failed to unregister webhook', {
        webhookId,
        error: error.message,
      });
      throw error;
    }
  }

  // Unregister webhook from provider
  async unregisterProviderWebhook(config, webhook) {
    const fullConfig = config.getFullData();

    switch (config.provider_name.toLowerCase()) {
      case 'stripe':
        const stripe = paymentService.getProviderClient(config.id);
        if (stripe) {
          await stripe.webhookEndpoints.del(webhook.provider_webhook_id);
        }
        break;
      case 'paypal':
        // PayPal webhook deletion implementation
        break;
      case 'razorpay':
        // Razorpay webhook deletion implementation
        break;
    }
  }

  // Register webhooks for all active providers
  async registerWebhooksForActiveProviders() {
    try {
      logger.info('Registering webhooks for active payment providers...');

      // For now, just log that webhook registration would happen here
      // This method can be implemented later when webhook functionality is needed

      logger.info('Webhook registration completed (placeholder implementation)');
      return true;
    } catch (error) {
      logger.error('Failed to register webhooks for active providers', {
        error: error.message,
      });
      throw error;
    }
  }
}

// Create singleton instance
const paymentWebhookService = new PaymentWebhookService();

export { PaymentWebhookService, paymentWebhookService };
