-- =====================================================================================
-- MockMate Alerts System Migration
-- Version: 1.0.0
-- Purpose: Add real-time alerts functionality for admin and user notifications
-- =====================================================================================

-- Create alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Alert content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    alert_type VARCHAR(50) NOT NULL DEFAULT 'info' CHECK (alert_type IN ('info', 'warning', 'error', 'success', 'announcement')),
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    
    -- Targeting
    target_type VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'specific', 'role', 'admin')),
    target_user_ids UUID[],  -- Array of specific user IDs (when target_type = 'specific')
    target_roles TEXT[],     -- Array of roles (when target_type = 'role')
    
    -- Metadata
    action_url TEXT,         -- Optional URL for call-to-action
    action_text VARCHAR(100), -- Text for action button
    icon VARCHAR(50),        -- Icon identifier
    
    -- Scheduling and lifecycle
    starts_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_dismissible BOOLEAN DEFAULT TRUE,
    
    -- Admin info
    created_by UUID NOT NULL REFERENCES admin_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_alert_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
    CONSTRAINT chk_alert_message_not_empty CHECK (LENGTH(TRIM(message)) > 0),
    CONSTRAINT chk_alert_times CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at <= expires_at)
);

-- Create alert recipients table for tracking read status
CREATE TABLE IF NOT EXISTS alert_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Status tracking
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    dismissed_at TIMESTAMP,
    
    -- Delivery tracking
    delivered_at TIMESTAMP DEFAULT NOW(),
    delivery_method VARCHAR(50) DEFAULT 'websocket' CHECK (delivery_method IN ('websocket', 'email', 'push')),
    
    -- Unique constraint to prevent duplicate recipients
    UNIQUE(alert_id, user_id)
);

-- Create alert templates table for reusable alert formats
CREATE TABLE IF NOT EXISTS alert_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    title_template VARCHAR(255) NOT NULL,
    message_template TEXT NOT NULL,
    alert_type VARCHAR(50) NOT NULL DEFAULT 'info' CHECK (alert_type IN ('info', 'warning', 'error', 'success', 'announcement')),
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    icon VARCHAR(50),
    variables JSONB DEFAULT '[]',  -- Array of variable names that can be replaced
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Admin info
    created_by UUID NOT NULL REFERENCES admin_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_template_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT chk_template_title_not_empty CHECK (LENGTH(TRIM(title_template)) > 0),
    CONSTRAINT chk_template_message_not_empty CHECK (LENGTH(TRIM(message_template)) > 0)
);

