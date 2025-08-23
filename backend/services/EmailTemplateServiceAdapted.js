import { logger } from '../config/logger.js';
import handlebars from 'handlebars';
import mjml from 'mjml';
import TemplateVariableService from './TemplateVariableService.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Email Template Service - Adapted for existing database schema
 * Provides template management, rendering, and version control for email templates
 */
class EmailTemplateService {
  constructor(database) {
    this.db = database;
    this.variableService = new TemplateVariableService();
  }

  // Helper to check if a string is a UUID
  isUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Get template by ID or name
   */
  async getTemplate(identifier) {
    try {
      const client = await this.db.connect();

      try {
        // Get template by ID or name (adapt to existing schema)
        const query = this.isUUID(identifier)
          ? 'SELECT * FROM email_templates WHERE id = $1 AND is_active = true'
          : 'SELECT * FROM email_templates WHERE template_name = $1 AND is_active = true';

        const result = await client.query(query, [identifier]);

        if (result.rows.length === 0) {
          throw new Error(`Email template '${identifier}' not found`);
        }

        const template = result.rows[0];

        // Get category information if category_id exists
        if (template.category_id) {
          const categoryQuery = 'SELECT * FROM email_template_categories WHERE id = $1';
          const categoryResult = await client.query(categoryQuery, [template.category_id]);
          template.category = categoryResult.rows[0] || null;
        }

        return template;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting email template:', { identifier, error: error.message });
      throw error;
    }
  }

  /**
   * Get all templates with filtering
   */
  async getTemplates(filters = {}) {
    try {
      const client = await this.db.connect();

      try {
        let query = `
          SELECT et.*,
            et.template_type as category_name,
            CASE 
              WHEN et.template_type = 'notification' THEN '#3B82F6'
              WHEN et.template_type = 'email' THEN '#10B981'
              ELSE '#6B7280'
            END as category_color,
            CASE 
              WHEN et.variables IS NOT NULL THEN jsonb_array_length(et.variables)
              ELSE 0
            END as variable_count
          FROM email_templates et
          WHERE et.is_active = true
        `;

        const params = [];
        let paramCount = 0;

        // Add filters
        if (filters.categoryId) {
          paramCount++;
          query += ` AND et.category_id = $${paramCount}`;
          params.push(filters.categoryId);
        }

        if (filters.search) {
          paramCount++;
          query += ` AND (et.template_name ILIKE $${paramCount} OR et.subject ILIKE $${paramCount})`;
          params.push(`%${filters.search}%`);
        }

        if (filters.templateType) {
          paramCount++;
          query += ` AND et.template_type = $${paramCount}`;
          params.push(filters.templateType);
        }

        // Add ordering
        query += ' ORDER BY et.created_at DESC';

        // Add pagination
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 20;
        const offset = (page - 1) * limit;

        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(limit);

        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await client.query(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) FROM email_templates WHERE is_active = true';
        const countParams = [];
        let countParamCount = 0;

        if (filters.categoryId) {
          countParamCount++;
          countQuery += ` AND category_id = $${countParamCount}`;
          countParams.push(filters.categoryId);
        }

        if (filters.search) {
          countParamCount++;
          countQuery += ` AND (template_name ILIKE $${countParamCount} OR subject ILIKE $${countParamCount})`;
          countParams.push(`%${filters.search}%`);
        }

        if (filters.templateType) {
          countParamCount++;
          countQuery += ` AND template_type = $${countParamCount}`;
          countParams.push(filters.templateType);
        }

        const countResult = await client.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        return {
          templates: result.rows,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting email templates:', { filters, error: error.message });
      throw error;
    }
  }

  /**
   * Create new email template
   */
  async createTemplate(templateData, adminId) {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Check if template with same name already exists
        const existingQuery = 'SELECT id FROM email_templates WHERE template_name = $1';
        const existingResult = await client.query(existingQuery, [templateData.template_name]);

        if (existingResult.rows.length > 0) {
          throw new Error(`Template with name '${templateData.template_name}' already exists`);
        }

        // Insert new template (adapted to existing schema)
        const insertQuery = `
          INSERT INTO email_templates (
            template_name, template_type, subject, template_content, 
            variables, is_active, created_at, updated_at, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8)
          RETURNING *
        `;

        const insertValues = [
          templateData.template_name || templateData.name,
          templateData.template_type || 'email',
          templateData.subject || templateData.subject_template,
          templateData.template_content || templateData.html_template,
          JSON.stringify(templateData.variables || []),
          templateData.is_active !== undefined ? templateData.is_active : true,
          adminId,
          adminId,
        ];

        const result = await client.query(insertQuery, insertValues);
        const newTemplate = result.rows[0];

        // Create initial version in email_template_versions table
        const versionQuery = `
          INSERT INTO email_template_versions (
            template_id, version_number, subject_template, html_template,
            text_template, mjml_template, variables, created_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        `;

        await client.query(versionQuery, [
          newTemplate.id,
          1,
          templateData.subject || templateData.subject_template,
          templateData.template_content || templateData.html_template,
          templateData.text_template || '',
          templateData.mjml_template || '',
          JSON.stringify(templateData.variables || []),
          adminId,
        ]);

        await client.query('COMMIT');

        logger.info('Email template created:', {
          templateId: newTemplate.id,
          templateName: newTemplate.template_name,
          adminId,
        });

        return newTemplate;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error creating email template:', {
        templateData: templateData.template_name,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update existing email template
   */
  async updateTemplate(templateId, templateData, adminId) {
    try {
      const client = await this.db.connect();

      try {
        await client.query('BEGIN');

        // Get current template
        const currentTemplate = await this.getTemplate(templateId);

        // Update template (adapted to existing schema)
        const updateQuery = `
          UPDATE email_templates 
          SET template_name = $1, template_type = $2, subject = $3, 
              template_content = $4, variables = $5, is_active = $6,
              updated_at = NOW(), updated_by = $7
          WHERE id = $8
          RETURNING *
        `;

        const updateValues = [
          templateData.template_name || templateData.name || currentTemplate.template_name,
          templateData.template_type || currentTemplate.template_type,
          templateData.subject || templateData.subject_template || currentTemplate.subject,
          templateData.template_content ||
            templateData.html_template ||
            currentTemplate.template_content,
          JSON.stringify(templateData.variables || JSON.parse(currentTemplate.variables || '[]')),
          templateData.is_active !== undefined ? templateData.is_active : currentTemplate.is_active,
          adminId,
          templateId,
        ];

        const result = await client.query(updateQuery, updateValues);
        const updatedTemplate = result.rows[0];

        // Create new version
        const maxVersionQuery =
          'SELECT MAX(version_number) FROM email_template_versions WHERE template_id = $1';
        const maxVersionResult = await client.query(maxVersionQuery, [templateId]);
        const nextVersion = (maxVersionResult.rows[0].max || 0) + 1;

        const versionQuery = `
          INSERT INTO email_template_versions (
            template_id, version_number, subject_template, html_template,
            text_template, mjml_template, variables, created_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        `;

        await client.query(versionQuery, [
          templateId,
          nextVersion,
          templateData.subject || templateData.subject_template || currentTemplate.subject,
          templateData.template_content ||
            templateData.html_template ||
            currentTemplate.template_content,
          templateData.text_template || '',
          templateData.mjml_template || '',
          JSON.stringify(templateData.variables || JSON.parse(currentTemplate.variables || '[]')),
          adminId,
        ]);

        await client.query('COMMIT');

        logger.info('Email template updated:', {
          templateId,
          templateName: updatedTemplate.template_name,
          version: nextVersion,
          adminId,
        });

        return updatedTemplate;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error updating email template:', { templateId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete email template (soft delete)
   */
  async deleteTemplate(templateId, adminId) {
    try {
      const client = await this.db.connect();

      try {
        // Soft delete by setting is_active to false
        const deleteQuery = `
          UPDATE email_templates 
          SET is_active = false, updated_at = NOW(), updated_by = $1
          WHERE id = $2
          RETURNING template_name
        `;

        const result = await client.query(deleteQuery, [adminId, templateId]);

        if (result.rows.length === 0) {
          throw new Error(`Email template with ID '${templateId}' not found`);
        }

        logger.info('Email template deleted (soft delete):', {
          templateId,
          templateName: result.rows[0].template_name,
          adminId,
        });

        return { message: 'Template deleted successfully' };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error deleting email template:', { templateId, error: error.message });
      throw error;
    }
  }

  /**
   * Render template with variables
   */
  async renderTemplate(identifier, variables = {}) {
    try {
      const template = await this.getTemplate(identifier);

      // Use simple variable replacement instead of handlebars for {{VARIABLE}} format
      let renderedSubject = template.subject;
      let renderedHtml = template.template_content;

      // Replace variables in both subject and content
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        renderedSubject = renderedSubject.replace(regex, String(value || ''));
        renderedHtml = renderedHtml.replace(regex, String(value || ''));
      }

      // If MJML template exists, try to get it and compile
      let mjmlHtml = renderedHtml;
      if (template.mjml_template) {
        let renderedMjml = template.mjml_template;

        // Replace variables in MJML template too
        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
          renderedMjml = renderedMjml.replace(regex, String(value || ''));
        }

        try {
          const mjmlResult = mjml(renderedMjml);

          if (mjmlResult.errors.length === 0) {
            mjmlHtml = mjmlResult.html;
          } else {
            logger.warn('MJML compilation errors:', mjmlResult.errors);
          }
        } catch (mjmlError) {
          logger.warn('MJML compilation failed:', mjmlError.message);
        }
      }

      return {
        subject: renderedSubject,
        html_content: mjmlHtml,
        html: mjmlHtml, // Add both for compatibility
        text_content: '', // Could add text template support
        templateId: template.id,
        templateName: template.template_name,
      };
    } catch (error) {
      logger.error('Error rendering email template:', { identifier, error: error.message });
      throw error;
    }
  }

  /**
   * Preview template with test data
   */
  async previewTemplate(identifier, variables = {}) {
    try {
      // Merge with default test data (matching template variables)
      const defaultTestData = {
        USER_NAME: 'John Doe',
        USER_EMAIL: 'john.doe@example.com',
        USER_FIRST_NAME: 'John',
        USER_LAST_NAME: 'Doe',
        COMPANY_NAME: 'TechCorp Inc.',
        POSITION: 'Senior Software Engineer',
        INTERVIEW_DATE: '2025-08-25',
        INTERVIEW_TIME: '2:00 PM EST',
        TIMEZONE: 'Eastern Standard Time',
        DURATION: '60 minutes',
        INTERVIEW_TYPE: 'Video Call',
        INTERVIEWER_NAME: 'Sarah Johnson',
        INTERVIEWER_TITLE: 'Engineering Manager',
        LOGIN_URL: 'https://mockmate.ai/login',
        SUPPORT_URL: 'https://mockmate.ai/support',
        WEBSITE_URL: 'https://mockmate.ai',
        UNSUBSCRIBE_URL: 'https://mockmate.ai/unsubscribe',
        CONFIRM_BY_DATE: '2025-08-20',
        MEETING_LINK: 'https://meet.google.com/abc-defg-hij',
        COMPANY_CONTACT_EMAIL: 'hr@techcorp.com',
        BILLING_TYPE: 'Subscription Renewal',
        BILLING_TITLE: 'Payment Successful',
        PLAN_NAME: 'Professional Plan',
        AMOUNT: '$29.99',
        NEXT_BILLING_DATE: '2025-09-19',
        HOURS_UNTIL: '24',
      };

      const testVariables = { ...defaultTestData, ...variables };
      return await this.renderTemplate(identifier, testVariables);
    } catch (error) {
      logger.error('Error previewing email template:', { identifier, error: error.message });
      throw error;
    }
  }

  /**
   * Get template categories
   */
  async getCategories() {
    try {
      const client = await this.db.connect();

      try {
        const query =
          'SELECT * FROM email_template_categories WHERE is_active = true ORDER BY sort_order, name';
        const result = await client.query(query);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting email template categories:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get available template variables
   */
  async getAvailableVariables(category = null) {
    try {
      const client = await this.db.connect();

      try {
        let query = 'SELECT * FROM email_template_variables ORDER BY category, variable_name';
        const params = [];

        if (category) {
          query =
            'SELECT * FROM email_template_variables WHERE category = $1 ORDER BY variable_name';
          params.push(category);
        }

        const result = await client.query(query, params);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting template variables:', { category, error: error.message });
      throw error;
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(identifier, testEmail, variables = {}, adminId) {
    try {
      const rendered = await this.previewTemplate(identifier, variables);

      // Record test in database
      const client = await this.db.connect();

      try {
        const template = await this.getTemplate(identifier);

        const testQuery = `
          INSERT INTO email_template_tests (
            template_id, test_name, test_email, test_variables, 
            status, created_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
          RETURNING id
        `;

        await client.query(testQuery, [
          template.id,
          `Test email to ${testEmail}`,
          testEmail,
          JSON.stringify(variables),
          'sent', // Would be 'pending' until actually sent
          adminId,
        ]);

        logger.info('Test email prepared:', {
          templateId: template.id,
          testEmail,
          adminId,
        });

        return {
          message: 'Test email prepared successfully',
          subject: rendered.subject,
          recipient: testEmail,
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error sending test email:', { identifier, testEmail, error: error.message });
      throw error;
    }
  }

  /**
   * Validate MJML template
   */
  validateMJML(mjmlTemplate) {
    try {
      const result = mjml(mjmlTemplate);
      return {
        valid: result.errors.length === 0,
        errors: result.errors.map(err => err.message),
        warnings: result.warnings || [],
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        warnings: [],
      };
    }
  }

  /**
   * Compile MJML to HTML
   */
  compileMJML(mjmlTemplate) {
    try {
      const result = mjml(mjmlTemplate);

      if (result.errors.length > 0) {
        throw new Error('MJML compilation failed: ' + result.errors.map(e => e.message).join(', '));
      }

      return {
        html: result.html,
        errors: result.errors,
        warnings: result.warnings || [],
      };
    } catch (error) {
      logger.error('Error compiling MJML:', { error: error.message });
      throw error;
    }
  }

  /**
   * Get template versions
   */
  async getTemplateVersions(templateId) {
    try {
      const client = await this.db.connect();

      try {
        const query = `
          SELECT * FROM email_template_versions 
          WHERE template_id = $1 
          ORDER BY version_number DESC
        `;

        const result = await client.query(query, [templateId]);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting template versions:', { templateId, error: error.message });
      throw error;
    }
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(templateId) {
    try {
      const client = await this.db.connect();

      try {
        // Get basic stats from email_sending_history
        const statsQuery = `
          SELECT 
            COUNT(*) as total_sent,
            COUNT(*) FILTER (WHERE status = 'sent') as successful_sends,
            COUNT(*) FILTER (WHERE status = 'failed') as failed_sends,
            AVG(open_count) as avg_opens,
            AVG(click_count) as avg_clicks
          FROM email_sending_history 
          WHERE template_id = $1
        `;

        const statsResult = await client.query(statsQuery, [templateId]);

        return {
          totalSent: parseInt(statsResult.rows[0].total_sent) || 0,
          successfulSends: parseInt(statsResult.rows[0].successful_sends) || 0,
          failedSends: parseInt(statsResult.rows[0].failed_sends) || 0,
          averageOpens: parseFloat(statsResult.rows[0].avg_opens) || 0,
          averageClicks: parseFloat(statsResult.rows[0].avg_clicks) || 0,
        };
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Error getting template stats:', { templateId, error: error.message });
      throw error;
    }
  }

  /**
   * Extract variables from template content using the VariableService
   */
  async extractTemplateVariables(identifier) {
    try {
      const template = await this.getTemplate(identifier);
      const variables = this.variableService.extractVariablesFromHtml(template.template_content);
      const categorized = this.variableService.categorizeVariables(variables);
      const testData = this.variableService.generateTestData(variables);

      return {
        templateId: template.id,
        templateName: template.template_name,
        variables,
        categorizedVariables: categorized,
        testData,
        variableCount: variables.length,
      };
    } catch (error) {
      logger.error('Error extracting template variables:', { identifier, error: error.message });
      throw error;
    }
  }

  /**
   * Get all variables from HTML templates directory
   */
  async getAllAvailableVariables() {
    try {
      const possiblePaths = [
        path.resolve('email-templates'),
        path.join(process.cwd(), 'email-templates'),
        path.join(process.cwd(), '../email-templates'),
        path.join(__dirname, '../../email-templates'),
      ];

      let templatesDir = null;
      for (const dirPath of possiblePaths) {
        try {
          const stats = await fs.stat(dirPath);
          if (stats.isDirectory()) {
            templatesDir = dirPath;
            break;
          }
        } catch (error) {
          // Continue to next path
        }
      }

      if (!templatesDir) {
        logger.warn('No email templates directory found');
        return {
          allVariables: [],
          templateVariables: {},
          categorizedVariables: { knownVariables: {}, unknownVariables: [] },
          totalTemplates: 0,
        };
      }

      const { allVariables, templateVariables, totalTemplates } =
        await this.variableService.getAllVariablesFromDirectory(templatesDir);
      const categorized = this.variableService.categorizeVariables(allVariables);

      return {
        allVariables,
        templateVariables,
        categorizedVariables: categorized,
        totalTemplates,
        templatesDirectory: templatesDir,
      };
    } catch (error) {
      logger.error('Error getting all available variables:', error);
      throw error;
    }
  }

  /**
   * Preview template with enhanced variable rendering
   */
  async previewTemplateEnhanced(identifier, customVariables = {}) {
    try {
      const template = await this.getTemplate(identifier);
      const variables = this.variableService.extractVariablesFromHtml(template.template_content);
      const testData = this.variableService.generateTestData(variables);

      // Merge custom variables with test data
      const finalVariables = { ...testData, ...customVariables };

      // Use the variable service's rendering for consistent variable replacement
      const renderedContent = this.variableService.renderHtmlTemplate(
        template.template_content,
        finalVariables
      );

      // Also render the subject
      let renderedSubject = template.subject;
      for (const [key, value] of Object.entries(finalVariables)) {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        renderedSubject = renderedSubject.replace(regex, String(value));
      }

      return {
        templateId: template.id,
        templateName: template.template_name,
        subject: renderedSubject,
        renderedContent,
        variables,
        testData,
        customVariables,
        finalVariables,
      };
    } catch (error) {
      logger.error('Error previewing template enhanced:', { identifier, error: error.message });
      throw error;
    }
  }

  /**
   * Analyze template for comprehensive variable information
   */
  async analyzeTemplate(identifier) {
    try {
      const template = await this.getTemplate(identifier);
      const variables = this.variableService.extractVariablesFromHtml(template.template_content);
      const categorized = this.variableService.categorizeVariables(variables);
      const testData = this.variableService.generateTestData(variables);

      const analysis = {
        templateId: template.id,
        templateName: template.template_name,
        templateType: template.template_type,
        totalVariables: variables.length,
        variables,
        categorizedVariables: categorized,
        testData,
        contentLength: template.template_content.length,
        subjectLength: template.subject.length,
        analysis: {
          knownVariableCount: Object.values(categorized.knownVariables).reduce(
            (count, category) => count + Object.keys(category.variables).length,
            0
          ),
          unknownVariableCount: categorized.unknownVariables.length,
          categoryBreakdown: Object.entries(categorized.knownVariables).map(([key, category]) => ({
            category: key,
            name: category.name,
            color: category.color,
            count: Object.keys(category.variables).length,
            variables: Object.keys(category.variables),
          })),
        },
      };

      return analysis;
    } catch (error) {
      logger.error('Error analyzing template:', { identifier, error: error.message });
      throw error;
    }
  }

  /**
   * Get variable usage statistics across all templates
   */
  async getVariableUsageStats() {
    try {
      const templatesDir = path.resolve('email-templates');
      return await this.variableService.getVariableUsageStats(templatesDir);
    } catch (error) {
      logger.error('Error getting variable usage stats:', error);
      throw error;
    }
  }

  /**
   * Validate template variables
   */
  validateTemplate(templateContent, expectedVariables = []) {
    return this.variableService.validateTemplateVariables(templateContent, expectedVariables);
  }
}

export default EmailTemplateService;
