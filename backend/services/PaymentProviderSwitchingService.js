import { PaymentConfiguration } from '../models/PaymentConfiguration.js';
import { _PaymentProviderRouting } from '../models/PaymentProviderRouting.js';
import { getDatabase } from '../config/database.js';
import { _paymentService } from './PaymentService.js';
import { logger } from '../config/logger.js';

class PaymentProviderSwitchingService {
  constructor() {
    this.failureThresholds = {
      maxConsecutiveFailures: 3,
      failureRateThreshold: 0.15, // 15%
      timeWindowMinutes: 30,
    };

    this.loadBalancingStrategies = {
      ROUND_ROBIN: 'round_robin',
      WEIGHTED: 'weighted',
      LEAST_USED: 'least_used',
      RESPONSE_TIME: 'response_time',
      RANDOM: 'random',
    };

    this.providerMetrics = new Map();
    this.roundRobinCounter = new Map();
  }

  // Get optimal payment provider with fallback logic
  async getOptimalProvider(
    amount,
    currency = 'USD',
    country = 'US',
    userId = null,
    retryAttempt = 0
  ) {
    try {
      // Get eligible providers based on routing rules
      const eligibleProviders = await this.getEligibleProviders(amount, currency, country, userId);

      if (eligibleProviders.length === 0) {
        throw new Error('No eligible payment providers found');
      }

      // Apply load balancing strategy
      const selectedProvider = await this.applyLoadBalancingStrategy(
        eligibleProviders,
        this.loadBalancingStrategies.WEIGHTED
      );

      // Check if provider is healthy and available
      const isProviderAvailable = await this.checkProviderAvailability(selectedProvider);

      if (!isProviderAvailable) {
        // Provider is not available, try fallback
        if (retryAttempt < 3) {
          logger.warn('Selected provider not available, trying fallback', {
            providerId: selectedProvider.id,
            retryAttempt: retryAttempt + 1,
          });

          // Remove this provider temporarily and retry
          const fallbackProviders = eligibleProviders.filter(p => p.id !== selectedProvider.id);
          if (fallbackProviders.length > 0) {
            return await this.getOptimalProviderFromList(
              fallbackProviders,
              amount,
              currency,
              country,
              userId
            );
          }
        }

        throw new Error('No available payment providers after fallback attempts');
      }

      // Update provider metrics
      await this.updateProviderMetrics(selectedProvider.id, 'selection');

      logger.info('Payment provider selected', {
        providerId: selectedProvider.id,
        providerName: selectedProvider.provider_name,
        priority: selectedProvider.priority,
        isTestMode: selectedProvider.is_test_mode,
      });

      return selectedProvider;
    } catch (error) {
      logger.error('Failed to get optimal payment provider', {
        amount,
        currency,
        country,
        error: error.message,
        retryAttempt,
      });
      throw error;
    }
  }

  // Get eligible providers based on routing rules
  async getEligibleProviders(amount, currency, country, userId) {
    const db = getDatabase();

    // First, get all active providers that support the currency and country
    const baseQuery = `
      SELECT DISTINCT pc.* 
      FROM payment_configurations pc
      WHERE pc.is_active = true 
      AND pc.health_status IN ('healthy', 'unknown')
      AND (
        pc.supported_currencies IS NULL 
        OR pc.supported_currencies @> to_jsonb($1)
      )
      AND (
        pc.supported_countries IS NULL 
        OR pc.supported_countries @> to_jsonb($2)
      )
    `;

    const providers = await db.query(baseQuery, [currency, country]);
    let eligibleProviders = providers.rows;

    // Apply routing rules
    const routingRules = await this.getActiveRoutingRules();

    for (const rule of routingRules) {
      eligibleProviders = await this.applyRoutingRule(eligibleProviders, rule, {
        amount,
        currency,
        country,
        userId,
      });
    }

    // Filter out providers with recent failures
    eligibleProviders = await this.filterUnreliableProviders(eligibleProviders);

    // Sort by priority
    eligibleProviders.sort((a, b) => b.priority - a.priority);

    return eligibleProviders.map(provider => new PaymentConfiguration(provider));
  }

  // Get active routing rules
  async getActiveRoutingRules() {
    const db = getDatabase();
    const result = await db.query(`
      SELECT ppr.*, pc.provider_name
      FROM payment_provider_routing ppr
      JOIN payment_configurations pc ON ppr.config_id = pc.id
      WHERE ppr.is_active = true AND pc.is_active = true
      ORDER BY ppr.priority DESC
    `);

    return result.rows;
  }

