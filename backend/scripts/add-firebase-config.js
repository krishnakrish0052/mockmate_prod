import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mockmate_db',
  user: process.env.DB_USER || 'mockmate_user',
  password: process.env.DB_PASSWORD,
};

async function runMigration() {
  const pool = new Pool(dbConfig);
  let client;

  try {
    console.log('Connecting to database...');
    client = await pool.connect();

    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '../migrations/add_firebase_configurations.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('Running Firebase configuration migration...');

    // Split SQL by semicolons and execute each statement
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 100)}...`);
        await client.query(statement);
      }
    }

    console.log('✅ Firebase configuration migration completed successfully!');

    // Verify the migration by checking if Firebase configs were added
    console.log('\nVerifying migration...');
    const result = await client.query(`
            SELECT config_key, config_type, is_sensitive, is_public 
            FROM system_config 
            WHERE config_key LIKE 'firebase_%' 
            ORDER BY config_key
        `);

    console.log(`\nAdded ${result.rows.length} Firebase configuration entries:`);
    result.rows.forEach(row => {
      console.log(
        `  - ${row.config_key} (${row.config_type}, sensitive: ${row.is_sensitive}, public: ${row.is_public})`
      );
    });
  } catch (error) {
    console.error('❌ Error running Firebase configuration migration:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run the migration
runMigration();
