-- Create app_downloads migration
-- This script creates tables for managing desktop app downloads and versions

-- Create platforms table
CREATE TABLE IF NOT EXISTS app_platforms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    icon VARCHAR(100),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create app_versions table
CREATE TABLE IF NOT EXISTS app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID NOT NULL REFERENCES app_platforms(id) ON DELETE CASCADE,
    version VARCHAR(20) NOT NULL,
    version_code INTEGER NOT NULL, -- For version comparison (e.g., 1.0.0 = 100, 1.0.1 = 101)
    display_name VARCHAR(200), -- Optional display name override
    description TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT, -- File size in bytes
    file_hash VARCHAR(64), -- SHA-256 hash for integrity
    download_url VARCHAR(500),
    is_beta BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    min_os_version VARCHAR(50), -- Minimum OS version required
    changelog TEXT,
    release_notes TEXT,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID,
    UNIQUE(platform_id, version)
);

-- Create app_downloads_log table for tracking downloads
CREATE TABLE IF NOT EXISTS app_downloads_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES app_versions(id) ON DELETE CASCADE,
    user_id UUID, -- Optional user tracking
    ip_address INET,
    user_agent TEXT,
    referrer VARCHAR(500),
    download_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    download_completed_at TIMESTAMP WITH TIME ZONE,
    download_status VARCHAR(20) DEFAULT 'started', -- started, completed, failed, cancelled
    error_message TEXT
);

-- Create app_update_checks table for tracking update checks
CREATE TABLE IF NOT EXISTS app_update_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id UUID NOT NULL REFERENCES app_platforms(id),
    current_version VARCHAR(20) NOT NULL,
    current_version_code INTEGER NOT NULL,
    user_id UUID,
    ip_address INET,
    user_agent TEXT,
    has_update BOOLEAN DEFAULT FALSE,
    latest_version VARCHAR(20),
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default platforms
INSERT INTO app_platforms (name, display_name, icon, sort_order) VALUES
    ('windows', 'Windows', 'fa-windows', 1),
    ('macos', 'macOS', 'fa-apple', 2),
    ('linux', 'Linux', 'fa-linux', 3)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_app_versions_platform_active ON app_versions(platform_id, is_active);
CREATE INDEX IF NOT EXISTS idx_app_versions_version_code ON app_versions(platform_id, version_code DESC);
CREATE INDEX IF NOT EXISTS idx_app_downloads_log_version ON app_downloads_log(version_id);
CREATE INDEX IF NOT EXISTS idx_app_downloads_log_date ON app_downloads_log(download_started_at);
CREATE INDEX IF NOT EXISTS idx_app_update_checks_platform ON app_update_checks(platform_id, checked_at);

-- Create triggers for automatic updated_at updates
CREATE OR REPLACE FUNCTION update_app_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trigger_app_platforms_updated_at ON app_platforms;
CREATE TRIGGER trigger_app_platforms_updated_at
    BEFORE UPDATE ON app_platforms
    FOR EACH ROW
    EXECUTE FUNCTION update_app_updated_at();

DROP TRIGGER IF EXISTS trigger_app_versions_updated_at ON app_versions;
CREATE TRIGGER trigger_app_versions_updated_at
    BEFORE UPDATE ON app_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_app_updated_at();

-- Create view for easy querying of active versions
CREATE OR REPLACE VIEW v_active_app_versions AS
SELECT 
    v.id,
    v.platform_id,
    p.name as platform_name,
    p.display_name as platform_display_name,
    p.icon as platform_icon,
    v.version,
    v.version_code,
    v.display_name,
    v.description,
    v.file_name,
    v.file_path,
    v.file_size,
    v.download_url,
    v.is_beta,
    v.is_featured,
    v.min_os_version,
    v.changelog,
    v.release_notes,
    v.download_count,
    v.created_at,
    v.updated_at,
    -- Latest version flag
    CASE 
        WHEN v.version_code = (
            SELECT MAX(v2.version_code) 
            FROM app_versions v2 
            WHERE v2.platform_id = v.platform_id 
            AND v2.is_active = TRUE
        ) THEN TRUE 
        ELSE FALSE 
    END as is_latest
FROM app_versions v
JOIN app_platforms p ON v.platform_id = p.id
WHERE v.is_active = TRUE AND p.is_active = TRUE
ORDER BY p.sort_order, v.version_code DESC;

-- Add comments for documentation
COMMENT ON TABLE app_platforms IS 'Supported platforms for desktop applications';
COMMENT ON TABLE app_versions IS 'Desktop application versions and download information';
COMMENT ON TABLE app_downloads_log IS 'Log of app download attempts and completions';
COMMENT ON TABLE app_update_checks IS 'Log of update checks performed by desktop apps';
COMMENT ON VIEW v_active_app_versions IS 'Active app versions with platform information and latest version flags';
