import nodemailer from 'nodemailer';
import { logger } from '../config/logger.js';
import EmailTemplateService from './EmailTemplateServiceAdapted.js';
import EmailTrackingService from './EmailTrackingService.js';
import {
  EMAIL_EVENTS,
  EMAIL_TEMPLATES,
  getEmailTemplate,
  mergeEmailVariables,
  validateEmailVariables,
} from '../config/emailTemplates.js';

/**
 * Enhanced Email Service with template integration and real SMTP sending
 */
class EnhancedEmailService {
  constructor(database, dynamicConfigService) {
    this.db = database;
    this.dynamicConfig = dynamicConfigService;
    this.templateService = new EmailTemplateService(database);
    this.trackingService = new EmailTrackingService(database);
    this.transporter = null;
    this.isInitialized = false;

    this.initializeTransporter();
  }

  /**
   * Initialize SMTP transporter with dynamic configuration
   */
  async initializeTransporter() {
    try {
      const emailConfig = await this.getEmailConfiguration();

      if (!emailConfig.smtp.host || !emailConfig.smtp.user || !emailConfig.smtp.pass) {
        logger.warn('SMTP configuration incomplete, email sending will be disabled');
        this.isInitialized = false;
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: emailConfig.smtp.host,
        port: emailConfig.smtp.port,
        secure: emailConfig.smtp.secure,
        auth: {
          user: emailConfig.smtp.user,
          pass: emailConfig.smtp.pass,
        },
        pool: true,
        maxConnections: emailConfig.pool?.maxConnections || 5,
        maxMessages: emailConfig.pool?.maxMessages || 100,
        rateLimit: emailConfig.pool?.rateLimit || 10,
      });

      // Verify connection
      await this.transporter.verify();
      this.isInitialized = true;
      logger.info('Email transporter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error.message);
      this.isInitialized = false;
    }
  }

