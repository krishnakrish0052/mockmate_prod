/**
 * Email Integration Examples
 * Shows how to integrate email templates with application workflows
 */

import EnhancedEmailService, { EmailHelpers } from '../services/EnhancedEmailService.js';
import { EMAIL_EVENTS } from '../config/emailTemplates.js';

// Example: User Registration Flow
export class UserRegistrationService {
  constructor(database, emailService) {
    this.db = database;
    this.emailService = emailService;
    this.emailHelpers = new EmailHelpers(emailService);
  }

  async registerUser(userData) {
    try {
      // 1. Create user account
      const user = await this.createUser(userData);

      // 2. Generate email verification token
      const verificationToken = this.generateVerificationToken();
      const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

      // 3. Send welcome email with verification
      const emailResult = await this.emailHelpers.sendEmailVerification(
        user.email,
        user.name,
        verificationLink
      );

      if (emailResult.success) {
        console.log(`Verification email sent to ${user.email}`);
      } else {
        console.error(`Failed to send verification email: ${emailResult.error}`);
      }

      return { user, emailSent: emailResult.success };
    } catch (error) {
      console.error('User registration failed:', error);
      throw error;
    }
  }

  async createUser(userData) {
    // Mock user creation
    return {
      id: 'user-123',
      email: userData.email,
      name: userData.name,
      created_at: new Date(),
    };
  }

  generateVerificationToken() {
    return 'verification-token-' + Math.random().toString(36).substr(2, 9);
  }
}

// Example: Interview System Integration
export class InterviewService {
  constructor(database, emailService) {
    this.db = database;
    this.emailService = emailService;
  }

  async scheduleInterview(interviewData) {
    try {
      // 1. Create interview record
      const interview = await this.createInterviewRecord(interviewData);

      // 2. Send invitation email
      const emailResult = await this.emailService.sendEmail(
        EMAIL_EVENTS.INTERVIEW_INVITE,
        interviewData.candidateEmail,
        {
          CANDIDATE_NAME: interviewData.candidateName,
          COMPANY_NAME: interviewData.companyName,
          POSITION: interviewData.position,
          INTERVIEW_DATE: interviewData.date,
          INTERVIEW_TIME: interviewData.time,
          TIMEZONE: interviewData.timezone,
          MEETING_LINK: interviewData.meetingLink,
          INTERVIEWER_NAME: interviewData.interviewerName,
          INTERVIEWER_TITLE: interviewData.interviewerTitle,
        }
      );

      // 3. Schedule reminder emails
      await this.scheduleReminderEmails(interview, interviewData.candidateEmail);

      return { interview, invitationSent: emailResult.success };
    } catch (error) {
      console.error('Interview scheduling failed:', error);
      throw error;
    }
  }

  async scheduleReminderEmails(interview, candidateEmail) {
    // Schedule 24-hour reminder
    setTimeout(
      async () => {
        await this.emailService.sendEmail(EMAIL_EVENTS.INTERVIEW_REMIND, candidateEmail, {
          CANDIDATE_NAME: interview.candidateName,
          HOURS_UNTIL: '24',
          INTERVIEW_DATE: interview.date,
          INTERVIEW_TIME: interview.time,
          MEETING_LINK: interview.meetingLink,
          COMPANY_NAME: interview.companyName,
        });
      },
      this.calculateReminderDelay(interview.datetime, 24)
    );

    // Schedule 1-hour reminder
    setTimeout(
      async () => {
        await this.emailService.sendEmail(EMAIL_EVENTS.INTERVIEW_REMIND, candidateEmail, {
          CANDIDATE_NAME: interview.candidateName,
          HOURS_UNTIL: '1',
          INTERVIEW_DATE: interview.date,
          INTERVIEW_TIME: interview.time,
          MEETING_LINK: interview.meetingLink,
          COMPANY_NAME: interview.companyName,
        });
      },
      this.calculateReminderDelay(interview.datetime, 1)
    );
  }

  calculateReminderDelay(interviewTime, hoursBeforeInMilliseconds) {
    const reminderTime = new Date(interviewTime) - hoursBeforeInMilliseconds * 60 * 60 * 1000;
    return Math.max(0, reminderTime - Date.now());
  }

