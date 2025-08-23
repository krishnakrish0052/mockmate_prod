import express from 'express';
import { logger } from '../../config/logger.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';
import EmailNotificationService from '../../services/EmailNotificationService.js';

const router = express.Router();

// Initialize email notification service
let emailNotificationService;

// Initialize service function
const initializeService = () => {
  if (!emailNotificationService) {
    try {
      emailNotificationService = new EmailNotificationService();
    } catch (error) {
      console.error('Failed to initialize EmailNotificationService:', error.message);
      // Return a mock service for basic functionality
      emailNotificationService = {
        getAllUsers: async () => {
          const { getDatabase } = await import('../../config/database.js');
          const db = getDatabase();
          const query = `
                        SELECT id, email, 
                               CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name,
                               is_verified, created_at
                        FROM users 
                        WHERE is_verified = true
                        ORDER BY created_at DESC
                        LIMIT 100
                    `;
          const result = await db.query(query);
          return result.rows;
        },
        getCampaigns: async (filters = {}) => {
          const { getDatabase } = await import('../../config/database.js');
          const db = getDatabase();
          let query = `
                        SELECT * FROM email_campaigns
                        WHERE 1=1
                    `;
          const values = [];
          let paramCount = 1;

          if (filters.status) {
            query += ` AND status = $${paramCount}`;
            values.push(filters.status);
            paramCount++;
          }

          query += ` ORDER BY created_at DESC`;

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
        },
        createEmailCampaign: async (campaignData, createdBy) => {
          const { getDatabase } = await import('../../config/database.js');
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
            JSON.stringify(recipient_data || {}),
            scheduled_at,
            'draft',
            createdBy,
          ];

          const result = await db.query(query, values);
          return result.rows[0];
        },
      };
    }
  }
  return emailNotificationService;
};

/**
 * Get all users for recipient selection
 */
router.get(
  '/users',
  requirePermission(['email_notifications', 'user_management']),
  async (req, res) => {
    try {
      const service = initializeService();
      const { search, page = 1, limit = 50 } = req.query;

      let users;
      if (search) {
        // If search is provided, search by name or email
        const db = service.db || require('../../config/database.js').getDatabase();
        const query = `
                    SELECT id, email, name, is_verified, created_at
                    FROM users 
                    WHERE is_verified = true 
                    AND (name ILIKE $1 OR email ILIKE $1)
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                `;
        const offset = (page - 1) * limit;
        const result = await db.query(query, [`%${search}%`, limit, offset]);
        users = result.rows;
      } else {
        users = await service.getAllUsers();
      }

      res.json({
        success: true,
        data: {
          users: users,
        },
        total: users.length,
      });
    } catch (error) {
      logger.error('Failed to get users:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve users',
        error: error.message,
      });
    }
  }
);

/**
 * Get available email templates
 */
router.get(
  '/templates',
  requirePermission(['email_notifications', 'email_templates']),
  async (req, res) => {
    try {
      const { getDatabase } = await import('../../config/database.js');
      const db = getDatabase();

      const query = `
                SELECT id, template_name, name, subject_template, 
                       description, category_id, is_active, created_at
                FROM email_templates 
                WHERE is_active = true
                ORDER BY category_id, name
            `;

      const result = await db.query(query);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      logger.error('Failed to get email templates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve email templates',
        error: error.message,
      });
    }
  }
);

/**
 * Create new email campaign
 */
