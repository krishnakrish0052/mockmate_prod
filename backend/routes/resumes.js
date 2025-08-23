import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { requirePermission } from '../middleware/admin/adminAuth.js';
import { authenticateToken, userRateLimit } from '../middleware/auth.js';
import { getDatabase } from '../config/database.js';
import { logError } from '../config/logger.js';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import pdfParse from 'pdf-parse-new';
import mammoth from 'mammoth';
import path from 'path';
import { promises as fs } from 'fs';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/resumes');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only PDF, DOCX, DOC, and TXT files
    const allowedTypes = ['.pdf', '.docx', '.doc', '.txt'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, DOC, and TXT files are allowed.'));
    }
  }
});

// Validation rules
const updateResumeValidation = [
  param('resumeId').isUUID().withMessage('Resume ID must be a valid UUID'),
  body('filename')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Filename must be 1-255 characters'),
  body('content')
    .optional()
    .trim()
    .isLength({ max: 50000 })
    .withMessage('Content cannot exceed 50,000 characters'),
];

// Helper function to extract text from different file types
async function extractTextFromFile(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();

  try {
    if (ext === '.txt') {
      return await fs.readFile(filePath, 'utf8');
    } else if (ext === '.pdf') {
      // Extract text from PDF using pdf-parse-new
      const pdfBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      return pdfData.text;
    } else if (ext === '.docx') {
      // Extract text from DOCX using mammoth
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else if (ext === '.doc') {
      // For older .doc files, mammoth can still try to parse
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      } catch (_docError) {
        // If mammoth fails with .doc files, provide helpful error
        throw new Error(
          'Legacy .doc files may not be fully supported. Please convert to .docx or PDF format for best results.'
        );
      }
    } else {
      throw new Error('Unsupported file type');
    }
  } catch (error) {
    logError(error, { filePath, originalname });

    // Provide more specific error messages
    if (error.message.includes('pdf-parse')) {
      throw new Error('Failed to parse PDF file. The file may be corrupted or password protected.');
    } else if (error.message.includes('mammoth')) {
      throw new Error('Failed to parse Word document. The file may be corrupted.');
    } else {
      throw new Error(`Failed to extract text from file: ${error.message}`);
    }
  }
}

