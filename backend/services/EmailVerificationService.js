import crypto from 'crypto';
import { logger } from '../config/logger.js';
import { emailService } from './EmailService.js';

class EmailVerificationService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generate a secure verification token
   */
  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create and send email verification token
   */
  async sendVerificationEmail(user, options = {}) {
    try {
      const token = this.generateVerificationToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

      // Store token in database
      await this.storeVerificationToken(user.id, token, expiresAt);

      // Send verification email
      const emailResult = await emailService.sendVerificationEmail(user, token);

      // Log email send attempt
      await this.logEmailSend(
        user.id,
        user.email,
        'verification',
        'email-verification',
        'Verify Your MockMate Account',
        emailResult
      );

      logger.info(`Verification email sent to ${user.email}`, {
        userId: user.id,
        messageId: emailResult.messageId,
      });

      return {
        success: true,
        token,
        expiresAt,
        messageId: emailResult.messageId,
      };
    } catch (error) {
      logger.error('Failed to send verification email:', {
        userId: user.id,
        email: user.email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Store verification token in database
   */
  async storeVerificationToken(userId, token, expiresAt) {
    try {
      // Remove any existing tokens for this user
      await this.db.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

      // Insert new token
      const result = await this.db.query(
        `INSERT INTO email_verification_tokens (user_id, token, expires_at)
                 VALUES ($1, $2, $3)
                 RETURNING id, token, expires_at`,
        [userId, token, expiresAt]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to store verification token:', error);
      throw error;
    }
  }

  /**
   * Verify email token and mark user as verified
   */
  async verifyEmailToken(token, _options = {}) {
    try {
      // Find token and associated user
      const tokenResult = await this.db.query(
        `SELECT evt.*, u.id as user_id, u.email, u.first_name, u.name, u.is_verified
                 FROM email_verification_tokens evt
                 JOIN users u ON evt.user_id = u.id
                 WHERE evt.token = $1 AND evt.is_used = FALSE`,
        [token]
      );

      if (tokenResult.rows.length === 0) {
        return {
          success: false,
          error: 'Invalid or expired verification token',
          code: 'INVALID_TOKEN',
        };
      }

      const tokenData = tokenResult.rows[0];

      // Check if token has expired
      if (new Date() > new Date(tokenData.expires_at)) {
        return {
          success: false,
          error: 'Verification token has expired',
          code: 'TOKEN_EXPIRED',
        };
      }

      // Check if user is already verified
      if (tokenData.is_verified) {
        // Mark token as used
        await this.markTokenAsUsed(tokenData.id);

        return {
          success: true,
          alreadyVerified: true,
          message: 'Email is already verified',
        };
      }

      // Start transaction to verify user and mark token as used
      await this.db.query('BEGIN');

      try {
        // Mark user as verified
        await this.db.query(
          'UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1',
          [tokenData.user_id]
        );

        // Mark token as used
        await this.markTokenAsUsed(tokenData.id);

        await this.db.query('COMMIT');

        // Send welcome email
        try {
          await emailService.sendWelcomeEmail({
            id: tokenData.user_id,
            email: tokenData.email,
            first_name: tokenData.first_name,
            name: tokenData.name,
          });
        } catch (welcomeEmailError) {
          logger.warn('Failed to send welcome email after verification:', {
            userId: tokenData.user_id,
            error: welcomeEmailError.message,
          });
        }

        logger.info('Email verified successfully:', {
          userId: tokenData.user_id,
          email: tokenData.email,
        });

        return {
          success: true,
          userId: tokenData.user_id,
          email: tokenData.email,
          message: 'Email verified successfully',
        };
      } catch (error) {
        await this.db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      logger.error('Failed to verify email token:', {
        token: token?.substring(0, 8) + '...',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Mark token as used
   */
  async markTokenAsUsed(tokenId) {
    await this.db.query(
      'UPDATE email_verification_tokens SET is_used = TRUE, used_at = NOW() WHERE id = $1',
      [tokenId]
    );
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email) {
    try {
      // Find user by email
      const userResult = await this.db.query('SELECT * FROM users WHERE email = $1', [email]);

      if (userResult.rows.length === 0) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        };
      }

      const user = userResult.rows[0];

      // Check if already verified
      if (user.is_verified) {
        return {
          success: false,
          error: 'Email is already verified',
          code: 'ALREADY_VERIFIED',
        };
      }

      // Check for recent verification attempts (rate limiting)
      const recentTokenResult = await this.db.query(
        `SELECT created_at FROM email_verification_tokens 
                 WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
        [user.id]
      );

      if (recentTokenResult.rows.length > 0) {
        return {
          success: false,
          error: 'Please wait before requesting another verification email',
          code: 'RATE_LIMITED',
        };
      }

      // Send new verification email
      const result = await this.sendVerificationEmail(user);

      return {
        success: true,
        message: 'Verification email sent successfully',
      };
    } catch (error) {
      logger.error('Failed to resend verification email:', {
        email,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Log email send attempts
   */
  async logEmailSend(userId, recipientEmail, templateType, templateName, subject, emailResult) {
    try {
      await this.db.query(
        `INSERT INTO email_send_logs 
                 (user_id, recipient_email, template_type, template_name, subject, message_id, send_status, sent_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          userId,
          recipientEmail,
          templateType,
          templateName,
          subject,
          emailResult.messageId,
          emailResult.success ? 'sent' : 'failed',
        ]
      );
    } catch (error) {
      logger.warn('Failed to log email send:', error);
    }
  }

  /**
   * Clean up expired tokens (should be run periodically)
   */
  async cleanupExpiredTokens() {
    try {
      const result = await this.db.query(
        'DELETE FROM email_verification_tokens WHERE expires_at < NOW()'
      );

      if (result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} expired verification tokens`);
      }

      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup expired tokens:', error);
      throw error;
    }
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats(timeframe = '24 hours') {
    try {
      const stats = await this.db.query(
        `SELECT 
                    COUNT(*) as total_tokens_generated,
                    COUNT(CASE WHEN is_used = TRUE THEN 1 END) as tokens_used,
                    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_tokens
                 FROM email_verification_tokens 
                 WHERE created_at > NOW() - INTERVAL '${timeframe}'`
      );

      const emailStats = await this.db.query(
        `SELECT 
                    COUNT(*) as total_emails_sent,
                    COUNT(CASE WHEN send_status = 'sent' THEN 1 END) as successful_sends,
                    COUNT(CASE WHEN send_status = 'failed' THEN 1 END) as failed_sends
                 FROM email_send_logs 
                 WHERE template_type = 'verification' 
                   AND created_at > NOW() - INTERVAL '${timeframe}'`
      );

      return {
        tokens: stats.rows[0],
        emails: emailStats.rows[0],
      };
    } catch (error) {
      logger.error('Failed to get verification stats:', error);
      throw error;
    }
  }
}

export default EmailVerificationService;
