import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../config/logger.js';

class CashfreeService {
  constructor() {
    this.baseURL = null;
    this.appId = null;
    this.secretKey = null;
    this.initialized = false;
  }

  // Initialize Cashfree with credentials
  initialize(config) {
    const { app_id, secret_key, is_test_mode = true } = config;
    
    if (!app_id || !secret_key) {
      throw new Error('Cashfree configuration missing required credentials');
    }

    this.appId = app_id;
    this.secretKey = secret_key;
    this.baseURL = is_test_mode 
      ? 'https://sandbox.cashfree.com/pg' 
      : 'https://api.cashfree.com/pg';
    this.initialized = true;

    logger.info('Cashfree service initialized', { 
      environment: is_test_mode ? 'sandbox' : 'production',
      appId: app_id 
    });
  }

  // Generate Cashfree authentication headers
  generateAuthHeaders(useOneClickCheckout = false) {
    return {
      'x-client-id': this.appId,
      'x-client-secret': this.secretKey,
      'x-api-version': useOneClickCheckout ? '2022-09-01' : '2023-08-01',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // Create payment order with standard Cashfree checkout
  async createOrder(orderData) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    const {
      orderId,
      orderAmount,
      orderCurrency = 'INR',
      customerDetails,
      orderNote = '',
      returnUrl,
      notifyUrl,
      orderMeta = {},
    } = orderData;

    // Standard Cashfree order payload
    const payload = {
      order_id: orderId,
      order_amount: orderAmount,
      order_currency: orderCurrency,
      customer_details: {
        customer_id: customerDetails.customerId,
        customer_name: customerDetails.customerName,
        customer_email: customerDetails.customerEmail,
        customer_phone: customerDetails.customerPhone || '9999999999',
      },
      order_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
        ...orderMeta,
      },
      order_note: orderNote || 'Interview preparation credits'
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/orders`,
        payload,
        { headers: this.generateAuthHeaders(true) } // Use 2022-09-01 API version
      );

      logger.info('Cashfree One Click Checkout order created', {
        orderId,
        orderAmount,
        cfOrderId: response.data.cf_order_id,
        paymentSessionId: response.data.payment_session_id,
        responseFields: Object.keys(response.data),
      });

      // Construct payment link using Cashfree hosted checkout page
      const sessionId = response.data.payment_session_id;
      let paymentLink = null;
      
      if (sessionId) {
        // Use the Cashfree hosted checkout page URL
        const isTestMode = this.baseURL.includes('sandbox');
        
        // Updated URLs based on Cashfree documentation
        if (isTestMode) {
          paymentLink = `https://payments-test.cashfree.com/pay/order?order_token=${sessionId}`;
        } else {
          paymentLink = `https://payments.cashfree.com/pay/order?order_token=${sessionId}`;
        }
        
        logger.info('Generated payment link', {
          isTestMode,
          sessionId: sessionId.substring(0, 20) + '...',
          paymentLink: paymentLink.substring(0, 50) + '...'
        });
      }
      
