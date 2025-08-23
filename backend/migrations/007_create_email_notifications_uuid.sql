-- Migration 007: Email Notification System (UUID Compatible)
-- Create tables for bulk email campaigns and tracking

-- Email Campaigns Table
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(500) NOT NULL,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    custom_html TEXT,
    recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('all_users', 'specific_users', 'email_list', 'custom')),
    recipient_data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed', 'partial_success', 'cancelled')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    total_recipients INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Campaign Recipients Table (tracks individual email sends)
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    bounced_at TIMESTAMP WITH TIME ZONE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    message_id VARCHAR(255),
    error_message TEXT,
    tracking_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Campaign Links Table (for click tracking)
CREATE TABLE IF NOT EXISTS email_campaign_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    tracking_url TEXT NOT NULL,
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Campaign Link Clicks Table (detailed click tracking)
CREATE TABLE IF NOT EXISTS email_campaign_link_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES email_campaign_links(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES email_campaign_recipients(id) ON DELETE CASCADE,
    user_agent TEXT,
    ip_address INET,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    additional_data JSONB DEFAULT '{}'
);

-- Update existing email_templates table to add bulk email support
ALTER TABLE email_templates 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES email_template_categories(id),
ADD COLUMN IF NOT EXISTS is_bulk_template BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS supports_personalization BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS usage_notes TEXT;

-- Email Unsubscriptions Table
CREATE TABLE IF NOT EXISTS email_unsubscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    unsubscribed_from VARCHAR(100) NOT NULL DEFAULT 'all', -- 'all', 'promotional', 'notifications', etc.
    reason VARCHAR(255),
    unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    UNIQUE(email, unsubscribed_from)
);

-- Email Notification Preferences Table
CREATE TABLE IF NOT EXISTS email_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    promotional_emails BOOLEAN DEFAULT true,
    announcement_emails BOOLEAN DEFAULT true,
    system_emails BOOLEAN DEFAULT true,
    newsletter BOOLEAN DEFAULT true,
    frequency VARCHAR(50) DEFAULT 'immediate' CHECK (frequency IN ('immediate', 'daily', 'weekly', 'monthly')),
    timezone VARCHAR(50) DEFAULT 'UTC',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON email_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_at ON email_campaigns(created_at);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign_id ON email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_email ON email_campaign_recipients(email);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_status ON email_campaign_recipients(status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_user_id ON email_campaign_recipients(user_id);

CREATE INDEX IF NOT EXISTS idx_email_campaign_links_campaign_id ON email_campaign_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_link_clicks_link_id ON email_campaign_link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_link_clicks_recipient_id ON email_campaign_link_clicks(recipient_id);

CREATE INDEX IF NOT EXISTS idx_email_unsubscriptions_email ON email_unsubscriptions(email);
CREATE INDEX IF NOT EXISTS idx_email_unsubscriptions_user_id ON email_unsubscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_email_notification_preferences_user_id ON email_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notification_preferences_email ON email_notification_preferences(email);

-- Insert default notification preferences for existing users
INSERT INTO email_notification_preferences (user_id, email)
SELECT id, email FROM users 
WHERE id NOT IN (SELECT user_id FROM email_notification_preferences WHERE user_id IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;

-- Update existing email templates to be bulk templates
UPDATE email_templates 
SET is_bulk_template = true, 
    category_id = (SELECT id FROM email_template_categories WHERE name = 'Transactional' LIMIT 1)
WHERE category_id IS NULL;

-- Apply triggers
DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER update_email_campaigns_updated_at 
    BEFORE UPDATE ON email_campaigns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_notification_preferences_updated_at ON email_notification_preferences;
CREATE TRIGGER update_email_notification_preferences_updated_at 
    BEFORE UPDATE ON email_notification_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create a view for campaign analytics
CREATE OR REPLACE VIEW email_campaign_analytics AS
SELECT 
    ec.id,
    ec.name,
    ec.subject,
    ec.status,
    ec.total_recipients,
    ec.success_count,
    ec.failure_count,
    ec.sent_at,
    ec.created_at,
    u.name as created_by_name,
    COALESCE(
        ROUND(
            (ec.success_count::float / NULLIF(ec.total_recipients, 0)) * 100, 
            2
        ), 
        0
    ) as delivery_rate,
    COUNT(DISTINCT ecr.id) FILTER (WHERE ecr.opened_at IS NOT NULL) as opened_count,
    COUNT(DISTINCT ecr.id) FILTER (WHERE ecr.clicked_at IS NOT NULL) as clicked_count,
    COALESCE(
        ROUND(
            (COUNT(DISTINCT ecr.id) FILTER (WHERE ecr.opened_at IS NOT NULL)::float / NULLIF(ec.success_count, 0)) * 100, 
            2
        ), 
        0
    ) as open_rate,
    COALESCE(
        ROUND(
            (COUNT(DISTINCT ecr.id) FILTER (WHERE ecr.clicked_at IS NOT NULL)::float / NULLIF(ec.success_count, 0)) * 100, 
            2
        ), 
        0
    ) as click_rate
FROM email_campaigns ec
LEFT JOIN users u ON ec.created_by = u.id
LEFT JOIN email_campaign_recipients ecr ON ec.id = ecr.campaign_id
GROUP BY ec.id, ec.name, ec.subject, ec.status, ec.total_recipients, ec.success_count, ec.failure_count, ec.sent_at, ec.created_at, u.name;

-- Comments
COMMENT ON TABLE email_campaigns IS 'Stores bulk email campaign information';
COMMENT ON TABLE email_campaign_recipients IS 'Tracks individual email sends and delivery status';
COMMENT ON TABLE email_campaign_links IS 'Stores trackable links used in email campaigns';
COMMENT ON TABLE email_campaign_link_clicks IS 'Records detailed click tracking data';
COMMENT ON TABLE email_unsubscriptions IS 'Tracks user unsubscriptions from email campaigns';
COMMENT ON TABLE email_notification_preferences IS 'User preferences for different types of email notifications';
COMMENT ON VIEW email_campaign_analytics IS 'Aggregated analytics view for email campaigns';
