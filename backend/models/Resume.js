const { getDatabase } = require('../config/database');
const path = require('path');
const fs = require('fs').promises;

class Resume {
  constructor(data = {}) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.file_name = data.file_name;
    this.file_path = data.file_path;
    this.parsed_content = data.parsed_content;
    this.skills = data.skills || [];
    this.experience = data.experience || [];
    this.education = data.education || [];
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new resume record
  static async create(resumeData) {
    const db = getDatabase();
    const {
      user_id,
      file_name,
      file_path,
      parsed_content,
      skills = [],
      experience = [],
      education = [],
    } = resumeData;

    const query = `
      INSERT INTO user_resumes (
        user_id, file_name, file_path, parsed_content, skills, experience, education
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await db.query(query, [
      user_id,
      file_name,
      file_path,
      parsed_content,
      JSON.stringify(skills),
      JSON.stringify(experience),
      JSON.stringify(education),
    ]);

    return new Resume(result.rows[0]);
  }

  // Find resume by ID
  static async findById(id) {
    const db = getDatabase();
    const query = 'SELECT * FROM user_resumes WHERE id = $1';
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Resume(result.rows[0]);
  }

  // Find resume by user ID
  static async findByUserId(userId, activeOnly = true) {
    const db = getDatabase();
    let query = 'SELECT * FROM user_resumes WHERE user_id = $1';
    const params = [userId];

    if (activeOnly) {
      query += ' AND is_active = true';
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows.map(row => new Resume(row));
  }

  // Find active resume by user ID
  static async findActiveByUserId(userId) {
    const resumes = await Resume.findByUserId(userId, true);
    return resumes.length > 0 ? resumes[0] : null;
  }

  // Update resume
  async update(updateData) {
    const db = getDatabase();
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic query based on provided fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined && key !== 'id') {
        // Handle JSON fields
        if (['skills', 'experience', 'education'].includes(key)) {
          fields.push(`${key} = $${paramCount}`);
          values.push(JSON.stringify(updateData[key]));
        } else {
          fields.push(`${key} = $${paramCount}`);
          values.push(updateData[key]);
        }
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(this.id);

    const query = `
      UPDATE user_resumes 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Resume not found');
    }

