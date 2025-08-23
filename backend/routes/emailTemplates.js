const express = require('express');
const { body, param, validationResult } = require('express-validator');
import { requirePermission } from '../middleware/auth.js';

const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const Mustache = require('mustache');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Rate limiting for email sending
const emailSendLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: { error: 'Too many email requests, please try again later.' },
});

// Middleware for admin authentication
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify admin token and user permissions
    const result = await pool.query(
      'SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.token = $1 AND u.role = $2',
      [token, 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

// GET /api/email-templates - List all email templates
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { category, type, active, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        et.*,
        COALESCE(etv.variable_count, 0) as variable_count,
        COALESCE(eta.total_sent, 0) as total_sent,
        u1.name as created_by_name,
        u2.name as updated_by_name
      FROM email_templates et
      LEFT JOIN (
        SELECT template_id, COUNT(*) as variable_count 
        FROM email_template_variables 
        GROUP BY template_id
      ) etv ON et.id = etv.template_id
      LEFT JOIN (
        SELECT template_id, SUM(total_sent) as total_sent
        FROM email_template_analytics
        GROUP BY template_id
      ) eta ON et.id = eta.template_id
      LEFT JOIN users u1 ON et.created_by = u1.id
      LEFT JOIN users u2 ON et.updated_by = u2.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND et.category = $${paramIndex++}`;
      params.push(category);
    }
    if (type) {
      query += ` AND et.template_type = $${paramIndex++}`;
      params.push(type);
    }
    if (active !== undefined) {
      query += ` AND et.is_active = $${paramIndex++}`;
      params.push(active === 'true');
    }

    query += ` ORDER BY et.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM email_templates et 
      WHERE 1=1 ${category ? 'AND category = $1' : ''} 
      ${type ? `AND template_type = $${category ? 2 : 1}` : ''}
      ${active !== undefined ? `AND is_active = $${params.length - 1}` : ''}
    `;
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      templates: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// GET /api/email-templates/:id - Get specific email template with variables
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const templateQuery = `
      SELECT et.*, u1.name as created_by_name, u2.name as updated_by_name
      FROM email_templates et
      LEFT JOIN users u1 ON et.created_by = u1.id
      LEFT JOIN users u2 ON et.updated_by = u2.id
      WHERE et.id = $1
    `;
    const templateResult = await pool.query(templateQuery, [id]);

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    // Get template variables
    const variablesQuery = `
      SELECT * FROM email_template_variables 
      WHERE template_id = $1 
      ORDER BY variable_name
    `;
    const variablesResult = await pool.query(variablesQuery, [id]);

    // Get template configurations
    const configsQuery = `
      SELECT * FROM email_template_configs 
      WHERE template_id = $1
    `;
    const configsResult = await pool.query(configsQuery, [id]);

    // Get recent analytics
    const analyticsQuery = `
      SELECT * FROM email_template_analytics 
      WHERE template_id = $1 
      ORDER BY date_sent DESC 
      LIMIT 30
    `;
    const analyticsResult = await pool.query(analyticsQuery, [id]);

    res.json({
      template,
      variables: variablesResult.rows,
      configurations: configsResult.rows,
      analytics: analyticsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ error: 'Failed to fetch email template' });
  }
});

// POST /api/email-templates - Create new email template
router.post('/', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      name,
      display_name,
      description,
      category,
      template_type,
      subject_template,
      html_content,
      text_content,
      variables = {},
    } = req.body;

    // Validate required fields
    if (
      !name ||
      !display_name ||
      !category ||
      !template_type ||
      !subject_template ||
      !html_content
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Insert template
    const templateQuery = `
      INSERT INTO email_templates (
        name, display_name, description, category, template_type,
        subject_template, html_content, text_content, variables,
        created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      RETURNING *
    `;

    const templateResult = await client.query(templateQuery, [
      name,
      display_name,
      description,
      category,
      template_type,
      subject_template,
      html_content,
      text_content,
      JSON.stringify(variables),
      req.user.id,
    ]);

    const templateId = templateResult.rows[0].id;

    // Insert template variables
    for (const [varName, varConfig] of Object.entries(variables)) {
      await client.query(
        `
        INSERT INTO email_template_variables (
          template_id, variable_name, variable_type, is_required, description
        ) VALUES ($1, $2, $3, $4, $5)
      `,
        [
          templateId,
          varName,
          varConfig.type || 'string',
          varConfig.required !== false,
          varConfig.description || '',
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(templateResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating email template:', error);

    if (error.code === '23505') {
      // Unique constraint violation
      res.status(409).json({ error: 'Template name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create email template' });
    }
  } finally {
    client.release();
  }
});

// PUT /api/email-templates/:id - Update email template
router.put('/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      display_name,
      description,
      category,
      template_type,
      subject_template,
      html_content,
      text_content,
      variables = {},
      is_active,
    } = req.body;

    // Check if template exists and is not system-protected
    const checkQuery = 'SELECT is_system FROM email_templates WHERE id = $1';
    const checkResult = await client.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Update template
    const updateQuery = `
      UPDATE email_templates SET
        display_name = $2,
        description = $3,
        category = $4,
        template_type = $5,
        subject_template = $6,
        html_content = $7,
        text_content = $8,
        variables = $9,
        is_active = $10,
        updated_by = $11,
        version = version + 1
      WHERE id = $1
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, [
      id,
      display_name,
      description,
      category,
      template_type,
      subject_template,
      html_content,
      text_content,
      JSON.stringify(variables),
      is_active,
      req.user.id,
    ]);

    // Update template variables
    await client.query('DELETE FROM email_template_variables WHERE template_id = $1', [id]);

    for (const [varName, varConfig] of Object.entries(variables)) {
      await client.query(
        `
        INSERT INTO email_template_variables (
          template_id, variable_name, variable_type, is_required, description
        ) VALUES ($1, $2, $3, $4, $5)
      `,
        [
          id,
          varName,
          varConfig.type || 'string',
          varConfig.required !== false,
          varConfig.description || '',
        ]
      );
    }

    await client.query('COMMIT');
    res.json(updateResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating email template:', error);
    res.status(500).json({ error: 'Failed to update email template' });
  } finally {
    client.release();
  }
});

// DELETE /api/email-templates/:id - Delete email template
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if template is system-protected
    const checkQuery = 'SELECT is_system FROM email_templates WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (checkResult.rows[0].is_system) {
      return res.status(403).json({ error: 'Cannot delete system template' });
    }

    const deleteQuery = 'DELETE FROM email_templates WHERE id = $1 RETURNING name';
    const result = await pool.query(deleteQuery, [id]);

    res.json({ message: `Template '${result.rows[0].name}' deleted successfully` });
  } catch (error) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ error: 'Failed to delete email template' });
  }
});

