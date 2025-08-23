-- Dynamic Configuration System Migration
-- This migration creates tables for storing all system configurations dynamically

-- =============================================================================
-- Configuration Categories Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS configuration_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'settings',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================================================
-- System Configurations Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS system_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES configuration_categories(id) ON DELETE RESTRICT,
    config_key VARCHAR(200) NOT NULL UNIQUE,
    display_name VARCHAR(300) NOT NULL,
    description TEXT,
    config_value TEXT,
    default_value TEXT,
    value_type VARCHAR(50) DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'encrypted', 'url', 'email', 'array')),
    validation_rules JSONB DEFAULT '{}'::jsonb,
    is_required BOOLEAN DEFAULT FALSE,
    is_sensitive BOOLEAN DEFAULT FALSE, -- If true, value will be encrypted
    is_client_accessible BOOLEAN DEFAULT FALSE, -- If true, can be accessed by frontend
    environment VARCHAR(50) DEFAULT 'all' CHECK (environment IN ('all', 'development', 'staging', 'production')),
    restart_required BOOLEAN DEFAULT FALSE, -- If true, server needs restart when changed
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id),
    updated_by UUID REFERENCES admin_users(id)
);

-- =============================================================================
-- Configuration Change History Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS configuration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID REFERENCES system_configurations(id) ON DELETE CASCADE,
    old_value TEXT,
    new_value TEXT,
    change_reason VARCHAR(500),
    changed_by UUID REFERENCES admin_users(id),
    changed_at TIMESTAMP DEFAULT NOW(),
    client_ip VARCHAR(45),
    user_agent TEXT
);

-- =============================================================================
-- Configuration Cache Table (for performance)
-- =============================================================================
CREATE TABLE IF NOT EXISTS configuration_cache (
    config_key VARCHAR(200) PRIMARY KEY,
    config_value TEXT,
    value_type VARCHAR(50),
    is_sensitive BOOLEAN DEFAULT FALSE,
    cached_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 hour')
);

-- =============================================================================
-- Feature Flags Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(200) NOT NULL UNIQUE,
    display_name VARCHAR(300) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    target_users JSONB DEFAULT '[]'::jsonb, -- Array of user IDs
    target_groups JSONB DEFAULT '[]'::jsonb, -- Array of user groups
    conditions JSONB DEFAULT '{}'::jsonb, -- Complex conditions for flag activation
    environment VARCHAR(50) DEFAULT 'all' CHECK (environment IN ('all', 'development', 'staging', 'production')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id),
    updated_by UUID REFERENCES admin_users(id)
);

-- =============================================================================
-- Configuration Templates Table (for common setups)
-- =============================================================================
CREATE TABLE IF NOT EXISTS configuration_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(200) NOT NULL UNIQUE,
    display_name VARCHAR(300) NOT NULL,
    description TEXT,
    template_data JSONB NOT NULL, -- Complete configuration set
    environment VARCHAR(50) DEFAULT 'all',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id)
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_system_configurations_category ON system_configurations(category_id);
CREATE INDEX IF NOT EXISTS idx_system_configurations_key ON system_configurations(config_key);
CREATE INDEX IF NOT EXISTS idx_system_configurations_environment ON system_configurations(environment);
CREATE INDEX IF NOT EXISTS idx_system_configurations_client_accessible ON system_configurations(is_client_accessible);
CREATE INDEX IF NOT EXISTS idx_system_configurations_active ON system_configurations(is_active);
CREATE INDEX IF NOT EXISTS idx_configuration_history_config_id ON configuration_history(configuration_id);
CREATE INDEX IF NOT EXISTS idx_configuration_history_changed_at ON configuration_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_configuration_cache_expires ON configuration_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_feature_flags_environment ON feature_flags(environment);
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled ON feature_flags(is_enabled);

-- =============================================================================
-- Triggers for automatic timestamps and history
-- =============================================================================

