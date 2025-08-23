-- Payment Configuration System Database Schema Extensions
-- This file adds comprehensive payment management capabilities

-- Enable additional extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Admin Users Table (if not exists)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  
  CONSTRAINT chk_admin_role CHECK (role IN ('super_admin', 'admin', 'finance_admin', 'support_admin')),
  CONSTRAINT chk_admin_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Payment Configurations Table (Enhanced)
CREATE TABLE IF NOT EXISTS payment_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name VARCHAR(100) NOT NULL,
  provider_type VARCHAR(50) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_test_mode BOOLEAN DEFAULT true,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_url VARCHAR(500),
  webhook_secret VARCHAR(255),
  priority INTEGER DEFAULT 0,
  supported_currencies JSONB DEFAULT '["USD"]'::jsonb,
  supported_countries JSONB DEFAULT '["US"]'::jsonb,
  supported_payment_methods JSONB DEFAULT '[]'::jsonb,
  features JSONB DEFAULT '{}'::jsonb,
  limits JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  health_status VARCHAR(50) DEFAULT 'unknown',
  last_health_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES admin_users(id),
  updated_by UUID REFERENCES admin_users(id),
  
  CONSTRAINT chk_provider_type CHECK (provider_type IN ('card', 'wallet', 'bank_transfer', 'crypto', 'buy_now_pay_later')),
  CONSTRAINT chk_health_status CHECK (health_status IN ('healthy', 'unhealthy', 'degraded', 'unknown', 'maintenance')),
  CONSTRAINT chk_priority_range CHECK (priority >= 0 AND priority <= 100),
  CONSTRAINT chk_provider_name_not_empty CHECK (LENGTH(TRIM(provider_name)) > 0)
);

-- Payment Webhooks Table
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES payment_configurations(id) ON DELETE CASCADE,
  webhook_type VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  provider_webhook_id VARCHAR(255),
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_triggered TIMESTAMP,
  last_success TIMESTAMP,
  last_failure TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_webhook_type CHECK (webhook_type IN ('payment_intent', 'payment_method', 'invoice', 'customer', 'dispute', 'payout')),
  CONSTRAINT chk_retry_count_positive CHECK (retry_count >= 0),
  CONSTRAINT chk_max_retries_positive CHECK (max_retries >= 0)
);

-- Payment Provider Routing Table
CREATE TABLE IF NOT EXISTS payment_provider_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES payment_configurations(id) ON DELETE CASCADE,
  rule_name VARCHAR(200) NOT NULL,
  rule_type VARCHAR(50) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  fallback_config_id UUID REFERENCES payment_configurations(id),
  load_balancing_weight DECIMAL(5,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_routing_rule_type CHECK (rule_type IN ('amount_based', 'country_based', 'currency_based', 'user_based', 'time_based', 'failure_rate_based')),
  CONSTRAINT chk_routing_priority_range CHECK (priority >= 0 AND priority <= 100),
  CONSTRAINT chk_load_balancing_weight_positive CHECK (load_balancing_weight > 0)
);

-- Payment Analytics Table
CREATE TABLE IF NOT EXISTS payment_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES payment_configurations(id) ON DELETE SET NULL,
  provider_name VARCHAR(100) NOT NULL,
  metric_type VARCHAR(100) NOT NULL,
  metric_name VARCHAR(200) NOT NULL,
  metric_value DECIMAL(15,4) NOT NULL,
  metric_unit VARCHAR(50) DEFAULT 'count',
  aggregation_period VARCHAR(50) NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_metric_type CHECK (metric_type IN ('transaction_count', 'success_rate', 'failure_rate', 'average_amount', 'total_volume', 'processing_time', 'dispute_rate')),
  CONSTRAINT chk_aggregation_period CHECK (aggregation_period IN ('minute', 'hour', 'day', 'week', 'month')),
  CONSTRAINT chk_period_order CHECK (period_start <= period_end)
);

-- Payment Configuration Audit Log Table
CREATE TABLE IF NOT EXISTS payment_config_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES payment_configurations(id) ON DELETE SET NULL,
  admin_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  old_values JSONB DEFAULT '{}'::jsonb,
  new_values JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_audit_action CHECK (action IN ('create', 'update', 'delete', 'activate', 'deactivate', 'test', 'health_check'))
);

-- Payment Provider Health Checks Table
CREATE TABLE IF NOT EXISTS payment_provider_health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES payment_configurations(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  response_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_health_check_type CHECK (check_type IN ('connectivity', 'authentication', 'api_limits', 'webhook', 'full_transaction')),
  CONSTRAINT chk_health_check_status CHECK (status IN ('pass', 'fail', 'warn')),
  CONSTRAINT chk_response_time_positive CHECK (response_time_ms IS NULL OR response_time_ms >= 0)
);

