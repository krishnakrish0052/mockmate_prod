-- Migration script to replace Stripe configurations with Cashfree
-- Run this script on your database

BEGIN;

-- Log the migration
SELECT 'Starting Stripe to Cashfree configuration migration...' as status;

-- Show existing Stripe configurations
SELECT 'Current Stripe configurations:' as status;
SELECT config_key, 
       CASE WHEN is_sensitive THEN '[REDACTED]' ELSE config_value END as value,
       config_type,
       category
FROM system_config 
WHERE config_key LIKE '%stripe%';

-- Remove old Stripe configurations
SELECT 'Removing Stripe configurations...' as status;
DELETE FROM system_config WHERE config_key IN (
    'stripe_publishable_key',
    'stripe_secret_key', 
    'stripe_webhook_secret'
);

-- Add Cashfree configurations
SELECT 'Adding Cashfree configurations...' as status;

-- Insert Cashfree App ID
INSERT INTO system_config (
    config_key, config_value, config_type, description, category, 
    is_sensitive, is_public, created_at, updated_at
) VALUES (
    'cashfree_app_id',
    '"your_cashfree_app_id"',
    'string',
    'Cashfree Application ID',
    'payment',
    false,
    true,
    NOW(),
    NOW()
) ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Insert Cashfree Secret Key
INSERT INTO system_config (
    config_key, config_value, config_type, description, category, 
    is_sensitive, is_public, created_at, updated_at
) VALUES (
    'cashfree_secret_key',
    '"your_cashfree_secret_key"',
    'string',
    'Cashfree Secret Key',
    'payment',
    true,
    false,
    NOW(),
    NOW()
) ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Insert Cashfree Client ID
INSERT INTO system_config (
    config_key, config_value, config_type, description, category, 
    is_sensitive, is_public, created_at, updated_at
) VALUES (
    'cashfree_client_id',
    '"your_cashfree_client_id"',
    'string',
    'Cashfree Client ID',
    'payment',
    false,
    true,
    NOW(),
    NOW()
) ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Insert Cashfree Client Secret
INSERT INTO system_config (
    config_key, config_value, config_type, description, category, 
    is_sensitive, is_public, created_at, updated_at
) VALUES (
    'cashfree_client_secret',
    '"your_cashfree_client_secret"',
    'string',
    'Cashfree Client Secret',
    'payment',
    true,
    false,
    NOW(),
    NOW()
) ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Insert Cashfree Environment
INSERT INTO system_config (
    config_key, config_value, config_type, description, category, 
    is_sensitive, is_public, created_at, updated_at
) VALUES (
    'cashfree_environment',
    '"sandbox"',
    'string',
    'Cashfree Environment (sandbox/production)',
    'payment',
    false,
    false,
    NOW(),
    NOW()
) ON CONFLICT (config_key) DO UPDATE SET
    config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Show the new payment configurations
SELECT 'New payment configurations:' as status;
SELECT config_key, 
       CASE WHEN is_sensitive THEN '[REDACTED]' ELSE config_value END as value,
       config_type,
       category,
       is_public,
       created_at
FROM system_config 
WHERE category = 'payment' 
ORDER BY config_key;

-- Count payment configurations
SELECT CONCAT('Total payment configurations: ', COUNT(*)) as summary
FROM system_config 
WHERE category = 'payment';

SELECT 'Migration completed successfully!' as status;

COMMIT;

-- Instructions for updating actual values
SELECT '
=================================
NEXT STEPS:
=================================

1. Update the Cashfree credentials with your actual values:

UPDATE system_config SET config_value = ''"YOUR_ACTUAL_APP_ID"'' WHERE config_key = ''cashfree_app_id'';
UPDATE system_config SET config_value = ''"YOUR_ACTUAL_SECRET_KEY"'' WHERE config_key = ''cashfree_secret_key'';
UPDATE system_config SET config_value = ''"YOUR_ACTUAL_CLIENT_ID"'' WHERE config_key = ''cashfree_client_id'';
UPDATE system_config SET config_value = ''"YOUR_ACTUAL_CLIENT_SECRET"'' WHERE config_key = ''cashfree_client_secret'';

2. For production environment:
UPDATE system_config SET config_value = ''"production"'' WHERE config_key = ''cashfree_environment'';

3. Restart your application to pick up the new configurations.

=================================' as instructions;