-- Update timestamps trigger for system_configurations
CREATE OR REPLACE FUNCTION update_configuration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Insert into history table
    INSERT INTO configuration_history (
        configuration_id, 
        old_value, 
        new_value, 
        change_reason, 
        changed_by,
        client_ip
    ) VALUES (
        NEW.id,
        COALESCE(OLD.config_value, ''),
        COALESCE(NEW.config_value, ''),
        COALESCE(NEW.config_value, '') || ' updated',
        NEW.updated_by,
        inet_client_addr()::text
    );
    
    -- Clear cache for this configuration
    DELETE FROM configuration_cache WHERE config_key = NEW.config_key;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_configuration_timestamp
    BEFORE UPDATE ON system_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_configuration_timestamp();

-- Update timestamps trigger for feature_flags
CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_feature_flag_timestamp
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_feature_flag_timestamp();

-- =============================================================================
-- Configuration Validation Function
-- =============================================================================
CREATE OR REPLACE FUNCTION validate_configuration_value(
    config_key_param VARCHAR(200),
    config_value_param TEXT,
    value_type_param VARCHAR(50),
    validation_rules_param JSONB
) RETURNS BOOLEAN AS $$
DECLARE
    min_length INTEGER;
    max_length INTEGER;
    pattern TEXT;
    min_value NUMERIC;
    max_value NUMERIC;
BEGIN
    -- Basic null check
    IF config_value_param IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Type-specific validation
    CASE value_type_param
        WHEN 'number' THEN
            BEGIN
                -- Check if it's a valid number
                PERFORM config_value_param::NUMERIC;
                
                -- Check min/max if specified
                IF validation_rules_param ? 'min' THEN
                    min_value := (validation_rules_param->>'min')::NUMERIC;
                    IF config_value_param::NUMERIC < min_value THEN
                        RETURN FALSE;
                    END IF;
                END IF;
                
                IF validation_rules_param ? 'max' THEN
                    max_value := (validation_rules_param->>'max')::NUMERIC;
                    IF config_value_param::NUMERIC > max_value THEN
                        RETURN FALSE;
                    END IF;
                END IF;
                
            EXCEPTION WHEN OTHERS THEN
                RETURN FALSE;
            END;
            
        WHEN 'boolean' THEN
            IF config_value_param NOT IN ('true', 'false', 't', 'f', '1', '0', 'yes', 'no', 'on', 'off') THEN
                RETURN FALSE;
            END IF;
            
        WHEN 'json' THEN
            BEGIN
                -- Check if it's valid JSON
                PERFORM config_value_param::JSONB;
            EXCEPTION WHEN OTHERS THEN
                RETURN FALSE;
            END;
            
        WHEN 'email' THEN
            IF config_value_param !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
                RETURN FALSE;
            END IF;
            
        WHEN 'url' THEN
            IF config_value_param !~ '^https?://[^\s/$.?#].[^\s]*$' THEN
                RETURN FALSE;
            END IF;
            
        ELSE
            -- String validation
            NULL; -- No additional validation for string type
    END CASE;
    
    -- Length validation
    IF validation_rules_param ? 'minLength' THEN
        min_length := (validation_rules_param->>'minLength')::INTEGER;
        IF LENGTH(config_value_param) < min_length THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    IF validation_rules_param ? 'maxLength' THEN
        max_length := (validation_rules_param->>'maxLength')::INTEGER;
        IF LENGTH(config_value_param) > max_length THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Pattern validation
    IF validation_rules_param ? 'pattern' THEN
        pattern := validation_rules_param->>'pattern';
        IF config_value_param !~ pattern THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Insert default configuration categories
-- =============================================================================
INSERT INTO configuration_categories (name, display_name, description, icon, sort_order) VALUES
('server', 'Server Configuration', 'Basic server and application settings', 'server', 1),
('database', 'Database Configuration', 'Database connection and settings', 'database', 2),
('redis', 'Redis Configuration', 'Redis cache and session settings', 'memory', 3),
('authentication', 'Authentication Settings', 'JWT, OAuth, and session configuration', 'shield', 4),
('email', 'Email Configuration', 'SMTP and email service settings', 'mail', 5),
('payment', 'Payment Configuration', 'Payment provider settings', 'credit-card', 6),
('ai', 'AI Services', 'OpenAI and other AI service configurations', 'brain', 7),
('upload', 'File Upload Settings', 'File upload and storage configuration', 'upload', 8),
('security', 'Security Settings', 'CORS, rate limiting, and security configurations', 'lock', 9),
('frontend', 'Frontend Configuration', 'Client-side application settings', 'monitor', 10),
('features', 'Feature Flags', 'Feature toggle and experimental feature settings', 'flag', 11),
('monitoring', 'Monitoring & Logging', 'Logging, metrics, and monitoring settings', 'activity', 12)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- Insert default system configurations
-- =============================================================================
INSERT INTO system_configurations (
    category_id, config_key, display_name, description, config_value, default_value, 
    value_type, validation_rules, is_required, is_sensitive, is_client_accessible, 
    environment, restart_required, sort_order
) VALUES