    // Update current instance
    Object.assign(this, result.rows[0]);
    return this;
  }

  // Update parsed content
  async updateParsedContent(content, skills = [], experience = [], education = []) {
    const updateData = {
      parsed_content: content,
      skills: skills,
      experience: experience,
      education: education,
    };

    return await this.update(updateData);
  }

  // Activate resume (deactivate others for the same user)
  async activate() {
    const db = getDatabase();
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Deactivate all other resumes for this user
      await client.query(
        'UPDATE user_resumes SET is_active = false WHERE user_id = $1 AND id != $2',
        [this.user_id, this.id]
      );

      // Activate this resume
      await client.query(
        'UPDATE user_resumes SET is_active = true, updated_at = NOW() WHERE id = $1',
        [this.id]
      );

      await client.query('COMMIT');

      this.is_active = true;
      return this;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Deactivate resume
  async deactivate() {
    return await this.update({ is_active: false });
  }

  // Delete resume (also delete the file)
  async delete() {
    const db = getDatabase();

    // Delete the physical file first
    if (this.file_path) {
      try {
        await fs.unlink(this.file_path);
      } catch (fileError) {
        console.warn(`Warning: Could not delete file ${this.file_path}:`, fileError.message);
      }
    }

    // Delete from database
    const query = 'DELETE FROM user_resumes WHERE id = $1';
    await db.query(query, [this.id]);

    return true;
  }

  // Get file extension
  getFileExtension() {
    return path.extname(this.file_name).toLowerCase();
  }

  // Check if file is PDF
  isPDF() {
    return this.getFileExtension() === '.pdf';
  }

  // Check if file is Word document
  isWordDocument() {
    const ext = this.getFileExtension();
    return ext === '.doc' || ext === '.docx';
  }

  // Get file size
  async getFileSize() {
    try {
      const stats = await fs.stat(this.file_path);
      return stats.size;
    } catch (_error) {
      return 0;
    }
  }

  // Get formatted file size
  async getFormattedFileSize() {
    const size = await this.getFileSize();

    if (size === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));

    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Extract skills from parsed content
  extractSkills() {
    if (!this.parsed_content) {
      return [];
    }

    // Basic skill extraction logic - can be enhanced
    const skillKeywords = [
      // Programming languages
      'javascript',
      'python',
      'java',
      'c++',
      'c#',
      'php',
      'ruby',
      'go',
      'rust',
      'swift',
      'typescript',
      'kotlin',
      'scala',
      'r',
      'matlab',
      'sql',
      'html',
      'css',

      // Frameworks and libraries
      'react',
      'angular',
      'vue',
      'node.js',
      'express',
      'django',
      'flask',
      'spring',
      'laravel',
      'rails',
      'jquery',
      'bootstrap',
      'tailwind',

      // Databases
      'mysql',
      'postgresql',
      'mongodb',
      'redis',
      'elasticsearch',
      'sqlite',

      // Cloud and DevOps
      'aws',
      'azure',
      'gcp',
      'docker',
      'kubernetes',
      'jenkins',
      'git',
      'ci/cd',

      // Tools and technologies
      'agile',
      'scrum',
      'jira',
      'confluence',
      'slack',
      'trello',
    ];

    const content = this.parsed_content.toLowerCase();
    const foundSkills = [];

    skillKeywords.forEach(skill => {
      if (content.includes(skill)) {
        foundSkills.push(skill);
      }
    });

    return [...new Set(foundSkills)]; // Remove duplicates
  }

  // Get resume summary
  getSummary() {
    return {
      id: this.id,
      file_name: this.file_name,
      is_active: this.is_active,
      skills_count: Array.isArray(this.skills) ? this.skills.length : 0,
      experience_count: Array.isArray(this.experience) ? this.experience.length : 0,
      education_count: Array.isArray(this.education) ? this.education.length : 0,
      has_content: !!this.parsed_content,
      file_type: this.getFileExtension(),
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  // Get detailed resume data
  getDetailedData() {
    return {
      id: this.id,
      file_name: this.file_name,
      file_path: this.file_path,
      parsed_content: this.parsed_content,
      skills: Array.isArray(this.skills) ? this.skills : [],
      experience: Array.isArray(this.experience) ? this.experience : [],
      education: Array.isArray(this.education) ? this.education : [],
      is_active: this.is_active,
      file_type: this.getFileExtension(),
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  // Check if file exists
  async fileExists() {
    try {
      await fs.access(this.file_path);
      return true;
    } catch (_error) {
      return false;
    }
  }

  // Get file stats
  async getFileStats() {
    try {
      const stats = await fs.stat(this.file_path);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        exists: true,
      };
    } catch (_error) {
      return {
        size: 0,
        created: null,
        modified: null,
        exists: false,
      };
    }
  }

  // Convert to JSON
  toJSON() {
    return this.getDetailedData();
  }

  // Static method to get resume statistics for a user
  static async getUserResumeStats(userId) {
    const db = getDatabase();
    const query = `
      SELECT 
        COUNT(*) as total_resumes,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_resumes,
        COUNT(CASE WHEN parsed_content IS NOT NULL AND parsed_content != '' THEN 1 END) as parsed_resumes
      FROM user_resumes 
      WHERE user_id = $1
    `;

    const result = await db.query(query, [userId]);
    return (
      result.rows[0] || {
        total_resumes: 0,
        active_resumes: 0,
        parsed_resumes: 0,
      }
    );
  }

  // Static method to clean up orphaned resume files
  static async cleanupOrphanedFiles(uploadDir) {
    const db = getDatabase();

    // Get all file paths from database
    const query = 'SELECT file_path FROM user_resumes';
    const result = await db.query(query);
    const dbFilePaths = new Set(result.rows.map(row => row.file_path));

    // Get all files in upload directory
    const files = await fs.readdir(uploadDir);
    const deletedFiles = [];

    for (const file of files) {
      const fullPath = path.join(uploadDir, file);

      // If file is not in database, delete it
      if (!dbFilePaths.has(fullPath)) {
        try {
          await fs.unlink(fullPath);
          deletedFiles.push(file);
        } catch (_error) {
          console.warn(`Could not delete orphaned file ${file}:`, _error.message);
        }
      }
    }

    return deletedFiles;
  }
}

module.exports = Resume;
