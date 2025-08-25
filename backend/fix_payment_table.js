import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function addMissingColumns() {
  const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔄 Adding missing columns to payment_configurations table...');

    // Check current table structure
    const currentColumns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'payment_configurations' AND table_schema = 'public';
    `);
    
    const existingColumns = currentColumns.rows.map(row => row.column_name);
    console.log('📋 Existing columns:', existingColumns);

    // Add missing columns one by one
    const columnsToAdd = [
      { name: 'display_name', definition: 'VARCHAR(200)' },
      { name: 'health_status', definition: 'VARCHAR(20) DEFAULT \'unknown\'' },
      { name: 'last_health_check', definition: 'TIMESTAMPTZ' },
    ];

    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        console.log(`➕ Adding column: ${column.name}`);
        await db.query(`ALTER TABLE payment_configurations ADD COLUMN ${column.name} ${column.definition};`);
        console.log(`✅ Added column: ${column.name}`);
      } else {
        console.log(`✅ Column already exists: ${column.name}`);
      }
    }

    // Add unique constraint if it doesn't exist
    try {
      console.log('🔄 Adding unique constraint on provider_name...');
      await db.query('ALTER TABLE payment_configurations ADD CONSTRAINT payment_configurations_provider_name_key UNIQUE (provider_name);');
      console.log('✅ Unique constraint added');
    } catch (error) {
      if (error.code === '42P07') {
        console.log('✅ Unique constraint already exists');
      } else {
        console.log('⚠️ Could not add unique constraint:', error.message);
      }
    }

    // Update existing records to have display names
    console.log('🔄 Updating existing records...');
    await db.query(`
      UPDATE payment_configurations 
      SET display_name = COALESCE(display_name, INITCAP(provider_name))
      WHERE display_name IS NULL;
    `);
    console.log('✅ Updated existing records');

    // Show final structure
    const updatedColumns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'payment_configurations' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    console.log('📊 Final table structure:');
    updatedColumns.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    console.log('🎉 Table structure updated successfully!');
    console.log('');
    console.log('Now you can run: node migrations/setup_payment_gateways_direct.js');

  } catch (error) {
    console.error('❌ Error updating table:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run the fix
addMissingColumns()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fix failed:', error.message);
    process.exit(1);
  });