  /**
   * Get email configuration from dynamic config or environment variables
   */
  async getEmailConfiguration() {
    try {
      if (this.dynamicConfig) {
        // Try to get email configuration from dynamic config
        const emailFromConfig = await this.dynamicConfig.get('EMAIL_FROM', 'noreply@mockmate.ai');
        const smtpHost = await this.dynamicConfig.get('SMTP_HOST', 'smtp.gmail.com');
        const smtpPort = await this.dynamicConfig.get('SMTP_PORT', '587');
        const smtpUser = await this.dynamicConfig.get('SMTP_USER', '');
        const smtpPass = await this.dynamicConfig.get('SMTP_PASS', '');

        const config = {
          email: {
            smtp: {
              host: smtpHost,
              port: parseInt(smtpPort),
              secure: smtpPort === '465',
              user: smtpUser,
              pass: smtpPass,
            },
            from: {
              name: await this.dynamicConfig.get('EMAIL_FROM_NAME', 'MockMate'),
              address: emailFromConfig,
            },
            pool: {
              maxConnections: parseInt(await this.dynamicConfig.get('SMTP_MAX_CONNECTIONS', '5')),
              maxMessages: parseInt(await this.dynamicConfig.get('SMTP_MAX_MESSAGES', '100')),
              rateLimit: parseInt(await this.dynamicConfig.get('SMTP_RATE_LIMIT', '10')),
            },
            retries: {
              maxAttempts: parseInt(await this.dynamicConfig.get('EMAIL_MAX_RETRIES', '3')),
              retryDelay: parseInt(await this.dynamicConfig.get('EMAIL_RETRY_DELAY', '5000')),
            },
          },
        };
        if (config.email) {
          return config.email;
        }
      }
    } catch (error) {
      logger.warn('Failed to get dynamic email config, falling back to environment variables');
    }

    // Fallback to environment variables
    return {
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      from: {
        name: process.env.EMAIL_FROM_NAME || 'MockMate',
        address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER,
      },
      pool: {
        maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS) || 5,
        maxMessages: parseInt(process.env.SMTP_MAX_MESSAGES) || 100,
        rateLimit: parseInt(process.env.SMTP_RATE_LIMIT) || 10,
      },
      retries: {
        maxAttempts: parseInt(process.env.EMAIL_MAX_RETRIES) || 3,
        retryDelay: parseInt(process.env.EMAIL_RETRY_DELAY) || 5000,
      },
    };
  }

  /**
   * Send email using application event and variables
   * @param {string} eventName - Application event name from EMAIL_EVENTS
   * @param {string} recipientEmail - Recipient email address
   * @param {object} variables - Template variables
   * @param {object} options - Additional options (priority, delay, etc.)
   */
  async sendEmail(eventName, recipientEmail, variables = {}, options = {}) {
    try {
      if (!this.isInitialized) {
        logger.warn('Email service not initialized, skipping email send');
        return { success: false, error: 'Email service not initialized' };
      }

      // Get template configuration
      const templateConfig = getEmailTemplate(eventName);

      // Validate variables
      const validation = validateEmailVariables(eventName, variables);
      if (!validation.valid) {
        const error = `Missing required variables for ${eventName}: ${validation.missingVariables.join(', ')}`;
        logger.error(error);
        return { success: false, error };
      }

      // Merge variables with defaults
      const mergedVariables = mergeEmailVariables(eventName, variables);

      // Get rendered template
      const rendered = await this.templateService.previewTemplate(
        templateConfig.templateName,
        mergedVariables
      );

      // Prepare email options
      const emailConfig = await this.getEmailConfiguration();
      const mailOptions = {
        from: {
          name: emailConfig.from.name,
          address: emailConfig.from.address,
        },
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html_content,
        priority: options.priority || 'normal',
      };

      // Track email send attempt
      const trackingId = await this.trackingService.recordEmailSend({
        template_id: null, // We'll get this from the template service
        template_name: templateConfig.templateName,
        recipient_email: recipientEmail,
        subject: rendered.subject,
        variables: mergedVariables,
        event_name: eventName,
        send_status: 'pending',
      });

      // Send email with retries
      const result = await this.sendWithRetries(mailOptions, emailConfig.retries);

      // Update tracking with result
      await this.trackingService.updateEmailStatus(trackingId, {
        send_status: result.success ? 'sent' : 'failed',
        error_message: result.error,
        sent_at: result.success ? new Date() : null,
        message_id: result.messageId,
      });

      return {
        success: result.success,
        trackingId,
        messageId: result.messageId,
        error: result.error,
      };
    } catch (error) {
      logger.error(`Error sending email for event ${eventName}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email with retry logic
   */
  async sendWithRetries(mailOptions, retryConfig) {
    const maxAttempts = retryConfig?.maxAttempts || 3;
    const retryDelay = retryConfig?.retryDelay || 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this.transporter.sendMail(mailOptions);

        logger.info('Email sent successfully', {
          to: mailOptions.to,
          subject: mailOptions.subject,
          messageId: result.messageId,
          attempt,
        });

        return {
          success: true,
          messageId: result.messageId,
          attempt,
        };
      } catch (error) {
        logger.warn(`Email send attempt ${attempt} failed:`, {
          to: mailOptions.to,
          error: error.message,
          attempt,
          maxAttempts,
        });

        if (attempt === maxAttempts) {
          return {
            success: false,
            error: error.message,
            totalAttempts: attempt,
          };
        }

        // Wait before retry
        await this.delay(retryDelay * attempt);
      }
    }
  }

  /**
   * Send bulk emails
   */
  async sendBulkEmails(eventName, recipients, variables = {}, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const batchPromises = batch.map(recipient => {
        const recipientVariables =
          typeof recipient === 'object' ? { ...variables, ...recipient.variables } : variables;
        const email = typeof recipient === 'object' ? recipient.email : recipient;

        return this.sendEmail(eventName, email, recipientVariables, options);
      });

      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming SMTP server
      if (i + batchSize < recipients.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  /**
   * Send test email
   */
  async sendTestEmail(templateName, recipientEmail, variables = {}) {
    try {
      const rendered = await this.templateService.previewTemplate(templateName, variables);

      const emailConfig = await this.getEmailConfiguration();
      const mailOptions = {
        from: {
          name: emailConfig.from.name,
          address: emailConfig.from.address,
        },
        to: recipientEmail,
        subject: `[TEST] ${rendered.subject}`,
        html: rendered.html_content,
      };

      const result = await this.transporter.sendMail(mailOptions);

      logger.info('Test email sent successfully', {
        template: templateName,
        to: recipientEmail,
        messageId: result.messageId,
      });

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      logger.error('Error sending test email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get email sending statistics
   */
  async getEmailStats(filters = {}) {
    return await this.trackingService.getEmailStats(filters);
  }

  /**
   * Get email sending history
   */
  async getEmailHistory(filters = {}) {
    return await this.trackingService.getEmailHistory(filters);
  }

  /**
   * Validate email configuration
   */
  async validateConfiguration() {
    try {
      if (!this.transporter) {
        return { valid: false, error: 'Transporter not initialized' };
      }

      await this.transporter.verify();
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reinitialize service (useful for config changes)
   */
  async reinitialize() {
    if (this.transporter) {
      this.transporter.close();
    }
    await this.initializeTransporter();
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    if (this.transporter) {
      this.transporter.close();
      logger.info('Email service shut down');
    }
  }
}

// Convenience functions for common email events
export class EmailHelpers {
  constructor(emailService) {
    this.emailService = emailService;
  }

  // Authentication emails
  async sendWelcomeEmail(userEmail, userName) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.USER_WELCOME, userEmail, {
      USER_NAME: userName,
      USER_EMAIL: userEmail,
    });
  }

  async sendEmailVerification(userEmail, userName, verificationLink) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.EMAIL_VERIFY, userEmail, {
      USER_NAME: userName,
      USER_EMAIL: userEmail,
      VERIFICATION_LINK: verificationLink,
    });
  }

  async sendPasswordReset(userEmail, userName, resetLink) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.PASSWORD_RESET, userEmail, {
      USER_NAME: userName,
      RESET_LINK: resetLink,
    });
  }

  async sendPasswordChangeConfirmation(userEmail, userName) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.PASSWORD_CHANGE, userEmail, {
      USER_NAME: userName,
      USER_EMAIL: userEmail,
      CHANGE_TIME: new Date().toLocaleString(),
    });
  }

  // Interview emails
  async sendInterviewInvitation(candidateEmail, candidateName, interviewDetails) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.INTERVIEW_INVITE, candidateEmail, {
      CANDIDATE_NAME: candidateName,
      ...interviewDetails,
    });
  }

  async sendInterviewReminder(candidateEmail, candidateName, reminderDetails) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.INTERVIEW_REMIND, candidateEmail, {
      CANDIDATE_NAME: candidateName,
      ...reminderDetails,
    });
  }

  async sendInterviewCompletion(candidateEmail, candidateName, results) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.INTERVIEW_COMPLETE, candidateEmail, {
      CANDIDATE_NAME: candidateName,
      ...results,
    });
  }

  // Billing emails
  async sendPaymentConfirmation(userEmail, userName, paymentDetails) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.PAYMENT_SUCCESS, userEmail, {
      USER_NAME: userName,
      ...paymentDetails,
    });
  }

  async sendCreditsPurchase(userEmail, userName, purchaseDetails) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.CREDITS_BUY, userEmail, {
      USER_NAME: userName,
      ...purchaseDetails,
    });
  }

  // Generic notification
  async sendNotification(userEmail, userName, notificationTitle, notificationMessage, actionUrl) {
    return await this.emailService.sendEmail(EMAIL_EVENTS.NOTIFY_GENERIC, userEmail, {
      USER_NAME: userName,
      NOTIFICATION_TITLE: notificationTitle,
      NOTIFICATION_MESSAGE: notificationMessage,
      ACTION_URL: actionUrl,
    });
  }
}

export default EnhancedEmailService;
