import nodemailer from 'nodemailer';
import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import EmailQueueService from './EmailQueueService.js';

class EmailNotificationService {
  constructor() {
    this.transporter = null;
    this.queueService = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email queue service
   */
  initializeQueueService() {
    if (!this.queueService) {
      this.queueService = new EmailQueueService(this);

      // Set up event listeners for queue events
      this.queueService.on('campaignQueued', data => {
        logger.info(`Campaign ${data.campaignId} queued with ${data.totalRecipients} recipients`);
      });

      this.queueService.on('processingStarted', data => {
        logger.info(`Started processing campaign ${data.campaignId}`);
      });

      this.queueService.on('jobCompleted', data => {
        logger.debug(`Email sent to ${data.recipient} for campaign ${data.campaignId}`);
      });

      this.queueService.on('jobFailed', data => {
        logger.error(
          `Email failed for ${data.recipient} in campaign ${data.campaignId}: ${data.error}`
        );
      });

      this.queueService.on('campaignCompleted', data => {
        logger.info(`Campaign ${data.campaignId} completed with status: ${data.finalStatus}`);
      });
    }
    return this.queueService;
  }

  async initializeTransporter() {
    try {
      // Initialize nodemailer transporter based on environment configuration
      // Check if SMTP settings are available first
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log('🌐 Initializing real SMTP email service:', process.env.SMTP_HOST);
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          tls: {
            rejectUnauthorized: false, // Allow self-signed certificates
          },
        });
      } else if (
        process.env.EMAIL_SERVICE === 'gmail' &&
        process.env.EMAIL_USER &&
        process.env.EMAIL_PASS
      ) {
        console.log('📧 Initializing Gmail email service');
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });
      } else {
        // Default fallback to ethereal for testing
        console.log('🧪 No real email config found, using Ethereal test service');
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransporter({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log('🧪 Ethereal test account created:', testAccount.user);
        console.log('🧪 Preview emails at: https://ethereal.email');
      }

      // Verify transporter
      await this.transporter.verify();
      logger.info('Email transporter initialized and verified successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
      console.error('❌ Email transporter error details:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        error: error.message,
      });
    }
  }

  /**
   * Get all users for bulk email
   */
  async getAllUsers() {
    const db = getDatabase();
    const query = `
            SELECT id, email, 
                   CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name,
                   is_verified, created_at
            FROM users 
            WHERE is_verified = true
            ORDER BY created_at DESC
        `;

    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Get specific users by IDs
   */
  async getUsersByIds(userIds) {
    const db = getDatabase();
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');

    const query = `
            SELECT id, email, 
                   CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name,
                   is_verified, created_at
            FROM users 
            WHERE id IN (${placeholders}) AND is_verified = true
            ORDER BY created_at DESC
        `;

    const result = await db.query(query, userIds);
    return result.rows;
  }

  /**
   * Get users by email addresses
   */
  async getUsersByEmails(emails) {
    const db = getDatabase();
    const placeholders = emails.map((_, index) => `$${index + 1}`).join(',');

    const query = `
            SELECT id, email, 
                   CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name,
                   is_verified, created_at
            FROM users 
            WHERE email IN (${placeholders}) AND is_verified = true
            ORDER BY created_at DESC
        `;

    const result = await db.query(query, emails);
    return result.rows;
  }

  /**
   * Create a new bulk email campaign
   */
  async createEmailCampaign(campaignData, createdBy) {
    const db = getDatabase();
    const {
      name,
      description,
      subject,
      template_id,
      custom_html,
      recipient_type,
      recipient_data,
      scheduled_at,
    } = campaignData;

    const query = `
            INSERT INTO email_campaigns (
                name, description, subject, template_id, custom_html,
                recipient_type, recipient_data, scheduled_at,
                status, created_by, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *
        `;

    const values = [
      name,
      description,
      subject,
      template_id,
      custom_html,
      recipient_type,
      JSON.stringify(recipient_data),
      scheduled_at,
      'draft',
      createdBy,
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Get email template by ID
   */
  async getEmailTemplate(templateId) {
    const db = getDatabase();
    const query = `
            SELECT * FROM email_templates 
            WHERE id = $1 AND is_active = true
        `;

    const result = await db.query(query, [templateId]);
    if (result.rows.length === 0) {
      throw new Error('Email template not found');
    }

    return result.rows[0];
  }

  /**
   * Render email template with variables
   */
  renderTemplate(htmlContent, variables) {
    let rendered = htmlContent;

    // Replace template variables
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, variables[key] || '');
    });

    return rendered;
  }

  /**
   * Send bulk email campaign using queue system
   */
  async sendBulkEmailQueued(campaignId, adminId, options = {}) {
    try {
      // Initialize queue service if not already initialized
      this.initializeQueueService();

      // Queue the campaign for processing
      const queued = await this.queueService.queueCampaign(campaignId, options);
      if (!queued) {
        throw new Error('Failed to queue campaign');
      }

      // Start processing immediately
      const started = await this.queueService.startProcessing(campaignId);
      if (!started) {
        throw new Error('Failed to start processing campaign');
      }

      // Return queue status
      const queueStatus = this.queueService.getQueueStatus(campaignId);

      return {
        campaignId,
        status: 'queued',
        message: 'Campaign has been queued and processing started',
        queueStatus,
      };
    } catch (error) {
      logger.error(`Failed to queue campaign ${campaignId}:`, error);

      // Update campaign status to failed
      const db = getDatabase();
      await db.query(
        'UPDATE email_campaigns SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
        ['failed', error.message, campaignId]
      );

      throw error;
    }
  }

  /**
   * Send bulk email campaign (direct method - for smaller campaigns)
   */
  async sendBulkEmail(campaignId, adminId) {
    const db = getDatabase();

    try {
      // Start transaction
      await db.query('BEGIN');

      // Get campaign details (remove created_by restriction for admin flexibility)
      const campaignQuery = `
                SELECT * FROM email_campaigns 
                WHERE id = $1
            `;

      const campaignResult = await db.query(campaignQuery, [campaignId]);
      if (campaignResult.rows.length === 0) {
        throw new Error('Campaign not found');
      }

      const campaign = campaignResult.rows[0];

      // In production, prevent resending campaigns
      if (campaign.status === 'sent' && process.env.NODE_ENV === 'production') {
        throw new Error('Campaign already sent');
      }

      // In development, warn but allow resending
      if (campaign.status === 'sent') {
        console.log('⚠️ Warning: Resending already sent campaign in development mode');
        logger.warn(`Resending campaign ${campaignId} that was already sent (development mode)`);
      }

      // Get recipients based on recipient_type
      let recipients = [];
      let recipientData = {};

      // EMERGENCY FIX: Handle recipient_data parsing safely
      try {
        if (campaign.recipient_data && typeof campaign.recipient_data === 'string') {
          recipientData = JSON.parse(campaign.recipient_data);
        } else if (campaign.recipient_data && typeof campaign.recipient_data === 'object') {
          recipientData = campaign.recipient_data;
        } else {
          recipientData = {};
        }
      } catch (parseError) {
        logger.error('Failed to parse recipient_data:', parseError);
        recipientData = {};
      }

      switch (campaign.recipient_type) {
        case 'all_users':
          recipients = await this.getAllUsers();
          break;
        case 'specific_users':
          recipients = await this.getUsersByIds(recipientData.user_ids);
          break;
        case 'email_list':
          recipients = recipientData.emails.map(email => ({ email, name: email }));
          break;
        case 'custom':
          recipients = await this.getUsersByEmails(recipientData.emails);
          break;
        default:
          throw new Error('Invalid recipient type');
      }

      if (recipients.length === 0) {
        throw new Error('No valid recipients found');
      }

      // Get email template if specified
      let htmlContent = campaign.custom_html;
      if (campaign.template_id) {
        const template = await this.getEmailTemplate(campaign.template_id);
        htmlContent = template.html_template || template.template_content;
      }

      // Update campaign status to sending
      await db.query(
        'UPDATE email_campaigns SET status = $1, sent_at = NOW(), updated_at = NOW() WHERE id = $2',
        ['sending', campaignId]
      );

      // Send emails to recipients
      const sendResults = [];
      let successCount = 0;
      let failureCount = 0;

      for (const recipient of recipients) {
        try {
          // Render template with recipient variables
          const personalizedVariables = {
            name: recipient.name || 'Valued User',
            email: recipient.email,
            ...(recipientData.variables || {}),
          };

          const renderedHtml = this.renderTemplate(htmlContent, personalizedVariables);

          // Send email
          const mailOptions = {
            from: `${process.env.EMAIL_FROM_NAME || 'MockMate'} <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to: recipient.email,
            subject: campaign.subject,
            html: renderedHtml,
          };

          console.log(`📤 Sending email to ${recipient.email} from ${mailOptions.from}`);
          console.log('📧 Mail options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            htmlLength: mailOptions.html?.length || 0,
          });

          const info = await this.transporter.sendMail(mailOptions);

          console.log('✅ Email accepted by server:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected,
          });

          // Log successful send
          await db.query(
            `
                        INSERT INTO email_campaign_recipients (
                            campaign_id, user_id, email, status, 
                            sent_at, message_id, created_at
                        ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
                    `,
            [campaignId, recipient.id || null, recipient.email, 'sent', info.messageId]
          );

          successCount++;
          sendResults.push({
            email: recipient.email,
            status: 'sent',
            messageId: info.messageId,
          });
        } catch (error) {
          logger.error(`Failed to send email to ${recipient.email}:`, error);

          // Log failed send
          await db.query(
            `
                        INSERT INTO email_campaign_recipients (
                            campaign_id, user_id, email, status, 
                            error_message, created_at
                        ) VALUES ($1, $2, $3, $4, $5, NOW())
                    `,
            [campaignId, recipient.id || null, recipient.email, 'failed', error.message]
          );

          failureCount++;
          sendResults.push({
            email: recipient.email,
            status: 'failed',
            error: error.message,
          });
        }

        // Add small delay to prevent overwhelming the email service
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update campaign with final results
      const finalStatus = failureCount > 0 ? 'partial_success' : 'sent';
      await db.query(
        `
                UPDATE email_campaigns SET 
                    status = $1, 
                    total_recipients = $2, 
                    success_count = $3, 
                    failure_count = $4,
                    updated_at = NOW()
                WHERE id = $5
            `,
        [finalStatus, recipients.length, successCount, failureCount, campaignId]
      );

      // Commit transaction
      await db.query('COMMIT');

      return {
        campaignId,
        totalRecipients: recipients.length,
        successCount,
        failureCount,
        results: sendResults,
      };
    } catch (error) {
      // Rollback transaction
      await db.query('ROLLBACK');

      // Update campaign status to failed
      await db.query(
        'UPDATE email_campaigns SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
        ['failed', error.message, campaignId]
      );

      throw error;
    }
  }

  /**
   * Get campaign history
   */
  async getCampaigns(filters = {}) {
    const db = getDatabase();
    let query = `
            SELECT ec.*, u.name as created_by_name
            FROM email_campaigns ec
            LEFT JOIN users u ON ec.created_by = u.id
            WHERE 1=1
        `;

    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND ec.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.createdBy) {
      query += ` AND ec.created_by = $${paramCount}`;
      values.push(filters.createdBy);
      paramCount++;
    }

    query += ` ORDER BY ec.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;

      if (filters.offset) {
        query += ` OFFSET $${paramCount}`;
        values.push(filters.offset);
      }
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Get campaign details with recipient information
   */
  async getCampaignDetails(campaignId) {
    const db = getDatabase();

    // Get campaign info
    const campaignQuery = `
            SELECT ec.*, u.name as created_by_name
            FROM email_campaigns ec
            LEFT JOIN users u ON ec.created_by = u.id
            WHERE ec.id = $1
        `;

    const campaignResult = await db.query(campaignQuery, [campaignId]);
    if (campaignResult.rows.length === 0) {
      throw new Error('Campaign not found');
    }

    const campaign = campaignResult.rows[0];

    // Get recipient details
    const recipientsQuery = `
            SELECT * FROM email_campaign_recipients
            WHERE campaign_id = $1
            ORDER BY created_at ASC
        `;

    const recipientsResult = await db.query(recipientsQuery, [campaignId]);

    return {
      ...campaign,
      recipients: recipientsResult.rows,
    };
  }

  /**
   * Get campaign analytics
   */
  async getCampaignAnalytics(campaignId) {
    const db = getDatabase();

    const query = `
            SELECT 
                COUNT(*) as total_recipients,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as success_count,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failure_count,
                COUNT(CASE WHEN opened_at IS NOT NULL THEN 1 END) as opened_count,
                COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END) as clicked_count
            FROM email_campaign_recipients
            WHERE campaign_id = $1
        `;

    const result = await db.query(query, [campaignId]);
    const stats = result.rows[0];

    return {
      totalRecipients: parseInt(stats.total_recipients),
      successCount: parseInt(stats.success_count),
      failureCount: parseInt(stats.failure_count),
      openedCount: parseInt(stats.opened_count),
      clickedCount: parseInt(stats.clicked_count),
      deliveryRate:
        stats.total_recipients > 0
          ? ((stats.success_count / stats.total_recipients) * 100).toFixed(2)
          : 0,
      openRate:
        stats.success_count > 0 ? ((stats.opened_count / stats.success_count) * 100).toFixed(2) : 0,
      clickRate:
        stats.success_count > 0
          ? ((stats.clicked_count / stats.success_count) * 100).toFixed(2)
          : 0,
    };
  }

  /**
   * Send bulk notification
   */
  async sendBulkNotification(templateKey, recipients, data, _adminId = null) {
    const db = getDatabase();

    try {
      // Start transaction
      await db.query('BEGIN');

      // Get template details
      const templateQuery = `
                SELECT * FROM email_templates 
                WHERE template_key = $1 AND is_active = true
            `;

      const templateResult = await db.query(templateQuery, [templateKey]);
      if (templateResult.rows.length === 0) {
        throw new Error('Email template not found');
      }

      const template = templateResult.rows[0];

      // Update campaign status to sending
      await db.query(
        'UPDATE email_campaigns SET status = $1, sent_at = NOW(), updated_at = NOW() WHERE id = $2',
        ['sending', campaignId]
      );

      // Send emails to recipients
      const sendResults = [];
      let successCount = 0;
      let failureCount = 0;

      for (const recipient of recipients) {
        try {
          // Render template with recipient variables
          const personalizedVariables = {
            name: recipient.name || 'Valued User',
            email: recipient.email,
            ...(data.variables || {}),
          };

          const renderedHtml = this.renderTemplate(template.html_template, personalizedVariables);

          // Send email
          const mailOptions = {
            from: `${process.env.EMAIL_FROM_NAME || 'MockMate'} <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to: recipient.email,
            subject: template.subject,
            html: renderedHtml,
          };

          console.log(`📤 Sending email to ${recipient.email} from ${mailOptions.from}`);
          console.log('📧 Mail options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            htmlLength: mailOptions.html?.length || 0,
          });

          const info = await this.transporter.sendMail(mailOptions);

          console.log('✅ Email accepted by server:', {
            messageId: info.messageId,
            response: info.response,
            accepted: info.accepted,
            rejected: info.rejected,
          });

          // Log successful send
          await db.query(
            `
                        INSERT INTO email_campaign_recipients (
                            campaign_id, user_id, email, status, 
                            sent_at, message_id, created_at
                        ) VALUES ($1, $2, $3, $4, NOW(), $5, NOW())
                    `,
            [campaignId, recipient.id || null, recipient.email, 'sent', info.messageId]
          );

          successCount++;
          sendResults.push({
            email: recipient.email,
            status: 'sent',
            messageId: info.messageId,
          });
        } catch (error) {
          logger.error(`Failed to send email to ${recipient.email}:`, error);

          // Log failed send
          await db.query(
            `
                        INSERT INTO email_campaign_recipients (
                            campaign_id, user_id, email, status, 
                            error_message, created_at
                        ) VALUES ($1, $2, $3, $4, $5, NOW())
                    `,
            [campaignId, recipient.id || null, recipient.email, 'failed', error.message]
          );

          failureCount++;
          sendResults.push({
            email: recipient.email,
            status: 'failed',
            error: error.message,
          });
        }

        // Add small delay to prevent overwhelming the email service
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Update campaign with final results
      const finalStatus = failureCount > 0 ? 'partial_success' : 'sent';
      await db.query(
        `
                UPDATE email_campaigns SET 
                    status = $1, 
                    total_recipients = $2, 
                    success_count = $3, 
                    failure_count = $4,
                    updated_at = NOW()
                WHERE id = $5
            `,
        [finalStatus, recipients.length, successCount, failureCount, campaignId]
      );

      // Commit transaction
      await db.query('COMMIT');

      return {
        campaignId,
        totalRecipients: recipients.length,
        successCount,
        failureCount,
        results: sendResults,
      };
    } catch (error) {
      // Rollback transaction
      await db.query('ROLLBACK');

      // Update campaign status to failed
      await db.query(
        'UPDATE email_campaigns SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
        ['failed', error.message, campaignId]
      );

      throw error;
    }
  }
}

export default EmailNotificationService;