-- Payment Disputes Table
CREATE TABLE IF NOT EXISTS payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  config_id UUID REFERENCES payment_configurations(id) ON DELETE SET NULL,
  dispute_id VARCHAR(255) NOT NULL,
  provider_dispute_id VARCHAR(255) NOT NULL,
  amount_disputed DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  reason VARCHAR(200),
  status VARCHAR(50) NOT NULL DEFAULT 'needs_response',
  due_date TIMESTAMP,
  evidence_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_dispute_status CHECK (status IN ('needs_response', 'under_review', 'charge_refunded', 'won', 'lost')),
  CONSTRAINT chk_disputed_amount_positive CHECK (amount_disputed > 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_configurations_active ON payment_configurations(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_payment_configurations_provider ON payment_configurations(provider_name);
CREATE INDEX IF NOT EXISTS idx_payment_configurations_priority ON payment_configurations(priority DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_payment_configurations_test_mode ON payment_configurations(is_test_mode);
CREATE INDEX IF NOT EXISTS idx_payment_configurations_health ON payment_configurations(health_status);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_config ON payment_webhooks(config_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_active ON payment_webhooks(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_event_type ON payment_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_last_triggered ON payment_webhooks(last_triggered);

CREATE INDEX IF NOT EXISTS idx_payment_routing_config ON payment_provider_routing(config_id);
CREATE INDEX IF NOT EXISTS idx_payment_routing_active ON payment_provider_routing(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_payment_routing_priority ON payment_provider_routing(priority DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_payment_routing_type ON payment_provider_routing(rule_type);

CREATE INDEX IF NOT EXISTS idx_payment_analytics_config ON payment_analytics(config_id);
CREATE INDEX IF NOT EXISTS idx_payment_analytics_provider ON payment_analytics(provider_name);
CREATE INDEX IF NOT EXISTS idx_payment_analytics_period ON payment_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payment_analytics_metric ON payment_analytics(metric_type, metric_name);
CREATE INDEX IF NOT EXISTS idx_payment_analytics_created ON payment_analytics(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_config_audit_config ON payment_config_audit_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_payment_config_audit_admin ON payment_config_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_payment_config_audit_action ON payment_config_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_payment_config_audit_created ON payment_config_audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_health_checks_config ON payment_provider_health_checks(config_id);
CREATE INDEX IF NOT EXISTS idx_payment_health_checks_type ON payment_provider_health_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_payment_health_checks_status ON payment_provider_health_checks(status);
CREATE INDEX IF NOT EXISTS idx_payment_health_checks_created ON payment_provider_health_checks(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_disputes_payment ON payment_disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_config ON payment_disputes(config_id);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_status ON payment_disputes(status);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_created ON payment_disputes(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_due_date ON payment_disputes(due_date) WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payment_configs_active_priority ON payment_configurations(is_active, is_test_mode, priority DESC);
CREATE INDEX IF NOT EXISTS idx_payment_analytics_provider_period ON payment_analytics(provider_name, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payment_routing_config_active_priority ON payment_provider_routing(config_id, is_active, priority DESC);

-- JSONB indexes for efficient JSON queries
CREATE INDEX IF NOT EXISTS idx_payment_configurations_gin ON payment_configurations USING gin(configuration);
CREATE INDEX IF NOT EXISTS idx_payment_configurations_currencies_gin ON payment_configurations USING gin(supported_currencies);
CREATE INDEX IF NOT EXISTS idx_payment_configurations_countries_gin ON payment_configurations USING gin(supported_countries);
CREATE INDEX IF NOT EXISTS idx_payment_configurations_features_gin ON payment_configurations USING gin(features);
CREATE INDEX IF NOT EXISTS idx_payment_routing_conditions_gin ON payment_provider_routing USING gin(conditions);
CREATE INDEX IF NOT EXISTS idx_payment_analytics_metadata_gin ON payment_analytics USING gin(metadata);

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_payment_configurations_updated_at ON payment_configurations;
CREATE TRIGGER update_payment_configurations_updated_at
    BEFORE UPDATE ON payment_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_webhooks_updated_at ON payment_webhooks;
CREATE TRIGGER update_payment_webhooks_updated_at
    BEFORE UPDATE ON payment_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_routing_updated_at ON payment_provider_routing;
CREATE TRIGGER update_payment_routing_updated_at
    BEFORE UPDATE ON payment_provider_routing
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_disputes_updated_at ON payment_disputes;
CREATE TRIGGER update_payment_disputes_updated_at
    BEFORE UPDATE ON payment_disputes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;
CREATE TRIGGER update_admin_users_updated_at
    BEFORE UPDATE ON admin_users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create views for payment analytics and monitoring

-- Payment Provider Performance View
CREATE OR REPLACE VIEW payment_provider_performance AS
SELECT 
    pc.id as config_id,
    pc.provider_name,
    pc.provider_type,
    pc.display_name,
    pc.is_active,
    pc.is_test_mode,
    pc.health_status,
    pc.last_health_check,
    COUNT(p.id) as total_transactions,
    COUNT(CASE WHEN p.status = 'completed' THEN 1 END) as successful_transactions,
    COUNT(CASE WHEN p.status = 'failed' THEN 1 END) as failed_transactions,
    ROUND(
        (COUNT(CASE WHEN p.status = 'completed' THEN 1 END)::DECIMAL / 
         NULLIF(COUNT(p.id), 0)) * 100, 2
    ) as success_rate,
    COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount_usd END), 0) as total_revenue,
    COALESCE(AVG(CASE WHEN p.status = 'completed' THEN p.amount_usd END), 0) as avg_transaction_value,
    COUNT(DISTINCT pd.id) as total_disputes,
    COALESCE(SUM(pd.amount_disputed), 0) as total_disputed_amount
FROM payment_configurations pc
LEFT JOIN payments p ON pc.provider_name = p.payment_provider
LEFT JOIN payment_disputes pd ON pc.id = pd.config_id
GROUP BY pc.id, pc.provider_name, pc.provider_type, pc.display_name, 
         pc.is_active, pc.is_test_mode, pc.health_status, pc.last_health_check;

-- Payment Analytics Summary View
CREATE OR REPLACE VIEW payment_analytics_summary AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    provider_name,
    metric_type,
    AVG(CASE WHEN metric_name = 'success_rate' THEN metric_value END) as avg_success_rate,
    SUM(CASE WHEN metric_name = 'transaction_count' THEN metric_value ELSE 0 END) as daily_transactions,
    SUM(CASE WHEN metric_name = 'total_volume' THEN metric_value ELSE 0 END) as daily_volume,
    AVG(CASE WHEN metric_name = 'processing_time' THEN metric_value END) as avg_processing_time
FROM payment_analytics
GROUP BY DATE_TRUNC('day', created_at), provider_name, metric_type
ORDER BY date DESC, provider_name;

-- Active Payment Configuration View
CREATE OR REPLACE VIEW active_payment_configs AS
SELECT 
    pc.*,
    au_created.full_name as created_by_name,
    au_updated.full_name as updated_by_name,
    COUNT(pw.id) as webhook_count,
    COUNT(CASE WHEN pw.is_active = true THEN 1 END) as active_webhook_count
FROM payment_configurations pc
LEFT JOIN admin_users au_created ON pc.created_by = au_created.id
LEFT JOIN admin_users au_updated ON pc.updated_by = au_updated.id
LEFT JOIN payment_webhooks pw ON pc.id = pw.config_id
WHERE pc.is_active = true
GROUP BY pc.id, pc.provider_name, pc.provider_type, pc.display_name, 
         pc.is_active, pc.is_test_mode, pc.configuration, pc.webhook_url, 
         pc.webhook_secret, pc.priority, pc.supported_currencies, 
         pc.supported_countries, pc.supported_payment_methods, pc.features, 
         pc.limits, pc.metadata, pc.health_status, pc.last_health_check, 
         pc.created_at, pc.updated_at, pc.created_by, pc.updated_by,
         au_created.full_name, au_updated.full_name
ORDER BY pc.priority DESC, pc.provider_name;

-- Functions for payment configuration management

-- Function to get optimal payment provider for a transaction
CREATE OR REPLACE FUNCTION get_optimal_payment_provider(
    amount_usd DECIMAL,
    currency VARCHAR(3) DEFAULT 'USD',
    country VARCHAR(2) DEFAULT 'US',
    user_id UUID DEFAULT NULL
) RETURNS TABLE(config_id UUID, provider_name VARCHAR, priority INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.id,
        pc.provider_name,
        pc.priority
    FROM payment_configurations pc
    LEFT JOIN payment_provider_routing ppr ON pc.id = ppr.config_id AND ppr.is_active = true
    WHERE pc.is_active = true
    AND (
        pc.supported_currencies IS NULL 
        OR pc.supported_currencies @> to_jsonb(currency)
    )
    AND (
        pc.supported_countries IS NULL 
        OR pc.supported_countries @> to_jsonb(country)
    )
    AND pc.health_status IN ('healthy', 'unknown')
    AND (
        ppr.id IS NULL 
        OR (
            ppr.rule_type = 'amount_based' 
            AND (ppr.conditions->>'min_amount')::DECIMAL <= amount_usd 
            AND (ppr.conditions->>'max_amount')::DECIMAL >= amount_usd
        )
        OR (
            ppr.rule_type = 'country_based' 
            AND ppr.conditions @> jsonb_build_object('countries', jsonb_build_array(country))
        )
        OR (
            ppr.rule_type = 'currency_based' 
            AND ppr.conditions @> jsonb_build_object('currencies', jsonb_build_array(currency))
        )
    )
    ORDER BY pc.priority DESC, pc.created_at ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to record payment analytics
CREATE OR REPLACE FUNCTION record_payment_analytics(
    provider_name VARCHAR(100),
    metric_type VARCHAR(100),
    metric_name VARCHAR(200),
    metric_value DECIMAL(15,4),
    config_id UUID DEFAULT NULL,
    aggregation_period VARCHAR(50) DEFAULT 'hour'
) RETURNS UUID AS $$
DECLARE
    period_start TIMESTAMP;
    period_end TIMESTAMP;
    analytics_id UUID;
BEGIN
    -- Calculate period boundaries based on aggregation period
    CASE aggregation_period
        WHEN 'minute' THEN
            period_start := DATE_TRUNC('minute', NOW());
            period_end := period_start + INTERVAL '1 minute';
        WHEN 'hour' THEN
            period_start := DATE_TRUNC('hour', NOW());
            period_end := period_start + INTERVAL '1 hour';
        WHEN 'day' THEN
            period_start := DATE_TRUNC('day', NOW());
            period_end := period_start + INTERVAL '1 day';
        WHEN 'week' THEN
            period_start := DATE_TRUNC('week', NOW());
            period_end := period_start + INTERVAL '1 week';
        WHEN 'month' THEN
            period_start := DATE_TRUNC('month', NOW());
            period_end := period_start + INTERVAL '1 month';
        ELSE
            period_start := DATE_TRUNC('hour', NOW());
            period_end := period_start + INTERVAL '1 hour';
    END CASE;
    
    -- Insert or update analytics record
    INSERT INTO payment_analytics (
        config_id, provider_name, metric_type, metric_name, 
        metric_value, aggregation_period, period_start, period_end
    ) VALUES (
        config_id, provider_name, metric_type, metric_name, 
        metric_value, aggregation_period, period_start, period_end
    )
    ON CONFLICT ON CONSTRAINT payment_analytics_unique_metric
    DO UPDATE SET 
        metric_value = EXCLUDED.metric_value,
        created_at = NOW()
    RETURNING id INTO analytics_id;
    
    RETURN analytics_id;
EXCEPTION
    WHEN unique_violation THEN
        -- Handle case where constraint doesn't exist yet
        INSERT INTO payment_analytics (
            config_id, provider_name, metric_type, metric_name, 
            metric_value, aggregation_period, period_start, period_end
        ) VALUES (
            config_id, provider_name, metric_type, metric_name, 
            metric_value, aggregation_period, period_start, period_end
        ) RETURNING id INTO analytics_id;
        
        RETURN analytics_id;
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for analytics (if it makes sense for your use case)
-- CREATE UNIQUE INDEX IF NOT EXISTS payment_analytics_unique_metric 
-- ON payment_analytics(provider_name, metric_type, metric_name, period_start, period_end);

-- Insert sample admin user for testing (only in development)
INSERT INTO admin_users (username, email, password_hash, full_name, role) VALUES 
('admin', 'admin@mockmate.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeEuFBE7Y.1/1YTiG', 'System Administrator', 'super_admin')  -- password: 'admin123'
ON CONFLICT (email) DO NOTHING;

-- Insert sample payment configurations for testing
INSERT INTO payment_configurations (
    provider_name, provider_type, display_name, is_active, is_test_mode, 
    configuration, priority, supported_currencies, supported_countries,
    features, limits, created_by
) VALUES 
(
    'stripe', 'card', 'Stripe Payments', true, true,
    '{"secret_key": "sk_test_...", "publishable_key": "pk_test_...", "webhook_endpoint": ""}',
    90, '["USD", "EUR", "GBP"]', '["US", "CA", "GB", "EU"]',
    '{"recurring": true, "installments": false, "refunds": true}',
    '{"min_amount": 0.50, "max_amount": 10000.00}',
    (SELECT id FROM admin_users WHERE username = 'admin' LIMIT 1)
),
(
    'paypal', 'wallet', 'PayPal', true, true,
    '{"client_id": "test_client_id", "client_secret": "test_client_secret", "sandbox": true}',
    80, '["USD", "EUR", "GBP"]', '["US", "CA", "GB", "EU"]',
    '{"recurring": true, "installments": false, "refunds": true}',
    '{"min_amount": 1.00, "max_amount": 5000.00}',
    (SELECT id FROM admin_users WHERE username = 'admin' LIMIT 1)
)
ON CONFLICT DO NOTHING;
