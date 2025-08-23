import { logger } from '../config/logger.js';
import geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';

class AnalyticsService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Track user activity
   */
  async trackUserActivity(userId, actionType, actionDetails = {}, request = null) {
    try {
      const sessionId = request?.sessionID || request?.session?.id || this.generateSessionId();
      const ipAddress = this.extractIPAddress(request);
      const userAgent = request?.get('User-Agent') || '';
      const referrer = request?.get('Referer') || '';
      const pageUrl = request?.originalUrl || '';

      // Parse browser and device info
      const browserInfo = this.parseBrowserInfo(userAgent);
      const deviceInfo = this.parseDeviceInfo(userAgent);
      const locationInfo = this.parseLocationInfo(ipAddress);

      await this.db.query(
        `
                INSERT INTO user_analytics (
                    user_id, session_id, ip_address, user_agent, page_url, referrer,
                    action_type, action_details, browser_info, device_info, location_info,
                    timestamp, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            `,
        [
          userId,
          sessionId,
          ipAddress,
          userAgent,
          pageUrl,
          referrer,
          actionType,
          JSON.stringify(actionDetails),
          JSON.stringify(browserInfo),
          JSON.stringify(deviceInfo),
          JSON.stringify(locationInfo),
        ]
      );

      // Update daily website analytics
      await this.updateDailyAnalytics(ipAddress, sessionId, userId ? true : false);

      logger.debug('User activity tracked:', {
        userId,
        actionType,
        ipAddress,
        sessionId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to track user activity:', error);
      return false;
    }
  }

  /**
   * Track page visit
   */
  async trackPageVisit(request, userId = null) {
    try {
      await this.trackUserActivity(
        userId,
        'page_visit',
        {
          path: request.path,
          method: request.method,
          query: request.query,
        },
        request
      );

      return true;
    } catch (error) {
      logger.error('Failed to track page visit:', error);
      return false;
    }
  }

  /**
   * Track user registration
   */
  async trackUserRegistration(userId, registrationMethod = 'email', request = null) {
    try {
      await this.trackUserActivity(
        userId,
        'user_registration',
        {
          method: registrationMethod,
          timestamp: new Date().toISOString(),
        },
        request
      );

      return true;
    } catch (error) {
      logger.error('Failed to track user registration:', error);
      return false;
    }
  }

  /**
   * Track user login
   */
  async trackUserLogin(userId, loginMethod = 'email', request = null) {
    try {
      await this.trackUserActivity(
        userId,
        'user_login',
        {
          method: loginMethod,
          timestamp: new Date().toISOString(),
        },
        request
      );

      return true;
    } catch (error) {
      logger.error('Failed to track user login:', error);
      return false;
    }
  }

  /**
   * Track credit purchase
   */
  async trackCreditPurchase(userId, purchaseDetails, request = null) {
    try {
      await this.trackUserActivity(
        userId,
        'credit_purchase',
        {
          amount: purchaseDetails.amount,
          credits: purchaseDetails.credits,
          currency: purchaseDetails.currency,
          transactionId: purchaseDetails.transactionId,
          timestamp: new Date().toISOString(),
        },
        request
      );

      return true;
    } catch (error) {
      logger.error('Failed to track credit purchase:', error);
      return false;
    }
  }

  /**
   * Track interview session
   */
  async trackInterviewSession(userId, sessionDetails, request = null) {
    try {
      await this.trackUserActivity(
        userId,
        'interview_session',
        {
          sessionId: sessionDetails.sessionId,
          type: sessionDetails.type,
          duration: sessionDetails.duration,
          questionsCount: sessionDetails.questionsCount,
          completed: sessionDetails.completed,
          timestamp: new Date().toISOString(),
        },
        request
      );

      return true;
    } catch (error) {
      logger.error('Failed to track interview session:', error);
      return false;
    }
  }

  /**
   * Update daily website analytics
   */
  async updateDailyAnalytics(ipAddress, sessionId, isRegisteredUser = false) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Check if this is a unique visitor for today
      const existingVisit = await this.db.query(
        `
                SELECT COUNT(*) as count FROM user_analytics 
                WHERE DATE(created_at) = $1 AND session_id = $2
            `,
        [today, sessionId]
      );

      const isNewSession = existingVisit.rows[0].count === 1; // First record for this session today

      // Update or insert daily analytics
      await this.db.query(
        `
                INSERT INTO website_analytics (
                    date, total_visits, unique_visitors, page_views, 
                    new_users, returning_users, created_at, updated_at
                ) VALUES ($1, 1, $2, 1, $3, $4, NOW(), NOW())
                ON CONFLICT (date) DO UPDATE SET
                    total_visits = website_analytics.total_visits + 1,
                    unique_visitors = website_analytics.unique_visitors + $2,
                    page_views = website_analytics.page_views + 1,
                    new_users = website_analytics.new_users + $3,
                    returning_users = website_analytics.returning_users + $4,
                    updated_at = NOW()
            `,
        [
          today,
          isNewSession ? 1 : 0,
          isNewSession && isRegisteredUser ? 1 : 0,
          isNewSession && !isRegisteredUser ? 0 : isNewSession ? 1 : 0,
        ]
      );

      return true;
    } catch (error) {
      logger.error('Failed to update daily analytics:', error);
      return false;
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardAnalytics(timeRange = '30 days') {
    try {
      const timeRangeMap = {
        '24 hours': '24 hours',
        '7 days': '7 days',
        '30 days': '30 days',
        '90 days': '90 days',
        '1 year': '365 days',
      };

      const interval = timeRangeMap[timeRange] || '30 days';

      // Get basic metrics
      const [
        totalUsers,
        totalVisits,
        totalPageViews,
        totalCreditPurchases,
        recentRegistrations,
        dailyAnalytics,
        topPages,
        topReferrers,
        browserStats,
        locationStats,
      ] = await Promise.all([
        this.getTotalUsers(),
        this.getTotalVisits(interval),
        this.getTotalPageViews(interval),
        this.getTotalCreditPurchases(interval),
        this.getRecentRegistrations(interval),
        this.getDailyAnalytics(interval),
        this.getTopPages(interval),
        this.getTopReferrers(interval),
        this.getBrowserStats(interval),
        this.getLocationStats(interval),
      ]);

      return {
        overview: {
          totalUsers: totalUsers.count,
          totalVisits: totalVisits.count,
          totalPageViews: totalPageViews.count,
          totalCreditPurchases: totalCreditPurchases.count,
          recentRegistrations: recentRegistrations.count,
        },
        daily: dailyAnalytics,
        topPages,
        topReferrers,
        browserStats,
        locationStats,
        timeRange,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get dashboard analytics:', error);
      throw error;
    }
  }

  /**
   * Get total users count
   */
  async getTotalUsers() {
    const result = await this.db.query('SELECT COUNT(*) as count FROM users');
    return result.rows[0];
  }

  /**
   * Get total visits in time range
   */
  async getTotalVisits(interval) {
    const result = await this.db.query(`
            SELECT COUNT(*) as count 
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
        `);
    return result.rows[0];
  }

  /**
   * Get total page views in time range
   */
  async getTotalPageViews(interval) {
    const result = await this.db.query(`
            SELECT COUNT(*) as count 
            FROM user_analytics 
            WHERE action_type = 'page_visit' 
            AND created_at >= NOW() - INTERVAL '${interval}'
        `);
    return result.rows[0];
  }

  /**
   * Get total credit purchases in time range
   */
  async getTotalCreditPurchases(interval) {
    const result = await this.db.query(`
            SELECT COUNT(*) as count 
            FROM user_analytics 
            WHERE action_type = 'credit_purchase' 
            AND created_at >= NOW() - INTERVAL '${interval}'
        `);
    return result.rows[0];
  }

  /**
   * Get recent registrations count
   */
  async getRecentRegistrations(interval) {
    const result = await this.db.query(`
            SELECT COUNT(*) as count 
            FROM user_analytics 
            WHERE action_type = 'user_registration' 
            AND created_at >= NOW() - INTERVAL '${interval}'
        `);
    return result.rows[0];
  }

  /**
   * Get daily analytics data
   */
  async getDailyAnalytics(interval) {
    const result = await this.db.query(`
            SELECT 
                date,
                total_visits,
                unique_visitors,
                page_views,
                new_users,
                returning_users
            FROM website_analytics 
            WHERE date >= CURRENT_DATE - INTERVAL '${interval}'
            ORDER BY date ASC
        `);
    return result.rows;
  }

  /**
   * Get top pages
   */
  async getTopPages(interval, limit = 10) {
    const result = await this.db.query(
      `
            SELECT 
                page_url,
                COUNT(*) as visits
            FROM user_analytics 
            WHERE action_type = 'page_visit'
            AND created_at >= NOW() - INTERVAL '${interval}'
            AND page_url IS NOT NULL
            GROUP BY page_url
            ORDER BY visits DESC
            LIMIT $1
        `,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get top referrers
   */
  async getTopReferrers(interval, limit = 10) {
    const result = await this.db.query(
      `
            SELECT 
                referrer,
                COUNT(*) as visits
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND referrer IS NOT NULL 
            AND referrer != ''
            GROUP BY referrer
            ORDER BY visits DESC
            LIMIT $1
        `,
      [limit]
    );
    return result.rows;
  }

  /**
   * Get browser statistics
   */
  async getBrowserStats(interval) {
    const result = await this.db.query(`
            SELECT 
                browser_info->>'name' as browser,
                COUNT(*) as count
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND browser_info IS NOT NULL
            GROUP BY browser_info->>'name'
            ORDER BY count DESC
            LIMIT 10
        `);
    return result.rows;
  }

  /**
   * Get location statistics
   */
  async getLocationStats(interval) {
    const result = await this.db.query(`
            SELECT 
                location_info->>'country' as country,
                COUNT(*) as count
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND location_info IS NOT NULL
            GROUP BY location_info->>'country'
            ORDER BY count DESC
            LIMIT 10
        `);
    return result.rows;
  }

  /**
   * Helper methods
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  extractIPAddress(request) {
    if (!request) return null;

    return (
      request.ip ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      (request.headers &&
        (request.headers['x-forwarded-for'] ||
          request.headers['x-real-ip'] ||
          request.headers['x-client-ip'])) ||
      '127.0.0.1'
    );
  }

  parseBrowserInfo(userAgent) {
    if (!userAgent) return {};

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      name: result.browser.name,
      version: result.browser.version,
      engine: result.engine.name,
    };
  }

  parseDeviceInfo(userAgent) {
    if (!userAgent) return {};

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      type: result.device.type || 'desktop',
      vendor: result.device.vendor,
      model: result.device.model,
      os: result.os.name,
      osVersion: result.os.version,
    };
  }

  parseLocationInfo(ipAddress) {
    if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1') {
      return { country: 'Local', city: 'Local', timezone: 'Local' };
    }

    const geo = geoip.lookup(ipAddress);

    if (geo) {
      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone: geo.timezone,
        coordinates: [geo.ll[0], geo.ll[1]],
      };
    }

    return {};
  }

  /**
   * Get device statistics
   */
  async getDeviceStats(interval) {
    const result = await this.db.query(`
            SELECT 
                device_info->>'type' as device_type,
                COUNT(*) as count
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND device_info IS NOT NULL
            GROUP BY device_info->>'type'
            ORDER BY count DESC
            LIMIT 10
        `);
    return result.rows;
  }

  /**
   * Get operating system statistics
   */
  async getOperatingSystemStats(interval) {
    const result = await this.db.query(`
            SELECT 
                device_info->>'os' as os,
                COUNT(*) as count
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND device_info IS NOT NULL
            AND device_info->>'os' IS NOT NULL
            GROUP BY device_info->>'os'
            ORDER BY count DESC
            LIMIT 10
        `);
    return result.rows;
  }

  /**
   * Get city statistics
   */
  async getCityStats(interval) {
    const result = await this.db.query(`
            SELECT 
                location_info->>'city' as city,
                location_info->>'country' as country,
                COUNT(*) as count
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND location_info IS NOT NULL
            AND location_info->>'city' IS NOT NULL
            GROUP BY location_info->>'city', location_info->>'country'
            ORDER BY count DESC
            LIMIT 15
        `);
    return result.rows;
  }

  /**
   * Get user activity breakdown
   */
  async getUserActivityBreakdown(interval) {
    const result = await this.db.query(`
            SELECT 
                action_type,
                COUNT(*) as count
            FROM user_analytics 
            WHERE created_at >= NOW() - INTERVAL '${interval}'
            AND user_id IS NOT NULL
            GROUP BY action_type
            ORDER BY count DESC
        `);
    return result.rows;
  }

  /**
   * Get interview session statistics
   */
  async getInterviewSessionStats(interval) {
    const result = await this.db.query(`
            SELECT 
                action_details->>'type' as session_type,
                COUNT(*) as total_sessions,
                AVG((action_details->>'duration')::int) as avg_duration,
                COUNT(*) FILTER (WHERE (action_details->>'completed')::boolean = true) as completed_sessions
            FROM user_analytics 
            WHERE action_type = 'interview_session'
            AND created_at >= NOW() - INTERVAL '${interval}'
            GROUP BY action_details->>'type'
            ORDER BY total_sessions DESC
        `);
    return result.rows;
  }

  /**
   * Get conversion metrics
   */
  async getConversionMetrics(interval) {
    const [registrations, purchases] = await Promise.all([
      this.db.query(`
                SELECT COUNT(*) as count
                FROM user_analytics 
                WHERE action_type = 'user_registration'
                AND created_at >= NOW() - INTERVAL '${interval}'
            `),
      this.db.query(`
                SELECT COUNT(*) as count
                FROM user_analytics 
                WHERE action_type = 'credit_purchase'
                AND created_at >= NOW() - INTERVAL '${interval}'
            `),
    ]);

    const registrationCount = parseInt(registrations.rows[0].count);
    const purchaseCount = parseInt(purchases.rows[0].count);
    const conversionRate =
      registrationCount > 0 ? ((purchaseCount / registrationCount) * 100).toFixed(2) : 0;

    return {
      registrations: registrationCount,
      purchases: purchaseCount,
      conversionRate: parseFloat(conversionRate),
    };
  }

  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(interval) {
    const result = await this.db.query(`
            SELECT 
                COUNT(*) as total_transactions,
                SUM((action_details->>'amount')::numeric) as total_revenue,
                AVG((action_details->>'amount')::numeric) as avg_transaction_value,
                action_details->>'currency' as currency
            FROM user_analytics 
            WHERE action_type = 'credit_purchase'
            AND created_at >= NOW() - INTERVAL '${interval}'
            AND action_details->>'amount' IS NOT NULL
            GROUP BY action_details->>'currency'
            ORDER BY total_revenue DESC
        `);
    return result.rows;
  }

  /**
   * Get real-time analytics (last 5 minutes)
   */
  async getRealtimeAnalytics() {
    const [activeUsers, recentActions, topPages] = await Promise.all([
      this.db.query(`
                SELECT COUNT(DISTINCT session_id) as count
                FROM user_analytics 
                WHERE created_at >= NOW() - INTERVAL '5 minutes'
            `),
      this.db.query(`
                SELECT action_type, COUNT(*) as count
                FROM user_analytics 
                WHERE created_at >= NOW() - INTERVAL '5 minutes'
                GROUP BY action_type
                ORDER BY count DESC
            `),
      this.db.query(`
                SELECT page_url, COUNT(*) as count
                FROM user_analytics 
                WHERE action_type = 'page_visit'
                AND created_at >= NOW() - INTERVAL '5 minutes'
                AND page_url IS NOT NULL
                GROUP BY page_url
                ORDER BY count DESC
                LIMIT 5
            `),
    ]);

    return {
      activeUsers: activeUsers.rows[0].count,
      recentActions: recentActions.rows,
      topPages: topPages.rows,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate custom report
   */
  async generateCustomReport({ startDate, endDate, metrics, groupBy, filters }) {
    try {
      let baseQuery = `
                SELECT 
                    ${this.buildSelectClause(metrics, groupBy)}
                FROM user_analytics 
                WHERE created_at >= $1 AND created_at <= $2
            `;

      const queryParams = [startDate, endDate];
      let paramIndex = 3;

      // Add filters
      if (filters.actionType) {
        baseQuery += ` AND action_type = $${paramIndex}`;
        queryParams.push(filters.actionType);
        paramIndex++;
      }

      if (filters.userId) {
        baseQuery += ` AND user_id = $${paramIndex}`;
        queryParams.push(filters.userId);
        paramIndex++;
      }

      if (filters.country) {
        baseQuery += ` AND location_info->>'country' = $${paramIndex}`;
        queryParams.push(filters.country);
        paramIndex++;
      }

      // Add grouping
      baseQuery += this.buildGroupByClause(groupBy);
      baseQuery += ` ORDER BY ${this.buildOrderByClause(groupBy)}`;

      const result = await this.db.query(baseQuery, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Failed to generate custom report:', error);
      throw error;
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalyticsData({ format, interval, includeDetails }) {
    try {
      let query = `
                SELECT 
                    created_at,
                    action_type,
                    page_url,
                    referrer,
                    browser_info->>'name' as browser,
                    device_info->>'type' as device_type,
                    location_info->>'country' as country
            `;

      if (includeDetails) {
        query += `, user_id, ip_address, user_agent, action_details, browser_info, device_info, location_info`;
      }

      query += `
                FROM user_analytics 
                WHERE created_at >= NOW() - INTERVAL '${interval}'
                ORDER BY created_at DESC
                LIMIT 10000
            `;

      const result = await this.db.query(query);

      if (format === 'csv') {
        return this.convertToCSV(result.rows);
      } else {
        return JSON.stringify(result.rows, null, 2);
      }
    } catch (error) {
      logger.error('Failed to export analytics data:', error);
      throw error;
    }
  }

  /**
   * Helper method to build SELECT clause for custom reports
   */
  buildSelectClause(metrics, groupBy) {
    const selectParts = [];

    if (groupBy === 'day') {
      selectParts.push('DATE(created_at) as date');
    } else if (groupBy === 'hour') {
      selectParts.push("DATE_TRUNC('hour', created_at) as hour");
    } else if (groupBy === 'week') {
      selectParts.push("DATE_TRUNC('week', created_at) as week");
    }

    if (metrics.includes('page_views')) {
      selectParts.push("COUNT(*) FILTER (WHERE action_type = 'page_visit') as page_views");
    }

    if (metrics.includes('unique_visitors')) {
      selectParts.push('COUNT(DISTINCT session_id) as unique_visitors');
    }

    if (metrics.includes('registrations')) {
      selectParts.push(
        "COUNT(*) FILTER (WHERE action_type = 'user_registration') as registrations"
      );
    }

    if (metrics.includes('purchases')) {
      selectParts.push("COUNT(*) FILTER (WHERE action_type = 'credit_purchase') as purchases");
    }

    return selectParts.join(', ');
  }

  /**
   * Helper method to build GROUP BY clause
   */
  buildGroupByClause(groupBy) {
    if (groupBy === 'day') {
      return ' GROUP BY DATE(created_at)';
    } else if (groupBy === 'hour') {
      return " GROUP BY DATE_TRUNC('hour', created_at)";
    } else if (groupBy === 'week') {
      return " GROUP BY DATE_TRUNC('week', created_at)";
    }
    return '';
  }

  /**
   * Helper method to build ORDER BY clause
   */
  buildOrderByClause(groupBy) {
    if (groupBy === 'day') {
      return 'date ASC';
    } else if (groupBy === 'hour') {
      return 'hour ASC';
    } else if (groupBy === 'week') {
      return 'week ASC';
    }
    return 'created_at DESC';
  }

  /**
   * Helper method to convert data to CSV format
   */
  convertToCSV(data) {
    if (!data || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) {
          return '';
        }
        // Escape quotes and wrap in quotes if contains comma or quote
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Clean up old analytics data
   */
  async cleanupOldData(daysToKeep = 365) {
    try {
      const result = await this.db.query(`
                DELETE FROM user_analytics 
                WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
            `);

      logger.info(`Cleaned up ${result.rowCount} old analytics records`);
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup old analytics data:', error);
      throw error;
    }
  }
}

export default AnalyticsService;