  // Apply a specific routing rule
  async applyRoutingRule(providers, rule, transactionContext) {
    const { amount, currency, country, userId } = transactionContext;

    try {
      switch (rule.rule_type) {
        case 'amount_based':
          return this.applyAmountBasedRouting(providers, rule, amount);

        case 'country_based':
          return this.applyCountryBasedRouting(providers, rule, country);

        case 'currency_based':
          return this.applyCurrencyBasedRouting(providers, rule, currency);

        case 'user_based':
          return this.applyUserBasedRouting(providers, rule, userId);

        case 'time_based':
          return this.applyTimeBasedRouting(providers, rule);

        case 'failure_rate_based':
          return await this.applyFailureRateBasedRouting(providers, rule);

        default:
          logger.warn(`Unknown routing rule type: ${rule.rule_type}`);
          return providers;
      }
    } catch (error) {
      logger.error('Failed to apply routing rule', {
        ruleId: rule.id,
        ruleType: rule.rule_type,
        error: error.message,
      });
      return providers;
    }
  }

  // Amount-based routing
  applyAmountBasedRouting(providers, rule, amount) {
    const conditions = rule.conditions;
    const minAmount = conditions.min_amount || 0;
    const maxAmount = conditions.max_amount || Number.MAX_SAFE_INTEGER;

    if (amount >= minAmount && amount <= maxAmount) {
      // Include the provider for this rule
      return providers.filter(p => p.id === rule.config_id).length > 0 ? providers : providers;
    } else {
      // Exclude the provider for this rule
      return providers.filter(p => p.id !== rule.config_id);
    }
  }

  // Country-based routing
  applyCountryBasedRouting(providers, rule, country) {
    const conditions = rule.conditions;
    const allowedCountries = conditions.allowed_countries || [];
    const blockedCountries = conditions.blocked_countries || [];

    if (blockedCountries.includes(country)) {
      return providers.filter(p => p.id !== rule.config_id);
    }

    if (allowedCountries.length > 0 && !allowedCountries.includes(country)) {
      return providers.filter(p => p.id !== rule.config_id);
    }

    return providers;
  }

  // Currency-based routing
  applyCurrencyBasedRouting(providers, rule, currency) {
    const conditions = rule.conditions;
    const allowedCurrencies = conditions.allowed_currencies || [];
    const blockedCurrencies = conditions.blocked_currencies || [];

    if (blockedCurrencies.includes(currency)) {
      return providers.filter(p => p.id !== rule.config_id);
    }

    if (allowedCurrencies.length > 0 && !allowedCurrencies.includes(currency)) {
      return providers.filter(p => p.id !== rule.config_id);
    }

    return providers;
  }

  // User-based routing
  async applyUserBasedRouting(providers, rule, userId) {
    if (!userId) return providers;

    const conditions = rule.conditions;

    // VIP users routing
    if (conditions.vip_users && Array.isArray(conditions.vip_users)) {
      if (conditions.vip_users.includes(userId)) {
        // Prioritize this provider for VIP users
        return providers;
      }
    }

    // User segment routing
    if (conditions.user_segments) {
      const userSegment = await this.getUserSegment(userId);
      if (conditions.user_segments.includes(userSegment)) {
        return providers;
      } else {
        return providers.filter(p => p.id !== rule.config_id);
      }
    }

    return providers;
  }

  // Time-based routing
  applyTimeBasedRouting(providers, rule) {
    const conditions = rule.conditions;
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Hour-based routing
    if (conditions.active_hours) {
      const [startHour, endHour] = conditions.active_hours;
      if (currentHour < startHour || currentHour > endHour) {
        return providers.filter(p => p.id !== rule.config_id);
      }
    }

    // Day-based routing
    if (conditions.active_days && !conditions.active_days.includes(currentDay)) {
      return providers.filter(p => p.id !== rule.config_id);
    }

    return providers;
  }

  // Failure rate-based routing
  async applyFailureRateBasedRouting(providers, rule) {
    const conditions = rule.conditions;
    const maxFailureRate = conditions.max_failure_rate || 0.1; // 10%
    const timeWindowHours = conditions.time_window_hours || 24;

    const db = getDatabase();

    // Get failure rates for all providers in the time window
    const failureRatesQuery = `
      SELECT 
        config_id,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN status = 'fail' THEN 1 END) as failed_transactions,
        (COUNT(CASE WHEN status = 'fail' THEN 1 END)::DECIMAL / COUNT(*)) as failure_rate
      FROM payment_provider_health_checks 
      WHERE created_at >= NOW() - INTERVAL '${timeWindowHours} hours'
      GROUP BY config_id
    `;

    const failureRates = await db.query(failureRatesQuery);
    const failureRateMap = new Map();

    failureRates.rows.forEach(row => {
      failureRateMap.set(row.config_id, parseFloat(row.failure_rate) || 0);
    });

    // Filter providers based on failure rate
    return providers.filter(provider => {
      const failureRate = failureRateMap.get(provider.id) || 0;
      return failureRate <= maxFailureRate;
    });
  }

