import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mockmate_db',
  user: process.env.DB_USER || 'mockmate_user',
  password: process.env.DB_PASSWORD || 'mockmate_2024!',
});

const configKeys = [
  // Email Configuration
  {
    category: 'email',
    key: 'smtp_host',
    type: 'text',
    default: 'smtp.gmail.com',
    description: 'SMTP server host for sending emails',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'email',
    key: 'smtp_port',
    type: 'number',
    default: '587',
    description: 'SMTP server port',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'email',
    key: 'smtp_user',
    type: 'text',
    default: '',
    description: 'SMTP username/email',
    is_sensitive: true,
    is_public: false,
  },
  {
    category: 'email',
    key: 'smtp_pass',
    type: 'text',
    default: '',
    description: 'SMTP password/app password',
    is_sensitive: true,
    is_public: false,
  },
  {
    category: 'email',
    key: 'email_from',
    type: 'text',
    default: 'noreply@mockmate.ai',
    description: 'From email address',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'email',
    key: 'frontend_url',
    type: 'text',
    default: 'http://localhost:3000',
    description: 'Frontend URL for email links',
    is_sensitive: false,
    is_public: true,
  },

  // Firebase Configuration
  {
    category: 'firebase',
    key: 'firebase_web_api_key',
    type: 'text',
    default: '',
    description: 'Firebase Web API Key',
    is_sensitive: true,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_auth_domain',
    type: 'text',
    default: '',
    description: 'Firebase Auth Domain',
    is_sensitive: false,
    is_public: true,
  },
  {
    category: 'firebase',
    key: 'firebase_project_id',
    type: 'text',
    default: '',
    description: 'Firebase Project ID',
    is_sensitive: false,
    is_public: true,
  },
  {
    category: 'firebase',
    key: 'firebase_storage_bucket',
    type: 'text',
    default: '',
    description: 'Firebase Storage Bucket',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_messaging_sender_id',
    type: 'text',
    default: '',
    description: 'Firebase Messaging Sender ID',
    is_sensitive: false,
    is_public: true,
  },
  {
    category: 'firebase',
    key: 'firebase_app_id',
    type: 'text',
    default: '',
    description: 'Firebase App ID',
    is_sensitive: false,
    is_public: true,
  },
  {
    category: 'firebase',
    key: 'firebase_private_key_id',
    type: 'text',
    default: '',
    description: 'Firebase Private Key ID (Admin SDK)',
    is_sensitive: true,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_private_key',
    type: 'text',
    default: '',
    description: 'Firebase Private Key (Admin SDK)',
    is_sensitive: true,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_client_email',
    type: 'text',
    default: '',
    description: 'Firebase Client Email (Admin SDK)',
    is_sensitive: true,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_client_id',
    type: 'text',
    default: '',
    description: 'Firebase Client ID (Admin SDK)',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_auth_uri',
    type: 'text',
    default: 'https://accounts.google.com/o/oauth2/auth',
    description: 'Firebase Auth URI',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_token_uri',
    type: 'text',
    default: 'https://oauth2.googleapis.com/token',
    description: 'Firebase Token URI',
    is_sensitive: false,
    is_public: false,
  },
  {
    category: 'firebase',
    key: 'firebase_client_cert_url',
    type: 'text',
    default: '',
    description: 'Firebase Client Certificate URL',
    is_sensitive: false,
    is_public: false,
  },
];

async function insertConfigKeys() {
  try {
    await client.connect();
    console.log('Connected to database');

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
          config_key VARCHAR(255) UNIQUE NOT NULL,
          config_value JSONB,
          default_value JSONB,
          config_type VARCHAR(50) NOT NULL DEFAULT 'text',
          category VARCHAR(100),
          description TEXT,
          is_sensitive BOOLEAN DEFAULT FALSE,
          is_public BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          created_by INTEGER,
          updated_by INTEGER
        );
      `);

      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config(category);
        CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key);
        CREATE INDEX IF NOT EXISTS idx_system_config_is_public ON system_config(is_public);
      `);
    }

    // Insert configuration keys
    for (const config of configKeys) {
      try {
        const result = await client.query(
          `
          INSERT INTO system_config 
          (config_key, config_value, config_type, category, description, is_sensitive, is_public)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (config_key) DO UPDATE SET
            config_type = EXCLUDED.config_type,
            category = EXCLUDED.category,
            description = EXCLUDED.description,
            is_sensitive = EXCLUDED.is_sensitive,
            is_public = EXCLUDED.is_public,
            updated_at = NOW()
          RETURNING config_key;
        `,
          [
            config.key,
            JSON.stringify(config.default),
            config.type,
            config.category,
            config.description,
            config.is_sensitive,
            config.is_public,
          ]
        );

        console.log(`✅ Inserted/Updated config key: ${config.key}`);
      } catch (error) {
        console.error(`❌ Failed to insert config key ${config.key}:`, error.message);
      }
    }

    console.log(`\n🎉 Configuration keys setup completed!`);
    console.log(`\n📝 Next steps:`);
    console.log(`1. Go to the admin panel → System Configuration`);
    console.log(`2. Configure your email settings (SMTP credentials)`);
    console.log(`3. Configure your Firebase settings (project credentials)`);
    console.log(`4. The services will automatically use these dynamic configurations`);
  } catch (error) {
    console.error('Failed to insert configuration keys:', error);
  } finally {
    await client.end();
  }
}

insertConfigKeys();
