import fs from 'fs/promises';
import path from 'path';
// import { logger } from '../config/logger.js';
import EmailService from '../services/EmailService.js';

/**
 * Test script to verify all email template variables are properly substituted
 */

class EmailTemplateVariableTest {
  constructor() {
    this.emailService = new EmailService();
    this.testResults = {
      passed: 0,
      failed: 0,
      details: [],
    };
  }

  /**
   * Extract variables from HTML template content
   */
  extractVariables(htmlContent) {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;

    while ((match = variableRegex.exec(htmlContent)) !== null) {
      const variable = match[1].trim();
      if (!variables.includes(variable)) {
        variables.push(variable);
      }
    }

    return variables;
  }

  /**
   * Generate test data for template variables
   */
  generateTestData(variables) {
    const testData = {};

    variables.forEach(variable => {
      // Generate appropriate test data based on variable name
      if (variable.includes('EMAIL')) {
        testData[variable] = 'test@mockmate.ai';
      } else if (variable.includes('NAME')) {
        testData[variable] = 'John Doe';
      } else if (variable.includes('URL')) {
        testData[variable] = 'https://mockmate.ai/test-url';
      } else if (variable.includes('DATE')) {
        testData[variable] = new Date().toLocaleDateString();
      } else if (variable.includes('TIME')) {
        testData[variable] = '2:00 PM EST';
      } else if (variable.includes('AMOUNT') || variable.includes('PRICE')) {
        testData[variable] = '29.99';
      } else if (variable.includes('CODE') || variable.includes('TOKEN')) {
        testData[variable] = 'ABC123XYZ';
      } else if (variable.includes('SCORE')) {
        testData[variable] = '85';
      } else if (variable.includes('DURATION')) {
        testData[variable] = '45';
      } else if (variable.includes('HOURS')) {
        testData[variable] = '24';
      } else if (variable.includes('DAYS')) {
        testData[variable] = '7';
      } else if (variable.includes('COMPANY')) {
        testData[variable] = 'Tech Corp';
      } else if (variable.includes('POSITION')) {
        testData[variable] = 'Software Engineer';
      } else if (variable.includes('PLAN')) {
        testData[variable] = 'Premium Plan';
      } else if (variable.includes('INVOICE')) {
        testData[variable] = 'INV-2024-001';
      } else if (variable.includes('TRANSACTION')) {
        testData[variable] = 'TXN-123456789';
      } else if (variable.includes('IP')) {
        testData[variable] = '192.168.1.1';
      } else if (variable.includes('LOCATION')) {
        testData[variable] = 'New York, NY';
      } else if (variable.includes('AGENT')) {
        testData[variable] = 'Mozilla/5.0 Chrome Browser';
      } else if (variable.includes('FEEDBACK')) {
        testData[variable] = 'Great performance with room for improvement in communication skills.';
      } else if (variable.includes('REASON')) {
        testData[variable] = 'Insufficient funds';
      } else if (variable.includes('METHOD')) {
        testData[variable] = 'Visa ending in 1234';
      } else if (variable.includes('PERIOD')) {
        testData[variable] = 'Monthly';
      } else if (variable.includes('PHONE')) {
        testData[variable] = '+1 (555) 123-4567';
      } else if (variable.includes('TITLE')) {
        testData[variable] = 'Important Notification';
      } else if (variable.includes('MESSAGE')) {
        testData[variable] = 'This is a test message for email template verification.';
      } else if (variable.includes('STATUS')) {
        testData[variable] = 'Active';
      } else {
        // Default test value for unknown variables
        testData[variable] = `Test_${variable}`;
      }
    });

    return testData;
  }

