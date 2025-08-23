-- Migration script for icon management configuration
-- Add icon-related configuration entries to system_config table

-- Ensure system_config table exists with proper structure
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(255) NOT NULL UNIQUE,
    config_value TEXT,
    description TEXT,
    config_type VARCHAR(50) DEFAULT 'string',
    is_sensitive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255)
);

-- Insert default icon configuration entries
INSERT INTO system_config (config_key, config_value, description, config_type) VALUES
    ('app_title', 'MockMate - AI-powered Interview Platform', 'Application title displayed in browser tab and PWA', 'string'),
    ('app_favicon', '/mockmate_32x32.png', 'URL path to favicon (32x32 recommended)', 'string'),
    ('app_logo', '/mockmate_128x128.png', 'URL path to main application logo (128x128 recommended)', 'string'),
    ('app_icon_16', '/mockmate_16x16.png', 'URL path to 16x16 app icon', 'string'),
    ('app_icon_32', '/mockmate_32x32.png', 'URL path to 32x32 app icon', 'string'), 
    ('app_icon_128', '/mockmate_128x128.png', 'URL path to 128x128 app icon', 'string'),
    ('app_icon_256', '/mockmate_256x256.png', 'URL path to 256x256 app icon', 'string')
ON CONFLICT (config_key) DO NOTHING; -- Only insert if not already exists

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);

-- Add function to update updated_at automatically
CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for automatic updated_at updates
DROP TRIGGER IF EXISTS trigger_system_config_updated_at ON system_config;
CREATE TRIGGER trigger_system_config_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION update_system_config_updated_at();

-- Add comments
COMMENT ON TABLE system_config IS 'System-wide configuration settings';
COMMENT ON COLUMN system_config.config_key IS 'Unique identifier for configuration setting';
COMMENT ON COLUMN system_config.config_value IS 'Configuration value (can be JSON for complex types)';
COMMENT ON COLUMN system_config.description IS 'Human-readable description of the configuration setting';
COMMENT ON COLUMN system_config.config_type IS 'Data type hint (string, number, boolean, json, array)';
COMMENT ON COLUMN system_config.is_sensitive IS 'Whether this config contains sensitive information (e.g., API keys)';
