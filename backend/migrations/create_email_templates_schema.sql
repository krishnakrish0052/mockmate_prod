-- Email Templates Management Schema
-- Created: 2025-08-19
-- Purpose: Comprehensive email template system for MockMate platform

-- Main email templates table
CREATE TABLE email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'system', 'interview', 'billing', 'notification'
    template_type VARCHAR(100) NOT NULL, -- 'welcome', 'invitation', 'reminder', etc.
    subject_template TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT, -- Plain text fallback
    variables JSONB NOT NULL DEFAULT '{}', -- Expected variables and their types
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false, -- System templates cannot be deleted
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id)
);

-- Email template configurations (when/how to send)
CREATE TABLE email_template_configs (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id) ON DELETE CASCADE,
    trigger_event VARCHAR(255) NOT NULL, -- 'user_registered', 'interview_scheduled', etc.
    trigger_conditions JSONB DEFAULT '{}', -- Conditions for sending
    delay_minutes INTEGER DEFAULT 0, -- Delay before sending
    is_enabled BOOLEAN DEFAULT true,
    send_to_user BOOLEAN DEFAULT true,
    send_to_admin BOOLEAN DEFAULT false,
    send_to_custom BOOLEAN DEFAULT false,
    custom_recipients TEXT[], -- Array of email addresses
    priority INTEGER DEFAULT 5, -- 1-10, higher is more urgent
    retry_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email sending queue
CREATE TABLE email_queue (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    variables JSONB DEFAULT '{}',
    priority INTEGER DEFAULT 5,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sending', 'sent', 'failed', 'cancelled'
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    failed_at TIMESTAMP NULL,
    error_message TEXT NULL,
    provider_message_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email delivery tracking
CREATE TABLE email_tracking (
    id SERIAL PRIMARY KEY,
    queue_id INTEGER REFERENCES email_queue(id),
    tracking_id VARCHAR(255) UNIQUE NOT NULL, -- UUID for tracking
    event_type VARCHAR(50) NOT NULL, -- 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'
    event_data JSONB DEFAULT '{}', -- Additional event data
    ip_address INET NULL,
    user_agent TEXT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    provider_event_id VARCHAR(255) NULL
);

-- Email template analytics
CREATE TABLE email_template_analytics (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id),
    date_sent DATE NOT NULL,
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_complaints INTEGER DEFAULT 0,
    unique_opens INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, date_sent)
);

-- Email template variables definition
CREATE TABLE email_template_variables (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id) ON DELETE CASCADE,
    variable_name VARCHAR(255) NOT NULL,
    variable_type VARCHAR(100) NOT NULL, -- 'string', 'number', 'boolean', 'date', 'array', 'object'
    is_required BOOLEAN DEFAULT true,
    default_value TEXT NULL,
    description TEXT NULL,
    validation_rules JSONB DEFAULT '{}', -- JSON schema for validation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, variable_name)
);