-- Server Configuration
((SELECT id FROM configuration_categories WHERE name = 'server'), 'SERVER_PORT', 'Server Port', 'Port number for the API server', '5000', '5000', 'number', '{"min": 1000, "max": 65535}', true, false, false, 'all', true, 1),
((SELECT id FROM configuration_categories WHERE name = 'server'), 'NODE_ENV', 'Node Environment', 'Application environment mode', 'development', 'development', 'string', '{"enum": ["development", "staging", "production"]}', true, false, false, 'all', true, 2),
((SELECT id FROM configuration_categories WHERE name = 'server'), 'APP_NAME', 'Application Name', 'Name of the application', 'MockMate API', 'MockMate API', 'string', '{"minLength": 3, "maxLength": 100}', true, false, true, 'all', false, 3),
((SELECT id FROM configuration_categories WHERE name = 'server'), 'APP_VERSION', 'Application Version', 'Current version of the application', '1.0.0', '1.0.0', 'string', '{"pattern": "^\\d+\\.\\d+\\.\\d+$"}', false, false, true, 'all', false, 4),

-- Database Configuration  
((SELECT id FROM configuration_categories WHERE name = 'database'), 'DB_HOST', 'Database Host', 'PostgreSQL database host', 'localhost', 'localhost', 'string', '{"minLength": 1}', true, false, false, 'all', true, 1),
((SELECT id FROM configuration_categories WHERE name = 'database'), 'DB_PORT', 'Database Port', 'PostgreSQL database port', '5432', '5432', 'number', '{"min": 1, "max": 65535}', true, false, false, 'all', true, 2),
((SELECT id FROM configuration_categories WHERE name = 'database'), 'DB_NAME', 'Database Name', 'PostgreSQL database name', 'mockmate_db', 'mockmate_db', 'string', '{"minLength": 1, "maxLength": 63}', true, false, false, 'all', true, 3),
((SELECT id FROM configuration_categories WHERE name = 'database'), 'DB_USER', 'Database User', 'PostgreSQL database username', 'mockmate_user', 'mockmate_user', 'string', '{"minLength": 1}', true, false, false, 'all', true, 4),
((SELECT id FROM configuration_categories WHERE name = 'database'), 'DB_PASSWORD', 'Database Password', 'PostgreSQL database password', '', '', 'encrypted', '{"minLength": 8}', true, true, false, 'all', true, 5),

-- Redis Configuration
((SELECT id FROM configuration_categories WHERE name = 'redis'), 'REDIS_HOST', 'Redis Host', 'Redis server host', 'localhost', 'localhost', 'string', '{"minLength": 1}', false, false, false, 'all', true, 1),
((SELECT id FROM configuration_categories WHERE name = 'redis'), 'REDIS_PORT', 'Redis Port', 'Redis server port', '6379', '6379', 'number', '{"min": 1, "max": 65535}', false, false, false, 'all', true, 2),
((SELECT id FROM configuration_categories WHERE name = 'redis'), 'REDIS_USERNAME', 'Redis Username', 'Redis authentication username', '', '', 'string', '{}', false, false, false, 'all', true, 3),
((SELECT id FROM configuration_categories WHERE name = 'redis'), 'REDIS_PASSWORD', 'Redis Password', 'Redis authentication password', '', '', 'encrypted', '{}', false, true, false, 'all', true, 4),

