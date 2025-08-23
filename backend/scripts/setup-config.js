import { Pool } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function setupDynamicConfig() {
  try {
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'mockmate_db',
      user: process.env.DB_USER || 'mockmate_user',
      password: process.env.DB_PASSWORD || '',
    });

    console.log('Running dynamic configuration migration...');

    // Read and execute migration
    const migration = fs.readFileSync('./migrations/006_dynamic_configurations.sql', 'utf8');
    await pool.query(migration);

    console.log('✓ Dynamic configuration tables created successfully');

    // Populate configurations with current environment values
    const configurations = [
      ['SERVER_PORT', process.env.PORT || '5000'],
      ['NODE_ENV', process.env.NODE_ENV || 'development'],
      ['DB_HOST', process.env.DB_HOST || 'localhost'],
      ['DB_PORT', process.env.DB_PORT || '5432'],
      ['DB_NAME', process.env.DB_NAME || 'mockmate_db'],
      ['DB_USER', process.env.DB_USER || 'mockmate_user'],
      ['DB_PASSWORD', process.env.DB_PASSWORD || ''],
      ['REDIS_HOST', process.env.REDIS_HOST || 'localhost'],
      ['REDIS_PORT', process.env.REDIS_PORT || '6379'],
      ['REDIS_USERNAME', process.env.REDIS_USERNAME || ''],
      ['REDIS_PASSWORD', process.env.REDIS_PASSWORD || ''],
      ['JWT_SECRET', process.env.JWT_SECRET || ''],
      ['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET || ''],
      ['JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN || '7d'],
      ['SESSION_SECRET', process.env.SESSION_SECRET || ''],
      ['GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID || ''],
      ['GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET || ''],
      ['EMAIL_FROM', process.env.EMAIL_FROM || 'noreply@mockmate.ai'],
      ['SMTP_HOST', process.env.SMTP_HOST || 'smtp.gmail.com'],
      ['SMTP_PORT', process.env.SMTP_PORT || '587'],
      ['SMTP_USER', process.env.SMTP_USER || ''],
      ['SMTP_PASS', process.env.SMTP_PASS || ''],
      ['OPENAI_API_KEY', process.env.OPENAI_API_KEY || ''],
      ['MAX_FILE_SIZE', process.env.MAX_FILE_SIZE || '10485760'],
      ['UPLOAD_PATH', process.env.UPLOAD_PATH || './uploads'],
      ['CORS_ORIGINS', process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'],
      ['RATE_LIMIT_WINDOW', process.env.RATE_LIMIT_WINDOW || '15'],
      ['RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX || '100'],
      ['FRONTEND_URL', 'http://localhost:3000'],
      ['ADMIN_URL', 'http://localhost:3001'],
      ['API_URL', 'http://localhost:5000'],
      ['WEBSOCKET_URL', 'http://localhost:5000'],
    ];

    let populated = 0;

    for (const [key, value] of configurations) {
      try {
        const result = await pool.query(
          'SELECT id FROM system_configurations WHERE config_key = $1',
          [key]
        );

        if (result.rows.length > 0) {
          await pool.query(
            'UPDATE system_configurations SET config_value = $1, updated_at = NOW() WHERE config_key = $2',
            [value, key]
          );
          console.log('✓ Updated', key, '=', value ? '[SET]' : '[EMPTY]');
          populated++;
        } else {
          console.log('⚠ Configuration not found in schema:', key);
        }
      } catch (error) {
        console.error('❌ Failed to update', key, ':', error.message);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('📊 Populated', populated, 'configurations out of', configurations.length);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

setupDynamicConfig();
