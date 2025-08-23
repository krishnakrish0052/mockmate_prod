import { EmailService } from './EmailService.js';
import { EmailTemplateService } from './EmailTemplateService.js';
import { logger } from '../config/logger.js';
import { _mergeEmailVariables } from './TemplateVariableService.js';

/**
 * Automated Email Service
 * Handles automatic email sending based on user actions and system events
 */
class AutomatedEmailService {
  constructor(database, dynamicConfigService) {
    this.db = database;
    this.dynamicConfig = dynamicConfigService;
    this.emailService = new EnhancedEmailService(database, dynamicConfigService);
    this.emailHelpers = new EmailHelpers(this.emailService);
    this.variableService = new TemplateVariableService();
    this.initialized = false;

    // Event listeners for automatic email triggers
    this.eventHandlers = new Map();
    this.setupEventHandlers();
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.emailService.initializeTransporter();
      this.initialized = true;
      logger.info('AutomatedEmailService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AutomatedEmailService:', error);
      throw error;
    }
  }

  /**
   * Setup automatic event handlers
   */
  setupEventHandlers() {
    // Credits Purchase Handler
    this.eventHandlers.set('CREDITS_PURCHASE', async eventData => {
      return await this.handleCreditsPurchase(eventData);
    });

    // OTP Generation Handler
    this.eventHandlers.set('OTP_GENERATION', async eventData => {
      return await this.handleOTPGeneration(eventData);
    });

    // User Registration Handler
    this.eventHandlers.set('USER_REGISTRATION', async eventData => {
      return await this.handleUserRegistration(eventData);
    });

    // Password Reset Handler
    this.eventHandlers.set('PASSWORD_RESET', async eventData => {
      return await this.handlePasswordReset(eventData);
    });

    // Billing Status Changes
    this.eventHandlers.set('BILLING_SUCCESS', async eventData => {
      return await this.handleBillingSuccess(eventData);
    });

    this.eventHandlers.set('BILLING_FAILED', async eventData => {
      return await this.handleBillingFailed(eventData);
    });

    // System Notifications
    this.eventHandlers.set('SYSTEM_NOTIFICATION', async eventData => {
      return await this.handleSystemNotification(eventData);
    });

    // Admin Actions
    this.eventHandlers.set('ADMIN_OTP', async eventData => {
      return await this.handleAdminOTP(eventData);
    });
  }

  /**
   * Handle credits purchase event
   */
  async handleCreditsPurchase(eventData) {
    try {
      const { user, transaction, purchase } = eventData;

      if (!user || !user.email) {
        throw new Error('User email is required for credits purchase notification');
      }

      // Generate dynamic variables
      const context = {
        user,
        transaction,
        purchase,
        customVariables: {
          RECEIPT_URL:
            eventData.receiptUrl || `${process.env.FRONTEND_URL}/billing/receipt/${transaction.id}`,
          PACKAGE_NAME: purchase.package_name || 'Credit Package',
          CURRENT_CREDITS: eventData.currentCredits || user.credits || '0',
          PREVIOUS_CREDITS: eventData.previousCredits || '0',
          BONUS_CREDITS: purchase.bonus_credits || '0',
          UNIT_PRICE: purchase.unit_price || '1.00',
        },
      };

      const variables = this.variableService.getVariablesForEvent('CREDITS_PURCHASE', context);

      const result = await this.emailService.sendEmail(
        EMAIL_EVENTS.CREDITS_BUY,
        user.email,
        variables,
        { priority: 'high' }
      );

      logger.info('Credits purchase email sent', {
        userId: user.id,
        transactionId: transaction.id,
        credits: purchase.credits,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send credits purchase email:', error);
      throw error;
    }
  }

  /**
   * Handle OTP generation event
   */
  async handleOTPGeneration(eventData) {
    try {
      const { user, otpCode, action, isAdminAction = false } = eventData;

      if (!user || !user.email) {
        throw new Error('User email is required for OTP notification');
      }

      if (!otpCode) {
        throw new Error('OTP code is required');
      }

      const context = {
        user,
        otp: otpCode,
        otpAction: action || 'verification',
        isAdminAction,
        customVariables: {
          OTP_CODE: otpCode,
          OTP_ACTION_TYPE: action || 'account verification',
          OTP_ACTION_TITLE: `${(action || 'account verification').toUpperCase()} REQUIRED`,
          OTP_MESSAGE:
            eventData.message || `Please use this code to verify your ${action || 'account'}.`,
          OTP_INITIATED_BY: isAdminAction ? 'Administrator' : 'User Request',
          IS_ADMIN_ACTION: isAdminAction,
          REQUEST_IP: eventData.requestIP || 'Unknown',
          USER_AGENT: eventData.userAgent || 'Unknown',
        },
      };

      const variables = this.variableService.getVariablesForEvent('OTP_VERIFICATION', context);

      // Use the OTP template
      const result = await this.emailService.sendEmail(
        'OTP_VERIFICATION', // Custom event for OTP
        user.email,
        variables,
        { priority: isAdminAction ? 'urgent' : 'high' }
      );

      logger.info('OTP email sent', {
        userId: user.id,
        action,
        isAdminAction,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send OTP email:', error);
      throw error;
    }
  }

  /**
   * Handle user registration event
   */
  async handleUserRegistration(eventData) {
    try {
      const { user, verificationToken } = eventData;

      const context = {
        user,
        customVariables: {
          VERIFICATION_LINK: `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`,
          VERIFICATION_CODE: verificationToken,
        },
      };

      const variables = this.variableService.getVariablesForEvent('EMAIL_VERIFICATION', context);

      const result = await this.emailService.sendEmail(
        EMAIL_EVENTS.EMAIL_VERIFY,
        user.email,
        variables
      );

      logger.info('Registration email sent', {
        userId: user.id,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send registration email:', error);
      throw error;
    }
  }

  /**
   * Handle password reset event
   */
  async handlePasswordReset(eventData) {
    try {
      const { user, resetToken } = eventData;

      const context = {
        user,
        customVariables: {
          RESET_LINK: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
          EXPIRY_TIME: '1 hour',
        },
      };

      const variables = this.variableService.getVariablesForEvent('PASSWORD_RESET', context);

      const result = await this.emailService.sendEmail(
        EMAIL_EVENTS.PASSWORD_RESET,
        user.email,
        variables,
        { priority: 'high' }
      );

      logger.info('Password reset email sent', {
        userId: user.id,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  /**
   * Handle billing success event
   */
  async handleBillingSuccess(eventData) {
    try {
      const { user, billing } = eventData;

      const context = {
        user,
        billing,
        customVariables: {
          BILLING_TYPE: 'Payment Successful',
          BILLING_TITLE: 'Payment Processed Successfully',
          PLAN_NAME: billing.plan_name || 'Professional Plan',
          AMOUNT: billing.amount || '0.00',
          NEXT_BILLING_DATE: billing.next_billing_date,
          INVOICE_URL: `${process.env.FRONTEND_URL}/billing/invoice/${billing.id}`,
          MANAGE_BILLING_URL: `${process.env.FRONTEND_URL}/billing`,
        },
      };

      const variables = this.variableService.generateDynamicVariables(context);

      const result = await this.emailService.sendEmail(
        EMAIL_EVENTS.PAYMENT_SUCCESS,
        user.email,
        variables
      );

      logger.info('Billing success email sent', {
        userId: user.id,
        billingId: billing.id,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send billing success email:', error);
      throw error;
    }
  }

  /**
   * Handle billing failed event
   */
  async handleBillingFailed(eventData) {
    try {
      const { user, billing, failureReason } = eventData;

      const context = {
        user,
        billing,
        customVariables: {
          BILLING_TYPE: 'Payment Failed',
          BILLING_TITLE: 'Payment Failed',
          PLAN_NAME: billing.plan_name || 'Professional Plan',
          AMOUNT: billing.amount || '0.00',
          FAILURE_REASON: failureReason || 'Payment method declined',
          UPDATE_PAYMENT_URL: `${process.env.FRONTEND_URL}/billing/update-payment`,
          MANAGE_BILLING_URL: `${process.env.FRONTEND_URL}/billing`,
        },
      };

      const variables = this.variableService.generateDynamicVariables(context);

      const result = await this.emailService.sendEmail(
        EMAIL_EVENTS.PAYMENT_FAILED,
        user.email,
        variables,
        { priority: 'urgent' }
      );

      logger.info('Billing failed email sent', {
        userId: user.id,
        billingId: billing.id,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send billing failed email:', error);
      throw error;
    }
  }

  /**
   * Handle system notification event
   */
  async handleSystemNotification(eventData) {
    try {
      const { user, notification } = eventData;

      const context = {
        user,
        notification,
        customVariables: {
          NOTIFICATION_TITLE: notification.title || 'System Notification',
          NOTIFICATION_MESSAGE: notification.message || '',
          NOTIFICATION_TYPE: notification.type || 'info',
          PRIORITY: notification.priority || 'normal',
          CATEGORY: notification.category || 'system',
          URGENT: notification.urgent || false,
          ACTION_URL: notification.actionUrl,
          NOTIFICATION_ID: notification.id || this.variableService.generateRequestId(),
          NOTIFICATION_DATE: new Date().toLocaleDateString(),
        },
      };

      const variables = this.variableService.generateDynamicVariables(context);

      const result = await this.emailService.sendEmail(
        EMAIL_EVENTS.NOTIFY_GENERIC,
        user.email,
        variables,
        { priority: notification.priority || 'normal' }
      );

      logger.info('System notification email sent', {
        userId: user.id,
        notificationId: notification.id,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send system notification email:', error);
      throw error;
    }
  }

  /**
   * Handle admin OTP event
   */
  async handleAdminOTP(eventData) {
    try {
      const { user, otpCode, adminAction, adminUser } = eventData;

      const context = {
        user,
        otp: otpCode,
        otpAction: adminAction,
        isAdminAction: true,
        customVariables: {
          OTP_CODE: otpCode,
          OTP_ACTION_TYPE: adminAction || 'admin verification',
          OTP_ACTION_TITLE: `ADMIN ${(adminAction || 'verification').toUpperCase()} REQUIRED`,
          OTP_MESSAGE: `An administrator has requested verification for: ${adminAction}`,
          OTP_INITIATED_BY: `Administrator: ${adminUser?.name || 'System Admin'}`,
          IS_ADMIN_ACTION: true,
          OTP_SECURITY_LEVEL: 'CRITICAL',
        },
      };

      const variables = this.variableService.getVariablesForEvent('OTP_VERIFICATION', context);

      const result = await this.emailService.sendEmail('OTP_VERIFICATION', user.email, variables, {
        priority: 'urgent',
      });

      logger.info('Admin OTP email sent', {
        userId: user.id,
        adminAction,
        adminUserId: adminUser?.id,
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error('Failed to send admin OTP email:', error);
      throw error;
    }
  }

  /**
   * Trigger automated email based on event
   */
  async triggerEmail(eventType, eventData) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const handler = this.eventHandlers.get(eventType);
      if (!handler) {
        logger.warn(`No handler found for event type: ${eventType}`);
        return { success: false, error: 'No handler found' };
      }

      const result = await handler(eventData);

      logger.info(`Automated email triggered for event: ${eventType}`, {
        success: result.success,
        recipient: eventData.user?.email,
      });

      return result;
    } catch (error) {
      logger.error(`Failed to trigger automated email for event: ${eventType}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Hook into credit purchase process
   */
  async onCreditsPurchased(userId, transactionId, purchaseData) {
    try {
      // Get user data
      const userQuery = 'SELECT * FROM users WHERE id = $1';
      const userResult = await this.db.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      // Get transaction data
      const transactionQuery = 'SELECT * FROM credit_transactions WHERE id = $1';
      const transactionResult = await this.db.query(transactionQuery, [transactionId]);

      if (transactionResult.rows.length === 0) {
        throw new Error('Transaction not found');
      }

      const user = userResult.rows[0];
      const transaction = transactionResult.rows[0];

      // Calculate previous credits
      const previousCredits = user.credits - transaction.credits_amount;

      const eventData = {
        user,
        transaction,
        purchase: {
          ...purchaseData,
          credits: transaction.credits_amount,
          amount: transaction.cost_usd,
        },
        currentCredits: user.credits.toString(),
        previousCredits: previousCredits.toString(),
        receiptUrl: `${process.env.FRONTEND_URL}/billing/receipt/${transaction.id}`,
      };

      return await this.triggerEmail('CREDITS_PURCHASE', eventData);
    } catch (error) {
      logger.error('Failed to trigger credits purchase email:', error);
      throw error;
    }
  }

  /**
   * Hook into OTP generation process
   */
  async onOTPGenerated(userId, otpCode, action, options = {}) {
    try {
      const userQuery = 'SELECT * FROM users WHERE id = $1';
      const userResult = await this.db.query(userQuery, [userId]);

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const eventData = {
        user: userResult.rows[0],
        otpCode,
        action,
        isAdminAction: options.isAdminAction || false,
        message: options.message,
        requestIP: options.requestIP,
        userAgent: options.userAgent,
      };

      return await this.triggerEmail('OTP_GENERATION', eventData);
    } catch (error) {
      logger.error('Failed to trigger OTP email:', error);
      throw error;
    }
  }

  /**
   * Get email sending statistics
   */
  async getEmailStats() {
    return await this.emailService.getEmailStats();
  }

  /**
   * Test email functionality
   */
  async sendTestEmail(templateName, recipientEmail, customVariables = {}) {
    return await this.emailService.sendTestEmail(templateName, recipientEmail, customVariables);
  }
}

export default AutomatedEmailService;
