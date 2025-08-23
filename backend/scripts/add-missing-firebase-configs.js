import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mockmate_db',
  user: process.env.DB_USER || 'mockmate_user',
  password: process.env.DB_PASSWORD,
});

async function addMissingConfigs() {
  const client = await pool.connect();
  try {
    console.log('Adding missing Firebase configurations...');

    const missingConfigs = [
      ['firebase_enabled', 'false', 'boolean', false, true],
      ['firebase_emulator_host', '', 'string', false, false],
    ];

    for (const [key, value, type, sensitive, isPublic] of missingConfigs) {
      try {
        await client.query(
          `
                    INSERT INTO system_config (config_key, config_value, config_type, is_sensitive, is_public, description, category) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7) 
                    ON CONFLICT (config_key) DO NOTHING
                `,
          [
            key,
            value,
            type,
            sensitive,
            isPublic,
            `Firebase ${key.split('_').slice(1).join(' ')}`,
            'firebase',
          ]
        );
        console.log('✅ Added:', key);
      } catch (error) {
        console.log('❌ Failed to add', key, ':', error.message);
      }
    }

    console.log('\nFinal Firebase configuration check:');
    const result = await client.query(
      "SELECT config_key, config_value, config_type FROM system_config WHERE config_key LIKE 'firebase_%' ORDER BY config_key"
    );
    result.rows.forEach(row => {
      console.log(`  - ${row.config_key}: ${row.config_value || '[empty]'} (${row.config_type})`);
    });
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingConfigs();