-- Authentication Settings
((SELECT id FROM configuration_categories WHERE name = 'authentication'), 'JWT_SECRET', 'JWT Secret', 'Secret key for JWT token signing', '', '', 'encrypted', '{"minLength": 32}', true, true, false, 'all', true, 1),
((SELECT id FROM configuration_categories WHERE name = 'authentication'), 'JWT_REFRESH_SECRET', 'JWT Refresh Secret', 'Secret key for JWT refresh token signing', '', '', 'encrypted', '{"minLength": 32}', true, true, false, 'all', true, 2),
((SELECT id FROM configuration_categories WHERE name = 'authentication'), 'JWT_EXPIRES_IN', 'JWT Expiration', 'JWT token expiration time', '7d', '7d', 'string', '{"pattern": "^\\d+[smhd]$"}', true, false, false, 'all', false, 3),
((SELECT id FROM configuration_categories WHERE name = 'authentication'), 'SESSION_SECRET', 'Session Secret', 'Secret key for session encryption', '', '', 'encrypted', '{"minLength": 16}', true, true, false, 'all', true, 4),
((SELECT id FROM configuration_categories WHERE name = 'authentication'), 'GOOGLE_CLIENT_ID', 'Google Client ID', 'Google OAuth client ID', '', '', 'string', '{}', false, false, false, 'all', false, 5),
((SELECT id FROM configuration_categories WHERE name = 'authentication'), 'GOOGLE_CLIENT_SECRET', 'Google Client Secret', 'Google OAuth client secret', '', '', 'encrypted', '{}', false, true, false, 'all', false, 6),

-- Email Configuration
((SELECT id FROM configuration_categories WHERE name = 'email'), 'EMAIL_FROM', 'From Email Address', 'Default sender email address', 'noreply@mockmate.ai', 'noreply@mockmate.ai', 'email', '{}', true, false, false, 'all', false, 1),
((SELECT id FROM configuration_categories WHERE name = 'email'), 'SMTP_HOST', 'SMTP Host', 'SMTP server hostname', 'smtp.gmail.com', 'smtp.gmail.com', 'string', '{}', true, false, false, 'all', false, 2),
((SELECT id FROM configuration_categories WHERE name = 'email'), 'SMTP_PORT', 'SMTP Port', 'SMTP server port', '587', '587', 'number', '{"min": 1, "max": 65535}', true, false, false, 'all', false, 3),
((SELECT id FROM configuration_categories WHERE name = 'email'), 'SMTP_USER', 'SMTP Username', 'SMTP authentication username', '', '', 'string', '{}', true, false, false, 'all', false, 4),
((SELECT id FROM configuration_categories WHERE name = 'email'), 'SMTP_PASS', 'SMTP Password', 'SMTP authentication password', '', '', 'encrypted', '{}', true, true, false, 'all', false, 5),

-- AI Services
((SELECT id FROM configuration_categories WHERE name = 'ai'), 'OPENAI_API_KEY', 'OpenAI API Key', 'OpenAI API key for AI services', '', '', 'encrypted', '{"pattern": "^sk-"}', false, true, false, 'all', false, 1),
((SELECT id FROM configuration_categories WHERE name = 'ai'), 'OPENAI_MODEL', 'OpenAI Model', 'Default OpenAI model to use', 'gpt-3.5-turbo', 'gpt-3.5-turbo', 'string', '{}', false, false, false, 'all', false, 2),

-- File Upload Settings
((SELECT id FROM configuration_categories WHERE name = 'upload'), 'MAX_FILE_SIZE', 'Maximum File Size', 'Maximum file upload size in bytes', '10485760', '10485760', 'number', '{"min": 1024}', true, false, false, 'all', false, 1),
((SELECT id FROM configuration_categories WHERE name = 'upload'), 'UPLOAD_PATH', 'Upload Directory', 'Directory for file uploads', './uploads', './uploads', 'string', '{}', true, false, false, 'all', true, 2),

-- Security Settings
((SELECT id FROM configuration_categories WHERE name = 'security'), 'CORS_ORIGINS', 'CORS Origins', 'Allowed CORS origins (comma-separated)', 'http://localhost:3000,http://localhost:5173', 'http://localhost:3000,http://localhost:5173', 'array', '{}', true, false, false, 'all', true, 1),
((SELECT id FROM configuration_categories WHERE name = 'security'), 'RATE_LIMIT_WINDOW', 'Rate Limit Window', 'Rate limiting window in minutes', '15', '15', 'number', '{"min": 1, "max": 60}', true, false, false, 'all', false, 2),
((SELECT id FROM configuration_categories WHERE name = 'security'), 'RATE_LIMIT_MAX', 'Rate Limit Maximum', 'Maximum requests per window', '100', '100', 'number', '{"min": 10, "max": 10000}', true, false, false, 'all', false, 3),

