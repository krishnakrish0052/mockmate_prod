import { logger } from '../config/logger.js';
import Handlebars from 'handlebars';
import mjml from 'mjml';
import { EmailService } from './EmailService.js';
import { DatabaseService } from './DatabaseService.js';
import { _uuidv4 } from 'uuid';

class EmailTemplateService {
  constructor(database) {
    this.db = database;
    this.initializeHandlebarsHelpers();
  }

  /**
   * Initialize Handlebars helpers for template rendering
   */
  initializeHandlebarsHelpers() {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date, format) => {
      if (!date) return '';
      const d = new Date(date);
      switch (format) {
        case 'long':
          return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
        case 'short':
          return d.toLocaleDateString('en-US');
        default:
          return d.toISOString().split('T')[0];
      }
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount, currency = 'USD') => {
      if (!amount) return '$0.00';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(amount);
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', (arg1, arg2, options) => {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', str => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // URL helper
    Handlebars.registerHelper('url', path => {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return baseUrl + (path.startsWith('/') ? path : '/' + path);
    });
  }

  /**
   * Get all email template categories
   */
  async getCategories() {
    try {
      const result = await this.db.query(`
                SELECT * FROM email_template_categories 
                WHERE is_active = true 
                ORDER BY sort_order, name
            `);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get template categories:', error);
      throw error;
    }
  }

