const { Pool } = require('pg');
require('dotenv').config();

async function runSchemaFix() {
  const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    console.log('🔧 Running schema fix...');

    // Add missing columns to user_resumes table
    await pool.query(`
      ALTER TABLE user_resumes 
      ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
      ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
      ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS projects JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS total_experience_years DECIMAL(4,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS parsing_status VARCHAR(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS parsed_at TIMESTAMP;
    `);

    console.log('✅ Added missing columns');

    // Update existing records
    const updateResult = await pool.query(`
      UPDATE user_resumes 
      SET 
          original_filename = COALESCE(original_filename, file_name),
          file_size_bytes = COALESCE(file_size_bytes, 0),
          certifications = COALESCE(certifications, '[]'::jsonb),
          projects = COALESCE(projects, '[]'::jsonb),
          total_experience_years = COALESCE(total_experience_years, 0),
          parsing_status = COALESCE(parsing_status, 'pending'),
          parsed_at = COALESCE(parsed_at, created_at)
      WHERE 
          original_filename IS NULL 
          OR file_size_bytes IS NULL 
          OR certifications IS NULL 
          OR projects IS NULL 
          OR total_experience_years IS NULL 
          OR parsing_status IS NULL 
          OR parsed_at IS NULL;
    `);

    console.log(`✅ Updated ${updateResult.rowCount} existing records`);

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_resumes_parsing_status ON user_resumes(parsing_status);
      CREATE INDEX IF NOT EXISTS idx_user_resumes_parsed_at ON user_resumes(parsed_at);
      CREATE INDEX IF NOT EXISTS idx_user_resumes_total_experience ON user_resumes(total_experience_years);
      CREATE INDEX IF NOT EXISTS idx_resume_certifications_gin ON user_resumes USING gin(certifications);
      CREATE INDEX IF NOT EXISTS idx_resume_projects_gin ON user_resumes USING gin(projects);
    `);

    console.log('✅ Created indexes');

    // Add constraints
    await pool.query(`
      ALTER TABLE user_resumes 
      ADD CONSTRAINT IF NOT EXISTS chk_parsing_status 
      CHECK (parsing_status IN ('pending', 'processing', 'completed', 'failed'));
    `);

    await pool.query(`
      ALTER TABLE user_resumes 
      ADD CONSTRAINT IF NOT EXISTS chk_file_size_positive 
      CHECK (file_size_bytes >= 0);
    `);

    await pool.query(`
      ALTER TABLE user_resumes 
      ADD CONSTRAINT IF NOT EXISTS chk_experience_years_positive 
      CHECK (total_experience_years >= 0);
    `);

    console.log('✅ Added constraints');

    // Show the updated schema
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'user_resumes' 
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Updated schema:');
    schemaResult.rows.forEach(row => {
      console.log(
        `  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`
      );
    });

    console.log('\n🎉 Schema fix completed successfully!');
  } catch (error) {
    console.error('❌ Error running schema fix:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

runSchemaFix().catch(console.error);