  // Filter out unreliable providers
  async filterUnreliableProviders(providers) {
    const db = getDatabase();
    const { maxConsecutiveFailures, failureRateThreshold, timeWindowMinutes } =
      this.failureThresholds;

    // Get recent failure statistics
    const failureStatsQuery = `
      WITH recent_checks AS (
        SELECT 
          config_id,
          status,
          created_at,
          LAG(status) OVER (PARTITION BY config_id ORDER BY created_at) as prev_status
        FROM payment_provider_health_checks 
        WHERE created_at >= NOW() - INTERVAL '${timeWindowMinutes} minutes'
      ),
      consecutive_failures AS (
        SELECT 
          config_id,
          COUNT(*) as consecutive_count
        FROM (
          SELECT 
            config_id,
            status,
            ROW_NUMBER() OVER (PARTITION BY config_id ORDER BY created_at DESC) as rn
          FROM recent_checks
          WHERE status = 'fail'
        ) t
        WHERE rn <= ${maxConsecutiveFailures}
        GROUP BY config_id
      ),
      failure_rates AS (
        SELECT 
          config_id,
          COUNT(*) as total_checks,
          COUNT(CASE WHEN status = 'fail' THEN 1 END) as failed_checks,
          (COUNT(CASE WHEN status = 'fail' THEN 1 END)::DECIMAL / COUNT(*)) as failure_rate
        FROM recent_checks
        GROUP BY config_id
      )
      SELECT 
        p.id,
        COALESCE(cf.consecutive_count, 0) as consecutive_failures,
        COALESCE(fr.failure_rate, 0) as failure_rate
      FROM (${providers.map((_, i) => `SELECT '${providers[i].id}' as id`).join(' UNION ')}) p
      LEFT JOIN consecutive_failures cf ON p.id = cf.config_id
      LEFT JOIN failure_rates fr ON p.id = fr.config_id
    `;

    let reliabilityStats;
    try {
      reliabilityStats = await db.query(failureStatsQuery);
    } catch (error) {
      logger.warn('Failed to get reliability stats, proceeding with all providers', {
        error: error.message,
      });
      return providers;
    }

    const reliabilityMap = new Map();
    reliabilityStats.rows.forEach(row => {
      reliabilityMap.set(row.id, {
        consecutiveFailures: parseInt(row.consecutive_failures),
        failureRate: parseFloat(row.failure_rate),
      });
    });

    // Filter out unreliable providers
    return providers.filter(provider => {
      const stats = reliabilityMap.get(provider.id) || { consecutiveFailures: 0, failureRate: 0 };

      const isReliable =
        stats.consecutiveFailures < maxConsecutiveFailures &&
        stats.failureRate < failureRateThreshold;

      if (!isReliable) {
        logger.warn('Filtering out unreliable provider', {
          providerId: provider.id,
          providerName: provider.provider_name,
          consecutiveFailures: stats.consecutiveFailures,
          failureRate: stats.failureRate,
        });
      }

      return isReliable;
    });
  }

  // Apply load balancing strategy
  async applyLoadBalancingStrategy(providers, strategy) {
    switch (strategy) {
      case this.loadBalancingStrategies.ROUND_ROBIN:
        return this.roundRobinSelection(providers);

      case this.loadBalancingStrategies.WEIGHTED:
        return this.weightedSelection(providers);

      case this.loadBalancingStrategies.LEAST_USED:
        return await this.leastUsedSelection(providers);

      case this.loadBalancingStrategies.RESPONSE_TIME:
        return await this.responseTimeSelection(providers);

      case this.loadBalancingStrategies.RANDOM:
        return this.randomSelection(providers);

      default:
        return this.weightedSelection(providers);
    }
  }

  // Round robin selection
  roundRobinSelection(providers) {
    if (providers.length === 0) return null;

    const key = providers
      .map(p => p.id)
      .sort()
      .join(',');
    const currentIndex = this.roundRobinCounter.get(key) || 0;
    const nextIndex = (currentIndex + 1) % providers.length;

    this.roundRobinCounter.set(key, nextIndex);

    return providers[currentIndex];
  }