router.post('/campaigns', requirePermission(['email_notifications']), async (req, res) => {
  try {
    const service = initializeService();
    const campaignData = req.body;
    const adminId = req.admin.id;

    // Debug: Log the incoming data
    console.log('📧 Campaign creation request:', {
      name: campaignData.name,
      subject: campaignData.subject,
      recipient_type: campaignData.recipient_type,
      recipient_data: campaignData.recipient_data,
      template_id: campaignData.template_id,
      custom_html: campaignData.custom_html ? '[HTML CONTENT]' : null,
    });

    // Validate required fields
    const { name, subject, recipient_type } = campaignData;
    if (!name || !subject || !recipient_type) {
      return res.status(400).json({
        success: false,
        message: 'Campaign name, subject, and recipient type are required',
      });
    }

    // Validate recipient data based on type
    const { recipient_data } = campaignData;

    console.log('🔍 Detailed validation check:', {
      recipient_type: recipient_type,
      recipient_data: recipient_data,
      hasRecipientData: !!recipient_data,
      recipientDataType: typeof recipient_data,
      recipientDataKeys: recipient_data ? Object.keys(recipient_data) : null,
      fullRequestBody: req.body,
    });

    // Validate recipient data based on type
    if (
      recipient_type === 'all_users' ||
      recipient_type === 'all' ||
      recipient_type === 'everyone'
    ) {
      console.log('✅ All users campaign - no recipient data validation needed');
      // Override recipient_type to ensure consistency
      campaignData.recipient_type = 'all_users';
      campaignData.recipient_data = campaignData.recipient_data || {};
    } else if (recipient_type === 'specific_users' || recipient_type === 'specific') {
      // STRICTLY validate specific_users - must have valid user_ids
      if (!recipient_data || !('user_ids' in recipient_data)) {
        console.log('❌ Validation failed: specific_users without recipient_data.user_ids', {
          recipient_type,
          recipient_data,
        });
        return res.status(400).json({
          success: false,
          message:
            'User IDs are required for specific users campaign. Please select users or change to "All Users".',
        });
      }

      if (
        !recipient_data.user_ids ||
        !Array.isArray(recipient_data.user_ids) ||
        recipient_data.user_ids.length === 0
      ) {
        console.log('❌ Validation failed: specific_users with empty/invalid user_ids', {
          recipient_type,
          recipient_data,
        });
        return res.status(400).json({
          success: false,
          message:
            'At least one user must be selected for specific users campaign. Please select users or change to "All Users".',
        });
      }

      console.log('✅ Valid specific_users campaign with', recipient_data.user_ids.length, 'users');
    } else if (recipient_type === 'email_list' || recipient_type === 'custom') {
      if (
        !recipient_data ||
        !recipient_data.emails ||
        !Array.isArray(recipient_data.emails) ||
        recipient_data.emails.length === 0
      ) {
        console.log('❌ Validation failed: email_list/custom without valid emails', {
          recipient_type,
          recipient_data,
        });
        return res.status(400).json({
          success: false,
          message: 'Email list is required for email list campaign',
        });
      }
    } else {
      console.log('📝 Unknown recipient_type, defaulting to all_users:', recipient_type);
      // Default to all_users for unknown types
      campaignData.recipient_type = 'all_users';
      campaignData.recipient_data = {};
    }

    // Handle template_id conversion and validation
    if (campaignData.template_id && typeof campaignData.template_id === 'number') {
      console.log('🔄 Converting numeric template_id to UUID');
      // If template_id is a number, we need to find the actual UUID
      // For now, set template_id to null and require custom_html
      console.log('⚠️ Numeric template_id received, setting to null:', campaignData.template_id);
      campaignData.template_id = null;
    }

    // Map frontend html_content to custom_html for database storage
    if (campaignData.html_content) {
      campaignData.custom_html = campaignData.html_content;
    }

    // Validate email template or custom HTML
    if (!campaignData.template_id && !campaignData.custom_html) {
      // If no template and no custom HTML, create a default HTML
      console.log('📝 No template or custom HTML provided, creating default');
      campaignData.custom_html = `
                    <html>
                        <head>
                            <title>${campaignData.subject}</title>
                        </head>
                        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                                <h1 style="color: #2c3e50;">${campaignData.subject}</h1>
                                <p>Hello {{name}},</p>
                                <p>This is a notification from MockMate.</p>
                                <p>Best regards,<br>The MockMate Team</p>
                            </div>
                        </body>
                    </html>
                `;
    }

    // EMERGENCY FIX: Use first available user ID since email_campaigns.created_by references users.id not admin_users.id
    const { getDatabase } = await import('../../config/database.js');
    const tempDb = getDatabase();
    const userResult = await tempDb.query('SELECT id FROM users LIMIT 1');
    const fallbackUserId = userResult.rows[0]?.id || adminId;

    console.log('🔄 Using fallback user ID for created_by:', fallbackUserId);
    const campaign = await service.createEmailCampaign(campaignData, fallbackUserId);

    res.status(201).json({
      success: true,
      message: 'Email campaign created successfully',
      data: campaign,
    });
  } catch (error) {
    logger.error('Failed to create email campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create email campaign',
      error: error.message,
    });
  }
});

/**
 * Get all campaigns
 */
