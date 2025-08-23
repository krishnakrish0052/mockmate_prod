const { getDatabase } = require('../config/database');
const { v4: _uuidv4 } = require('uuid');

class Session {
  constructor(data = {}) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.session_name = data.session_name;
    this.company_name = data.company_name;
    this.job_title = data.job_title;
    this.job_description = data.job_description;
    this.status = data.status || 'created';
    this.desktop_connected = data.desktop_connected || false;
    this.websocket_connection_id = data.websocket_connection_id;
    this.created_at = data.created_at;
    this.started_at = data.started_at;
    this.ended_at = data.ended_at;
    this.total_duration_minutes = data.total_duration_minutes || 0;
  }

  // Create a new session
  static async create(sessionData) {
    const db = getDatabase();
    const { user_id, session_name, company_name, job_title, job_description } = sessionData;

    const query = `
      INSERT INTO sessions (
        user_id, session_name, company_name, job_title, job_description
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await db.query(query, [
      user_id,
      session_name,
      company_name,
      job_title,
      job_description,
    ]);

    return new Session(result.rows[0]);
  }

  // Find session by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM sessions WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Session(result.rows[0]);
  }

  // Find session by ID with user info
  static async findByIdWithUser(id) {
    const db = getDatabase();
    const query = `
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = $1
    `;
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const sessionData = result.rows[0];
    const session = new Session(sessionData);
    session.user = {
      name: sessionData.user_name,
      email: sessionData.user_email,
    };

    return session;
  }

  // Get sessions by user ID
  static async findByUserId(userId, limit = 10, offset = 0, status = null) {
    const db = getDatabase();
    let query = `
      SELECT * FROM sessions 
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
    return result.rows.map(row => new Session(row));
  }

  // Update session
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

    values.push(this.id);

    const query = `
      UPDATE sessions 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Session not found');
    }

    // Update current instance
    Object.assign(this, result.rows[0]);
    return this;
  }

  // Start session
  async start() {
    const updateData = {
      status: 'active',
      started_at: new Date(),
    };

    return await this.update(updateData);
  }

  // End session
  async end() {
    const endTime = new Date();
    let duration = 0;

    if (this.started_at) {
      duration = Math.round((endTime - new Date(this.started_at)) / (1000 * 60)); // Duration in minutes
    }

    const updateData = {
      status: 'completed',
      ended_at: endTime,
      total_duration_minutes: duration,
    };

    return await this.update(updateData);
  }

  // Connect desktop application
  async connectDesktop(connectionId) {
    const updateData = {
      desktop_connected: true,
      websocket_connection_id: connectionId,
    };

    return await this.update(updateData);
  }

  // Disconnect desktop application
  async disconnectDesktop() {
    const updateData = {
      desktop_connected: false,
      websocket_connection_id: null,
    };

    return await this.update(updateData);
  }

  // Get session messages
  async getMessages(limit = 50, offset = 0) {
    const db = getDatabase();
    const query = `
      SELECT * FROM interview_messages 
      WHERE session_id = $1 
      ORDER BY timestamp ASC 
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [this.id, limit, offset]);
    return result.rows;
  }

  // Add message to session
  async addMessage(messageData) {
    const db = getDatabase();
    const { message_type, content, metadata = {} } = messageData;

    const query = `
      INSERT INTO interview_messages (session_id, message_type, content, metadata)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const result = await db.query(query, [
      this.id,
      message_type,
      content,
      JSON.stringify(metadata),
    ]);
    return result.rows[0];
  }

  // Get session statistics
  async getStats() {
    const db = getDatabase();
    const query = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN message_type IN ('question', 'ai_response') THEN 1 END) as questions_asked,
        COUNT(CASE WHEN message_type IN ('answer', 'user_message') THEN 1 END) as answers_given,
        COUNT(CASE WHEN message_type = 'feedback' THEN 1 END) as feedback_provided
      FROM interview_messages 
      WHERE session_id = $1
    `;

    const result = await db.query(query, [this.id]);
    return (
      result.rows[0] || {
        total_messages: 0,
        questions_asked: 0,
        answers_given: 0,
        feedback_provided: 0,
      }
    );
  }

  // Delete session and all related data
  async delete() {
    const db = getDatabase();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Delete messages first (due to foreign key constraints)
      await client.query('DELETE FROM interview_messages WHERE session_id = $1', [this.id]);

      // Delete session
      await client.query('DELETE FROM sessions WHERE id = $1', [this.id]);

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Check if session can be started
  canStart() {
    return this.status === 'created';
  }

  // Check if session is active
  isActive() {
    return this.status === 'active';
  }

  // Check if session is completed
  isCompleted() {
    return this.status === 'completed';
  }

  // Get formatted duration
  getFormattedDuration() {
    if (!this.total_duration_minutes) {
      return '0m';
    }

    const hours = Math.floor(this.total_duration_minutes / 60);
    const minutes = this.total_duration_minutes % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
  }

  // Export session data for analysis
  async exportData() {
    const messages = await this.getMessages();
    const stats = await this.getStats();

    return {
      session: {
        id: this.id,
        session_name: this.session_name,
        company_name: this.company_name,
        job_title: this.job_title,
        job_description: this.job_description,
        status: this.status,
        created_at: this.created_at,
        started_at: this.started_at,
        ended_at: this.ended_at,
        duration_minutes: this.total_duration_minutes,
      },
      messages: messages,
      statistics: stats,
    };
  }

  // Get session summary
  getSummary() {
    return {
      id: this.id,
      session_name: this.session_name,
      company_name: this.company_name,
      job_title: this.job_title,
      status: this.status,
      desktop_connected: this.desktop_connected,
      created_at: this.created_at,
      started_at: this.started_at,
      ended_at: this.ended_at,
      duration: this.getFormattedDuration(),
    };
  }

  // Convert to JSON
  toJSON() {
    const { ...data } = this;
    return data;
  }
}

module.exports = Session;
