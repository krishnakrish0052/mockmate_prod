-- Email sending history and tracking tables
-- These tables track email delivery status, opens, clicks, and provide analytics

-- Drop existing tables if they exist
DROP TABLE IF EXISTS email_opens CASCADE;
DROP TABLE IF EXISTS email_clicks CASCADE;
DROP TABLE IF EXISTS email_sending_history CASCADE;

-- Email sending history table
CREATE TABLE email_sending_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(255) UNIQUE, -- From SMTP provider
    template_id UUID REFERENCES email_templates(id),
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    subject TEXT NOT NULL,
    template_data JSONB DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, delivered, bounced, failed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    bounced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email opens tracking table
CREATE TABLE email_opens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_history_id UUID REFERENCES email_sending_history(id) ON DELETE CASCADE,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    location_country VARCHAR(100),
    location_city VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email clicks tracking table
CREATE TABLE email_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_history_id UUID REFERENCES email_sending_history(id) ON DELETE CASCADE,
    clicked_url TEXT NOT NULL,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    location_country VARCHAR(100),
    location_city VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX idx_email_history_recipient ON email_sending_history(recipient_email);
CREATE INDEX idx_email_history_template ON email_sending_history(template_id);
CREATE INDEX idx_email_history_status ON email_sending_history(status);
CREATE INDEX idx_email_history_sent_at ON email_sending_history(sent_at);
CREATE INDEX idx_email_history_message_id ON email_sending_history(message_id);

CREATE INDEX idx_email_opens_history ON email_opens(email_history_id);
CREATE INDEX idx_email_opens_opened_at ON email_opens(opened_at);

CREATE INDEX idx_email_clicks_history ON email_clicks(email_history_id);
CREATE INDEX idx_email_clicks_clicked_at ON email_clicks(clicked_at);
CREATE INDEX idx_email_clicks_url ON email_clicks(clicked_url);

-- Add computed columns for analytics
ALTER TABLE email_sending_history ADD COLUMN open_count INTEGER DEFAULT 0;
ALTER TABLE email_sending_history ADD COLUMN click_count INTEGER DEFAULT 0;
ALTER TABLE email_sending_history ADD COLUMN last_opened_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE email_sending_history ADD COLUMN last_clicked_at TIMESTAMP WITH TIME ZONE;

-- Functions to update computed columns
CREATE OR REPLACE FUNCTION update_email_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'email_opens' THEN
        UPDATE email_sending_history 
        SET 
            open_count = (
                SELECT COUNT(*) FROM email_opens 
                WHERE email_history_id = NEW.email_history_id
            ),
            last_opened_at = NEW.opened_at
        WHERE id = NEW.email_history_id;
        
    ELSIF TG_TABLE_NAME = 'email_clicks' THEN
        UPDATE email_sending_history 
        SET 
            click_count = (
                SELECT COUNT(*) FROM email_clicks 
                WHERE email_history_id = NEW.email_history_id
            ),
            last_clicked_at = NEW.clicked_at
        WHERE id = NEW.email_history_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update computed columns
CREATE TRIGGER trigger_update_open_stats
    AFTER INSERT ON email_opens
    FOR EACH ROW
    EXECUTE FUNCTION update_email_stats();

CREATE TRIGGER trigger_update_click_stats
    AFTER INSERT ON email_clicks
    FOR EACH ROW
    EXECUTE FUNCTION update_email_stats();

-- Email campaign management (optional)
CREATE TABLE email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_id UUID REFERENCES email_templates(id),
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, active, completed, cancelled
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link email history to campaigns
ALTER TABLE email_sending_history ADD COLUMN campaign_id UUID REFERENCES email_campaigns(id);

-- Campaign statistics view
CREATE OR REPLACE VIEW email_campaign_stats AS
SELECT 
    c.id,
    c.name,
    c.status,
    c.total_recipients,
    COUNT(h.id) as total_sent,
    COUNT(h.id) FILTER (WHERE h.status = 'delivered') as delivered_count,
    COUNT(h.id) FILTER (WHERE h.status = 'bounced') as bounce_count,
    COUNT(h.id) FILTER (WHERE h.status = 'failed') as failed_count,
    SUM(h.open_count) as total_opens,
    COUNT(DISTINCT h.id) FILTER (WHERE h.open_count > 0) as unique_opens,
    SUM(h.click_count) as total_clicks,
    COUNT(DISTINCT h.id) FILTER (WHERE h.click_count > 0) as unique_clicks,
    ROUND(
        (COUNT(DISTINCT h.id) FILTER (WHERE h.open_count > 0)::decimal / 
         NULLIF(COUNT(h.id) FILTER (WHERE h.status = 'delivered'), 0)) * 100, 2
    ) as open_rate,
    ROUND(
        (COUNT(DISTINCT h.id) FILTER (WHERE h.click_count > 0)::decimal / 
         NULLIF(COUNT(DISTINCT h.id) FILTER (WHERE h.open_count > 0), 0)) * 100, 2
    ) as click_through_rate
