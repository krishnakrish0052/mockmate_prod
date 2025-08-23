-- Email Templates Migration
-- This migration creates tables for email template management with versioning support

-- Email Template Categories Table
CREATE TABLE IF NOT EXISTS email_template_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7), -- Hex color code for UI
    icon VARCHAR(50), -- Icon identifier for UI
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Email Templates Table (Main templates table)
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_key VARCHAR(100) NOT NULL UNIQUE, -- Unique identifier for the template
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES email_template_categories(id) ON DELETE SET NULL,
    subject_template TEXT NOT NULL,
    html_template TEXT NOT NULL,
    text_template TEXT, -- Plain text version
    mjml_template TEXT, -- MJML source for HTML generation
    
    -- Template configuration
    is_active BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE, -- System templates cannot be deleted
    supports_personalization BOOLEAN DEFAULT TRUE,
    
    -- Template metadata
    variables JSONB DEFAULT '[]'::jsonb, -- Available template variables
    tags JSONB DEFAULT '[]'::jsonb, -- Tags for organization
    usage_notes TEXT, -- Notes for administrators
    
    -- Version control
    version INTEGER DEFAULT 1,
    current_version_id UUID, -- References email_template_versions.id
    
    -- Timestamps and audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0
);

-- Email Template Versions Table (For version control)
CREATE TABLE IF NOT EXISTS email_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Template content for this version
    subject_template TEXT NOT NULL,
    html_template TEXT NOT NULL,
    text_template TEXT,
    mjml_template TEXT,
    
    -- Version metadata
    variables JSONB DEFAULT '[]'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    changelog TEXT, -- What changed in this version
    is_published BOOLEAN DEFAULT FALSE,
    
    -- Timestamps and audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    
    -- Ensure unique version numbers per template
    UNIQUE(template_id, version_number)
);

-- Email Template Variables Table (Define available variables)
CREATE TABLE IF NOT EXISTS email_template_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variable_key VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'user.firstName'
    variable_name VARCHAR(255) NOT NULL, -- Human readable name
    description TEXT,
    variable_type VARCHAR(50) NOT NULL DEFAULT 'string', -- string, number, boolean, date, array, object
    default_value TEXT, -- Default value if variable is not provided
    is_required BOOLEAN DEFAULT FALSE,
    category VARCHAR(100), -- user, system, custom, etc.
    example_value TEXT, -- Example for template editors
    
    -- Validation rules
    validation_rules JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Email Sending History Table (Track sent emails)
CREATE TABLE IF NOT EXISTS email_sending_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
    template_version_id UUID REFERENCES email_template_versions(id) ON DELETE SET NULL,
    
    -- Recipient information
    recipient_email VARCHAR(320) NOT NULL, -- Max email length
    recipient_name VARCHAR(255),
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Email content (as sent)
    subject VARCHAR(998) NOT NULL, -- Max email subject length
    html_content TEXT,
    text_content TEXT,
    
    -- Sending details
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, failed, bounced
    provider VARCHAR(100), -- Which email service was used
    provider_message_id VARCHAR(255), -- ID from email service
    error_message TEXT, -- If sending failed
    
    -- Template variables used
    template_variables JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    
    -- Analytics
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0
);

-- Email Template Tests Table (For testing templates)
CREATE TABLE IF NOT EXISTS email_template_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
    template_version_id UUID REFERENCES email_template_versions(id) ON DELETE SET NULL,
    
    -- Test details
    test_name VARCHAR(255) NOT NULL,
    test_description TEXT,
    test_email VARCHAR(320) NOT NULL,
    test_variables JSONB DEFAULT '{}'::jsonb,
    
    -- Test results
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, sent, failed
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Test metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_templates_template_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_category_id ON email_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON email_templates(created_at);
CREATE INDEX IF NOT EXISTS idx_email_templates_usage_count ON email_templates(usage_count DESC);

CREATE INDEX IF NOT EXISTS idx_email_template_versions_template_id ON email_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_email_template_versions_version_number ON email_template_versions(template_id, version_number);
CREATE INDEX IF NOT EXISTS idx_email_template_versions_is_published ON email_template_versions(is_published);

CREATE INDEX IF NOT EXISTS idx_email_template_variables_variable_key ON email_template_variables(variable_key);
CREATE INDEX IF NOT EXISTS idx_email_template_variables_category ON email_template_variables(category);