-- Frontend Configuration
((SELECT id FROM configuration_categories WHERE name = 'frontend'), 'FRONTEND_URL', 'Frontend URL', 'Main frontend application URL', 'http://localhost:3000', 'http://localhost:3000', 'url', '{}', true, false, true, 'all', false, 1),
((SELECT id FROM configuration_categories WHERE name = 'frontend'), 'ADMIN_URL', 'Admin Panel URL', 'Admin panel application URL', 'http://localhost:3001', 'http://localhost:3001', 'url', '{}', false, false, true, 'all', false, 2),
((SELECT id FROM configuration_categories WHERE name = 'frontend'), 'API_URL', 'API Base URL', 'Backend API base URL', 'http://localhost:5000', 'http://localhost:5000', 'url', '{}', true, false, true, 'all', false, 3),
((SELECT id FROM configuration_categories WHERE name = 'frontend'), 'WEBSOCKET_URL', 'WebSocket URL', 'WebSocket server URL', 'http://localhost:5000', 'http://localhost:5000', 'url', '{}', true, false, true, 'all', false, 4)

ON CONFLICT (config_key) DO NOTHING;

-- =============================================================================
-- Configuration cleanup function (removes expired cache entries)
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_configuration_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM configuration_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Views for easier configuration access
-- =============================================================================

-- Active configurations view
CREATE OR REPLACE VIEW v_active_configurations AS
SELECT 
    sc.id,
    cc.name as category_name,
    cc.display_name as category_display_name,
    sc.config_key,
    sc.display_name,
    sc.description,
    sc.config_value,
    sc.default_value,
    sc.value_type,
    sc.validation_rules,
    sc.is_required,
    sc.is_sensitive,
    sc.is_client_accessible,
    sc.environment,
    sc.restart_required,
    sc.sort_order,
    sc.created_at,
    sc.updated_at
FROM system_configurations sc
JOIN configuration_categories cc ON sc.category_id = cc.id
WHERE sc.is_active = true AND cc.is_active = true
ORDER BY cc.sort_order, sc.sort_order;

-- Client accessible configurations view (for frontend)
CREATE OR REPLACE VIEW v_client_configurations AS
SELECT 
    config_key,
    config_value,
    value_type,
    environment
FROM system_configurations sc
JOIN configuration_categories cc ON sc.category_id = cc.id
WHERE sc.is_active = true 
  AND cc.is_active = true 
  AND sc.is_client_accessible = true
  AND sc.environment IN ('all', COALESCE(current_setting('app.environment', true), 'development'));

-- Configuration with history view
CREATE OR REPLACE VIEW v_configuration_with_history AS
SELECT 
    sc.*,
    cc.name as category_name,
    cc.display_name as category_display_name,
    ch.old_value,
    ch.new_value,
    ch.change_reason,
    ch.changed_at,
    ch.changed_by,
    au.username as changed_by_username
FROM system_configurations sc
JOIN configuration_categories cc ON sc.category_id = cc.id
LEFT JOIN LATERAL (
    SELECT * FROM configuration_history 
    WHERE configuration_id = sc.id 
    ORDER BY changed_at DESC 
    LIMIT 1
) ch ON true
LEFT JOIN admin_users au ON ch.changed_by = au.id
WHERE sc.is_active = true AND cc.is_active = true;

COMMENT ON TABLE configuration_categories IS 'Categories for organizing system configurations';
COMMENT ON TABLE system_configurations IS 'Dynamic system configuration storage with encryption support';
COMMENT ON TABLE configuration_history IS 'Audit trail for configuration changes';
COMMENT ON TABLE configuration_cache IS 'Performance cache for frequently accessed configurations';
COMMENT ON TABLE feature_flags IS 'Feature flags for A/B testing and gradual rollouts';
COMMENT ON TABLE configuration_templates IS 'Predefined configuration templates for quick setup';
