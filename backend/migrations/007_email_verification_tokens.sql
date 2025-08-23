-- Email Verification Tokens Table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    used_at TIMESTAMP,
    is_used BOOLEAN DEFAULT FALSE,
    
    -- Add index for faster token lookups
    UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);

-- Email Templates Table for Admin Configuration
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) NOT NULL UNIQUE,
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('verification', 'welcome', 'password_reset', 'password_change', 'credits_purchase', 'notification')),
    subject VARCHAR(500) NOT NULL,
    template_content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Email Send Logs Table for Tracking
CREATE TABLE IF NOT EXISTS email_send_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_email VARCHAR(320) NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    template_name VARCHAR(100),
    subject VARCHAR(500) NOT NULL,
    email_provider VARCHAR(50) DEFAULT 'nodemailer',
    send_status VARCHAR(50) DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'delivered', 'bounced', 'failed', 'rejected')),
    message_id VARCHAR(255),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    bounced_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- User Email Preferences Table
CREATE TABLE IF NOT EXISTS user_email_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    marketing_emails BOOLEAN DEFAULT TRUE,
    security_alerts BOOLEAN DEFAULT TRUE,
    product_updates BOOLEAN DEFAULT TRUE,
    interview_reminders BOOLEAN DEFAULT TRUE,
    credit_notifications BOOLEAN DEFAULT TRUE,
    weekly_reports BOOLEAN DEFAULT TRUE,
    unsubscribe_token VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Analytics Tables
CREATE TABLE IF NOT EXISTS user_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    page_url VARCHAR(2000),
    referrer VARCHAR(2000),
    action_type VARCHAR(100) NOT NULL,
    action_details JSONB DEFAULT '{}',
    browser_info JSONB DEFAULT '{}',
    device_info JSONB DEFAULT '{}',
    location_info JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS website_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    total_visits BIGINT DEFAULT 0,
    unique_visitors BIGINT DEFAULT 0,
    page_views BIGINT DEFAULT 0,
    new_users BIGINT DEFAULT 0,
    returning_users BIGINT DEFAULT 0,
    bounce_rate DECIMAL(5,2),
    avg_session_duration INTERVAL,
    top_pages JSONB DEFAULT '[]',
    top_referrers JSONB DEFAULT '[]',
    device_breakdown JSONB DEFAULT '{}',
    browser_breakdown JSONB DEFAULT '{}',
    location_breakdown JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(date)
);

-- Active Sessions Table for Real-time User Tracking
CREATE TABLE IF NOT EXISTS active_user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    socket_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    page_url VARCHAR(2000),
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP DEFAULT NOW(),
    connected_at TIMESTAMP DEFAULT NOW(),
    disconnected_at TIMESTAMP,
    
    UNIQUE(session_id)
);

-- Insert default email templates
INSERT INTO email_templates (template_name, template_type, subject, template_content, variables) VALUES
    ('email-verification', 'verification', 'Verify Your MockMate Account', '', '["userName", "verificationUrl", "userEmail"]'),
    ('welcome', 'welcome', 'Welcome to MockMate! 🚀', '', '["userName", "userEmail", "loginUrl"]'),
    ('password-reset', 'password_reset', 'Reset Your MockMate Password', '', '["userName", "resetUrl", "userEmail"]'),
    ('password-change-confirmation', 'password_change', 'Password Changed Successfully', '', '["userName", "userEmail", "changeTime", "supportUrl"]'),
    ('credits-purchase', 'credits_purchase', 'Credits Purchase Confirmation', '', '["userName", "userEmail", "creditsAmount", "purchaseAmount", "transactionId", "purchaseDate"]'),
    ('notification', 'notification', 'MockMate Notification', '', '["userName", "userEmail", "notificationTitle", "notificationMessage", "notificationDate", "actionUrl"]')
ON CONFLICT (template_name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_send_logs_user_id ON email_send_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_send_logs_created_at ON email_send_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_send_logs_send_status ON email_send_logs(send_status);
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_timestamp ON user_analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_analytics_action_type ON user_analytics(action_type);
CREATE INDEX IF NOT EXISTS idx_website_analytics_date ON website_analytics(date);
CREATE INDEX IF NOT EXISTS idx_active_user_sessions_user_id ON active_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_user_sessions_is_active ON active_user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_active_user_sessions_last_activity ON active_user_sessions(last_activity);
