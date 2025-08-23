import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import AutomatedEmailService from '../services/AutomatedEmailService.js';
import TemplateVariableService from '../services/TemplateVariableService.js';
import { EMAIL_EVENTS } from '../config/emailTemplates.js';

describe('Email Template Tests', () => {
  let automatedEmailService;
  let variableService;
  let mockDatabase;
  let mockDynamicConfig;

  beforeAll(async () => {
    // Mock database
    mockDatabase = {
      query: jest.fn().mockImplementation((query, params) => {
        if (query.includes('SELECT * FROM users')) {
          return {
            rows: [
              {
                id: 'test-user-123',
                email: 'test@example.com',
                first_name: 'John',
                last_name: 'Doe',
                name: 'John Doe',
                credits: 50,
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (query.includes('SELECT * FROM credit_transactions')) {
          return {
            rows: [
              {
                id: 'txn-123',
                credits_amount: 25,
                cost_usd: 19.99,
                transaction_type: 'purchase',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };

    // Mock dynamic config
    mockDynamicConfig = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        const configs = {
          EMAIL_FROM: 'test@mockmate.ai',
          SMTP_HOST: 'localhost',
          SMTP_PORT: '587',
          SMTP_USER: 'test',
          SMTP_PASS: 'test',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return Promise.resolve(configs[key] || defaultValue);
      }),
    };

    variableService = new TemplateVariableService();

    // Don't initialize the email service for tests (no real SMTP)
    automatedEmailService = new AutomatedEmailService(mockDatabase, mockDynamicConfig);

    // Mock the email service methods
    automatedEmailService.emailService.sendEmail = jest.fn().mockResolvedValue({
      success: true,
      messageId: 'test-message-id-123',
      trackingId: 'tracking-123',
    });
  });

  describe('Template Variable Generation', () => {
    it('should generate proper variables for credits purchase', async () => {
      const context = {
        user: {
          id: 'user-123',
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          credits: 75,
        },
        transaction: {
          id: 'txn-456',
          credits_amount: 25,
          cost_usd: 19.99,
        },
        purchase: {
          package_name: 'Starter Pack',
          unit_price: 0.79,
        },
      };

      const variables = variableService.getVariablesForEvent('CREDITS_PURCHASE', context);

      expect(variables).toHaveProperty('USER_NAME', 'John');
      expect(variables).toHaveProperty('USER_EMAIL', 'john@example.com');
      expect(variables).toHaveProperty('TRANSACTION_ID', 'txn-456');
      expect(variables).toHaveProperty('CREDITS_AMOUNT', 25);
      expect(variables).toHaveProperty('PURCHASE_AMOUNT', 19.99);
      expect(variables).toHaveProperty('PACKAGE_NAME', 'Starter Pack');
      expect(variables).toHaveProperty('TIMESTAMP');
      expect(variables).toHaveProperty('REQUEST_ID');
    });

    it('should generate proper variables for OTP verification', async () => {
      const context = {
        user: {
          id: 'user-123',
          email: 'john@example.com',
          first_name: 'John',
        },
        otp: '123456',
        otpAction: 'password reset',
        isAdminAction: true,
      };

      const variables = variableService.getVariablesForEvent('OTP_VERIFICATION', context);

      expect(variables).toHaveProperty('USER_NAME', 'John');
      expect(variables).toHaveProperty('USER_EMAIL', 'john@example.com');
      expect(variables).toHaveProperty('OTP_CODE', '123456');
      expect(variables).toHaveProperty('OTP_ACTION_TYPE', 'password reset');
      expect(variables).toHaveProperty('IS_ADMIN_ACTION', true);
      expect(variables).toHaveProperty('OTP_SECURITY_LEVEL', 'HIGH');
    });
  });

  describe('Template File Validation', () => {
    it('should validate credits purchase template exists and has required variables', async () => {
      const templatePath = path.resolve('email-templates/billing/credits-purchase.mjml');

      try {
        const content = await fs.readFile(templatePath, 'utf8');
        expect(content).toContain('{{USER_NAME}}');
        expect(content).toContain('{{CREDITS_AMOUNT}}');
        expect(content).toContain('{{PURCHASE_AMOUNT}}');
        expect(content).toContain('{{TRANSACTION_ID}}');
        expect(content).toContain('{{TIMESTAMP}}');
      } catch (error) {
        throw new Error(`Credits purchase template not found or invalid: ${error.message}`);
      }
    });

    it('should validate OTP template exists and has required variables', async () => {
      const templatePath = path.resolve('email-templates/authentication/otp-verification.mjml');

      try {
        const content = await fs.readFile(templatePath, 'utf8');
        expect(content).toContain('{{USER_NAME}}');
        expect(content).toContain('{{OTP_CODE}}');
        expect(content).toContain('{{OTP_ACTION_TYPE}}');
        expect(content).toContain('{{OTP_ACTION_TITLE}}');
        expect(content).toContain('{{IS_ADMIN_ACTION}}');
      } catch (error) {
        throw new Error(`OTP template not found or invalid: ${error.message}`);
      }
    });

    it('should validate billing subscription template exists', async () => {
      const templatePath = path.resolve('email-templates/billing/billing-subscription.mjml');

      try {
        const content = await fs.readFile(templatePath, 'utf8');
        expect(content).toContain('{{BILLING_TYPE}}');
        expect(content).toContain('{{BILLING_TITLE}}');
        expect(content).toContain('{{USER_NAME}}');
        expect(content).toContain('{{PLAN_NAME}}');
      } catch (error) {
        throw new Error(`Billing subscription template not found or invalid: ${error.message}`);
      }
    });

    it('should validate notification template exists', async () => {
      const templatePath = path.resolve('email-templates/notifications/notification.mjml');

      try {
        const content = await fs.readFile(templatePath, 'utf8');
        expect(content).toContain('{{NOTIFICATION_TITLE}}');
        expect(content).toContain('{{NOTIFICATION_MESSAGE}}');
        expect(content).toContain('{{NOTIFICATION_TYPE}}');
        expect(content).toContain('{{USER_NAME}}');
      } catch (error) {
        throw new Error(`Notification template not found or invalid: ${error.message}`);
      }
    });
  });

  describe('Automated Email Service', () => {
    it('should trigger credits purchase email correctly', async () => {
      const userId = 'test-user-123';
      const transactionId = 'txn-123';
      const purchaseData = {
        package_name: 'Premium Pack',
        unit_price: 0.89,
        bonus_credits: 5,
      };

      const result = await automatedEmailService.onCreditsPurchased(
        userId,
        transactionId,
        purchaseData
      );

      expect(result.success).toBe(true);
      expect(automatedEmailService.emailService.sendEmail).toHaveBeenCalled();

      const callArgs = automatedEmailService.emailService.sendEmail.mock.calls[0];
      expect(callArgs[0]).toBe(EMAIL_EVENTS.CREDITS_BUY);
      expect(callArgs[1]).toBe('test@example.com');
      expect(callArgs[2]).toHaveProperty('USER_NAME');
      expect(callArgs[2]).toHaveProperty('CREDITS_AMOUNT');
    });

    it('should trigger OTP email correctly', async () => {
      const userId = 'test-user-123';
      const otpCode = '654321';
      const action = 'account verification';
      const options = {
        isAdminAction: false,
        requestIP: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      const result = await automatedEmailService.onOTPGenerated(userId, otpCode, action, options);

      expect(result.success).toBe(true);
      expect(automatedEmailService.emailService.sendEmail).toHaveBeenCalled();

      const callArgs = automatedEmailService.emailService.sendEmail.mock.calls[1];
      expect(callArgs[1]).toBe('test@example.com');
      expect(callArgs[2]).toHaveProperty('OTP_CODE', '654321');
      expect(callArgs[2]).toHaveProperty('OTP_ACTION_TYPE', 'account verification');
    });

    it('should handle system notifications', async () => {
      const eventData = {
        user: {
          id: 'test-user-123',
          email: 'test@example.com',
          first_name: 'John',
        },
        notification: {
          title: 'System Maintenance',
          message: 'Scheduled maintenance tonight at 2 AM',
          type: 'warning',
          priority: 'high',
          actionUrl: 'https://mockmate.ai/maintenance',
        },
      };

      const result = await automatedEmailService.triggerEmail('SYSTEM_NOTIFICATION', eventData);

      expect(result.success).toBe(true);
      expect(automatedEmailService.emailService.sendEmail).toHaveBeenCalled();
    });
  });

  describe('Template Rendering Tests', () => {
    it('should render variables correctly in HTML content', () => {
      const htmlContent = `
        <div>Hello {{USER_NAME}}</div>
        <div>Your credits: {{CREDITS_AMOUNT}}</div>
        <div>Transaction: {{TRANSACTION_ID}}</div>
      `;

      const variables = {
        USER_NAME: 'John Doe',
        CREDITS_AMOUNT: '50',
        TRANSACTION_ID: 'TXN-12345',
      };

      const rendered = variableService.renderHtmlTemplate(htmlContent, variables);

      expect(rendered).toContain('Hello John Doe');
      expect(rendered).toContain('Your credits: 50');
      expect(rendered).toContain('Transaction: TXN-12345');
      expect(rendered).not.toContain('{{USER_NAME}}');
    });

    it('should handle missing variables gracefully', () => {
      const htmlContent = `
        <div>Hello {{USER_NAME}}</div>
        <div>Missing: {{MISSING_VAR}}</div>
      `;

      const variables = {
        USER_NAME: 'John Doe',
      };

      const rendered = variableService.renderHtmlTemplate(htmlContent, variables);

      expect(rendered).toContain('Hello John Doe');
      expect(rendered).not.toContain('{{USER_NAME}}');
      expect(rendered).not.toContain('{{MISSING_VAR}}');
    });
  });

  describe('Terminal Theme Consistency', () => {
    it('should validate all templates use terminal theme CSS classes', async () => {
      const templateFiles = [
        'email-templates/billing/credits-purchase.mjml',
        'email-templates/authentication/otp-verification.mjml',
        'email-templates/billing/billing-subscription.mjml',
        'email-templates/notifications/notification.mjml',
      ];

      for (const templateFile of templateFiles) {
        try {
          const content = await fs.readFile(path.resolve(templateFile), 'utf8');

          // Check for terminal theme elements
          expect(content).toContain('terminal-window');
          expect(content).toContain('terminal-header');
          expect(content).toContain('cli-prompt');
          expect(content).toContain('cli-command');
          expect(content).toContain('cli-output');
          expect(content).toContain('#00ff41'); // Terminal green color
          expect(content).toContain('Courier New'); // Terminal font
        } catch (error) {
          throw new Error(`Terminal theme validation failed for ${templateFile}: ${error.message}`);
        }
      }
    });
  });

  describe('Variable Categorization', () => {
    it('should properly categorize template variables', () => {
      const variables = [
        'USER_NAME',
        'USER_EMAIL',
        'CREDITS_AMOUNT',
        'TRANSACTION_ID',
        'OTP_CODE',
        'NOTIFICATION_TITLE',
        'UNKNOWN_VAR',
      ];

      const categorized = variableService.categorizeVariables(variables);

      expect(categorized.knownVariables).toHaveProperty('User');
      expect(categorized.knownVariables).toHaveProperty('Billing');
      expect(categorized.knownVariables).toHaveProperty('Security');
      expect(categorized.unknownVariables).toContain('UNKNOWN_VAR');
    });
  });

  describe('Integration Tests', () => {
    it('should process complete credit purchase workflow', async () => {
      // Simulate a complete credit purchase
      const userId = 'test-user-123';
      const transactionData = {
        id: 'txn-integration-test',
        credits_amount: 100,
        cost_usd: 79.99,
        package_name: 'Professional Pack',
        unit_price: 0.8,
        bonus_credits: 10,
      };

      // Mock the transaction in database
      mockDatabase.query.mockImplementation(query => {
        if (query.includes('credit_transactions')) {
          return { rows: [transactionData] };
        }
        return {
          rows: [
            {
              id: userId,
              email: 'integration@test.com',
              first_name: 'Integration',
              credits: 150,
            },
          ],
        };
      });

      const result = await automatedEmailService.onCreditsPurchased(
        userId,
        transactionData.id,
        transactionData
      );

      expect(result.success).toBe(true);
      expect(automatedEmailService.emailService.sendEmail).toHaveBeenCalledWith(
        EMAIL_EVENTS.CREDITS_BUY,
        'integration@test.com',
        expect.objectContaining({
          USER_NAME: 'Integration',
          CREDITS_AMOUNT: 100,
          PURCHASE_AMOUNT: 79.99,
          TRANSACTION_ID: 'txn-integration-test',
        }),
        expect.objectContaining({ priority: 'high' })
      );
    });
  });

  afterAll(() => {
    // Cleanup
    jest.clearAllMocks();
  });
});

// Export test utilities for manual testing
export const testUtilities = {
  /**
   * Manually test email template rendering
   */
  async testTemplateRendering(templateName, variables = {}) {
    const variableService = new TemplateVariableService();

    try {
      const templatePath = path.resolve(`email-templates/${templateName}.mjml`);
      const content = await fs.readFile(templatePath, 'utf8');
      const testVariables = variableService.generateTestData(
        variableService.extractVariablesFromHtml(content)
      );

      const finalVariables = { ...testVariables, ...variables };
      const rendered = variableService.renderHtmlTemplate(content, finalVariables);

      console.log(`✅ Template ${templateName} rendered successfully`);
      console.log(`📊 Variables used: ${Object.keys(finalVariables).length}`);

      return {
        success: true,
        rendered,
        variables: finalVariables,
        templateName,
      };
    } catch (error) {
      console.error(`❌ Template ${templateName} failed:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Test all templates
   */
  async testAllTemplates() {
    const templates = [
      'billing/credits-purchase',
      'authentication/otp-verification',
      'billing/billing-subscription',
      'notifications/notification',
    ];

    const results = [];

    for (const template of templates) {
      const result = await testUtilities.testTemplateRendering(template);
      results.push({ template, ...result });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`\n📋 Template Test Summary:`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed > 0) {
      console.log(`\n❌ Failed Templates:`);
      results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   - ${r.template}: ${r.error}`);
        });
    }

    return results;
  },
};

export default testUtilities;
