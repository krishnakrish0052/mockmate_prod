import { getDatabase } from '../config/database.js';

class UserProfile {
  constructor(data = {}) {
    this.id = data.id;
    this.userId = data.user_id || data.userId;
    this.jobTitle = data.job_title || data.jobTitle;
    this.jobDescription = data.job_description || data.jobDescription;
    this.industry = data.industry;
    this.yearsOfExperience = data.years_of_experience || data.yearsOfExperience;
    this.skillLevel = data.skill_level || data.skillLevel;
    this.preferredSessionType = data.preferred_session_type || data.preferredSessionType;
    this.preferredDifficulty = data.preferred_difficulty || data.preferredDifficulty;
    this.preferredDuration = data.preferred_duration || data.preferredDuration;
    this.resumeData = data.resume_data || data.resumeData;
    this.skills = data.skills || [];
    this.careerGoals = data.career_goals || data.careerGoals;
    this.weaknessAreas = data.weakness_areas || data.weaknessAreas || [];
    this.createdAt = data.created_at || data.createdAt;
    this.updatedAt = data.updated_at || data.updatedAt;
  }

  // Create a new user profile
  static async create(profileData) {
    const db = getDatabase();
    const {
      userId,
      jobTitle,
      jobDescription,
      industry,
      yearsOfExperience,
      skillLevel,
      preferredSessionType,
      preferredDifficulty,
      preferredDuration,
      resumeData,
      skills,
      careerGoals,
      weaknessAreas
    } = profileData;

    const query = `
      INSERT INTO user_profiles (
        user_id, job_title, job_description, industry, years_of_experience,
        skill_level, preferred_session_type, preferred_difficulty, preferred_duration, 
        resume_data, skills, career_goals, weakness_areas
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const result = await db.query(query, [
      userId,
      jobTitle,
      jobDescription,
      industry,
      yearsOfExperience,
      skillLevel,
      preferredSessionType || null,
      preferredDifficulty || null,
      preferredDuration || null,
      resumeData || null,
      JSON.stringify(skills || []),
      careerGoals || null,
      JSON.stringify(weaknessAreas || [])
    ]);

    return new UserProfile(result.rows[0]);
  }

  // Find profile by user ID
  static async findByUserId(userId) {
    const _db = getDatabase();
    const query = 'SELECT * FROM user_profiles WHERE user_id = $1';
    const result = await _db.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new UserProfile(result.rows[0]);
  }

  // Find profile by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM user_profiles WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new UserProfile(result.rows[0]);
  }

  // Update user profile
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic query based on provided fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id' && key !== 'user_id') {
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(this.id);

    const query = `
      UPDATE user_profiles 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Profile not found');
    }

    // Update current instance
    Object.assign(this, result.rows[0]);
    return this;
  }

  // Delete user profile
  async delete() {
    const db = getDatabase();
    const query = 'DELETE FROM user_profiles WHERE id = $1';
    await db.query(query, [this.id]);
    return true;
  }

  // Create or update profile (upsert)
  static async createOrUpdate(userData) {
    const _db = getDatabase();
    const { user_id } = userData;

    // Check if profile exists
    const existingProfile = await this.findByUserId(user_id);

    if (existingProfile) {
      // Update existing profile
      return await existingProfile.update(userData);
    } else {
      // Create new profile
      return await this.create(userData);
    }
  }

  // Get profile with resume data
  static async getProfileWithResume(userId) {
    const _db = getDatabase();
    const query = `
      SELECT p.*, r.file_name as resume_filename, r.parsed_content as resume_content
      FROM user_profiles p
      LEFT JOIN user_resumes r ON p.resume_id = r.id
      WHERE p.user_id = $1
    `;

    const result = await _db.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    const profile = new UserProfile(result.rows[0]);

    // Add resume data if available
    if (result.rows[0].resume_id) {
      profile.resume = {
        id: result.rows[0].resume_id,
        filename: result.rows[0].resume_filename,
        content: result.rows[0].resume_content,
      };
    }

    return profile;
  }

  // Static update method
  static async update(id, updateData) {
    const profile = await this.findById(id);
    if (!profile) {
      throw new Error('Profile not found');
    }
    return await profile.update(updateData);
  }

  // Static delete method
  static async delete(id) {
    const db = getDatabase();
    const query = 'DELETE FROM user_profiles WHERE id = $1';
    await db.query(query, [id]);
    return true;
  }

  // Calculate profile completion score
  static calculateCompletionScore(profile) {
    if (!profile) return 0;
    
    let score = 0;
    const maxScore = 100;
    
    // Required fields (60 points total)
    if (profile.jobTitle) score += 15;
    if (profile.industry) score += 15;
    if (profile.yearsOfExperience !== undefined && profile.yearsOfExperience !== null) score += 10;
    if (profile.skillLevel) score += 20;
    
    // Optional but valuable fields (40 points total)
    if (profile.jobDescription) score += 10;
    if (profile.preferredSessionType) score += 5;
    if (profile.preferredDifficulty) score += 5;
    if (profile.preferredDuration) score += 5;
    if (profile.skills && profile.skills.length > 0) score += 10;
    if (profile.careerGoals) score += 5;
    
    return Math.min(score, maxScore);
  }

  // Check if profile is complete
  static isProfileComplete(profile) {
    if (!profile) return false;
    
    // Minimum required fields for a complete profile
    return !!(
      profile.jobTitle &&
      profile.industry &&
      profile.skillLevel &&
      profile.yearsOfExperience !== undefined &&
      profile.yearsOfExperience !== null
    );
  }

  // Get completion tips
  static getCompletionTips(profile) {
    if (!profile) {
      return [
        'Start by adding your job title and industry',
        'Include your years of experience',
        'Set your skill level',
        'Add your key skills',
        'Include your career goals'
      ];
    }
    
    const tips = [];
    
    if (!profile.jobTitle) {
      tips.push('Add your current or target job title');
    }
    if (!profile.industry) {
      tips.push('Specify your industry or field');
    }
    if (profile.yearsOfExperience === undefined || profile.yearsOfExperience === null) {
      tips.push('Include your years of professional experience');
    }
    if (!profile.skillLevel) {
      tips.push('Set your skill level (entry, junior, mid, senior, lead, executive)');
    }
    if (!profile.jobDescription) {
      tips.push('Add a brief job description to get more relevant questions');
    }
    if (!profile.preferredSessionType) {
      tips.push('Set your preferred interview session type');
    }
    if (!profile.skills || profile.skills.length === 0) {
      tips.push('List your key technical and soft skills');
    }
    if (!profile.careerGoals) {
      tips.push('Share your career goals for personalized advice');
    }
    if (!profile.preferredDifficulty) {
      tips.push('Set your preferred interview difficulty level');
    }
    if (!profile.preferredDuration) {
      tips.push('Choose your preferred interview session duration');
    }
    
    if (tips.length === 0) {
      return ['Your profile looks great! Consider adding more details to get even better personalized interviews.'];
    }
    
    return tips;
  }

  // Convert to JSON (for API responses)
  toJSON() {
    // Parse JSON fields if they're strings
    const data = { ...this };
    
    if (typeof data.skills === 'string') {
      try {
        data.skills = JSON.parse(data.skills);
      } catch {
        data.skills = [];
      }
    }
    
    if (typeof data.weaknessAreas === 'string') {
      try {
        data.weaknessAreas = JSON.parse(data.weaknessAreas);
      } catch {
        data.weaknessAreas = [];
      }
    }
    
    return data;
  }
}

export default UserProfile;