// Helper function to analyze resume content
function analyzeResume(content) {
  if (!content || typeof content !== 'string') {
    console.warn('analyzeResume: Invalid content provided');
    return {
      wordCount: 0,
      sections: [],
      skills: [],
      experience: [],
      education: [],
      companies: [],
      totalExperienceYears: 0,
      certifications: [],
      projects: [],
    };
  }

  const analysis = {
    wordCount: content.split(/\s+/).filter(word => word.length > 0).length,
    sections: [],
    skills: [],
    experience: [],
    education: [],
    companies: [],
    totalExperienceYears: 0,
    certifications: [],
    projects: [],
  };

  console.log(`analyzeResume: Processing content with ${analysis.wordCount} words`);

  // Enhanced section detection with more comprehensive patterns
  const sectionKeywords = {
    experience:
      /(?:experience|work history|employment|professional experience|career|work experience|job history|positions held|professional background|work|employment)/i,
    education:
      /(?:education|academic|degree|university|college|school|qualification|certification|academic background|learning|bachelor|master|phd|diploma)/i,
    skills:
      /(?:skills|technical skills|competencies|proficiencies|expertise|technologies|tools|programming languages|software|platforms|technical|programming)/i,
    summary:
      /(?:summary|objective|profile|about|overview|introduction|professional summary|career objective|personal statement)/i,
    contact:
      /(?:contact|phone|email|address|mobile|telephone|linkedin|github|portfolio|website|@|\+\d|\d{3}-\d{3}-\d{4})/i,
    projects:
      /(?:projects|portfolio|work samples|achievements|accomplishments|key projects|built|developed|created)/i,
    certifications:
      /(?:certifications|certificates|licenses|credentials|training|courses|certified|aws|microsoft|google cloud)/i,
  };

  Object.entries(sectionKeywords).forEach(([section, regex]) => {
    if (regex.test(content)) {
      analysis.sections.push(section);
      console.log(`Found section: ${section}`);
    }
  });

  // Comprehensive skill extraction covering multiple technology domains
  const commonSkills = [
    // Programming Languages
    'JavaScript',
    'Python',
    'Java',
    'C++',
    'C#',
    'PHP',
    'Ruby',
    'Go',
    'Rust',
    'Swift',
    'Kotlin',
    'TypeScript',
    'Scala',
    'R',
    'MATLAB',
    'Shell',
    'Bash',
    'PowerShell',

    // Web Technologies
    'HTML',
    'CSS',
    'React',
    'Angular',
    'Vue.js',
    'Node.js',
    'Express',
    'Next.js',
    'Nuxt.js',
    'jQuery',
    'Bootstrap',
    'Tailwind',
    'SASS',
    'LESS',

    // Mobile Development
    'React Native',
    'Flutter',
    'Xamarin',
    'Ionic',
    'Cordova',

    // Databases
    'SQL',
    'MySQL',
    'PostgreSQL',
    'MongoDB',
    'Redis',
    'Elasticsearch',
    'Cassandra',
    'Oracle',
    'SQL Server',
    'SQLite',
    'DynamoDB',
    'Firestore',

    // Cloud Platforms & DevOps
    'AWS',
    'Azure',
    'Google Cloud',
    'GCP',
    'Digital Ocean',
    'Heroku',
    'Vercel',
    'Netlify',
    'Docker',
    'Kubernetes',
    'Jenkins',
    'GitLab CI',
    'GitHub Actions',
    'CircleCI',
    'Travis CI',
    'Terraform',
    'Ansible',
    'Chef',
    'Puppet',
    'Vagrant',
    'Helm',
    'Istio',

    // Monitoring & Logging
    'Prometheus',
    'Grafana',
    'ELK Stack',
    'Splunk',
    'New Relic',
    'Datadog',
    'Nagios',

    // Version Control & Collaboration
    'Git',
    'GitHub',
    'GitLab',
    'Bitbucket',
    'SVN',
    'Mercurial',

    // Operating Systems
    'Linux',
    'Ubuntu',
    'CentOS',
    'RHEL',
    'Windows',
    'macOS',
    'Unix',

    // Frameworks & Libraries
    'Spring',
    'Django',
    'Flask',
    'Laravel',
    'Rails',
    '.NET',
    'ASP.NET',
    'TensorFlow',
    'PyTorch',
    'Scikit-learn',
    'Pandas',
    'NumPy',

    // Testing
    'Jest',
    'Cypress',
    'Selenium',
    'JUnit',
    'pytest',
    'Mocha',
    'Chai',

    // Project Management & Methodologies
    'Agile',
    'Scrum',
    'Kanban',
    'JIRA',
    'Confluence',
    'Trello',
    'Asana',
  ];

  commonSkills.forEach(skill => {
    // Escape special regex characters in skill names
    const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escapedSkill, 'i').test(content)) {
      analysis.skills.push(skill);
    }
  });

  // Extract work experience
  const _experiencePatterns = [
    /(?:work experience|professional experience|experience|employment history|career history)[\s\S]*?(?=education|skills|projects|certifications|$)/i,
    /(?:^|\n)\s*([a-zA-Z\s&.,'-]+)\s*[-–—]\s*([a-zA-Z\s&.,'-]+)\s*(?:\n|\r|$)[\s\S]*?(?=\n\s*[A-Z][a-zA-Z\s&.,'-]*\s*[-–—]|education|skills|projects|certifications|$)/gm,
  ];

  const companies = [];
  const positions = [];
  let totalExperience = 0;

  // Look for company names and positions
  const companyMatches = content.match(/(?:at|@)\s+([A-Z][a-zA-Z\s&.,'-]{2,30})(?:\s|$|,|\.)/g);
  if (companyMatches) {
    companyMatches.forEach(match => {
      const company = match.replace(/^(?:at|@)\s+/, '').trim();
      if (company && !companies.includes(company)) {
        companies.push(company);
      }
    });
  }

  // Look for job titles
  const titlePatterns = [
    /(?:software engineer|developer|programmer|analyst|manager|director|lead|senior|junior|intern|consultant|specialist|architect|designer)/i,
  ];

  titlePatterns.forEach(pattern => {
    const matches = content.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      matches.forEach(match => {
        if (!positions.includes(match)) {
          positions.push(match);
        }
      });
    }
  });

  // Estimate total experience from years mentioned
  const yearMatches = content.match(
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/gi
  );
  if (yearMatches) {
    yearMatches.forEach(match => {
      const years = parseInt(match.match(/\d{1,2}/)[0]);
      if (years > totalExperience) {
        totalExperience = years;
      }
    });
  }

  analysis.experience = positions.map(position => ({ title: position }));
  analysis.companies = companies;
  analysis.totalExperienceYears = totalExperience;

  // Extract education
  const educationKeywords = [
    'Bachelor',
    'Master',
    'PhD',
    'Doctorate',
    'Associate',
    'Diploma',
    'B.S.',
    'B.A.',
    'M.S.',
    'M.A.',
    'MBA',
    'Computer Science',
    'Engineering',
    'University',
    'College',
    'Institute',
    'School',
  ];

  educationKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = content.match(regex);
    if (matches) {
      matches.forEach(match => {
        const existing = analysis.education.find(
          edu => edu.degree && edu.degree.toLowerCase().includes(match.toLowerCase())
        );
        if (!existing) {
          analysis.education.push({ degree: match, institution: '' });
        }
      });
    }
  });

  // Extract certifications
  const certificationKeywords = [
    'AWS Certified',
    'Microsoft Certified',
    'Google Cloud',
    'Azure',
    'Kubernetes',
    'PMP',
    'Agile',
    'Scrum Master',
    'CISSP',
    'CompTIA',
    'Cisco',
    'Oracle Certified',
    'Salesforce',
    'Docker',
    'Jenkins',
    'Certificate',
    'Certification',
  ];

  certificationKeywords.forEach(cert => {
    const regex = new RegExp(`\\b${cert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(content)) {
      const existing = analysis.certifications.find(
        c => c.name && c.name.toLowerCase().includes(cert.toLowerCase())
      );
      if (!existing) {
        analysis.certifications.push({ name: cert, issuer: '' });
      }
    }
  });

  // Extract projects
  const projectIndicators = [
    'project',
    'built',
    'developed',
    'created',
    'implemented',
    'designed',
    'github.com/',
    'repository',
    'portfolio',
    'demo',
  ];

  const lines = content.split('\n');
  lines.forEach(line => {
    projectIndicators.forEach(indicator => {
      if (
        line.toLowerCase().includes(indicator.toLowerCase()) &&
        line.length > 20 &&
        line.length < 200
      ) {
        const existing = analysis.projects.find(p => p.name && p.name === line.trim());
        if (!existing && analysis.projects.length < 10) {
          // Limit to 10 projects
          analysis.projects.push({ name: line.trim(), description: '' });
        }
      }
    });
  });

  return analysis;
}

// Upload resume
router.post(
  '/upload',
  authenticateToken,
  userRateLimit(5, 60000), // 5 uploads per minute
  upload.single('resume'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          code: 'NO_FILE',
        });
      }

      const { originalname, filename, path: filePath, size } = req.file;

      // Extract text content from file
      let content;
      try {
        content = await extractTextFromFile(filePath, originalname);
      } catch (error) {
        // Clean up uploaded file if text extraction fails
        await fs.unlink(filePath).catch(() => {});
        return res.status(400).json({
          error: 'Failed to process file',
          code: 'FILE_PROCESSING_ERROR',
          details: error.message,
        });
      }

      // Analyze resume content
      const analysis = analyzeResume(content);

      // Check if user already has the maximum number of resumes (e.g., 5)
      const database = getDatabase();
      const existingResumesQuery = 'SELECT COUNT(*) as count FROM user_resumes WHERE user_id = $1';
      const existingResumesResult = await database.query(existingResumesQuery, [req.user.id]);
      const resumeCount = parseInt(existingResumesResult.rows[0].count);

      const maxResumes = 5;
      if (resumeCount >= maxResumes) {
        // Clean up uploaded file
        await fs.unlink(filePath).catch(() => {});
        return res.status(400).json({
          error: `Maximum of ${maxResumes} resumes allowed`,
          code: 'MAX_RESUMES_EXCEEDED',
          current: resumeCount,
          maximum: maxResumes,
        });
      }

      // Save resume to database
      const resumeId = uuidv4();
      const insertResumeQuery = `
        INSERT INTO user_resumes (
          id, user_id, file_name, original_filename, file_path, 
          parsed_content, file_size_bytes, skills, experience, education,
          certifications, projects, total_experience_years, parsing_status, parsed_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
        RETURNING id, file_name, original_filename, file_size_bytes, created_at
      `;

      const resumeResult = await database.query(insertResumeQuery, [
        resumeId,
        req.user.id,
        filename,
        originalname,
        filePath,
        content,
        size,
        JSON.stringify(analysis.skills), // Store skills as JSONB
        JSON.stringify(analysis.experience), // Store experience as JSONB
        JSON.stringify(analysis.education), // Store education as JSONB
        JSON.stringify(analysis.certifications), // Store certifications as JSONB
        JSON.stringify(analysis.projects), // Store projects as JSONB
        analysis.totalExperienceYears, // Store total experience years
        'completed', // parsing status
        new Date(), // parsed_at timestamp
      ]);

      const resume = resumeResult.rows[0];

      res.status(201).json({
        message: 'Resume uploaded successfully',
        resume: {
          id: resume.id,
          filename: resume.original_filename,
          fileSize: resume.file_size_bytes,
          wordCount: analysis.wordCount,
          sectionsFound: analysis.sections,
          skillsFound: analysis.skills,
          experience: analysis.experience,
          education: analysis.education,
          certifications: analysis.certifications,
          projects: analysis.projects,
          totalExperienceYears: analysis.totalExperienceYears,
          createdAt: resume.created_at,
        },
      });
    } catch (error) {
      // Clean up uploaded file in case of error
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      logError(error, { endpoint: 'resumes/upload', userId: req.user?.id });

      if (error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'File too large',
          code: 'FILE_TOO_LARGE',
          maxSize: '10MB',
        });
      } else if (error.message.includes('Invalid file type')) {
        res.status(400).json({
          error: error.message,
          code: 'INVALID_FILE_TYPE',
        });
      } else {
        res.status(500).json({
          error: 'Failed to upload resume',
          code: 'UPLOAD_ERROR',
        });
      }
    }
  }
);

// Get user's resumes
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Validate sort parameters
    const allowedSortFields = ['created_at', 'original_filename', 'file_size_bytes'];
    const allowedSortOrders = ['asc', 'desc'];

    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const finalSortOrder = allowedSortOrders.includes(sortOrder.toLowerCase())
      ? sortOrder.toLowerCase()
      : 'desc';

    // Get resumes
    const database = getDatabase();
    const resumesQuery = `
        SELECT 
          id, 
          COALESCE(original_filename, file_name) as original_filename, 
          file_size_bytes, 
          parsed_content, 
          skills, 
          experience, 
          education,
          certifications, 
          projects, 
          total_experience_years, 
          COALESCE(parsing_status, 'pending') as parsing_status, 
          created_at, 
          updated_at
        FROM user_resumes 
        WHERE user_id = $1
        ORDER BY ${finalSortBy} ${finalSortOrder}
        LIMIT $2 OFFSET $3
      `;

    const resumesResult = await database.query(resumesQuery, [req.user.id, parseInt(limit), offset]);

    // Get total count
    const countQuery = 'SELECT COUNT(*) as total FROM user_resumes WHERE user_id = $1';
    const countResult = await database.query(countQuery, [req.user.id]);

    const totalResumes = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalResumes / parseInt(limit));

    res.json({
      resumes: resumesResult.rows.map(resume => {
        const skills = Array.isArray(resume.skills) ? resume.skills : [];
        const experience = Array.isArray(resume.experience) ? resume.experience : [];
        const education = Array.isArray(resume.education) ? resume.education : [];
        const certifications = Array.isArray(resume.certifications) ? resume.certifications : [];
        const projects = Array.isArray(resume.projects) ? resume.projects : [];

        // Calculate word count from parsed content if available
        let wordCount = 0;
        if (resume.parsed_content && typeof resume.parsed_content === 'string') {
          wordCount = resume.parsed_content.split(/\s+/).filter(word => word.length > 0).length;
        }

        // Derive sections from available data AND content analysis
        const sectionsFound = [];
        if (skills.length > 0) sectionsFound.push('skills');
        if (experience.length > 0) sectionsFound.push('experience');
        if (education.length > 0) sectionsFound.push('education');
        if (certifications.length > 0) sectionsFound.push('certifications');
        if (projects.length > 0) sectionsFound.push('projects');

        // Also check content for sections
        if (resume.parsed_content && typeof resume.parsed_content === 'string') {
          const content = resume.parsed_content.toLowerCase();

          // Check for additional sections in content
          if (
            !sectionsFound.includes('summary') &&
            /(?:summary|objective|profile|about|overview)/i.test(content)
          ) {
            sectionsFound.push('summary');
          }
          if (
            !sectionsFound.includes('contact') &&
            /(?:contact|phone|email|@|\+\d|linkedin)/i.test(content)
          ) {
            sectionsFound.push('contact');
          }
          if (
            !sectionsFound.includes('experience') &&
            /(?:experience|work|employment|professional)/i.test(content)
          ) {
            sectionsFound.push('experience');
          }
          if (
            !sectionsFound.includes('education') &&
            /(?:education|university|college|degree|bachelor|master)/i.test(content)
          ) {
            sectionsFound.push('education');
          }
          if (
            !sectionsFound.includes('skills') &&
            /(?:skills|technologies|programming|technical)/i.test(content)
          ) {
            sectionsFound.push('skills');
          }
          if (
            !sectionsFound.includes('projects') &&
            /(?:projects|built|developed|created|portfolio)/i.test(content)
          ) {
            sectionsFound.push('projects');
          }
          if (
            !sectionsFound.includes('certifications') &&
            /(?:certification|certificate|certified|aws|microsoft)/i.test(content)
          ) {
            sectionsFound.push('certifications');
          }
        }

        return {
          id: resume.id,
          filename: resume.original_filename,
          fileSize: resume.file_size_bytes,
          fileSizeFormatted: `${(resume.file_size_bytes / 1024).toFixed(1)} KB`,
          wordCount: wordCount,
          sectionsFound: sectionsFound,
          skillsFound: skills,
          experience: experience,
          education: education,
          certifications: certifications,
          projects: projects,
          totalExperienceYears: resume.total_experience_years || 0,
          parsingStatus: resume.parsing_status,
          createdAt: resume.created_at,
          updatedAt: resume.updated_at,
        };
      }),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalResumes,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    logError(error, { endpoint: 'resumes/list', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to get resumes',
      code: 'RESUMES_LIST_ERROR',
    });
  }
});

// Get resume details
router.get('/:resumeId', authenticateToken, [param('resumeId').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { resumeId } = req.params;
    const { includeContent = 'false' } = req.query;

    // Always fetch parsed_content for calculations, but only return it to client if requested
    const selectFields = `
        id, 
        COALESCE(original_filename, file_name) as original_filename, 
        file_size_bytes, 
        parsed_content, 
        skills, 
        experience, 
        education, 
        certifications, 
        projects, 
        total_experience_years, 
        COALESCE(parsing_status, 'pending') as parsing_status, 
        created_at, 
        updated_at
      `;

    const resumeQuery = `
        SELECT ${selectFields}
        FROM user_resumes 
        WHERE id = $1 AND user_id = $2
      `;

    const database = getDatabase();

    const resumeResult = await database.query(resumeQuery, [resumeId, req.user.id]);

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    const resume = resumeResult.rows[0];
    const skills = Array.isArray(resume.skills) ? resume.skills : [];
    const experience = Array.isArray(resume.experience) ? resume.experience : [];
    const education = Array.isArray(resume.education) ? resume.education : [];
    const certifications = Array.isArray(resume.certifications) ? resume.certifications : [];
    const projects = Array.isArray(resume.projects) ? resume.projects : [];

    // Calculate word count from parsed content
    const wordCount = resume.parsed_content
      ? resume.parsed_content.split(/\s+/).filter(word => word.length > 0).length
      : 0;

    // Derive sections from available data
    const sectionsFound = [];
    if (skills.length > 0) sectionsFound.push('skills');
    if (experience.length > 0) sectionsFound.push('experience');
    if (education.length > 0) sectionsFound.push('education');
    if (certifications.length > 0) sectionsFound.push('certifications');
    if (projects.length > 0) sectionsFound.push('projects');
    if (resume.parsed_content && resume.parsed_content.toLowerCase().includes('summary')) {
      sectionsFound.push('summary');
    }
    if (resume.parsed_content && /(?:contact|phone|email|address)/i.test(resume.parsed_content)) {
      sectionsFound.push('contact');
    }

    const response = {
      id: resume.id,
      filename: resume.original_filename,
      fileSize: resume.file_size_bytes,
      fileSizeFormatted: `${(resume.file_size_bytes / 1024).toFixed(1)} KB`,
      wordCount: wordCount,
      sectionsFound: sectionsFound,
      skillsFound: skills,
      experience: experience,
      education: education,
      certifications: certifications,
      projects: projects,
      totalExperienceYears: resume.total_experience_years || 0,
      parsingStatus: resume.parsing_status,
      analysis: {
        skills: skills,
        experience: experience,
        education: education,
        certifications: certifications,
        projects: projects,
        totalExperienceYears: resume.total_experience_years || 0,
        wordCount: wordCount,
        sectionsFound: sectionsFound,
      },
      createdAt: resume.created_at,
      updatedAt: resume.updated_at,
    };

    if (includeContent === 'true') {
      response.content = resume.parsed_content;
    }

    res.json({ resume: response });
  } catch (error) {
    logError(error, {
      endpoint: 'resumes/get',
      userId: req.user?.id,
      resumeId: req.params.resumeId,
    });
    res.status(500).json({
      error: 'Failed to get resume',
      code: 'RESUME_GET_ERROR',
    });
  }
});

// Update resume metadata
router.put('/:resumeId', authenticateToken, updateResumeValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { resumeId } = req.params;
    const { filename, content } = req.body;

    const database = getDatabase();

    // Check if resume exists and belongs to user
    const existingResumeQuery = 'SELECT * FROM user_resumes WHERE id = $1 AND user_id = $2';
    const existingResumeResult = await database.query(existingResumeQuery, [resumeId, req.user.id]);

    if (existingResumeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    // Build update query
    const updateFields = ['updated_at = CURRENT_TIMESTAMP'];
    const updateValues = [];
    let paramIndex = 1;

    if (filename) {
      updateFields.push(`original_filename = $${paramIndex++}`);
      updateValues.push(filename);
    }

    let newAnalysis;
    if (content) {
      updateFields.push(`content = $${paramIndex++}`);
      updateValues.push(content);

      // Re-analyze content if it's updated
      newAnalysis = analyzeResume(content);
      updateFields.push(`analysis = $${paramIndex++}`);
      updateValues.push(JSON.stringify(newAnalysis));
    }

    // Update resume
    const updateQuery = `
        UPDATE user_resumes 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
        RETURNING id, original_filename, file_size, analysis, updated_at
      `;
    updateValues.push(resumeId, req.user.id);

    const updatedResult = await database.query(updateQuery, updateValues);
    const updatedResume = updatedResult.rows[0];

    const analysis =
      newAnalysis ||
      (typeof updatedResume.analysis === 'string'
        ? JSON.parse(updatedResume.analysis)
        : updatedResume.analysis);

    res.json({
      message: 'Resume updated successfully',
      resume: {
        id: updatedResume.id,
        filename: updatedResume.original_filename,
        fileSize: updatedResume.file_size,
        fileSizeFormatted: `${(updatedResume.file_size / 1024).toFixed(1)} KB`,
        wordCount: analysis?.wordCount || 0,
        sectionsFound: analysis?.sections || [],
        skillsFound: analysis?.skills || [],
        updatedAt: updatedResume.updated_at,
      },
    });
  } catch (error) {
    logError(error, {
      endpoint: 'resumes/update',
      userId: req.user?.id,
      resumeId: req.params.resumeId,
    });
    res.status(500).json({
      error: 'Failed to update resume',
      code: 'RESUME_UPDATE_ERROR',
    });
  }
});

// Delete resume
router.delete('/:resumeId', authenticateToken, [param('resumeId').isUUID()], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array(),
      });
    }

    const { resumeId } = req.params;

    const database = getDatabase();

    // Get resume details before deletion
    const resumeQuery = 'SELECT file_path FROM user_resumes WHERE id = $1 AND user_id = $2';
    const resumeResult = await database.query(resumeQuery, [resumeId, req.user.id]);

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Resume not found',
        code: 'RESUME_NOT_FOUND',
      });
    }

    const filePath = resumeResult.rows[0].file_path;

    // Check if resume is being used in any sessions
    const sessionsQuery = 'SELECT COUNT(*) as count FROM sessions WHERE resume_id = $1';
    const sessionsResult = await database.query(sessionsQuery, [resumeId]);
    const sessionCount = parseInt(sessionsResult.rows[0].count);

    if (sessionCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete resume that is used in interview sessions',
        code: 'RESUME_IN_USE',
        sessionCount,
      });
    }

    // Delete resume from database
    await database.query('DELETE FROM user_resumes WHERE id = $1 AND user_id = $2', [
      resumeId,
      req.user.id,
    ]);

    // Delete physical file
    try {
      await fs.unlink(filePath);
    } catch (fileError) {
      // Log error but don't fail the request if file deletion fails
      logError(fileError, { context: 'file deletion', filePath, resumeId });
    }

    res.json({
      message: 'Resume deleted successfully',
    });
  } catch (error) {
    logError(error, {
      endpoint: 'resumes/delete',
      userId: req.user?.id,
      resumeId: req.params.resumeId,
    });
    res.status(500).json({
      error: 'Failed to delete resume',
      code: 'RESUME_DELETE_ERROR',
    });
  }
});

// Re-analyze resume
router.post(
  '/:resumeId/analyze',
  authenticateToken,
  [param('resumeId').isUUID()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array(),
        });
      }

      const { resumeId } = req.params;

      const database = getDatabase();

      // Get resume content
      const resumeQuery =
        'SELECT COALESCE(parsed_content, content) as content FROM user_resumes WHERE id = $1 AND user_id = $2';
      const resumeResult = await database.query(resumeQuery, [resumeId, req.user.id]);

      if (resumeResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Resume not found',
          code: 'RESUME_NOT_FOUND',
        });
      }

      const content = resumeResult.rows[0].content;

      if (!content) {
        return res.status(400).json({
          error: 'No content available to analyze',
          code: 'NO_CONTENT',
        });
      }

      // Re-analyze content
      const analysis = analyzeResume(content);

      // Update analysis in database - Update all extracted fields
      await database.query(
        `UPDATE user_resumes SET 
         skills = $1, experience = $2, education = $3, certifications = $4, 
         projects = $5, total_experience_years = $6, parsing_status = 'completed', 
         parsed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $7 AND user_id = $8`,
        [
          JSON.stringify(analysis.skills),
          JSON.stringify(analysis.experience),
          JSON.stringify(analysis.education),
          JSON.stringify(analysis.certifications),
          JSON.stringify(analysis.projects),
          analysis.totalExperienceYears,
          resumeId,
          req.user.id,
        ]
      );

      res.json({
        message: 'Resume analyzed successfully',
        analysis: {
          wordCount: analysis.wordCount,
          sectionsFound: analysis.sections,
          skillsFound: analysis.skills,
          experience: analysis.experience,
          education: analysis.education,
          certifications: analysis.certifications,
          projects: analysis.projects,
          totalExperienceYears: analysis.totalExperienceYears,
        },
      });
    } catch (error) {
      logError(error, {
        endpoint: 'resumes/analyze',
        userId: req.user?.id,
        resumeId: req.params.resumeId,
      });
      res.status(500).json({
        error: 'Failed to analyze resume',
        code: 'RESUME_ANALYZE_ERROR',
      });
    }
  }
);

// Fix existing resumes route
router.post('/fix-existing', authenticateToken, async (req, res) => {
  try {
    const database = getDatabase();

    console.log('🔍 Finding resumes that need re-analysis...');

    // Get resumes that have content but missing structured data
    const resumesToFix = await database.query(
      `
        SELECT 
          id, 
          COALESCE(original_filename, file_name) as filename,
          parsed_content as content,
          analysis
        FROM user_resumes 
        WHERE user_id = $1
        AND (parsed_content IS NOT NULL AND parsed_content != '')
      `,
      [req.user.id]
    );

    console.log(`Found ${resumesToFix.rows.length} resumes to process`);

    const results = [];

    for (const resume of resumesToFix.rows) {
      console.log(`📄 Processing: ${resume.filename}`);

      if (!resume.content) {
        console.log('  ⚠️  No content found, skipping');
        continue;
      }

      // Re-analyze the content
      const analysis = analyzeResume(resume.content);

      console.log(`  - Skills: ${analysis.skills.length}`);
      console.log(`  - Experience: ${analysis.experience.length}`);
      console.log(`  - Education: ${analysis.education.length}`);
      console.log(`  - Projects: ${analysis.projects.length}`);
      console.log(`  - Word Count: ${analysis.wordCount}`);

      // Update the resume with new analysis
      try {
        await database.query(
          `
            UPDATE user_resumes SET
              skills = $1,
              experience = $2, 
              education = $3,
              certifications = $4,
              projects = $5,
              total_experience_years = $6,
              parsing_status = 'completed',
              parsed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $7 AND user_id = $8
          `,
          [
            JSON.stringify(analysis.skills),
            JSON.stringify(analysis.experience),
            JSON.stringify(analysis.education),
            JSON.stringify(analysis.certifications),
            JSON.stringify(analysis.projects),
            analysis.totalExperienceYears,
            resume.id,
            req.user.id,
          ]
        );

        results.push({
          id: resume.id,
          filename: resume.filename,
          status: 'success',
          analysis: {
            skills: analysis.skills.length,
            experience: analysis.experience.length,
            education: analysis.education.length,
            certifications: analysis.certifications.length,
            projects: analysis.projects.length,
            wordCount: analysis.wordCount,
            totalExperienceYears: analysis.totalExperienceYears,
          },
        });

        console.log(`  ✅ Updated successfully`);
      } catch (updateError) {
        console.error(`  ❌ Failed to update: ${updateError.message}`);
        results.push({
          id: resume.id,
          filename: resume.filename,
          status: 'error',
          error: updateError.message,
        });
      }
    }

    res.json({
      message: `Re-analyzed ${results.length} resumes`,
      results: results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
      },
    });
  } catch (error) {
    console.error('❌ Error fixing resumes:', error);
    logError(error, { endpoint: 'resumes/fix-existing', userId: req.user?.id });
    res.status(500).json({
      error: 'Failed to fix existing resumes',
      details: error.message,
      code: 'FIX_RESUMES_ERROR',
    });
  }
});

export default router;
