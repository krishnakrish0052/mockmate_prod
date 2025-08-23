import { logger } from '../config/logger.js';

class AuthProviderController {
  constructor(authProviderService) {
    this.authProviderService = authProviderService;
  }

  /**
   * Get all auth providers
   */
  async getAllProviders(req, res) {
    try {
      const { includeSecrets = false } = req.query;

      const providers =
        includeSecrets && req.admin
          ? await this.authProviderService.getProviderConfigsForAdmin()
          : await this.authProviderService.getProviderConfigsForFrontend();

      res.json({
        success: true,
        data: { providers },
      });
    } catch (error) {
      logger.error('Failed to get auth providers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve auth providers',
        code: 'FETCH_PROVIDERS_ERROR',
      });
    }
  }

  /**
   * Get auth provider by name
   */
  async getProvider(req, res) {
    try {
      const { provider } = req.params;
      const { includeSecrets = false } = req.query;

      const providerConfig =
        includeSecrets && req.admin
          ? await this.authProviderService.getProviderConfig(provider)
          : await this.authProviderService.getProviderConfigForFrontend(provider);

      if (!providerConfig) {
        return res.status(404).json({
          success: false,
          error: 'Auth provider not found',
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { provider: providerConfig },
      });
    } catch (error) {
      logger.error('Failed to get auth provider:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve auth provider',
        code: 'FETCH_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Create or update auth provider
   */
  async upsertProvider(req, res) {
    try {
      const { provider } = req.params;
      const providerData = {
        ...req.body,
        provider,
        updatedBy: req.admin?.id,
      };

      const updatedProvider = await this.authProviderService.updateProviderConfig(
        provider,
        providerData
      );

      res.json({
        success: true,
        message: 'Auth provider configuration updated successfully',
        data: { provider: updatedProvider },
      });
    } catch (error) {
      logger.error('Failed to upsert auth provider:', error);

      if (error.message.includes('Invalid provider')) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'INVALID_PROVIDER',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update auth provider configuration',
        code: 'UPSERT_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Enable auth provider
   */
  async enableProvider(req, res) {
    try {
      const { provider } = req.params;

      await this.authProviderService.enableProvider(provider);

      res.json({
        success: true,
        message: `${provider} provider enabled successfully`,
      });
    } catch (error) {
      logger.error('Failed to enable auth provider:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      if (error.message.includes('missing required secrets')) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'MISSING_SECRETS',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to enable auth provider',
        code: 'ENABLE_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Disable auth provider
   */
  async disableProvider(req, res) {
    try {
      const { provider } = req.params;

      await this.authProviderService.disableProvider(provider);

      res.json({
        success: true,
        message: `${provider} provider disabled successfully`,
      });
    } catch (error) {
      logger.error('Failed to disable auth provider:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to disable auth provider',
        code: 'DISABLE_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Test auth provider configuration
   */
  async testProvider(req, res) {
    try {
      const { provider } = req.params;

      const testResult = await this.authProviderService.testProviderConfiguration(provider);

      res.json({
        success: true,
        data: { testResult },
      });
    } catch (error) {
      logger.error('Failed to test auth provider:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to test auth provider configuration',
        code: 'TEST_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Delete auth provider
   */
  async deleteProvider(req, res) {
    try {
      const { provider } = req.params;

      await this.authProviderService.deleteProviderConfig(provider);

      res.json({
        success: true,
        message: `${provider} provider deleted successfully`,
      });
    } catch (error) {
      logger.error('Failed to delete auth provider:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete auth provider',
        code: 'DELETE_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Get provider statistics
   */
  async getProviderStatistics(req, res) {
    try {
      const { provider } = req.params;

      const stats = await this.authProviderService.getProviderStatistics(provider);

      res.json({
        success: true,
        data: { statistics: stats },
      });
    } catch (error) {
      logger.error('Failed to get provider statistics:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve provider statistics',
        code: 'FETCH_PROVIDER_STATS_ERROR',
      });
    }
  }

  /**
   * Get overall auth provider statistics
   */
  async getOverallStatistics(req, res) {
    try {
      const stats = await this.authProviderService.getOverallStatistics();

      res.json({
        success: true,
        data: { statistics: stats },
      });
    } catch (error) {
      logger.error('Failed to get overall provider statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve overall provider statistics',
        code: 'FETCH_OVERALL_STATS_ERROR',
      });
    }
  }

  /**
   * Get enabled providers for frontend
   */
  async getEnabledProviders(req, res) {
    try {
      const enabledProviders = await this.authProviderService.getEnabledProviders();

      res.json({
        success: true,
        data: { providers: enabledProviders },
      });
    } catch (error) {
      logger.error('Failed to get enabled providers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve enabled providers',
        code: 'FETCH_ENABLED_PROVIDERS_ERROR',
      });
    }
  }

  /**
   * Update provider secrets
   */
  async updateProviderSecrets(req, res) {
    try {
      const { provider } = req.params;
      const { clientId, clientSecret, privateKey, otherSecrets } = req.body;

      const secrets = {};
      if (clientId) secrets.clientId = clientId;
      if (clientSecret) secrets.clientSecret = clientSecret;
      if (privateKey) secrets.privateKey = privateKey;
      if (otherSecrets) Object.assign(secrets, otherSecrets);

      await this.authProviderService.updateProviderSecrets(provider, secrets);

      res.json({
        success: true,
        message: `${provider} provider secrets updated successfully`,
      });
    } catch (error) {
      logger.error('Failed to update provider secrets:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update provider secrets',
        code: 'UPDATE_SECRETS_ERROR',
      });
    }
  }

  /**
   * Reset provider to defaults
   */
  async resetProviderToDefaults(req, res) {
    try {
      const { provider } = req.params;

      const resetProvider = await this.authProviderService.resetProviderToDefaults(provider);

      res.json({
        success: true,
        message: `${provider} provider reset to defaults successfully`,
        data: { provider: resetProvider },
      });
    } catch (error) {
      logger.error('Failed to reset provider to defaults:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to reset provider to defaults',
        code: 'RESET_PROVIDER_ERROR',
      });
    }
  }

  /**
   * Get provider configuration template
   */
  async getProviderTemplate(req, res) {
    try {
      const { provider } = req.params;

      const template = this.authProviderService.getProviderTemplate(provider);

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Provider template not found',
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { template },
      });
    } catch (error) {
      logger.error('Failed to get provider template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve provider template',
        code: 'FETCH_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Get all available provider types
   */
  async getAvailableProviders(req, res) {
    try {
      const availableProviders = this.authProviderService.getAvailableProviders();

      res.json({
        success: true,
        data: { providers: availableProviders },
      });
    } catch (error) {
      logger.error('Failed to get available providers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve available providers',
        code: 'FETCH_AVAILABLE_PROVIDERS_ERROR',
      });
    }
  }

  /**
   * Bulk update providers
   */
  async bulkUpdateProviders(req, res) {
    try {
      const { providers } = req.body;

      const results = await Promise.allSettled(
        providers.map(async providerData => {
          return await this.authProviderService.updateProviderConfig(providerData.provider, {
            ...providerData,
            updatedBy: req.admin?.id,
          });
        })
      );

      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;

      res.json({
        success: true,
        message: `Bulk update completed: ${successful} successful, ${failed} failed`,
        data: {
          results: results.map((result, index) => ({
            provider: providers[index].provider,
            status: result.status,
            ...(result.status === 'fulfilled' && { data: result.value }),
            ...(result.status === 'rejected' && { error: result.reason.message }),
          })),
        },
      });
    } catch (error) {
      logger.error('Failed to bulk update providers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to bulk update providers',
        code: 'BULK_UPDATE_ERROR',
      });
    }
  }

  /**
   * Get provider rate limits
   */
  async getProviderRateLimits(req, res) {
    try {
      const { provider } = req.params;

      const rateLimits = await this.authProviderService.getProviderRateLimits(provider);

      if (!rateLimits) {
        return res.status(404).json({
          success: false,
          error: 'Provider not found or no rate limits configured',
          code: 'RATE_LIMITS_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { rateLimits },
      });
    } catch (error) {
      logger.error('Failed to get provider rate limits:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve provider rate limits',
        code: 'FETCH_RATE_LIMITS_ERROR',
      });
    }
  }

  /**
   * Update provider rate limits
   */
  async updateProviderRateLimits(req, res) {
    try {
      const { provider } = req.params;
      const rateLimits = req.body;

      await this.authProviderService.updateProviderRateLimits(provider, rateLimits);

      res.json({
        success: true,
        message: `${provider} provider rate limits updated successfully`,
      });
    } catch (error) {
      logger.error('Failed to update provider rate limits:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'PROVIDER_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update provider rate limits',
        code: 'UPDATE_RATE_LIMITS_ERROR',
      });
    }
  }

  /**
   * Validate provider configuration
   */
  async validateProviderConfig(req, res) {
    try {
      const { provider } = req.params;
      const config = req.body;

      const validation = await this.authProviderService.validateProviderConfig(provider, config);

      res.json({
        success: true,
        data: { validation },
      });
    } catch (error) {
      logger.error('Failed to validate provider config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate provider configuration',
        code: 'VALIDATE_CONFIG_ERROR',
      });
    }
  }

  /**
   * Get provider dashboard data
   */
  async getProviderDashboard(req, res) {
    try {
      const overallStats = await this.authProviderService.getOverallStatistics();
      const enabledProviders = await this.authProviderService.getEnabledProviders();
      const allProviders = await this.authProviderService.getProviderConfigsForAdmin();

      // Get usage statistics for each enabled provider
      const providerStats = await Promise.all(
        enabledProviders.map(async provider => {
          try {
            const stats = await this.authProviderService.getProviderStatistics(provider.provider);
            return {
              provider: provider.provider,
              displayName: provider.displayName,
              ...stats,
            };
          } catch (error) {
            logger.warn(`Failed to get stats for provider ${provider.provider}:`, error.message);
            return {
              provider: provider.provider,
              displayName: provider.displayName,
              usage: { last30Days: 0 },
            };
          }
        })
      );

      res.json({
        success: true,
        data: {
          overview: overallStats,
          providers: allProviders.map(provider => ({
            ...provider,
            // Remove sensitive information
            clientSecret: undefined,
            privateKey: undefined,
          })),
          enabledProviders,
          providerStats,
        },
      });
    } catch (error) {
      logger.error('Failed to get provider dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve provider dashboard data',
        code: 'FETCH_DASHBOARD_ERROR',
      });
    }
  }
}

export default AuthProviderController;
