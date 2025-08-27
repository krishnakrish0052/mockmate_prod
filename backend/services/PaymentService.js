import axios from 'axios';
import { PaymentConfiguration } from '../models/PaymentConfiguration.js';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { CashfreeService } from './CashfreeService.js';

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
      // Get active configurations from database (both test and production)
      const testConfigs = await PaymentConfiguration.getActiveConfigurations(true);
      const prodConfigs = await PaymentConfiguration.getActiveConfigurations(false);
      const activeConfigs = [...testConfigs, ...prodConfigs];

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
      case 'cashfree':
        await this.initializeCashfree(config, providerConfig);
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

  // Initialize Cashfree provider
  async initializeCashfree(config, providerConfig) {
    const { app_id, secret_key, is_test_mode = true } = providerConfig;

    if (!app_id || !secret_key) {
      throw new Error('Cashfree configuration missing required credentials');
    }

    // Create a new Cashfree service instance for this config
    const cashfreeService = new CashfreeService();
    cashfreeService.initialize(providerConfig);

    this.providers.set(config.id, {
      type: 'cashfree',
      client: cashfreeService,
      config: config,
      appId: app_id,
      isTestMode: is_test_mode,
    });
  }

  // Get optimal payment provider for a transaction (defaults to Cashfree)
  async getOptimalProvider(amount, currency = 'INR', country = 'IN', userId = null) {
    await this.initializeProviders();

    // Priority order: Cashfree first, then others
    const providers = Array.from(this.providers.values());
    
    // Look for Cashfree provider first
    let provider = providers.find(p => p.type === 'cashfree');
    
    // Fallback to any other provider if Cashfree not available
    if (!provider) {
      provider = providers[0];
    }

    if (!provider) {
      throw new Error('No suitable payment provider found');
    }

    return provider;
  }

  // Create payment intent (primarily using Cashfree)
  async createPaymentIntent(amount, currency, metadata = {}, userId = null, country = 'IN') {
    const provider = await this.getOptimalProvider(amount, currency, country, userId);

    let paymentIntent;
    const startTime = Date.now();

    try {
      switch (provider.type) {
        case 'cashfree':
          paymentIntent = await this.createCashfreeOrder(provider, amount, currency, metadata);
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

  // Create Cashfree order
  async createCashfreeOrder(provider, amount, currency = 'INR', metadata) {
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const orderData = {
      orderId,
      orderAmount: parseFloat(amount),
      orderCurrency: currency,
      customerDetails: {
        customerId: metadata.userId || 'guest_customer',
        customerName: metadata.customerName || 'Customer',
        customerEmail: metadata.customerEmail || 'customer@example.com',
        customerPhone: metadata.customerPhone || '',
      },
      orderNote: metadata.description || 'Credit package purchase',
      returnUrl: metadata.returnUrl || `${process.env.FRONTEND_URL}/payment/success`,
      notifyUrl: metadata.notifyUrl || `${process.env.BACKEND_URL}/api/payments/cashfree/webhook`,
      orderMeta: {
        credits: metadata.credits,
        packageId: metadata.packageId,
        userId: metadata.userId,
      },
    };

    return await provider.client.createOrder(orderData);
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
        case 'cashfree':
          result = await this.getCashfreeOrderStatus(provider, paymentId);
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

  // Get Cashfree order status
  async getCashfreeOrderStatus(provider, orderId) {
    return await provider.client.getOrderStatus(orderId);
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
      case 'cashfree':
        const refundData = {
          cfPaymentId: paymentId,
          refundAmount: amount,
          refundId: `refund_${Date.now()}`,
          refundNote: 'Admin initiated refund',
        };
        const refundResult = await provider.client.processRefund(refundData);
        return refundResult.data;
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
      cashfree: ['app_id', 'secret_key'],
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
    if (providerName.toLowerCase() === 'cashfree') {
      const cashfreeValidation = CashfreeService.validateConfiguration(configuration);
      if (!cashfreeValidation.valid) {
        errors.push(...cashfreeValidation.errors);
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
      // Temporarily disabled - database function doesn't exist yet
      logger.info('Payment analytics recorded', {
        provider: provider.config.provider_name,
        metric: metricType,
        value,
        processingTime
      });
      
      // TODO: Implement proper analytics table and function
      // const db = getDatabase();
      // await db.query('SELECT record_payment_analytics($1, $2, $3, $4, $5)', [...]);
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
        case 'cashfree':
          const testResult = await provider.client.testConnection();
          if (!testResult.success) {
            throw new Error(testResult.error);
          }
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