  async completeInterview(interviewId, results) {
    try {
      const interview = await this.getInterviewById(interviewId);

      // Send completion email with results
      await this.emailService.sendEmail(EMAIL_EVENTS.INTERVIEW_COMPLETE, interview.candidateEmail, {
        CANDIDATE_NAME: interview.candidateName,
        INTERVIEW_SCORE: results.score,
        TECHNICAL_FEEDBACK: results.technicalFeedback,
        COMMUNICATION_FEEDBACK: results.communicationFeedback,
        DETAILED_REPORT_URL: `${process.env.FRONTEND_URL}/reports/${interview.id}`,
        COMPANY_NAME: interview.companyName,
      });
    } catch (error) {
      console.error('Interview completion notification failed:', error);
    }
  }

  async createInterviewRecord(data) {
    return {
      id: 'interview-' + Date.now(),
      candidateName: data.candidateName,
      candidateEmail: data.candidateEmail,
      companyName: data.companyName,
      position: data.position,
      date: data.date,
      time: data.time,
      datetime: new Date(data.date + ' ' + data.time),
      meetingLink: data.meetingLink,
    };
  }

  async getInterviewById(interviewId) {
    // Mock interview retrieval
    return {
      id: interviewId,
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
      companyName: 'TechCorp',
    };
  }
}

// Example: Payment & Billing Integration
export class BillingService {
  constructor(database, emailService) {
    this.db = database;
    this.emailService = emailService;
    this.emailHelpers = new EmailHelpers(emailService);
  }

  async processPayment(paymentData) {
    try {
      // 1. Process payment with payment provider
      const paymentResult = await this.processWithProvider(paymentData);

      if (paymentResult.success) {
        // 2. Send success notification
        await this.emailService.sendEmail(EMAIL_EVENTS.PAYMENT_SUCCESS, paymentData.userEmail, {
          USER_NAME: paymentData.userName,
          BILLING_TYPE: paymentResult.type,
          PLAN_NAME: paymentData.planName,
          AMOUNT: paymentData.amount,
          NEXT_BILLING_DATE: paymentResult.nextBillingDate,
          INVOICE_URL: paymentResult.invoiceUrl,
          MANAGE_BILLING_URL: `${process.env.FRONTEND_URL}/billing`,
        });
      } else {
        // 3. Send failure notification
        await this.emailService.sendEmail(EMAIL_EVENTS.PAYMENT_FAILED, paymentData.userEmail, {
          USER_NAME: paymentData.userName,
          BILLING_TYPE: 'Payment Failed',
          PLAN_NAME: paymentData.planName,
          AMOUNT: paymentData.amount,
          FAILURE_REASON: paymentResult.error,
          UPDATE_PAYMENT_URL: `${process.env.FRONTEND_URL}/billing/update-payment`,
        });
      }

      return paymentResult;
    } catch (error) {
      console.error('Payment processing failed:', error);
      throw error;
    }
  }

  async purchaseCredits(purchaseData) {
    try {
      const purchase = await this.processCreditsPurchase(purchaseData);

      // Send credits purchase confirmation
      await this.emailHelpers.sendCreditsPurchase(purchaseData.userEmail, purchaseData.userName, {
        CREDITS_AMOUNT: purchaseData.creditsAmount,
        PURCHASE_AMOUNT: purchaseData.amount,
        TRANSACTION_ID: purchase.transactionId,
        RECEIPT_URL: purchase.receiptUrl,
      });

      return purchase;
    } catch (error) {
      console.error('Credits purchase failed:', error);
      throw error;
    }
  }

  async processWithProvider(_paymentData) {
    // Mock payment processing
    return {
      success: Math.random() > 0.1, // 90% success rate for demo
      type: 'Monthly Subscription',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      invoiceUrl: `${process.env.FRONTEND_URL}/invoices/inv-123`,
      error: 'Insufficient funds',
    };
  }

  async processCreditsPurchase(_purchaseData) {
    return {
      transactionId: 'TXN_' + Date.now(),
      receiptUrl: `${process.env.FRONTEND_URL}/receipts/rec-123`,
    };
  }
}

// Example: System Notifications
export class NotificationService {
  constructor(database, emailService) {
    this.db = database;
    this.emailService = emailService;
  }

