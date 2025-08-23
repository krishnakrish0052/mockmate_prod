import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

class EmailQueueService extends EventEmitter {
  constructor(emailNotificationService) {
    super();
    this.emailNotificationService = emailNotificationService;
    this.queues = new Map(); // campaignId -> queue array
    this.processing = new Map(); // campaignId -> boolean
    this.workers = new Map(); // campaignId -> worker instance
    this.defaultConcurrency = 3; // Number of concurrent emails per campaign
    this.defaultDelay = 1000; // Delay between emails (ms)
    this.maxRetries = 3;
  }

  /**
   * Add a campaign to the queue for processing
   */
  async queueCampaign(campaignId, options = {}) {
    const {
      concurrency = this.defaultConcurrency,
      delay = this.defaultDelay,
      priority = 'normal',
      retries = this.maxRetries,
    } = options;

    if (this.queues.has(campaignId)) {
      logger.warn(`Campaign ${campaignId} is already queued`);
      return false;
    }

    try {
      // Get campaign details
      const campaign = await this.emailNotificationService.getCampaignDetails(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get recipients
      let recipients = [];
      const recipientData = JSON.parse(campaign.recipient_data);

      switch (campaign.recipient_type) {
        case 'all_users':
          recipients = await this.emailNotificationService.getAllUsers();
          break;
        case 'specific_users':
          recipients = await this.emailNotificationService.getUsersByIds(recipientData.user_ids);
          break;
        case 'email_list':
          recipients = recipientData.emails.map(email => ({ email, name: email }));
          break;
        case 'custom':
          recipients = await this.emailNotificationService.getUsersByEmails(recipientData.emails);
          break;
        default:
          throw new Error('Invalid recipient type');
      }

      if (recipients.length === 0) {
        throw new Error('No recipients found for campaign');
      }

      // Create email jobs
      const jobs = recipients.map((recipient, index) => ({
        id: `${campaignId}_${index}`,
        campaignId,
        recipient,
        attempts: 0,
        maxRetries: retries,
        status: 'pending',
        createdAt: new Date(),
        scheduledAt: new Date(Date.now() + (index * delay) / concurrency), // Stagger emails
      }));

      // Initialize queue for this campaign
      this.queues.set(campaignId, {
        jobs,
        options: { concurrency, delay, priority, retries },
        campaign,
        stats: {
          total: jobs.length,
          pending: jobs.length,
          processing: 0,
          completed: 0,
          failed: 0,
        },
      });

      logger.info(`Campaign ${campaignId} queued with ${jobs.length} recipients`);

      // Emit queue event
      this.emit('campaignQueued', {
        campaignId,
        totalRecipients: jobs.length,
        options,
      });

      return true;
    } catch (error) {
      logger.error(`Failed to queue campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Start processing a campaign queue
   */
  async startProcessing(campaignId) {
    if (!this.queues.has(campaignId)) {
      throw new Error(`Campaign ${campaignId} not found in queue`);
    }

    if (this.processing.get(campaignId)) {
      logger.warn(`Campaign ${campaignId} is already being processed`);
      return false;
    }

    this.processing.set(campaignId, true);
    const queue = this.queues.get(campaignId);
    const { concurrency } = queue.options;

    logger.info(`Starting processing for campaign ${campaignId} with concurrency ${concurrency}`);

    // Start worker processes
    const workers = [];
    for (let i = 0; i < concurrency; i++) {
      const worker = this.createWorker(campaignId, i);
      workers.push(worker);
    }

    this.workers.set(campaignId, workers);

    // Emit processing started event
    this.emit('processingStarted', { campaignId });

    return true;
  }

  /**
   * Create a worker to process email jobs
   */
  createWorker(campaignId, workerId) {
    const worker = async () => {
      const queue = this.queues.get(campaignId);
      if (!queue) return;

      while (this.processing.get(campaignId)) {
        try {
          // Find next pending job
          const job = queue.jobs.find(j => j.status === 'pending' && new Date() >= j.scheduledAt);

          if (!job) {
            // Check if all jobs are complete
            const allComplete = queue.jobs.every(
              j => j.status === 'completed' || j.status === 'failed'
            );

            if (allComplete) {
              await this.completeCampaign(campaignId);
              break;
            }

            // Wait for more jobs
            await this.sleep(1000);
            continue;
          }

          // Process job
          await this.processEmailJob(job, queue);
        } catch (error) {
          logger.error(`Worker ${workerId} error for campaign ${campaignId}:`, error);
          await this.sleep(5000); // Wait before retrying
        }
      }

      logger.info(`Worker ${workerId} finished for campaign ${campaignId}`);
    };

    // Start worker
    worker();
    return worker;
  }

  /**
   * Process a single email job
   */
  async processEmailJob(job, queue) {
    const { campaign } = queue;

    try {
      job.status = 'processing';
      job.processingStartedAt = new Date();
      queue.stats.pending--;
      queue.stats.processing++;

      // Emit job started event
      this.emit('jobStarted', {
        campaignId: job.campaignId,
        jobId: job.id,
        recipient: job.recipient.email,
      });

      // Get email content
      let htmlContent = campaign.custom_html;
      if (campaign.template_id) {
        const template = await this.emailNotificationService.getEmailTemplate(campaign.template_id);
        htmlContent = template.html_template || template.template_content;
      }

      // Render template with recipient variables
      const recipientData = JSON.parse(campaign.recipient_data);
      const personalizedVariables = {
        name: job.recipient.name || 'Valued User',
        email: job.recipient.email,
        ...(recipientData.variables || {}),
      };

      const renderedHtml = this.emailNotificationService.renderTemplate(
        htmlContent,
        personalizedVariables
      );

      // Send email
      const mailOptions = {
        from: `${process.env.EMAIL_FROM_NAME || 'MockMate'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: job.recipient.email,
        subject: campaign.subject,
        html: renderedHtml,
      };

      const info = await this.emailNotificationService.transporter.sendMail(mailOptions);

      // Mark job as completed
      job.status = 'completed';
      job.completedAt = new Date();
      job.messageId = info.messageId;
      queue.stats.processing--;
      queue.stats.completed++;

      // Log to database
      await this.logEmailSend(job.campaignId, job.recipient, 'sent', info.messageId);

      // Emit job completed event
      this.emit('jobCompleted', {
        campaignId: job.campaignId,
        jobId: job.id,
        recipient: job.recipient.email,
        messageId: info.messageId,
      });

      logger.debug(`Email sent to ${job.recipient.email} for campaign ${job.campaignId}`);
    } catch (error) {
      await this.handleJobError(job, queue, error);
    }
  }

  /**
   * Handle job processing errors
   */
  async handleJobError(job, queue, error) {
    job.attempts++;
    job.lastError = error.message;
    job.lastAttemptAt = new Date();

    if (job.attempts >= job.maxRetries) {
      // Mark as failed
      job.status = 'failed';
      queue.stats.processing--;
      queue.stats.failed++;

      // Log to database
      await this.logEmailSend(job.campaignId, job.recipient, 'failed', null, error.message);

      // Emit job failed event
      this.emit('jobFailed', {
        campaignId: job.campaignId,
        jobId: job.id,
        recipient: job.recipient.email,
        error: error.message,
        attempts: job.attempts,
      });

      logger.error(
        `Email failed permanently for ${job.recipient.email} in campaign ${job.campaignId}: ${error.message}`
      );
    } else {
      // Retry later
      job.status = 'pending';
      job.scheduledAt = new Date(Date.now() + job.attempts * 30000); // Exponential backoff
      queue.stats.processing--;
      queue.stats.pending++;

      logger.warn(
        `Email failed for ${job.recipient.email} in campaign ${job.campaignId}, will retry (attempt ${job.attempts}/${job.maxRetries}): ${error.message}`
      );
    }
  }

  /**
   * Log email send to database
   */
  async logEmailSend(campaignId, recipient, status, messageId, errorMessage = null) {
    try {
      const { getDatabase } = await import('../config/database.js');
      const db = getDatabase();

      await db.query(
        `
                INSERT INTO email_campaign_recipients (
                    campaign_id, user_id, email, status, 
                    sent_at, message_id, error_message, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (campaign_id, email) DO UPDATE SET
                    status = $4,
                    sent_at = CASE WHEN $4 = 'sent' THEN NOW() ELSE sent_at END,
                    message_id = COALESCE($6, message_id),
                    error_message = $7
            `,
        [
          campaignId,
          recipient.id || null,
          recipient.email,
          status,
          status === 'sent' ? new Date() : null,
          messageId,
          errorMessage,
        ]
      );
    } catch (error) {
      logger.error(`Failed to log email send for ${recipient.email}:`, error);
    }
  }

  /**
   * Complete campaign processing
   */
  async completeCampaign(campaignId) {
    try {
      this.processing.set(campaignId, false);
      const queue = this.queues.get(campaignId);

      if (!queue) return;

      const { stats } = queue;

      // Update campaign in database
      const { getDatabase } = await import('../config/database.js');
      const db = getDatabase();

      const finalStatus = stats.failed > 0 ? 'partial_success' : 'sent';
      await db.query(
        `
                UPDATE email_campaigns SET 
                    status = $1, 
                    total_recipients = $2, 
                    success_count = $3, 
                    failure_count = $4,
                    sent_at = NOW(),
                    updated_at = NOW()
                WHERE id = $5
            `,
        [finalStatus, stats.total, stats.completed, stats.failed, campaignId]
      );

      // Emit completion event
      this.emit('campaignCompleted', {
        campaignId,
        stats,
        finalStatus,
      });

      // Clean up
      this.queues.delete(campaignId);
      this.workers.delete(campaignId);

      logger.info(
        `Campaign ${campaignId} completed: ${stats.completed} sent, ${stats.failed} failed`
      );
    } catch (error) {
      logger.error(`Failed to complete campaign ${campaignId}:`, error);
    }
  }

  /**
   * Stop processing a campaign
   */
  async stopProcessing(campaignId) {
    if (!this.processing.get(campaignId)) {
      return false;
    }

    this.processing.set(campaignId, false);

    // Update campaign status
    try {
      const { getDatabase } = await import('../config/database.js');
      const db = getDatabase();

      await db.query('UPDATE email_campaigns SET status = $1, updated_at = NOW() WHERE id = $2', [
        'cancelled',
        campaignId,
      ]);

      this.emit('campaignStopped', { campaignId });
      logger.info(`Campaign ${campaignId} processing stopped`);
    } catch (error) {
      logger.error(`Failed to stop campaign ${campaignId}:`, error);
    }

    return true;
  }

  /**
   * Get queue status
   */
  getQueueStatus(campaignId) {
    const queue = this.queues.get(campaignId);
    if (!queue) {
      return null;
    }

    return {
      campaignId,
      isProcessing: this.processing.get(campaignId) || false,
      stats: queue.stats,
      options: queue.options,
      jobs: queue.jobs.length,
    };
  }

  /**
   * Get all queue statuses
   */
  getAllQueueStatuses() {
    const statuses = [];
    for (const [campaignId] of this.queues) {
      statuses.push(this.getQueueStatus(campaignId));
    }
    return statuses;
  }

  /**
   * Utility function to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up finished campaigns
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [campaignId, queue] of this.queues) {
      if (!this.processing.get(campaignId)) {
        const allComplete = queue.jobs.every(
          j => j.status === 'completed' || j.status === 'failed'
        );

        if (allComplete) {
          const oldestJob = Math.min(...queue.jobs.map(j => j.createdAt.getTime()));
          if (now - oldestJob > maxAge) {
            this.queues.delete(campaignId);
            this.workers.delete(campaignId);
            this.processing.delete(campaignId);
            logger.info(`Cleaned up old campaign queue: ${campaignId}`);
          }
        }
      }
    }
  }
}

export default EmailQueueService;
