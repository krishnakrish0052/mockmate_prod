import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function addIconConfig() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    console.log('Connected to database successfully');

    // Check if system_config table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_config'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Creating system_config table...');
      await client.query(`
        CREATE TABLE system_config (
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
      `);
    }

    // Insert default icon configuration entries
    console.log('Adding icon configuration entries...');
    const iconConfigs = [
      [
        'app_title',
        'MockMate - AI-powered Interview Platform',
        'Application title displayed in browser tab and PWA',
        'string',
      ],
      ['app_favicon', '/mockmate_32x32.png', 'URL path to favicon (32x32 recommended)', 'string'],
      [
        'app_logo',
        '/mockmate_128x128.png',
        'URL path to main application logo (128x128 recommended)',
        'string',
      ],
      ['app_icon_16', '/mockmate_16x16.png', 'URL path to 16x16 app icon', 'string'],
      ['app_icon_32', '/mockmate_32x32.png', 'URL path to 32x32 app icon', 'string'],
      ['app_icon_128', '/mockmate_128x128.png', 'URL path to 128x128 app icon', 'string'],
      ['app_icon_256', '/mockmate_256x256.png', 'URL path to 256x256 app icon', 'string'],
    ];

    for (const [key, value, description, type] of iconConfigs) {
      await client.query(
        `
        INSERT INTO system_config (config_key, config_value, description, config_type) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (config_key) DO NOTHING
      `,
        [key, value, description, type]
      );
    }

    // Add index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);
    `);

    // Add update trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION update_system_config_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Add trigger for automatic updated_at updates
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_system_config_updated_at ON system_config;
      CREATE TRIGGER trigger_system_config_updated_at
          BEFORE UPDATE ON system_config
          FOR EACH ROW
          EXECUTE FUNCTION update_system_config_updated_at();
    `);

    // Verify the entries were added
    const result = await client.query(`
      SELECT config_key, config_value FROM system_config 
      WHERE config_key LIKE 'app_%' 
      ORDER BY config_key;
    `);

    console.log('Icon configuration entries added:');
    result.rows.forEach(row => {
      console.log(`  ${row.config_key}: ${row.config_value}`);
    });

    client.release();
    await pool.end();
    console.log('Icon configuration setup completed successfully!');
  } catch (error) {
    console.error('Error setting up icon configuration:', error);
    process.exit(1);
  }
}

addIconConfig();
