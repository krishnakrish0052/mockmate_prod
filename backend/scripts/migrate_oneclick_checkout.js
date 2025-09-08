#!/usr/bin/env node

/**
 * Database Migration Script for One-Click Checkout
 * 
 * This script applies the database changes needed for one-click checkout functionality.
 * Run this script to add the required columns and functions to your database.
 */

import { getDatabase } from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('🔄 Starting One-Click Checkout Migration...');
  
  let pool = null;
  
  try {
    // Get database connection
    pool = getDatabase();
    console.log('✅ Database connection established');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '009_add_oneclick_checkout_support.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📖 Migration SQL loaded');
    
    // Check if migration has already been applied
    console.log('🔍 Checking if migration already applied...');
    try {
      const checkResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'payments' 
        AND column_name = 'cashfree_link_id'
      `);
      
      if (checkResult.rows.length > 0) {
        console.log('⚠️  Migration appears to already be applied (cashfree_link_id column exists)');
        console.log('   If you need to re-run the migration, please check your database manually.');
        return;
      }
    } catch (error) {
      console.log('🔍 Unable to check migration status, proceeding...');
    }
    
    // Apply the migration
    console.log('🚀 Applying migration...');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length > 0) {
        try {
          await pool.query(statement);
          console.log(`   ✅ Executed statement ${i + 1}/${statements.length}`);
        } catch (error) {
          console.error(`   ❌ Error in statement ${i + 1}: ${error.message}`);
          // Continue with other statements for non-critical errors
          if (error.message.includes('already exists')) {
            console.log('      (Object already exists, skipping...)');
          } else {
            throw error;
          }
        }
      }
    }
    
    // Verify the migration was successful
    console.log('🔍 Verifying migration...');
    const verifyResult = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      AND column_name IN ('cashfree_link_id', 'cf_link_id', 'checkout_type', 'payment_link_url')
      ORDER BY column_name
    `);
    
    console.log('✅ New columns added:');
    verifyResult.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });
    
    // Check if functions were created
    const functionResult = await pool.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name IN ('get_payment_gateway_info', 'find_payment_by_gateway_id')
      AND routine_type = 'FUNCTION'
    `);
    
    console.log('✅ Database functions created:');
    functionResult.rows.forEach(func => {
      console.log(`   - ${func.routine_name}()`);
    });
    
    console.log('');
    console.log('🎉 One-Click Checkout Migration Completed Successfully!');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Go to Admin Panel → Payment Gateways');  
    console.log('   3. Configure Cashfree gateway');
    console.log('   4. Enable "⚡ Enable One-Click Checkout"');
    console.log('   5. Test both checkout flows');
    console.log('');
    console.log('📚 Documentation: docs/ONECLICK_CHECKOUT_IMPLEMENTATION.md');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('   - Check database connection settings');
    console.error('   - Verify database user has CREATE/ALTER permissions');
    console.error('   - Check if migration file exists');
    console.error('   - Review database logs for detailed errors');
    process.exit(1);
  } finally {
    if (pool) {
      console.log('🔌 Closing database connection...');
      await pool.end();
    }
  }
}

// Run the migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration()
    .then(() => {
      console.log('✨ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { runMigration };
