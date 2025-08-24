/**
 * MockMate Email Template Testing Script
 * This script tests all email templates with comprehensive dynamic variables
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced test data with all variables from documentation
const testData = {
  // Global Variables
  EMAIL_TITLE: "Test Email - MockMate",
  EMAIL_TYPE: "testing",
  EMAIL_CONTENT: "<div>This is placeholder content for testing the email template.</div>",
  SITE_TAGLINE: "AI-Powered Interview Platform",
  COMPANY_NAME: "MockMate",
  COMPANY_ADDRESS: "123 Tech Street, San Francisco, CA 94105",
  CURRENT_YEAR: "2024",
  
  // Contact Information
  SUPPORT_EMAIL: "support@mockmate.ai",
  SUPPORT_URL: "https://mockmate.ai/support",
  WEBSITE_URL: "https://mockmate.ai",
  PRIVACY_URL: "https://mockmate.ai/privacy",
  TERMS_URL: "https://mockmate.ai/terms",
  
  // User Variables
  USER_NAME: "John Doe",
  USER_FIRST_NAME: "John",
  USER_LAST_NAME: "Doe",
  USER_EMAIL: "john.doe@example.com",
  USER_USERNAME: "johndoe123",
  USER_ID: "usr_1234567890",
  USER_TIMEZONE: "America/New_York",
  USER_LANGUAGE: "en-US",
  USER_SUBSCRIPTION: "Premium",
  
  // Authentication Variables
  VERIFICATION_CODE: "123456",
  VERIFICATION_URL: "https://mockmate.ai/verify?token=abc123xyz789",
  VERIFICATION_TIMESTAMP: "2024-08-24 15:30:00 UTC",
  EXPIRY_MINUTES: "15",
  EXPIRY_HOURS: "24",
  RESEND_CODE_URL: "https://mockmate.ai/resend-code",
  
  // Password Reset
  RESET_URL: "https://mockmate.ai/reset-password?token=resettoken123",
  RESET_TOKEN: "resettoken123",
  REQUEST_IP: "192.168.1.100",
  REQUEST_LOCATION: "New York, NY, USA",
  REQUEST_USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124",
  REQUEST_TIMESTAMP: "August 24, 2024 at 3:30 PM EST",
  SECURITY_CONTACT_URL: "https://mockmate.ai/security/report",
  
  // Two-Factor Authentication
  "2FA_CODE": "789012",
  LOGIN_CODE: "789012",
  CHANGE_CODE: "135790",
  RESET_CODE: "246802",
  LOGIN_ATTEMPT_IP: "10.0.0.1",
  LOGIN_ATTEMPT_LOCATION: "San Francisco, CA",
  LOGIN_DEVICE: "iPhone 12 Pro",
  
  // Interview Variables
  CANDIDATE_NAME: "Jane Smith",
  INTERVIEWER_NAME: "Sarah Johnson",
  INTERVIEWER_TITLE: "Senior Engineering Manager",
  POSITION: "Senior Software Engineer",
  INTERVIEW_DATE: "August 25, 2024",
  INTERVIEW_TIME: "2:00 PM EST",
  TIMEZONE: "Eastern Standard Time",
  DURATION: "60 minutes",
  INTERVIEW_TYPE: "Video Call",
  MINUTES_UNTIL: "30",
  "^IS_URGENT": true,
  
  // Interview URLs
  MEETING_LINK: "https://meet.google.com/abc-defg-hij",
  CONFIRM_URL: "https://mockmate.ai/interview/confirm/123",
  RESCHEDULE_URL: "https://mockmate.ai/interview/reschedule/123",
  PRACTICE_URL: "https://mockmate.ai/practice",
  CONFIRM_BY_DATE: "August 20, 2024",
  
  // Interview Results
  INTERVIEW_SCORE: "85",
  TECHNICAL_FEEDBACK: "Demonstrated strong problem-solving abilities and excellent coding skills. Shows deep understanding of algorithms and data structures.",
  COMMUNICATION_FEEDBACK: "Clear and articulate responses. Good at explaining complex technical concepts in simple terms.",
  PROBLEM_SOLVING_FEEDBACK: "Excellent analytical thinking and systematic approach to problem-solving. Quick to identify edge cases and optimize solutions.",
  IMPROVEMENT_AREAS: "Consider practicing system design questions and improving knowledge of distributed systems architecture.",
  INTERVIEW_DURATION: "45",
  QUESTIONS_ANSWERED: "12",
  AVG_RESPONSE_TIME: "30",
  CONFIDENCE_LEVEL: "8",
  DETAILED_REPORT_URL: "https://mockmate.ai/reports/interview123",
  
  // Company Contact
  COMPANY_CONTACT_EMAIL: "hr@techcorp.com",
  COMPANY_CONTACT_PHONE: "+1 (555) 123-4567",
  
  // Billing Variables
  PLAN_NAME: "Professional Plan",
  PLAN_AMOUNT: "29.99",
  TOTAL_AMOUNT: "29.99",
  BILLING_PERIOD: "Monthly",
  BILLING_TYPE: "subscription_renewal",
  BILLING_TITLE: "Subscription Renewed",
  NEXT_BILLING_DATE: "September 24, 2024",
  BILLING_CYCLE_END: "September 23, 2024",
  
  // Payment Information
  PAYMENT_METHOD: "Visa ending in 1234",
  TRANSACTION_ID: "txn_1234567890",
  INVOICE_NUMBER: "INV-2024-001234",
  RECEIPT_URL: "https://mockmate.ai/receipts/123",
  DOWNLOAD_INVOICE_URL: "https://mockmate.ai/invoices/123",
  
  // Billing Management
  MANAGE_BILLING_URL: "https://mockmate.ai/billing",
  UPDATE_PAYMENT_URL: "https://mockmate.ai/billing/payment-methods",
  CANCEL_SUBSCRIPTION_URL: "https://mockmate.ai/billing/cancel",
  UPGRADE_URL: "https://mockmate.ai/billing/upgrade",
  RENEW_URL: "https://mockmate.ai/billing/renew",
  EXPIRY_DATE: "September 30, 2024",
  DAYS_REMAINING: "7",
  PLAN_PRICE: "$29.99/month",
  
  // Payment Issues
  FAILURE_REASON: "Insufficient funds",
  AMOUNT_FAILED: "$29.99",
  ATTEMPT_DATE: "August 23, 2024",
  RETRY_PAYMENT_URL: "https://mockmate.ai/billing/retry",
  NEXT_RETRY_DATE: "August 27, 2024",
  GRACE_PERIOD_END: "August 31, 2024",
  
  // Credits System
  CREDITS_AMOUNT: "100",
  CREDITS_COST: "$0.50",
  CURRENT_CREDITS: "150",
  CREDITS_USED: "25",
  
  // System Variables
  SYSTEM_STATUS: "Operational",
  STATUS_COLOR: "#00ff00",
  STATUS_CLASS: "status-online",
  NOTIFICATION_TYPE: "maintenance",
  NOTIFICATION_CLASS: "cli-info-box",
  ".": ".",  // Special character for some templates
  IMPACT_DESCRIPTION: "Low impact on most services",
  
  // Notification Content
  NOTIFICATION_TITLE: "Scheduled Maintenance",
  NOTIFICATION_MESSAGE: "We'll be performing system updates to improve performance and add new features. The platform will be unavailable during this time.",
  AFFECTED_SERVICES: "Interview Simulator, Reports Dashboard",
  EXPECTED_DURATION: "2 hours",
  WORKAROUND_STATUS: "Limited functionality available",
  
  // Maintenance Windows
  START_TIME: "August 25, 2024 2:00 AM UTC",
  END_TIME: "August 25, 2024 4:00 AM UTC",
  MAINTENANCE_TYPE: "Database Upgrade",
  IS_SCHEDULED: true,
  
  // Template-Specific Variables
  LOGIN_URL: "https://mockmate.ai/login",
  DASHBOARD_URL: "https://mockmate.ai/dashboard",
  TUTORIAL_URL: "https://mockmate.ai/getting-started",
  REGISTRATION_TIMESTAMP: "2024-08-24T15:30:00Z",
  
  // Feedback Variables
  SESSION_ID: "sess_123456",
  SESSION_TYPE: "Practice Interview",
  ACTIVITY_TYPE: "Technical Interview",
  FEEDBACK_URL: "https://mockmate.ai/feedback/sess_123456",
  QUICK_SURVEY_URL: "https://mockmate.ai/survey/quick",
  DETAILED_FEEDBACK_URL: "https://mockmate.ai/feedback/detailed",
  
  // URL Variables
  UNSUBSCRIBE_URL: "https://mockmate.ai/unsubscribe?token=unsubtoken123",
  PREFERENCES_URL: "https://mockmate.ai/preferences",
  ACCOUNT_SETTINGS_URL: "https://mockmate.ai/settings",
  HELP_CENTER_URL: "https://mockmate.ai/help",
  
  // Social Media
  SOCIAL_TWITTER: "https://twitter.com/mockmate",
  SOCIAL_LINKEDIN: "https://linkedin.com/company/mockmate",
  SOCIAL_GITHUB: "https://github.com/mockmate",
  
  // Date/Time Variables
  TIMESTAMP: "2024-08-24T15:30:00Z",
  DATE: "08/24/2024",
  TIME: "3:30 PM",
  YEAR: "2024",
  MONTH: "08",
  DAY: "24",
  DATE_LONG: "August 24, 2024",
  DATE_SHORT: "Aug 24, 2024",
  TIME_24H: "15:30",
  TIME_12H: "3:30 PM",
  
  // Security Variables
  SECURITY_EVENT_TYPE: "Password Change",
  EVENT_IP: "203.0.113.195",
  EVENT_LOCATION: "San Francisco, CA, USA",
  EVENT_DEVICE: "Chrome on macOS",
  EVENT_TIMESTAMP: "August 24, 2024 at 3:30 PM PST",
  ACTION_REQUIRED: "Verify your identity",
  SECURITY_CODE: "SEC123",
  RECOVERY_URL: "https://mockmate.ai/security/recover",
  BLOCK_DEVICE_URL: "https://mockmate.ai/security/block",

  // Additional template-specific variables
  HAS_SCORE: true,
  HAS_DETAILS: true,
  HAS_IMPACT: true,
  HOURS_UNTIL: "24",
  PRACTICE_MORE_URL: "https://mockmate.ai/practice-more"
};

// Simple template variable replacement function
function renderTemplate(templateContent, variables) {
  let rendered = templateContent;
  
  // Replace all {{VARIABLE}} patterns
  for (const [key, value] of Object.entries(variables)) {
    // Escape special regex characters in the key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g');
    rendered = rendered.replace(regex, String(value));
  }
  
  // Handle conditional blocks (basic implementation)
  // {{#HAS_SCORE}} content {{/HAS_SCORE}}
  rendered = rendered.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, condition, content) => {
    const conditionValue = variables[condition];
    return conditionValue ? content : '';
  });
  
  return rendered;
}

// Extract variables from template content
function extractVariables(content) {
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const variables = new Set();
  let match;
  
  while ((match = variableRegex.exec(content)) !== null) {
    const variable = match[1].trim();
    // Skip conditional blocks
    if (!variable.startsWith('#') && !variable.startsWith('/')) {
      variables.add(variable);
    }
  }
  
  return Array.from(variables);
}

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  details: []
};

async function testTemplate(templatePath, templateName) {
  try {
    console.log(`\n🧪 Testing: ${templateName}`);
    
    // Read template content
    const content = await fs.readFile(templatePath, 'utf8');
    
    // Extract variables from template
    const templateVariables = extractVariables(content);
    console.log(`   📋 Variables found: ${templateVariables.length}`);
    
    if (templateVariables.length > 0) {
      console.log(`   🏷️  Variables: ${templateVariables.slice(0, 10).join(', ')}${templateVariables.length > 10 ? '...' : ''}`);
    }
    
    // Render template with test data
    const rendered = renderTemplate(content, testData);
    
    // Check for unresolved variables
    const remainingVariables = extractVariables(rendered);
    const resolvedCount = templateVariables.length - remainingVariables.length;
    
    // Create output file
    const outputPath = path.join(__dirname, 'email-template-outputs', `${templateName}-test.html`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, rendered);
    
    if (remainingVariables.length === 0) {
      console.log(`   ✅ PASS: All ${templateVariables.length} variables resolved`);
      console.log(`   📄 Output: ${outputPath}`);
      testResults.passed++;
      testResults.details.push({
        template: templateName,
        status: 'PASS',
        totalVariables: templateVariables.length,
        resolvedVariables: resolvedCount,
        unresolvedVariables: 0,
        outputFile: outputPath
      });
    } else {
      console.log(`   ⚠️  PARTIAL: ${resolvedCount}/${templateVariables.length} variables resolved`);
      console.log(`   ❌ Unresolved: ${remainingVariables.slice(0, 5).join(', ')}${remainingVariables.length > 5 ? '...' : ''}`);
      console.log(`   📄 Output: ${outputPath}`);
      testResults.failed++;
      testResults.details.push({
        template: templateName,
        status: 'PARTIAL',
        totalVariables: templateVariables.length,
        resolvedVariables: resolvedCount,
        unresolvedVariables: remainingVariables.length,
        unresolvedList: remainingVariables,
        outputFile: outputPath
      });
    }
    
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`);
    testResults.failed++;
    testResults.details.push({
      template: templateName,
      status: 'ERROR',
      error: error.message
    });
  }
}

async function runAllTests() {
  console.log('🚀 MockMate Email Template Testing');
  console.log('==================================\n');
  
  try {
    // Find all HTML templates
    const templatesDir = path.join(__dirname, 'email-templates');
    const files = await fs.readdir(templatesDir);
    const htmlFiles = files.filter(file => file.endsWith('.html'));
    
    console.log(`📁 Found ${htmlFiles.length} email templates to test`);
    
    // Test each template
    for (const file of htmlFiles) {
      const templatePath = path.join(templatesDir, file);
      const templateName = path.basename(file, '.html');
      await testTemplate(templatePath, templateName);
    }
    
    // Display summary
    console.log('\n📊 TEST SUMMARY');
    console.log('===============');
    console.log(`Total templates: ${testResults.passed + testResults.failed}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed/Partial: ${testResults.failed}`);
    console.log(`Success rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
    
    if (testResults.failed > 0) {
      console.log('\n❌ ISSUES FOUND:');
      testResults.details
        .filter(detail => detail.status !== 'PASS')
        .forEach(detail => {
          console.log(`\n   📧 ${detail.template}:`);
          if (detail.status === 'ERROR') {
            console.log(`      💥 Error: ${detail.error}`);
          } else if (detail.status === 'PARTIAL') {
            console.log(`      📊 ${detail.resolvedVariables}/${detail.totalVariables} variables resolved`);
            if (detail.unresolvedList && detail.unresolvedList.length > 0) {
              console.log(`      ❓ Missing: ${detail.unresolvedList.slice(0, 3).join(', ')}${detail.unresolvedList.length > 3 ? '...' : ''}`);
            }
          }
        });
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    console.log('1. Check unresolved variables and add them to testData');
    console.log('2. Review generated HTML files in email-template-outputs/');
    console.log('3. Update EmailService to support all documented variables');
    console.log('4. Consider implementing variable validation in email service');
    
    // Generate detailed report
    const reportPath = path.join(__dirname, 'email-template-test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTemplates: testResults.passed + testResults.failed,
        passed: testResults.passed,
        failed: testResults.failed,
        successRate: ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)
      },
      details: testResults.details,
      testData: testData
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run tests
runAllTests().then(() => {
  console.log('\n✅ Email template testing completed!');
}).catch(error => {
  console.error('❌ Testing failed:', error);
  process.exit(1);
});

export { testResults, testData, renderTemplate, extractVariables };