router.get('/campaigns', requirePermission(['email_notifications']), async (req, res) => {
  try {
    const service = initializeService();
    const { status, page = 1, limit = 20 } = req.query;

    const filters = {
      status,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    };

    const campaigns = await service.getCampaigns(filters);

    res.json({
      success: true,
      data: {
        campaigns: campaigns,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: campaigns.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get campaigns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve campaigns',
      error: error.message,
    });
  }
});

/**
 * Get campaign details
 */
router.get(
  '/campaigns/:campaignId',
  requirePermission(['email_notifications']),
  async (req, res) => {
    try {
      const service = initializeService();
      const { campaignId } = req.params;

      const campaignDetails = await service.getCampaignDetails(campaignId);

      res.json({
        success: true,
        data: {
          ...campaignDetails,
          // Map custom_html to html_content for frontend compatibility
          html_content: campaignDetails.custom_html || campaignDetails.html_content,
          // Parse recipient_data if it's a string
          recipient_data:
            typeof campaignDetails.recipient_data === 'string'
              ? JSON.parse(campaignDetails.recipient_data || '{}')
              : campaignDetails.recipient_data,
        },
      });
    } catch (error) {
      logger.error('Failed to get campaign details:', error);
      res.status(error.message.includes('not found') ? 404 : 500).json({
        success: false,
        message: 'Failed to retrieve campaign details',
        error: error.message,
      });
    }
  }
);

/**
 * Update campaign
 */
router.put(
  '/campaigns/:campaignId',
  requirePermission(['email_notifications']),
  async (req, res) => {
    try {
      const _service = initializeService();
      const { campaignId } = req.params;
      const campaignData = req.body;
      const _adminId = req.admin.id;

      // Get the database
      const { getDatabase } = await import('../../config/database.js');
      const db = getDatabase();

      // Check if campaign exists and can be updated
      const checkQuery = `
                SELECT status, created_by FROM email_campaigns 
                WHERE id = $1
            `;
      const checkResult = await db.query(checkQuery, [campaignId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      const existingCampaign = checkResult.rows[0];

      // In production, don't allow updating sent campaigns
      if (existingCampaign.status === 'sent' && process.env.NODE_ENV === 'production') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update sent campaigns in production',
        });
      }

      // Validate required fields
      const { name, subject, html_content, recipient_type } = campaignData;
      if (!name || !subject || !recipient_type) {
        return res.status(400).json({
          success: false,
          message: 'Campaign name, subject, and recipient type are required',
        });
      }

      // Validate recipient data based on type
      const { recipient_data } = campaignData;

      if (recipient_type === 'specific_users') {
        if (
          !recipient_data ||
          !recipient_data.user_ids ||
          !Array.isArray(recipient_data.user_ids) ||
          recipient_data.user_ids.length === 0
        ) {
          return res.status(400).json({
            success: false,
            message: 'At least one user must be selected for specific users campaign',
          });
        }
      } else if (recipient_type === 'custom_emails') {
        if (
          !recipient_data ||
          !recipient_data.emails ||
          !Array.isArray(recipient_data.emails) ||
          recipient_data.emails.length === 0
        ) {
          return res.status(400).json({
            success: false,
            message: 'At least one email address must be provided for custom email campaign',
          });
        }
      }

      // Update campaign
      const updateQuery = `
                UPDATE email_campaigns SET 
                    name = $1,
                    subject = $2,
                    custom_html = $3,
                    recipient_type = $4,
                    recipient_data = $5,
                    updated_at = NOW()
                WHERE id = $6
                RETURNING *
            `;

      const values = [
        name,
        subject,
        html_content,
        recipient_type,
        JSON.stringify(recipient_data || {}),
        campaignId,
      ];

      const result = await db.query(updateQuery, values);
      const updatedCampaign = result.rows[0];

      res.json({
        success: true,
        message: 'Campaign updated successfully',
        data: {
          ...updatedCampaign,
          html_content: updatedCampaign.custom_html,
          recipient_data:
            typeof updatedCampaign.recipient_data === 'string'
              ? JSON.parse(updatedCampaign.recipient_data || '{}')
              : updatedCampaign.recipient_data,
        },
      });
    } catch (error) {
      logger.error('Failed to update campaign:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update campaign',
        error: error.message,
      });
    }
  }
);

/**
 * Send email campaign
 */
router.post(
  '/campaigns/:campaignId/send',
  requirePermission(['email_notifications']),
  async (req, res) => {
    try {
      const service = initializeService();
      const { campaignId } = req.params;
      const adminId = req.admin.id;

      // EMERGENCY FIX: Use fallback user ID for send as well
      const { getDatabase } = await import('../../config/database.js');
      const tempDb = getDatabase();
      const userResult = await tempDb.query('SELECT id FROM users LIMIT 1');
      const fallbackUserId = userResult.rows[0]?.id || adminId;

      console.log('🚀 Sending campaign with fallback user ID:', fallbackUserId);
      const result = await service.sendBulkEmail(campaignId, fallbackUserId);

      res.json({
        success: true,
        message: `Campaign sent successfully to ${result.totalRecipients} recipients`,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to send campaign:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send campaign',
        error: error.message,
      });
    }
  }
);

