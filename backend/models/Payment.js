import { getDatabase } from '../config/database.js';

class Payment {
  constructor(data = {}) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.amount_usd = data.amount_usd;
    this.credits_purchased = data.credits_purchased;
    this.payment_provider = data.payment_provider;
    this.payment_reference = data.payment_reference;
    this.status = data.status || 'pending';
    this.created_at = data.created_at;
    this.completed_at = data.completed_at;
  }

  // Create a new payment record
  static async create(paymentData) {
    const db = getDatabase();
    const {
      user_id,
      amount_usd,
      credits_purchased,
      payment_provider,
      payment_reference,
      status = 'pending',
    } = paymentData;

    const query = `
      INSERT INTO payments (
        user_id, amount_usd, credits_purchased, payment_provider, payment_reference, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await db.query(query, [
      user_id,
      amount_usd,
      credits_purchased,
      payment_provider,
      payment_reference,
      status,
    ]);

    return new Payment(result.rows[0]);
  }

  // Find payment by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM payments WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Payment(result.rows[0]);
  }

  // Find payment by payment reference
  static async findByPaymentReference(reference) {
    const db = getDatabase();
    const query = 'SELECT * FROM payments WHERE payment_reference = $1';
    const result = await db.query(query, [reference]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Payment(result.rows[0]);
  }

  // Get payments by user ID
  static async findByUserId(userId, limit = 20, offset = 0, status = null) {
    const db = getDatabase();
    let query = `
      SELECT * FROM payments 
      WHERE user_id = $1
    `;
    const params = [userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows.map(row => new Payment(row));
  }

  // Update payment status
  async updateStatus(newStatus) {
    const db = getDatabase();
    const updates = { status: newStatus };

    if (newStatus === 'completed') {
      updates.completed_at = new Date();
    }

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      fields.push(`${key} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    values.push(this.id);

    const query = `
      UPDATE payments 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Payment not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  // Complete payment and add credits to user
  async complete() {
    const db = getDatabase();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Update payment status
      await client.query('UPDATE payments SET status = $1, completed_at = NOW() WHERE id = $2', [
        'completed',
        this.id,
      ]);

      // Add credits to user
      await client.query('UPDATE users SET credits = credits + $1 WHERE id = $2', [
        this.credits_purchased,
        this.user_id,
      ]);

      // Create credit transaction record
      await client.query(
        `
        INSERT INTO credit_transactions (
          user_id, transaction_type, credits_amount, cost_usd, 
          payment_method, payment_reference, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          this.user_id,
          'purchase',
          this.credits_purchased,
          this.amount_usd,
          this.payment_provider,
          this.payment_reference,
          `Credit purchase - ${this.credits_purchased} credits`,
        ]
      );

      await client.query('COMMIT');

      this.status = 'completed';
      this.completed_at = new Date();

      return this;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Fail payment
  async fail(_reason = '') {
    const _updateData = {
      status: 'failed',
      // Could add a reason field to the schema if needed
    };

    return await this.updateStatus('failed');
  }

  // Refund payment
  async refund(refundAmount = null) {
    const db = getDatabase();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Update payment status
      await client.query('UPDATE payments SET status = $1 WHERE id = $2', ['refunded', this.id]);

      // Deduct credits from user (if they still have them)
      const userResult = await client.query('SELECT credits FROM users WHERE id = $1', [
        this.user_id,
      ]);

      if (userResult.rows.length > 0) {
        const currentCredits = userResult.rows[0].credits;
        const creditsToDeduct = Math.min(this.credits_purchased, currentCredits);

        await client.query('UPDATE users SET credits = credits - $1 WHERE id = $2', [
          creditsToDeduct,
          this.user_id,
        ]);

        // Create refund transaction record
        await client.query(
          `
          INSERT INTO credit_transactions (
            user_id, transaction_type, credits_amount, cost_usd, 
            payment_method, payment_reference, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            this.user_id,
            'refund',
            -creditsToDeduct,
            -(refundAmount || this.amount_usd),
            this.payment_provider,
            this.payment_reference,
            `Refund - ${creditsToDeduct} credits deducted`,
          ]
        );
      }

      await client.query('COMMIT');

      this.status = 'refunded';
      return this;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Check if payment is pending
  isPending() {
    return this.status === 'pending';
  }

  // Check if payment is completed
  isCompleted() {
    return this.status === 'completed';
  }

  // Check if payment failed
  isFailed() {
    return this.status === 'failed';
  }

  // Check if payment was refunded
  isRefunded() {
    return this.status === 'refunded';
  }

  // Get payment summary
  getSummary() {
    return {
      id: this.id,
      amount_usd: this.amount_usd,
      credits_purchased: this.credits_purchased,
      payment_provider: this.payment_provider,
      status: this.status,
      created_at: this.created_at,
      completed_at: this.completed_at,
    };
  }

  // Convert to JSON
  toJSON() {
    const { ...data } = this;
    // Remove sensitive payment reference for client
    delete data.payment_reference;
    return data;
  }

  // Get full data (for admin/internal use)
  getFullData() {
    const { ...data } = this;
    return data;
  }

  // Static methods for analytics and reporting

  // Get payment statistics for a user
  static async getUserPaymentStats(userId) {
    const db = getDatabase();
    const query = `
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded_payments,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_usd END), 0) as total_spent,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN credits_purchased END), 0) as total_credits_purchased
      FROM payments 
      WHERE user_id = $1
    `;

    const result = await db.query(query, [userId]);
    return (
      result.rows[0] || {
        total_payments: 0,
        successful_payments: 0,
        failed_payments: 0,
        refunded_payments: 0,
        total_spent: 0,
        total_credits_purchased: 0,
      }
    );
  }

  // Get recent payments
  static async getRecentPayments(limit = 10, status = null) {
    const db = getDatabase();
    let query = `
      SELECT p.*, u.name as user_name, u.email as user_email
      FROM payments p
      JOIN users u ON p.user_id = u.id
    `;
    const params = [];

    if (status) {
      query += ` WHERE p.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows.map(row => {
      const payment = new Payment(row);
      payment.user = {
        name: row.user_name,
        email: row.user_email,
      };
      return payment;
    });
  }

  // Get payment statistics by date range
  static async getPaymentStatsByDateRange(startDate, endDate) {
    const db = getDatabase();
    const query = `
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_usd END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN credits_purchased END), 0) as total_credits_sold,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN amount_usd END), 0) as average_transaction_value
      FROM payments 
      WHERE created_at >= $1 AND created_at <= $2
    `;

    const result = await db.query(query, [startDate, endDate]);
    return (
      result.rows[0] || {
        total_payments: 0,
        successful_payments: 0,
        total_revenue: 0,
        total_credits_sold: 0,
        average_transaction_value: 0,
      }
    );
  }

  // Get payment provider statistics
  static async getPaymentProviderStats() {
    const db = getDatabase();
    const query = `
      SELECT 
        payment_provider,
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_payments,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_usd END), 0) as total_revenue
      FROM payments 
      GROUP BY payment_provider
      ORDER BY total_revenue DESC
    `;

    const result = await db.query(query);
    return result.rows;
  }
}