FROM email_campaigns c
LEFT JOIN email_sending_history h ON c.id = h.campaign_id
GROUP BY c.id, c.name, c.status, c.total_recipients;

-- Email analytics view for templates
CREATE OR REPLACE VIEW email_template_stats AS
SELECT 
    t.id as template_id,
    t.template_name,
    t.template_type,
    COUNT(h.id) as total_sent,
    COUNT(h.id) FILTER (WHERE h.status = 'delivered') as delivered_count,
    COUNT(h.id) FILTER (WHERE h.status = 'bounced') as bounce_count,
    COUNT(h.id) FILTER (WHERE h.status = 'failed') as failed_count,
    SUM(h.open_count) as total_opens,
    COUNT(DISTINCT h.id) FILTER (WHERE h.open_count > 0) as unique_opens,
    SUM(h.click_count) as total_clicks,
    COUNT(DISTINCT h.id) FILTER (WHERE h.click_count > 0) as unique_clicks,
    ROUND(AVG(h.open_count), 2) as avg_opens_per_email,
    ROUND(AVG(h.click_count), 2) as avg_clicks_per_email,
    ROUND(
        (COUNT(DISTINCT h.id) FILTER (WHERE h.open_count > 0)::decimal / 
         NULLIF(COUNT(h.id) FILTER (WHERE h.status = 'delivered'), 0)) * 100, 2
    ) as open_rate,
    ROUND(
        (COUNT(DISTINCT h.id) FILTER (WHERE h.click_count > 0)::decimal / 
         NULLIF(COUNT(DISTINCT h.id) FILTER (WHERE h.open_count > 0), 0)) * 100, 2
    ) as click_through_rate,
    MIN(h.sent_at) as first_sent,
    MAX(h.sent_at) as last_sent
FROM email_templates t
LEFT JOIN email_sending_history h ON t.id = h.template_id
WHERE t.is_active = true
GROUP BY t.id, t.template_name, t.template_type;

-- Daily email statistics view
CREATE OR REPLACE VIEW daily_email_stats AS
SELECT 
    DATE(sent_at) as date,
    COUNT(*) as emails_sent,
    COUNT(*) FILTER (WHERE status = 'delivered') as emails_delivered,
    COUNT(*) FILTER (WHERE status = 'bounced') as emails_bounced,
    COUNT(*) FILTER (WHERE status = 'failed') as emails_failed,
    SUM(open_count) as total_opens,
    COUNT(*) FILTER (WHERE open_count > 0) as emails_opened,
    SUM(click_count) as total_clicks,
    COUNT(*) FILTER (WHERE click_count > 0) as emails_clicked,
    ROUND(
        (COUNT(*) FILTER (WHERE open_count > 0)::decimal / 
         NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0)) * 100, 2
    ) as open_rate,
    ROUND(
        (COUNT(*) FILTER (WHERE click_count > 0)::decimal / 
         NULLIF(COUNT(*) FILTER (WHERE open_count > 0), 0)) * 100, 2
    ) as click_through_rate
FROM email_sending_history 
WHERE sent_at IS NOT NULL
GROUP BY DATE(sent_at)
ORDER BY DATE(sent_at) DESC;

-- Insert some sample data for testing
INSERT INTO email_campaigns (name, description, status, total_recipients, created_by)
VALUES 
('Welcome Campaign', 'Welcome emails for new users', 'active', 0, 
 (SELECT id FROM admin_users LIMIT 1)),
('Password Reset Campaign', 'Password reset notifications', 'active', 0, 
 (SELECT id FROM admin_users LIMIT 1));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON email_sending_history TO mockmate_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_opens TO mockmate_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_clicks TO mockmate_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_campaigns TO mockmate_user;
GRANT SELECT ON email_campaign_stats TO mockmate_user;
GRANT SELECT ON email_template_stats TO mockmate_user;
GRANT SELECT ON daily_email_stats TO mockmate_user;

-- Grant sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mockmate_user;
