import fs from 'fs/promises';
import path from 'path';
import { logger } from '../config/logger.js';

/**
 * Service for extracting and managing template variables
 * Provides comprehensive variable detection, categorization, and descriptions
 */
class TemplateVariableService {
  constructor() {
    this.variableRegistry = new Map();
    this.categories = new Map();
    this.initializeVariableCategories();
  }

  /**
   * Initialize predefined variable categories and descriptions
   */
  initializeVariableCategories() {
    // User Information Variables
    this.categories.set('User', {
      name: 'User Information',
      description: 'Variables related to user data and account information',
      color: '#3B82F6',
      variables: {
        USER_NAME: 'Full name of the user',
        USER_FIRST_NAME: 'First name of the user',
        USER_LAST_NAME: 'Last name of the user',
        USER_EMAIL: 'Email address of the user',
        USER_ID: 'Unique identifier for the user',
      },
    });

    // Company Information Variables
    this.categories.set('Company', {
      name: 'Company Information',
      description: 'Variables related to company and employer information',
      color: '#10B981',
      variables: {
        COMPANY_NAME: 'Name of the company',
        COMPANY_CONTACT_EMAIL: 'Company contact email address',
        POSITION: 'Job position or role title',
        DEPARTMENT: 'Department within the company',
      },
    });

    // Interview Variables
    this.categories.set('Interview', {
      name: 'Interview Details',
      description: 'Variables related to interview scheduling and details',
      color: '#F59E0B',
      variables: {
        INTERVIEW_DATE: 'Scheduled interview date',
        INTERVIEW_TIME: 'Scheduled interview time',
        INTERVIEW_TYPE: 'Type of interview (e.g., Video Call, Phone)',
        INTERVIEWER_NAME: 'Name of the interviewer',
        INTERVIEWER_TITLE: 'Title/position of the interviewer',
        DURATION: 'Expected duration of the interview',
        TIMEZONE: 'Timezone for the interview',
        MEETING_LINK: 'Video conference or meeting link',
        HOURS_UNTIL: 'Hours until the interview',
      },
    });

    // Platform URLs
    this.categories.set('URLs', {
      name: 'Platform URLs',
      description: 'Links to various parts of the MockMate platform',
      color: '#8B5CF6',
      variables: {
        LOGIN_URL: 'Link to the login page',
        WEBSITE_URL: 'Main website URL',
        SUPPORT_URL: 'Link to support or help page',
        UNSUBSCRIBE_URL: 'Link to unsubscribe from emails',
        CONFIRM_BY_DATE: 'Confirmation deadline date',
      },
    });

    // Billing & Payments
    this.categories.set('Billing', {
      name: 'Billing & Payments',
      description: 'Variables related to billing, subscriptions, and payments',
      color: '#EF4444',
      variables: {
        BILLING_TYPE: 'Type of billing transaction',
        BILLING_TITLE: 'Title of the billing notification',
        PLAN_NAME: 'Name of the subscription plan',
        AMOUNT: 'Payment or billing amount',
        PURCHASE_AMOUNT: 'Amount paid for purchase',
        NEXT_BILLING_DATE: 'Next billing cycle date',
        TRANSACTION_ID: 'Unique transaction identifier',
        CREDITS_AMOUNT: 'Number of credits purchased or used',
        CURRENT_CREDITS: 'Current credit balance',
        PREVIOUS_CREDITS: 'Previous credit balance',
        BONUS_CREDITS: 'Bonus credits received',
        RECEIPT_URL: 'Link to download receipt',
        PACKAGE_NAME: 'Name of purchased package',
        UNIT_PRICE: 'Price per credit',
        PAYMENT_METHOD: 'Payment method used',
      },
    });

    // OTP & Security Variables
    this.categories.set('Security', {
      name: 'Security & OTP',
      description: 'Variables related to security, OTP, and verification',
      color: '#DC2626',
      variables: {
        OTP_CODE: 'One-time password code',
        OTP_ACTION_TYPE: 'Type of action requiring OTP',
        OTP_ACTION_TITLE: 'Title of OTP action',
        OTP_MESSAGE: 'Custom OTP message',
        OTP_EXPIRY_TIME: 'Time when OTP expires',
        OTP_EXPIRY_MINUTES: 'OTP expiry in minutes',
        OTP_VERIFICATION_URL: 'URL for OTP verification',
        OTP_SECURITY_LEVEL: 'Security level of OTP',
        OTP_INITIATED_BY: 'Who initiated the OTP',
        IS_ADMIN_ACTION: 'Whether this is an admin action',
        VERIFICATION_LINK: 'General verification link',
        VERIFICATION_CODE: 'Verification code',
        RESET_LINK: 'Password reset link',
        REQUEST_IP: 'IP address of request',
        USER_AGENT: 'Browser user agent',
        REQUEST_ID: 'Unique request identifier',
        SESSION_ID: 'Session identifier',
      },
    });

    // System Variables
    this.categories.set('System', {
      name: 'System Variables',
      description: 'System-generated variables and metadata',
      color: '#6B7280',
      variables: {
        CURRENT_YEAR: 'Current year',
        CURRENT_DATE: 'Current date',
        BASE_URL: 'Base URL of the application',
        PLATFORM_NAME: 'Name of the platform (MockMate)',
        NOTIFICATION_DATE: 'Date when notification was sent',
      },
    });
  }