// Credit Transaction class for managing credit-related transactions
class CreditTransaction {
  constructor(data = {}) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.session_id = data.session_id;
    this.transaction_type = data.transaction_type;
    this.credits_amount = data.credits_amount;
    this.cost_usd = data.cost_usd;
    this.payment_method = data.payment_method;
    this.payment_reference = data.payment_reference;
    this.description = data.description;
    this.created_at = data.created_at;
  }

  // Create a new credit transaction
  static async create(transactionData) {
    const db = getDatabase();
    const {
      user_id,
      session_id = null,
      transaction_type,
      credits_amount,
      cost_usd = null,
      payment_method = null,
      payment_reference = null,
      description,
    } = transactionData;

    const query = `
      INSERT INTO credit_transactions (
        user_id, session_id, transaction_type, credits_amount, cost_usd,
        payment_method, payment_reference, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await db.query(query, [
      user_id,
      session_id,
      transaction_type,
      credits_amount,
      cost_usd,
      payment_method,
      payment_reference,
      description,
    ]);

    return new CreditTransaction(result.rows[0]);
  }

  // Get transactions by user ID
  static async findByUserId(userId, limit = 20, offset = 0) {
    const db = getDatabase();
    const query = `
      SELECT ct.*, s.session_name
      FROM credit_transactions ct
      LEFT JOIN sessions s ON ct.session_id = s.id
      WHERE ct.user_id = $1
      ORDER BY ct.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [userId, limit, offset]);
    return result.rows.map(row => {
      const transaction = new CreditTransaction(row);
      if (row.session_name) {
        transaction.session_name = row.session_name;
      }
      return transaction;
    });
  }

  // Record credit usage for a session
  static async recordSessionUsage(userId, sessionId, creditsUsed = 1) {
    return await CreditTransaction.create({
      user_id: userId,
      session_id: sessionId,
      transaction_type: 'usage',
      credits_amount: -creditsUsed,
      description: `Interview session credit usage`,
    });
  }
}

export { Payment, CreditTransaction };
