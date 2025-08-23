import axios from 'axios';
import { getDatabase } from '../config/database.js';
import { paymentService } from './PaymentService.js';
import { logger } from '../config/logger.js';

class PaymentHealthCheckService {
  constructor() {
    this.healthCheckInterval = 15 * 60 * 1000; // 15 minutes
    this.healthCheckTimer = null;
  }

  // Start automatic health checks
  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.runAllHealthChecks();
    }, this.healthCheckInterval);

    logger.info('Payment health checks started', {
      interval: this.healthCheckInterval,
    });
  }

  // Stop automatic health checks
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.info('Payment health checks stopped');
    }
  }

  // Run health check for a specific configuration
  async runHealthCheck(config, checkType = 'connectivity') {
    const startTime = Date.now();
    let result;

    try {
      switch (checkType) {
        case 'connectivity':
          result = await this.testConnectivity(config);
          break;
        case 'authentication':
          result = await this.testAuthentication(config);
          break;
        case 'api_limits':
          result = await this.testApiLimits(config);
          break;
        case 'webhook':
          result = await this.testWebhook(config);
          break;
        case 'full_transaction':
          result = await this.testFullTransaction(config);
          break;
        default:
          result = await this.testConnectivity(config);
      }

      // Record health check result
      await this.recordHealthCheckResult(config.id, checkType, result);

      // Update configuration health status
      await this.updateConfigHealthStatus(config.id, result.status);

      return result;
    } catch (error) {
      const result = {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString(),
      };

      await this.recordHealthCheckResult(config.id, checkType, result);
      await this.updateConfigHealthStatus(config.id, 'unhealthy');

      return result;
    }
  }

  // Test basic connectivity
  async testConnectivity(config) {
    const startTime = Date.now();
    const fullConfig = config.getFullData();
    const providerConfig = fullConfig.configuration;

    try {
      switch (config.provider_name.toLowerCase()) {
        case 'stripe':
          await this.testStripeConnectivity(providerConfig);
          break;
        case 'paypal':
          await this.testPayPalConnectivity(providerConfig);
          break;
        case 'razorpay':
          await this.testRazorpayConnectivity(providerConfig);
          break;
        case 'square':
          await this.testSquareConnectivity(providerConfig);
          break;
        default:
          throw new Error(`Connectivity test not implemented for ${config.provider_name}`);
      }

      return {
        status: 'pass',
        responseTime: Date.now() - startTime,
        message: 'Connectivity test passed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Test authentication
  async testAuthentication(config) {
    const startTime = Date.now();
    const fullConfig = config.getFullData();
    const providerConfig = fullConfig.configuration;

    try {
      switch (config.provider_name.toLowerCase()) {
        case 'stripe':
          await this.testStripeAuthentication(providerConfig);
          break;
        case 'paypal':
          await this.testPayPalAuthentication(providerConfig);
          break;
        case 'razorpay':
          await this.testRazorpayAuthentication(providerConfig);
          break;
        case 'square':
          await this.testSquareAuthentication(providerConfig);
          break;
        default:
          throw new Error(`Authentication test not implemented for ${config.provider_name}`);
      }

      return {
        status: 'pass',
        responseTime: Date.now() - startTime,
        message: 'Authentication test passed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Test API limits
  async testApiLimits(config) {
    const startTime = Date.now();

    try {
      // This is a basic implementation
      // You might want to make actual API calls to check rate limits
      const result = await this.testConnectivity(config);

      if (result.status === 'pass') {
        return {
          status: 'pass',
          responseTime: Date.now() - startTime,
          message: 'API limits test passed',
          limits: {
            remaining: 'unknown',
            reset: 'unknown',
          },
          timestamp: new Date().toISOString(),
        };
      } else {
        throw new Error('Failed to test API limits');
      }
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Test webhook configuration
  async testWebhook(config) {
    const startTime = Date.now();

    try {
      // For webhook testing, we'll check if webhook URL is accessible
      if (config.webhook_url) {
        try {
          const response = await axios.get(config.webhook_url, {
            timeout: 5000,
            validateStatus: () => true, // Accept any status code
          });

          return {
            status: response.status < 500 ? 'pass' : 'warn',
            responseTime: Date.now() - startTime,
            message: `Webhook URL responded with status ${response.status}`,
            webhookUrl: config.webhook_url,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          return {
            status: 'warn',
            responseTime: Date.now() - startTime,
            message: 'Webhook URL not accessible',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        return {
          status: 'warn',
          responseTime: Date.now() - startTime,
          message: 'No webhook URL configured',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Test full transaction flow (with minimal amount)
  async testFullTransaction(config) {
    const startTime = Date.now();

    try {
      // This is a test transaction with minimal amount
      // WARNING: This might create actual charges in test mode
      const testAmount = 0.5; // $0.50 or equivalent

      // Only run in test mode
      if (!config.is_test_mode) {
        return {
          status: 'warn',
          responseTime: Date.now() - startTime,
          message: 'Full transaction test skipped - not in test mode',
          timestamp: new Date().toISOString(),
        };
      }

      // Create test payment intent
      const paymentIntent = await paymentService.createPaymentIntent(
        testAmount,
        'USD',
        { test: true, healthCheck: true },
        null,
        'US'
      );

      // Cancel the payment intent immediately to avoid charges
      if (config.provider_name.toLowerCase() === 'stripe') {
        const provider = paymentService.providers.get(config.id);
        if (provider && provider.client) {
          await provider.client.paymentIntents.cancel(paymentIntent.id);
        }
      }

      return {
        status: 'pass',
        responseTime: Date.now() - startTime,
        message: 'Full transaction test passed',
        testAmount,
        paymentIntentId: paymentIntent.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'fail',
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Provider-specific connectivity tests

  async testStripeConnectivity(providerConfig) {
    const stripe = new (await import('stripe')).default(providerConfig.secret_key);
    await stripe.accounts.retrieve();
  }

  async testPayPalConnectivity(providerConfig) {
    const baseURL = providerConfig.sandbox
      ? 'https://api.sandbox.paypal.com'
      : 'https://api.paypal.com';

    await axios.post(`${baseURL}/v1/oauth2/token`, 'grant_type=client_credentials', {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en_US',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: providerConfig.client_id,
        password: providerConfig.client_secret,
      },
      timeout: 10000,
    });
  }

  async testRazorpayConnectivity(providerConfig) {
    await axios.get('https://api.razorpay.com/v1/payments', {
      auth: {
        username: providerConfig.key_id,
        password: providerConfig.key_secret,
      },
      params: { count: 1 },
      timeout: 10000,
    });
  }

  async testSquareConnectivity(providerConfig) {
    await axios.get('https://connect.squareup.com/v2/locations', {
      headers: {
        'Square-Version': '2023-10-18',
        Authorization: `Bearer ${providerConfig.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  // Provider-specific authentication tests

  async testStripeAuthentication(providerConfig) {
    const stripe = new (await import('stripe')).default(providerConfig.secret_key);
    const account = await stripe.accounts.retrieve();

    if (!account.id) {
      throw new Error('Failed to retrieve Stripe account information');
    }
  }

  async testPayPalAuthentication(providerConfig) {
    const baseURL = providerConfig.sandbox
      ? 'https://api.sandbox.paypal.com'
      : 'https://api.paypal.com';

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
        timeout: 10000,
      }
    );

    if (!tokenResponse.data.access_token) {
      throw new Error('Failed to get PayPal access token');
    }

    // Test the token by making an authenticated request
    await axios.get(`${baseURL}/v1/identity/oauth2/userinfo`, {
      headers: {
        Authorization: `Bearer ${tokenResponse.data.access_token}`,
      },
      params: { schema: 'paypalv1.1' },
      timeout: 10000,
    });
  }

  async testRazorpayAuthentication(providerConfig) {
    const response = await axios.get('https://api.razorpay.com/v1/payments', {
      auth: {
        username: providerConfig.key_id,
        password: providerConfig.key_secret,
      },
      params: { count: 1 },
      timeout: 10000,
    });

    if (!response.data) {
      throw new Error('Failed to authenticate with Razorpay');
    }
  }

  async testSquareAuthentication(providerConfig) {
    const response = await axios.get('https://connect.squareup.com/v2/locations', {
      headers: {
        'Square-Version': '2023-10-18',
        Authorization: `Bearer ${providerConfig.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    if (!response.data.locations) {
      throw new Error('Failed to authenticate with Square');
    }
  }

  // Record health check result in database
  async recordHealthCheckResult(configId, checkType, result) {
    try {
      const db = getDatabase();
      await db.query(
        `
        INSERT INTO payment_provider_health_checks (
          config_id, check_type, status, response_time_ms, error_message, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          configId,
          checkType,
          result.status,
          result.responseTime,
          result.error || null,
          JSON.stringify({
            message: result.message,
            timestamp: result.timestamp,
            ...result,
          }),
        ]
      );
    } catch (error) {
      logger.error('Failed to record health check result', {
        configId,
        checkType,
        error: error.message,
      });
    }
  }

  // Update configuration health status
  async updateConfigHealthStatus(configId, status) {
    try {
      const db = getDatabase();
      await db.query(
        `
        UPDATE payment_configurations 
        SET health_status = $1, last_health_check = NOW()
        WHERE id = $2
      `,
        [status, configId]
      );
    } catch (error) {
      logger.error('Failed to update config health status', {
        configId,
        status,
        error: error.message,
      });
    }
  }

  // Run health checks for all active configurations
  async runAllHealthChecks() {
    try {
      const { PaymentConfiguration } = await import('../models/PaymentConfiguration.js');
      const activeConfigs = await PaymentConfiguration.getActiveConfigurations();

      logger.info(`Running health checks for ${activeConfigs.length} configurations`);

      const results = [];

      for (const config of activeConfigs) {
        try {
          const result = await this.runHealthCheck(config, 'connectivity');
          results.push({
            configId: config.id,
            provider: config.provider_name,
            result,
          });

          // Add small delay between health checks to avoid overwhelming providers
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.error('Health check failed for config', {
            configId: config.id,
            provider: config.provider_name,
            error: error.message,
          });

          results.push({
            configId: config.id,
            provider: config.provider_name,
            result: {
              status: 'fail',
              error: error.message,
            },
          });
        }
      }

      const healthyCount = results.filter(r => r.result.status === 'pass').length;
      const unhealthyCount = results.filter(r => r.result.status === 'fail').length;
      const degradedCount = results.filter(r => r.result.status === 'warn').length;

      logger.info('Health checks completed', {
        total: results.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
        degraded: degradedCount,
      });

      return results;
    } catch (error) {
      logger.error('Failed to run all health checks', { error: error.message });
      throw error;
    }
  }

  // Get health check history for a configuration
  async getHealthCheckHistory(configId, limit = 50, offset = 0) {
    try {
      const db = getDatabase();
      const result = await db.query(
        `
        SELECT * FROM payment_provider_health_checks 
        WHERE config_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `,
        [configId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get health check history', {
        configId,
        error: error.message,
      });
      throw error;
    }
  }

  // Get health check statistics
  async getHealthCheckStats(configId = null, timeRange = '24h') {
    try {
      const db = getDatabase();
      let timeCondition = '';
      const params = [];
      let paramIndex = 1;

      // Add time range condition
      switch (timeRange) {
        case '1h':
          timeCondition = `AND created_at >= NOW() - INTERVAL '1 hour'`;
          break;
        case '24h':
          timeCondition = `AND created_at >= NOW() - INTERVAL '24 hours'`;
          break;
        case '7d':
          timeCondition = `AND created_at >= NOW() - INTERVAL '7 days'`;
          break;
        case '30d':
          timeCondition = `AND created_at >= NOW() - INTERVAL '30 days'`;
          break;
      }

      let query = `
        SELECT 
          COUNT(*) as total_checks,
          COUNT(CASE WHEN status = 'pass' THEN 1 END) as passed_checks,
          COUNT(CASE WHEN status = 'fail' THEN 1 END) as failed_checks,
          COUNT(CASE WHEN status = 'warn' THEN 1 END) as warning_checks,
          AVG(response_time_ms) as avg_response_time,
          MIN(response_time_ms) as min_response_time,
          MAX(response_time_ms) as max_response_time
        FROM payment_provider_health_checks 
        WHERE 1=1 ${timeCondition}
      `;

      if (configId) {
        query += ` AND config_id = $${paramIndex++}`;
        params.push(configId);
      }

      const result = await db.query(query, params);
      return (
        result.rows[0] || {
          total_checks: 0,
          passed_checks: 0,
          failed_checks: 0,
          warning_checks: 0,
          avg_response_time: 0,
          min_response_time: 0,
          max_response_time: 0,
        }
      );
    } catch (error) {
      logger.error('Failed to get health check statistics', {
        configId,
        timeRange,
        error: error.message,
      });
      throw error;
    }
  }
}

// Create singleton instance
const paymentHealthCheckService = new PaymentHealthCheckService();

export { PaymentHealthCheckService, paymentHealthCheckService };
