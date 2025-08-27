import { getDatabase, initializeDatabase } from './config/database.js';

async function checkPaymentConfigs() {
  try {
    await initializeDatabase();
    const db = getDatabase();
    console.log('🔍 Checking payment configurations...');
    
    const result = await db.query(`
      SELECT id, provider_name, display_name, is_active, is_test_mode, 
             priority, created_at, configuration
      FROM payment_configurations 
      ORDER BY priority DESC, provider_name
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ No payment configurations found in database');
      console.log('Run the setup script: node migrations/setup_payment_gateways.js');
      return;
    }
    
    console.log('📊 Current payment configurations:');
    result.rows.forEach(config => {
      console.log(`\n ID: ${config.id}`);
      console.log(` Provider: ${config.display_name} (${config.provider_name})`);
      console.log(` Status: ${config.is_active ? '🟢 Active' : '🔴 Inactive'}`);
      console.log(` Mode: ${config.is_test_mode ? 'TEST' : 'LIVE'}`);
      console.log(` Priority: ${config.priority}`);
      console.log(` Created: ${config.created_at}`);
      
      // Show configuration (safely)
      try {
        const conf = JSON.parse(config.configuration || '{}');
        const safeConf = { ...conf };
        if (safeConf.secret_key) safeConf.secret_key = '••••••••';
        if (safeConf.app_id && safeConf.app_id.length > 10) {
          safeConf.app_id = safeConf.app_id.substring(0, 8) + '••••';
        }
        console.log(` Config: ${JSON.stringify(safeConf, null, 2)}`);
      } catch (e) {
        console.log(` Config: Invalid JSON`);
      }
      console.log(' ---');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking configs:', error.message);
    process.exit(1);
  }
}

checkPaymentConfigs();
