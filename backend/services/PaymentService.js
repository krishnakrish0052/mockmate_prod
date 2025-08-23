import Stripe from 'stripe';
import axios from 'axios';
import { PaymentConfiguration } from '../models/PaymentConfiguration.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

class PaymentService {
  constructor() {
    this.providers = new Map();
    this.configs = new Map();
    this.lastConfigRefresh = null;
    this.configRefreshInterval = 5 * 60 * 1000; // 5 minutes
  }

  // Initialize payment providers based on database configurations
  async initializeProviders(forceRefresh = false) {
    const now = Date.now();

    // Skip refresh if not forced and recently refreshed
    if (
      !forceRefresh &&
      this.lastConfigRefresh &&
      now - this.lastConfigRefresh < this.configRefreshInterval
    ) {
      return;
    }

    try {
      // Get active configurations from database
      const activeConfigs = await PaymentConfiguration.getActiveConfigurations();

      // Clear existing providers
      this.providers.clear();
      this.configs.clear();

      // Initialize each provider
      for (const config of activeConfigs) {
        try {
          await this.initializeProvider(config);
          logger.info(`Initialized payment provider: ${config.provider_name}`, {
            configId: config.id,
            testMode: config.is_test_mode,
          });
        } catch (error) {
          logger.error(`Failed to initialize provider ${config.provider_name}:`, error);
        }
      }

      this.lastConfigRefresh = now;
      logger.info(`Payment providers initialized: ${this.providers.size} active`);
    } catch (error) {
      logger.error('Failed to initialize payment providers:', error);
      throw error;
    }
  }

  // Initialize a specific provider
  async initializeProvider(config) {
    const fullConfig = config.getFullData();
    const providerConfig = fullConfig.configuration;

    switch (config.provider_name.toLowerCase()) {
      case 'stripe':
        await this.initializeStripe(config, providerConfig);
        break;
      case 'paypal':
        await this.initializePayPal(config, providerConfig);
        break;
      case 'razorpay':
        await this.initializeRazorpay(config, providerConfig);
        break;
      case 'square':
        await this.initializeSquare(config, providerConfig);
        break;
      default:
        logger.warn(`Unknown payment provider: ${config.provider_name}`);
    }

    // Store configuration for quick access
    this.configs.set(config.id, config);
  }

  // Initialize Stripe provider
  async initializeStripe(config, providerConfig) {
    const { secret_key, publishable_key, webhook_endpoint } = providerConfig;

    if (!secret_key || !publishable_key) {
      throw new Error('Stripe configuration missing required keys');
    }

    const stripe = new Stripe(secret_key);

    this.providers.set(config.id, {
      type: 'stripe',
      client: stripe,
      config: config,
      publishableKey: publishable_key,
      webhookEndpoint: webhook_endpoint,
    });
  }

