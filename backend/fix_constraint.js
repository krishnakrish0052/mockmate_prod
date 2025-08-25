import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function fixProviderTypeConstraint() {
  const db = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD || '',
  });

  try {
    console.log('🔄 Fixing provider_type check constraint...');

    // Check current constraint
    const currentConstraint = await db.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name = 'payment_configurations_provider_type_check';
    `);

    if (currentConstraint.rows.length > 0) {
      console.log('📋 Current constraint:', currentConstraint.rows[0].check_clause);
      
      // Drop the existing constraint
      console.log('🗑️ Dropping existing constraint...');
      await db.query(`
        ALTER TABLE payment_configurations 
        DROP CONSTRAINT payment_configurations_provider_type_check;
      `);
      console.log('✅ Existing constraint dropped');
    } else {
      console.log('📋 No existing constraint found');
    }

    // Add the correct constraint with 'card' included
    console.log('➕ Adding corrected constraint...');
    await db.query(`
      ALTER TABLE payment_configurations 
      ADD CONSTRAINT payment_configurations_provider_type_check 
      CHECK (provider_type IN ('card', 'wallet', 'bank_transfer', 'crypto', 'buy_now_pay_later'));
    `);
    console.log('✅ Constraint added successfully');
    
    // Verify the new constraint
    const newConstraint = await db.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name = 'payment_configurations_provider_type_check';
    `);

    if (newConstraint.rows.length > 0) {
      console.log('📊 New constraint:', newConstraint.rows[0].check_clause);
    }

    console.log('🎉 Provider type constraint fixed successfully!');
    console.log('');
    console.log('Now you can run: node migrations/setup_payment_gateways_direct.js');

  } catch (error) {
    console.error('❌ Error fixing constraint:', error);
    throw error;
  } finally {
    await db.end();
  }
}

// Run the fix
fixProviderTypeConstraint()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Fix failed:', error.message);
    process.exit(1);
  });
