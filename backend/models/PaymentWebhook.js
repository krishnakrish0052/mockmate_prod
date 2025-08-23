import { getDatabase } from '../config/database.js';

class PaymentWebhook {
  constructor(data = {}) {
    this.id = data.id;
    this.config_id = data.config_id;
    this.webhook_type = data.webhook_type;
    this.event_type = data.event_type;
    this.provider_webhook_id = data.provider_webhook_id;
    this.url = data.url;
    this.secret = data.secret;
    this.is_active = data.is_active;
    this.retry_count = data.retry_count;
    this.max_retries = data.max_retries;
    this.last_triggered = data.last_triggered;
    this.last_success = data.last_success;
    this.last_failure = data.last_failure;
    this.failure_reason = data.failure_reason;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new webhook
  static async create(webhookData) {
    const db = getDatabase();
    const {
      config_id,
      webhook_type,
      event_type,
      provider_webhook_id = null,
      url,
      secret = null,
      is_active = true,
      max_retries = 3,
    } = webhookData;

    const query = `
      INSERT INTO payment_webhooks (
        config_id, webhook_type, event_type, provider_webhook_id, url, secret, 
        is_active, max_retries
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await db.query(query, [
      config_id,
      webhook_type,
      event_type,
      provider_webhook_id,
      url,
      secret,
      is_active,
      max_retries,
    ]);

    return new PaymentWebhook(result.rows[0]);
  }

  // Find webhook by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM payment_webhooks WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new PaymentWebhook(result.rows[0]);
  }

  // Find webhooks by configuration ID
  static async findByConfigId(configId, isActive = null) {
    const db = getDatabase();
    let query = 'SELECT * FROM payment_webhooks WHERE config_id = $1';
    const params = [configId];

    if (typeof isActive === 'boolean') {
      query += ' AND is_active = $2';
      params.push(isActive);
    }

    query += ' ORDER BY created_at DESC';
    const result = await db.query(query, params);

    return result.rows.map(row => new PaymentWebhook(row));
  }

  // Find webhook by provider webhook ID
  static async findByProviderWebhookId(providerWebhookId) {
    const db = getDatabase();
    const query = 'SELECT * FROM payment_webhooks WHERE provider_webhook_id = $1';
    const result = await db.query(query, [providerWebhookId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new PaymentWebhook(result.rows[0]);
  }

  // Get all webhooks with pagination
  static async findAll(limit = 20, offset = 0, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT pw.*, pc.provider_name, pc.display_name
      FROM payment_webhooks pw
      JOIN payment_configurations pc ON pw.config_id = pc.id
    `;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.config_id) {
      conditions.push(`pw.config_id = $${paramIndex++}`);
      params.push(filters.config_id);
    }

    if (filters.webhook_type) {
      conditions.push(`pw.webhook_type = $${paramIndex++}`);
      params.push(filters.webhook_type);
    }

    if (filters.is_active !== undefined) {
      conditions.push(`pw.is_active = $${paramIndex++}`);
      params.push(filters.is_active);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY pw.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows.map(row => {
      const webhook = new PaymentWebhook(row);
      webhook.provider_name = row.provider_name;
      webhook.display_name = row.display_name;
      return webhook;
    });
  }

  // Update webhook
  async update(updates) {
    const db = getDatabase();
    const allowedUpdates = [
      'webhook_type',
      'event_type',
      'provider_webhook_id',
      'url',
      'secret',
      'is_active',
      'max_retries',
    ];

    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        fields.push(`${key} = $${paramIndex++}`);
        values.push(updates[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(this.id);

    const query = `
      UPDATE payment_webhooks 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Webhook not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  // Delete webhook
  static async delete(id) {
    const db = getDatabase();
    const query = 'DELETE FROM payment_webhooks WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);

    return result.rows.length > 0;
  }

  // Record webhook trigger attempt
  async recordTrigger(success, failureReason = null) {
    const db = getDatabase();

    if (success) {
      const query = `
        UPDATE payment_webhooks 
        SET last_triggered = NOW(), last_success = NOW(), retry_count = 0
        WHERE id = $1
        RETURNING *
      `;
      const result = await db.query(query, [this.id]);
      Object.assign(this, result.rows[0]);
    } else {
      const query = `
        UPDATE payment_webhooks 
        SET last_triggered = NOW(), last_failure = NOW(), 
            retry_count = retry_count + 1, failure_reason = $2
        WHERE id = $1
        RETURNING *
      `;
      const result = await db.query(query, [this.id, failureReason]);
      Object.assign(this, result.rows[0]);
    }

    return this;
  }

  // Check if webhook needs retry
  needsRetry() {
    return this.retry_count < this.max_retries && this.last_failure && !this.last_success;
  }

  // Reset retry count
  async resetRetries() {
    const db = getDatabase();
    const query = `
      UPDATE payment_webhooks 
      SET retry_count = 0, failure_reason = NULL
      WHERE id = $1
      RETURNING *
    `;
    const result = await db.query(query, [this.id]);
    Object.assign(this, result.rows[0]);
    return this;
  }

  // Get webhooks that need retry
  static async getWebhooksNeedingRetry() {
    const db = getDatabase();
    const query = `
      SELECT * FROM payment_webhooks 
      WHERE is_active = true 
      AND retry_count < max_retries 
      AND last_failure IS NOT NULL
      AND (last_success IS NULL OR last_failure > last_success)
      AND last_triggered < NOW() - INTERVAL '5 minutes'
      ORDER BY last_failure ASC
    `;

    const result = await db.query(query);
    return result.rows.map(row => new PaymentWebhook(row));
  }

  // Get webhook statistics
  static async getWebhookStats(configId = null) {
    const db = getDatabase();
    let query = `
      SELECT 
        COUNT(*) as total_webhooks,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_webhooks,
        COUNT(CASE WHEN last_success IS NOT NULL THEN 1 END) as successful_webhooks,
        COUNT(CASE WHEN last_failure IS NOT NULL THEN 1 END) as failed_webhooks,
        COUNT(CASE WHEN retry_count >= max_retries THEN 1 END) as max_retries_reached
      FROM payment_webhooks
    `;
    const params = [];

    if (configId) {
      query += ' WHERE config_id = $1';
      params.push(configId);
    }

    const result = await db.query(query, params);
    return (
      result.rows[0] || {
        total_webhooks: 0,
        active_webhooks: 0,
        successful_webhooks: 0,
        failed_webhooks: 0,
        max_retries_reached: 0,
      }
    );
  }

  // Convert to JSON (safe for client)
  toJSON() {
    const { secret, ...data } = this;
    return {
      ...data,
      has_secret: !!secret,
    };
  }

  // Get full data (for internal use with sensitive information)
  getFullData() {
    return { ...this };
  }
}

export { PaymentWebhook };
