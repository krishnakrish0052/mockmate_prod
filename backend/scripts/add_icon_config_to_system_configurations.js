import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function addIconConfigToSystemConfigurations() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mockmate_db',
    user: process.env.DB_USER || 'mockmate_user',
    password: process.env.DB_PASSWORD,
  });

  try {
    const client = await pool.connect();
    console.log('Connected to database successfully');

    // First, check if the frontend category exists, if not create it
    const categoryQuery = `
      INSERT INTO configuration_categories (name, display_name, description, icon, sort_order) VALUES
      ('frontend', 'Frontend Configuration', 'Client-side application settings and branding', 'monitor', 10)
      ON CONFLICT (name) DO NOTHING;
    `;

    await client.query(categoryQuery);
    console.log('Frontend category ensured');

    // Get the frontend category ID
    const categoryResult = await client.query(`
      SELECT id FROM configuration_categories WHERE name = 'frontend'
    `);

    if (categoryResult.rows.length === 0) {
      throw new Error('Frontend category not found');
    }

    const categoryId = categoryResult.rows[0].id;
    console.log('Frontend category ID:', categoryId);

    // Insert icon configuration entries
    console.log('Adding icon configuration entries...');
    const iconConfigs = [
      [
        'app_title',
        'Application Title',
        'Application title displayed in browser tab and PWA',
        'MockMate - AI-powered Interview Platform',
        'string',
        false,
        true,
      ],
      [
        'app_favicon',
        'Favicon',
        'URL path to favicon (32x32 recommended)',
        '/mockmate_32x32.png',
        'string',
        false,
        true,
      ],
      [
        'app_logo',
        'Application Logo',
        'URL path to main application logo (128x128 recommended)',
        '/mockmate_128x128.png',
        'string',
        false,
        true,
      ],
      [
        'app_icon_16',
        '16x16 Icon',
        'URL path to 16x16 app icon',
        '/mockmate_16x16.png',
        'string',
        false,
        true,
      ],
      [
        'app_icon_32',
        '32x32 Icon',
        'URL path to 32x32 app icon',
        '/mockmate_32x32.png',
        'string',
        false,
        true,
      ],
      [
        'app_icon_128',
        '128x128 Icon',
        'URL path to 128x128 app icon',
        '/mockmate_128x128.png',
        'string',
        false,
        true,
      ],
      [
        'app_icon_256',
        '256x256 Icon',
        'URL path to 256x256 app icon',
        '/mockmate_256x256.png',
        'string',
        false,
        true,
      ],
    ];

    for (const [
      configKey,
      displayName,
      description,
      defaultValue,
      valueType,
      isSensitive,
      isClientAccessible,
    ] of iconConfigs) {
      await client.query(
        `
        INSERT INTO system_configurations (
          category_id, config_key, display_name, description, 
          config_value, default_value, value_type, 
          validation_rules, is_required, is_sensitive, 
          is_client_accessible, environment, restart_required, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (config_key) DO UPDATE SET
          category_id = EXCLUDED.category_id,
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          config_value = COALESCE(system_configurations.config_value, EXCLUDED.config_value),
          default_value = EXCLUDED.default_value,
          value_type = EXCLUDED.value_type,
          is_client_accessible = EXCLUDED.is_client_accessible
      `,
        [
          categoryId,
          configKey,
          displayName,
          description,
          defaultValue, // config_value
          defaultValue, // default_value
          valueType,
          '{}', // validation_rules (empty JSON)
          false, // is_required
          isSensitive,
          isClientAccessible,
          'all', // environment
          false, // restart_required
          iconConfigs.indexOf([
            configKey,
            displayName,
            description,
            defaultValue,
            valueType,
            isSensitive,
            isClientAccessible,
          ]) + 1, // sort_order
        ]
      );
    }

    // Verify the entries were added
    const result = await client.query(`
      SELECT config_key, config_value, display_name FROM system_configurations 
      WHERE config_key LIKE 'app_%' 
      ORDER BY config_key;
    `);

    console.log('Icon configuration entries added:');
    result.rows.forEach(row => {
      console.log(`  ${row.config_key} (${row.display_name}): ${row.config_value}`);
    });

    client.release();
    await pool.end();
    console.log('Icon configuration setup completed successfully!');
  } catch (error) {
    console.error('Error setting up icon configuration:', error);
    process.exit(1);
  }
}

addIconConfigToSystemConfigurations();