  // Initialize PayPal provider
  async initializePayPal(config, providerConfig) {
    const { client_id, client_secret, sandbox } = providerConfig;

    if (!client_id || !client_secret) {
      throw new Error('PayPal configuration missing required credentials');
    }

    const baseURL = sandbox ? 'https://api.sandbox.paypal.com' : 'https://api.paypal.com';

    // Get access token
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
          username: client_id,
          password: client_secret,
        },
      }
    );

    this.providers.set(config.id, {
      type: 'paypal',
      baseURL,
      accessToken: tokenResponse.data.access_token,
      config: config,
      clientId: client_id,
      clientSecret: client_secret,
    });
  }

  // Initialize Razorpay provider
  async initializeRazorpay(config, providerConfig) {
    const { key_id, key_secret } = providerConfig;

    if (!key_id || !key_secret) {
      throw new Error('Razorpay configuration missing required keys');
    }

    this.providers.set(config.id, {
      type: 'razorpay',
      keyId: key_id,
      keySecret: key_secret,
      config: config,
    });
  }

  // Initialize Square provider
  async initializeSquare(config, providerConfig) {
    const { access_token, application_id, environment } = providerConfig;

    if (!access_token || !application_id) {
      throw new Error('Square configuration missing required credentials');
    }

    this.providers.set(config.id, {
      type: 'square',
      accessToken: access_token,
      applicationId: application_id,
      environment: environment || 'sandbox',
      config: config,
    });
  }

  // Get optimal payment provider for a transaction
  async getOptimalProvider(amount, currency = 'USD', country = 'US', userId = null) {
    await this.initializeProviders();

    const db = getDatabase();
    const result = await db.query('SELECT * FROM get_optimal_payment_provider($1, $2, $3, $4)', [
      amount,
      currency,
      country,
      userId,
    ]);

    if (result.rows.length === 0) {
      throw new Error('No suitable payment provider found');
    }

    const optimalConfig = result.rows[0];
    const provider = this.providers.get(optimalConfig.config_id);

    if (!provider) {
      throw new Error('Optimal provider not initialized');
    }

    return provider;
  }

  // Create payment intent
  async createPaymentIntent(amount, currency, metadata = {}, userId = null, country = 'US') {
    const provider = await this.getOptimalProvider(amount, currency, country, userId);

    let paymentIntent;
    const startTime = Date.now();

    try {
      switch (provider.type) {
        case 'stripe':
          paymentIntent = await this.createStripePaymentIntent(
            provider,
            amount,
            currency,
            metadata
          );
          break;
        case 'paypal':
          paymentIntent = await this.createPayPalOrder(provider, amount, currency, metadata);
          break;
        case 'razorpay':
          paymentIntent = await this.createRazorpayOrder(provider, amount, currency, metadata);
          break;
        case 'square':
          paymentIntent = await this.createSquarePayment(provider, amount, currency, metadata);
          break;
        default:
          throw new Error(`Payment intent creation not implemented for ${provider.type}`);
      }

      // Record analytics
      const processingTime = Date.now() - startTime;
      await this.recordAnalytics(provider, 'transaction_count', 1, processingTime);

      logger.info('Payment intent created', {
        provider: provider.type,
        configId: provider.config.id,
        amount,
        currency,
        processingTime,
      });

      return paymentIntent;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      await this.recordAnalytics(provider, 'failure_rate', 1, processingTime);

      logger.error('Failed to create payment intent', {
        provider: provider.type,
        configId: provider.config.id,
        error: error.message,
        processingTime,
      });

      throw error;
    }
  }

  // Create Stripe payment intent
  async createStripePaymentIntent(provider, amount, currency, metadata) {
    const stripe = provider.client;

    return await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  // Create PayPal order
  async createPayPalOrder(provider, amount, currency, metadata) {
    const response = await axios.post(
      `${provider.baseURL}/v2/checkout/orders`,
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2),
            },
          },
        ],
        metadata,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.accessToken}`,
        },
      }
    );

    return response.data;
  }

  // Create Razorpay order
  async createRazorpayOrder(provider, amount, currency, metadata) {
    const response = await axios.post(
      'https://api.razorpay.com/v1/orders',
      {
        amount: Math.round(amount * 100), // Convert to paise
        currency,
        notes: metadata,
      },
      {
        auth: {
          username: provider.keyId,
          password: provider.keySecret,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  // Create Square payment
  async createSquarePayment(provider, amount, currency, metadata) {
    const response = await axios.post(
      `https://connect.squareup.com/v2/payments`,
      {
        source_id: 'CARD_NONCE', // This would be provided by the frontend
        amount_money: {
          amount: Math.round(amount * 100), // Convert to cents
          currency,
        },
        reference_id: metadata.reference_id,
        note: metadata.description,
      },
      {
        headers: {
          'Square-Version': '2023-10-18',
          Authorization: `Bearer ${provider.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  // Confirm payment
  async confirmPayment(paymentId, paymentMethodId = null, configId = null) {
    await this.initializeProviders();

    let provider;
    if (configId) {
      provider = this.providers.get(configId);
    } else {
      // Find provider by payment ID (implementation depends on your tracking)
      provider = Array.from(this.providers.values())[0]; // Fallback
    }

    if (!provider) {
      throw new Error('Payment provider not found');
    }

    const startTime = Date.now();

    try {
      let result;

      switch (provider.type) {
        case 'stripe':
          result = await provider.client.paymentIntents.confirm(paymentId, {
            payment_method: paymentMethodId,
          });
          break;
        case 'paypal':
          result = await this.capturePayPalOrder(provider, paymentId);
          break;
        case 'razorpay':
          // Razorpay payments are captured automatically after successful payment
          result = await this.getRazorpayPayment(provider, paymentId);
          break;
        default:
          throw new Error(`Payment confirmation not implemented for ${provider.type}`);
      }

      const processingTime = Date.now() - startTime;
      await this.recordAnalytics(provider, 'success_rate', 1, processingTime);

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      await this.recordAnalytics(provider, 'failure_rate', 1, processingTime);
      throw error;
    }
  }

  // Capture PayPal order
  async capturePayPalOrder(provider, orderId) {
    const response = await axios.post(
      `${provider.baseURL}/v2/checkout/orders/${orderId}/capture`,
      {},
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.accessToken}`,
        },
      }
    );

    return response.data;
  }

  // Get Razorpay payment details
  async getRazorpayPayment(provider, paymentId) {
    const response = await axios.get(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      auth: {
        username: provider.keyId,
        password: provider.keySecret,
      },
    });

    return response.data;
  }

  // Refund payment
  async refundPayment(paymentId, amount = null, configId = null) {
    await this.initializeProviders();

    const provider = configId
      ? this.providers.get(configId)
      : Array.from(this.providers.values())[0]; // Fallback

    if (!provider) {
      throw new Error('Payment provider not found');
    }

    switch (provider.type) {
      case 'stripe':
        return await provider.client.refunds.create({
          payment_intent: paymentId,
          amount: amount ? Math.round(amount * 100) : undefined,
        });
      case 'paypal':
        // PayPal refund implementation
        throw new Error('PayPal refunds not implemented yet');
      default:
        throw new Error(`Refund not implemented for ${provider.type}`);
    }
  }

  // Validate provider configuration
  static async validateProviderConfiguration(providerName, configuration) {
    const requiredFields = {
      stripe: ['secret_key', 'publishable_key'],
      paypal: ['client_id', 'client_secret'],
      razorpay: ['key_id', 'key_secret'],
      square: ['access_token', 'application_id'],
    };

    const required = requiredFields[providerName.toLowerCase()] || [];
    const errors = [];

    for (const field of required) {
      if (!configuration[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Additional validation
    if (providerName.toLowerCase() === 'stripe') {
      if (configuration.secret_key && !configuration.secret_key.startsWith('sk_')) {
        errors.push('Invalid Stripe secret key format');
      }
      if (configuration.publishable_key && !configuration.publishable_key.startsWith('pk_')) {
        errors.push('Invalid Stripe publishable key format');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Record analytics
  async recordAnalytics(provider, metricType, value, processingTime = null) {
    try {
      const db = getDatabase();

      // Record the metric
      await db.query('SELECT record_payment_analytics($1, $2, $3, $4, $5)', [
        provider.config.provider_name,
        metricType,
        metricType,
        value,
        provider.config.id,
      ]);

      // Record processing time if provided
      if (processingTime !== null) {
        await db.query('SELECT record_payment_analytics($1, $2, $3, $4, $5)', [
          provider.config.provider_name,
          'processing_time',
          'processing_time_ms',
          processingTime,
          provider.config.id,
        ]);
      }
    } catch (error) {
      logger.error('Failed to record payment analytics:', error);
      // Don't throw error as analytics shouldn't break payment flow
    }
  }

  // Get provider client by config ID
  getProviderClient(configId) {
    const provider = this.providers.get(configId);
    return provider ? provider.client : null;
  }

  // Get all active providers
  getActiveProviders() {
    return Array.from(this.providers.values()).map(provider => ({
      configId: provider.config.id,
      type: provider.type,
      providerName: provider.config.provider_name,
      displayName: provider.config.display_name,
      isTestMode: provider.config.is_test_mode,
      priority: provider.config.priority,
    }));
  }

  // Test provider connectivity
  async testProviderConnectivity(configId) {
    const provider = this.providers.get(configId);
    if (!provider) {
      throw new Error('Provider not found');
    }

    const startTime = Date.now();

    try {
      switch (provider.type) {
        case 'stripe':
          await provider.client.accounts.retrieve();
          break;
        case 'paypal':
          // Test PayPal connectivity by getting a new access token
          await this.refreshPayPalToken(provider);
          break;
        case 'razorpay':
          // Test Razorpay by fetching account details
          await axios.get('https://api.razorpay.com/v1/payments', {
            auth: {
              username: provider.keyId,
              password: provider.keySecret,
            },
            params: { count: 1 },
          });
          break;
        default:
          throw new Error(`Connectivity test not implemented for ${provider.type}`);
      }

      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        message: 'Provider connectivity test passed',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  // Refresh PayPal access token
  async refreshPayPalToken(provider) {
    const tokenResponse = await axios.post(
      `${provider.baseURL}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en_US',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: {
          username: provider.clientId,
          password: provider.clientSecret,
        },
      }
    );

    provider.accessToken = tokenResponse.data.access_token;
    return tokenResponse.data;
  }
}

// Create singleton instance
const paymentService = new PaymentService();

export { PaymentService, paymentService };
