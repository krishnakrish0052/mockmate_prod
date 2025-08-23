const { getDatabase } = require('../config/database');
const _bcrypt = require('bcryptjs');
const DynamicConfigService = require('../services/DynamicConfigService');

class User {
  constructor(data = {}) {
    this.id = data.id;
    this.email = data.email;
    this.google_id = data.google_id;
    this.name = data.name;
    this.avatar_url = data.avatar_url;
    this.credits = data.credits || 0;
    this.is_verified = data.is_verified || false;
    this.last_login = data.last_login;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new user
  static async create(userData) {
    const db = getDatabase();
    const { email, google_id, name, avatar_url } = userData;

    // Get starting credits from dynamic configuration
    let credits = 0;
    try {
      const dynamicConfig = new DynamicConfigService(db);
      credits = await dynamicConfig.get('new_user_starting_credits', 0);
    } catch (error) {
      console.warn('Failed to get starting credits from config, using default 0:', error);
    }

    // Override with userData.credits if explicitly provided
    if (userData.credits !== undefined) {
      credits = userData.credits;
    }

    const query = `
      INSERT INTO users (email, google_id, name, avatar_url, credits)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await db.query(query, [email, google_id, name, avatar_url, credits]);
    return new User(result.rows[0]);
  }

  // Find user by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new User(result.rows[0]);
  }

  // Find user by email
  static async findByEmail(email) {
    const db = getDatabase();
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await db.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return new User(result.rows[0]);
  }

  // Find user by Google ID
  static async findByGoogleId(googleId) {
    const db = getDatabase();
    const query = 'SELECT * FROM users WHERE google_id = $1';
    const result = await db.query(query, [googleId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new User(result.rows[0]);
  }

  // Update user data
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic query based on provided fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(this.id);

    const query = `
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    // Update current instance
    Object.assign(this, result.rows[0]);
    return this;
  }

  // Update last login
  async updateLastLogin() {
    const db = getDatabase();
    const query = `
      UPDATE users 
      SET last_login = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING last_login
    `;

    const result = await db.query(query, [this.id]);
    this.last_login = result.rows[0].last_login;
    return this;
  }

  // Deduct credits
  async deductCredits(amount = 1) {
    const db = getDatabase();

    if (this.credits < amount) {
      throw new Error('Insufficient credits');
    }

    const query = `
      UPDATE users 
      SET credits = credits - $1, updated_at = NOW()
      WHERE id = $2 AND credits >= $1
      RETURNING credits
    `;

    const result = await db.query(query, [amount, this.id]);

    if (result.rows.length === 0) {
      throw new Error('Failed to deduct credits - insufficient balance');
    }

    this.credits = result.rows[0].credits;
    return this.credits;
  }

  // Add credits
  async addCredits(amount) {
    const db = getDatabase();

    const query = `
      UPDATE users 
      SET credits = credits + $1, updated_at = NOW()
      WHERE id = $2
      RETURNING credits
    `;

    const result = await db.query(query, [amount, this.id]);
    this.credits = result.rows[0].credits;
    return this.credits;
  }

  // Get user's sessions
  async getSessions(limit = 10, offset = 0) {
    const db = getDatabase();
    const query = `
      SELECT * FROM sessions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [this.id, limit, offset]);
    return result.rows;
  }

  // Get user's credit transactions
  async getCreditTransactions(limit = 20, offset = 0) {
    const db = getDatabase();
    const query = `
      SELECT ct.*, s.session_name
      FROM credit_transactions ct
      LEFT JOIN sessions s ON ct.session_id = s.id
      WHERE ct.user_id = $1 
      ORDER BY ct.created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [this.id, limit, offset]);
    return result.rows;
  }

  // Get user's payment history
  async getPaymentHistory(limit = 20, offset = 0) {
    const db = getDatabase();
    const query = `
      SELECT * FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [this.id, limit, offset]);
    return result.rows;
  }

  // Delete user (soft delete by deactivating)
  async delete() {
    const db = getDatabase();
    const query = `
      UPDATE users 
      SET is_verified = false, updated_at = NOW()
      WHERE id = $1
    `;

    await db.query(query, [this.id]);
    this.is_verified = false;
    return this;
  }

  // Get user statistics
  async getStats() {
    const db = getDatabase();
    const query = `
      SELECT 
        COUNT(s.id) as total_sessions,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed_sessions,
        COALESCE(SUM(s.total_duration_minutes), 0) as total_interview_minutes,
        COUNT(ur.id) as total_resumes
      FROM users u
      LEFT JOIN sessions s ON u.id = s.user_id
      LEFT JOIN user_resumes ur ON u.id = ur.user_id AND ur.is_active = true
      WHERE u.id = $1
      GROUP BY u.id
    `;

    const result = await db.query(query, [this.id]);

    if (result.rows.length === 0) {
      return {
        total_sessions: 0,
        completed_sessions: 0,
        total_interview_minutes: 0,
        total_resumes: 0,
      };
    }

    return result.rows[0];
  }

  // Convert to safe JSON (remove sensitive data)
  toJSON() {
    const { ...safeData } = this;
    return safeData;
  }

  // Get public profile data
  getPublicProfile() {
    return {
      id: this.id,
      name: this.name,
      avatar_url: this.avatar_url,
      credits: this.credits,
      is_verified: this.is_verified,
      created_at: this.created_at,
    };
  }
}

module.exports = User;
