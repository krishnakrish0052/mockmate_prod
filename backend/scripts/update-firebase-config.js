import { Pool } from 'pg';
import { DynamicConfigService } from '../services/DynamicConfigService.js';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mockmate_db',
  user: process.env.DB_USER || 'mockmate_user',
  password: process.env.DB_PASSWORD,
});

async function updateFirebaseConfiguration() {
  try {
    console.log('🔥 Updating Firebase Configuration in Admin Panel...\n');

    // Initialize DynamicConfigService
    const dynamicConfig = new DynamicConfigService(pool);
    await dynamicConfig.initialize();

    // Firebase configurations to update
    const firebaseConfigs = {
      // Client SDK Configuration (from firebaseConfig)
      firebase_web_api_key: 'AIzaSyBMQZUlX38HCvQ0J9b1zSFS8sFzI9PfB1M',
      firebase_auth_domain: 'mock-mate-com.firebaseapp.com',
      firebase_project_id: 'mock-mate-com',
      firebase_storage_bucket: 'mock-mate-com.firebasestorage.app',
      firebase_messaging_sender_id: '237832181293',
      firebase_app_id: '1:237832181293:web:8210444f612a60d6260aa4',

      // Admin SDK Configuration (from service account)
      firebase_private_key_id: '3dc84dc8f2da17c97b32c0209f5b87223ee77059',
      firebase_private_key:
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCbSzXUmm5fPwb1\nEXqKYYeeJ1I4VMuPtGMpwfYYqCjEmTaonF3BM3RQc1odYB9T04T7BYHBPcqgIDgX\nbBhEnhwK8BPyEKbYkSGnqBI+cRbqQEXX2fKV9yockj91zc2Idl/G/ZmdEFFP3nvn\niE8x3mOfBRfF7DZW976CeXUXkQv9poK9RbTFhXVJWALE6/s+9VPj9okBzffEE0ae\nBs47nIepnxcky5zVfDxpq7qCcV81tXezsO0LqNZzYkqPdv/wZNnohZH0PVc5RO/l\ndDDWWn8xNmVbxIBQUs2AT+rJ5T7zQDc5tPZliwFe4pmoiIn61ExJ0pbQyIhJLZhF\nxz9GY81/AgMBAAECggEAPtadLq1a0hG35/ytoEc80GNK4t51DG5K3f/NbEbHUF5K\n/slfKql+fHtg0JgvtQTXP5gH3ED7t/WxnNCxtTphUI+7Em1ohiOcAbKBx2CNjDZ7\nzI81mTdNhAgtw6aGb5yuvt+phCOxM2dsrdC7cwtxNkyiRQWDK4fOQA+TsPiRaI6R\nz83DyBsCymYTk0wbpgIZcinyBH5/qwXo/NAxzlGyzQof8Myy90Z7nluCb5OazXtU\n1vg6tEpSN+3YUTroiheDq4DG3jFIeqxBF7xYhI0mGQiNL6Yix6HV7ZnPIRCcaBeB\nuU1PGfUjGz/7pnZ2aP9aV69Ic3eJF5tbJ7FDK5LdMQKBgQDN/gyP3d23H032NdE8\noS+UoKZAoARDvJvr3awnK9bcJmXla2aON0bo8DwANTIX/LWaGxDFforMX+tw13O5\nOvygncF9kU4W6lOXFLGBp2W2zt4F/Y86/qXwoMPYerpnkHw741zy0YuZ6rksgH7q\n4t8taUDitZZTnwE5Ar8Fnlm5+QKBgQDA/lxklwqOfdKoZCFeDTlaPyO4e7s9pM/d\n71N5Xel5NgGSOwPjPsoJ4MGSXVRWoPTMtZrH2fzRILy1zC07e01tmCTLRX/uQ5o+\n/hk5n+ejXISVT0B0enl2Xl39EC5ZxKv3PIU/BYKm4gRs9/tJjMRAZMbfm2xQasPd\nuL4KLDHhNwKBgQDKQ71T+pe9OujTbE6yyNauivwUEst9M5KqjDSBFgPYkX+WQNon\npNFk4pcX4SP597LdyduzAKkLOtg1KelApVHv6FdYk7foulgvzirp01QFp6TMnwfn\n9qk72K/VPdUQ4geKypq29tir3pXKw7VbsD9SGLqUoZclLskFkNO+kZkrCQKBgBmd\nKLIJAdOri1vh/jO3WZdKrfj8IvupdhUkgFWpSyVVL5wyzO9KFBJ/i/FbBaiBsDvD\nFonTuqQezizqrk4orTwQZ0G7NaFvw3b8zmhBesLJsqcGX62V260EFUFS9nPfkFs9\n4wlcN9ziPmgf+W/niNxrA6IFxLhfkyNIM6CyAOS9AoGAE8lzLmVqPzSHH4KLWAY2\n/nlTe7o00qEdQZyqrcn9MBOU6xtXjl6bPLzzZbRbpEfx83/fzraZlnNFiSBhqrT/\no1QJJEqOKC1cD5r00wdn6lUyCd1ztdsoZ05kjmuGFkaY0rvfCK2f1SSq4q9XuU3N\nWEcbc21AUhZVUKTPk9mYL/U=\n-----END PRIVATE KEY-----\n',
      firebase_client_email: 'firebase-adminsdk-fbsvc@mock-mate-com.iam.gserviceaccount.com',
      firebase_client_id: '107808109365778730027',
      firebase_auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      firebase_token_uri: 'https://oauth2.googleapis.com/token',
      firebase_client_cert_url:
        'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40mock-mate-com.iam.gserviceaccount.com',

      // Enable Firebase
      firebase_enabled: 'true',
    };

    console.log('Updating Firebase configurations...\n');

    // Update each configuration
    let successCount = 0;
    let errorCount = 0;

    for (const [key, value] of Object.entries(firebaseConfigs)) {
      try {
        // For sensitive fields, we need to store as JSON string
        const client = await pool.connect();

        let storageValue;
        if (typeof value === 'string' && value !== '') {
          // Store as JSON string for the jsonb column
          storageValue = JSON.stringify(value);
        } else {
          storageValue = value;
        }

        await client.query(
          'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2',
          [storageValue, key]
        );

        client.release();

        // Log success with appropriate masking for sensitive data
        const isSensitive = key.includes('private_key') || key.includes('api_key');
        const displayValue = isSensitive
          ? '[REDACTED]'
          : value.length > 50
            ? value.substring(0, 50) + '...'
            : value;

        console.log(`✅ ${key}: ${displayValue}`);
        successCount++;
      } catch (error) {
        console.log(`❌ Failed to update ${key}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Update Summary:`);
    console.log(`   ✅ Successfully updated: ${successCount} configurations`);
    console.log(`   ❌ Failed to update: ${errorCount} configurations`);

    // Test the configuration by reading it back
    console.log('\n🔍 Verifying Firebase configuration...');

    const testKeys = ['firebase_project_id', 'firebase_auth_domain', 'firebase_enabled'];
    for (const key of testKeys) {
      const value = await dynamicConfig.get(key);
      console.log(`   ${key}: ${value || '[empty]'}`);
    }

    console.log('\n🎯 Testing Firebase service configuration...');

    // Import and test Firebase service
    const FirebaseAuthService = (await import('../services/FirebaseAuthService.js')).default;
    const firebaseService = new FirebaseAuthService(pool, dynamicConfig);

    const config = await firebaseService.getFirebaseConfiguration();
    const isClientValid = firebaseService.isConfigValid(config.client);
    const isAdminValid = firebaseService.isConfigValid(config.admin, true);

    console.log(`   Client config valid: ${isClientValid ? '✅ YES' : '❌ NO'}`);
    console.log(`   Admin config valid: ${isAdminValid ? '✅ YES' : '❌ NO'}`);

    if (isClientValid && isAdminValid) {
      console.log('\n🎉 Firebase Configuration Successfully Updated!');
      console.log('\n📝 What you can do now:');
      console.log('   1. Test Firebase authentication endpoints');
      console.log('   2. Access Firebase config via /api/config for frontend');
      console.log('   3. Use Firebase auth in your application');
      console.log('   4. Manage configs through the admin panel');
    } else {
      console.log('\n⚠️  Configuration updated but validation failed.');
      console.log('   Please check the configuration values.');
    }
  } catch (error) {
    console.error('❌ Error updating Firebase configuration:', error);
  } finally {
    await pool.end();
  }
}

updateFirebaseConfiguration();