/**
 * Get campaign analytics
 */
router.get(
  '/campaigns/:campaignId/analytics',
  requirePermission(['email_notifications', 'analytics']),
  async (req, res) => {
    try {
      const service = initializeService();
      const { campaignId } = req.params;

      const analytics = await service.getCampaignAnalytics(campaignId);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Failed to get campaign analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campaign analytics',
        error: error.message,
      });
    }
  }
);

/**
 * Preview campaign email by template ID (GET)
 */
router.get(
  '/campaigns/preview/:templateId',
  requirePermission(['email_notifications']),
  async (req, res) => {
    try {
      const { templateId } = req.params;
      const { getDatabase } = await import('../../config/database.js');
      const db = getDatabase();

      // Get template
      const templateQuery = `
                SELECT id, template_name, name, subject_template, html_template,
                       description, category_id, is_active, created_at
                FROM email_templates
                WHERE id = $1 AND is_active = true
            `;

      const templateResult = await db.query(templateQuery, [templateId]);

      if (templateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Email template not found',
        });
      }

      const template = templateResult.rows[0];
      let htmlContent = template.html_template;

      // If html_template is empty, try to use a default template
      if (!htmlContent) {
        htmlContent = `
                    <html>
                        <body>
                            <h1>{{subject}}</h1>
                            <p>Hello {{name}},</p>
                            <p>This is a preview of the email template: ${template.name}</p>
                            <p>Description: ${template.description || 'No description available'}</p>
                        </body>
                    </html>
                `;
      }

      // Add default variables for preview
      const previewVariables = {
        name: 'John Doe',
        email: 'john.doe@example.com',
        subject: template.subject_template || 'Email Preview',
      };

      // Simple template rendering (replace {{variable}} with values)
      let renderedHtml = htmlContent;
      for (const [key, value] of Object.entries(previewVariables)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        renderedHtml = renderedHtml.replace(regex, value);
      }

      res.json({
        success: true,
        data: {
          preview: renderedHtml,
          template: template,
          variables: previewVariables,
        },
      });
    } catch (error) {
      console.error('Failed to preview template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to preview template',
        error: error.message,
      });
    }
  }
);

/**
 * Preview campaign email (POST)
 */
router.post('/campaigns/preview', requirePermission(['email_notifications']), async (req, res) => {
  try {
    const service = initializeService();
    const { template_id, custom_html, variables = {} } = req.body;

    let htmlContent;

    if (template_id) {
      const template = await service.getEmailTemplate(template_id);
      htmlContent = template.html_template || template.template_content;
    } else if (custom_html) {
      htmlContent = custom_html;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either template_id or custom_html is required',
      });
    }

    // Add default variables for preview
    const previewVariables = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      ...variables,
    };

    const renderedHtml = service.renderTemplate(htmlContent, previewVariables);

    res.json({
      success: true,
      data: {
        html: renderedHtml,
        variables: previewVariables,
      },
    });
  } catch (error) {
    logger.error('Failed to preview campaign:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview campaign',
      error: error.message,
    });
  }
});

/**
 * Send test email
 */
router.post('/campaigns/test', requirePermission(['email_notifications']), async (req, res) => {
  try {
    const service = initializeService();
    const { template_id, custom_html, test_email, subject, variables = {} } = req.body;

    if (!test_email) {
      return res.status(400).json({
        success: false,
        message: 'Test email address is required',
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(test_email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
      });
    }

    let htmlContent;

    if (template_id) {
      const template = await service.getEmailTemplate(template_id);
      htmlContent = template.html_template || template.template_content;
    } else if (custom_html) {
      htmlContent = custom_html;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either template_id or custom_html is required',
      });
    }

    // Add test variables
    const testVariables = {
      name: 'Test User',
      email: test_email,
      ...variables,
    };

    const renderedHtml = service.renderTemplate(htmlContent, testVariables);

    // Send test email
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'MockMate'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: test_email,
      subject: `[TEST] ${subject || 'Test Email'}`,
      html: renderedHtml,
    };

    const info = await service.transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: `Test email sent successfully to ${test_email}`,
      data: {
        messageId: info.messageId,
      },
    });
  } catch (error) {
    logger.error('Failed to send test email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
    });
  }
});

/**
 * Get email notification statistics
 */
