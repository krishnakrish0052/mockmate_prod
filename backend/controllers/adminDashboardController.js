import { logger } from '../config/logger.js';

class AdminDashboardController {
  constructor(tenantService, firebaseRulesService, authProviderService) {
    this.tenantService = tenantService;
    this.firebaseRulesService = firebaseRulesService;
    this.authProviderService = authProviderService;
  }

  /**
   * Get comprehensive admin dashboard overview
   */
  async getDashboardOverview(req, res) {
    try {
      const [tenantsOverview, rulesOverview, providersOverview, systemHealth] =
        await Promise.allSettled([
          this.getTenantsOverview(),
          this.getRulesOverview(),
          this.getProvidersOverview(),
          this.getSystemHealth(),
        ]);

      const dashboard = {
        tenants:
          tenantsOverview.status === 'fulfilled'
            ? tenantsOverview.value
            : { error: tenantsOverview.reason?.message },
        rules:
          rulesOverview.status === 'fulfilled'
            ? rulesOverview.value
            : { error: rulesOverview.reason?.message },
        providers:
          providersOverview.status === 'fulfilled'
            ? providersOverview.value
            : { error: providersOverview.reason?.message },
        system:
          systemHealth.status === 'fulfilled'
            ? systemHealth.value
            : { error: systemHealth.reason?.message },
      };

      res.json({
        success: true,
        data: { dashboard },
      });
    } catch (error) {
      logger.error('Failed to get dashboard overview:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve dashboard overview',
        code: 'FETCH_DASHBOARD_OVERVIEW_ERROR',
      });
    }
  }

  /**
   * Get tenants overview
   */
  async getTenantsOverview() {
    const allTenants = this.tenantService.getAllTenants();
    const activeTenants = allTenants.filter(t => t.status === 'active');
    const inactiveTenants = allTenants.filter(t => t.status !== 'active');

    // Calculate total users across all tenants
    const totalUsers = allTenants.reduce((sum, tenant) => sum + tenant.userCount, 0);
    const totalApiKeys = allTenants.reduce((sum, tenant) => sum + tenant.apiKeyCount, 0);

    // Get growth metrics (this would typically query a database for historical data)
    const growthMetrics = {
      tenantsGrowth: 0, // Placeholder - would calculate based on historical data
      usersGrowth: 0, // Placeholder - would calculate based on historical data
      last30Days: {
        newTenants: 0, // Placeholder
        newUsers: 0, // Placeholder
      },
    };

    return {
      total: allTenants.length,
      active: activeTenants.length,
      inactive: inactiveTenants.length,
      totalUsers,
      totalApiKeys,
      growth: growthMetrics,
      topTenants: allTenants
        .sort((a, b) => b.userCount - a.userCount)
        .slice(0, 5)
        .map(tenant => ({
          tenantId: tenant.tenantId,
          name: tenant.name,
          userCount: tenant.userCount,
          status: tenant.status,
        })),
    };
  }

  /**
   * Get Firebase rules overview
   */
  async getRulesOverview() {
    const allTemplates = await this.firebaseRulesService.getAllTemplates();
    const activeTemplates = allTemplates.filter(t => t.isActive);

    // Get deployment history summary
    const deploymentHistory = await this.firebaseRulesService.getDeploymentHistory(
      {},
      {
        page: 1,
        limit: 100,
      }
    );

    const recentDeployments = deploymentHistory.deployments || [];
    const successfulDeployments = recentDeployments.filter(d => d.status === 'success');
    const failedDeployments = recentDeployments.filter(d => d.status === 'failed');

    // Calculate deployment stats
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const recentSuccessful = successfulDeployments.filter(d => new Date(d.deployedAt) > last30Days);

    return {
      totalTemplates: allTemplates.length,
      activeTemplates: activeTemplates.length,
      templatesByCategory: allTemplates.reduce((acc, template) => {
        acc[template.category] = (acc[template.category] || 0) + 1;
        return acc;
      }, {}),
      deployments: {
        total: recentDeployments.length,
        successful: successfulDeployments.length,
        failed: failedDeployments.length,
        successRate:
          recentDeployments.length > 0
            ? Math.round((successfulDeployments.length / recentDeployments.length) * 100)
            : 0,
        last30Days: recentSuccessful.length,
      },
      recentDeployments: recentDeployments
        .sort((a, b) => new Date(b.deployedAt) - new Date(a.deployedAt))
        .slice(0, 5),
    };
  }

  /**
   * Get auth providers overview
   */
  async getProvidersOverview() {
    const allProviders = await this.authProviderService.getProviderConfigsForAdmin();
    const enabledProviders = await this.authProviderService.getEnabledProviders();
    const overallStats = await this.authProviderService.getOverallStatistics();

    // Get usage statistics for top providers
    const providerUsage = await Promise.all(
      enabledProviders.slice(0, 5).map(async provider => {
        try {
          const stats = await this.authProviderService.getProviderStatistics(provider.provider);
          return {
            provider: provider.provider,
            displayName: provider.displayName,
            usage: stats.usage || { last30Days: 0 },
          };
        } catch (_error) {
          return {
            provider: provider.provider,
            displayName: provider.displayName,
            usage: { last30Days: 0 },
          };
        }
      })
    );

    return {
      total: overallStats.totalProviders || allProviders.length,
      enabled: overallStats.enabledProviders || enabledProviders.length,
      disabled:
        (overallStats.totalProviders || allProviders.length) -
        (overallStats.enabledProviders || enabledProviders.length),
      mostUsed: providerUsage.sort((a, b) => b.usage.last30Days - a.usage.last30Days).slice(0, 3),
      usage: {
        total: overallStats.totalUsage || 0,
        last30Days: overallStats.usageLast30Days || 0,
      },
      providerTypes: allProviders.reduce((acc, provider) => {
        acc[provider.provider] = {
          enabled: provider.isEnabled,
          configured: !!(provider.clientId || provider.clientSecret),
        };
        return acc;
      }, {}),
    };
  }

  /**
   * Get system health overview
   */
  async getSystemHealth() {
    // This would typically check various system metrics
    const health = {
      status: 'healthy', // 'healthy', 'warning', 'error'
      uptime: process.uptime(),
      services: {
        database: { status: 'healthy', latency: 0 }, // Placeholder
        firebase: { status: 'healthy', latency: 0 }, // Placeholder
        cache: { status: 'healthy', latency: 0 }, // Placeholder
      },
      resources: {
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
        cpu: 0, // Placeholder - would need actual CPU monitoring
      },
      lastUpdated: new Date().toISOString(),
    };

    return health;
  }

  /**
   * Get analytics data
   */
  async getAnalytics(req, res) {
    try {
      const { timeframe = '30d', metrics = 'all', tenantId = null } = req.query;

      const analytics = await this.getAnalyticsData(timeframe, metrics, tenantId);

      res.json({
        success: true,
        data: { analytics },
      });
    } catch (error) {
      logger.error('Failed to get analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve analytics data',
        code: 'FETCH_ANALYTICS_ERROR',
      });
    }
  }

  /**
   * Get analytics data helper
   */
  async getAnalyticsData(timeframe, metrics, _tenantId) {
    const now = new Date();
    const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Generate mock analytics data - in a real implementation,
    // this would query actual usage data from the database
    const mockData = {
      userRegistrations: this.generateTimeSeriesData(startDate, now, 'registrations'),
      authenticationEvents: this.generateTimeSeriesData(startDate, now, 'authentications'),
      tenantActivity: this.generateTimeSeriesData(startDate, now, 'tenant_activity'),
      rulesDeployments: this.generateTimeSeriesData(startDate, now, 'deployments'),
      errorRates: this.generateTimeSeriesData(startDate, now, 'errors'),
      providerUsage: await this.getProviderUsageAnalytics(startDate, now),
    };

    if (metrics !== 'all') {
      const requestedMetrics = metrics.split(',');
      const filteredData = {};
      requestedMetrics.forEach(metric => {
        if (mockData[metric]) {
          filteredData[metric] = mockData[metric];
        }
      });
      return filteredData;
    }

    return mockData;
  }

  /**
   * Generate time series data helper
   */
  generateTimeSeriesData(startDate, endDate, type) {
    const data = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      let value = 0;
      switch (type) {
        case 'registrations':
          value = Math.floor(Math.random() * 50) + 10;
          break;
        case 'authentications':
          value = Math.floor(Math.random() * 500) + 100;
          break;
        case 'tenant_activity':
          value = Math.floor(Math.random() * 20) + 5;
          break;
        case 'deployments':
          value = Math.floor(Math.random() * 5);
          break;
        case 'errors':
          value = Math.floor(Math.random() * 10);
          break;
        default:
          value = Math.floor(Math.random() * 100);
      }

      data.push({
        date: current.toISOString().split('T')[0],
        value,
      });

      current.setDate(current.getDate() + 1);
    }

    return data;
  }

  /**
   * Get provider usage analytics
   */
  async getProviderUsageAnalytics(_startDate, _endDate) {
    try {
      const enabledProviders = await this.authProviderService.getEnabledProviders();

      return enabledProviders.map(provider => ({
        provider: provider.provider,
        displayName: provider.displayName,
        usage: Math.floor(Math.random() * 1000) + 50, // Mock data
      }));
    } catch (error) {
      logger.warn('Failed to get provider usage analytics:', error.message);
      return [];
    }
  }

  /**
   * Get activity feed
   */
  async getActivityFeed(req, res) {
    try {
      const { limit = 20, offset = 0, type = null, tenantId = null } = req.query;

      const activities = await this.getSystemActivities(limit, offset, type, tenantId);

      res.json({
        success: true,
        data: { activities },
      });
    } catch (error) {
      logger.error('Failed to get activity feed:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve activity feed',
        code: 'FETCH_ACTIVITY_FEED_ERROR',
      });
    }
  }

  /**
   * Get system activities helper
   */
  async getSystemActivities(limit, offset, type, tenantId) {
    // Mock activity data - in a real implementation,
    // this would query actual activity logs
    const mockActivities = [
      {
        id: '1',
        type: 'tenant_created',
        description: 'New tenant "acme-corp" was created',
        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        user: 'admin@example.com',
        tenantId: 'acme-corp',
        metadata: { tenantName: 'ACME Corp' },
      },
      {
        id: '2',
        type: 'rules_deployed',
        description: 'Firebase rules deployed for tenant "example-org"',
        timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        user: 'admin@example.com',
        tenantId: 'example-org',
        metadata: { templateName: 'Basic Auth Rules' },
      },
      {
        id: '3',
        type: 'provider_enabled',
        description: 'Google OAuth provider was enabled',
        timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        user: 'admin@example.com',
        metadata: { provider: 'google' },
      },
    ];

    return mockActivities
      .filter(activity => !type || activity.type === type)
      .filter(activity => !tenantId || activity.tenantId === tenantId)
      .slice(offset, offset + limit);
  }

  /**
   * Get system status
   */
  async getSystemStatus(req, res) {
    try {
      const status = await this.getSystemHealth();

      // Add more detailed status information
      const extendedStatus = {
        ...status,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
        services: {
          ...status.services,
          tenantService: await this.checkServiceHealth('tenant'),
          rulesService: await this.checkServiceHealth('rules'),
          authProviderService: await this.checkServiceHealth('authProvider'),
        },
      };

      res.json({
        success: true,
        data: { status: extendedStatus },
      });
    } catch (error) {
      logger.error('Failed to get system status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system status',
        code: 'FETCH_SYSTEM_STATUS_ERROR',
      });
    }
  }

  /**
   * Check service health
   */
  async checkServiceHealth(serviceName) {
    try {
      switch (serviceName) {
        case 'tenant':
          return {
            status: this.tenantService.initialized ? 'healthy' : 'error',
            details: this.tenantService.initialized
              ? 'Service initialized'
              : 'Service not initialized',
          };
        case 'rules':
          return {
            status: this.firebaseRulesService.initialized ? 'healthy' : 'error',
            details: this.firebaseRulesService.initialized
              ? 'Service initialized'
              : 'Service not initialized',
          };
        case 'authProvider':
          return {
            status: this.authProviderService.initialized ? 'healthy' : 'error',
            details: this.authProviderService.initialized
              ? 'Service initialized'
              : 'Service not initialized',
          };
        default:
          return {
            status: 'unknown',
            details: 'Service not recognized',
          };
      }
    } catch (error) {
      return {
        status: 'error',
        details: error.message,
      };
    }
  }

  /**
   * Get quick stats for dashboard widgets
   */
  async getQuickStats(req, res) {
    try {
      const [tenantCount, userCount, deploymentCount, activeProviderCount] =
        await Promise.allSettled([
          this.tenantService.getAllTenants().length,
          this.tenantService.getAllTenants().reduce((sum, tenant) => sum + tenant.userCount, 0),
          this.firebaseRulesService
            .getDeploymentHistory({}, { page: 1, limit: 1000 })
            .then(h => h.total || 0),
          this.authProviderService.getEnabledProviders().then(providers => providers.length),
        ]);

      const stats = {
        tenants: tenantCount.status === 'fulfilled' ? tenantCount.value : 0,
        users: userCount.status === 'fulfilled' ? userCount.value : 0,
        deployments: deploymentCount.status === 'fulfilled' ? deploymentCount.value : 0,
        activeProviders: activeProviderCount.status === 'fulfilled' ? activeProviderCount.value : 0,
      };

      res.json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      logger.error('Failed to get quick stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve quick stats',
        code: 'FETCH_QUICK_STATS_ERROR',
      });
    }
  }
}

export default AdminDashboardController;
