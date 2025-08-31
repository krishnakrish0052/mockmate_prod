import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabaseTables() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔗 Connecting to PostgreSQL database...');
    console.log(`🔗 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`🔗 Database: ${process.env.DB_NAME}`);
    console.log(`🔗 User: ${process.env.DB_USER}`);

    // Get all tables in the database
    const tablesQuery = `
      SELECT schemaname, tablename, tableowner
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;

    const tablesResult = await pool.query(tablesQuery);
    
    console.log('\n📋 Tables in the database:');
    console.log('=' .repeat(60));
    
    if (tablesResult.rows.length === 0) {
      console.log('❌ No tables found in the public schema');
    } else {
      tablesResult.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.tablename} (owner: ${row.tableowner})`);
      });
    }

    console.log(`\nTotal tables: ${tablesResult.rows.length}`);

    // Check for specific tables that are mentioned in error
    const requiredTables = [
      'system_config',
      'system_configurations',
      'configuration_categories',
      'configuration_history',
      'configuration_cache',
      'feature_flags',
      'configuration_templates'
    ];

    console.log('\n🔍 Checking for required configuration tables:');
    console.log('=' .repeat(60));

    for (const tableName of requiredTables) {
      const exists = tablesResult.rows.some(row => row.tablename === tableName);
      console.log(`${exists ? '✅' : '❌'} ${tableName}`);
      
      if (exists) {
        // Get row count for existing tables
        try {
          const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
          console.log(`   └─ Rows: ${countResult.rows[0].count}`);
        } catch (countError) {
          console.log(`   └─ Error counting rows: ${countError.message}`);
        }
      }
    }

    // Check for other important tables
    console.log('\n🔍 Checking for other important tables:');
    console.log('=' .repeat(60));
    
    const otherImportantTables = [
      'users',
      'admin_users',
      'sessions',
      'email_templates',
      'payment_transactions'
    ];

    for (const tableName of otherImportantTables) {
      const exists = tablesResult.rows.some(row => row.tablename === tableName);
      console.log(`${exists ? '✅' : '❌'} ${tableName}`);
      
      if (exists) {
        try {
          const countResult = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
          console.log(`   └─ Rows: ${countResult.rows[0].count}`);
        } catch (countError) {
          console.log(`   └─ Error counting rows: ${countError.message}`);
        }
      }
    }

    // Get database version and other info
    console.log('\n📊 Database Information:');
    console.log('=' .repeat(60));
    
    const versionResult = await pool.query('SELECT version()');
    console.log(`PostgreSQL Version: ${versionResult.rows[0].version.split(',')[0]}`);
    
    const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size('${process.env.DB_NAME}')) as size
    `);
    console.log(`Database Size: ${sizeResult.rows[0].size}`);

    // Check for any views
    const viewsQuery = `
      SELECT schemaname, viewname, viewowner
      FROM pg_views 
      WHERE schemaname = 'public'
      ORDER BY viewname;
    `;
    
    const viewsResult = await pool.query(viewsQuery);
    console.log(`\n👁️ Views in database: ${viewsResult.rows.length}`);
    if (viewsResult.rows.length > 0) {
      viewsResult.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.viewname} (owner: ${row.viewowner})`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkDatabaseTables()
  .then(() => {
    console.log('\n✅ Database check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database check failed:', error.message);
    process.exit(1);
  });
