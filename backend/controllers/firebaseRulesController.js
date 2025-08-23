import { logger } from '../config/logger.js';

class FirebaseRulesController {
  constructor(firebaseRulesService) {
    this.firebaseRulesService = firebaseRulesService;
  }

  /**
   * Get all rules templates
   */
  async getAllRulesTemplates(req, res) {
    try {
      const { page = 1, limit = 10, category, search, isActive } = req.query;
      const offset = (page - 1) * limit;

      let templates = await this.firebaseRulesService.getAllTemplates();

      // Apply filters
      if (category) {
        templates = templates.filter(template => template.category === category);
      }

      if (search) {
        templates = templates.filter(
          template =>
            template.name.toLowerCase().includes(search.toLowerCase()) ||
            template.description.toLowerCase().includes(search.toLowerCase())
        );
      }

      if (isActive !== undefined) {
        const activeFilter = isActive === 'true';
        templates = templates.filter(template => template.isActive === activeFilter);
      }

      // Apply pagination
      const total = templates.length;
      const paginatedTemplates = templates.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          templates: paginatedTemplates,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
            hasNext: offset + limit < total,
            hasPrev: page > 1,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get rules templates:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve rules templates',
        code: 'FETCH_TEMPLATES_ERROR',
      });
    }
  }

  /**
   * Get rules template by ID
   */
  async getRulesTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const template = await this.firebaseRulesService.getTemplateById(templateId);

      if (!template) {
        return res.status(404).json({
          success: false,
          error: 'Rules template not found',
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { template },
      });
    } catch (error) {
      logger.error('Failed to get rules template:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve rules template',
        code: 'FETCH_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Create new rules template
   */
  async createRulesTemplate(req, res) {
    try {
      const templateData = {
        ...req.body,
        createdBy: req.admin?.id,
      };

      const template = await this.firebaseRulesService.createTemplate(templateData);

      res.status(201).json({
        success: true,
        message: 'Rules template created successfully',
        data: { template },
      });
    } catch (error) {
      logger.error('Failed to create rules template:', error);

      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_EXISTS',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create rules template',
        code: 'CREATE_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Update rules template
   */
  async updateRulesTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const updates = {
        ...req.body,
        updatedBy: req.admin?.id,
      };

      const template = await this.firebaseRulesService.updateTemplate(templateId, updates);

      res.json({
        success: true,
        message: 'Rules template updated successfully',
        data: { template },
      });
    } catch (error) {
      logger.error('Failed to update rules template:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to update rules template',
        code: 'UPDATE_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Delete rules template
   */
  async deleteRulesTemplate(req, res) {
    try {
      const { templateId } = req.params;

      await this.firebaseRulesService.deleteTemplate(templateId);

      res.json({
        success: true,
        message: 'Rules template deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete rules template:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to delete rules template',
        code: 'DELETE_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Test rules template
   */
  async testRulesTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { variables, testCases } = req.body;

      const results = await this.firebaseRulesService.testTemplate(
        templateId,
        variables,
        testCases
      );

      res.json({
        success: true,
        data: { testResults: results },
      });
    } catch (error) {
      logger.error('Failed to test rules template:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to test rules template',
        code: 'TEST_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Generate rules from template
   */
  async generateRules(req, res) {
    try {
      const { templateId } = req.params;
      const { variables } = req.body;

      const generatedRules = await this.firebaseRulesService.generateRules(templateId, variables);

      res.json({
        success: true,
        data: { rules: generatedRules },
      });
    } catch (error) {
      logger.error('Failed to generate rules:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to generate rules',
        code: 'GENERATE_RULES_ERROR',
      });
    }
  }

  /**
   * Deploy rules
   */
  async deployRules(req, res) {
    try {
      const { templateId, tenantId, variables, isDryRun = false } = req.body;

      const deployment = await this.firebaseRulesService.deployRules({
        templateId,
        tenantId,
        variables,
        isDryRun,
        deployedBy: req.admin?.id,
      });

      res.json({
        success: true,
        message: isDryRun ? 'Rules validation completed' : 'Rules deployed successfully',
        data: { deployment },
      });
    } catch (error) {
      logger.error('Failed to deploy rules:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      if (error.message.includes('validation failed')) {
        return res.status(400).json({
          success: false,
          error: error.message,
          code: 'RULES_VALIDATION_FAILED',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to deploy rules',
        code: 'DEPLOY_RULES_ERROR',
      });
    }
  }

  /**
   * Get deployment history
   */
  async getDeploymentHistory(req, res) {
    try {
      const { page = 1, limit = 10, tenantId, templateId, status } = req.query;

      const filters = {};
      if (tenantId) filters.tenantId = tenantId;
      if (templateId) filters.templateId = templateId;
      if (status) filters.status = status;

      const history = await this.firebaseRulesService.getDeploymentHistory(filters, {
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Failed to get deployment history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve deployment history',
        code: 'FETCH_DEPLOYMENT_HISTORY_ERROR',
      });
    }
  }

  /**
   * Get active rules for tenant
   */
  async getActiveRules(req, res) {
    try {
      const { tenantId } = req.params;

      const activeRules = await this.firebaseRulesService.getActiveRules(tenantId);

      if (!activeRules) {
        return res.status(404).json({
          success: false,
          error: 'No active rules found for tenant',
          code: 'ACTIVE_RULES_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { rules: activeRules },
      });
    } catch (error) {
      logger.error('Failed to get active rules:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve active rules',
        code: 'FETCH_ACTIVE_RULES_ERROR',
      });
    }
  }

  /**
   * Simulate rules deployment
   */
  async simulateDeployment(req, res) {
    try {
      const { templateId, tenantId, variables, testScenarios } = req.body;

      const simulation = await this.firebaseRulesService.simulateDeployment({
        templateId,
        tenantId,
        variables,
        testScenarios,
      });

      res.json({
        success: true,
        data: { simulation },
      });
    } catch (error) {
      logger.error('Failed to simulate deployment:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to simulate deployment',
        code: 'SIMULATE_DEPLOYMENT_ERROR',
      });
    }
  }

  /**
   * Validate rules syntax
   */
  async validateRulesSyntax(req, res) {
    try {
      const { rules } = req.body;

      const validation = await this.firebaseRulesService.validateRules(rules);

      res.json({
        success: true,
        data: { validation },
      });
    } catch (error) {
      logger.error('Failed to validate rules syntax:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate rules syntax',
        code: 'VALIDATE_RULES_ERROR',
      });
    }
  }

  /**
   * Get rules templates by category
   */
  async getTemplatesByCategory(req, res) {
    try {
      const { category } = req.params;

      const templates = await this.firebaseRulesService.getTemplatesByCategory(category);

      res.json({
        success: true,
        data: { templates },
      });
    } catch (error) {
      logger.error('Failed to get templates by category:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve templates by category',
        code: 'FETCH_TEMPLATES_BY_CATEGORY_ERROR',
      });
    }
  }

  /**
   * Clone rules template
   */
  async cloneRulesTemplate(req, res) {
    try {
      const { templateId } = req.params;
      const { name, description } = req.body;

      const clonedTemplate = await this.firebaseRulesService.cloneTemplate(templateId, {
        name,
        description,
        createdBy: req.admin?.id,
      });

      res.status(201).json({
        success: true,
        message: 'Rules template cloned successfully',
        data: { template: clonedTemplate },
      });
    } catch (error) {
      logger.error('Failed to clone rules template:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to clone rules template',
        code: 'CLONE_TEMPLATE_ERROR',
      });
    }
  }

  /**
   * Get rules template variables
   */
  async getTemplateVariables(req, res) {
    try {
      const { templateId } = req.params;

      const variables = await this.firebaseRulesService.getTemplateVariables(templateId);

      res.json({
        success: true,
        data: { variables },
      });
    } catch (error) {
      logger.error('Failed to get template variables:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'TEMPLATE_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve template variables',
        code: 'FETCH_TEMPLATE_VARIABLES_ERROR',
      });
    }
  }

  /**
   * Rollback deployment
   */
  async rollbackDeployment(req, res) {
    try {
      const { deploymentId } = req.params;
      const { reason } = req.body;

      const rollback = await this.firebaseRulesService.rollbackDeployment(deploymentId, {
        reason,
        rolledBackBy: req.admin?.id,
      });

      res.json({
        success: true,
        message: 'Deployment rolled back successfully',
        data: { rollback },
      });
    } catch (error) {
      logger.error('Failed to rollback deployment:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
          code: 'DEPLOYMENT_NOT_FOUND',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to rollback deployment',
        code: 'ROLLBACK_DEPLOYMENT_ERROR',
      });
    }
  }

  /**
   * Get rules deployment status
   */
  async getDeploymentStatus(req, res) {
    try {
      const { deploymentId } = req.params;

      const deployment = await this.firebaseRulesService.getDeploymentById(deploymentId);

      if (!deployment) {
        return res.status(404).json({
          success: false,
          error: 'Deployment not found',
          code: 'DEPLOYMENT_NOT_FOUND',
        });
      }

      res.json({
        success: true,
        data: { deployment },
      });
    } catch (error) {
      logger.error('Failed to get deployment status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve deployment status',
        code: 'FETCH_DEPLOYMENT_STATUS_ERROR',
      });
    }
  }
}

export default FirebaseRulesController;
