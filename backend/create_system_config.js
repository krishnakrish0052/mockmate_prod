import { Pool } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function createSystemConfigTable() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔧 Creating system_config table...');
    console.log(`🔗 Connecting to: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    // Read the SQL file
    const sqlContent = fs.readFileSync('./create_system_config_table.sql', 'utf8');

    // Execute the SQL
    await pool.query(sqlContent);

    console.log('✅ system_config table created successfully!');
    
    // Now update the values with actual environment variables
    const updates = [
      ['server_port', process.env.PORT || '5000'],
      ['node_env', process.env.NODE_ENV || 'development'],
      ['db_host', process.env.DB_HOST || 'localhost'],
      ['db_port', process.env.DB_PORT || '5432'],
      ['db_name', process.env.DB_NAME || 'mockmate_db'],
      ['db_user', process.env.DB_USER || 'mockmate_user'],
      ['db_password', process.env.DB_PASSWORD || ''],
      ['redis_host', process.env.REDIS_HOST || 'localhost'],
      ['redis_port', process.env.REDIS_PORT || '6379'],
      ['redis_username', process.env.REDIS_USERNAME || ''],
      ['redis_password', process.env.REDIS_PASSWORD || ''],
      ['jwt_secret', process.env.JWT_SECRET || ''],
      ['jwt_refresh_secret', process.env.JWT_REFRESH_SECRET || ''],
      ['jwt_expires_in', process.env.JWT_EXPIRES_IN || '7d'],
      ['session_secret', process.env.SESSION_SECRET || ''],
      ['google_client_id', process.env.GOOGLE_CLIENT_ID || ''],
      ['google_client_secret', process.env.GOOGLE_CLIENT_SECRET || ''],
      ['email_from', process.env.EMAIL_FROM || 'noreply@mockmate.ai'],
      ['smtp_host', process.env.SMTP_HOST || 'smtp.gmail.com'],
      ['smtp_port', process.env.SMTP_PORT || '587'],
      ['smtp_user', process.env.SMTP_USER || ''],
      ['smtp_pass', process.env.SMTP_PASS || ''],
      ['openai_api_key', process.env.OPENAI_API_KEY || ''],
      ['max_file_size', process.env.MAX_FILE_SIZE || '10485760'],
      ['upload_path', process.env.UPLOAD_PATH || './uploads'],
      ['cors_origins', process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'],
      ['rate_limit_window', process.env.RATE_LIMIT_WINDOW || '15'],
      ['rate_limit_max', process.env.RATE_LIMIT_MAX || '100'],
      ['frontend_url', process.env.FRONTEND_URL || 'http://localhost:3000'],
      ['cashfree_app_id', process.env.CASHFREE_APP_ID || ''],
      ['cashfree_secret_key', process.env.CASHFREE_SECRET_KEY || ''],
      ['cashfree_client_id', process.env.CASHFREE_CLIENT_ID || ''],
      ['cashfree_client_secret', process.env.CASHFREE_CLIENT_SECRET || ''],
      ['cashfree_environment', process.env.CASHFREE_ENVIRONMENT || 'sandbox']
    ];

    console.log('🔄 Updating configuration values...');
    let updated = 0;

    for (const [key, value] of updates) {
      try {
        // Convert value to JSON for storage if it's a number or boolean
        let jsonValue = value;
        const config = await pool.query('SELECT config_type FROM system_config WHERE config_key = $1', [key]);
        
        if (config.rows.length > 0) {
          const type = config.rows[0].config_type;
          if (type === 'number') {
            jsonValue = JSON.stringify(Number(value));
          } else if (type === 'boolean') {
            jsonValue = JSON.stringify(value === 'true' || value === true);
          } else {
            jsonValue = JSON.stringify(value);
          }
          
          await pool.query(
            'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2',
            [jsonValue, key]
          );
          console.log(`✅ Updated ${key} = ${value ? (key.includes('password') || key.includes('secret') || key.includes('key') ? '[HIDDEN]' : value) : '[EMPTY]'}`);
          updated++;
        }
      } catch (error) {
        console.error(`❌ Failed to update ${key}:`, error.message);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`✅ Updated: ${updated} configurations`);
    console.log(`📝 Total processed: ${updates.length}`);

    // Show final count
    const totalResult = await pool.query('SELECT COUNT(*) FROM system_config');
    console.log(`📈 Total configurations in database: ${totalResult.rows[0].count}`);

    console.log('\n🎉 system_config table setup completed successfully!');

  } catch (error) {
    console.error('❌ Error creating system_config table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createSystemConfigTable()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
