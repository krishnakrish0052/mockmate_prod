#!/usr/bin/env node

/**
 * Production Fix: Update Frontend URLs in Database
 * 
 * This script fixes the issue where email verification links use localhost
 * instead of the production domain https://mock-mate.com
 * 
 * Run this on your production server to fix the database configurations.
 */

import { Pool } from 'pg';
import { config } from 'dotenv';

// Load production environment variables
config();

async function fixProductionUrls() {
  console.log('🔧 Production Fix: Updating URL configurations in database...\n');
  
  // Use production database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    // Check current configuration first
    console.log('📋 Checking current configurations...');
    const currentResult = await pool.query(
      'SELECT config_key, config_value FROM system_config WHERE config_key LIKE \'%url%\' ORDER BY config_key'
    );
    
    console.log('Current URL configurations:');
    currentResult.rows.forEach(row => {
      console.log(`  ${row.config_key}: ${row.config_value}`);
    });
    
    console.log('\n🔄 Updating to production URLs...');
    
    // Update frontend_url to production domain
    await pool.query(
      'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2', 
      [JSON.stringify('https://mock-mate.com'), 'frontend_url']
    );
    console.log('✅ Updated frontend_url to https://mock-mate.com');
    
    // Update api_url to production backend
    await pool.query(
      'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2', 
      [JSON.stringify('https://backend.mock-mate.com'), 'api_url']
    );
    console.log('✅ Updated api_url to https://backend.mock-mate.com');
    
    // Update admin_url
    await pool.query(
      'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2', 
      [JSON.stringify('https://mock-mate.com/admin'), 'admin_url']
    );
    console.log('✅ Updated admin_url to https://mock-mate.com/admin');
    
    // Update websocket_url
    await pool.query(
      'UPDATE system_config SET config_value = $1, updated_at = NOW() WHERE config_key = $2', 
      [JSON.stringify('https://backend.mock-mate.com'), 'websocket_url']
    );
    console.log('✅ Updated websocket_url to https://backend.mock-mate.com');
    
    // Verify the changes
    console.log('\n📋 Verifying updated configurations:');
    const verifyResult = await pool.query(
      'SELECT config_key, config_value FROM system_config WHERE config_key LIKE \'%url%\' ORDER BY config_key'
    );
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.config_key}: ${row.config_value}`);
    });
    
    // Test verification URL generation
    console.log('\n🧪 Testing verification URL generation:');
    const frontendUrl = verifyResult.rows.find(r => r.config_key === 'frontend_url')?.config_value;
    if (frontendUrl) {
      const testToken = '9f4b9e441234cf975384f0365dc18e0f670ec6bdec09834eee173d326b25e8bf';
      const verificationUrl = `${frontendUrl}/verify-email?token=${testToken}`;
      console.log(`  Sample verification URL: ${verificationUrl}`);
      
      if (verificationUrl.includes('mock-mate.com')) {
        console.log('\n🎉 SUCCESS: Email verification URLs will now use production domain!');
        console.log('\n📧 Email Template Impact:');
        console.log('  ❌ Before: http://localhost:3000/verify-email?token=...');
        console.log(`  ✅ After:  ${verificationUrl.replace(testToken, '...')}`);
        console.log('\n💡 New user registration emails will now generate correct verification links.');
      } else {
        console.log('\n⚠️  Warning: URL still does not use production domain');
      }
    }
    
    console.log('\n✨ Production fix completed successfully!');
    console.log('🔄 You may need to restart your application server for changes to take effect.');
    
  } catch (error) {
    console.error('❌ Error updating production URLs:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

// Run the fix
fixProductionUrls().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
