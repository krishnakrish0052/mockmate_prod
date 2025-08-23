/**
 * Email Template Configuration
 * Maps application events to email templates with their required variables
 */

export const EMAIL_TEMPLATES = {
  // Authentication & Account Management
  USER_REGISTRATION: {
    templateName: 'email-verification',
    subject: 'Verify Your MockMate Email Address',
    requiredVariables: ['USER_NAME', 'USER_EMAIL', 'VERIFICATION_LINK', 'EXPIRY_TIME'],
    defaultData: {
      EXPIRY_TIME: '24 hours',
    },
  },

  EMAIL_VERIFICATION: {
    templateName: 'email-verification',
    subject: 'Verify Your MockMate Email Address',
    requiredVariables: ['USER_NAME', 'USER_EMAIL', 'VERIFICATION_LINK', 'EXPIRY_TIME'],
    defaultData: {
      EXPIRY_TIME: '24 hours',
    },
  },

  PASSWORD_RESET_REQUEST: {
    templateName: 'password-reset',
    subject: 'Reset Your MockMate Password',
    requiredVariables: ['USER_NAME', 'RESET_LINK', 'EXPIRY_TIME', 'SUPPORT_URL'],
    defaultData: {
      EXPIRY_TIME: '1 hour',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
    },
  },

  PASSWORD_CHANGED: {
    templateName: 'password-change-confirmation',
    subject: 'Password Changed Successfully - MockMate',
    requiredVariables: ['USER_NAME', 'USER_EMAIL', 'CHANGE_TIME', 'SUPPORT_URL'],
    defaultData: {
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
    },
  },

  USER_WELCOME: {
    templateName: 'welcome',
    subject: 'Welcome to MockMate! 🚀',
    requiredVariables: ['USER_NAME', 'USER_EMAIL', 'LOGIN_URL', 'SUPPORT_URL'],
    defaultData: {
      LOGIN_URL: process.env.FRONTEND_URL + '/login',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
    },
  },

  USER_ONBOARDING: {
    templateName: 'welcome-onboarding',
    subject: 'Welcome to MockMate - Your AI Interview Platform',
    requiredVariables: [
      'USER_NAME',
      'USER_EMAIL',
      'LOGIN_URL',
      'DASHBOARD_URL',
      'SUPPORT_URL',
      'TUTORIAL_URL',
      'UNSUBSCRIBE_URL',
      'WEBSITE_URL',
    ],
    defaultData: {
      LOGIN_URL: process.env.FRONTEND_URL + '/login',
      DASHBOARD_URL: process.env.FRONTEND_URL + '/dashboard',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
      TUTORIAL_URL: process.env.FRONTEND_URL + '/getting-started',
      UNSUBSCRIBE_URL: process.env.FRONTEND_URL + '/unsubscribe',
      WEBSITE_URL: process.env.FRONTEND_URL,
    },
  },

  ACCOUNT_VERIFICATION: {
    templateName: 'account-verification',
    subject: 'Verify Your Account - MockMate',
    requiredVariables: [
      'USER_NAME',
      'USER_EMAIL',
      'VERIFICATION_CODE',
      'VERIFICATION_URL',
      'EXPIRY_HOURS',
    ],
    defaultData: {
      VERIFICATION_URL: process.env.FRONTEND_URL + '/verify-account',
      EXPIRY_HOURS: '24',
    },
  },

  // Interview Related
  INTERVIEW_INVITATION: {
    templateName: 'interview-invitation',
    subject: 'Interview Invitation - MockMate',
    requiredVariables: [
      'CANDIDATE_NAME',
      'COMPANY_NAME',
      'POSITION',
      'INTERVIEW_DATE',
      'INTERVIEW_TIME',
      'TIMEZONE',
      'MEETING_LINK',
      'INTERVIEWER_NAME',
    ],
    defaultData: {
      TIMEZONE: 'UTC',
      COMPANY_NAME: 'MockMate',
      CONFIRM_URL: process.env.FRONTEND_URL + '/interview/confirm',
      RESCHEDULE_URL: process.env.FRONTEND_URL + '/interview/reschedule',
      PRACTICE_URL: process.env.FRONTEND_URL + '/practice',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
      WEBSITE_URL: process.env.FRONTEND_URL,
    },
  },

  INTERVIEW_REMINDER: {
    templateName: 'interview-reminder',
    subject: 'Interview Reminder - {{HOURS_UNTIL}} Hours to Go',
    requiredVariables: [
      'CANDIDATE_NAME',
      'HOURS_UNTIL',
      'INTERVIEW_DATE',
      'INTERVIEW_TIME',
      'MEETING_LINK',
      'COMPANY_NAME',
    ],
    defaultData: {
      COMPANY_NAME: 'MockMate',
      PRACTICE_URL: process.env.FRONTEND_URL + '/practice',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
      WEBSITE_URL: process.env.FRONTEND_URL,
    },
  },

  INTERVIEW_COMPLETION: {
    templateName: 'interview-completion',
    subject: 'Interview Complete - Thank You!',
    requiredVariables: [
      'CANDIDATE_NAME',
      'INTERVIEW_SCORE',
      'TECHNICAL_FEEDBACK',
      'COMMUNICATION_FEEDBACK',
      'DETAILED_REPORT_URL',
      'COMPANY_NAME',
    ],
    defaultData: {
      COMPANY_NAME: 'MockMate',
      PRACTICE_MORE_URL: process.env.FRONTEND_URL + '/practice',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
      WEBSITE_URL: process.env.FRONTEND_URL,
    },
  },

  // Billing & Payments
  CREDITS_PURCHASE: {
    templateName: 'credits-purchase',
    subject: 'Credits Purchase Confirmed - MockMate',
    requiredVariables: [
      'USER_NAME',
      'CREDITS_AMOUNT',
      'PURCHASE_AMOUNT',
      'TRANSACTION_ID',
      'RECEIPT_URL',
    ],
    defaultData: {
      RECEIPT_URL: process.env.FRONTEND_URL + '/billing/receipts',
    },
  },

  BILLING_SUCCESS: {
    templateName: 'billing-subscription',
    subject: 'Payment Successful - MockMate',
    requiredVariables: [
      'BILLING_TYPE',
      'USER_NAME',
      'PLAN_NAME',
      'AMOUNT',
      'NEXT_BILLING_DATE',
      'INVOICE_URL',
      'MANAGE_BILLING_URL',
    ],
    defaultData: {
      BILLING_TYPE: 'Payment Successful',
      BILLING_TITLE: 'Payment Processed',
      INVOICE_URL: process.env.FRONTEND_URL + '/billing/invoices',
      MANAGE_BILLING_URL: process.env.FRONTEND_URL + '/billing',
      DOWNLOAD_INVOICE_URL: process.env.FRONTEND_URL + '/billing/download-invoice',
      RENEW_URL: process.env.FRONTEND_URL + '/billing/renew',
    },
  },

  BILLING_FAILED: {
    templateName: 'billing-subscription',
    subject: 'Payment Failed - MockMate',
    requiredVariables: [
      'BILLING_TYPE',
      'USER_NAME',
      'PLAN_NAME',
      'AMOUNT',
      'FAILURE_REASON',
      'UPDATE_PAYMENT_URL',
    ],
    defaultData: {
      BILLING_TYPE: 'Payment Failed',
      BILLING_TITLE: 'Payment Issue',
      UPDATE_PAYMENT_URL: process.env.FRONTEND_URL + '/billing/update-payment',
      MANAGE_BILLING_URL: process.env.FRONTEND_URL + '/billing',
    },
  },

  SUBSCRIPTION_RENEWAL: {
    templateName: 'billing-subscription',
    subject: 'Subscription Renewal Reminder - MockMate',
    requiredVariables: [
      'BILLING_TYPE',
      'USER_NAME',
      'PLAN_NAME',
      'AMOUNT',
      'NEXT_BILLING_DATE',
      'MANAGE_BILLING_URL',
    ],
    defaultData: {
      BILLING_TYPE: 'Subscription Renewal',
      BILLING_TITLE: 'Renewal Reminder',
      MANAGE_BILLING_URL: process.env.FRONTEND_URL + '/billing',
      RENEW_URL: process.env.FRONTEND_URL + '/billing/renew',
    },
  },

  // Feedback & Notifications
  FEEDBACK_REQUEST: {
    templateName: 'feedback-request',
    subject: "We'd Love Your Feedback - MockMate",
    requiredVariables: ['USER_NAME', 'SESSION_TYPE', 'FEEDBACK_URL', 'QUICK_SURVEY_URL'],
    defaultData: {
      FEEDBACK_URL: process.env.FRONTEND_URL + '/feedback',
      QUICK_SURVEY_URL: process.env.FRONTEND_URL + '/quick-survey',
      DETAILED_FEEDBACK_URL: process.env.FRONTEND_URL + '/detailed-feedback',
    },
  },

  // System Notifications
  SYSTEM_MAINTENANCE: {
    templateName: 'system-notification',
    subject: 'System Maintenance - MockMate',
    requiredVariables: [
      'NOTIFICATION_TITLE',
      'NOTIFICATION_MESSAGE',
      'SYSTEM_STATUS',
      'TIMESTAMP',
      'SUPPORT_URL',
    ],
    defaultData: {
      NOTIFICATION_TITLE: 'Scheduled Maintenance',
      SYSTEM_STATUS: 'Maintenance Mode',
      STATUS_COLOR: '#f59e0b',
      NOTIFICATION_TYPE: 'maintenance',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
    },
  },

  SYSTEM_ALERT: {
    templateName: 'system-notification',
    subject: 'System Alert - MockMate',
    requiredVariables: [
      'NOTIFICATION_TITLE',
      'NOTIFICATION_MESSAGE',
      'SYSTEM_STATUS',
      'TIMESTAMP',
      'SUPPORT_URL',
    ],
    defaultData: {
      SYSTEM_STATUS: 'Alert',
      STATUS_COLOR: '#ef4444',
      NOTIFICATION_TYPE: 'alert',
      SUPPORT_URL: process.env.FRONTEND_URL + '/support',
    },
  },

  // Generic Notification
  GENERIC_NOTIFICATION: {
    templateName: 'notification',
    subject: '{{NOTIFICATION_TITLE}} - MockMate',
    requiredVariables: ['USER_NAME', 'NOTIFICATION_TITLE', 'NOTIFICATION_MESSAGE', 'ACTION_URL'],
    defaultData: {
      ACTION_URL: process.env.FRONTEND_URL + '/dashboard',
    },
  },
};

