-- Create user analytics table for detailed tracking
CREATE TABLE IF NOT EXISTS user_analytics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    page_url TEXT,
    referrer TEXT,
    action_type VARCHAR(100) NOT NULL,
    action_details JSONB DEFAULT '{}',
    browser_info JSONB DEFAULT '{}',
    device_info JSONB DEFAULT '{}',
    location_info JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create website analytics table for daily aggregated data
CREATE TABLE IF NOT EXISTS website_analytics (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    total_visits INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    page_views INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    returning_users INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0,
    avg_session_duration INTEGER DEFAULT 0, -- in seconds
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_session_id ON user_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_action_type ON user_analytics(action_type);
CREATE INDEX IF NOT EXISTS idx_user_analytics_timestamp ON user_analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_analytics_created_at ON user_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_user_analytics_ip_address ON user_analytics(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_analytics_date ON user_analytics(DATE(created_at));

CREATE INDEX IF NOT EXISTS idx_website_analytics_date ON website_analytics(date);

-- Create indexes for JSON fields commonly queried
CREATE INDEX IF NOT EXISTS idx_user_analytics_browser ON user_analytics USING GIN ((browser_info->>'name'));
CREATE INDEX IF NOT EXISTS idx_user_analytics_country ON user_analytics USING GIN ((location_info->>'country'));
CREATE INDEX IF NOT EXISTS idx_user_analytics_device_type ON user_analytics USING GIN ((device_info->>'type'));

-- Add trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_analytics_updated_at BEFORE UPDATE
    ON user_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_website_analytics_updated_at BEFORE UPDATE
    ON website_analytics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE user_analytics IS 'Detailed tracking of user activities and page visits';
COMMENT ON COLUMN user_analytics.action_type IS 'Type of action: page_visit, user_registration, user_login, credit_purchase, interview_session, etc.';
COMMENT ON COLUMN user_analytics.action_details IS 'JSON field containing specific details about the action';
COMMENT ON COLUMN user_analytics.browser_info IS 'JSON field containing browser name, version, and engine information';
COMMENT ON COLUMN user_analytics.device_info IS 'JSON field containing device type, OS, and other device details';
COMMENT ON COLUMN user_analytics.location_info IS 'JSON field containing country, city, timezone based on IP geolocation';

COMMENT ON TABLE website_analytics IS 'Daily aggregated website analytics data';
COMMENT ON COLUMN website_analytics.date IS 'Date for which analytics are aggregated';
COMMENT ON COLUMN website_analytics.bounce_rate IS 'Percentage of single-page sessions';
COMMENT ON COLUMN website_analytics.avg_session_duration IS 'Average session duration in seconds';

-- Sample query examples (commented out)
/*
-- Get daily page views for last 30 days
SELECT 
    DATE(created_at) as date,
    COUNT(*) as page_views
FROM user_analytics 
WHERE action_type = 'page_visit' 
AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- Get top countries by visitors
SELECT 
    location_info->>'country' as country,
    COUNT(DISTINCT session_id) as unique_visitors
FROM user_analytics 
WHERE created_at >= NOW() - INTERVAL '30 days'
AND location_info->>'country' IS NOT NULL
GROUP BY location_info->>'country'
ORDER BY unique_visitors DESC
LIMIT 10;

-- Get browser statistics
SELECT 
    browser_info->>'name' as browser,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM user_analytics 
WHERE created_at >= NOW() - INTERVAL '30 days'
AND browser_info->>'name' IS NOT NULL
GROUP BY browser_info->>'name'
ORDER BY count DESC;

-- Get user registration trend
SELECT 
    DATE(created_at) as date,
    COUNT(*) as registrations
FROM user_analytics 
WHERE action_type = 'user_registration'
AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY date;
*/
