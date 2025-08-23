import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

class PaymentAnalytics {
  constructor(data = {}) {
    this.id = data.id;
    this.config_id = data.config_id;
    this.transaction_id = data.transaction_id;
    this.provider_name = data.provider_name;
    this.amount = data.amount;
    this.currency = data.currency;
    this.status = data.status;
    this.response_time = data.response_time;
    this.error_code = data.error_code;
    this.error_message = data.error_message;
    this.created_at = data.created_at;
    this.metadata = data.metadata;
  }

  // Record a payment transaction for analytics
  static async recordTransaction(data) {
    const db = getDatabase();
    const {
      config_id,
      transaction_id,
      provider_name,
      amount,
      currency = 'USD',
      status,
      response_time,
      error_code = null,
      error_message = null,
      metadata = {},
    } = data;

    const query = `
      INSERT INTO payment_analytics (
        config_id, transaction_id, provider_name, amount, currency,
        status, response_time, error_code, error_message, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        config_id,
        transaction_id,
        provider_name,
        amount,
        currency,
        status,
        response_time,
        error_code,
        error_message,
        JSON.stringify(metadata),
      ]);

      return new PaymentAnalytics(result.rows[0]);
    } catch (error) {
      logger.error('Error recording payment analytics:', error);
      throw error;
    }
  }

  // Get analytics data with filters
  static async getAnalytics(filters = {}, limit = 100, offset = 0) {
    const db = getDatabase();
    let query = `SELECT * FROM payment_analytics`;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.config_id) {
      conditions.push(`config_id = $${paramIndex++}`);
      params.push(filters.config_id);
    }

    if (filters.provider_name) {
      conditions.push(`provider_name = $${paramIndex++}`);
      params.push(filters.provider_name);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows.map(row => new PaymentAnalytics(row));
  }

  // Get success rate statistics
  static async getSuccessRateStats(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT 
        provider_name,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_transactions,
        ROUND(
          (COUNT(CASE WHEN status = 'success' THEN 1 END)::float / COUNT(*)::float) * 100, 
          2
        ) as success_rate,
        AVG(response_time) as avg_response_time
      FROM payment_analytics
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY provider_name ORDER BY success_rate DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get transaction volume over time
  static async getVolumeOverTime(period = 'day', filters = {}) {
    const db = getDatabase();

    // Determine the date_trunc period and format
    let dateTruncPeriod;
    switch (period) {
      case 'hour':
        dateTruncPeriod = 'hour';
        break;
      case 'day':
        dateTruncPeriod = 'day';
        break;
      case 'week':
        dateTruncPeriod = 'week';
        break;
      case 'month':
        dateTruncPeriod = 'month';
        break;
      default:
        dateTruncPeriod = 'day';
    }

    let query = `
      SELECT 
        DATE_TRUNC('${dateTruncPeriod}', created_at) as period,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        AVG(amount) as avg_amount,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM payment_analytics
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.provider_name) {
      conditions.push(`provider_name = $${paramIndex++}`);
      params.push(filters.provider_name);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY DATE_TRUNC('${dateTruncPeriod}', created_at) ORDER BY period DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get error analysis
  static async getErrorAnalysis(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT 
        error_code,
        error_message,
        COUNT(*) as error_count,
        provider_name,
        ROUND(
          (COUNT(*)::float / (
            SELECT COUNT(*)::float 
            FROM payment_analytics 
            WHERE status = 'failed'
          )) * 100, 2
        ) as error_percentage
      FROM payment_analytics
      WHERE status = 'failed' AND error_code IS NOT NULL
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.provider_name) {
      conditions.push(`provider_name = $${paramIndex++}`);
      params.push(filters.provider_name);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY error_code, error_message, provider_name ORDER BY error_count DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // Get performance metrics
  static async getPerformanceMetrics(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT 
        provider_name,
        COUNT(*) as total_transactions,
        AVG(response_time) as avg_response_time,
        MIN(response_time) as min_response_time,
        MAX(response_time) as max_response_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) as median_response_time,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95_response_time,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time) as p99_response_time
      FROM payment_analytics
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.provider_name) {
      conditions.push(`provider_name = $${paramIndex++}`);
      params.push(filters.provider_name);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY provider_name ORDER BY avg_response_time ASC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // Clean up old analytics data
  static async cleanupOldData(daysToKeep = 90) {
    const db = getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const query = `DELETE FROM payment_analytics WHERE created_at < $1`;
    const result = await db.query(query, [cutoffDate]);

    logger.info(
      `Cleaned up ${result.rowCount} old payment analytics records older than ${daysToKeep} days`
    );
    return result.rowCount;
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      metadata:
        typeof this.metadata === 'string' ? JSON.parse(this.metadata || '{}') : this.metadata,
    };
  }
}

export { PaymentAnalytics };
