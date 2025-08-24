# MockMate Email Template Variables Documentation

This documentation provides a comprehensive guide to all available variables for MockMate email templates.

## Table of Contents

1. [Global Variables](#global-variables)
2. [User Variables](#user-variables)
3. [Authentication Variables](#authentication-variables)
4. [Interview Variables](#interview-variables)
5. [Billing Variables](#billing-variables)
6. [System Variables](#system-variables)
7. [Template-Specific Variables](#template-specific-variables)
8. [URL Variables](#url-variables)
9. [Date/Time Variables](#datetime-variables)
10. [Security Variables](#security-variables)

---

## Global Variables

These variables are available in all email templates:

### Basic Information
| Variable | Description | Example |
|----------|-------------|---------|
| `{{EMAIL_TITLE}}` | Email subject/title | "Welcome to MockMate" |
| `{{EMAIL_TYPE}}` | Type of email for path display | "welcome", "verification", "billing" |
| `{{SITE_TAGLINE}}` | Platform tagline | "AI-Powered Interview Platform" |
| `{{COMPANY_NAME}}` | Company name | "MockMate" |
| `{{COMPANY_ADDRESS}}` | Company address | "123 Tech Street, SF, CA 94105" |
| `{{CURRENT_YEAR}}` | Current year | "2024" |

### Contact Information
| Variable | Description | Example |
|----------|-------------|---------|
| `{{SUPPORT_EMAIL}}` | Support email address | "support@mockmate.ai" |
| `{{SUPPORT_URL}}` | Support page URL | "https://mockmate.ai/support" |
| `{{WEBSITE_URL}}` | Main website URL | "https://mockmate.ai" |
| `{{PRIVACY_URL}}` | Privacy policy URL | "https://mockmate.ai/privacy" |
| `{{TERMS_URL}}` | Terms of service URL | "https://mockmate.ai/terms" |

---

## User Variables

Variables related to user information:

### User Identity
| Variable | Description | Example |
|----------|-------------|---------|
| `{{USER_NAME}}` | Full user name | "John Doe" |
| `{{USER_FIRST_NAME}}` | User's first name | "John" |
| `{{USER_LAST_NAME}}` | User's last name | "Doe" |
| `{{USER_EMAIL}}` | User's email address | "john.doe@example.com" |
| `{{USER_USERNAME}}` | Username | "johndoe123" |
| `{{USER_ID}}` | Unique user identifier | "usr_1234567890" |

### User Preferences
| Variable | Description | Example |
|----------|-------------|---------|
| `{{USER_TIMEZONE}}` | User's timezone | "America/New_York" |
| `{{USER_LANGUAGE}}` | User's preferred language | "en-US" |
| `{{USER_SUBSCRIPTION}}` | Current subscription plan | "Premium" |

---

## Authentication Variables

Variables for authentication-related emails:

### Email Verification
| Variable | Description | Example |
|----------|-------------|---------|
| `{{VERIFICATION_CODE}}` | 6-digit verification code | "123456" |
| `{{VERIFICATION_URL}}` | Email verification link | "https://mockmate.ai/verify?token=..." |
| `{{VERIFICATION_TIMESTAMP}}` | When verification was requested | "2024-08-24 15:30:00 UTC" |
| `{{EXPIRY_MINUTES}}` | Code expiry in minutes | "15" |
| `{{EXPIRY_HOURS}}` | Code expiry in hours | "24" |
| `{{RESEND_CODE_URL}}` | URL to resend verification code | "https://mockmate.ai/resend-code" |

### Password Reset
| Variable | Description | Example |
|----------|-------------|---------|
| `{{RESET_URL}}` | Password reset link | "https://mockmate.ai/reset-password?token=..." |
| `{{RESET_TOKEN}}` | Password reset token | "abc123xyz789" |
| `{{REQUEST_IP}}` | IP address of requester | "192.168.1.1" |
| `{{REQUEST_LOCATION}}` | Geographic location of request | "New York, NY, USA" |
| `{{REQUEST_USER_AGENT}}` | Browser/device information | "Mozilla/5.0 Chrome/91.0" |
| `{{REQUEST_TIMESTAMP}}` | When reset was requested | "August 24, 2024 at 3:30 PM EST" |
| `{{SECURITY_CONTACT_URL}}` | Security team contact | "https://mockmate.ai/security/report" |

### Two-Factor Authentication
| Variable | Description | Example |
|----------|-------------|---------|
| `{{2FA_CODE}}` | Two-factor authentication code | "789012" |
| `{{LOGIN_ATTEMPT_IP}}` | IP of login attempt | "10.0.0.1" |
| `{{LOGIN_ATTEMPT_LOCATION}}` | Location of login attempt | "San Francisco, CA" |
| `{{LOGIN_DEVICE}}` | Device used for login | "iPhone 12 Pro" |

---

## Interview Variables

Variables for interview-related communications:

### Interview Details
| Variable | Description | Example |
|----------|-------------|---------|
| `{{CANDIDATE_NAME}}` | Interviewee's name | "Jane Smith" |
| `{{INTERVIEWER_NAME}}` | Interviewer's name | "Sarah Johnson" |
| `{{INTERVIEWER_TITLE}}` | Interviewer's job title | "Senior Engineering Manager" |
| `{{COMPANY_NAME}}` | Company conducting interview | "TechCorp Inc." |
| `{{POSITION}}` | Job position | "Senior Software Engineer" |
| `{{INTERVIEW_DATE}}` | Interview date | "August 25, 2024" |
| `{{INTERVIEW_TIME}}` | Interview time | "2:00 PM EST" |
| `{{TIMEZONE}}` | Interview timezone | "Eastern Standard Time" |
| `{{DURATION}}` | Interview duration | "60 minutes" |
| `{{INTERVIEW_TYPE}}` | Type of interview | "Video Call", "Phone", "In-Person" |

### Interview URLs
| Variable | Description | Example |
|----------|-------------|---------|
| `{{MEETING_LINK}}` | Video call link | "https://meet.google.com/abc-defg-hij" |
| `{{CONFIRM_URL}}` | Interview confirmation link | "https://mockmate.ai/interview/confirm/123" |
| `{{RESCHEDULE_URL}}` | Reschedule interview link | "https://mockmate.ai/interview/reschedule/123" |
| `{{PRACTICE_URL}}` | Practice interview link | "https://mockmate.ai/practice" |
| `{{CONFIRM_BY_DATE}}` | Confirmation deadline | "August 20, 2024" |

### Interview Results
| Variable | Description | Example |
|----------|-------------|---------|
| `{{INTERVIEW_SCORE}}` | Overall interview score | "85" |
| `{{TECHNICAL_FEEDBACK}}` | Technical skills feedback | "Strong problem-solving abilities..." |
| `{{COMMUNICATION_FEEDBACK}}` | Communication feedback | "Clear and articulate responses..." |
| `{{PROBLEM_SOLVING_FEEDBACK}}` | Problem-solving feedback | "Demonstrated excellent analytical thinking..." |
| `{{IMPROVEMENT_AREAS}}` | Areas for improvement | "Consider practicing system design questions..." |
| `{{INTERVIEW_DURATION}}` | Actual interview duration | "45" |
| `{{QUESTIONS_ANSWERED}}` | Number of questions answered | "12" |
| `{{AVG_RESPONSE_TIME}}` | Average response time | "30" |
| `{{CONFIDENCE_LEVEL}}` | Confidence rating (1-10) | "8" |
| `{{DETAILED_REPORT_URL}}` | Link to detailed report | "https://mockmate.ai/reports/interview123" |

### Company Contact
| Variable | Description | Example |
|----------|-------------|---------|
| `{{COMPANY_CONTACT_EMAIL}}` | Company HR email | "hr@techcorp.com" |
| `{{COMPANY_CONTACT_PHONE}}` | Company contact phone | "+1 (555) 123-4567" |

---

## Billing Variables

Variables for billing and payment-related emails:

### Subscription Information
| Variable | Description | Example |
|----------|-------------|---------|
| `{{PLAN_NAME}}` | Subscription plan name | "Professional Plan" |
| `{{PLAN_AMOUNT}}` | Plan cost | "29.99" |
| `{{TOTAL_AMOUNT}}` | Total charged amount | "29.99" |
| `{{BILLING_PERIOD}}` | Billing frequency | "Monthly", "Annual" |
| `{{NEXT_BILLING_DATE}}` | Next billing date | "September 24, 2024" |
| `{{BILLING_CYCLE_END}}` | Current cycle end date | "September 23, 2024" |

### Payment Information
| Variable | Description | Example |
|----------|-------------|---------|
| `{{PAYMENT_METHOD}}` | Payment method used | "Visa ending in 1234" |
| `{{TRANSACTION_ID}}` | Transaction identifier | "txn_1234567890" |
| `{{INVOICE_NUMBER}}` | Invoice number | "INV-2024-001234" |
| `{{RECEIPT_URL}}` | Receipt download link | "https://mockmate.ai/receipts/123" |
| `{{DOWNLOAD_INVOICE_URL}}` | Invoice download link | "https://mockmate.ai/invoices/123" |

### Billing Management
| Variable | Description | Example |
|----------|-------------|---------|
| `{{MANAGE_BILLING_URL}}` | Billing management page | "https://mockmate.ai/billing" |
| `{{UPDATE_PAYMENT_URL}}` | Update payment method | "https://mockmate.ai/billing/payment-methods" |
| `{{CANCEL_SUBSCRIPTION_URL}}` | Cancel subscription link | "https://mockmate.ai/billing/cancel" |
| `{{UPGRADE_URL}}` | Plan upgrade link | "https://mockmate.ai/billing/upgrade" |
| `{{RENEW_URL}}` | Manual renewal link | "https://mockmate.ai/billing/renew" |

### Payment Issues
| Variable | Description | Example |
|----------|-------------|---------|
| `{{FAILURE_REASON}}` | Payment failure reason | "Insufficient funds" |
| `{{AMOUNT_FAILED}}` | Failed payment amount | "$29.99" |
| `{{RETRY_PAYMENT_URL}}` | Retry payment link | "https://mockmate.ai/billing/retry" |
| `{{NEXT_RETRY_DATE}}` | Next automatic retry date | "August 27, 2024" |
| `{{GRACE_PERIOD_END}}` | Grace period expiration | "August 31, 2024" |

### Credits System
| Variable | Description | Example |
|----------|-------------|---------|
| `{{CREDITS_AMOUNT}}` | Number of credits purchased | "100" |
| `{{CREDITS_COST}}` | Cost per credit or total | "$0.50" |
| `{{CURRENT_CREDITS}}` | Current credit balance | "150" |
| `{{CREDITS_USED}}` | Credits used in period | "25" |

---

## System Variables

Variables for system notifications and status:

### System Status
| Variable | Description | Example |
|----------|-------------|---------|
| `{{SYSTEM_STATUS}}` | Current system status | "Operational", "Maintenance", "Degraded" |
| `{{STATUS_COLOR}}` | Color for status indicator | "#00ff00", "#ffbf00", "#ff4444" |
| `{{STATUS_CLASS}}` | CSS class for status | "status-online", "status-maintenance" |
| `{{NOTIFICATION_TYPE}}` | Type of notification | "maintenance", "alert", "update" |
| `{{NOTIFICATION_CLASS}}` | CSS class for notification | "cli-info-box", "cli-warning-box" |

### Notification Content
| Variable | Description | Example |
|----------|-------------|---------|
| `{{NOTIFICATION_TITLE}}` | Notification headline | "Scheduled Maintenance" |
| `{{NOTIFICATION_MESSAGE}}` | Notification body | "We'll be performing system updates..." |
| `{{AFFECTED_SERVICES}}` | Services affected | "Interview Simulator, Reports" |
| `{{EXPECTED_DURATION}}` | Expected downtime | "2 hours" |
| `{{WORKAROUND_STATUS}}` | Workaround availability | "Available", "None" |

### Maintenance Windows
| Variable | Description | Example |
|----------|-------------|---------|
| `{{START_TIME}}` | Maintenance start time | "August 25, 2024 2:00 AM UTC" |
| `{{END_TIME}}` | Maintenance end time | "August 25, 2024 4:00 AM UTC" |
| `{{MAINTENANCE_TYPE}}` | Type of maintenance | "Database Upgrade", "Security Patch" |
| `{{IS_SCHEDULED}}` | Boolean for scheduled maintenance | true/false |

---

## Template-Specific Variables

### Welcome Email
| Variable | Description | Example |
|----------|-------------|---------|
| `{{LOGIN_URL}}` | Login page URL | "https://mockmate.ai/login" |
| `{{DASHBOARD_URL}}` | User dashboard URL | "https://mockmate.ai/dashboard" |
| `{{TUTORIAL_URL}}` | Getting started tutorial | "https://mockmate.ai/getting-started" |
| `{{ONBOARDING_CHECKLIST}}` | List of onboarding steps | Array of steps |

### Feedback Requests
| Variable | Description | Example |
|----------|-------------|---------|
| `{{SESSION_ID}}` | Practice session ID | "sess_123456" |
| `{{SESSION_TYPE}}` | Type of session | "Practice Interview", "Mock Test" |
| `{{ACTIVITY_TYPE}}` | Activity performed | "Technical Interview", "Behavioral Questions" |
| `{{FEEDBACK_URL}}` | Feedback form URL | "https://mockmate.ai/feedback/sess_123456" |
| `{{QUICK_SURVEY_URL}}` | Quick survey link | "https://mockmate.ai/survey/quick" |
| `{{DETAILED_FEEDBACK_URL}}` | Detailed feedback form | "https://mockmate.ai/feedback/detailed" |

---

## URL Variables

Standard URL patterns used across templates:

### Navigation URLs
| Variable | Description | Example |
|----------|-------------|---------|
| `{{UNSUBSCRIBE_URL}}` | Unsubscribe link | "https://mockmate.ai/unsubscribe?token=..." |
| `{{PREFERENCES_URL}}` | Email preferences | "https://mockmate.ai/preferences" |
| `{{ACCOUNT_SETTINGS_URL}}` | Account settings page | "https://mockmate.ai/settings" |
| `{{HELP_CENTER_URL}}` | Help center | "https://mockmate.ai/help" |

### Social Media URLs
| Variable | Description | Example |
|----------|-------------|---------|
| `{{SOCIAL_TWITTER}}` | Twitter profile | "https://twitter.com/mockmate" |
| `{{SOCIAL_LINKEDIN}}` | LinkedIn profile | "https://linkedin.com/company/mockmate" |
| `{{SOCIAL_GITHUB}}` | GitHub profile | "https://github.com/mockmate" |

---

## Date/Time Variables

Standardized date and time formatting:

### Current Date/Time
| Variable | Description | Format | Example |
|----------|-------------|--------|---------|
| `{{TIMESTAMP}}` | Current timestamp | ISO 8601 | "2024-08-24T15:30:00Z" |
| `{{DATE}}` | Current date | MM/DD/YYYY | "08/24/2024" |
| `{{TIME}}` | Current time | HH:MM AM/PM | "3:30 PM" |
| `{{YEAR}}` | Current year | YYYY | "2024" |
| `{{MONTH}}` | Current month | MM | "08" |
| `{{DAY}}` | Current day | DD | "24" |

### Formatted Dates
| Variable | Description | Example |
|----------|-------------|---------|
| `{{DATE_LONG}}` | Long date format | "August 24, 2024" |
| `{{DATE_SHORT}}` | Short date format | "Aug 24, 2024" |
| `{{TIME_24H}}` | 24-hour time format | "15:30" |
| `{{TIME_12H}}` | 12-hour time format | "3:30 PM" |

---

## Security Variables

Variables for security-related communications:

### Security Events
| Variable | Description | Example |
|----------|-------------|---------|
| `{{SECURITY_EVENT_TYPE}}` | Type of security event | "Login", "Password Change", "Data Export" |
| `{{EVENT_IP}}` | IP address of event | "203.0.113.195" |
| `{{EVENT_LOCATION}}` | Geographic location | "San Francisco, CA, USA" |
| `{{EVENT_DEVICE}}` | Device information | "Chrome on macOS" |
| `{{EVENT_TIMESTAMP}}` | When event occurred | "August 24, 2024 at 3:30 PM PST" |

### Security Actions
| Variable | Description | Example |
|----------|-------------|---------|
| `{{ACTION_REQUIRED}}` | Action needed from user | "Verify your identity" |
| `{{SECURITY_CODE}}` | Security verification code | "ABC123" |
| `{{RECOVERY_URL}}` | Account recovery link | "https://mockmate.ai/security/recover" |
| `{{BLOCK_DEVICE_URL}}` | Block suspicious device | "https://mockmate.ai/security/block" |

---

## Usage Guidelines

### Variable Naming Conventions
- Use UPPERCASE with underscores for separation
- Be descriptive and specific
- Use consistent prefixes (USER_, EMAIL_, BILLING_, etc.)
- Boolean values should be clear (IS_, HAS_, CAN_)

### Default Values
- Always provide fallback values for optional variables
- Use empty strings rather than undefined for missing data
- Format dates consistently across all templates
- Validate email addresses and URLs before insertion

### Security Considerations
- Never include sensitive data like passwords or tokens in plain text
- Use secure URLs (HTTPS) for all links
- Implement proper escaping for user-generated content
- Include unsubscribe links in all marketing emails

### Testing Variables
For testing purposes, use these sample values:
- `{{USER_NAME}}`: "Test User"
- `{{USER_EMAIL}}`: "test@example.com"
- `{{VERIFICATION_CODE}}`: "123456"
- `{{COMPANY_NAME}}`: "ACME Corp"
- `{{INTERVIEW_DATE}}`: "Tomorrow at 2:00 PM"

---

## Template Integration

### Using Variables in Templates
```html
<!-- Basic usage -->
<p>Hello {{USER_NAME}},</p>

<!-- With fallbacks -->
<p>Welcome to {{COMPANY_NAME | default: "MockMate"}}!</p>

<!-- In URLs -->
<a href="{{LOGIN_URL}}">Login to your account</a>

<!-- In conditional blocks -->
{{#HAS_SCORE}}
<div class="score">Your score: {{INTERVIEW_SCORE}}%</div>
{{/HAS_SCORE}}
```

### Variable Validation
Always validate variables before rendering:
```javascript
const templateData = {
  USER_NAME: user.name || 'Valued User',
  USER_EMAIL: user.email,
  CURRENT_YEAR: new Date().getFullYear(),
  SUPPORT_URL: process.env.SUPPORT_URL || 'https://mockmate.ai/support'
};
```

This documentation should be updated whenever new variables are added or existing ones are modified.

---

*Last updated: August 24, 2024*
*Version: 1.0.0*