/**
 * Get email template configuration by event name
 * @param {string} eventName - The application event name
 * @returns {object} Template configuration
 */
export function getEmailTemplate(eventName) {
  const config = EMAIL_TEMPLATES[eventName];
  if (!config) {
    throw new Error(`No email template configured for event: ${eventName}`);
  }
  return config;
}

/**
 * Get all available email template events
 * @returns {array} Array of event names
 */
export function getAvailableEvents() {
  return Object.keys(EMAIL_TEMPLATES);
}

/**
 * Validate if all required variables are provided for a template
 * @param {string} eventName - The application event name
 * @param {object} variables - Variables to validate
 * @returns {object} Validation result
 */
export function validateEmailVariables(eventName, variables = {}) {
  const config = EMAIL_TEMPLATES[eventName];
  if (!config) {
    return { valid: false, error: `Unknown event: ${eventName}` };
  }

  const missingVariables = config.requiredVariables.filter(
    variable => !(variable in variables) && !(variable in config.defaultData)
  );

  return {
    valid: missingVariables.length === 0,
    missingVariables,
    providedVariables: Object.keys(variables),
    requiredVariables: config.requiredVariables,
  };
}

/**
 * Merge default data with provided variables
 * @param {string} eventName - The application event name
 * @param {object} variables - Variables provided by the application
 * @returns {object} Merged variables
 */