  /**
   * Create a new email template category
   */
  async createCategory(categoryData, adminId) {
    try {
      const { name, description, color, icon, sort_order } = categoryData;

      const result = await this.db.query(
        `
                INSERT INTO email_template_categories (
                    name, description, color, icon, sort_order, created_by, updated_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $6)
                RETURNING *
            `,
        [name, description, color, icon, sort_order || 0, adminId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create template category:', error);
      throw error;
    }
  }

  /**
   * Get all email templates with optional filtering
   */
  async getTemplates(filters = {}) {
    try {
      const { categoryId, isActive, search, tags, page = 1, limit = 20 } = filters;
      let query = `
                SELECT 
                    t.*,
                    c.name as category_name,
                    c.color as category_color,
                    c.icon as category_icon,
                    admin_created.username as created_by_username,
                    admin_updated.username as updated_by_username
                FROM email_templates t
                LEFT JOIN email_template_categories c ON t.category_id = c.id
                LEFT JOIN admin_users admin_created ON t.created_by = admin_created.id
                LEFT JOIN admin_users admin_updated ON t.updated_by = admin_updated.id
                WHERE 1=1
            `;

      const queryParams = [];
      let paramIndex = 1;

      if (categoryId) {
        query += ` AND t.category_id = $${paramIndex}`;
        queryParams.push(categoryId);
        paramIndex++;
      }

      if (isActive !== undefined) {
        query += ` AND t.is_active = $${paramIndex}`;
        queryParams.push(isActive);
        paramIndex++;
      }

      if (search) {
        query += ` AND (t.name ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex} OR t.template_key ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        query += ` AND t.tags ?| $${paramIndex}`;
        queryParams.push(tags);
        paramIndex++;
      }

      query += ` ORDER BY t.updated_at DESC`;

      // Add pagination
      const offset = (page - 1) * limit;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);

      const result = await this.db.query(query, queryParams);

      // Get total count for pagination
      let countQuery = `
                SELECT COUNT(*) as total
                FROM email_templates t
                WHERE 1=1
            `;
      const countParams = queryParams.slice(0, -2); // Remove limit and offset
      let countParamIndex = 1;

      if (categoryId) {
        countQuery += ` AND t.category_id = $${countParamIndex}`;
        countParamIndex++;
      }
      if (isActive !== undefined) {
        countQuery += ` AND t.is_active = $${countParamIndex}`;
        countParamIndex++;
      }
      if (search) {
        countQuery += ` AND (t.name ILIKE $${countParamIndex} OR t.description ILIKE $${countParamIndex} OR t.template_key ILIKE $${countParamIndex})`;
        countParamIndex++;
      }
      if (tags && tags.length > 0) {
        countQuery += ` AND t.tags ?| $${countParamIndex}`;
        countParamIndex++;
      }

      const countResult = await this.db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      return {
        templates: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get templates:', error);
      throw error;
    }
  }

  /**
   * Get a single email template by ID or key
   */
  async getTemplate(identifier) {
    try {
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          identifier
        );
      const field = isUUID ? 'id' : 'template_key';

      const result = await this.db.query(
        `
                SELECT 
                    t.*,
                    c.name as category_name,
                    c.color as category_color,
                    c.icon as category_icon,
                    admin_created.username as created_by_username,
                    admin_updated.username as updated_by_username,
                    v.version_number as current_version_number,
                    v.changelog as current_version_changelog
                FROM email_templates t
                LEFT JOIN email_template_categories c ON t.category_id = c.id
                LEFT JOIN admin_users admin_created ON t.created_by = admin_created.id
                LEFT JOIN admin_users admin_updated ON t.updated_by = admin_updated.id
                LEFT JOIN email_template_versions v ON t.current_version_id = v.id
                WHERE t.${field} = $1
            `,
        [identifier]
      );

      if (result.rows.length === 0) {
        throw new Error(`Template not found: ${identifier}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get template:', error);
      throw error;
    }
  }

  /**
   * Create a new email template
   */
  async createTemplate(templateData, adminId) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const {
        template_key,
        name,
        description,
        category_id,
        subject_template,
        html_template,
        text_template,
        mjml_template,
        variables = [],
        tags = [],
        usage_notes,
        is_active = true,
        supports_personalization = true,
      } = templateData;

      // Validate template key uniqueness
      const existingTemplate = await client.query(
        'SELECT id FROM email_templates WHERE template_key = $1',
        [template_key]
      );

      if (existingTemplate.rows.length > 0) {
        throw new Error(`Template key '${template_key}' already exists`);
      }

      // Generate HTML from MJML if provided
      let finalHtmlTemplate = html_template;
      if (mjml_template) {
        const mjmlResult = mjml(mjml_template);
        if (mjmlResult.errors.length > 0) {
          throw new Error(
            `MJML compilation errors: ${mjmlResult.errors.map(e => e.message).join(', ')}`
          );
        }
        finalHtmlTemplate = mjmlResult.html;
      }

      // Create the template
      const templateResult = await client.query(
        `
                INSERT INTO email_templates (
                    template_key, name, description, category_id,
                    subject_template, html_template, text_template, mjml_template,
                    variables, tags, usage_notes, is_active, supports_personalization,
                    created_by, updated_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
                RETURNING *
            `,
        [
          template_key,
          name,
          description,
          category_id,
          subject_template,
          finalHtmlTemplate,
          text_template,
          mjml_template,
          JSON.stringify(variables),
          JSON.stringify(tags),
          usage_notes,
          is_active,
          supports_personalization,
          adminId,
        ]
      );

      const template = templateResult.rows[0];

      // Create the first version
      const versionResult = await client.query(
        `
                INSERT INTO email_template_versions (
                    template_id, version_number, subject_template, html_template,
                    text_template, mjml_template, variables, tags, changelog,
                    is_published, created_by
                ) VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, true, $9)
                RETURNING *
            `,
        [
          template.id,
          subject_template,
          finalHtmlTemplate,
          text_template,
          mjml_template,
          JSON.stringify(variables),
          JSON.stringify(tags),
          'Initial version',
          adminId,
        ]
      );

      const version = versionResult.rows[0];

      // Update template with current version ID
      await client.query('UPDATE email_templates SET current_version_id = $1 WHERE id = $2', [
        version.id,
        template.id,
      ]);

      await client.query('COMMIT');

      logger.info(`Email template created: ${template_key}`, { templateId: template.id });

      return { ...template, current_version_id: version.id };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create template:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update an email template
   */
  async updateTemplate(templateId, templateData, adminId) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const {
        name,
        description,
        category_id,
        subject_template,
        html_template,
        text_template,
        mjml_template,
        variables = [],
        tags = [],
        usage_notes,
        is_active,
        supports_personalization,
        changelog = 'Template updated',
      } = templateData;

      // Get current template
      const currentTemplate = await this.getTemplate(templateId);

      // Generate HTML from MJML if provided
      let finalHtmlTemplate = html_template;
      if (mjml_template) {
        const mjmlResult = mjml(mjml_template);
        if (mjmlResult.errors.length > 0) {
          throw new Error(
            `MJML compilation errors: ${mjmlResult.errors.map(e => e.message).join(', ')}`
          );
        }
        finalHtmlTemplate = mjmlResult.html;
      }

      // Update template
      const templateResult = await client.query(
        `
                UPDATE email_templates SET
                    name = $1, description = $2, category_id = $3,
                    subject_template = $4, html_template = $5, text_template = $6,
                    mjml_template = $7, variables = $8, tags = $9, usage_notes = $10,
                    is_active = $11, supports_personalization = $12,
                    version = version + 1, updated_by = $13, updated_at = NOW()
                WHERE id = $14
                RETURNING *
            `,
        [
          name,
          description,
          category_id,
          subject_template,
          finalHtmlTemplate,
          text_template,
          mjml_template,
          JSON.stringify(variables),
          JSON.stringify(tags),
          usage_notes,
          is_active,
          supports_personalization,
          adminId,
          templateId,
        ]
      );

      const template = templateResult.rows[0];

      // Create new version
      const versionResult = await client.query(
        `
                INSERT INTO email_template_versions (
                    template_id, version_number, subject_template, html_template,
                    text_template, mjml_template, variables, tags, changelog,
                    is_published, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
                RETURNING *
            `,
        [
          templateId,
          template.version,
          subject_template,
          finalHtmlTemplate,
          text_template,
          mjml_template,
          JSON.stringify(variables),
          JSON.stringify(tags),
          changelog,
          adminId,
        ]
      );

      const version = versionResult.rows[0];

      // Update current version reference
      await client.query('UPDATE email_templates SET current_version_id = $1 WHERE id = $2', [
        version.id,
        templateId,
      ]);

      // Mark previous versions as not published
      await client.query(
        `
                UPDATE email_template_versions 
                SET is_published = false 
                WHERE template_id = $1 AND id != $2
            `,
        [templateId, version.id]
      );

      await client.query('COMMIT');

      logger.info(`Email template updated: ${currentTemplate.template_key}`, { templateId });

      return { ...template, current_version_id: version.id };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update template:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete an email template (soft delete)
   */
  async deleteTemplate(templateId, adminId) {
    try {
      // Check if template is system template
      const template = await this.getTemplate(templateId);
      if (template.is_system) {
        throw new Error('Cannot delete system template');
      }

      const result = await this.db.query(
        `
                UPDATE email_templates 
                SET is_active = false, updated_by = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING template_key
            `,
        [adminId, templateId]
      );

      if (result.rows.length === 0) {
        throw new Error('Template not found');
      }

      logger.info(`Email template deleted: ${result.rows[0].template_key}`, { templateId });

      return { success: true };
    } catch (error) {
      logger.error('Failed to delete template:', error);
      throw error;
    }
  }

  /**
   * Get template versions
   */
  async getTemplateVersions(templateId) {
    try {
      const result = await this.db.query(
        `
                SELECT 
                    v.*,
                    admin.username as created_by_username
                FROM email_template_versions v
                LEFT JOIN admin_users admin ON v.created_by = admin.id
                WHERE v.template_id = $1
                ORDER BY v.version_number DESC
            `,
        [templateId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get template versions:', error);
      throw error;
    }
  }

  /**
   * Rollback to a previous version
   */
  async rollbackToVersion(templateId, versionNumber, adminId) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Get the version to rollback to
      const versionResult = await client.query(
        `
                SELECT * FROM email_template_versions 
                WHERE template_id = $1 AND version_number = $2
            `,
        [templateId, versionNumber]
      );

      if (versionResult.rows.length === 0) {
        throw new Error(`Version ${versionNumber} not found`);
      }

      const targetVersion = versionResult.rows[0];

      // Get current template version number
      const templateResult = await client.query(
        'SELECT version FROM email_templates WHERE id = $1',
        [templateId]
      );
      const currentVersion = templateResult.rows[0].version;
      const newVersionNumber = currentVersion + 1;

      // Create new version with rolled back content
      const newVersionResult = await client.query(
        `
                INSERT INTO email_template_versions (
                    template_id, version_number, subject_template, html_template,
                    text_template, mjml_template, variables, tags, changelog,
                    is_published, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10)
                RETURNING *
            `,
        [
          templateId,
          newVersionNumber,
          targetVersion.subject_template,
          targetVersion.html_template,
          targetVersion.text_template,
          targetVersion.mjml_template,
          targetVersion.variables,
          targetVersion.tags,
          `Rolled back to version ${versionNumber}`,
          adminId,
        ]
      );

      const newVersion = newVersionResult.rows[0];

      // Update template
      await client.query(
        `
                UPDATE email_templates SET
                    subject_template = $1, html_template = $2, text_template = $3,
                    mjml_template = $4, variables = $5, tags = $6,
                    version = $7, current_version_id = $8,
                    updated_by = $9, updated_at = NOW()
                WHERE id = $10
            `,
        [
          targetVersion.subject_template,
          targetVersion.html_template,
          targetVersion.text_template,
          targetVersion.mjml_template,
          targetVersion.variables,
          targetVersion.tags,
          newVersionNumber,
          newVersion.id,
          adminId,
          templateId,
        ]
      );

      // Mark other versions as not published
      await client.query(
        `
                UPDATE email_template_versions 
                SET is_published = false 
                WHERE template_id = $1 AND id != $2
            `,
        [templateId, newVersion.id]
      );

      await client.query('COMMIT');

      logger.info(`Template rolled back to version ${versionNumber}`, {
        templateId,
        newVersionNumber,
      });

      return newVersion;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to rollback template:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Render a template with variables
   */
  async renderTemplate(templateIdentifier, variables = {}) {
    try {
      const template = await this.getTemplate(templateIdentifier);

      // Add system variables
      const systemVariables = await this.getSystemVariables();
      const allVariables = { ...systemVariables, ...variables };

      // Render subject
      const subjectTemplate = Handlebars.compile(template.subject_template);
      const renderedSubject = subjectTemplate(allVariables);

      // Render HTML
      const htmlTemplate = Handlebars.compile(template.html_template);
      const renderedHtml = htmlTemplate(allVariables);

      // Render text (if available)
      let renderedText = null;
      if (template.text_template) {
        const textTemplate = Handlebars.compile(template.text_template);
        renderedText = textTemplate(allVariables);
      }

      return {
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        template: {
          id: template.id,
          template_key: template.template_key,
          name: template.name,
          version: template.version,
        },
      };
    } catch (error) {
      logger.error('Failed to render template:', error);
      throw error;
    }
  }

  /**
   * Preview template with test variables
   */
  async previewTemplate(templateIdentifier, testVariables = {}) {
    try {
      const template = await this.getTemplate(templateIdentifier);

      // Get default test variables
      const defaultVariables = await this.getDefaultTestVariables();
      const previewVariables = { ...defaultVariables, ...testVariables };

      return await this.renderTemplate(templateIdentifier, previewVariables);
    } catch (error) {
      logger.error('Failed to preview template:', error);
      throw error;
    }
  }

  /**
   * Get available template variables
   */
  async getAvailableVariables(category = null) {
    try {
      let query = 'SELECT * FROM email_template_variables WHERE 1=1';
      const params = [];

      if (category) {
        query += ' AND category = $1';
        params.push(category);
      }

      query += ' ORDER BY category, variable_key';

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get available variables:', error);
      throw error;
    }
  }

  /**
   * Create or update template variable
   */
  async upsertVariable(variableData, adminId) {
    try {
      const {
        variable_key,
        variable_name,
        description,
        variable_type = 'string',
        default_value,
        is_required = false,
        category,
        example_value,
        validation_rules = {},
      } = variableData;

      const result = await this.db.query(
        `
                INSERT INTO email_template_variables (
                    variable_key, variable_name, description, variable_type,
                    default_value, is_required, category, example_value,
                    validation_rules, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (variable_key) DO UPDATE SET
                    variable_name = EXCLUDED.variable_name,
                    description = EXCLUDED.description,
                    variable_type = EXCLUDED.variable_type,
                    default_value = EXCLUDED.default_value,
                    is_required = EXCLUDED.is_required,
                    category = EXCLUDED.category,
                    example_value = EXCLUDED.example_value,
                    validation_rules = EXCLUDED.validation_rules,
                    updated_at = NOW()
                RETURNING *
            `,
        [
          variable_key,
          variable_name,
          description,
          variable_type,
          default_value,
          is_required,
          category,
          example_value,
          JSON.stringify(validation_rules),
          adminId,
        ]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to upsert variable:', error);
      throw error;
    }
  }

  /**
   * Get system variables
   */
  async getSystemVariables() {
    return {
      'system.siteName': process.env.SITE_NAME || 'MockMate',
      'system.siteUrl': process.env.FRONTEND_URL || 'http://localhost:3000',
      'system.supportEmail': process.env.SUPPORT_EMAIL || 'support@mockmate.ai',
      'system.currentDate': new Date().toISOString().split('T')[0],
      'system.currentYear': new Date().getFullYear(),
    };
  }

  /**
   * Get default test variables for preview
   */
  async getDefaultTestVariables() {
    try {
      const variables = await this.getAvailableVariables();
      const testVariables = {};

      variables.forEach(variable => {
        if (variable.example_value) {
          testVariables[variable.variable_key] = variable.example_value;
        } else if (variable.default_value) {
          testVariables[variable.variable_key] = variable.default_value;
        }
      });

      return testVariables;
    } catch (error) {
      logger.error('Failed to get default test variables:', error);
      return {};
    }
  }

  /**
   * Send test email
   */
  async sendTestEmail(templateIdentifier, testEmail, testVariables = {}, adminId) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Render template
      const rendered = await this.renderTemplate(templateIdentifier, testVariables);

      // Create test record
      const testResult = await client.query(
        `
                INSERT INTO email_template_tests (
                    template_id, test_name, test_description, test_email,
                    test_variables, created_by
                ) VALUES (
                    (SELECT id FROM email_templates WHERE template_key = $1 OR id = $1),
                    $2, $3, $4, $5, $6
                )
                RETURNING *
            `,
        [
          templateIdentifier,
          `Test email to ${testEmail}`,
          'Template test email',
          testEmail,
          JSON.stringify(testVariables),
          adminId,
        ]
      );

      const test = testResult.rows[0];

      // TODO: Integrate with actual email service
      // For now, we'll just mark as sent
      await client.query(
        `
                UPDATE email_template_tests 
                SET status = 'sent', sent_at = NOW()
                WHERE id = $1
            `,
        [test.id]
      );

      await client.query('COMMIT');

      logger.info(`Test email sent for template ${templateIdentifier} to ${testEmail}`);

      return {
        success: true,
        testId: test.id,
        rendered,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to send test email:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get template usage statistics
   */
  async getTemplateStats(templateId) {
    try {
      const stats = await this.db.query(
        `
                SELECT 
                    COUNT(*) as total_sent,
                    COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
                    COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened_count,
                    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked_count,
                    AVG(open_count) as avg_opens,
                    AVG(click_count) as avg_clicks
                FROM email_sending_history
                WHERE template_id = $1
            `,
        [templateId]
      );

      const recentSending = await this.db.query(
        `
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as count
                FROM email_sending_history
                WHERE template_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(created_at)
                ORDER BY date
            `,
        [templateId]
      );

      return {
        overview: stats.rows[0],
        recentActivity: recentSending.rows,
      };
    } catch (error) {
      logger.error('Failed to get template stats:', error);
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
        isValid: result.errors.length === 0,
        errors: result.errors,
        html: result.errors.length === 0 ? result.html : null,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [{ message: error.message }],
        html: null,
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
        throw new Error(`MJML compilation errors: ${result.errors.map(e => e.message).join(', ')}`);
      }
      return result.html;
    } catch (error) {
      logger.error('Failed to compile MJML:', error);
      throw error;
    }
  }
}

export default EmailTemplateService;
