import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function populateSystemConfig() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔧 Populating system_config with environment variables...\n');

    // Define environment variables to add to system_config
    const envConfigs = [
      // Server Configuration
      {
        key: 'server_port',
        value: process.env.PORT || '5000',
        type: 'number',
        category: 'server',
        description: 'Server port number',
        sensitive: false,
        public: false,
      },
      {
        key: 'node_env',
        value: process.env.NODE_ENV || 'development',
        type: 'string',
        category: 'server',
        description: 'Node.js environment',
        sensitive: false,
        public: true,
      },

      // Database Configuration
      {
        key: 'db_host',
        value: process.env.DB_HOST || 'localhost',
        type: 'string',
        category: 'database',
        description: 'Database host',
        sensitive: false,
        public: false,
      },
      {
        key: 'db_port',
        value: process.env.DB_PORT || '5432',
        type: 'number',
        category: 'database',
        description: 'Database port',
        sensitive: false,
        public: false,
      },
      {
        key: 'db_name',
        value: process.env.DB_NAME || 'mockmate_db',
        type: 'string',
        category: 'database',
        description: 'Database name',
        sensitive: false,
        public: false,
      },
      {
        key: 'db_user',
        value: process.env.DB_USER || 'mockmate_user',
        type: 'string',
        category: 'database',
        description: 'Database username',
        sensitive: false,
        public: false,
      },
      {
        key: 'db_password',
        value: process.env.DB_PASSWORD || '',
        type: 'string',
        category: 'database',
        description: 'Database password',
        sensitive: true,
        public: false,
      },

      // Redis Configuration
      {
        key: 'redis_host',
        value: process.env.REDIS_HOST || 'localhost',
        type: 'string',
        category: 'redis',
        description: 'Redis host',
        sensitive: false,
        public: false,
      },
      {
        key: 'redis_port',
        value: process.env.REDIS_PORT || '6379',
        type: 'number',
        category: 'redis',
        description: 'Redis port',
        sensitive: false,
        public: false,
      },
      {
        key: 'redis_username',
        value: process.env.REDIS_USERNAME || '',
        type: 'string',
        category: 'redis',
        description: 'Redis username',
        sensitive: false,
        public: false,
      },
      {
        key: 'redis_password',
        value: process.env.REDIS_PASSWORD || '',
        type: 'string',
        category: 'redis',
        description: 'Redis password',
        sensitive: true,
        public: false,
      },

      // JWT Configuration
      {
        key: 'jwt_secret',
        value: process.env.JWT_SECRET || '',
        type: 'string',
        category: 'auth',
        description: 'JWT signing secret',
        sensitive: true,
        public: false,
      },
      {
        key: 'jwt_refresh_secret',
        value: process.env.JWT_REFRESH_SECRET || '',
        type: 'string',
        category: 'auth',
        description: 'JWT refresh token secret',
        sensitive: true,
        public: false,
      },
      {
        key: 'jwt_expires_in',
        value: process.env.JWT_EXPIRES_IN || '7d',
        type: 'string',
        category: 'auth',
        description: 'JWT expiration time',
        sensitive: false,
        public: false,
      },
      {
        key: 'session_secret',
        value: process.env.SESSION_SECRET || '',
        type: 'string',
        category: 'auth',
        description: 'Session secret key',
        sensitive: true,
        public: false,
      },

      // OAuth Configuration
      {
        key: 'google_client_id',
        value: process.env.GOOGLE_CLIENT_ID || '',
        type: 'string',
        category: 'oauth',
        description: 'Google OAuth client ID',
        sensitive: false,
        public: false,
      },
      {
        key: 'google_client_secret',
        value: process.env.GOOGLE_CLIENT_SECRET || '',
        type: 'string',
        category: 'oauth',
        description: 'Google OAuth client secret',
        sensitive: true,
        public: false,
      },

      // Email Configuration
      {
        key: 'email_from',
        value: process.env.EMAIL_FROM || 'noreply@mockmate.ai',
        type: 'string',
        category: 'email',
        description: 'Default from email address',
        sensitive: false,
        public: false,
      },
      {
        key: 'smtp_host',
        value: process.env.SMTP_HOST || 'smtp.gmail.com',
        type: 'string',
        category: 'email',
        description: 'SMTP server host',
        sensitive: false,
        public: false,
      },
      {
        key: 'smtp_port',
        value: process.env.SMTP_PORT || '587',
        type: 'number',
        category: 'email',
        description: 'SMTP server port',
        sensitive: false,
        public: false,
      },
      {
        key: 'smtp_user',
        value: process.env.SMTP_USER || '',
        type: 'string',
        category: 'email',
        description: 'SMTP username',
        sensitive: false,
        public: false,
      },
      {
        key: 'smtp_pass',
        value: process.env.SMTP_PASS || '',
        type: 'string',
        category: 'email',
        description: 'SMTP password',
        sensitive: true,
        public: false,
      },

      // AI Services
      {
        key: 'openai_api_key',
        value: process.env.OPENAI_API_KEY || '',
        type: 'string',
        category: 'ai',
        description: 'OpenAI API key',
        sensitive: true,
        public: false,
      },
      {
        key: 'openai_model',
        value: 'gpt-3.5-turbo',
        type: 'string',
        category: 'ai',
        description: 'Default OpenAI model',
        sensitive: false,
        public: false,
      },

      // File Upload
      {
        key: 'max_file_size',
        value: process.env.MAX_FILE_SIZE || '10485760',
        type: 'number',
        category: 'upload',
        description: 'Maximum file upload size in bytes',
        sensitive: false,
        public: false,
      },
      {
        key: 'upload_path',
        value: process.env.UPLOAD_PATH || './uploads',
        type: 'string',
        category: 'upload',
        description: 'File upload directory path',
        sensitive: false,
        public: false,
      },

      // Security Settings
      {
        key: 'cors_origins',
        value: process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173',
        type: 'string',
        category: 'security',
        description: 'Allowed CORS origins (comma-separated)',
        sensitive: false,
        public: false,
      },
      {
        key: 'rate_limit_window',
        value: process.env.RATE_LIMIT_WINDOW || '15',
        type: 'number',
        category: 'security',
        description: 'Rate limiting window in minutes',
        sensitive: false,
        public: false,
      },
      {
        key: 'rate_limit_max',
        value: process.env.RATE_LIMIT_MAX || '100',
        type: 'number',
        category: 'security',
        description: 'Maximum requests per rate limit window',
        sensitive: false,
        public: false,
      },

      // Frontend URLs
      {
        key: 'frontend_url',
        value: 'http://localhost:3000',
        type: 'string',
        category: 'frontend',
        description: 'Frontend application URL',
        sensitive: false,
        public: true,
      },
      {
        key: 'admin_url',
        value: 'http://localhost:3001',
        type: 'string',
        category: 'frontend',
        description: 'Admin panel URL',
        sensitive: false,
        public: true,
      },
      {
        key: 'api_url',
        value: 'http://localhost:5000',
        type: 'string',
        category: 'frontend',
        description: 'API base URL',
        sensitive: false,
        public: true,
      },
      {
        key: 'websocket_url',
        value: 'http://localhost:5000',
        type: 'string',
        category: 'frontend',
        description: 'WebSocket server URL',
        sensitive: false,
        public: true,
      },

      // Payment Configuration
      {
        key: 'cashfree_app_id',
        value: process.env.CASHFREE_APP_ID || '',
        type: 'string',
        category: 'payment',
        description: 'Cashfree application ID',
        sensitive: false,
        public: true,
      },
      {
        key: 'cashfree_secret_key',
        value: process.env.CASHFREE_SECRET_KEY || '',
        type: 'string',
        category: 'payment',
        description: 'Cashfree secret key',
        sensitive: true,
        public: false,
      },
      {
        key: 'cashfree_client_id',
        value: process.env.CASHFREE_CLIENT_ID || '',
        type: 'string',
        category: 'payment',
        description: 'Cashfree client ID',
        sensitive: false,
        public: true,
      },
      {
        key: 'cashfree_client_secret',
        value: process.env.CASHFREE_CLIENT_SECRET || '',
        type: 'string',
        category: 'payment',
        description: 'Cashfree client secret',
        sensitive: true,
        public: false,
      },
      {
        key: 'cashfree_environment',
        value: process.env.CASHFREE_ENVIRONMENT || 'sandbox',
        type: 'string',
        category: 'payment',
        description: 'Cashfree environment (sandbox/production)',
        sensitive: false,
        public: false,
      },
    ];

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const config of envConfigs) {
      try {
        // Check if configuration already exists
        const existing = await pool.query(
          'SELECT id, config_value FROM system_config WHERE config_key = $1',
          [config.key]
        );

        if (existing.rows.length === 0) {
          // Insert new configuration with proper JSON encoding
          const jsonValue =
            config.type === 'number'
              ? Number(config.value)
              : config.type === 'boolean'
                ? config.value === 'true' || config.value === true
                : config.value; // strings stay as is

          await pool.query(
            `
            INSERT INTO system_config (config_key, config_value, config_type, description, category, is_sensitive, is_public, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          `,
            [
              config.key,
              JSON.stringify(jsonValue),
              config.type,
              config.description,
              config.category,
              config.sensitive,
              config.public,
            ]
          );

          console.log('✅ Added:', config.key, '=', config.sensitive ? '[HIDDEN]' : config.value);
          added++;
        } else {
          // Update existing if it's empty or different
          const currentValue = existing.rows[0].config_value;
          if (!currentValue || currentValue === '' || currentValue === null) {
            const jsonValue =
              config.type === 'number'
                ? Number(config.value)
                : config.type === 'boolean'
                  ? config.value === 'true' || config.value === true
                  : config.value; // strings stay as is

            await pool.query(
              `
              UPDATE system_config 
              SET config_value = $1, config_type = $2, description = $3, category = $4, is_sensitive = $5, is_public = $6, updated_at = NOW()
              WHERE config_key = $7
            `,
              [
                JSON.stringify(jsonValue),
                config.type,
                config.description,
                config.category,
                config.sensitive,
                config.public,
                config.key,
              ]
            );

            console.log(
              '🔄 Updated:',
              config.key,
              '=',
              config.sensitive ? '[HIDDEN]' : config.value
            );
            updated++;
          } else {
            console.log('⏩ Skipped:', config.key, '(already has value)');
            skipped++;
          }
        }
      } catch (error) {
        console.error('❌ Failed to process', config.key, ':', error.message);
      }
    }

    console.log('\\n📊 Summary:');
    console.log('✅ Added:', added);
    console.log('🔄 Updated:', updated);
    console.log('⏩ Skipped:', skipped);
    console.log('📝 Total processed:', envConfigs.length);

    // Show final count
    const totalCount = await pool.query('SELECT COUNT(*) FROM system_config');
    console.log('\\n📈 Total configurations in database:', totalCount.rows[0].count);

    console.log('\\n🎉 System configuration populated successfully!');
    console.log('\\n📋 Next steps:');
    console.log('1. Update backend code to use dynamic configuration service');
    console.log('2. Create admin UI for managing configurations');
    console.log('3. Update frontend to fetch configurations from API');
    console.log('4. Test all functionality with dynamic configurations');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  await pool.end();
  process.exit(0);
}

populateSystemConfig();
