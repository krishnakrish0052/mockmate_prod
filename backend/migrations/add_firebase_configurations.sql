-- Add Firebase Configuration to Dynamic Configuration System
-- This migration adds Firebase authentication configuration entries

-- Note: Using system_config table as used by DynamicConfigService
-- Based on the DynamicConfigService code, system_config table has:
-- config_key, config_value, config_type, is_sensitive, is_public columns

-- Add Firebase configuration entries to system_config table
INSERT INTO system_config (
    config_key, config_value, config_type, is_sensitive, is_public
) VALUES

-- Firebase Client SDK Configuration (some values are client-accessible)
('firebase_web_api_key', '', 'string', true, false),
('firebase_auth_domain', '', 'string', false, true),
('firebase_project_id', '', 'string', false, true),
('firebase_storage_bucket', '', 'string', false, true),
('firebase_messaging_sender_id', '', 'string', false, true),
('firebase_app_id', '', 'string', false, true),

-- Firebase Admin SDK Configuration (server-side only, sensitive)
('firebase_private_key_id', '', 'string', true, false),
('firebase_private_key', '', 'string', true, false),
('firebase_client_email', '', 'string', false, false),
('firebase_client_id', '', 'string', false, false),
('firebase_auth_uri', 'https://accounts.google.com/o/oauth2/auth', 'string', false, false),
('firebase_token_uri', 'https://oauth2.googleapis.com/token', 'string', false, false),
('firebase_client_cert_url', '', 'string', false, false),

-- Firebase Configuration Settings
('firebase_enabled', 'false', 'boolean', false, true),
('firebase_emulator_host', '', 'string', false, false)

ON CONFLICT (config_key) DO NOTHING;

-- Create a view for Firebase client configuration (for frontend)
CREATE OR REPLACE VIEW v_firebase_client_config AS
SELECT 
    'firebase_client_config' as config_key,
    jsonb_build_object(
        'apiKey', COALESCE(sc1.config_value, ''),
        'authDomain', COALESCE(sc2.config_value, ''),
        'projectId', COALESCE(sc3.config_value, ''),
        'storageBucket', COALESCE(sc4.config_value, ''),
        'messagingSenderId', COALESCE(sc5.config_value, ''),
        'appId', COALESCE(sc6.config_value, ''),
        'enabled', COALESCE(sc7.config_value = 'true', false)
    ) as config_value,
    'json' as config_type
FROM 
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_web_api_key') sc1,
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_auth_domain') sc2,
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_project_id') sc3,
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_storage_bucket') sc4,
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_messaging_sender_id') sc5,
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_app_id') sc6,
    (SELECT config_value FROM system_config WHERE config_key = 'firebase_enabled') sc7;

COMMENT ON VIEW v_firebase_client_config IS 'Consolidated Firebase client configuration for frontend applications';
