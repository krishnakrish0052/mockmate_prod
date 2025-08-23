const { getDatabase } = require('../config/database');
const { logger } = require('../config/logger');

class DatabaseUtils {
  /**
   * Execute a raw SQL query
   */
  static async query(text, params = []) {
    const db = getDatabase();
    try {
      const start = Date.now();
      const res = await db.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      logger.error('Database query error', { text, params, error: error.message });
      throw error;
    }
  }

  /**
   * Execute a transaction with multiple queries
   */
  static async transaction(queries) {
    const db = getDatabase();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const results = [];
      for (const { text, params } of queries) {
        const result = await client.query(text, params);
        results.push(result);
      }

      await client.query('COMMIT');
      logger.debug('Transaction completed successfully', { queryCount: queries.length });

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Transaction failed', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get database connection pool status
   */
  static getPoolStatus() {
    const db = getDatabase();
    return {
      totalCount: db.totalCount,
      idleCount: db.idleCount,
      waitingCount: db.waitingCount,
    };
  }

  /**
   * Get table row counts
   */
  static async getTableStats() {
    const tables = [
      'users',
      'sessions',
      'interview_messages',
      'user_resumes',
      'payments',
      'credit_transactions',
    ];
    const results = {};

    for (const table of tables) {
      try {
        const result = await this.query(`SELECT COUNT(*) as count FROM ${table}`);
        results[table] = parseInt(result.rows[0].count);
      } catch (error) {
        results[table] = 'Error';
      }
    }

    return results;
  }

  /**
   * Search users by email or name
   */
  static async searchUsers(searchTerm, limit = 10) {
    const query = `
      SELECT id, name, email, credits, created_at, last_login
      FROM users 
      WHERE name ILIKE $1 OR email ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.query(query, [`%${searchTerm}%`, limit]);
    return result.rows;
  }

  /**
   * Get active sessions count
   */
  static async getActiveSessionsCount() {
    const result = await this.query(
      "SELECT COUNT(*) as count FROM sessions WHERE status = 'active'"
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Get user activity summary
   */
  static async getUserActivity(userId, days = 30) {
    const query = `
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as sessions_created
      FROM sessions 
      WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date DESC
    `;

    const result = await this.query(query, [userId]);
    return result.rows;
  }

  /**
   * Get system analytics
   */
  static async getSystemAnalytics(days = 7) {
    const queries = [
      {
        name: 'user_registrations',
        query: `
          SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
          FROM users 
          WHERE created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date DESC
        `,
      },
      {
        name: 'session_activity',
        query: `
          SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as count
          FROM sessions 
          WHERE created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date DESC
        `,
      },
      {
        name: 'payment_activity',
        query: `
          SELECT DATE_TRUNC('day', created_at) as date, 
                 COUNT(*) as count,
                 SUM(CASE WHEN status = 'completed' THEN amount_usd ELSE 0 END) as revenue
          FROM payments 
          WHERE created_at >= NOW() - INTERVAL '${days} days'
          GROUP BY DATE_TRUNC('day', created_at)
          ORDER BY date DESC
        `,
      },
    ];

    const results = {};

    for (const { name, query } of queries) {
      try {
        const result = await this.query(query);
        results[name] = result.rows;
      } catch (error) {
        logger.error(`Error getting ${name} analytics`, error);
        results[name] = [];
      }
    }

    return results;
  }

  /**
   * Clean up expired sessions
   */
  static async cleanupExpiredSessions(hoursOld = 24) {
    const query = `
      UPDATE sessions 
      SET status = 'cancelled'
      WHERE status = 'active' 
        AND created_at < NOW() - INTERVAL '${hoursOld} hours'
      RETURNING id
    `;

    const result = await this.query(query);
    logger.info(`Cleaned up ${result.rowCount} expired sessions`);
    return result.rowCount;
  }

  /**
   * Get duplicate users (by email)
   */
  static async getDuplicateUsers() {
    const query = `
      SELECT email, COUNT(*) as count
      FROM users
      GROUP BY email
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;

    const result = await this.query(query);
    return result.rows;
  }

  /**
   * Get users with low credits
   */
  static async getUsersWithLowCredits(threshold = 1) {
    const query = `
      SELECT id, name, email, credits
      FROM users
      WHERE credits <= $1 AND is_verified = true
      ORDER BY credits ASC, created_at DESC
    `;

    const result = await this.query(query, [threshold]);
    return result.rows;
  }

  /**
   * Get popular job titles from sessions
   */
  static async getPopularJobTitles(limit = 10) {
    const query = `
      SELECT job_title, COUNT(*) as session_count
      FROM sessions
      WHERE job_title IS NOT NULL AND job_title != ''
      GROUP BY job_title
      ORDER BY session_count DESC
      LIMIT $1
    `;

    const result = await this.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get popular companies from sessions
   */
  static async getPopularCompanies(limit = 10) {
    const query = `
      SELECT company_name, COUNT(*) as session_count
      FROM sessions
      WHERE company_name IS NOT NULL AND company_name != ''
      GROUP BY company_name
      ORDER BY session_count DESC
      LIMIT $1
    `;

    const result = await this.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get resume upload statistics
   */
  static async getResumeStats() {
    const query = `
      SELECT 
        COUNT(*) as total_resumes,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_resumes,
        COUNT(CASE WHEN parsed_content IS NOT NULL THEN 1 END) as parsed_resumes,
        COUNT(DISTINCT user_id) as users_with_resumes
      FROM user_resumes
    `;

    const result = await this.query(query);
    return result.rows[0];
  }

  /**
   * Full-text search in resume content
   */
  static async searchResumes(searchTerm, limit = 10) {
    const query = `
      SELECT ur.id, ur.file_name, ur.user_id, u.name as user_name,
             ts_rank(to_tsvector('english', ur.parsed_content), plainto_tsquery('english', $1)) as rank
      FROM user_resumes ur
      JOIN users u ON ur.user_id = u.id
      WHERE to_tsvector('english', ur.parsed_content) @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
    `;

    const result = await this.query(query, [searchTerm, limit]);
    return result.rows;
  }

  /**
   * Get health check data
   */
  static async getHealthCheck() {
    try {
      const start = Date.now();

      // Test basic connectivity
      await this.query('SELECT 1 as health_check');

      const queryTime = Date.now() - start;
      const poolStatus = this.getPoolStatus();
      const tableStats = await this.getTableStats();

      return {
        status: 'healthy',
        queryTime,
        poolStatus,
        tableStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Backup user data (for GDPR compliance)
   */
  static async exportUserData(userId) {
    const queries = [
      {
        name: 'user',
        query: 'SELECT * FROM users WHERE id = $1',
        params: [userId],
      },
      {
        name: 'sessions',
        query: 'SELECT * FROM sessions WHERE user_id = $1',
        params: [userId],
      },
      {
        name: 'resumes',
        query: 'SELECT * FROM user_resumes WHERE user_id = $1',
        params: [userId],
      },
      {
        name: 'payments',
        query: 'SELECT * FROM payments WHERE user_id = $1',
        params: [userId],
      },
      {
        name: 'credit_transactions',
        query: 'SELECT * FROM credit_transactions WHERE user_id = $1',
        params: [userId],
      },
    ];

    const exportData = {};

    for (const { name, query, params } of queries) {
      try {
        const result = await this.query(query, params);
        exportData[name] = result.rows;
      } catch (error) {
        logger.error(`Error exporting ${name} data`, error);
        exportData[name] = { error: error.message };
      }
    }

    return exportData;
  }

  /**
   * Delete all user data (for GDPR compliance)
   */
  static async deleteUserData(userId) {
    const client = await getDatabase().connect();

    try {
      await client.query('BEGIN');

      // Delete in reverse order of dependencies
      await client.query(
        'DELETE FROM interview_messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = $1)',
        [userId]
      );
      await client.query('DELETE FROM credit_transactions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM payments WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_resumes WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');

      logger.info(`Successfully deleted all data for user ${userId}`);
      return { success: true, message: 'All user data deleted successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error deleting user data for ${userId}`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = DatabaseUtils;
