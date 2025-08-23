-- Firebase Analytics and Security Tables
-- Run this migration to add tables for comprehensive Firebase analytics and security monitoring

-- User authentication events table for security monitoring
CREATE TABLE IF NOT EXISTS user_auth_events (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- login_success, login_failed, provider_linked, provider_unlinked, suspicious_activity, etc.
    provider VARCHAR(50), -- google, facebook, email, etc.
    ip_address INET,
    user_agent TEXT,
    location_data JSONB, -- city, country, etc.
    device_info JSONB, -- device type, OS, browser, etc.
    details JSONB, -- additional event-specific data
    created_at TIMESTAMP DEFAULT NOW()
);

-- User sessions table for session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    device_fingerprint VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    is_active BOOLEAN DEFAULT true,
    last_activity TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- User devices table for device management
CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50), -- mobile, tablet, desktop
    browser VARCHAR(100),
    operating_system VARCHAR(100),
    is_trusted BOOLEAN DEFAULT false,
    last_used_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, device_fingerprint)
);

-- User roles and permissions table for RBAC
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB, -- array of permission strings
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User role assignments
CREATE TABLE IF NOT EXISTS user_role_assignments (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES user_roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, role_id)
);

-- Webhooks table for event notifications
CREATE TABLE IF NOT EXISTS webhooks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[], -- array of event types to listen for
    secret_key VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    headers JSONB, -- custom headers to send
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Webhook delivery logs
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status_code INTEGER,
    response_body TEXT,
    attempt_number INTEGER DEFAULT 1,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add custom_claims column to users table if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='custom_claims') THEN
        ALTER TABLE users ADD COLUMN custom_claims JSONB;
    END IF;
END $$;

-- Add metadata columns for analytics (note: registration_source already exists)
DO $$ 
BEGIN
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referrer_url') THEN
        ALTER TABLE users ADD COLUMN referrer_url TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='utm_source') THEN
        ALTER TABLE users ADD COLUMN utm_source VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='utm_medium') THEN
        ALTER TABLE users ADD COLUMN utm_medium VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='utm_campaign') THEN
        ALTER TABLE users ADD COLUMN utm_campaign VARCHAR(100);
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_auth_events_user_id ON user_auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_auth_events_event_type ON user_auth_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_auth_events_created_at ON user_auth_events(created_at);
CREATE INDEX IF NOT EXISTS idx_user_auth_events_ip_address ON user_auth_events(ip_address);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_fingerprint ON user_devices(device_fingerprint);

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_id ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role_id ON user_role_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_active ON user_role_assignments(is_active);

CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- Insert default roles
INSERT INTO user_roles (name, description, permissions) VALUES 
('admin', 'Full system administrator', '["user.create", "user.read", "user.update", "user.delete", "admin.access", "analytics.view", "webhooks.manage"]'),
('moderator', 'Content moderator', '["user.read", "user.update", "content.moderate", "analytics.view"]'),
('user', 'Regular user', '["profile.read", "profile.update"]')
ON CONFLICT (name) DO NOTHING;

-- Create views for analytics
CREATE OR REPLACE VIEW auth_analytics_daily AS
SELECT 
    DATE(created_at) as date,
    event_type,
    provider,
    COUNT(*) as count
FROM user_auth_events 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), event_type, provider
ORDER BY date DESC;

CREATE OR REPLACE VIEW user_registration_analytics AS
SELECT 
    DATE(created_at) as date,
    registration_source,
    utm_source,
    utm_medium,
    COUNT(*) as registrations
FROM users 
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE(created_at), registration_source, utm_source, utm_medium
ORDER BY date DESC;

CREATE OR REPLACE VIEW active_sessions_view AS
SELECT 
    s.*,
    u.email,
    u.name,
    u.firebase_uid
FROM user_sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = true 
    AND s.expires_at > NOW();

-- Create function for cleaning up old data
CREATE OR REPLACE FUNCTION cleanup_old_auth_data()
RETURNS void AS $$
BEGIN
    -- Clean up old auth events (keep 6 months)
    DELETE FROM user_auth_events 
    WHERE created_at < NOW() - INTERVAL '6 months';
    
    -- Clean up expired sessions
    DELETE FROM user_sessions 
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Clean up old webhook deliveries (keep 30 days)
    DELETE FROM webhook_deliveries 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    RAISE NOTICE 'Old authentication data cleaned up';
END;
$$ LANGUAGE plpgsql;