export function mergeEmailVariables(eventName, variables = {}) {
  const config = EMAIL_TEMPLATES[eventName];
  if (!config) {
    throw new Error(`No email template configured for event: ${eventName}`);
  }

  // Add timestamp for all emails
  const defaultTimestamp = {
    TIMESTAMP: new Date().toLocaleString(),
    YEAR: new Date().getFullYear().toString(),
    DATE: new Date().toLocaleDateString(),
    TIME: new Date().toLocaleTimeString(),
  };

  return {
    ...defaultTimestamp,
    ...config.defaultData,
    ...variables,
  };
}

/**
 * Application Event Types - Use these constants in your application code
 */
export const EMAIL_EVENTS = {
  // Authentication
  USER_REGISTER: 'USER_REGISTRATION',
  EMAIL_VERIFY: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET_REQUEST',
  PASSWORD_CHANGE: 'PASSWORD_CHANGED',
  USER_WELCOME: 'USER_WELCOME',
  USER_ONBOARD: 'USER_ONBOARDING',
  ACCOUNT_VERIFY: 'ACCOUNT_VERIFICATION',

  // Interviews
  INTERVIEW_INVITE: 'INTERVIEW_INVITATION',
  INTERVIEW_REMIND: 'INTERVIEW_REMINDER',
  INTERVIEW_COMPLETE: 'INTERVIEW_COMPLETION',

  // Billing
  CREDITS_BUY: 'CREDITS_PURCHASE',
  PAYMENT_SUCCESS: 'BILLING_SUCCESS',
  PAYMENT_FAILED: 'BILLING_FAILED',
  SUBSCRIPTION_RENEW: 'SUBSCRIPTION_RENEWAL',

  // Feedback
  REQUEST_FEEDBACK: 'FEEDBACK_REQUEST',

  // System
  SYSTEM_MAINTENANCE: 'SYSTEM_MAINTENANCE',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
  NOTIFY_GENERIC: 'GENERIC_NOTIFICATION',
};

export default {
  EMAIL_TEMPLATES,
  EMAIL_EVENTS,
  getEmailTemplate,
  getAvailableEvents,
  validateEmailVariables,
  mergeEmailVariables,
};