CREATE INDEX IF NOT EXISTS idx_email_sending_history_template_id ON email_sending_history(template_id);
CREATE INDEX IF NOT EXISTS idx_email_sending_history_recipient_email ON email_sending_history(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_sending_history_recipient_user_id ON email_sending_history(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_email_sending_history_status ON email_sending_history(status);
CREATE INDEX IF NOT EXISTS idx_email_sending_history_created_at ON email_sending_history(created_at);

CREATE INDEX IF NOT EXISTS idx_email_template_tests_template_id ON email_template_tests(template_id);
CREATE INDEX IF NOT EXISTS idx_email_template_tests_status ON email_template_tests(status);

-- Create GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_email_templates_variables ON email_templates USING GIN (variables);
CREATE INDEX IF NOT EXISTS idx_email_templates_tags ON email_templates USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_email_template_versions_variables ON email_template_versions USING GIN (variables);
CREATE INDEX IF NOT EXISTS idx_email_template_versions_tags ON email_template_versions USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_email_sending_history_variables ON email_sending_history USING GIN (template_variables);

-- Add foreign key constraint for current_version_id (after creating versions table)
ALTER TABLE email_templates 
ADD CONSTRAINT fk_email_templates_current_version 
FOREIGN KEY (current_version_id) REFERENCES email_template_versions(id) 
ON DELETE SET NULL;

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_email_template_categories_updated_at 
    BEFORE UPDATE ON email_template_categories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at 
    BEFORE UPDATE ON email_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_template_variables_updated_at 
    BEFORE UPDATE ON email_template_variables 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default categories
INSERT INTO email_template_categories (name, description, color, icon, sort_order, is_active) VALUES
('Authentication', 'Login, registration, and account verification emails', '#4F46E5', 'shield', 1, true),
('Notifications', 'System notifications and alerts', '#10B981', 'bell', 2, true),
('Marketing', 'Promotional and marketing emails', '#F59E0B', 'megaphone', 3, true),
('Transactional', 'Order confirmations, receipts, and transaction emails', '#3B82F6', 'receipt', 4, true),
('Support', 'Customer support and help desk emails', '#8B5CF6', 'support', 5, true),
('Welcome Series', 'Onboarding and welcome email sequences', '#EC4899', 'heart', 6, true),
('System', 'System-generated emails and alerts', '#6B7280', 'cog', 7, true)
ON CONFLICT (name) DO NOTHING;

-- Insert default template variables
INSERT INTO email_template_variables (variable_key, variable_name, description, variable_type, default_value, category, example_value) VALUES
-- User variables
('user.firstName', 'First Name', 'User first name', 'string', '', 'user', 'John'),
('user.lastName', 'Last Name', 'User last name', 'string', '', 'user', 'Doe'),
('user.email', 'Email Address', 'User email address', 'string', '', 'user', 'john@example.com'),
('user.fullName', 'Full Name', 'User full name', 'string', '', 'user', 'John Doe'),
('user.username', 'Username', 'User username', 'string', '', 'user', 'johndoe'),
('user.avatar', 'Avatar URL', 'User avatar image URL', 'string', '', 'user', 'https://example.com/avatar.jpg'),
('user.joinDate', 'Join Date', 'User registration date', 'date', '', 'user', '2024-01-15'),

-- System variables
('system.siteName', 'Site Name', 'Application name', 'string', 'MockMate', 'system', 'MockMate'),
('system.siteUrl', 'Site URL', 'Application URL', 'string', 'https://mockmate.ai', 'system', 'https://mockmate.ai'),
('system.supportEmail', 'Support Email', 'Support email address', 'string', 'support@mockmate.ai', 'system', 'support@mockmate.ai'),
('system.currentDate', 'Current Date', 'Current date', 'date', '', 'system', '2024-01-15'),
('system.currentYear', 'Current Year', 'Current year', 'number', '', 'system', '2024'),

-- Custom variables
('verification.token', 'Verification Token', 'Email verification token', 'string', '', 'custom', 'abc123xyz'),
('verification.link', 'Verification Link', 'Email verification link', 'string', '', 'custom', 'https://mockmate.ai/verify?token=abc123'),
('password.resetToken', 'Password Reset Token', 'Password reset token', 'string', '', 'custom', 'reset123'),
('password.resetLink', 'Password Reset Link', 'Password reset link', 'string', '', 'custom', 'https://mockmate.ai/reset?token=reset123'),

-- Transaction variables
('transaction.id', 'Transaction ID', 'Transaction identifier', 'string', '', 'transaction', 'TXN-123456'),
('transaction.amount', 'Transaction Amount', 'Transaction amount', 'number', '0', 'transaction', '29.99'),
('transaction.currency', 'Currency', 'Transaction currency', 'string', 'USD', 'transaction', 'USD'),
('transaction.date', 'Transaction Date', 'Transaction date', 'date', '', 'transaction', '2024-01-15'),

-- Interview session variables
('session.id', 'Session ID', 'Interview session ID', 'string', '', 'session', 'SES-789012'),
('session.jobTitle', 'Job Title', 'Interview job title', 'string', '', 'session', 'Software Engineer'),
('session.company', 'Company Name', 'Interview company name', 'string', '', 'session', 'Tech Corp'),
('session.duration', 'Session Duration', 'Interview session duration in minutes', 'number', '30', 'session', '45'),
('session.status', 'Session Status', 'Interview session status', 'string', '', 'session', 'completed')
ON CONFLICT (variable_key) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE email_template_categories IS 'Categories for organizing email templates';
COMMENT ON TABLE email_templates IS 'Main email templates table with versioning support';
COMMENT ON TABLE email_template_versions IS 'Version history for email templates';
COMMENT ON TABLE email_template_variables IS 'Available variables for email templates';
COMMENT ON TABLE email_sending_history IS 'History of sent emails for analytics and debugging';
COMMENT ON TABLE email_template_tests IS 'Email template testing records';

COMMENT ON COLUMN email_templates.template_key IS 'Unique identifier used in code to reference templates';
COMMENT ON COLUMN email_templates.mjml_template IS 'MJML source code for generating responsive HTML emails';
COMMENT ON COLUMN email_templates.variables IS 'JSON array of variable keys used in this template';
COMMENT ON COLUMN email_templates.tags IS 'JSON array of tags for organizing and filtering templates';
COMMENT ON COLUMN email_templates.is_system IS 'System templates cannot be deleted by administrators';
COMMENT ON COLUMN email_template_versions.is_published IS 'Whether this version is the current published version';
COMMENT ON COLUMN email_template_variables.validation_rules IS 'JSON object containing validation rules for the variable';
COMMENT ON COLUMN email_sending_history.template_variables IS 'JSON object containing the actual variable values used when sending';