  /**
   * Extract all variables from HTML template content
   */
  extractVariablesFromHtml(htmlContent) {
    const variablePattern = /\{\{\s*([A-Z_][A-Z0-9_]*)\s*\}\}/gi;
    const variables = new Set();
    let match;

    while ((match = variablePattern.exec(htmlContent)) !== null) {
      variables.add(match[1].toUpperCase());
    }

    return Array.from(variables);
  }

  /**
   * Extract variables from a template file
   */
  async extractVariablesFromTemplate(templatePath) {
    try {
      const content = await fs.readFile(templatePath, 'utf8');
      return this.extractVariablesFromHtml(content);
    } catch (error) {
      logger.error(`Failed to extract variables from template: ${templatePath}`, error);
      throw new Error(`Could not read template file: ${templatePath}`);
    }
  }

  /**
   * Get all available variables from a directory of templates
   */
  async getAllVariablesFromDirectory(templatesDir) {
    try {
      const files = await fs.readdir(templatesDir);
      const htmlFiles = files.filter(file => file.endsWith('.html'));

      const allVariables = new Set();
      const templateVariables = {};

      for (const fileName of htmlFiles) {
        const filePath = path.join(templatesDir, fileName);
        const templateName = path.basename(fileName, '.html');

        try {
          const variables = await this.extractVariablesFromTemplate(filePath);
          templateVariables[templateName] = variables;
          variables.forEach(variable => allVariables.add(variable));
        } catch (error) {
          logger.warn(`Failed to process template ${fileName}:`, error.message);
        }
      }

      return {
        allVariables: Array.from(allVariables),
        templateVariables,
        totalTemplates: htmlFiles.length,
      };
    } catch (error) {
      logger.error(`Failed to scan templates directory: ${templatesDir}`, error);
      throw error;
    }
  }

  /**
   * Categorize variables based on predefined categories
   */
  categorizeVariables(variables) {
    const categorized = {
      knownVariables: {},
      unknownVariables: [],
    };

    for (const variable of variables) {
      let found = false;

      for (const [categoryKey, category] of this.categories) {
        if (category.variables[variable]) {
          if (!categorized.knownVariables[categoryKey]) {
            categorized.knownVariables[categoryKey] = {
              ...category,
              variables: {},
            };
          }
          categorized.knownVariables[categoryKey].variables[variable] =
            category.variables[variable];
          found = true;
          break;
        }
      }

      if (!found) {
        categorized.unknownVariables.push(variable);
      }
    }

    return categorized;
  }

