import { getDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

class PaymentProviderRouting {
  constructor(data = {}) {
    this.id = data.id;
    this.name = data.name;
    this.description = data.description;
    this.conditions = data.conditions;
    this.priority = data.priority;
    this.is_active = data.is_active;
    this.config_id = data.config_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
  }

  // Create a new routing rule
  static async create(ruleData) {
    const db = getDatabase();
    const {
      name,
      description = null,
      conditions,
      priority = 0,
      is_active = true,
      config_id,
      created_by,
    } = ruleData;

    const query = `
      INSERT INTO payment_provider_routing (
        name, description, conditions, priority, is_active, config_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await db.query(query, [
      name,
      description,
      JSON.stringify(conditions),
      priority,
      is_active,
      config_id,
      created_by,
    ]);

    return new PaymentProviderRouting(result.rows[0]);
  }

  // Find routing rule by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM payment_provider_routing WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new PaymentProviderRouting(result.rows[0]);
  }

  // Get active routing rules ordered by priority
  static async getActiveRules() {
    const db = getDatabase();
    const query = `
      SELECT ppr.*, pc.provider_name 
      FROM payment_provider_routing ppr
      JOIN payment_configurations pc ON ppr.config_id = pc.id
      WHERE ppr.is_active = true AND pc.is_active = true
      ORDER BY ppr.priority DESC, ppr.created_at ASC
    `;

    const result = await db.query(query);
    return result.rows.map(row => new PaymentProviderRouting(row));
  }

  // Get all routing rules with pagination
  static async findAll(limit = 20, offset = 0, filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT ppr.*, pc.provider_name 
      FROM payment_provider_routing ppr
      JOIN payment_configurations pc ON ppr.config_id = pc.id
    `;
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.is_active !== undefined) {
      conditions.push(`ppr.is_active = $${paramIndex++}`);
      params.push(filters.is_active);
    }

    if (filters.config_id) {
      conditions.push(`ppr.config_id = $${paramIndex++}`);
      params.push(filters.config_id);
    }

    if (filters.provider_name) {
      conditions.push(`pc.provider_name = $${paramIndex++}`);
      params.push(filters.provider_name);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ppr.priority DESC, ppr.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows.map(row => new PaymentProviderRouting(row));
  }

  // Update routing rule
  async update(updates, updatedBy) {
    const db = getDatabase();
    const allowedUpdates = [
      'name',
      'description',
      'conditions',
      'priority',
      'is_active',
      'config_id',
    ];

    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        fields.push(`${key} = $${paramIndex++}`);

        // Handle JSON fields
        if (key === 'conditions') {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push(`updated_at = NOW()`);
    fields.push(`updated_by = $${paramIndex++}`);
    values.push(updatedBy);
    values.push(this.id);

    const query = `
      UPDATE payment_provider_routing 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Payment routing rule not found');
    }

    Object.assign(this, result.rows[0]);
    return this;
  }

  // Delete routing rule
  static async delete(id) {
    const db = getDatabase();
    const query = 'DELETE FROM payment_provider_routing WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);

    return result.rows.length > 0;
  }

  // Evaluate routing conditions against transaction data
  static evaluateConditions(conditions, transactionData) {
    if (!conditions || conditions.length === 0) {
      return true; // No conditions means always match
    }

    const {
      amount,
      currency = 'USD',
      country = 'US',
      userId = null,
      paymentMethod = null,
      riskScore = 0,
    } = transactionData;

    return conditions.every(condition => {
      const { field, operator, value } = condition;

      let fieldValue;
      switch (field) {
        case 'amount':
          fieldValue = parseFloat(amount);
          break;
        case 'currency':
          fieldValue = currency;
          break;
        case 'country':
          fieldValue = country;
          break;
        case 'user_id':
          fieldValue = userId;
          break;
        case 'payment_method':
          fieldValue = paymentMethod;
          break;
        case 'risk_score':
          fieldValue = parseFloat(riskScore);
          break;
        default:
          return false; // Unknown field
      }

      return PaymentProviderRouting.evaluateCondition(fieldValue, operator, value);
    });
  }

  // Evaluate a single condition
  static evaluateCondition(fieldValue, operator, value) {
    switch (operator) {
      case 'eq':
      case '=':
      case '==':
        return fieldValue == value;
      case 'ne':
      case '!=':
        return fieldValue != value;
      case 'gt':
      case '>':
        return parseFloat(fieldValue) > parseFloat(value);
      case 'gte':
      case '>=':
        return parseFloat(fieldValue) >= parseFloat(value);
      case 'lt':
      case '<':
        return parseFloat(fieldValue) < parseFloat(value);
      case 'lte':
      case '<=':
        return parseFloat(fieldValue) <= parseFloat(value);
      case 'in':
        return Array.isArray(value) ? value.includes(fieldValue) : false;
      case 'not_in':
        return Array.isArray(value) ? !value.includes(fieldValue) : true;
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      case 'starts_with':
        return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
      case 'ends_with':
        return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
      case 'regex':
        try {
          const regex = new RegExp(value, 'i');
          return regex.test(String(fieldValue));
        } catch (error) {
          logger.error('Invalid regex in routing condition:', error);
          return false;
        }
      default:
        logger.warn(`Unknown routing condition operator: ${operator}`);
        return false;
    }
  }

  // Find matching routing rules for transaction
  static async findMatchingRules(transactionData) {
    const activeRules = await this.getActiveRules();

    const matchingRules = activeRules.filter(rule => {
      const conditions = JSON.parse(rule.conditions || '[]');
      return this.evaluateConditions(conditions, transactionData);
    });

    // Sort by priority (already sorted from database, but ensure order)
    return matchingRules.sort((a, b) => b.priority - a.priority);
  }

  // Get routing statistics
  static async getRoutingStats(filters = {}) {
    const db = getDatabase();
    let query = `
      SELECT 
        ppr.name,
        pc.provider_name,
        COUNT(pa.id) as transaction_count,
        SUM(pa.amount) as total_amount,
        AVG(pa.response_time) as avg_response_time,
        COUNT(CASE WHEN pa.status = 'success' THEN 1 END) as successful_transactions,
        ROUND(
          (COUNT(CASE WHEN pa.status = 'success' THEN 1 END)::float / COUNT(pa.id)::float) * 100, 
          2
        ) as success_rate
      FROM payment_provider_routing ppr
      JOIN payment_configurations pc ON ppr.config_id = pc.id
      LEFT JOIN payment_analytics pa ON pa.config_id = pc.id
    `;

    const conditions = ['ppr.is_active = true'];
    const params = [];
    let paramIndex = 1;

    if (filters.start_date) {
      conditions.push(`pa.created_at >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`pa.created_at <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY ppr.id, ppr.name, pc.provider_name ORDER BY transaction_count DESC`;

    const result = await db.query(query, params);
    return result.rows;
  }

  // Toggle rule status
  async toggleStatus(isActive, updatedBy) {
    return await this.update({ is_active: isActive }, updatedBy);
  }

  // Update rule priority
  async updatePriority(priority, updatedBy) {
    return await this.update({ priority: parseInt(priority) }, updatedBy);
  }

  // Convert to JSON
  toJSON() {
    return {
      ...this,
      conditions:
        typeof this.conditions === 'string' ? JSON.parse(this.conditions || '[]') : this.conditions,
    };
  }

  // Get full data (for internal use)
  getFullData() {
    return {
      ...this,
      conditions:
        typeof this.conditions === 'string' ? JSON.parse(this.conditions || '[]') : this.conditions,
    };
  }
}

export { PaymentProviderRouting };
