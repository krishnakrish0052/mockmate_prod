import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function updateFirebaseConfig() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔧 Updating Firebase configuration in system_config...');

    const firebaseConfigs = [
      ['firebase_project_id', process.env.FIREBASE_PROJECT_ID],
      ['firebase_private_key_id', process.env.FIREBASE_PRIVATE_KEY_ID],
      ['firebase_private_key', process.env.FIREBASE_PRIVATE_KEY],
      ['firebase_client_email', process.env.FIREBASE_CLIENT_EMAIL],
      ['firebase_client_id', process.env.FIREBASE_CLIENT_ID],
      ['firebase_auth_uri', process.env.FIREBASE_AUTH_URI],
      ['firebase_token_uri', process.env.FIREBASE_TOKEN_URI],
      ['firebase_client_cert_url', process.env.FIREBASE_CLIENT_CERT_URL],
      ['firebase_web_api_key', process.env.FIREBASE_WEB_API_KEY],
      ['firebase_auth_domain', process.env.FIREBASE_AUTH_DOMAIN],
      ['firebase_database_url', process.env.FIREBASE_DATABASE_URL],
      ['firebase_storage_bucket', process.env.FIREBASE_STORAGE_BUCKET],
      ['firebase_messaging_sender_id', process.env.FIREBASE_MESSAGING_SENDER_ID],
      ['firebase_app_id', process.env.FIREBASE_APP_ID]
    ];

    let updated = 0;
    let added = 0;

    for (const [key, value] of firebaseConfigs) {
      try {
        // Check if the config already exists
        const checkResult = await pool.query('SELECT id FROM system_config WHERE config_key = $1', [key]);
        
        if (checkResult.rows.length > 0) {
          // Update existing config
          await pool.query(
            'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2',
            [JSON.stringify(value), key]
          );
          console.log(`✅ Updated ${key} = ${key.includes('key') || key.includes('secret') ? '[HIDDEN]' : (value || '[EMPTY]')}`);
          updated++;
        } else {
          // Insert new config
          await pool.query(
            `INSERT INTO system_config (config_key, config_value, config_type, description, category, is_sensitive, is_public, created_at, updated_at) 
             VALUES ($1, $2, 'string', $3, 'firebase', $4, false, NOW(), NOW())`,
            [
              key, 
              JSON.stringify(value), 
              `Firebase ${key.replace('firebase_', '').replace('_', ' ')}`,
              key.includes('key') || key.includes('secret')
            ]
          );
          console.log(`➕ Added ${key} = ${key.includes('key') || key.includes('secret') ? '[HIDDEN]' : (value || '[EMPTY]')}`);
          added++;
        }
      } catch (error) {
        console.error(`❌ Failed to update ${key}:`, error.message);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`✅ Updated: ${updated} configurations`);
    console.log(`➕ Added: ${added} configurations`);
    console.log(`📝 Total processed: ${firebaseConfigs.length}`);

    // Show final Firebase config count
    const totalResult = await pool.query("SELECT COUNT(*) FROM system_config WHERE config_key LIKE 'firebase_%'");
    console.log(`📈 Total Firebase configurations in database: ${totalResult.rows[0].count}`);

    console.log('\n🎉 Firebase configuration updated successfully!');

  } catch (error) {
    console.error('❌ Error updating Firebase configuration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

updateFirebaseConfig()
  .then(() => {
    console.log('✅ Firebase configuration update completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Firebase configuration update failed:', error.message);
    process.exit(1);
  });