  /**
   * Generate test data for all variables
   */
  generateTestData(variables = []) {
    const testData = {};

    // Default test values for each category
    const defaultTestValues = {
      // User variables
      USER_NAME: 'John Doe',
      USER_FIRST_NAME: 'John',
      USER_LAST_NAME: 'Doe',
      USER_EMAIL: 'john.doe@example.com',
      USER_ID: 'user_12345',

      // Company variables
      COMPANY_NAME: 'TechCorp Inc.',
      COMPANY_CONTACT_EMAIL: 'hr@techcorp.com',
      POSITION: 'Senior Software Engineer',
      DEPARTMENT: 'Engineering',

      // Interview variables
      INTERVIEW_DATE: '2025-08-25',
      INTERVIEW_TIME: '2:00 PM EST',
      INTERVIEW_TYPE: 'Video Call',
      INTERVIEWER_NAME: 'Sarah Johnson',
      INTERVIEWER_TITLE: 'Engineering Manager',
      DURATION: '60 minutes',
      TIMEZONE: 'Eastern Standard Time',
      MEETING_LINK: 'https://meet.google.com/abc-defg-hij',
      HOURS_UNTIL: '24',

      // URL variables
      LOGIN_URL: 'https://mockmate.ai/login',
      WEBSITE_URL: 'https://mockmate.ai',
      SUPPORT_URL: 'https://mockmate.ai/support',
      UNSUBSCRIBE_URL: 'https://mockmate.ai/unsubscribe',
      CONFIRM_BY_DATE: '2025-08-20',

      // Billing variables
      BILLING_TYPE: 'Subscription Renewal',
      BILLING_TITLE: 'Payment Successful',
      PLAN_NAME: 'Professional Plan',
      AMOUNT: '$29.99',
      NEXT_BILLING_DATE: '2025-09-19',
      TRANSACTION_ID: 'txn_1234567890',
      CREDITS_AMOUNT: '100',

      // Billing variables (extended)
      PURCHASE_AMOUNT: '$19.99',
      CURRENT_CREDITS: '125',
      PREVIOUS_CREDITS: '25',
      BONUS_CREDITS: '5',
      RECEIPT_URL: 'https://mockmate.ai/billing/receipt/123',
      PACKAGE_NAME: 'Starter Pack',
      UNIT_PRICE: '$0.99',
      PAYMENT_METHOD: 'Visa ****1234',

      // OTP/Security variables
      OTP_CODE: '123456',
      OTP_ACTION_TYPE: 'account verification',
      OTP_ACTION_TITLE: 'ACCOUNT VERIFICATION REQUIRED',
      OTP_MESSAGE: 'Please verify your account to continue.',
      OTP_EXPIRY_TIME: '15 minutes',
      OTP_EXPIRY_MINUTES: '15',
      OTP_VERIFICATION_URL: 'https://mockmate.ai/verify',
      OTP_SECURITY_LEVEL: 'HIGH',
      OTP_INITIATED_BY: 'User Request',
      IS_ADMIN_ACTION: false,
      VERIFICATION_LINK: 'https://mockmate.ai/verify?token=abc123',
      VERIFICATION_CODE: 'ABC123DEF',
      RESET_LINK: 'https://mockmate.ai/reset?token=xyz789',
      REQUEST_IP: '192.168.1.100',
      USER_AGENT: 'Mozilla/5.0 Chrome/91.0',
      REQUEST_ID: 'REQ-123456789',
      SESSION_ID: 'SES-987654321',

      // System variables
      CURRENT_YEAR: new Date().getFullYear().toString(),
      CURRENT_DATE: new Date().toISOString().split('T')[0],
      BASE_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
      PLATFORM_NAME: 'MockMate',
      NOTIFICATION_DATE: new Date().toISOString(),
      TIMESTAMP: new Date().toLocaleString(),
      DATE: new Date().toLocaleDateString(),
      TIME: new Date().toLocaleTimeString(),
    };

    // Generate test data for requested variables
    for (const variable of variables) {
      if (defaultTestValues[variable]) {
        testData[variable] = defaultTestValues[variable];
      } else {
        // Generate placeholder for unknown variables
        testData[variable] = `[${variable.toLowerCase().replace(/_/g, ' ')}]`;
      }
    }

    return testData;
  }