  // Weighted selection based on priority and routing weights
  weightedSelection(providers) {
    if (providers.length === 0) return null;
    if (providers.length === 1) return providers[0];

    // Calculate total weight
    const totalWeight = providers.reduce((sum, provider) => {
      const priority = provider.priority || 0;
      const routingWeight = this.getRoutingWeight(provider.id) || 1;
      return sum + priority * routingWeight;
    }, 0);

    if (totalWeight === 0) return providers[0];

    // Generate random number and select based on weight
    const randomValue = Math.random() * totalWeight;
    let currentWeight = 0;

    for (const provider of providers) {
      const priority = provider.priority || 0;
      const routingWeight = this.getRoutingWeight(provider.id) || 1;
      currentWeight += priority * routingWeight;

      if (randomValue <= currentWeight) {
        return provider;
      }
    }

    return providers[providers.length - 1];
  }

  // Least used selection
  async leastUsedSelection(providers) {
    if (providers.length === 0) return null;

    const db = getDatabase();

    // Get usage statistics for the last hour
    const usageQuery = `
      SELECT 
        config_id,
        COUNT(*) as usage_count
      FROM payment_analytics 
      WHERE period_start >= NOW() - INTERVAL '1 hour'
      AND metric_type = 'transaction_count'
      GROUP BY config_id
    `;

    try {
      const usageStats = await db.query(usageQuery);
      const usageMap = new Map();

      usageStats.rows.forEach(row => {
        usageMap.set(row.config_id, parseInt(row.usage_count));
      });

      // Find provider with least usage
      let leastUsedProvider = providers[0];
      let minUsage = usageMap.get(leastUsedProvider.id) || 0;

      for (const provider of providers) {
        const usage = usageMap.get(provider.id) || 0;
        if (usage < minUsage) {
          minUsage = usage;
          leastUsedProvider = provider;
        }
      }

      return leastUsedProvider;
    } catch (error) {
      logger.warn('Failed to get usage statistics, falling back to weighted selection', {
        error: error.message,
      });
      return this.weightedSelection(providers);
    }
  }

  // Response time based selection
  async responseTimeSelection(providers) {
    if (providers.length === 0) return null;

    const db = getDatabase();

    // Get average response times for the last hour
    const responseTimeQuery = `
      SELECT 
        config_id,
        AVG(response_time_ms) as avg_response_time
      FROM payment_provider_health_checks 
      WHERE created_at >= NOW() - INTERVAL '1 hour'
      AND response_time_ms IS NOT NULL
      GROUP BY config_id
    `;

    try {
      const responseTimeStats = await db.query(responseTimeQuery);
      const responseTimeMap = new Map();

      responseTimeStats.rows.forEach(row => {
        responseTimeMap.set(row.config_id, parseFloat(row.avg_response_time));
      });

      // Find provider with best response time
      let fastestProvider = providers[0];
      let bestResponseTime = responseTimeMap.get(fastestProvider.id) || Infinity;

      for (const provider of providers) {
        const responseTime = responseTimeMap.get(provider.id) || Infinity;
        if (responseTime < bestResponseTime) {
          bestResponseTime = responseTime;
          fastestProvider = provider;
        }
      }

      return fastestProvider;
    } catch (error) {
      logger.warn('Failed to get response time statistics, falling back to weighted selection', {
        error: error.message,
      });
      return this.weightedSelection(providers);
    }
  }

  // Random selection
  randomSelection(providers) {
    if (providers.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * providers.length);
    return providers[randomIndex];
  }