-- Create alert analytics table for tracking engagement
CREATE TABLE IF NOT EXISTS alert_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    
    -- Analytics data
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    dismissed_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    
    -- Engagement rates (calculated)
    delivery_rate DECIMAL(5,2) DEFAULT 0.00,  -- delivered / total_recipients * 100
    read_rate DECIMAL(5,2) DEFAULT 0.00,      -- read / delivered * 100
    click_rate DECIMAL(5,2) DEFAULT 0.00,     -- clicked / delivered * 100
    
    -- Timestamps
    calculated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_analytics_positive CHECK (
        total_recipients >= 0 AND delivered_count >= 0 AND 
        read_count >= 0 AND dismissed_count >= 0 AND clicked_count >= 0
    ),
    CONSTRAINT chk_analytics_logical CHECK (
        delivered_count <= total_recipients AND
        read_count <= delivered_count AND
        dismissed_count <= delivered_count AND
        clicked_count <= delivered_count
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_alerts_created_by ON alerts(created_by);
CREATE INDEX IF NOT EXISTS idx_alerts_is_active ON alerts(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_alerts_target_type ON alerts(target_type);
CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority);
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_starts_at ON alerts(starts_at);
CREATE INDEX IF NOT EXISTS idx_alerts_expires_at ON alerts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_target_user_ids ON alerts USING gin(target_user_ids) WHERE target_user_ids IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_recipients_alert_id ON alert_recipients(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_recipients_user_id ON alert_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_recipients_is_read ON alert_recipients(is_read);
CREATE INDEX IF NOT EXISTS idx_alert_recipients_delivered_at ON alert_recipients(delivered_at);
CREATE INDEX IF NOT EXISTS idx_alert_recipients_user_read ON alert_recipients(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_alert_templates_name ON alert_templates(name);
CREATE INDEX IF NOT EXISTS idx_alert_templates_is_active ON alert_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_alert_templates_created_by ON alert_templates(created_by);

CREATE INDEX IF NOT EXISTS idx_alert_analytics_alert_id ON alert_analytics(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_analytics_calculated_at ON alert_analytics(calculated_at);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_alerts_updated_at_trigger
    BEFORE UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_alerts_updated_at();

CREATE TRIGGER update_alert_templates_updated_at_trigger
    BEFORE UPDATE ON alert_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_alerts_updated_at();

-- Function to get active alerts for a user
CREATE OR REPLACE FUNCTION get_user_alerts(user_uuid UUID, include_read BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
    id UUID,
    title VARCHAR(255),
    message TEXT,
    alert_type VARCHAR(50),
    priority VARCHAR(20),
    action_url TEXT,
    action_text VARCHAR(100),
    icon VARCHAR(50),
    is_read BOOLEAN,
    is_dismissed BOOLEAN,
    read_at TIMESTAMP,
    dismissed_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        a.id,
        a.title,
        a.message,
        a.alert_type,
        a.priority,
        a.action_url,
        a.action_text,
        a.icon,
        COALESCE(ar.is_read, FALSE) as is_read,
        COALESCE(ar.is_dismissed, FALSE) as is_dismissed,
        ar.read_at,
        ar.dismissed_at,
        ar.delivered_at,
        a.created_at
    FROM alerts a
    LEFT JOIN alert_recipients ar ON a.id = ar.alert_id AND ar.user_id = user_uuid
    WHERE a.is_active = TRUE
    AND (a.starts_at IS NULL OR a.starts_at <= NOW())
    AND (a.expires_at IS NULL OR a.expires_at > NOW())
    AND (
        a.target_type = 'all'
        OR (a.target_type = 'specific' AND user_uuid = ANY(a.target_user_ids))
        OR (a.target_type = 'admin' AND EXISTS (SELECT 1 FROM admin_users WHERE id = user_uuid))
    )
    AND (include_read = TRUE OR COALESCE(ar.is_read, FALSE) = FALSE)
    AND COALESCE(ar.is_dismissed, FALSE) = FALSE
    ORDER BY a.priority DESC, a.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to mark alert as read
CREATE OR REPLACE FUNCTION mark_alert_as_read(alert_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    recipient_exists BOOLEAN;
BEGIN
    -- Check if alert recipient record exists
    SELECT EXISTS(
        SELECT 1 FROM alert_recipients 
        WHERE alert_id = alert_uuid AND user_id = user_uuid
    ) INTO recipient_exists;
    
    IF NOT recipient_exists THEN
        -- Create recipient record if it doesn't exist
        INSERT INTO alert_recipients (alert_id, user_id, is_read, read_at)
        VALUES (alert_uuid, user_uuid, TRUE, NOW())
        ON CONFLICT (alert_id, user_id) DO NOTHING;
    ELSE
        -- Update existing record
        UPDATE alert_recipients 
        SET is_read = TRUE, read_at = NOW()
        WHERE alert_id = alert_uuid AND user_id = user_uuid;
    END IF;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to dismiss alert
CREATE OR REPLACE FUNCTION dismiss_alert(alert_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    recipient_exists BOOLEAN;
BEGIN
    -- Check if alert recipient record exists
    SELECT EXISTS(
        SELECT 1 FROM alert_recipients 
        WHERE alert_id = alert_uuid AND user_id = user_uuid
    ) INTO recipient_exists;
    
    IF NOT recipient_exists THEN
        -- Create recipient record if it doesn't exist
        INSERT INTO alert_recipients (alert_id, user_id, is_dismissed, dismissed_at)
        VALUES (alert_uuid, user_uuid, TRUE, NOW())
        ON CONFLICT (alert_id, user_id) DO NOTHING;
    ELSE
        -- Update existing record
        UPDATE alert_recipients 
        SET is_dismissed = TRUE, dismissed_at = NOW()
        WHERE alert_id = alert_uuid AND user_id = user_uuid;
    END IF;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to create and deliver alert
CREATE OR REPLACE FUNCTION create_and_deliver_alert(
    p_title VARCHAR(255),
    p_message TEXT,
    p_alert_type VARCHAR(50) DEFAULT 'info',
    p_priority VARCHAR(20) DEFAULT 'normal',
    p_target_type VARCHAR(20) DEFAULT 'all',
    p_target_user_ids UUID[] DEFAULT NULL,
    p_target_roles TEXT[] DEFAULT NULL,
    p_action_url TEXT DEFAULT NULL,
    p_action_text VARCHAR(100) DEFAULT NULL,
    p_icon VARCHAR(50) DEFAULT NULL,
    p_starts_at TIMESTAMP DEFAULT NOW(),
    p_expires_at TIMESTAMP DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    alert_id UUID;
    target_user_id UUID;
    user_count INTEGER := 0;
BEGIN
    -- Insert the alert
    INSERT INTO alerts (
        title, message, alert_type, priority, target_type,
        target_user_ids, target_roles, action_url, action_text, icon,
        starts_at, expires_at, created_by
    ) VALUES (
        p_title, p_message, p_alert_type, p_priority, p_target_type,
        p_target_user_ids, p_target_roles, p_action_url, p_action_text, p_icon,
        p_starts_at, p_expires_at, p_created_by
    ) RETURNING id INTO alert_id;
    
    -- Create recipient records based on target type
    IF p_target_type = 'all' THEN
        -- Insert recipients for all active users
        INSERT INTO alert_recipients (alert_id, user_id)
        SELECT alert_id, u.id
        FROM users u
        WHERE u.is_active = TRUE;
        
        GET DIAGNOSTICS user_count = ROW_COUNT;
        
    ELSIF p_target_type = 'specific' AND p_target_user_ids IS NOT NULL THEN
        -- Insert recipients for specific users
        FOREACH target_user_id IN ARRAY p_target_user_ids
        LOOP
            INSERT INTO alert_recipients (alert_id, user_id)
            SELECT alert_id, target_user_id
            WHERE EXISTS (SELECT 1 FROM users WHERE id = target_user_id AND is_active = TRUE)
            ON CONFLICT (alert_id, user_id) DO NOTHING;
        END LOOP;
        
        SELECT array_length(p_target_user_ids, 1) INTO user_count;
        
    ELSIF p_target_type = 'admin' THEN
        -- Insert recipients for admin users
        INSERT INTO alert_recipients (alert_id, user_id)
        SELECT alert_id, au.id
        FROM admin_users au
        WHERE au.is_active = TRUE;
        
        GET DIAGNOSTICS user_count = ROW_COUNT;
    END IF;
    
    -- Create initial analytics record
    INSERT INTO alert_analytics (alert_id, total_recipients)
    VALUES (alert_id, user_count);
    
    RETURN alert_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update alert analytics
CREATE OR REPLACE FUNCTION update_alert_analytics(alert_uuid UUID)
RETURNS VOID AS $$
DECLARE
    analytics_data RECORD;
BEGIN
    -- Calculate analytics
    SELECT
        COUNT(*) as total_recipients,
        COUNT(CASE WHEN delivered_at IS NOT NULL THEN 1 END) as delivered_count,
        COUNT(CASE WHEN is_read = TRUE THEN 1 END) as read_count,
        COUNT(CASE WHEN is_dismissed = TRUE THEN 1 END) as dismissed_count
    INTO analytics_data
    FROM alert_recipients
    WHERE alert_id = alert_uuid;
    
    -- Update or insert analytics
    INSERT INTO alert_analytics (
        alert_id, total_recipients, delivered_count, read_count, dismissed_count,
        delivery_rate, read_rate, calculated_at
    ) VALUES (
        alert_uuid,
        analytics_data.total_recipients,
        analytics_data.delivered_count,
        analytics_data.read_count,
        analytics_data.dismissed_count,
        CASE WHEN analytics_data.total_recipients > 0 
             THEN (analytics_data.delivered_count::decimal / analytics_data.total_recipients * 100)
             ELSE 0 END,
        CASE WHEN analytics_data.delivered_count > 0 
             THEN (analytics_data.read_count::decimal / analytics_data.delivered_count * 100)
             ELSE 0 END,
        NOW()
    )
    ON CONFLICT (alert_id) 
    DO UPDATE SET
        total_recipients = EXCLUDED.total_recipients,
        delivered_count = EXCLUDED.delivered_count,
        read_count = EXCLUDED.read_count,
        dismissed_count = EXCLUDED.dismissed_count,
        delivery_rate = EXCLUDED.delivery_rate,
        read_rate = EXCLUDED.read_rate,
        calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- View for admin alert management
CREATE OR REPLACE VIEW admin_alert_overview AS
SELECT 
    a.id,
    a.title,
    a.message,
    a.alert_type,
    a.priority,
    a.target_type,
    a.is_active,
    a.starts_at,
    a.expires_at,
    a.created_at,
    a.updated_at,
    au.full_name as created_by_name,
    aa.total_recipients,
    aa.delivered_count,
    aa.read_count,
    aa.dismissed_count,
    aa.delivery_rate,
    aa.read_rate,
    CASE 
        WHEN a.expires_at IS NOT NULL AND a.expires_at <= NOW() THEN 'expired'
        WHEN a.starts_at > NOW() THEN 'scheduled'
        WHEN a.is_active = FALSE THEN 'inactive'
        ELSE 'active'
    END as status
FROM alerts a
LEFT JOIN admin_users au ON a.created_by = au.id
LEFT JOIN alert_analytics aa ON a.id = aa.alert_id
ORDER BY a.created_at DESC;

-- Insert default alert templates
INSERT INTO alert_templates (name, title_template, message_template, alert_type, priority, icon, created_by) 
SELECT 
    'welcome_user',
    'Welcome to MockMate!',
    'Thank you for joining MockMate. You have {{credits}} free credits to start your interview practice.',
    'success',
    'normal',
    'user-plus',
    (SELECT id FROM admin_users WHERE role = 'super_admin' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM admin_users WHERE role = 'super_admin')
ON CONFLICT (name) DO NOTHING;

INSERT INTO alert_templates (name, title_template, message_template, alert_type, priority, icon, created_by)
SELECT 
    'low_credits',
    'Low Credits Warning',
    'You have {{credits}} credits remaining. Purchase more credits to continue using MockMate.',
    'warning',
    'high',
    'credit-card',
    (SELECT id FROM admin_users WHERE role = 'super_admin' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM admin_users WHERE role = 'super_admin')
ON CONFLICT (name) DO NOTHING;

INSERT INTO alert_templates (name, title_template, message_template, alert_type, priority, icon, created_by)
SELECT 
    'system_maintenance',
    'Scheduled Maintenance',
    'MockMate will undergo scheduled maintenance on {{date}} from {{start_time}} to {{end_time}}. Service may be temporarily unavailable.',
    'info',
    'high',
    'wrench',
    (SELECT id FROM admin_users WHERE role = 'super_admin' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM admin_users WHERE role = 'super_admin')
ON CONFLICT (name) DO NOTHING;

INSERT INTO alert_templates (name, title_template, message_template, alert_type, priority, icon, created_by)
SELECT 
    'new_feature',
    'New Feature Available',
    'We\'ve added a new feature: {{feature_name}}. {{description}}',
    'announcement',
    'normal',
    'star',
    (SELECT id FROM admin_users WHERE role = 'super_admin' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM admin_users WHERE role = 'super_admin')
ON CONFLICT (name) DO NOTHING;

-- Create trigger to update analytics when recipient status changes
CREATE OR REPLACE FUNCTION trigger_update_alert_analytics()
RETURNS TRIGGER AS $$
BEGIN
    -- Update analytics for the affected alert
    PERFORM update_alert_analytics(COALESCE(NEW.alert_id, OLD.alert_id));
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER alert_recipients_analytics_trigger
    AFTER INSERT OR UPDATE OR DELETE ON alert_recipients
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_alert_analytics();

-- Grant necessary permissions (uncomment when setting up with specific database users)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON alerts TO mockmate_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON alert_recipients TO mockmate_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON alert_templates TO mockmate_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON alert_analytics TO mockmate_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO mockmate_app;