  /**
   * Validate template variables against content
   */
  validateTemplateVariables(templateContent, expectedVariables = []) {
    const foundVariables = this.extractVariablesFromHtml(templateContent);
    const validation = {
      valid: true,
      foundVariables,
      missingVariables: [],
      extraVariables: [],
      issues: [],
    };

    // Check for missing expected variables
    for (const expected of expectedVariables) {
      if (!foundVariables.includes(expected)) {
        validation.missingVariables.push(expected);
        validation.valid = false;
        validation.issues.push(`Missing expected variable: ${expected}`);
      }
    }

    // Check for extra variables (not in expected list)
    if (expectedVariables.length > 0) {
      for (const found of foundVariables) {
        if (!expectedVariables.includes(found)) {
          validation.extraVariables.push(found);
          validation.issues.push(`Unexpected variable found: ${found}`);
        }
      }
    }

    return validation;
  }

  /**
   * Get variable usage statistics across templates
   */
  async getVariableUsageStats(templatesDir) {
    try {
      const { allVariables, templateVariables } =
        await this.getAllVariablesFromDirectory(templatesDir);
      const stats = {};

      for (const variable of allVariables) {
        const usageCount = Object.values(templateVariables).filter(templateVars =>
          templateVars.includes(variable)
        ).length;

        stats[variable] = {
          usageCount,
          templates: Object.keys(templateVariables).filter(template =>
            templateVariables[template].includes(variable)
          ),
        };
      }

      return {
        totalVariables: allVariables.length,
        variableStats: stats,
        mostUsedVariables: Object.entries(stats)
          .sort(([, a], [, b]) => b.usageCount - a.usageCount)
          .slice(0, 10)
          .map(([variable, data]) => ({ variable, ...data })),
      };
    } catch (error) {
      logger.error('Failed to generate variable usage stats:', error);
      throw error;
    }
  }

  /**
   * Preview template with test data
   */
  async previewTemplate(templatePath, customTestData = {}) {
    try {
      const variables = await this.extractVariablesFromTemplate(templatePath);
      const testData = { ...this.generateTestData(variables), ...customTestData };

      let content = await fs.readFile(templatePath, 'utf8');

      // Replace variables with test data
      for (const [variable, value] of Object.entries(testData)) {
        const regex = new RegExp(`\\{\\{\\s*${variable}\\s*\\}\\}`, 'gi');
        content = content.replace(regex, String(value));
      }

      return {
        renderedContent: content,
        variables,
        testData,
        templateName: path.basename(templatePath, '.html'),
      };
    } catch (error) {
      logger.error('Failed to preview template:', error);
      throw error;
    }
  }

  /**
   * Render HTML template with variable substitution
   */
  renderHtmlTemplate(htmlContent, templateData = {}) {
    let rendered = htmlContent;

    // Replace {{VARIABLE}} placeholders with actual values
    for (const [key, value] of Object.entries(templateData)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      rendered = rendered.replace(regex, String(value || ''));
    }

    // Replace any remaining unmatched variables with empty string
    rendered = rendered.replace(/{{\s*[^}]+\s*}}/g, '');