router.get('/stats', requirePermission(['email_notifications', 'analytics']), async (req, res) => {
  try {
    const { getDatabase } = await import('../../config/database.js');
    const db = getDatabase();

    // Get campaign statistics
    const campaignStatsQuery = `
                SELECT 
                    COUNT(*) as total_campaigns,
                    COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_campaigns,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_campaigns,
                    COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_campaigns,
                    COALESCE(SUM(total_recipients), 0) as total_emails_sent
                FROM email_campaigns
            `;

    const campaignStats = await db.query(campaignStatsQuery);
    const stats = campaignStats.rows[0];

    // Get recent activity
    const recentActivityQuery = `
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as campaigns_created,
                    COALESCE(SUM(total_recipients), 0) as emails_sent
                FROM email_campaigns
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(created_at)
                ORDER BY date DESC
                LIMIT 30
            `;

    const recentActivity = await db.query(recentActivityQuery);

    // Get template usage
    const templateUsageQuery = `
                SELECT 
                    et.name as template_name,
                    COUNT(ec.id) as usage_count
                FROM email_campaigns ec
                JOIN email_templates et ON ec.template_id = et.id
                GROUP BY et.id, et.name
                ORDER BY usage_count DESC
                LIMIT 10
            `;

    const templateUsage = await db.query(templateUsageQuery);

    res.json({
      success: true,
      data: {
        totalCampaigns: parseInt(stats.total_campaigns),
        successfulCampaigns: parseInt(stats.successful_campaigns),
        failedCampaigns: parseInt(stats.failed_campaigns),
        draftCampaigns: parseInt(stats.draft_campaigns),
        totalEmailsSent: parseInt(stats.total_emails_sent),
        recentActivity: recentActivity.rows,
        templateUsage: templateUsage.rows,
      },
    });
  } catch (error) {
    logger.error('Failed to get email notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve statistics',
      error: error.message,
    });
  }
});

/**
 * Reset campaign status (development only)
 */
router.patch(
  '/campaigns/:campaignId/reset',
  requirePermission(['email_notifications']),
  async (req, res) => {
    try {
      // Only allow in development mode
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          message: 'Campaign reset is only allowed in development mode',
        });
      }

      const { campaignId } = req.params;
      const { getDatabase } = await import('../../config/database.js');
      const db = getDatabase();

      // Check if campaign exists
      const checkResult = await db.query(
        'SELECT id, name, status FROM email_campaigns WHERE id = $1',
        [campaignId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      const campaign = checkResult.rows[0];
      console.log(
        `🔄 Resetting campaign "${campaign.name}" from status "${campaign.status}" to "draft"`
      );

      // Reset campaign status to draft and clear send-related fields
      await db.query(
        `
                UPDATE email_campaigns SET 
                    status = 'draft',
                    sent_at = NULL,
                    total_recipients = NULL,
                    success_count = NULL,
                    failure_count = NULL,
                    error_message = NULL,
                    updated_at = NOW()
                WHERE id = $1
            `,
        [campaignId]
      );

      // Clear any existing recipient records (for clean resend)
      await db.query('DELETE FROM email_campaign_recipients WHERE campaign_id = $1', [campaignId]);

      res.json({
        success: true,
        message: 'Campaign status reset to draft successfully',
        data: {
          campaignId,
          previousStatus: campaign.status,
          newStatus: 'draft',
        },
      });
    } catch (error) {
      logger.error('Failed to reset campaign:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset campaign',
        error: error.message,
      });
    }
  }
);

/**
 * Delete campaign
 */
router.delete(
  '/campaigns/:campaignId',
  requirePermission(['email_notifications']),
  async (req, res) => {
    try {
      const { campaignId } = req.params;
      const { getDatabase } = await import('../../config/database.js');
      const db = getDatabase();

      // EMERGENCY FIX: Use fallback user ID for delete as well
      const userResult = await db.query('SELECT id FROM users LIMIT 1');
      const fallbackUserId = userResult.rows[0]?.id || req.admin.id;

      // Check if campaign exists and is not sent
      const checkQuery = `
                SELECT status FROM email_campaigns 
                WHERE id = $1 AND (created_by = $2 OR created_by = $3)
            `;
      const checkResult = await db.query(checkQuery, [campaignId, req.admin.id, fallbackUserId]);

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // In development mode, allow deletion of sent campaigns for testing
      if (checkResult.rows[0].status === 'sent' && process.env.NODE_ENV === 'production') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete sent campaigns in production',
        });
      }

      // In development, warn but allow deletion
      if (checkResult.rows[0].status === 'sent') {
        console.log('⚠️ Allowing deletion of sent campaign in development mode');
      }

      // Delete campaign
      await db.query('DELETE FROM email_campaigns WHERE id = $1', [campaignId]);

      res.json({
        success: true,
        message: 'Campaign deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete campaign:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete campaign',
        error: error.message,
      });
    }
  }
);

export default router;