  async sendMaintenanceNotification(users) {
    const recipients = users.map(user => ({
      email: user.email,
      variables: { USER_NAME: user.name },
    }));

    await this.emailService.sendBulkEmails(
      EMAIL_EVENTS.SYSTEM_MAINTENANCE,
      recipients,
      {
        NOTIFICATION_TITLE: 'Scheduled System Maintenance',
        NOTIFICATION_MESSAGE:
          'MockMate will be temporarily unavailable on August 25th from 2:00 AM to 4:00 AM EST for system upgrades.',
        SYSTEM_STATUS: 'Maintenance Scheduled',
      },
      { batchSize: 50 }
    );
  }

  async sendFeatureAnnouncement(users, featureDetails) {
    const recipients = users.map(user => ({
      email: user.email,
      variables: { USER_NAME: user.name },
    }));

    await this.emailService.sendBulkEmails(
      EMAIL_EVENTS.NOTIFY_GENERIC,
      recipients,
      {
        NOTIFICATION_TITLE: featureDetails.title,
        NOTIFICATION_MESSAGE: featureDetails.message,
        ACTION_URL: featureDetails.actionUrl,
      },
      { batchSize: 100 }
    );
  }
}

// Example: Auth Service Integration
export class AuthService {
  constructor(database, emailService) {
    this.db = database;
    this.emailService = emailService;
    this.emailHelpers = new EmailHelpers(emailService);
  }

  async requestPasswordReset(email) {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        throw new Error('User not found');
      }

      const resetToken = this.generateResetToken();
      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      // Store reset token in database with expiration
      await this.storeResetToken(user.id, resetToken);

      // Send password reset email
      const emailResult = await this.emailHelpers.sendPasswordReset(
        user.email,
        user.name,
        resetLink
      );

      return { success: emailResult.success, message: 'Password reset email sent' };
    } catch (error) {
      console.error('Password reset request failed:', error);
      throw error;
    }
  }

  async changePassword(userId, oldPassword, newPassword) {
    try {
      const user = await this.getUserById(userId);

      // Validate old password and update to new password
      await this.updatePassword(userId, newPassword);

      // Send confirmation email
      await this.emailHelpers.sendPasswordChangeConfirmation(user.email, user.name);

      return { success: true, message: 'Password changed successfully' };
    } catch (error) {
      console.error('Password change failed:', error);
      throw error;
    }
  }

  async getUserByEmail(email) {
    // Mock user lookup
    return email ? { id: 'user-123', email, name: 'Test User' } : null;
  }

  async getUserById(userId) {
    // Mock user lookup
    return { id: userId, email: 'test@example.com', name: 'Test User' };
  }

  generateResetToken() {
    return 'reset-' + Math.random().toString(36).substr(2, 9);
  }

  async storeResetToken(userId, token) {
    // Store in database with 1-hour expiration
    console.log(`Stored reset token ${token} for user ${userId}`);
  }

  async updatePassword(userId, _newPassword) {
    // Update password in database
    console.log(`Updated password for user ${userId}`);
  }
}

// Example: Express.js Route Integration
export function createEmailRoutes(app, emailService) {
  // Test email endpoint
  app.post('/api/admin/email/test', async (req, res) => {
    try {
      const { templateName, recipientEmail, variables } = req.body;

      const result = await emailService.sendTestEmail(templateName, recipientEmail, variables);

      res.json({
        success: result.success,
        message: result.success ? 'Test email sent' : 'Test email failed',
        error: result.error,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }
  });

  // Email statistics endpoint
  app.get('/api/admin/email/stats', async (req, res) => {
    try {
      const stats = await emailService.getEmailStats(req.query);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Email history endpoint
  app.get('/api/admin/email/history', async (req, res) => {
    try {
      const history = await emailService.getEmailHistory(req.query);
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

// Example usage in main application
export async function initializeEmailSystem(database, dynamicConfigService) {
  // Initialize enhanced email service
  const emailService = new EnhancedEmailService(database, dynamicConfigService);

  // Initialize service classes
  const userService = new UserRegistrationService(database, emailService);
  const interviewService = new InterviewService(database, emailService);
  const billingService = new BillingService(database, emailService);
  const notificationService = new NotificationService(database, emailService);
  const authService = new AuthService(database, emailService);

  return {
    emailService,
    userService,
    interviewService,
    billingService,
    notificationService,
    authService,
  };
}

export default {
  UserRegistrationService,
  InterviewService,
  BillingService,
  NotificationService,
  AuthService,
  createEmailRoutes,
  initializeEmailSystem,
};