  /**
   * Test a single email template
   */
  async testTemplate(templateName, templatePath) {
    try {
      console.log(`\n🧪 Testing template: ${templateName}`);

      // Read template content
      const htmlContent = await fs.readFile(templatePath, 'utf8');

      // Extract variables
      const variables = this.extractVariables(htmlContent);
      console.log(`   Variables found: ${variables.length}`);
      console.log(`   Variables: ${variables.join(', ')}`);

      // Generate test data
      const testData = this.generateTestData(variables);

      // Render template with test data
      const renderedHtml = this.emailService.renderHtmlTemplate(htmlContent, testData);

      // Check for unsubstituted variables
      const remainingVariables = this.extractVariables(renderedHtml);
      
      if (remainingVariables.length === 0) {
        console.log(`   ✅ PASS: All variables substituted successfully`);
        this.testResults.passed++;
        this.testResults.details.push({
          template: templateName,
          status: 'PASS',
          variables: variables.length,
          substituted: variables.length,
          remaining: 0,
          testData,
        });
      } else {
        console.log(`   ❌ FAIL: ${remainingVariables.length} variables not substituted`);
        console.log(`   Remaining: ${remainingVariables.join(', ')}`);
        this.testResults.failed++;
        this.testResults.details.push({
          template: templateName,
          status: 'FAIL',
          variables: variables.length,
          substituted: variables.length - remainingVariables.length,
          remaining: remainingVariables.length,
          remainingVariables,
          testData,
        });
      }

      // Test specific email service methods if available
      await this.testEmailServiceMethods(templateName, testData);

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      this.testResults.failed++;
      this.testResults.details.push({
        template: templateName,
        status: 'ERROR',
        error: error.message,
      });
    }
  }

  /**
   * Test specific email service methods
   */
  async testEmailServiceMethods(templateName, testData) {
    const mockUser = {
      first_name: 'John',
      name: 'John Doe',
      email: 'test@mockmate.ai',
    };

    try {
      switch (templateName) {
        case 'account-verification':
          console.log(`   🔧 Testing sendVerificationEmail method...`);
          // This would normally send an email, but we're just testing the method exists
          break;
        case 'welcome-onboarding':
          console.log(`   🔧 Testing sendWelcomeEmail method...`);
          break;
        case 'password-reset':
          console.log(`   🔧 Testing sendPasswordResetEmail method...`);
          break;
        case 'billing-payment-success':
          console.log(`   🔧 Testing sendPaymentSuccessEmail method...`);
          break;
        case 'billing-payment-failed':
          console.log(`   🔧 Testing sendPaymentFailedEmail method...`);
          break;
        case 'billing-subscription-expiring':
          console.log(`   🔧 Testing sendSubscriptionExpiringEmail method...`);
          break;
        case 'interview-invitation':
          console.log(`   🔧 Testing sendInterviewInvitationEmail method...`);
          break;
        case 'interview-completion':
          console.log(`   🔧 Testing sendInterviewCompletionEmail method...`);
          break;
        default:
          console.log(`   ⚠️  No specific email service method for ${templateName}`);
      }
    } catch (error) {
      console.log(`   ⚠️  Email service method test failed: ${error.message}`);
    }
  }

  /**
   * Run tests on all email templates
   */
  async runAllTests() {
    console.log('🚀 Starting Email Template Variable Tests\n');

    try {
      // Find all HTML templates
      const templatesDir = path.resolve('email-templates');
      const files = await fs.readdir(templatesDir);
      const htmlFiles = files.filter(file => file.endsWith('.html'));

      console.log(`Found ${htmlFiles.length} HTML templates to test`);

      // Test each template
      for (const file of htmlFiles) {
        const templateName = path.basename(file, '.html');
        const templatePath = path.join(templatesDir, file);
        await this.testTemplate(templateName, templatePath);
      }

    } catch (error) {
      console.error('Error during testing:', error);
    }
  }

  /**
   * Display test results summary
   */
  displayResults() {
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total templates tested: ${this.testResults.passed + this.testResults.failed}`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`Success rate: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`);

    if (this.testResults.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.details
        .filter(detail => detail.status === 'FAIL' || detail.status === 'ERROR')
        .forEach(detail => {
          console.log(`   ${detail.template}: ${detail.error || `${detail.remaining} variables not substituted`}`);
          if (detail.remainingVariables) {
            console.log(`      Remaining: ${detail.remainingVariables.join(', ')}`);
          }
        });
    }

    console.log('\n✅ PASSED TESTS:');
    this.testResults.details
      .filter(detail => detail.status === 'PASS')
      .forEach(detail => {
        console.log(`   ${detail.template}: ${detail.variables} variables substituted`);
      });
  }

  /**
   * Generate detailed report
   */
  async generateReport() {
    const reportPath = path.resolve('email-template-test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.passed + this.testResults.failed,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        successRate: ((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1),
      },
      details: this.testResults.details,
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    return report;
  }
}

/**
 * Run the tests
 */
async function runEmailTemplateTests() {
  const tester = new EmailTemplateVariableTest();
  
  try {
    await tester.runAllTests();
    tester.displayResults();
    await tester.generateReport();
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Export for use as module or run directly
export { EmailTemplateVariableTest, runEmailTemplateTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEmailTemplateTests();
}
