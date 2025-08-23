import { logger } from '../config/logger.js';

class CustomClaimsAutomationService {
  constructor(database, firebaseAuthService) {
    this.db = database;
    this.firebaseAuth = firebaseAuthService;
    this.rules = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the service and load automation rules
   */
  async initialize() {
    try {
      await this.loadAutomationRules();
      this.initialized = true;
      logger.info('Custom Claims Automation Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Custom Claims Automation Service:', error);
      throw error;
    }
  }

  /**
   * Load automation rules from database
   */
  async loadAutomationRules() {
    try {
      // Create table for automation rules if it doesn't exist
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS custom_claims_rules (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    conditions JSONB NOT NULL,
                    claims JSONB NOT NULL,
                    priority INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT true,
                    trigger_events TEXT[] DEFAULT ARRAY['user_registration', 'user_update', 'subscription_change'],
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_by UUID REFERENCES users(id)
                )
            `);

      // Load existing rules
      const result = await this.db.query(`
                SELECT * FROM custom_claims_rules 
                WHERE is_active = true 
                ORDER BY priority DESC, created_at ASC
            `);

      this.rules.clear();
      result.rows.forEach(rule => {
        this.rules.set(rule.id, {
          id: rule.id,
          name: rule.name,
          description: rule.description,
          conditions: rule.conditions,
          claims: rule.claims,
          priority: rule.priority,
          triggerEvents: rule.trigger_events,
          createdAt: rule.created_at,
          updatedAt: rule.updated_at,
        });
      });

      // If no rules exist, create default ones
      if (this.rules.size === 0) {
        await this.createDefaultRules();
      }

      logger.info('Custom claims automation rules loaded:', {
        totalRules: this.rules.size,
      });
    } catch (error) {
      logger.error('Failed to load automation rules:', error);
      throw error;
    }
  }

  /**
   * Create default automation rules
   */
  async createDefaultRules() {
    const defaultRules = [
      {
        name: 'Premium User Role',
        description: 'Assign premium role to users with premium subscription',
        conditions: {
          subscription_tier: { operator: 'equals', value: 'premium' },
        },
        claims: {
          role: 'premium_user',
          tier: 'premium',
          features: ['advanced_mock_interviews', 'unlimited_sessions', 'priority_support'],
        },
        priority: 100,
        triggerEvents: ['user_registration', 'subscription_change'],
      },
      {
        name: 'Pro User Role',
        description: 'Assign pro role to users with pro subscription',
        conditions: {
          subscription_tier: { operator: 'equals', value: 'pro' },
        },
        claims: {
          role: 'pro_user',
          tier: 'pro',
          features: ['mock_interviews', 'resume_analysis', 'limited_sessions'],
        },
        priority: 80,
        triggerEvents: ['user_registration', 'subscription_change'],
      },
      {
        name: 'Verified User',
        description: 'Add verified status to users with verified email',
        conditions: {
          is_verified: { operator: 'equals', value: true },
        },
        claims: {
          email_verified: true,
          account_status: 'verified',
        },
        priority: 50,
        triggerEvents: ['user_registration', 'email_verification'],
      },
      {
        name: 'Admin Role',
        description: 'Assign admin role based on email domain or explicit admin status',
        conditions: {
          or: [
            { email: { operator: 'endsWith', value: '@mockmate.com' } },
            { is_admin: { operator: 'equals', value: true } },
          ],
        },
        claims: {
          role: 'admin',
          admin: true,
          permissions: ['user_management', 'system_config', 'analytics_access'],
        },
        priority: 200,
        triggerEvents: ['user_registration', 'user_update'],
      },
      {
        name: 'Beta Tester',
        description: 'Assign beta tester features to early users',
        conditions: {
          created_at: { operator: 'before', value: '2024-12-31T23:59:59Z' },
        },
        claims: {
          beta_tester: true,
          features: ['beta_features_access', 'feedback_rewards'],
        },
        priority: 30,
        triggerEvents: ['user_registration'],
      },
      {
        name: 'High Activity User',
        description: 'Reward users with high session count',
        conditions: {
          total_sessions: { operator: 'greaterThan', value: 50 },
        },
        claims: {
          power_user: true,
          rewards: ['bonus_credits', 'exclusive_content'],
        },
        priority: 40,
        triggerEvents: ['session_complete', 'user_update'],
      },
    ];

    for (const rule of defaultRules) {
      await this.createRule(rule);
    }

    logger.info('Default custom claims rules created');
  }

  /**
   * Create a new automation rule
   */
  async createRule(ruleData) {
    try {
      const result = await this.db.query(
        `
                INSERT INTO custom_claims_rules (
                    name, description, conditions, claims, priority, 
                    trigger_events, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING id
            `,
        [
          ruleData.name,
          ruleData.description || '',
          JSON.stringify(ruleData.conditions),
          JSON.stringify(ruleData.claims),
          ruleData.priority || 0,
          ruleData.triggerEvents || ['user_registration', 'user_update'],
          ruleData.createdBy || null,
        ]
      );

      const ruleId = result.rows[0].id;

      // Add to in-memory rules
      this.rules.set(ruleId, {
        id: ruleId,
        ...ruleData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Custom claims rule created:', {
        ruleId,
        name: ruleData.name,
      });

      return ruleId;
    } catch (error) {
      logger.error('Failed to create automation rule:', error);
      throw error;
    }
  }

  /**
   * Update an existing automation rule
   */
  async updateRule(ruleId, updates) {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        setClause.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.conditions) {
        setClause.push(`conditions = $${paramIndex++}`);
        values.push(JSON.stringify(updates.conditions));
      }
      if (updates.claims) {
        setClause.push(`claims = $${paramIndex++}`);
        values.push(JSON.stringify(updates.claims));
      }
      if (updates.priority !== undefined) {
        setClause.push(`priority = $${paramIndex++}`);
        values.push(updates.priority);
      }
      if (updates.triggerEvents) {
        setClause.push(`trigger_events = $${paramIndex++}`);
        values.push(updates.triggerEvents);
      }
      if (updates.isActive !== undefined) {
        setClause.push(`is_active = $${paramIndex++}`);
        values.push(updates.isActive);
      }

      setClause.push(`updated_at = NOW()`);
      values.push(ruleId);

      await this.db.query(
        `
                UPDATE custom_claims_rules 
                SET ${setClause.join(', ')} 
                WHERE id = $${paramIndex}
            `,
        values
      );

      // Update in-memory rule
      if (this.rules.has(ruleId)) {
        const existingRule = this.rules.get(ruleId);
        this.rules.set(ruleId, {
          ...existingRule,
          ...updates,
          updatedAt: new Date(),
        });
      }

      logger.info('Custom claims rule updated:', {
        ruleId,
        updates: Object.keys(updates),
      });
    } catch (error) {
      logger.error('Failed to update automation rule:', error);
      throw error;
    }
  }

  /**
   * Delete an automation rule
   */
  async deleteRule(ruleId) {
    try {
      await this.db.query('DELETE FROM custom_claims_rules WHERE id = $1', [ruleId]);
      this.rules.delete(ruleId);

      logger.info('Custom claims rule deleted:', { ruleId });
    } catch (error) {
      logger.error('Failed to delete automation rule:', error);
      throw error;
    }
  }

  /**
   * Process user for custom claims based on event
   */
  async processUserClaims(userId, eventType = 'user_update', userData = null) {
    try {
      if (!this.initialized) {
        logger.warn('Custom Claims Automation Service not initialized');
        return;
      }

      // Get user data if not provided
      let user = userData;
      if (!user) {
        const result = await this.db.query(
          `
                    SELECT u.*, 
                           COUNT(s.id) as total_sessions,
                           COALESCE(u.subscription_tier, 'free') as subscription_tier
                    FROM users u 
                    LEFT JOIN sessions s ON s.user_id = u.id 
                    WHERE u.id = $1 
                    GROUP BY u.id
                `,
          [userId]
        );

        if (result.rows.length === 0) {
          logger.warn('User not found for claims processing:', { userId });
          return;
        }
        user = result.rows[0];
      }

      // Get applicable rules for this event type
      const applicableRules = Array.from(this.rules.values())
        .filter(rule => rule.triggerEvents.includes(eventType))
        .sort((a, b) => b.priority - a.priority); // Sort by priority (highest first)

      if (applicableRules.length === 0) {
        logger.debug('No applicable rules for event:', { eventType, userId });
        return;
      }

      let claimsToApply = {};
      const appliedRules = [];

      // Process each rule
      for (const rule of applicableRules) {
        if (await this.evaluateConditions(rule.conditions, user)) {
          // Merge claims (later rules with higher priority override earlier ones)
          claimsToApply = { ...claimsToApply, ...rule.claims };
          appliedRules.push(rule.name);

          logger.debug('Rule applied:', {
            ruleName: rule.name,
            userId,
            claims: rule.claims,
          });
        }
      }

      // Apply claims to Firebase if any rules matched
      if (Object.keys(claimsToApply).length > 0) {
        await this.applyClaimsToUser(user.firebase_uid, claimsToApply);

        // Log the automation action
        await this.logClaimsAutomation(userId, eventType, appliedRules, claimsToApply);

        logger.info('Custom claims automated:', {
          userId,
          firebaseUid: user.firebase_uid,
          eventType,
          appliedRules,
          claims: claimsToApply,
        });
      }
    } catch (error) {
      logger.error('Failed to process user claims:', error);
    }
  }

  /**
   * Evaluate rule conditions against user data
   */
  async evaluateConditions(conditions, userData) {
    try {
      return this.evaluateConditionGroup(conditions, userData);
    } catch (error) {
      logger.error('Failed to evaluate conditions:', error);
      return false;
    }
  }

  /**
   * Recursively evaluate condition group (handles AND/OR logic)
   */
  evaluateConditionGroup(conditionGroup, userData) {
    // Handle OR conditions
    if (conditionGroup.or) {
      return conditionGroup.or.some(condition => this.evaluateConditionGroup(condition, userData));
    }

    // Handle AND conditions
    if (conditionGroup.and) {
      return conditionGroup.and.every(condition =>
        this.evaluateConditionGroup(condition, userData)
      );
    }

    // Handle individual conditions
    return Object.entries(conditionGroup).every(([field, condition]) => {
      if (field === 'or' || field === 'and') return true; // Already handled above

      return this.evaluateSingleCondition(field, condition, userData);
    });
  }

  /**
   * Evaluate a single condition
   */
  evaluateSingleCondition(field, condition, userData) {
    const userValue = this.getNestedValue(userData, field);
    const { operator, value } = condition;

    switch (operator) {
      case 'equals':
        return userValue === value;

      case 'notEquals':
        return userValue !== value;

      case 'greaterThan':
        return Number(userValue) > Number(value);

      case 'lessThan':
        return Number(userValue) < Number(value);

      case 'greaterThanOrEqual':
        return Number(userValue) >= Number(value);

      case 'lessThanOrEqual':
        return Number(userValue) <= Number(value);

      case 'contains':
        return String(userValue).toLowerCase().includes(String(value).toLowerCase());

      case 'startsWith':
        return String(userValue).toLowerCase().startsWith(String(value).toLowerCase());

      case 'endsWith':
        return String(userValue).toLowerCase().endsWith(String(value).toLowerCase());

      case 'in':
        return Array.isArray(value) && value.includes(userValue);

      case 'notIn':
        return Array.isArray(value) && !value.includes(userValue);

      case 'exists':
        return value
          ? userValue !== null && userValue !== undefined
          : userValue === null || userValue === undefined;

      case 'before':
        return new Date(userValue) < new Date(value);

      case 'after':
        return new Date(userValue) > new Date(value);

      case 'regex':
        return new RegExp(value).test(String(userValue));

      default:
        logger.warn('Unknown condition operator:', { operator, field, value });
        return false;
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Apply claims to Firebase user
   */
  async applyClaimsToUser(firebaseUid, claims) {
    try {
      // Add metadata to claims
      const enrichedClaims = {
        ...claims,
        automated: true,
        lastAutomated: new Date().toISOString(),
        automationVersion: '1.0',
      };

      const result = await this.firebaseAuth.setCustomClaims(firebaseUid, enrichedClaims);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Update local database
      await this.db.query(
        `
                UPDATE users 
                SET custom_claims = $1, updated_at = NOW() 
                WHERE firebase_uid = $2
            `,
        [JSON.stringify(enrichedClaims), firebaseUid]
      );
    } catch (error) {
      logger.error('Failed to apply claims to user:', error);
      throw error;
    }
  }

  /**
   * Log claims automation action
   */
  async logClaimsAutomation(userId, eventType, appliedRules, claims) {
    try {
      await this.db.query(
        `
                INSERT INTO user_auth_events (
                    user_id, event_type, details, created_at
                ) VALUES ($1, 'claims_automated', $2, NOW())
            `,
        [
          userId,
          JSON.stringify({
            triggerEvent: eventType,
            appliedRules,
            claims,
            automationService: 'CustomClaimsAutomationService',
          }),
        ]
      );
    } catch (error) {
      logger.error('Failed to log claims automation:', error);
    }
  }

  /**
   * Get all rules
   */
  getRules() {
    return Array.from(this.rules.values());
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  /**
   * Test rule against user data
   */
  async testRule(ruleId, userId) {
    try {
      const rule = this.rules.get(ruleId);
      if (!rule) {
        throw new Error('Rule not found');
      }

      // Get user data
      const result = await this.db.query(
        `
                SELECT u.*, 
                       COUNT(s.id) as total_sessions,
                       COALESCE(u.subscription_tier, 'free') as subscription_tier
                FROM users u 
                LEFT JOIN sessions s ON s.user_id = u.id 
                WHERE u.id = $1 
                GROUP BY u.id
            `,
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const userData = result.rows[0];
      const matches = await this.evaluateConditions(rule.conditions, userData);

      return {
        matches,
        rule: {
          id: rule.id,
          name: rule.name,
          conditions: rule.conditions,
          claims: rule.claims,
        },
        userData: {
          id: userData.id,
          email: userData.email,
          subscription_tier: userData.subscription_tier,
          is_verified: userData.is_verified,
          total_sessions: userData.total_sessions,
          created_at: userData.created_at,
        },
      };
    } catch (error) {
      logger.error('Failed to test rule:', error);
      throw error;
    }
  }

  /**
   * Bulk process all users for claims automation
   */
  async processAllUsers(eventType = 'bulk_update') {
    try {
      const result = await this.db.query(`
                SELECT u.id, u.firebase_uid
                FROM users u 
                WHERE u.firebase_uid IS NOT NULL 
                ORDER BY u.id
            `);

      let processed = 0;
      let errors = 0;

      for (const user of result.rows) {
        try {
          await this.processUserClaims(user.id, eventType);
          processed++;
        } catch (error) {
          logger.error('Failed to process user claims:', {
            userId: user.id,
            error: error.message,
          });
          errors++;
        }
      }

      logger.info('Bulk claims processing completed:', {
        totalUsers: result.rows.length,
        processed,
        errors,
      });

      return {
        totalUsers: result.rows.length,
        processed,
        errors,
      };
    } catch (error) {
      logger.error('Failed to process all users:', error);
      throw error;
    }
  }
}

export default CustomClaimsAutomationService;
