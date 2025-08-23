-- MockMate Essential Dynamic Configuration Population Script
-- Run this on your production database to populate missing configurations

-- Clear existing configs (optional - remove this line if you want to keep existing configs)
-- DELETE FROM system_config WHERE key NOT IN ('app_name', 'app_version');

-- Application Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('app_name', 'MockMate', 'Application name', true, NOW(), NOW()),
('app_version', '1.0.0', 'Current application version', true, NOW(), NOW()),
('app_description', 'AI-Powered Mock Interview Platform', 'Application description', true, NOW(), NOW()),
('maintenance_mode', 'false', 'Enable maintenance mode to disable user access', false, NOW(), NOW()),
('debug_mode', 'false', 'Enable debug mode for additional logging', false, NOW(), NOW()),
('api_rate_limit', '100', 'API rate limit per window', false, NOW(), NOW()),
('api_rate_window', '900000', 'API rate limit window in milliseconds (15 minutes)', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- User Management
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('registration_enabled', 'true', 'Allow new user registrations', false, NOW(), NOW()),
('email_verification_required', 'true', 'Require email verification for new accounts', false, NOW(), NOW()),
('new_user_starting_credits', '100', 'Starting credits for new users', false, NOW(), NOW()),
('max_sessions_per_user', '10', 'Maximum concurrent sessions per user', false, NOW(), NOW()),
('session_timeout_minutes', '60', 'Session timeout in minutes', false, NOW(), NOW()),
('failed_login_attempts_limit', '5', 'Maximum failed login attempts before lockout', false, NOW(), NOW()),
('account_lockout_minutes', '30', 'Account lockout duration in minutes', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Interview Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('interview_session_duration', '45', 'Default interview session duration in minutes', false, NOW(), NOW()),
('max_questions_per_session', '15', 'Maximum questions per interview session', false, NOW(), NOW()),
('ai_response_timeout', '30', 'AI response timeout in seconds', false, NOW(), NOW()),
('enable_audio_recording', 'true', 'Enable audio recording during interviews', false, NOW(), NOW()),
('enable_video_recording', 'false', 'Enable video recording during interviews', false, NOW(), NOW()),
('auto_save_interval', '30', 'Auto-save interview progress interval in seconds', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Credit System
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('credits_per_session', '10', 'Credits consumed per interview session', false, NOW(), NOW()),
('credits_per_question', '2', 'Credits consumed per AI-generated question', false, NOW(), NOW()),
('credits_per_analysis', '5', 'Credits consumed per interview analysis', false, NOW(), NOW()),
('free_trial_credits', '50', 'Credits given for free trial', false, NOW(), NOW()),
('credit_refund_enabled', 'true', 'Allow credit refunds for incomplete sessions', false, NOW(), NOW()),
('min_credits_required', '5', 'Minimum credits required to start a session', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Email Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('email_verification_timeout_hours', '24', 'Email verification token timeout in hours', false, NOW(), NOW()),
('password_reset_timeout_hours', '1', 'Password reset token timeout in hours', false, NOW(), NOW()),
('welcome_email_enabled', 'true', 'Send welcome email after registration', false, NOW(), NOW()),
('notification_emails_enabled', 'true', 'Send notification emails to users', false, NOW(), NOW()),
('from_email', 'noreply@mock-mate.com', 'From email address for system emails', false, NOW(), NOW()),
('from_name', 'MockMate', 'From name for system emails', false, NOW(), NOW()),
('support_email', 'support@mock-mate.com', 'Support email address', true, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Payment Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('payment_enabled', 'true', 'Enable payment processing', false, NOW(), NOW()),
('stripe_enabled', 'true', 'Enable Stripe payment processing', false, NOW(), NOW()),
('subscription_enabled', 'true', 'Enable subscription plans', false, NOW(), NOW()),
('free_tier_enabled', 'true', 'Enable free tier access', false, NOW(), NOW()),
('trial_period_days', '7', 'Trial period duration in days', false, NOW(), NOW()),
('refund_window_days', '14', 'Refund window in days', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Security Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('jwt_expiry_minutes', '15', 'JWT access token expiry in minutes', false, NOW(), NOW()),
('refresh_token_expiry_days', '7', 'Refresh token expiry in days', false, NOW(), NOW()),
('password_min_length', '8', 'Minimum password length', false, NOW(), NOW()),
('password_require_special', 'true', 'Require special characters in passwords', false, NOW(), NOW()),
('session_security_enabled', 'true', 'Enable enhanced session security', false, NOW(), NOW()),
('ip_whitelist_enabled', 'false', 'Enable IP whitelist for admin access', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- File Upload Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('max_file_size_mb', '10', 'Maximum file upload size in MB', false, NOW(), NOW()),
('allowed_file_types', 'pdf,doc,docx,txt', 'Allowed file types for uploads', false, NOW(), NOW()),
('resume_processing_enabled', 'true', 'Enable resume processing and parsing', false, NOW(), NOW()),
('file_retention_days', '365', 'File retention period in days', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Analytics Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('analytics_enabled', 'true', 'Enable analytics tracking', false, NOW(), NOW()),
('performance_monitoring', 'true', 'Enable performance monitoring', false, NOW(), NOW()),
('user_activity_tracking', 'true', 'Enable user activity tracking', false, NOW(), NOW()),
('error_reporting_enabled', 'true', 'Enable error reporting and logging', false, NOW(), NOW()),
('metrics_retention_days', '90', 'Metrics retention period in days', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Feature Flags
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('feature_ai_feedback', 'true', 'Enable AI-powered feedback feature', false, NOW(), NOW()),
('feature_resume_analysis', 'true', 'Enable resume analysis feature', false, NOW(), NOW()),
('feature_mock_interviews', 'true', 'Enable mock interview feature', false, NOW(), NOW()),
('feature_practice_mode', 'true', 'Enable practice mode', false, NOW(), NOW()),
('feature_admin_dashboard', 'true', 'Enable admin dashboard', false, NOW(), NOW()),
('feature_user_dashboard', 'true', 'Enable user dashboard', false, NOW(), NOW()),
('feature_payment_gateway', 'true', 'Enable payment gateway integration', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Public Display Settings
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('site_title', 'MockMate - AI Mock Interviews', 'Site title for browser', true, NOW(), NOW()),
('site_description', 'Prepare for your dream job with AI-powered mock interviews', 'Site description for SEO', true, NOW(), NOW()),
('contact_email', 'hello@mock-mate.com', 'Public contact email', true, NOW(), NOW()),
('social_twitter', '@mockmate', 'Twitter handle', true, NOW(), NOW()),
('social_linkedin', 'mockmate', 'LinkedIn handle', true, NOW(), NOW()),
('terms_url', '/terms', 'Terms of service URL', true, NOW(), NOW()),
('privacy_url', '/privacy', 'Privacy policy URL', true, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- System Status
INSERT INTO system_config (key, value, description, is_public, created_at, updated_at) VALUES 
('system_status', 'operational', 'Current system status', true, NOW(), NOW()),
('last_backup_date', NOW()::text, 'Last database backup date', false, NOW(), NOW()),
('config_version', '1.0.0', 'Configuration schema version', false, NOW(), NOW()),
('deployment_environment', 'production', 'Current deployment environment', false, NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    updated_at = NOW();

-- Verify configuration count
SELECT 
    COUNT(*) as total_configs,
    COUNT(CASE WHEN is_public = true THEN 1 END) as public_configs,
    COUNT(CASE WHEN is_public = false THEN 1 END) as private_configs
FROM system_config;