    return rendered;
  }

  /**
   * Get comprehensive template analysis
   */
  async analyzeTemplate(templatePath) {
    try {
      const variables = await this.extractVariablesFromTemplate(templatePath);
      const categorized = this.categorizeVariables(variables);
      const content = await fs.readFile(templatePath, 'utf8');

      return {
        templateName: path.basename(templatePath, '.html'),
        totalVariables: variables.length,
        variables,
        categorizedVariables: categorized,
        testData: this.generateTestData(variables),
        contentLength: content.length,
        analysis: {
          knownVariableCount: Object.values(categorized.knownVariables).reduce(
            (count, category) => count + Object.keys(category.variables).length,
            0
          ),
          unknownVariableCount: categorized.unknownVariables.length,
          categoryBreakdown: Object.entries(categorized.knownVariables).map(([key, category]) => ({
            category: key,
            name: category.name,
            count: Object.keys(category.variables).length,
            variables: Object.keys(category.variables),
          })),
        },
      };
    } catch (error) {
      logger.error('Failed to analyze template:', error);
      throw error;
    }
  }

  /**
   * Generate dynamic variables based on context and user data
   */
  generateDynamicVariables(context = {}) {
    const variables = {};

    // User variables from context
    if (context.user) {
      variables.USER_NAME = context.user.name || context.user.first_name || 'User';
      variables.USER_FIRST_NAME =
        context.user.first_name || context.user.name?.split(' ')[0] || 'User';
      variables.USER_LAST_NAME =
        context.user.last_name || context.user.name?.split(' ').slice(1).join(' ') || '';
      variables.USER_EMAIL = context.user.email || '';
      variables.USER_ID = context.user.id || '';
    }

    // Transaction variables from context
    if (context.transaction || context.purchase) {
      const trans = context.transaction || context.purchase;
      variables.TRANSACTION_ID = trans.id || trans.transaction_id || this.generateTransactionId();
      variables.PURCHASE_AMOUNT = trans.amount || trans.amount_usd || '0.00';
      variables.CREDITS_AMOUNT = trans.credits || trans.credits_purchased || '0';
      variables.PAYMENT_METHOD = trans.payment_method || trans.payment_provider || 'Credit Card';
    }

    // OTP variables from context
    if (context.otp || context.otpCode) {
      variables.OTP_CODE = context.otp || context.otpCode || this.generateOTP();
      variables.OTP_ACTION_TYPE = context.otpAction || 'verification';
      variables.OTP_EXPIRY_MINUTES = context.otpExpiry || '15';
    }

    // System variables
    variables.TIMESTAMP = new Date().toLocaleString();
    variables.DATE = new Date().toLocaleDateString();
    variables.TIME = new Date().toLocaleTimeString();
    variables.CURRENT_YEAR = new Date().getFullYear().toString();
    variables.REQUEST_ID = this.generateRequestId();
    variables.SESSION_ID = this.generateSessionId();

    // Merge with any custom variables
    return { ...variables, ...(context.customVariables || {}) };
  }

  /**
   * Generate OTP code
   */
  generateOTP(length = 6) {
    return Math.floor(Math.random() * Math.pow(10, length))
      .toString()
      .padStart(length, '0');
  }

  /**
   * Generate transaction ID
   */
  generateTransactionId() {
    return 'TXN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }

  /**
   * Generate request ID
   */
  generateRequestId() {
    return 'REQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8).toUpperCase();
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return 'SES-' + Math.random().toString(36).substr(2, 12).toUpperCase();
  }

  /**
   * Auto-populate variables for specific email events
   */
  getVariablesForEvent(eventType, context = {}) {
    const baseVariables = this.generateDynamicVariables(context);

    switch (eventType) {
      case 'CREDITS_PURCHASE':
        return {
          ...baseVariables,
          RECEIPT_URL:
            context.receiptUrl ||
            `${process.env.FRONTEND_URL}/billing/receipt/${baseVariables.TRANSACTION_ID}`,
          PACKAGE_NAME: context.packageName || 'Credit Package',
          CURRENT_CREDITS: context.currentCredits || '0',
          PREVIOUS_CREDITS: context.previousCredits || '0',
        };

      case 'OTP_VERIFICATION':
        return {
          ...baseVariables,
          OTP_VERIFICATION_URL: context.verificationUrl || `${process.env.FRONTEND_URL}/verify`,
          OTP_SECURITY_LEVEL: context.securityLevel || 'HIGH',
          OTP_INITIATED_BY: context.initiatedBy || 'User Request',
          OTP_ACTION_TITLE: (context.otpAction || 'verification').toUpperCase() + ' REQUIRED',
          IS_ADMIN_ACTION: context.isAdminAction || false,
        };

      case 'EMAIL_VERIFICATION':
        return {
          ...baseVariables,
          VERIFICATION_LINK:
            context.verificationLink ||
            `${process.env.FRONTEND_URL}/verify?token=${this.generateSessionId()}`,
          VERIFICATION_CODE: context.verificationCode || this.generateOTP(8).toUpperCase(),
        };

      case 'PASSWORD_RESET':
        return {
          ...baseVariables,
          RESET_LINK:
            context.resetLink ||
            `${process.env.FRONTEND_URL}/reset?token=${this.generateSessionId()}`,
          EXPIRY_TIME: context.expiryTime || '1 hour',
        };

      default:
        return baseVariables;
    }
  }
}

export default TemplateVariableService;