-- Email provider settings
CREATE TABLE email_provider_settings (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL, -- 'sendgrid', 'aws_ses', 'smtp'
    is_active BOOLEAN DEFAULT false,
    is_primary BOOLEAN DEFAULT false,
    configuration JSONB NOT NULL, -- Provider-specific config
    daily_limit INTEGER DEFAULT 1000,
    monthly_limit INTEGER DEFAULT 30000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email sending logs
CREATE TABLE email_logs (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id),
    queue_id INTEGER REFERENCES email_queue(id),
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    status VARCHAR(50) NOT NULL,
    provider_name VARCHAR(100),
    provider_response JSONB DEFAULT '{}',
    error_details TEXT NULL,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_email_templates_type ON email_templates(template_type);
CREATE INDEX idx_email_templates_active ON email_templates(is_active);

CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_scheduled ON email_queue(scheduled_at);
CREATE INDEX idx_email_queue_priority ON email_queue(priority DESC);
CREATE INDEX idx_email_queue_recipient ON email_queue(recipient_email);

CREATE INDEX idx_email_tracking_queue_id ON email_tracking(queue_id);
CREATE INDEX idx_email_tracking_event_type ON email_tracking(event_type);
CREATE INDEX idx_email_tracking_timestamp ON email_tracking(timestamp);

CREATE INDEX idx_email_analytics_template_date ON email_template_analytics(template_id, date_sent);

CREATE INDEX idx_email_logs_template_id ON email_logs(template_id);
CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_sent_at ON email_logs(sent_at);

-- Triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_template_configs_updated_at BEFORE UPDATE ON email_template_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_queue_updated_at BEFORE UPDATE ON email_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_provider_settings_updated_at BEFORE UPDATE ON email_provider_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_email_template_analytics_updated_at BEFORE UPDATE ON email_template_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default email templates
INSERT INTO email_templates (name, display_name, description, category, template_type, subject_template, html_content, variables, is_system) VALUES
('welcome-onboarding', 'Welcome & Onboarding', 'Welcome email for new user registration', 'system', 'welcome', 'Welcome to MockMate - Your AI Interview Platform', 
 (SELECT pg_read_file('/path/to/email-templates/welcome-onboarding.html')), 
 '{"USER_NAME": "string", "USER_EMAIL": "string", "LOGIN_URL": "string", "UNSUBSCRIBE_URL": "string", "SUPPORT_URL": "string", "WEBSITE_URL": "string"}', 
 true),
 
('interview-invitation', 'Interview Invitation', 'Invitation email for scheduled interviews', 'interview', 'invitation', 'Interview Invitation - {{COMPANY_NAME}}', 
 (SELECT pg_read_file('/path/to/email-templates/interview-invitation.html')), 
 '{"CANDIDATE_NAME": "string", "COMPANY_NAME": "string", "POSITION": "string", "INTERVIEW_DATE": "string", "INTERVIEW_TIME": "string", "TIMEZONE": "string", "DURATION": "string", "INTERVIEW_TYPE": "string", "INTERVIEWER_NAME": "string", "INTERVIEWER_TITLE": "string", "MEETING_LINK": "string", "CONFIRM_URL": "string", "RESCHEDULE_URL": "string", "PRACTICE_URL": "string"}', 
 true),

('interview-reminder', 'Interview Reminder', 'Reminder email for upcoming interviews', 'interview', 'reminder', 'Interview Reminder - {{HOURS_UNTIL}} Hours to Go', 
 (SELECT pg_read_file('/path/to/email-templates/interview-reminder.html')), 
 '{"CANDIDATE_NAME": "string", "COMPANY_NAME": "string", "POSITION": "string", "HOURS_UNTIL": "number", "MINUTES_UNTIL": "number", "IS_URGENT": "boolean", "INTERVIEW_DATE": "string", "INTERVIEW_TIME": "string", "TIMEZONE": "string", "MEETING_LINK": "string", "PRACTICE_URL": "string"}', 
 true),

('interview-completion', 'Interview Completion', 'Post-interview feedback and results', 'interview', 'completion', 'Interview Complete - Thank You!', 
 (SELECT pg_read_file('/path/to/email-templates/interview-completion.html')), 
 '{"CANDIDATE_NAME": "string", "COMPANY_NAME": "string", "INTERVIEW_DURATION": "number", "HAS_SCORE": "boolean", "INTERVIEW_SCORE": "number", "TECHNICAL_FEEDBACK": "string", "COMMUNICATION_FEEDBACK": "string", "PROBLEM_SOLVING_FEEDBACK": "string", "IMPROVEMENT_AREAS": "string"}', 
 true),

('password-reset', 'Password Reset', 'Password reset request email', 'system', 'security', 'Password Reset Request - MockMate', 
 (SELECT pg_read_file('/path/to/email-templates/password-reset.html')), 
 '{"USER_NAME": "string", "USER_EMAIL": "string", "RESET_URL": "string", "EXPIRY_HOURS": "number", "REQUEST_IP": "string", "REQUEST_LOCATION": "string", "REQUEST_TIMESTAMP": "string"}', 
 true),

('account-verification', 'Account Verification', 'Email verification for new accounts', 'system', 'verification', 'Verify Your Account - MockMate', 
 (SELECT pg_read_file('/path/to/email-templates/account-verification.html')), 
 '{"USER_NAME": "string", "USER_EMAIL": "string", "VERIFICATION_CODE": "string", "VERIFICATION_URL": "string", "EXPIRY_HOURS": "number"}', 
 true),

('system-notification', 'System Notification', 'Platform alerts and maintenance notifications', 'notification', 'system', 'System Notification - MockMate', 
 (SELECT pg_read_file('/path/to/email-templates/system-notification.html')), 
 '{"NOTIFICATION_TYPE": "string", "SYSTEM_STATUS": "string", "STATUS_COLOR": "string", "NOTIFICATION_TITLE": "string", "NOTIFICATION_MESSAGE": "string", "TIMESTAMP": "string"}', 
 true),

('feedback-request', 'Feedback Request', 'User feedback collection email', 'engagement', 'feedback', 'We''d Love Your Feedback - MockMate', 
 (SELECT pg_read_file('/path/to/email-templates/feedback-request.html')), 
 '{"USER_NAME": "string", "USER_EMAIL": "string", "SESSION_ID": "string", "ACTIVITY_TYPE": "string", "FEEDBACK_URL": "string"}', 
 true),

('billing-subscription', 'Billing & Subscription', 'Billing and payment notifications', 'billing', 'transaction', '{{BILLING_TYPE}} - MockMate', 
 (SELECT pg_read_file('/path/to/email-templates/billing-subscription.html')), 
 '{"BILLING_TYPE": "string", "BILLING_TITLE": "string", "USER_NAME": "string", "PLAN_NAME": "string", "AMOUNT": "number", "IS_PAYMENT_SUCCESS": "boolean", "IS_PAYMENT_FAILED": "boolean"}', 
 true);

-- Insert default template configurations
INSERT INTO email_template_configs (template_id, trigger_event, is_enabled) VALUES
((SELECT id FROM email_templates WHERE name = 'welcome-onboarding'), 'user_registered', true),
((SELECT id FROM email_templates WHERE name = 'interview-invitation'), 'interview_scheduled', true),
((SELECT id FROM email_templates WHERE name = 'interview-reminder'), 'interview_reminder_24h', true),
((SELECT id FROM email_templates WHERE name = 'interview-reminder'), 'interview_reminder_2h', true),
((SELECT id FROM email_templates WHERE name = 'interview-completion'), 'interview_completed', true),
((SELECT id FROM email_templates WHERE name = 'password-reset'), 'password_reset_requested', true),
((SELECT id FROM email_templates WHERE name = 'account-verification'), 'account_verification_required', true),
((SELECT id FROM email_templates WHERE name = 'feedback-request'), 'interview_feedback_requested', true);

-- Comments for documentation
COMMENT ON TABLE email_templates IS 'Stores all email templates with HTML content and metadata';
COMMENT ON TABLE email_template_configs IS 'Configurations for when and how email templates should be triggered';
COMMENT ON TABLE email_queue IS 'Queue for emails to be sent, with retry logic and status tracking';
COMMENT ON TABLE email_tracking IS 'Tracks email delivery, opens, clicks, and other events';
COMMENT ON TABLE email_template_analytics IS 'Aggregated analytics data for email template performance';
COMMENT ON TABLE email_provider_settings IS 'Configuration for email service providers';
COMMENT ON TABLE email_logs IS 'Comprehensive logs of all email sending activities';
