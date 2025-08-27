import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...\n');

  console.log('📋 Environment variables:');
  console.log('DB_HOST:', process.env.DB_HOST || 'undefined');
  console.log('DB_PORT:', process.env.DB_PORT || 'undefined');
  console.log('DB_NAME:', process.env.DB_NAME || 'undefined');
  console.log('DB_USER:', process.env.DB_USER || 'undefined');
  console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[SET]' : 'undefined');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '[SET]' : 'undefined');
  console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('');

  // Test different connection methods
  const connectionConfigs = [
    {
      name: 'DATABASE_URL',
      config: process.env.DATABASE_URL ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      } : null
    },
    {
      name: 'Individual vars (with password)',
      config: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'mockmate_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || undefined,
      }
    },
    {
      name: 'Individual vars (no password)',
      config: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'mockmate_db',
        user: process.env.DB_USER || 'postgres',
      }
    },
    {
      name: 'Default PostgreSQL',
      config: {
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
      }
    },
    {
      name: 'Common production config',
      config: {
        host: 'localhost',
        port: 5432,
        database: 'mockmate_db',
        user: 'mockmate_user',
      }
    }
  ];

  for (const { name, config } of connectionConfigs) {
    if (!config) continue;
    
    console.log(`🔌 Testing: ${name}`);
    console.log('Config:', JSON.stringify(config, (key, value) => 
      key === 'password' ? (value ? '[REDACTED]' : undefined) : value, 2));

    try {
      const pool = new Pool(config);
      
      // Test connection
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ SUCCESS! Connected successfully');
      console.log('Current time from DB:', result.rows[0].now);
      
      // Test if system_config table exists
      try {
        const tableCheck = await pool.query("SELECT COUNT(*) FROM system_config WHERE config_key LIKE '%stripe%'");
        console.log('📊 Stripe configs found:', tableCheck.rows[0].count);
        console.log('🎯 This configuration works! Use this for the migration.');
      } catch (tableError) {
        console.log('⚠️ system_config table not found or accessible');
      }
      
      await pool.end();
      console.log('');
      break; // Stop testing once we find a working config
      
    } catch (error) {
      console.log('❌ FAILED:', error.message);
      console.log('');
    }
  }
}

testDatabaseConnection().catch(console.error);