      return {
        success: true,
        data: {
          orderId: response.data.order_id,
          cfOrderId: response.data.cf_order_id,
          paymentSessionId: response.data.payment_session_id,
          orderStatus: response.data.order_status,
          orderToken: response.data.order_token,
          paymentLink: paymentLink,
        },
      };
    } catch (error) {
      logger.error('Cashfree One Click Checkout order creation failed', {
        orderId,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Cashfree One Click Checkout order creation failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Get order status
  async getOrderStatus(orderId) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/orders/${orderId}`,
        { headers: this.generateAuthHeaders() }
      );

      return {
        success: true,
        data: {
          orderId: response.data.order_id,
          cfOrderId: response.data.cf_order_id,
          orderStatus: response.data.order_status,
          orderAmount: response.data.order_amount,
          orderCurrency: response.data.order_currency,
          paymentSessionId: response.data.payment_session_id,
        },
      };
    } catch (error) {
      logger.error('Failed to get Cashfree order status', {
        orderId,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Failed to get order status: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Get payment details
  async getPaymentDetails(cfPaymentId) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/payments/${cfPaymentId}`,
        { headers: this.generateAuthHeaders() }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error('Failed to get Cashfree payment details', {
        cfPaymentId,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Failed to get payment details: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(rawBody, signature, timestamp) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(timestamp + rawBody)
      .digest('base64');

    return expectedSignature === signature;
  }

  // Process refund
  async processRefund(refundData) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    const {
      cfPaymentId,
      refundAmount,
      refundId,
      refundNote = '',
    } = refundData;

    const payload = {
      refund_amount: refundAmount,
      refund_id: refundId,
      refund_note: refundNote,
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/payments/${cfPaymentId}/refunds`,
        payload,
        { headers: this.generateAuthHeaders() }
      );

      logger.info('Cashfree refund processed', {
        cfPaymentId,
        refundAmount,
        refundId: response.data.refund_id,
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error('Cashfree refund failed', {
        cfPaymentId,
        refundAmount,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Cashfree refund failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Get settlements
  async getSettlements(filters = {}) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    const params = new URLSearchParams();
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.cursor) params.append('cursor', filters.cursor);
    if (filters.settlement_id) params.append('settlement_id', filters.settlement_id);

    try {
      const response = await axios.get(
        `${this.baseURL}/settlements?${params}`,
        { headers: this.generateAuthHeaders() }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error('Failed to get Cashfree settlements', {
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Failed to get settlements: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Test connection to Cashfree
  async testConnection() {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    try {
      // Test by creating a test order with minimal data
      const testOrderId = `test_${Date.now()}`;
      const testOrder = {
        orderId: testOrderId,
        orderAmount: 1,
        orderCurrency: 'INR',
        customerDetails: {
          customerId: 'test_customer',
          customerName: 'Test Customer',
          customerEmail: 'test@example.com',
          customerPhone: '9999999999', // Default test phone number
        },
        returnUrl: 'https://example.com/return',
        notifyUrl: 'https://example.com/notify',
        orderNote: 'Test connection order',
      };

      const result = await this.createOrder(testOrder);
      
      if (result.success) {
        logger.info('Cashfree connection test successful');
        return {
          success: true,
          message: 'Connection to Cashfree successful',
          testOrderId: result.data.orderId,
        };
      } else {
        throw new Error('Test order creation failed');
      }
    } catch (error) {
      logger.error('Cashfree connection test failed', { error: error.message });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Validate configuration
  static validateConfiguration(config) {
    const { app_id, secret_key } = config;
    const errors = [];

    if (!app_id) {
      errors.push('Missing required field: app_id');
    }

    if (!secret_key) {
      errors.push('Missing required field: secret_key');
    }

    // Additional validation for format
    if (app_id && !app_id.match(/^[a-zA-Z0-9]+$/)) {
      errors.push('Invalid app_id format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Get supported payment methods
  getSupportedPaymentMethods() {
    return [
      { id: 'cc', name: 'Credit Card', type: 'card' },
      { id: 'dc', name: 'Debit Card', type: 'card' },
      { id: 'nb', name: 'Net Banking', type: 'bank_transfer' },
      { id: 'upi', name: 'UPI', type: 'upi' },
      { id: 'app', name: 'App Payments', type: 'app' },
      { id: 'wallet', name: 'Wallet', type: 'wallet' },
    ];
  }

  // Get transaction fee information
  getTransactionFees() {
    return {
      credit_card: '2.95%',
      debit_card: '1.95%',
      net_banking: '₹15 per transaction',
      upi: '0.95%',
      wallet: '2.95%',
      note: 'Fees may vary based on your merchant agreement',
    };
  }

  // Format amount for display
  formatAmount(amount, currency = 'INR') {
    if (currency === 'INR') {
      return `₹${parseFloat(amount).toFixed(2)}`;
    }
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  }

  // Create One Click Checkout link
  async createOneClickCheckout(orderData) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    const {
      orderId,
      orderAmount,
      orderCurrency = 'INR',
      customerDetails,
      orderNote = '',
      returnUrl,
      notifyUrl,
      orderMeta = {},
    } = orderData;

    // One Click Checkout specific payload
    const payload = {
      link_id: orderId,
      link_amount: orderAmount,
      link_currency: orderCurrency,
      link_purpose: orderNote || 'Credit package purchase',
      customer_details: {
        customer_name: customerDetails.customerName,
        customer_email: customerDetails.customerEmail,
        customer_phone: customerDetails.customerPhone || '9999999999',
      },
      link_expiry_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      link_notes: {
        return_url: returnUrl,
        notify_url: notifyUrl,
        order_id: orderId,
        ...orderMeta,
      },
      link_auto_reminders: true,
      link_notify: {
        send_sms: false,
        send_email: true,
      },
    };

    try {
      // Use the links endpoint for One Click Checkout
      const response = await axios.post(
        `${this.baseURL}/links`,
        payload,
        { headers: this.generateAuthHeaders() }
      );

      logger.info('Cashfree One Click Checkout link created', {
        linkId: orderId,
        linkAmount: orderAmount,
        linkUrl: response.data.link_url,
        cfLinkId: response.data.cf_link_id,
      });

      return {
        success: true,
        data: {
          linkId: response.data.link_id,
          cfLinkId: response.data.cf_link_id,
          linkUrl: response.data.link_url,
          linkStatus: response.data.link_status,
          linkAmount: response.data.link_amount,
          paymentLink: response.data.link_url, // Direct payment link
          orderId: orderId, // Keep track of our internal order ID
          isOneClickCheckout: true,
        },
      };
    } catch (error) {
      logger.error('Cashfree One Click Checkout creation failed', {
        orderId,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Cashfree One Click Checkout creation failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Get payment link status
  async getPaymentLinkStatus(linkId) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/links/${linkId}`,
        { headers: this.generateAuthHeaders() }
      );

      return {
        success: true,
        data: {
          linkId: response.data.link_id,
          cfLinkId: response.data.cf_link_id,
          linkStatus: response.data.link_status,
          linkAmount: response.data.link_amount,
          linkCurrency: response.data.link_currency,
          linkUrl: response.data.link_url,
          createdAt: response.data.link_created_at,
        },
      };
    } catch (error) {
      logger.error('Failed to get Cashfree payment link status', {
        linkId,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Failed to get payment link status: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Get payments for a specific link
  async getPaymentLinkPayments(linkId) {
    if (!this.initialized) {
      throw new Error('Cashfree service not initialized');
    }

    try {
      const response = await axios.get(
        `${this.baseURL}/links/${linkId}/payments`,
        { headers: this.generateAuthHeaders() }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      logger.error('Failed to get Cashfree payment link payments', {
        linkId,
        error: error.response?.data || error.message,
      });

      throw new Error(
        `Failed to get payment link payments: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  // Generate unique order ID
  static generateOrderId(prefix = 'order') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Generate unique link ID for one-click checkout
  static generateLinkId(prefix = 'link') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Create singleton instance
const cashfreeService = new CashfreeService();

export { CashfreeService, cashfreeService };
