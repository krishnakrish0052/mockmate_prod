import nodemailer from 'nodemailer';
import handlebars from 'handlebars';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../config/logger.js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import TemplateVariableService from './TemplateVariableService.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmailService {
  constructor(dynamicConfig = null) {
    this.transporter = null;
    this.templatesCache = new Map();
    this.dynamicConfig = dynamicConfig;
    this.initialized = false;
    this.variableService = new TemplateVariableService();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      const config = await this.getEmailConfiguration();

      this.transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_port === 465, // true for 465, false for other ports
        auth: {
          user: config.smtp_user,
          pass: config.smtp_pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('SMTP connection verification failed:', error);
        } else {
          logger.info('SMTP server is ready to take our messages');
        }
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
    }
  }

  async getEmailConfiguration() {
    if (this.dynamicConfig) {
      return {
        smtp_host: await this.dynamicConfig.get(
          'smtp_host',
          process.env.SMTP_HOST || 'smtp.gmail.com'
        ),
        smtp_port: await this.dynamicConfig.get(
          'smtp_port',
          parseInt(process.env.SMTP_PORT) || 587
        ),
        smtp_user: await this.dynamicConfig.get('smtp_user', process.env.SMTP_USER),
        smtp_pass: await this.dynamicConfig.get('smtp_pass', process.env.SMTP_PASS),
        email_from: await this.dynamicConfig.get(
          'email_from',
          process.env.EMAIL_FROM || 'noreply@mockmate.ai'
        ),
        frontend_url: await this.dynamicConfig.get(
          'frontend_url',
          process.env.FRONTEND_URL || 'http://localhost:3000'
        ),
      };
    }

    // Fallback to environment variables
    return {
      smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: parseInt(process.env.SMTP_PORT) || 587,
      smtp_user: process.env.SMTP_USER,
      smtp_pass: process.env.SMTP_PASS,
      email_from: process.env.EMAIL_FROM || 'noreply@mockmate.ai',
      frontend_url: process.env.FRONTEND_URL || 'http://localhost:3000',
    };
  }

  async loadTemplate(templateName) {
    if (this.templatesCache.has(templateName)) {
      return this.templatesCache.get(templateName);
    }

    try {
      const templatePath = path.join(process.cwd(), 'templates', 'emails', `${templateName}.hbs`);
      const templateSource = await fs.readFile(templatePath, 'utf8');
      const compiledTemplate = handlebars.compile(templateSource);

      this.templatesCache.set(templateName, compiledTemplate);
      return compiledTemplate;
    } catch (error) {
      logger.error(`Failed to load email template '${templateName}':`, error);
      throw new Error(`Email template '${templateName}' not found`);
    }
  }

  /**
   * Send email with retry logic and better error handling
   */
  async sendEmail(to, subject, templateName, templateData = {}, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.initialized) {
          await this.initialize();
        }

        if (!this.transporter) {
          throw new Error('Email transporter not initialized');
        }

        const config = await this.getEmailConfiguration();
        let html;

        // Try to render template (both HBS and HTML formats)
        try {
          html = await this.renderTemplate(templateName, {
            ...templateData,
            currentYear: new Date().getFullYear(),
            baseUrl: config.frontend_url,
          });
        } catch (templateError) {
          logger.warn(`Template rendering failed for '${templateName}', using fallback`);
          html = this.createFallbackTemplate(subject, templateData);
        }

        const mailOptions = {
          from: {
            name: options.fromName || 'MockMate',
            address: config.email_from,
          },
          to: Array.isArray(to) ? to.join(', ') : to,
          subject,
          html,
          text: options.text || this.extractTextFromHtml(html),
          ...options,
        };

        const info = await this.transporter.sendMail(mailOptions);

        logger.info(`Email sent successfully:`, {
          messageId: info.messageId,
          to: Array.isArray(to) ? to : [to],
          subject,
          template: templateName,
          attempt,
        });

        return {
          success: true,
          messageId: info.messageId,
          info,
          attempt,
        };
      } catch (error) {
        logger.error(`Email send attempt ${attempt} failed:`, {
          error: error.message,
          to: Array.isArray(to) ? to : [to],
          subject,
          template: templateName,
          stack: error.stack,
        });

        if (attempt === maxRetries) {
          throw new Error(`Failed to send email after ${maxRetries} attempts: ${error.message}`);
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  /**
   * Render template with support for both HBS and HTML templates
   */
  async renderTemplate(templateName, templateData = {}) {
    // First try HBS templates
    if (this.templatesCache.has(templateName)) {
      const template = this.templatesCache.get(templateName);
      return template(templateData);
    }

    // Try to load HBS template
    try {
      const template = await this.loadTemplate(templateName);
      return template(templateData);
    } catch (hbsError) {
      // Fall back to HTML templates
      try {
        const htmlContent = await this.loadHtmlTemplate(templateName);
        return this.renderHtmlTemplate(htmlContent, templateData);
      } catch (htmlError) {
        logger.error(`Failed to load both HBS and HTML templates for '${templateName}':`, {
          hbsError: hbsError.message,
          htmlError: htmlError.message,
        });
        throw new Error(`Template '${templateName}' not found in HBS or HTML format`);
      }
    }
  }

  /**
   * Load HTML template from email-templates directory
   */
  async loadHtmlTemplate(templateName) {
    const possiblePaths = [
      path.join(process.cwd(), 'email-templates', `${templateName}.html`),
      path.join(process.cwd(), '../email-templates', `${templateName}.html`),
      path.join(__dirname, '../../email-templates', `${templateName}.html`),
      path.resolve('email-templates', `${templateName}.html`),
    ];

    for (const templatePath of possiblePaths) {
      try {
        const content = await fs.readFile(templatePath, 'utf8');
        logger.debug(`Found HTML template at: ${templatePath}`);
        return content;
      } catch (error) {
        // Continue to next path
      }
    }

    throw new Error(
      `HTML template '${templateName}.html' not found in any of the expected locations`
    );
  }

  /**
   * Render HTML template with variable substitution
   */
  renderHtmlTemplate(htmlContent, templateData = {}) {
    let rendered = htmlContent;

    // Replace {{VARIABLE}} placeholders with actual values
    for (const [key, value] of Object.entries(templateData)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      rendered = rendered.replace(regex, String(value || ''));
    }

    // Replace any remaining unmatched variables with empty string
    rendered = rendered.replace(/{{\s*[^}]+\s*}}/g, '');

    return rendered;
  }

  /**
   * Create fallback template for critical emails
   */
  createFallbackTemplate(subject, templateData = {}) {
    const userName = templateData.userName || templateData.USER_NAME || 'User';
    const userEmail = templateData.userEmail || templateData.USER_EMAIL || '';

    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #007bff; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>MockMate</h1>
                </div>
                <div class="content">
                    <h2>${subject}</h2>
                    <p>Hello ${userName},</p>
                    <p>This email was sent from MockMate platform.</p>
                    ${Object.entries(templateData)
                      .map(([key, value]) => `<p><strong>${key}:</strong> ${value}</p>`)
                      .join('')}
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} MockMate. All rights reserved.</p>
                    <p>Sent to: ${userEmail}</p>
                </div>
            </div>
        </body>
        </html>
        `;
  }

  /**
   * Extract text content from HTML for text version
   */
  extractTextFromHtml(html) {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Email verification methods
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async sendVerificationEmail(user, verificationToken) {
    const config = await this.getEmailConfiguration();
    const verificationUrl = `${config.frontend_url}/verify-email?token=${verificationToken}`;

    return await this.sendEmail(user.email, 'Verify Your MockMate Account', 'account-verification', {
      USER_NAME: user.first_name || user.name || 'User',
      USER_EMAIL: user.email,
      VERIFICATION_URL: verificationUrl,
      VERIFICATION_CODE: verificationToken.substring(0, 8).toUpperCase(),
      EXPIRY_HOURS: '24',
    });
  }

  async sendWelcomeEmail(user) {
    const config = await this.getEmailConfiguration();
    return await this.sendEmail(user.email, 'Welcome to MockMate! 🚀', 'welcome-onboarding', {
      USER_NAME: user.first_name || user.name || 'User',
      USER_EMAIL: user.email,
      LOGIN_URL: `${config.frontend_url}/login`,
      DASHBOARD_URL: `${config.frontend_url}/dashboard`,
      SUPPORT_URL: `${config.frontend_url}/support`,
    });
  }

  async sendPasswordResetEmail(user, resetToken, requestInfo = {}) {
    const config = await this.getEmailConfiguration();
    const resetUrl = `${config.frontend_url}/reset-password?token=${resetToken}`;

    return await this.sendEmail(user.email, 'Reset Your MockMate Password', 'password-reset', {
      USER_NAME: user.first_name || user.name || 'User',
      USER_EMAIL: user.email,
      RESET_URL: resetUrl,
      EXPIRY_HOURS: '2',
      REQUEST_TIMESTAMP: new Date().toISOString(),
      REQUEST_IP: requestInfo.ip || 'Unknown',
      REQUEST_LOCATION: requestInfo.location || 'Unknown',
      REQUEST_USER_AGENT: requestInfo.userAgent || 'Unknown',
      SECURITY_CONTACT_URL: `${config.frontend_url}/security`,
      SUPPORT_URL: `${config.frontend_url}/support`,
      WEBSITE_URL: config.frontend_url,
    });
  }

  async sendPasswordChangeConfirmation(user) {
    const config = await this.getEmailConfiguration();
    return await this.sendEmail(
      user.email,
      'Password Changed Successfully',
      'password-change-confirmation',
      {
        USER_NAME: user.first_name || user.name || 'User',
        USER_EMAIL: user.email,
        CHANGE_TIME: new Date().toISOString(),
        SUPPORT_URL: `${config.frontend_url}/support`,
        WEBSITE_URL: config.frontend_url,
      }
    );
  }

  // Billing Email Methods
  async sendPaymentSuccessEmail(user, paymentDetails) {
    const config = await this.getEmailConfiguration();
    return await this.sendEmail(
      user.email, 
      'Payment Successful - MockMate', 
      'billing-payment-success', 
      {
        USER_NAME: user.first_name || user.name || 'User',
        USER_EMAIL: user.email,
        PLAN_NAME: paymentDetails.planName || 'Premium Plan',
        TOTAL_AMOUNT: paymentDetails.totalAmount || '0.00',
        PLAN_AMOUNT: paymentDetails.planAmount || paymentDetails.totalAmount || '0.00',
        BILLING_PERIOD: paymentDetails.billingPeriod || 'Monthly',
        NEXT_BILLING_DATE: paymentDetails.nextBillingDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        INVOICE_NUMBER: paymentDetails.invoiceNumber || `INV-${Date.now()}`,
        TRANSACTION_ID: paymentDetails.transactionId || 'N/A',
        PAYMENT_METHOD: paymentDetails.paymentMethod || 'Credit Card',
        DOWNLOAD_INVOICE_URL: `${config.frontend_url}/billing/invoice/${paymentDetails.invoiceNumber || 'latest'}`,
        MANAGE_BILLING_URL: `${config.frontend_url}/billing`,
      }
    );
  }

  async sendPaymentFailedEmail(user, failureDetails) {
    const config = await this.getEmailConfiguration();
    return await this.sendEmail(
      user.email, 
      'Payment Failed - Action Required', 
      'billing-payment-failed', 
      {
        USER_NAME: user.first_name || user.name || 'User',
        USER_EMAIL: user.email,
        PLAN_NAME: failureDetails.planName || 'Premium Plan',
        FAILURE_REASON: failureDetails.reason || 'Payment declined',
        AMOUNT_FAILED: failureDetails.amount || '0.00',
        ATTEMPT_DATE: failureDetails.attemptDate || new Date().toISOString(),
        NEXT_RETRY_DATE: failureDetails.nextRetryDate || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        GRACE_PERIOD_END: failureDetails.gracePeriodEnd || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        UPDATE_PAYMENT_URL: `${config.frontend_url}/billing/payment-methods`,
        RETRY_PAYMENT_URL: `${config.frontend_url}/billing/retry-payment`,
      }
    );
  }

  async sendSubscriptionExpiringEmail(user, subscriptionDetails) {
    const config = await this.getEmailConfiguration();
    const expiryDate = new Date(subscriptionDetails.expiryDate || Date.now() + 7 * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    
    return await this.sendEmail(
      user.email, 
      'Subscription Expiring Soon', 
      'billing-subscription-expiring', 
      {
        USER_NAME: user.first_name || user.name || 'User',
        USER_EMAIL: user.email,
        PLAN_NAME: subscriptionDetails.planName || 'Premium Plan',
        EXPIRY_DATE: expiryDate.toLocaleDateString(),
        DAYS_REMAINING: Math.max(0, daysRemaining).toString(),
        PLAN_PRICE: subscriptionDetails.planPrice || '29.99',
        RENEW_URL: `${config.frontend_url}/billing/renew`,
        UPGRADE_URL: `${config.frontend_url}/billing/upgrade`,
      }
    );
  }

  async sendInterviewInvitationEmail(user, interviewDetails) {
    const config = await this.getEmailConfiguration();
    return await this.sendEmail(
      user.email,
      'Interview Invitation - MockMate',
      'interview-invitation',
      {
        CANDIDATE_NAME: user.first_name || user.name || 'User',
        USER_EMAIL: user.email,
        COMPANY_NAME: interviewDetails.companyName || 'Company',
        POSITION: interviewDetails.position || 'Position',
        INTERVIEW_DATE: interviewDetails.date || new Date().toLocaleDateString(),
        INTERVIEW_TIME: interviewDetails.time || '10:00 AM',
        TIMEZONE: interviewDetails.timezone || 'EST',
        DURATION: interviewDetails.duration || '60 minutes',
        INTERVIEW_TYPE: interviewDetails.type || 'Video Interview',
        INTERVIEWER_NAME: interviewDetails.interviewer?.name || 'Interviewer',
        INTERVIEWER_TITLE: interviewDetails.interviewer?.title || 'Hiring Manager',
        MEETING_LINK: interviewDetails.meetingLink || null,
        CONFIRM_URL: `${config.frontend_url}/interview/confirm/${interviewDetails.id || 'invite'}`,
        RESCHEDULE_URL: `${config.frontend_url}/interview/reschedule/${interviewDetails.id || 'invite'}`,
        PRACTICE_URL: `${config.frontend_url}/practice`,
        CONFIRM_BY_DATE: interviewDetails.confirmByDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString(),
        COMPANY_CONTACT_EMAIL: interviewDetails.contactEmail || 'contact@company.com',
        UNSUBSCRIBE_URL: `${config.frontend_url}/unsubscribe`,
        SUPPORT_URL: `${config.frontend_url}/support`,
        WEBSITE_URL: config.frontend_url,
      }
    );
  }

  async sendInterviewCompletionEmail(user, interviewResults) {
    const config = await this.getEmailConfiguration();
    return await this.sendEmail(
      user.email,
      'Interview Complete - Thank You!',
      'interview-completion',
      {
        CANDIDATE_NAME: user.first_name || user.name || 'User',
        USER_EMAIL: user.email,
        COMPANY_NAME: interviewResults.companyName || 'Company',
        INTERVIEW_DURATION: interviewResults.duration || '45',
        HAS_SCORE: interviewResults.score ? true : false,
        INTERVIEW_SCORE: interviewResults.score || '85',
        TECHNICAL_FEEDBACK: interviewResults.feedback?.technical || 'Strong technical skills demonstrated.',
        COMMUNICATION_FEEDBACK: interviewResults.feedback?.communication || 'Clear and articulate communication.',
        PROBLEM_SOLVING_FEEDBACK: interviewResults.feedback?.problemSolving || 'Good analytical approach.',
        IMPROVEMENT_AREAS: interviewResults.feedback?.improvements || 'Consider practicing more complex scenarios.',
        QUESTIONS_ANSWERED: interviewResults.questionsAnswered || '8',
        AVG_RESPONSE_TIME: interviewResults.avgResponseTime || '45',
        CONFIDENCE_LEVEL: interviewResults.confidenceLevel || '7',
        DETAILED_REPORT_URL: `${config.frontend_url}/interviews/${interviewResults.id || 'latest'}/report`,
        PRACTICE_MORE_URL: `${config.frontend_url}/practice`,
        COMPANY_CONTACT_EMAIL: interviewResults.contactEmail || 'contact@company.com',
        UNSUBSCRIBE_URL: `${config.frontend_url}/unsubscribe`,
        SUPPORT_URL: `${config.frontend_url}/support`,
        WEBSITE_URL: config.frontend_url,
      }
    );
  }

  async sendCreditsPurchaseEmail(user, purchaseDetails) {
    return await this.sendEmail(user.email, 'Credits Purchase Confirmation', 'credits-purchase', {
      userName: user.first_name || user.name || 'User',
      userEmail: user.email,
      creditsAmount: purchaseDetails.credits,
      purchaseAmount: purchaseDetails.amount,
      transactionId: purchaseDetails.transactionId,
      purchaseDate: new Date().toISOString(),
    });
  }

  async sendNotificationEmail(user, notification) {
    return await this.sendEmail(
      user.email,
      notification.subject || 'MockMate Notification',
      'notification',
      {
        userName: user.first_name || user.name || 'User',
        userEmail: user.email,
        notificationTitle: notification.title,
        notificationMessage: notification.message,
        notificationDate: new Date().toISOString(),
        actionUrl: notification.actionUrl || null,
      }
    );
  }

  // Template management for admin panel
  async getAvailableTemplates() {
    try {
      const templatesDir = path.join(process.cwd(), 'templates', 'emails');
      const files = await fs.readdir(templatesDir);
      const templates = files
        .filter(file => file.endsWith('.hbs'))
        .map(file => file.replace('.hbs', ''));

      return templates;
    } catch (error) {
      logger.error('Failed to get available templates:', error);
      return [];
    }
  }

  async getTemplateContent(templateName) {
    try {
      const templatePath = path.join(process.cwd(), 'templates', 'emails', `${templateName}.hbs`);
      return await fs.readFile(templatePath, 'utf8');
    } catch (error) {
      logger.error(`Failed to get template content for '${templateName}':`, error);
      throw new Error(`Template '${templateName}' not found`);
    }
  }

  async updateTemplateContent(templateName, content) {
    try {
      const templatePath = path.join(process.cwd(), 'templates', 'emails', `${templateName}.hbs`);
      await fs.writeFile(templatePath, content, 'utf8');

      // Clear cache for this template
      this.templatesCache.delete(templateName);

      logger.info(`Template '${templateName}' updated successfully`);
      return true;
    } catch (error) {
      logger.error(`Failed to update template '${templateName}':`, error);
      throw error;
    }
  }

  /**
   * Send email using template name - used by OTP service
   */
  async sendTemplateEmail(templateName, recipientEmail, templateData = {}, options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const config = await this.getEmailConfiguration();

      // Load and render template
      const html = await this.renderTemplate(templateName, {
        ...templateData,
        currentYear: new Date().getFullYear(),
        baseUrl: config.frontend_url,
      });

      // Extract subject from title tag or use a default
      let subject = options.subject || 'MockMate Notification';
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        subject = titleMatch[1];
        // Render variables in subject too
        for (const [key, value] of Object.entries(templateData)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
          subject = subject.replace(regex, String(value || ''));
        }
      }

      const mailOptions = {
        from: {
          name: options.fromName || 'MockMate',
          address: config.email_from,
        },
        to: recipientEmail,
        subject,
        html,
        text: options.text || this.extractTextFromHtml(html),
        priority: options.priority || 'normal',
        ...options,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Template email sent successfully:', {
        messageId: info.messageId,
        to: recipientEmail,
        subject,
        template: templateName,
      });

      return {
        success: true,
        messageId: info.messageId,
        info,
      };
    } catch (error) {
      logger.error('Failed to send template email:', {
        error: error.message,
        templateName,
        to: recipientEmail,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send test email with enhanced template rendering
   */
  async sendTestEmail(to, templateName, customVariables = {}, options = {}) {
    try {
      // Load HTML template if available
      let htmlContent;
      try {
        htmlContent = await this.loadHtmlTemplate(templateName);
      } catch (error) {
        logger.warn(`HTML template not found for ${templateName}, using fallback`);
        throw new Error(`Template ${templateName} not found`);
      }

      // Extract variables from template
      const variables = this.variableService.extractVariablesFromHtml(htmlContent);
      const testData = this.variableService.generateTestData(variables);

      // Merge custom variables with test data
      const finalVariables = { ...testData, ...customVariables };

      // Render template
      const renderedHtml = this.variableService.renderHtmlTemplate(htmlContent, finalVariables);

      // Extract subject from title tag or use default
      let subject = 'Test Email from MockMate';
      const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        subject = titleMatch[1];
        // Render variables in subject too
        for (const [key, value] of Object.entries(finalVariables)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
          subject = subject.replace(regex, String(value));
        }
      }

      const config = await this.getEmailConfiguration();

      if (!this.initialized) {
        await this.initialize();
      }

      const mailOptions = {
        from: {
          name: options.fromName || 'MockMate Test',
          address: config.email_from,
        },
        to,
        subject: `[TEST] ${subject}`,
        html: renderedHtml,
        text: this.extractTextFromHtml(renderedHtml),
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Test email sent successfully:', {
        messageId: info.messageId,
        to,
        subject,
        template: templateName,
        variables: Object.keys(finalVariables),
      });

      return {
        success: true,
        messageId: info.messageId,
        subject,
        recipient: to,
        variables: finalVariables,
        templateName,
      };
    } catch (error) {
      logger.error('Failed to send test email:', {
        error: error.message,
        templateName,
        to,
      });
      throw error;
    }
  }

  /**
   * Preview template with enhanced variable rendering
   */
  async previewTemplate(templateName, customVariables = {}) {
    try {
      let htmlContent;
      try {
        htmlContent = await this.loadHtmlTemplate(templateName);
      } catch (error) {
        // Try HBS template
        try {
          const hbsTemplate = await this.loadTemplate(templateName);
          const testData = this.variableService.generateTestData([]);
          const mergedData = { ...testData, ...customVariables };
          htmlContent = hbsTemplate(mergedData);
        } catch (hbsError) {
          throw new Error(`Template '${templateName}' not found in HTML or HBS format`);
        }
      }

      // Extract variables from template
      const variables = this.variableService.extractVariablesFromHtml(htmlContent);
      const testData = this.variableService.generateTestData(variables);
      const categorized = this.variableService.categorizeVariables(variables);

      // Merge custom variables with test data
      const finalVariables = { ...testData, ...customVariables };

      // Render template
      const renderedHtml = this.variableService.renderHtmlTemplate(htmlContent, finalVariables);

      // Extract and render subject
      let subject = 'Email Preview';
      const titleMatch = htmlContent.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        subject = titleMatch[1];
        for (const [key, value] of Object.entries(finalVariables)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
          subject = subject.replace(regex, String(value));
        }
      }

      return {
        templateName,
        subject,
        renderedHtml,
        variables,
        categorizedVariables: categorized,
        testData,
        customVariables,
        finalVariables,
        variableCount: variables.length,
      };
    } catch (error) {
      logger.error('Failed to preview template:', {
        error: error.message,
        templateName,
      });
      throw error;
    }
  }

  /**
   * Analyze template variables
   */
  async analyzeTemplate(templateName) {
    try {
      const htmlContent = await this.loadHtmlTemplate(templateName);
      const variables = this.variableService.extractVariablesFromHtml(htmlContent);
      const categorized = this.variableService.categorizeVariables(variables);
      const testData = this.variableService.generateTestData(variables);

      return {
        templateName,
        totalVariables: variables.length,
        variables,
        categorizedVariables: categorized,
        testData,
        contentLength: htmlContent.length,
        analysis: {
          knownVariableCount: Object.values(categorized.knownVariables).reduce(
            (count, category) => count + Object.keys(category.variables).length,
            0
          ),
          unknownVariableCount: categorized.unknownVariables.length,
          categoryBreakdown: Object.entries(categorized.knownVariables).map(([key, category]) => ({
            category: key,
            name: category.name,
            color: category.color,
            count: Object.keys(category.variables).length,
            variables: Object.keys(category.variables),
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to analyze template:', {
        error: error.message,
        templateName,
      });
      throw error;
    }
  }

  /**
   * Get all HTML templates with their variables
   */
  async getHtmlTemplatesWithVariables() {
    try {
      const templatesDir = path.resolve('email-templates');
      return await this.variableService.getAllVariablesFromDirectory(templatesDir);
    } catch (error) {
      logger.error('Failed to get HTML templates with variables:', error);
      return {
        allVariables: [],
        templateVariables: {},
        totalTemplates: 0,
      };
    }
  }

  /**
   * Verify email configuration
   */
  async verifyConfiguration() {
    try {
      const config = await this.getEmailConfiguration();

      // Check required configuration
      const missing = [];
      if (!config.smtp_host) missing.push('smtp_host');
      if (!config.smtp_user) missing.push('smtp_user');
      if (!config.smtp_pass) missing.push('smtp_pass');
      if (!config.email_from) missing.push('email_from');

      if (missing.length > 0) {
        return {
          valid: false,
          errors: [`Missing required configuration: ${missing.join(', ')}`],
          config: { ...config, smtp_pass: '[HIDDEN]' },
        };
      }

      // Test SMTP connection
      if (!this.initialized) {
        await this.initialize();
      }

      if (this.transporter) {
        const verified = await this.transporter.verify();
        return {
          valid: verified,
          errors: verified ? [] : ['SMTP connection failed'],
          config: { ...config, smtp_pass: '[HIDDEN]' },
        };
      } else {
        return {
          valid: false,
          errors: ['Email transporter not initialized'],
          config: { ...config, smtp_pass: '[HIDDEN]' },
        };
      }
    } catch (error) {
      logger.error('Email configuration verification failed:', error);
      return {
        valid: false,
        errors: [error.message],
        config: null,
      };
    }
  }

  async compile(template, data, _success = true) {
    try {
      return await this.renderTemplate(template, data);
    } catch (_templateError) {
      try {
        return await this.renderHtmlTemplate(template, data);
      } catch (_error) {
        throw new Error(`Template '${template}' not found in HBS or HTML format`);
      }
    }
  }
}

// Note: emailService will be initialized with dynamic config in server.js
export const emailService = null;
export { EmailService };
export default EmailService;
