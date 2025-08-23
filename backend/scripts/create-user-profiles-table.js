import { getDatabase } from '../config/database.js';

async function createUserProfilesTable() {
  const db = getDatabase();

  console.log('Creating user_profiles table...');

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS user_profiles (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_title VARCHAR(255),
      job_description TEXT,
      industry VARCHAR(100),
      years_of_experience INTEGER DEFAULT 0,
      skill_level VARCHAR(50) DEFAULT 'intermediate',
      preferred_session_type VARCHAR(50) DEFAULT 'mixed',
      preferred_difficulty VARCHAR(50) DEFAULT 'intermediate', 
      preferred_duration INTEGER DEFAULT 30,
      resume_id UUID REFERENCES user_resumes(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    );
  `;

  const createIndexesQuery = `
    CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_job_title ON user_profiles(job_title);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_skill_level ON user_profiles(skill_level);
    CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_session_type ON user_profiles(preferred_session_type);
  `;

  try {
    await db.query(createTableQuery);
    console.log('✓ user_profiles table created successfully');

    await db.query(createIndexesQuery);
    console.log('✓ Indexes created successfully');

    // Add trigger to update updated_at timestamp
    const triggerQuery = `
      CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_user_profiles_updated_at
          BEFORE UPDATE ON user_profiles
          FOR EACH ROW
          EXECUTE PROCEDURE update_user_profiles_updated_at();
    `;

    await db.query(triggerQuery);
    console.log('✓ Updated_at trigger created successfully');

    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Error creating user_profiles table:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createUserProfilesTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { createUserProfilesTable };
