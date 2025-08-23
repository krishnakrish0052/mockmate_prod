import { logger } from '../config/logger.js';

/**
 * Email Tracking Service
 * Manages email sending history, delivery tracking, opens, clicks, and analytics
 */
class EmailTrackingService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Record email sending attempt
   */
  async recordEmailSent(emailData) {
    try {
      const client = await this.db.connect();

      try {
        const query = `
                    INSERT INTO email_sending_history (
                        message_id, template_id, recipient_email, recipient_name,
                        sender_email, sender_name, subject, template_data,
                        status, sent_at, campaign_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
                    RETURNING *
                `;

        const values = [
          emailData.messageId,
          emailData.templateId || null,
          emailData.recipientEmail,
          emailData.recipientName || null,
          emailData.senderEmail,
          emailData.senderName || 'MockMate',
          emailData.subject,
          JSON.stringify(emailData.templateData || {}),
          'sent',
          emailData.campaignId || null,
        ];

        const result = await client.query(query, values);

        logger.info('Email sending recorded:', {
          historyId: result.rows[0].id,
          messageId: emailData.messageId,
          recipient: emailData.recipientEmail,
        });

        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to record email sent:', {
        error: error.message,
        emailData,
      });
      throw error;
    }
  }

  /**
   * Update email delivery status
   */
  async updateDeliveryStatus(messageId, status, errorMessage = null) {
    try {
      const client = await this.db.connect();

      try {
        const query = `
                    UPDATE email_sending_history 
                    SET 
                        status = $1,
                        error_message = $2,
                        delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
                        bounced_at = CASE WHEN $1 = 'bounced' THEN NOW() ELSE bounced_at END,
                        updated_at = NOW()
                    WHERE message_id = $3
                    RETURNING *
                `;

        const result = await client.query(query, [status, errorMessage, messageId]);

        if (result.rows.length > 0) {
          logger.info('Email delivery status updated:', {
            messageId,
            status,
            historyId: result.rows[0].id,
          });
          return result.rows[0];
        } else {
          logger.warn('Email not found for status update:', { messageId, status });
          return null;
        }
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to update delivery status:', {
        error: error.message,
        messageId,
        status,
      });
      throw error;
    }
  }

  /**
   * Record email open
   */
  async recordEmailOpen(messageId, metadata = {}) {
    try {
      const client = await this.db.connect();

      try {
        // First get the email history ID
        const historyQuery = 'SELECT id FROM email_sending_history WHERE message_id = $1';
        const historyResult = await client.query(historyQuery, [messageId]);

        if (historyResult.rows.length === 0) {
          logger.warn('Email not found for open tracking:', { messageId });
          return null;
        }

        const historyId = historyResult.rows[0].id;

        // Record the open
        const openQuery = `
                    INSERT INTO email_opens (
                        email_history_id, ip_address, user_agent,
                        location_country, location_city
                    ) VALUES ($1, $2, $3, $4, $5)
                    RETURNING *
                `;

        const openResult = await client.query(openQuery, [
          historyId,
          metadata.ipAddress || null,
          metadata.userAgent || null,
          metadata.country || null,
          metadata.city || null,
        ]);

        logger.info('Email open recorded:', {
          messageId,
          historyId,
          openId: openResult.rows[0].id,
        });

        return openResult.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to record email open:', {
        error: error.message,
        messageId,
        metadata,
      });
      throw error;
    }
  }

  /**
   * Record email click
   */
  async recordEmailClick(messageId, clickedUrl, metadata = {}) {
    try {
      const client = await this.db.connect();

      try {
        // First get the email history ID
        const historyQuery = 'SELECT id FROM email_sending_history WHERE message_id = $1';
        const historyResult = await client.query(historyQuery, [messageId]);

        if (historyResult.rows.length === 0) {
          logger.warn('Email not found for click tracking:', { messageId });
          return null;
        }

        const historyId = historyResult.rows[0].id;

        // Record the click
        const clickQuery = `
                    INSERT INTO email_clicks (
                        email_history_id, clicked_url, ip_address, user_agent,
                        location_country, location_city
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `;

        const clickResult = await client.query(clickQuery, [
          historyId,
          clickedUrl,
          metadata.ipAddress || null,
          metadata.userAgent || null,
          metadata.country || null,
          metadata.city || null,
        ]);

        logger.info('Email click recorded:', {
          messageId,
          historyId,
          clickedUrl,
          clickId: clickResult.rows[0].id,
        });

        return clickResult.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to record email click:', {
        error: error.message,
        messageId,
        clickedUrl,
      });
      throw error;
    }
  }

  /**
   * Get email sending history with filters
   */
  async getEmailHistory(filters = {}) {
    try {
      const client = await this.db.connect();

      try {
        let query = `
                    SELECT 
                        h.*,
                        t.template_name,
                        t.template_type,
                        c.name as campaign_name
                    FROM email_sending_history h
                    LEFT JOIN email_templates t ON h.template_id = t.id
                    LEFT JOIN email_campaigns c ON h.campaign_id = c.id
                    WHERE 1=1
                `;

        const params = [];
        let paramCount = 0;

        // Add filters
        if (filters.recipientEmail) {
          paramCount++;
          query += ` AND h.recipient_email ILIKE $${paramCount}`;
          params.push(`%${filters.recipientEmail}%`);
        }

        if (filters.templateId) {
          paramCount++;
          query += ` AND h.template_id = $${paramCount}`;
          params.push(filters.templateId);
        }

        if (filters.status) {
          paramCount++;
          query += ` AND h.status = $${paramCount}`;
          params.push(filters.status);
        }

        if (filters.campaignId) {
          paramCount++;
          query += ` AND h.campaign_id = $${paramCount}`;
          params.push(filters.campaignId);
        }

        if (filters.dateFrom) {
          paramCount++;
          query += ` AND h.sent_at >= $${paramCount}`;
          params.push(filters.dateFrom);
        }

        if (filters.dateTo) {
          paramCount++;
          query += ` AND h.sent_at <= $${paramCount}`;
          params.push(filters.dateTo);
        }

        // Add ordering
        query += ' ORDER BY h.sent_at DESC';

        // Add pagination
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 50;
        const offset = (page - 1) * limit;

        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(limit);

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await client.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM email_sending_history h WHERE 1=1';
        const countParams = [];
        let countParamCount = 0;

        if (filters.recipientEmail) {
          countParamCount++;
          countQuery += ` AND h.recipient_email ILIKE $${countParamCount}`;
          countParams.push(`%${filters.recipientEmail}%`);
        }

        if (filters.templateId) {
          countParamCount++;
          countQuery += ` AND h.template_id = $${countParamCount}`;
          countParams.push(filters.templateId);
        }

        if (filters.status) {
          countParamCount++;
          countQuery += ` AND h.status = $${countParamCount}`;
          countParams.push(filters.status);
        }

        if (filters.campaignId) {
          countParamCount++;
          countQuery += ` AND h.campaign_id = $${countParamCount}`;
          countParams.push(filters.campaignId);
        }

        if (filters.dateFrom) {
          countParamCount++;
          countQuery += ` AND h.sent_at >= $${countParamCount}`;
          countParams.push(filters.dateFrom);
        }

        if (filters.dateTo) {
          countParamCount++;
          countQuery += ` AND h.sent_at <= $${countParamCount}`;
          countParams.push(filters.dateTo);
        }

        const countResult = await client.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        return {
          emails: result.rows,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get email history:', {
        error: error.message,
        filters,
      });
      throw error;
    }
  }

  /**
   * Get email analytics dashboard data
   */
  async getAnalyticsDashboard(dateRange = 30) {
    try {
      const client = await this.db.connect();

      try {
        // Overall statistics
        const overallStatsQuery = `
                    SELECT 
                        COUNT(*) as total_sent,
                        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
                        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
                        COUNT(*) FILTER (WHERE status = 'failed') as failed,
                        SUM(open_count) as total_opens,
                        COUNT(*) FILTER (WHERE open_count > 0) as unique_opens,
                        SUM(click_count) as total_clicks,
                        COUNT(*) FILTER (WHERE click_count > 0) as unique_clicks,
                        ROUND(
                            (COUNT(*) FILTER (WHERE open_count > 0)::decimal / 
                             NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0)) * 100, 2
                        ) as open_rate,
                        ROUND(
                            (COUNT(*) FILTER (WHERE click_count > 0)::decimal / 
                             NULLIF(COUNT(*) FILTER (WHERE open_count > 0), 0)) * 100, 2
                        ) as click_through_rate
                    FROM email_sending_history 
                    WHERE sent_at >= NOW() - INTERVAL '${dateRange} days'
                `;

        const overallStats = await client.query(overallStatsQuery);

        // Daily statistics for the chart
        const dailyStatsQuery = `
                    SELECT * FROM daily_email_stats 
                    WHERE date >= CURRENT_DATE - INTERVAL '${dateRange} days'
                    ORDER BY date ASC
                `;

        const dailyStats = await client.query(dailyStatsQuery);

        // Template performance
        const templateStatsQuery = `
                    SELECT 
                        t.template_name,
                        COUNT(h.id) as sent_count,
                        SUM(h.open_count) as total_opens,
                        SUM(h.click_count) as total_clicks,
                        ROUND(AVG(h.open_count), 2) as avg_opens,
                        ROUND(
                            (COUNT(h.id) FILTER (WHERE h.open_count > 0)::decimal / 
                             NULLIF(COUNT(h.id) FILTER (WHERE h.status = 'delivered'), 0)) * 100, 2
                        ) as open_rate
                    FROM email_templates t
                    LEFT JOIN email_sending_history h ON t.id = h.template_id 
                        AND h.sent_at >= NOW() - INTERVAL '${dateRange} days'
                    WHERE t.is_active = true
                    GROUP BY t.id, t.template_name
                    HAVING COUNT(h.id) > 0
                    ORDER BY sent_count DESC
                    LIMIT 10
                `;

        const templateStats = await client.query(templateStatsQuery);

        // Top recipients
        const topRecipientsQuery = `
                    SELECT 
                        recipient_email,
                        COUNT(*) as email_count,
                        SUM(open_count) as total_opens,
                        SUM(click_count) as total_clicks
                    FROM email_sending_history 
                    WHERE sent_at >= NOW() - INTERVAL '${dateRange} days'
                    GROUP BY recipient_email
                    ORDER BY email_count DESC
                    LIMIT 10
                `;

        const topRecipients = await client.query(topRecipientsQuery);

        return {
          overview: overallStats.rows[0],
          dailyStats: dailyStats.rows,
          templatePerformance: templateStats.rows,
          topRecipients: topRecipients.rows,
          dateRange,
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get analytics dashboard:', {
        error: error.message,
        dateRange,
      });
      throw error;
    }
  }

  /**
   * Get template-specific analytics
   */
  async getTemplateAnalytics(templateId, dateRange = 30) {
    try {
      const client = await this.db.connect();

      try {
        const query = `
                    SELECT 
                        t.template_name,
                        t.template_type,
                        COUNT(h.id) as total_sent,
                        COUNT(h.id) FILTER (WHERE h.status = 'delivered') as delivered,
                        COUNT(h.id) FILTER (WHERE h.status = 'bounced') as bounced,
                        COUNT(h.id) FILTER (WHERE h.status = 'failed') as failed,
                        SUM(h.open_count) as total_opens,
                        COUNT(h.id) FILTER (WHERE h.open_count > 0) as unique_opens,
                        SUM(h.click_count) as total_clicks,
                        COUNT(h.id) FILTER (WHERE h.click_count > 0) as unique_clicks,
                        ROUND(AVG(h.open_count), 2) as avg_opens_per_email,
                        ROUND(AVG(h.click_count), 2) as avg_clicks_per_email,
                        ROUND(
                            (COUNT(h.id) FILTER (WHERE h.open_count > 0)::decimal / 
                             NULLIF(COUNT(h.id) FILTER (WHERE h.status = 'delivered'), 0)) * 100, 2
                        ) as open_rate,
                        ROUND(
                            (COUNT(h.id) FILTER (WHERE h.click_count > 0)::decimal / 
                             NULLIF(COUNT(h.id) FILTER (WHERE h.open_count > 0), 0)) * 100, 2
                        ) as click_through_rate,
                        MIN(h.sent_at) as first_sent,
                        MAX(h.sent_at) as last_sent
                    FROM email_templates t
                    LEFT JOIN email_sending_history h ON t.id = h.template_id 
                        AND h.sent_at >= NOW() - INTERVAL '${dateRange} days'
                    WHERE t.id = $1
                    GROUP BY t.id, t.template_name, t.template_type
                `;

        const result = await client.query(query, [templateId]);

        // Get daily breakdown for this template
        const dailyQuery = `
                    SELECT 
                        DATE(sent_at) as date,
                        COUNT(*) as emails_sent,
                        SUM(open_count) as total_opens,
                        SUM(click_count) as total_clicks
                    FROM email_sending_history 
                    WHERE template_id = $1 
                        AND sent_at >= NOW() - INTERVAL '${dateRange} days'
                    GROUP BY DATE(sent_at)
                    ORDER BY date ASC
                `;

        const dailyResult = await client.query(dailyQuery, [templateId]);

        return {
          template: result.rows[0] || null,
          dailyBreakdown: dailyResult.rows,
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get template analytics:', {
        error: error.message,
        templateId,
        dateRange,
      });
      throw error;
    }
  }

  /**
   * Clean up old email history (for maintenance)
   */
  async cleanupOldHistory(daysToKeep = 365) {
    try {
      const client = await this.db.connect();

      try {
        const query = `
                    DELETE FROM email_sending_history 
                    WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
                `;

        const result = await client.query(query);

        logger.info('Email history cleanup completed:', {
          deletedCount: result.rowCount,
          daysKept: daysToKeep,
        });

        return { deletedCount: result.rowCount };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to cleanup email history:', {
        error: error.message,
        daysToKeep,
      });
      throw error;
    }
  }

  /**
   * Get delivery status for a specific message
   */
  async getMessageStatus(messageId) {
    try {
      const client = await this.db.connect();

      try {
        const query = `
                    SELECT 
                        h.*,
                        t.template_name,
                        COALESCE(
                            (SELECT COUNT(*) FROM email_opens WHERE email_history_id = h.id), 0
                        ) as open_count_detailed,
                        COALESCE(
                            (SELECT COUNT(*) FROM email_clicks WHERE email_history_id = h.id), 0
                        ) as click_count_detailed
                    FROM email_sending_history h
                    LEFT JOIN email_templates t ON h.template_id = t.id
                    WHERE h.message_id = $1
                `;

        const result = await client.query(query, [messageId]);
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get message status:', {
        error: error.message,
        messageId,
      });
      throw error;
    }
  }
}

export default EmailTrackingService;
