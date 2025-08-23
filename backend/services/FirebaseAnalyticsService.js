import { logger } from '../config/logger.js';

class FirebaseAnalyticsService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Get comprehensive user analytics
   */
  async getUserAnalytics(timeframe = '30 days') {
    try {
      // Total users
      const totalUsersResult = await this.db.query('SELECT COUNT(*) as total_users FROM users');

      // New users in timeframe
      const newUsersResult = await this.db.query(
        `SELECT COUNT(*) as new_users FROM users 
                 WHERE created_at >= NOW() - INTERVAL '${timeframe}'`
      );

      // Active users (logged in within timeframe)
      const activeUsersResult = await this.db.query(
        `SELECT COUNT(DISTINCT user_id) as active_users 
                 FROM user_auth_events 
                 WHERE event_type = 'login_success' 
                 AND created_at >= NOW() - INTERVAL '${timeframe}'`
      );

      // User registration by provider
      const providerStatsResult = await this.db.query(
        `SELECT provider, COUNT(*) as count 
                 FROM users 
                 WHERE created_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY provider 
                 ORDER BY count DESC`
      );

      // User verification stats
      const verificationStatsResult = await this.db.query(
        `SELECT 
                    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
                    COUNT(CASE WHEN is_verified = false THEN 1 END) as unverified_users
                 FROM users`
      );

      // Daily registration trends
      const registrationTrendsResult = await this.db.query(
        `SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as registrations,
                    provider
                 FROM users 
                 WHERE created_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY DATE(created_at), provider
                 ORDER BY date DESC`
      );

      return {
        success: true,
        data: {
          overview: {
            totalUsers: parseInt(totalUsersResult.rows[0].total_users),
            newUsers: parseInt(newUsersResult.rows[0].new_users),
            activeUsers: parseInt(activeUsersResult.rows[0].active_users),
          },
          verification: {
            verified: parseInt(verificationStatsResult.rows[0].verified_users),
            unverified: parseInt(verificationStatsResult.rows[0].unverified_users),
          },
          providers: providerStatsResult.rows.map(row => ({
            provider: row.provider || 'email',
            count: parseInt(row.count),
          })),
          registrationTrends: registrationTrendsResult.rows.map(row => ({
            date: row.date,
            registrations: parseInt(row.registrations),
            provider: row.provider || 'email',
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get user analytics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get authentication events analytics
   */
  async getAuthEventsAnalytics(timeframe = '30 days') {
    try {
      // Login success/failure rates
      const loginStatsResult = await this.db.query(
        `SELECT 
                    event_type,
                    COUNT(*) as count
                 FROM user_auth_events 
                 WHERE event_type IN ('login_success', 'login_failed')
                 AND created_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY event_type`
      );

      // Authentication events by provider
      const providerEventsResult = await this.db.query(
        `SELECT 
                    provider,
                    event_type,
                    COUNT(*) as count
                 FROM user_auth_events 
                 WHERE created_at >= NOW() - INTERVAL '${timeframe}'
                 AND provider IS NOT NULL
                 GROUP BY provider, event_type
                 ORDER BY count DESC`
      );

      // Daily authentication events
      const dailyEventsResult = await this.db.query(
        `SELECT 
                    DATE(created_at) as date,
                    event_type,
                    COUNT(*) as count
                 FROM user_auth_events 
                 WHERE created_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY DATE(created_at), event_type
                 ORDER BY date DESC`
      );

      // Top locations by login events
      const locationStatsResult = await this.db.query(
        `SELECT 
                    ip_address::text,
                    COUNT(*) as login_count,
                    MAX(created_at) as last_login
                 FROM user_auth_events 
                 WHERE event_type = 'login_success'
                 AND created_at >= NOW() - INTERVAL '${timeframe}'
                 AND ip_address IS NOT NULL
                 GROUP BY ip_address
                 ORDER BY login_count DESC
                 LIMIT 10`
      );

      // Suspicious activity events
      const suspiciousActivityResult = await this.db.query(
        `SELECT 
                    event_type,
                    details,
                    ip_address::text,
                    created_at
                 FROM user_auth_events 
                 WHERE event_type = 'suspicious_activity'
                 AND created_at >= NOW() - INTERVAL '${timeframe}'
                 ORDER BY created_at DESC
                 LIMIT 50`
      );

      return {
        success: true,
        data: {
          loginStats: loginStatsResult.rows.reduce((acc, row) => {
            acc[row.event_type] = parseInt(row.count);
            return acc;
          }, {}),
          providerEvents: providerEventsResult.rows.map(row => ({
            provider: row.provider,
            eventType: row.event_type,
            count: parseInt(row.count),
          })),
          dailyEvents: dailyEventsResult.rows.map(row => ({
            date: row.date,
            eventType: row.event_type,
            count: parseInt(row.count),
          })),
          topLocations: locationStatsResult.rows.map(row => ({
            ipAddress: row.ip_address,
            loginCount: parseInt(row.login_count),
            lastLogin: row.last_login,
          })),
          suspiciousActivity: suspiciousActivityResult.rows.map(row => ({
            eventType: row.event_type,
            details: row.details,
            ipAddress: row.ip_address,
            createdAt: row.created_at,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get auth events analytics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get device and session analytics
   */
  async getDeviceSessionAnalytics(timeframe = '30 days') {
    try {
      // Active sessions
      const activeSessionsResult = await this.db.query(
        `SELECT COUNT(*) as active_sessions 
                 FROM user_sessions 
                 WHERE is_active = true AND expires_at > NOW()`
      );

      // Device type distribution
      const deviceTypesResult = await this.db.query(
        `SELECT 
                    device_type,
                    COUNT(*) as count
                 FROM user_devices 
                 WHERE last_used_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY device_type
                 ORDER BY count DESC`
      );

      // Browser distribution
      const browserStatsResult = await this.db.query(
        `SELECT 
                    browser,
                    COUNT(*) as count
                 FROM user_devices 
                 WHERE last_used_at >= NOW() - INTERVAL '${timeframe}'
                 AND browser IS NOT NULL
                 GROUP BY browser
                 ORDER BY count DESC
                 LIMIT 10`
      );

      // Operating system distribution
      const osStatsResult = await this.db.query(
        `SELECT 
                    operating_system,
                    COUNT(*) as count
                 FROM user_devices 
                 WHERE last_used_at >= NOW() - INTERVAL '${timeframe}'
                 AND operating_system IS NOT NULL
                 GROUP BY operating_system
                 ORDER BY count DESC
                 LIMIT 10`
      );

      // Session duration analytics
      const sessionDurationResult = await this.db.query(
        `SELECT 
                    AVG(EXTRACT(EPOCH FROM (ended_at - created_at))/60) as avg_duration_minutes,
                    MIN(EXTRACT(EPOCH FROM (ended_at - created_at))/60) as min_duration_minutes,
                    MAX(EXTRACT(EPOCH FROM (ended_at - created_at))/60) as max_duration_minutes
                 FROM user_sessions 
                 WHERE ended_at IS NOT NULL 
                 AND created_at >= NOW() - INTERVAL '${timeframe}'`
      );

      return {
        success: true,
        data: {
          activeSessions: parseInt(activeSessionsResult.rows[0].active_sessions),
          deviceTypes: deviceTypesResult.rows.map(row => ({
            deviceType: row.device_type || 'unknown',
            count: parseInt(row.count),
          })),
          browsers: browserStatsResult.rows.map(row => ({
            browser: row.browser,
            count: parseInt(row.count),
          })),
          operatingSystems: osStatsResult.rows.map(row => ({
            os: row.operating_system,
            count: parseInt(row.count),
          })),
          sessionDuration: {
            average: parseFloat(sessionDurationResult.rows[0]?.avg_duration_minutes) || 0,
            minimum: parseFloat(sessionDurationResult.rows[0]?.min_duration_minutes) || 0,
            maximum: parseFloat(sessionDurationResult.rows[0]?.max_duration_minutes) || 0,
          },
        },
      };
    } catch (error) {
      logger.error('Failed to get device/session analytics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get security analytics
   */
  async getSecurityAnalytics(timeframe = '30 days') {
    try {
      // Failed login attempts
      const failedLoginsResult = await this.db.query(
        `SELECT COUNT(*) as failed_logins 
                 FROM user_auth_events 
                 WHERE event_type = 'login_failed' 
                 AND created_at >= NOW() - INTERVAL '${timeframe}'`
      );

      // Suspicious activity count
      const suspiciousActivityResult = await this.db.query(
        `SELECT COUNT(*) as suspicious_events 
                 FROM user_auth_events 
                 WHERE event_type = 'suspicious_activity' 
                 AND created_at >= NOW() - INTERVAL '${timeframe}'`
      );

      // Blocked IP addresses (based on multiple failed attempts)
      const suspiciousIPsResult = await this.db.query(
        `SELECT 
                    ip_address::text,
                    COUNT(*) as failed_attempts,
                    MAX(created_at) as last_attempt
                 FROM user_auth_events 
                 WHERE event_type = 'login_failed'
                 AND created_at >= NOW() - INTERVAL '${timeframe}'
                 AND ip_address IS NOT NULL
                 GROUP BY ip_address
                 HAVING COUNT(*) >= 5
                 ORDER BY failed_attempts DESC
                 LIMIT 20`
      );

      // Account security events
      const securityEventsResult = await this.db.query(
        `SELECT 
                    event_type,
                    COUNT(*) as count
                 FROM user_auth_events 
                 WHERE event_type IN (
                     'password_changed', 
                     'email_changed', 
                     'provider_linked', 
                     'provider_unlinked',
                     'account_disabled',
                     'account_enabled'
                 )
                 AND created_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY event_type`
      );

      // Users with multiple failed logins
      const compromisedUsersResult = await this.db.query(
        `SELECT 
                    u.id,
                    u.email,
                    u.name,
                    COUNT(*) as failed_attempts,
                    MAX(uae.created_at) as last_failed_attempt
                 FROM users u
                 JOIN user_auth_events uae ON u.id = uae.user_id
                 WHERE uae.event_type = 'login_failed'
                 AND uae.created_at >= NOW() - INTERVAL '${timeframe}'
                 GROUP BY u.id, u.email, u.name
                 HAVING COUNT(*) >= 5
                 ORDER BY failed_attempts DESC
                 LIMIT 20`
      );

      return {
        success: true,
        data: {
          overview: {
            failedLogins: parseInt(failedLoginsResult.rows[0].failed_logins),
            suspiciousEvents: parseInt(suspiciousActivityResult.rows[0].suspicious_events),
            suspiciousIPs: suspiciousIPsResult.rows.length,
            compromisedUsers: compromisedUsersResult.rows.length,
          },
          suspiciousIPs: suspiciousIPsResult.rows.map(row => ({
            ipAddress: row.ip_address,
            failedAttempts: parseInt(row.failed_attempts),
            lastAttempt: row.last_attempt,
          })),
          securityEvents: securityEventsResult.rows.map(row => ({
            eventType: row.event_type,
            count: parseInt(row.count),
          })),
          compromisedUsers: compromisedUsersResult.rows.map(row => ({
            userId: row.id,
            email: row.email,
            name: row.name,
            failedAttempts: parseInt(row.failed_attempts),
            lastFailedAttempt: row.last_failed_attempt,
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get security analytics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get real-time statistics
   */
  async getRealTimeStats() {
    try {
      // Active sessions in last hour
      const activeSessionsResult = await this.db.query(
        `SELECT COUNT(*) as active_sessions 
                 FROM user_sessions 
                 WHERE last_activity >= NOW() - INTERVAL '1 hour'
                 AND is_active = true`
      );

      // Recent logins (last hour)
      const recentLoginsResult = await this.db.query(
        `SELECT COUNT(*) as recent_logins 
                 FROM user_auth_events 
                 WHERE event_type = 'login_success' 
                 AND created_at >= NOW() - INTERVAL '1 hour'`
      );

      // Recent registrations (last hour)
      const recentRegistrationsResult = await this.db.query(
        `SELECT COUNT(*) as recent_registrations 
                 FROM users 
                 WHERE created_at >= NOW() - INTERVAL '1 hour'`
      );

      // Failed logins in last hour
      const recentFailedLoginsResult = await this.db.query(
        `SELECT COUNT(*) as failed_logins 
                 FROM user_auth_events 
                 WHERE event_type = 'login_failed' 
                 AND created_at >= NOW() - INTERVAL '1 hour'`
      );

      // Recent activity by minute (last hour)
      const activityByMinuteResult = await this.db.query(
        `SELECT 
                    date_trunc('minute', created_at) as minute,
                    event_type,
                    COUNT(*) as count
                 FROM user_auth_events 
                 WHERE created_at >= NOW() - INTERVAL '1 hour'
                 GROUP BY date_trunc('minute', created_at), event_type
                 ORDER BY minute DESC`
      );

      return {
        success: true,
        data: {
          activeSessions: parseInt(activeSessionsResult.rows[0].active_sessions),
          recentLogins: parseInt(recentLoginsResult.rows[0].recent_logins),
          recentRegistrations: parseInt(recentRegistrationsResult.rows[0].recent_registrations),
          recentFailedLogins: parseInt(recentFailedLoginsResult.rows[0].failed_logins),
          activityByMinute: activityByMinuteResult.rows.map(row => ({
            minute: row.minute,
            eventType: row.event_type,
            count: parseInt(row.count),
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to get real-time stats:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get user search and filtering results
   */
  async searchUsers(filters = {}, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      // Build where clause based on filters
      if (filters.email) {
        whereClause += ` AND email ILIKE $${paramIndex}`;
        params.push(`%${filters.email}%`);
        paramIndex++;
      }

      if (filters.name) {
        whereClause += ` AND name ILIKE $${paramIndex}`;
        params.push(`%${filters.name}%`);
        paramIndex++;
      }

      if (filters.provider) {
        whereClause += ` AND provider = $${paramIndex}`;
        params.push(filters.provider);
        paramIndex++;
      }

      if (filters.isVerified !== undefined) {
        whereClause += ` AND is_verified = $${paramIndex}`;
        params.push(filters.isVerified);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        whereClause += ` AND is_active = $${paramIndex}`;
        params.push(filters.isActive);
        paramIndex++;
      }

      if (filters.createdAfter) {
        whereClause += ` AND created_at >= $${paramIndex}`;
        params.push(filters.createdAfter);
        paramIndex++;
      }

      if (filters.createdBefore) {
        whereClause += ` AND created_at <= $${paramIndex}`;
        params.push(filters.createdBefore);
        paramIndex++;
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
      const countResult = await this.db.query(countQuery, params);

      // Get users with pagination
      const usersQuery = `
                SELECT 
                    id,
                    firebase_uid,
                    email,
                    name,
                    first_name,
                    last_name,
                    avatar_url,
                    is_verified,
                    is_active,
                    provider,
                    custom_claims,
                    registration_source,
                    login_count,
                    last_login,
                    created_at,
                    updated_at
                FROM users 
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
      params.push(limit, offset);

      const usersResult = await this.db.query(usersQuery, params);

      return {
        success: true,
        data: {
          users: usersResult.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].total),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
          },
        },
      };
    } catch (error) {
      logger.error('Failed to search users:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get authentication logs
   */
  async getAuthLogs(filters = {}, page = 1, limit = 100) {
    try {
      const offset = (page - 1) * limit;
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (filters.userId) {
        whereClause += ` AND uae.user_id = $${paramIndex}`;
        params.push(filters.userId);
        paramIndex++;
      }

      if (filters.eventType) {
        whereClause += ` AND uae.event_type = $${paramIndex}`;
        params.push(filters.eventType);
        paramIndex++;
      }

      if (filters.provider) {
        whereClause += ` AND uae.provider = $${paramIndex}`;
        params.push(filters.provider);
        paramIndex++;
      }

      if (filters.ipAddress) {
        whereClause += ` AND uae.ip_address = $${paramIndex}`;
        params.push(filters.ipAddress);
        paramIndex++;
      }

      if (filters.dateFrom) {
        whereClause += ` AND uae.created_at >= $${paramIndex}`;
        params.push(filters.dateFrom);
        paramIndex++;
      }

      if (filters.dateTo) {
        whereClause += ` AND uae.created_at <= $${paramIndex}`;
        params.push(filters.dateTo);
        paramIndex++;
      }

      // Get total count
      const countQuery = `
                SELECT COUNT(*) as total 
                FROM user_auth_events uae
                LEFT JOIN users u ON uae.user_id = u.id
                ${whereClause}
            `;
      const countResult = await this.db.query(countQuery, params);

      // Get logs with user information
      const logsQuery = `
                SELECT 
                    uae.id,
                    uae.user_id,
                    uae.event_type,
                    uae.provider,
                    uae.ip_address,
                    uae.user_agent,
                    uae.location_data,
                    uae.device_info,
                    uae.details,
                    uae.created_at,
                    u.email,
                    u.name,
                    u.firebase_uid
                FROM user_auth_events uae
                LEFT JOIN users u ON uae.user_id = u.id
                ${whereClause}
                ORDER BY uae.created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;
      params.push(limit, offset);

      const logsResult = await this.db.query(logsQuery, params);

      return {
        success: true,
        data: {
          logs: logsResult.rows,
          pagination: {
            page,
            limit,
            total: parseInt(countResult.rows[0].total),
            totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
          },
        },
      };
    } catch (error) {
      logger.error('Failed to get auth logs:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Export users data to CSV format
   */
  async exportUsersData(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      // Apply same filters as searchUsers
      if (filters.email) {
        whereClause += ` AND email ILIKE $${paramIndex}`;
        params.push(`%${filters.email}%`);
        paramIndex++;
      }

      if (filters.name) {
        whereClause += ` AND name ILIKE $${paramIndex}`;
        params.push(`%${filters.name}%`);
        paramIndex++;
      }

      if (filters.provider) {
        whereClause += ` AND provider = $${paramIndex}`;
        params.push(filters.provider);
        paramIndex++;
      }

      if (filters.isVerified !== undefined) {
        whereClause += ` AND is_verified = $${paramIndex}`;
        params.push(filters.isVerified);
        paramIndex++;
      }

      if (filters.createdAfter) {
        whereClause += ` AND created_at >= $${paramIndex}`;
        params.push(filters.createdAfter);
        paramIndex++;
      }

      if (filters.createdBefore) {
        whereClause += ` AND created_at <= $${paramIndex}`;
        params.push(filters.createdBefore);
        paramIndex++;
      }

      const query = `
                SELECT 
                    id,
                    firebase_uid,
                    email,
                    name,
                    first_name,
                    last_name,
                    is_verified,
                    is_active,
                    provider,
                    registration_source,
                    login_count,
                    last_login,
                    created_at,
                    updated_at
                FROM users 
                ${whereClause}
                ORDER BY created_at DESC
            `;

      const result = await this.db.query(query, params);

      // Convert to CSV format
      if (result.rows.length === 0) {
        return {
          success: true,
          data: {
            csv: 'No data found for the specified filters',
            count: 0,
          },
        };
      }

      const headers = Object.keys(result.rows[0]).join(',');
      const csvRows = result.rows.map(row =>
        Object.values(row)
          .map(value => (value === null ? '' : `"${String(value).replace(/"/g, '""')}"`))
          .join(',')
      );

      const csv = [headers, ...csvRows].join('\n');

      return {
        success: true,
        data: {
          csv,
          count: result.rows.length,
        },
      };
    } catch (error) {
      logger.error('Failed to export users data:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export default FirebaseAnalyticsService;