  // Check provider availability
  async checkProviderAvailability(provider) {
    try {
      // Check if provider is in maintenance mode
      if (provider.health_status === 'maintenance') {
        return false;
      }

      // Check recent health check results
      const db = getDatabase();
      const recentHealthCheck = await db.query(
        `
        SELECT status, created_at 
        FROM payment_provider_health_checks 
        WHERE config_id = $1 
        ORDER BY created_at DESC 
        LIMIT 1
      `,
        [provider.id]
      );

      if (recentHealthCheck.rows.length > 0) {
        const lastCheck = recentHealthCheck.rows[0];
        const checkAge = Date.now() - new Date(lastCheck.created_at).getTime();

        // If check is recent (less than 30 minutes) and failed, consider unavailable
        if (checkAge < 30 * 60 * 1000 && lastCheck.status === 'fail') {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.warn('Failed to check provider availability', {
        providerId: provider.id,
        error: error.message,
      });
      // Default to available if check fails
      return true;
    }
  }

  // Get optimal provider from a specific list
  async getOptimalProviderFromList(providers, _amount, _currency, _country, _userId) {
    if (providers.length === 0) {
      throw new Error('No providers available');
    }

    if (providers.length === 1) {
      const isAvailable = await this.checkProviderAvailability(providers[0]);
      if (!isAvailable) {
        throw new Error('Only available provider is not healthy');
      }
      return providers[0];
    }

    return await this.applyLoadBalancingStrategy(providers, this.loadBalancingStrategies.WEIGHTED);
  }

  // Update provider metrics
  async updateProviderMetrics(providerId, eventType) {
    try {
      const db = getDatabase();

      switch (eventType) {
        case 'selection':
          await db.query('SELECT record_payment_analytics($1, $2, $3, $4, $5)', [
            'provider',
            'selection_count',
            'selections',
            1,
            providerId,
          ]);
          break;

        case 'success':
          await db.query('SELECT record_payment_analytics($1, $2, $3, $4, $5)', [
            'provider',
            'success_rate',
            'successes',
            1,
            providerId,
          ]);
          break;

        case 'failure':
          await db.query('SELECT record_payment_analytics($1, $2, $3, $4, $5)', [
            'provider',
            'failure_rate',
            'failures',
            1,
            providerId,
          ]);
          break;
      }
    } catch (error) {
      logger.error('Failed to update provider metrics', {
        providerId,
        eventType,
        error: error.message,
      });
    }
  }

  // Get routing weight for a provider
  getRoutingWeight(_providerId) {
    // This could be enhanced to get dynamic routing weights from database
    // For now, return default weight
    return 1.0;
  }

  // Get user segment for user-based routing
  async getUserSegment(userId) {
    try {
      const db = getDatabase();

      // Simple implementation - could be enhanced with more sophisticated segmentation
      const userStats = await db.query(
        `
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_payments,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_usd END), 0) as total_spent
        FROM payments 
        WHERE user_id = $1
      `,
        [userId]
      );

      if (userStats.rows.length > 0) {
        const stats = userStats.rows[0];
        const completedPayments = parseInt(stats.completed_payments);
        const totalSpent = parseFloat(stats.total_spent);

        if (totalSpent > 1000 || completedPayments > 10) {
          return 'vip';
        } else if (totalSpent > 100 || completedPayments > 2) {
          return 'regular';
        } else {
          return 'new';
        }
      }

      return 'new';
    } catch (error) {
      logger.warn('Failed to get user segment', {
        userId,
        error: error.message,
      });
      return 'new';
    }
  }

  // Record provider switch event
  async recordProviderSwitch(fromProviderId, toProviderId, reason, transactionContext) {
    try {
      const db = getDatabase();

      await db.query(
        `
        INSERT INTO payment_provider_switches (
          from_provider_id, to_provider_id, switch_reason, 
          transaction_amount, transaction_currency, transaction_country,
          user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
        [
          fromProviderId,
          toProviderId,
          reason,
          transactionContext.amount,
          transactionContext.currency,
          transactionContext.country,
          transactionContext.userId,
        ]
      );

      logger.info('Provider switch recorded', {
        fromProviderId,
        toProviderId,
        reason,
        transactionContext,
      });
    } catch (error) {
      logger.error('Failed to record provider switch', {
        fromProviderId,
        toProviderId,
        reason,
        error: error.message,
      });
    }
  }

  // Get provider switching statistics
  async getProviderSwitchingStats(timeRange = '24h') {
    try {
      const db = getDatabase();
      let timeCondition = '';

      switch (timeRange) {
        case '1h':
          timeCondition = `AND created_at >= NOW() - INTERVAL '1 hour'`;
          break;
        case '24h':
          timeCondition = `AND created_at >= NOW() - INTERVAL '24 hours'`;
          break;
        case '7d':
          timeCondition = `AND created_at >= NOW() - INTERVAL '7 days'`;
          break;
        case '30d':
          timeCondition = `AND created_at >= NOW() - INTERVAL '30 days'`;
          break;
      }

      const query = `
        SELECT 
          switch_reason,
          COUNT(*) as switch_count,
          COUNT(DISTINCT from_provider_id) as unique_from_providers,
          COUNT(DISTINCT to_provider_id) as unique_to_providers
        FROM payment_provider_switches
        WHERE 1=1 ${timeCondition}
        GROUP BY switch_reason
        ORDER BY switch_count DESC
      `;

      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get provider switching statistics', {
        timeRange,
        error: error.message,
      });
      return [];
    }
  }
}

// Create singleton instance
const paymentProviderSwitchingService = new PaymentProviderSwitchingService();

export { PaymentProviderSwitchingService, paymentProviderSwitchingService };
