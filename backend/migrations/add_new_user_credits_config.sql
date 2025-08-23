-- Migration: Add New User Starting Credits Configuration
-- This migration adds a dynamic configuration option for setting starting credits for new users

-- Insert the new configuration entry
INSERT INTO system_config (
    config_key, 
    config_value, 
    description, 
    config_type, 
    is_sensitive,
    category
) VALUES (
    'new_user_starting_credits',
    '0',
    'Number of credits to give new users upon registration. Set to 0 to require purchase before usage.',
    'number',
    FALSE,
    'auth'
) ON CONFLICT (config_key) DO UPDATE SET
    description = EXCLUDED.description,
    config_type = EXCLUDED.config_type,
    updated_at = NOW();

-- Add comment for documentation
COMMENT ON TABLE system_config IS 'System configuration settings including new user credit allocation';
