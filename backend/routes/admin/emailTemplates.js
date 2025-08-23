import express from 'express';
import { logger } from '../../config/logger.js';
import { requirePermission } from '../../middleware/admin/adminAuth.js';

/**
 * Create email template admin routes
 */
export function createEmailTemplateRoutes(emailTemplateService) {
  const router = express.Router();

  // Note: adminAuth is applied at the server level, not needed here

  // Get all template categories
  router.get(
    '/categories',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const categories = await emailTemplateService.getCategories();

        res.json({
          success: true,
          data: categories,
        });
      } catch (error) {
        logger.error('Failed to get template categories:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve template categories',
          error: error.message,
        });
      }
    }
  );

  // Create new template category
  router.post(
    '/categories',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const categoryData = req.body;
        const adminId = req.admin.id;

        // Validate required fields
        const { name, _description } = categoryData;
        if (!name) {
          return res.status(400).json({
            success: false,
            message: 'Category name is required',
          });
        }

        const category = await emailTemplateService.createCategory(categoryData, adminId);

        res.status(201).json({
          success: true,
          message: 'Template category created successfully',
          data: category,
        });
      } catch (error) {
        logger.error('Failed to create template category:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to create template category',
          error: error.message,
        });
      }
    }
  );

  // Get all email templates with filtering
  router.get(
    '/templates',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const filters = {
          categoryId: req.query.categoryId,
          isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
          search: req.query.search,
          tags: req.query.tags ? req.query.tags.split(',') : undefined,
          page: parseInt(req.query.page) || 1,
          limit: parseInt(req.query.limit) || 20,
        };

        const result = await emailTemplateService.getTemplates(filters);

        res.json({
          success: true,
          data: result.templates,
          pagination: result.pagination,
        });
      } catch (error) {
        logger.error('Failed to get templates:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve templates',
          error: error.message,
        });
      }
    }
  );

  // Get single template by ID or key
  router.get(
    '/templates/:identifier',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { identifier } = req.params;
        const template = await emailTemplateService.getTemplate(identifier);

        res.json({
          success: true,
          data: template,
        });
      } catch (error) {
        logger.error('Failed to get template:', error);
        res.status(error.message.includes('not found') ? 404 : 500).json({
          success: false,
          message: 'Failed to retrieve template',
          error: error.message,
        });
      }
    }
  );

  // Create new email template
  router.post(
    '/templates',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const templateData = req.body;
        const adminId = req.admin.id;

        // Validate required fields
        const { template_key, name, subject_template, html_template } = templateData;
        if (!template_key || !name || !subject_template || !html_template) {
          return res.status(400).json({
            success: false,
            message: 'Template key, name, subject template, and HTML template are required',
          });
        }

        const template = await emailTemplateService.createTemplate(templateData, adminId);

        res.status(201).json({
          success: true,
          message: 'Email template created successfully',
          data: template,
        });
      } catch (error) {
        logger.error('Failed to create template:', error);

        if (error.message.includes('already exists')) {
          return res.status(409).json({
            success: false,
            message: error.message,
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to create template',
          error: error.message,
        });
      }
    }
  );

  // Update email template
  router.put(
    '/templates/:templateId',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { templateId } = req.params;
        const templateData = req.body;
        const adminId = req.admin.id;

        const template = await emailTemplateService.updateTemplate(
          templateId,
          templateData,
          adminId
        );

        res.json({
          success: true,
          message: 'Email template updated successfully',
          data: template,
        });
      } catch (error) {
        logger.error('Failed to update template:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to update template',
          error: error.message,
        });
      }
    }
  );

  // Delete email template (soft delete)
  router.delete(
    '/templates/:templateId',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { templateId } = req.params;
        const adminId = req.admin.id;

        await emailTemplateService.deleteTemplate(templateId, adminId);

        res.json({
          success: true,
          message: 'Email template deleted successfully',
        });
      } catch (error) {
        logger.error('Failed to delete template:', error);

        if (error.message.includes('system template')) {
          return res.status(403).json({
            success: false,
            message: error.message,
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to delete template',
          error: error.message,
        });
      }
    }
  );

  // Get template versions
  router.get(
    '/templates/:templateId/versions',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { templateId } = req.params;
        const versions = await emailTemplateService.getTemplateVersions(templateId);

        res.json({
          success: true,
          data: versions,
        });
      } catch (error) {
        logger.error('Failed to get template versions:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve template versions',
          error: error.message,
        });
      }
    }
  );

  // Rollback to previous version
  router.post(
    '/templates/:templateId/rollback',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { templateId } = req.params;
        const { versionNumber } = req.body;
        const adminId = req.admin.id;

        if (!versionNumber) {
          return res.status(400).json({
            success: false,
            message: 'Version number is required',
          });
        }

        const version = await emailTemplateService.rollbackToVersion(
          templateId,
          versionNumber,
          adminId
        );

        res.json({
          success: true,
          message: `Template rolled back to version ${versionNumber}`,
          data: version,
        });
      } catch (error) {
        logger.error('Failed to rollback template:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to rollback template',
          error: error.message,
        });
      }
    }
  );

  // Preview template with variables
  router.post(
    '/templates/:identifier/preview',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { identifier } = req.params;
        const { variables = {}, useTestData = true } = req.body;

        let rendered;
        if (useTestData) {
          rendered = await emailTemplateService.previewTemplate(identifier, variables);
        } else {
          rendered = await emailTemplateService.renderTemplate(identifier, variables);
        }

        res.json({
          success: true,
          data: rendered,
        });
      } catch (error) {
        logger.error('Failed to preview template:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to preview template',
          error: error.message,
        });
      }
    }
  );

  // Send test email
  router.post(
    '/templates/:identifier/test',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { identifier } = req.params;
        const { testEmail, variables = {} } = req.body;
        const adminId = req.admin.id;

        if (!testEmail) {
          return res.status(400).json({
            success: false,
            message: 'Test email address is required',
          });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(testEmail)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid email address',
          });
        }

        const result = await emailTemplateService.sendTestEmail(
          identifier,
          testEmail,
          variables,
          adminId
        );

        res.json({
          success: true,
          message: `Test email sent to ${testEmail}`,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to send test email:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to send test email',
          error: error.message,
        });
      }
    }
  );

  // Get template statistics
  router.get(
    '/templates/:templateId/stats',
    requirePermission(['analytics', 'email_templates']),
    async (req, res) => {
      try {
        const { templateId } = req.params;
        const stats = await emailTemplateService.getTemplateStats(templateId);

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error('Failed to get template stats:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve template statistics',
          error: error.message,
        });
      }
    }
  );

  // Get available template variables
  router.get(
    '/variables',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { category } = req.query;
        const variables = await emailTemplateService.getAvailableVariables(category);

        res.json({
          success: true,
          data: variables,
        });
      } catch (error) {
        logger.error('Failed to get template variables:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve template variables',
          error: error.message,
        });
      }
    }
  );

  // Create or update template variable
  router.post(
    '/variables',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const variableData = req.body;
        const adminId = req.admin.id;

        // Validate required fields
        const { variable_key, variable_name } = variableData;
        if (!variable_key || !variable_name) {
          return res.status(400).json({
            success: false,
            message: 'Variable key and name are required',
          });
        }

        const variable = await emailTemplateService.upsertVariable(variableData, adminId);

        res.json({
          success: true,
          message: 'Template variable saved successfully',
          data: variable,
        });
      } catch (error) {
        logger.error('Failed to save template variable:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to save template variable',
          error: error.message,
        });
      }
    }
  );

  // Validate MJML template
  router.post(
    '/validate-mjml',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { mjml } = req.body;

        if (!mjml) {
          return res.status(400).json({
            success: false,
            message: 'MJML template is required',
          });
        }

        const validation = emailTemplateService.validateMJML(mjml);

        res.json({
          success: true,
          data: validation,
        });
      } catch (error) {
        logger.error('Failed to validate MJML:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to validate MJML template',
          error: error.message,
        });
      }
    }
  );

  // Compile MJML to HTML
  router.post(
    '/compile-mjml',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { mjml } = req.body;

        if (!mjml) {
          return res.status(400).json({
            success: false,
            message: 'MJML template is required',
          });
        }

        const html = emailTemplateService.compileMJML(mjml);

        res.json({
          success: true,
          data: { html },
        });
      } catch (error) {
        logger.error('Failed to compile MJML:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to compile MJML template',
          error: error.message,
        });
      }
    }
  );

  // Duplicate template
  router.post(
    '/templates/:templateId/duplicate',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { templateId } = req.params;
        const { name, template_key } = req.body;
        const adminId = req.admin.id;

        if (!name || !template_key) {
          return res.status(400).json({
            success: false,
            message: 'New template name and key are required',
          });
        }

        // Get original template
        const originalTemplate = await emailTemplateService.getTemplate(templateId);

        // Create duplicated template data
        const duplicateData = {
          template_key,
          name,
          description: `Copy of ${originalTemplate.name}`,
          category_id: originalTemplate.category_id,
          subject_template: originalTemplate.subject_template,
          html_template: originalTemplate.html_template,
          text_template: originalTemplate.text_template,
          mjml_template: originalTemplate.mjml_template,
          variables: JSON.parse(originalTemplate.variables || '[]'),
          tags: JSON.parse(originalTemplate.tags || '[]'),
          usage_notes: originalTemplate.usage_notes,
          supports_personalization: originalTemplate.supports_personalization,
        };

        const duplicatedTemplate = await emailTemplateService.createTemplate(
          duplicateData,
          adminId
        );

        res.status(201).json({
          success: true,
          message: 'Template duplicated successfully',
          data: duplicatedTemplate,
        });
      } catch (error) {
        logger.error('Failed to duplicate template:', error);

        if (error.message.includes('already exists')) {
          return res.status(409).json({
            success: false,
            message: 'Template key already exists',
          });
        }

        res.status(500).json({
          success: false,
          message: 'Failed to duplicate template',
          error: error.message,
        });
      }
    }
  );

  // Get template usage analytics
  router.get(
    '/analytics',
    requirePermission(['analytics', 'email_templates']),
    async (req, res) => {
      try {
        // This would require database integration - for now return mock data
        const analytics = {
          totalTemplates: 15,
          activeTemplates: 12,
          totalSent: 1234,
          averageOpenRate: 23.5,
          averageClickRate: 4.2,
          mostUsedTemplates: [
            { name: 'Welcome Email', usage_count: 456 },
            { name: 'Password Reset', usage_count: 234 },
            { name: 'Email Verification', usage_count: 189 },
          ],
          recentActivity: [
            { date: '2024-01-15', sent_count: 45 },
            { date: '2024-01-14', sent_count: 52 },
            { date: '2024-01-13', sent_count: 38 },
          ],
        };

        res.json({
          success: true,
          data: analytics,
        });
      } catch (error) {
        logger.error('Failed to get template analytics:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to retrieve template analytics',
          error: error.message,
        });
      }
    }
  );

  // Export templates
  router.get(
    '/export',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const { format = 'json', includeVersions = 'false' } = req.query;

        const templates = await emailTemplateService.getTemplates({ limit: 1000 });

        const exportData = templates.templates;

        if (includeVersions === 'true') {
          for (const template of exportData) {
            template.versions = await emailTemplateService.getTemplateVersions(template.id);
          }
        }

        const exportResult = {
          exportedAt: new Date().toISOString(),
          exportedBy: req.admin.username,
          totalTemplates: exportData.length,
          templates: exportData,
        };

        if (format === 'json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader(
            'Content-Disposition',
            `attachment; filename="email-templates-${Date.now()}.json"`
          );
          res.json(exportResult);
        } else {
          res.status(400).json({
            success: false,
            message: 'Only JSON format is currently supported',
          });
        }
      } catch (error) {
        logger.error('Failed to export templates:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to export templates',
          error: error.message,
        });
      }
    }
  );

  // Import templates from directory
  router.post(
    '/import',
    requirePermission(['content_management', 'email_templates']),
    async (req, res) => {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const TEMPLATES_DIR = path.join(process.cwd(), 'email-templates');

        // List all HTML files in the directory
        const files = await fs.readdir(TEMPLATES_DIR);
        const htmlFiles = files.filter(file => file.endsWith('.html'));

        if (htmlFiles.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No HTML templates found to import',
          });
        }

        let importedCount = 0;
        const errors = [];

        // Import each template using the service
        for (const fileName of htmlFiles) {
          try {
            const filePath = path.join(TEMPLATES_DIR, fileName);
            const content = await fs.readFile(filePath, 'utf8');

            // Skip base template
            if (fileName === 'base-template.html') {
              continue;
            }

            const name = path.basename(fileName, '.html');
            const displayName = name
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            // Determine category
            let _category = 'General';
            if (
              name.includes('verification') ||
              name.includes('onboarding') ||
              name.includes('welcome') ||
              name.includes('password-reset')
            ) {
              _category = 'Authentication';
            } else if (
              name.includes('interview') ||
              name.includes('reminder') ||
              name.includes('invitation')
            ) {
              _category = 'Notifications';
            } else if (name.includes('feedback')) {
              _category = 'Feedback';
            } else if (name.includes('billing') || name.includes('subscription')) {
              _category = 'Billing';
            }

            // Extract subject from content
            let subject = `${displayName} Notification`;
            const titleMatch = content.match(/<title>(.*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              subject = titleMatch[1];
            }

            // Try to create the template - if it exists, service should handle it
            try {
              await emailTemplateService.createTemplate(
                {
                  template_key: name,
                  name: displayName,
                  description: `Email template for ${displayName}`,
                  category_id: 1, // Default category, will be replaced with proper logic
                  subject_template: subject,
                  html_template: content,
                  variables: [],
                  is_active: true,
                },
                req.admin.id
              );

              importedCount++;
            } catch (templateError) {
              if (!templateError.message.includes('already exists')) {
                errors.push(`${fileName}: ${templateError.message}`);
              }
              // Skip if already exists
            }
          } catch (fileError) {
            errors.push(`${fileName}: ${fileError.message}`);
          }
        }

        const response = {
          success: true,
          message: `Successfully imported ${importedCount} email templates`,
          data: {
            imported_count: importedCount,
            total_files: htmlFiles.length - 1, // Exclude base-template.html
            errors: errors,
          },
        };

        res.json(response);
      } catch (error) {
        logger.error('Failed to import email templates:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to import email templates',
          error: error.message,
        });
      }
    }
  );

  return router;
}

export default createEmailTemplateRoutes;
