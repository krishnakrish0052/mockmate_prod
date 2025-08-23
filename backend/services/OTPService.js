import crypto from 'crypto';
import { logger } from '../config/logger.js';
import { emailService } from './EmailService.js';

/**
 * Enhanced OTP Service for various authentication flows
 * Supports both numeric OTP codes and secure tokens
 */
class OTPService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generate a numeric OTP code
   * @param {number} length - Length of OTP (default: 6)
   * @returns {string} - Numeric OTP code
   */
  generateNumericOTP(length = 6) {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  /**
   * Generate a secure token
   * @param {number} bytes - Number of bytes (default: 32)
   * @returns {string} - Secure hex token
   */
  generateSecureToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Create OTP entry in database
   * @param {string} userId - User ID
   * @param {string} type - OTP type (email_verification, password_reset, password_change, login_2fa)
   * @param {string} code - OTP code or token
   * @param {number} expiryMinutes - Expiry time in minutes
   * @param {Object} metadata - Additional metadata
   */
  async createOTP(userId, type, code, expiryMinutes = 15, metadata = {}) {
    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

      // Remove any existing OTPs of the same type for this user
      await this.db.query('DELETE FROM otp_codes WHERE user_id = $1 AND otp_type = $2', [
        userId,
        type,
      ]);

      // Insert new OTP
      const result = await this.db.query(
        `
                INSERT INTO otp_codes (user_id, otp_type, code, expires_at, metadata)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id, code, expires_at, created_at
            `,
        [userId, type, code, expiresAt, JSON.stringify(metadata)]
      );

      logger.info('OTP created', {
        userId,
        otpType: type,
        codeLength: code.length,
        expiresAt,
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create OTP:', error);
      throw error;
    }
  }

  /**
   * Verify OTP code
   * @param {string} userId - User ID
   * @param {string} type - OTP type
   * @param {string} code - OTP code to verify
   * @param {boolean} markAsUsed - Mark as used after verification (default: true)
   */
  async verifyOTP(userId, type, code, markAsUsed = true) {
    try {
      const result = await this.db.query(
        `
                SELECT id, code, expires_at, attempt_count, max_attempts, is_used
                FROM otp_codes
                WHERE user_id = $1 AND otp_type = $2 AND is_used = FALSE
                ORDER BY created_at DESC
                LIMIT 1
            `,
        [userId, type]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'OTP not found or already used',
          code: 'OTP_NOT_FOUND',
        };
      }

      const otpRecord = result.rows[0];

      // Check if expired
      if (new Date() > new Date(otpRecord.expires_at)) {
        await this.markOTPAsExpired(otpRecord.id);
        return {
          success: false,
          error: 'OTP has expired',
          code: 'OTP_EXPIRED',
        };
      }

      // Check max attempts
      const maxAttempts = otpRecord.max_attempts || 5;
      if (otpRecord.attempt_count >= maxAttempts) {
        await this.markOTPAsExpired(otpRecord.id);
        return {
          success: false,
          error: 'Maximum verification attempts exceeded',
          code: 'MAX_ATTEMPTS_EXCEEDED',
        };
      }

      // Increment attempt count
      await this.db.query('UPDATE otp_codes SET attempt_count = attempt_count + 1 WHERE id = $1', [
        otpRecord.id,
      ]);

      // Verify code
      if (otpRecord.code !== code) {
        logger.warn('Invalid OTP attempt', {
          userId,
          otpType: type,
          attemptCount: otpRecord.attempt_count + 1,
        });

        return {
          success: false,
          error: 'Invalid OTP code',
          code: 'INVALID_OTP',
          attemptsRemaining: maxAttempts - (otpRecord.attempt_count + 1),
        };
      }

      // Mark as used if requested
      if (markAsUsed) {
        await this.markOTPAsUsed(otpRecord.id);
      }

      logger.info('OTP verified successfully', {
        userId,
        otpType: type,
      });

      return {
        success: true,
        otpId: otpRecord.id,
      };
    } catch (error) {
      logger.error('Failed to verify OTP:', error);
      throw error;
    }
  }

  /**
   * Mark OTP as used
   */
  async markOTPAsUsed(otpId) {
    await this.db.query('UPDATE otp_codes SET is_used = TRUE, used_at = NOW() WHERE id = $1', [
      otpId,
    ]);
  }

  /**
   * Mark OTP as expired
   */
  async markOTPAsExpired(otpId) {
    await this.db.query('UPDATE otp_codes SET is_used = TRUE, used_at = NOW() WHERE id = $1', [
      otpId,
    ]);
  }

  /**
   * Send Email Verification OTP
   */
  async sendEmailVerificationOTP(user) {
    try {
      const otpCode = this.generateNumericOTP(6);
      const otpRecord = await this.createOTP(user.id, 'email_verification', otpCode, 30); // 30 minutes

      // Send email with OTP
      const emailResult = await emailService.sendTemplateEmail(
        'email-verification-otp',
        user.email,
        {
          USER_NAME: user.first_name || user.name,
          USER_EMAIL: user.email,
          VERIFICATION_CODE: otpCode,
          EXPIRY_MINUTES: '30',
        }
      );

      return {
        success: true,
        otpId: otpRecord.id,
        expiresAt: otpRecord.expires_at,
        emailSent: emailResult.success,
      };
    } catch (error) {
      logger.error('Failed to send email verification OTP:', error);
      throw error;
    }
  }

  /**
   * Send Password Reset OTP
   */
  async sendPasswordResetOTP(user) {
    try {
      const otpCode = this.generateNumericOTP(6);
      const otpRecord = await this.createOTP(user.id, 'password_reset', otpCode, 15); // 15 minutes

      // Send email with OTP
      const emailResult = await emailService.sendTemplateEmail('password-reset-otp', user.email, {
        USER_NAME: user.first_name || user.name,
        USER_EMAIL: user.email,
        RESET_CODE: otpCode,
        EXPIRY_MINUTES: '15',
      });

      return {
        success: true,
        otpId: otpRecord.id,
        expiresAt: otpRecord.expires_at,
        emailSent: emailResult.success,
      };
    } catch (error) {
      logger.error('Failed to send password reset OTP:', error);
      throw error;
    }
  }

  /**
   * Send Password Change Confirmation OTP
   */
  async sendPasswordChangeOTP(user) {
    try {
      const otpCode = this.generateNumericOTP(6);
      const otpRecord = await this.createOTP(user.id, 'password_change', otpCode, 10); // 10 minutes

      // Send email with OTP
      const emailResult = await emailService.sendTemplateEmail('password-change-otp', user.email, {
        USER_NAME: user.first_name || user.name,
        USER_EMAIL: user.email,
        CHANGE_CODE: otpCode,
        EXPIRY_MINUTES: '10',
      });

      return {
        success: true,
        otpId: otpRecord.id,
        expiresAt: otpRecord.expires_at,
        emailSent: emailResult.success,
      };
    } catch (error) {
      logger.error('Failed to send password change OTP:', error);
      throw error;
    }
  }

  /**
   * Send Login 2FA OTP
   */
  async sendLogin2FAOTP(user) {
    try {
      const otpCode = this.generateNumericOTP(6);
      const otpRecord = await this.createOTP(user.id, 'login_2fa', otpCode, 5); // 5 minutes

      // Send email with OTP
      const emailResult = await emailService.sendTemplateEmail('login-2fa-otp', user.email, {
        USER_NAME: user.first_name || user.name,
        USER_EMAIL: user.email,
        LOGIN_CODE: otpCode,
        EXPIRY_MINUTES: '5',
      });

      return {
        success: true,
        otpId: otpRecord.id,
        expiresAt: otpRecord.expires_at,
        emailSent: emailResult.success,
      };
    } catch (error) {
      logger.error('Failed to send login 2FA OTP:', error);
      throw error;
    }
  }

  /**
   * Verify email with OTP
   */
  async verifyEmailWithOTP(userId, otpCode) {
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Verify OTP
      const otpResult = await this.verifyOTP(userId, 'email_verification', otpCode);

      if (!otpResult.success) {
        return otpResult;
      }

      // Mark user as verified
      await client.query(
        'UPDATE users SET is_verified = TRUE, email_verified_at = NOW() WHERE id = $1',
        [userId]
      );

      await client.query('COMMIT');

      // Send welcome email
      try {
        const userResult = await this.db.query(
          'SELECT email, first_name, name FROM users WHERE id = $1',
          [userId]
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          await emailService.sendWelcomeEmail(user);
        }
      } catch (welcomeError) {
        logger.warn('Failed to send welcome email:', welcomeError);
      }

      return {
        success: true,
        message: 'Email verified successfully',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to verify email with OTP:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reset password with OTP
   */
  async resetPasswordWithOTP(userId, otpCode, newPassword) {
    const bcrypt = await import('bcryptjs');
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Verify OTP
      const otpResult = await this.verifyOTP(userId, 'password_reset', otpCode);

      if (!otpResult.success) {
        return otpResult;
      }

      // Hash new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password and clear failed attempts
      await client.query(
        'UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, password_changed_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );

      // Invalidate all refresh tokens
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

      await client.query('COMMIT');

      // Send password change confirmation
      try {
        const userResult = await this.db.query(
          'SELECT email, first_name, name FROM users WHERE id = $1',
          [userId]
        );

        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          await emailService.sendPasswordChangeConfirmation(user);
        }
      } catch (emailError) {
        logger.warn('Failed to send password change confirmation:', emailError);
      }

      return {
        success: true,
        message: 'Password reset successfully',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to reset password with OTP:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired OTPs
   */
  async cleanupExpiredOTPs() {
    try {
      const result = await this.db.query(
        "DELETE FROM otp_codes WHERE expires_at < NOW() OR (is_used = TRUE AND used_at < NOW() - INTERVAL '1 day')"
      );

      if (result.rowCount > 0) {
        logger.info(`Cleaned up ${result.rowCount} expired OTP codes`);
      }

      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup expired OTPs:', error);
      throw error;
    }
  }

  /**
   * Get OTP statistics
   */
  async getOTPStats(timeframe = '24 hours') {
    try {
      const stats = await this.db.query(`
                SELECT 
                    otp_type,
                    COUNT(*) as total_generated,
                    COUNT(CASE WHEN is_used = TRUE THEN 1 END) as used_count,
                    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_count,
                    AVG(attempt_count) as avg_attempts
                FROM otp_codes 
                WHERE created_at > NOW() - INTERVAL '${timeframe}'
                GROUP BY otp_type
            `);

      return stats.rows;
    } catch (error) {
      logger.error('Failed to get OTP stats:', error);
      throw error;
    }
  }
}

export default OTPService;