// POST /api/email-templates/:id/preview - Preview email template with test data
router.post('/:id/preview', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { variables = {} } = req.body;

    const result = await pool.query(
      'SELECT subject_template, html_content, text_content FROM email_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = result.rows[0];

    // Render template with provided variables
    const subject = Mustache.render(template.subject_template, variables);
    const htmlContent = Mustache.render(template.html_content, variables);
    const textContent = template.text_content
      ? Mustache.render(template.text_content, variables)
      : null;

    res.json({
      subject,
      html_content: htmlContent,
      text_content: textContent,
    });
  } catch (error) {
    console.error('Error previewing email template:', error);
    res.status(500).json({ error: 'Failed to preview email template' });
  }
});

// POST /api/email-templates/:id/test - Send test email
router.post('/:id/test', requireAdmin, emailSendLimit, async (req, res) => {
  try {
    const { id } = req.params;
    const { test_email, variables = {} } = req.body;

    if (!test_email || !validator.isEmail(test_email)) {
      return res.status(400).json({ error: 'Valid test email address required' });
    }

    const result = await pool.query(
      'SELECT * FROM email_templates WHERE id = $1 AND is_active = true',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found or inactive' });
    }

    const template = result.rows[0];

    // Add test indicators to variables
    const testVariables = {
      ...variables,
      USER_NAME: variables.USER_NAME || 'Test User',
      USER_EMAIL: test_email,
      UNSUBSCRIBE_URL: process.env.BASE_URL + '/unsubscribe',
      SUPPORT_URL: process.env.BASE_URL + '/support',
      WEBSITE_URL: process.env.BASE_URL,
    };

    // Render template
    const subject = `[TEST] ${Mustache.render(template.subject_template, testVariables)}`;
    const htmlContent = Mustache.render(template.html_content, testVariables);

    // Queue email for sending
    await pool.query(
      `
      INSERT INTO email_queue (
        template_id, recipient_email, recipient_name, subject, html_content, variables, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        id,
        test_email,
        'Test User',
        subject,
        htmlContent,
        JSON.stringify(testVariables),
        10, // High priority for test emails
      ]
    );

    res.json({ message: 'Test email queued successfully', test_email });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// GET /api/email-templates/categories - Get available categories
router.get('/meta/categories', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as count 
      FROM email_templates 
      GROUP BY category 
      ORDER BY category
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/email-templates/stats - Get email template statistics
router.get('/meta/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_templates,
        COUNT(*) FILTER (WHERE is_active = true) as active_templates,
        COUNT(*) FILTER (WHERE is_system = true) as system_templates,
        COUNT(DISTINCT category) as categories
      FROM email_templates
    `);

    const queueStats = await pool.query(`
      SELECT 
        COUNT(*) as total_queued,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM email_queue
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const recentActivity = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as emails_sent
      FROM email_queue
      WHERE status = 'sent' AND created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      templates: stats.rows[0],
      queue: queueStats.rows[0],
      recent_activity: recentActivity.rows,
    });
  } catch (error) {
    console.error('Error fetching email stats:', error);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});

// POST /api/email-templates/:id/duplicate - Duplicate an email template
router.post('/:id/duplicate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { new_name } = req.body;

    if (!new_name) {
      return res.status(400).json({ error: 'New template name required' });
    }

    const originalResult = await pool.query('SELECT * FROM email_templates WHERE id = $1', [id]);

    if (originalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const original = originalResult.rows[0];

    const duplicateQuery = `
      INSERT INTO email_templates (
        name, display_name, description, category, template_type,
        subject_template, html_content, text_content, variables,
        is_active, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *
    `;

    const result = await pool.query(duplicateQuery, [
      new_name,
      `${original.display_name} (Copy)`,
      original.description,
      original.category,
      original.template_type,
      original.subject_template,
      original.html_content,
      original.text_content,
      original.variables,
      false, // New templates start as inactive
      req.user.id,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error duplicating email template:', error);
    if (error.code === '23505') {
      res.status(409).json({ error: 'Template name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to duplicate email template' });
    }
  }
});

// POST /api/email-templates/import - Import templates from files
router.post('/import', requireAdmin, async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const TEMPLATES_DIR = path.join(process.cwd(), 'email-templates');

    // List all HTML files in the directory
    const files = await fs.readdir(TEMPLATES_DIR);
    const htmlFiles = files.filter(file => file.endsWith('.html'));

    if (htmlFiles.length === 0) {
      return res.status(404).json({ error: 'No HTML templates found to import' });
    }

    const client = await pool.connect();
    let importedCount = 0;

    try {
      await client.query('BEGIN');

      // Get admin user ID (using first available user if no admin)
      const adminQuery = 'SELECT id FROM users WHERE role = $1 LIMIT 1';
      const adminResult = await client.query(adminQuery, ['admin']);
      let adminId = adminResult.rows[0]?.id;

      if (!adminId) {
        const firstUserResult = await client.query('SELECT id FROM users LIMIT 1');
        adminId = firstUserResult.rows[0]?.id;

        if (!adminId) {
          throw new Error('No users found in the database');
        }
      }

      // Import each template
      for (const fileName of htmlFiles) {
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
        let category = 'General';
        if (
          name.includes('verification') ||
          name.includes('onboarding') ||
          name.includes('welcome') ||
          name.includes('password-reset')
        ) {
          category = 'Authentication';
        } else if (
          name.includes('interview') ||
          name.includes('reminder') ||
          name.includes('invitation')
        ) {
          category = 'Notifications';
        } else if (name.includes('feedback')) {
          category = 'Feedback';
        } else if (name.includes('billing') || name.includes('subscription')) {
          category = 'Billing';
        }

        // Extract subject from content or create default
        let subject = `${displayName} Notification`;
        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          subject = titleMatch[1];
        }

        // Check if template already exists
        const existingQuery = 'SELECT id FROM email_templates WHERE name = $1';
        const existingResult = await client.query(existingQuery, [name]);

        if (existingResult.rows.length === 0) {
          // Insert new template
          await client.query(
            `
            INSERT INTO email_templates (
              name, display_name, description, category, 
              subject_template, html_content, variables,
              created_by, updated_by, is_active, is_system
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, TRUE, FALSE)
          `,
            [
              name,
              displayName,
              `Email template for ${displayName}`,
              category,
              subject,
              content,
              JSON.stringify([]),
              adminId,
            ]
          );

          importedCount++;
        }
      }

      await client.query('COMMIT');

      res.json({
        message: `Successfully imported ${importedCount} email templates`,
        imported_count: importedCount,
        total_files: htmlFiles.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error importing email templates:', error);
    res.status(500).json({ error: 'Failed to import email templates: ' + error.message });
  }
});

module.exports = router;
