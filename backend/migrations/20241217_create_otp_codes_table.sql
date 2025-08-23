-- Migration: Create otp_codes table for numeric OTP authentication
-- Created: 2024-12-17

CREATE TABLE otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_type VARCHAR(50) NOT NULL CHECK (otp_type IN ('email_verification', 'password_reset', 'password_change', 'login_2fa')),
    code VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_otp_codes_user_type ON otp_codes(user_id, otp_type);
CREATE INDEX idx_otp_codes_code ON otp_codes(code);
CREATE INDEX idx_otp_codes_expires_at ON otp_codes(expires_at);
CREATE INDEX idx_otp_codes_is_used ON otp_codes(is_used);

-- Index for cleanup operations
CREATE INDEX idx_otp_codes_cleanup ON otp_codes(expires_at, is_used, used_at);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_otp_codes_updated_at BEFORE UPDATE ON otp_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE otp_codes IS 'Table for storing numeric OTP codes for various authentication flows';
COMMENT ON COLUMN otp_codes.otp_type IS 'Type of OTP: email_verification, password_reset, password_change, login_2fa';
COMMENT ON COLUMN otp_codes.code IS 'The OTP code (numeric or token)';
COMMENT ON COLUMN otp_codes.expires_at IS 'When the OTP expires';
COMMENT ON COLUMN otp_codes.attempt_count IS 'Number of verification attempts';
COMMENT ON COLUMN otp_codes.max_attempts IS 'Maximum allowed attempts before locking';
COMMENT ON COLUMN otp_codes.metadata IS 'Additional metadata stored as JSON';
