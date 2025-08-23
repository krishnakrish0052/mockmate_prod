import express from 'express';
import { body, param, validationResult } from 'express-validator';
import UserProfile from '../models/UserProfile.js';
import { cache } from '../config/redis.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../config/logger.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/user-profile
 * Get user profile data
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Try cache first
    const cacheKey = `user_profile:${userId}`;
    let profile = await cache.get(cacheKey);
    
    if (!profile) {
      profile = await UserProfile.findByUserId(userId);
      if (profile) {
        await cache.set(cacheKey, profile, 300); // Cache for 5 minutes
      }
    }
    
    res.json({
      success: true,
      data: profile,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch user profile'
    });
  }
});

/**
 * POST /api/user-profile
 * Create or update user profile
 */
router.post('/', [
  body('jobTitle')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Job title is required and must be less than 255 characters'),
  
  body('jobDescription')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Job description must be less than 2000 characters'),
    
  body('industry')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Industry is required and must be less than 100 characters'),
    
  body('yearsOfExperience')
    .isInt({ min: 0, max: 50 })
    .withMessage('Years of experience must be a number between 0 and 50'),
    
  body('skillLevel')
    .isIn(['entry', 'junior', 'mid', 'senior', 'lead', 'executive'])
    .withMessage('Skill level must be one of: entry, junior, mid, senior, lead, executive'),
    
  body('preferredSessionType')
    .optional()
    .isIn(['behavioral', 'technical', 'case_study', 'system_design', 'mixed'])
    .withMessage('Session type must be one of: behavioral, technical, case_study, system_design, mixed'),
    
  body('preferredDifficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be one of: easy, medium, hard'),
    
  body('preferredDuration')
    .optional()
    .isIn([15, 30, 45, 60, 90])
    .withMessage('Duration must be one of: 15, 30, 45, 60, 90 minutes'),
    
  body('resumeData')
    .optional()
    .isLength({ max: 10000 })
    .withMessage('Resume data must be less than 10,000 characters'),
    
  body('skills')
    .optional()
    .isArray({ max: 50 })
    .withMessage('Skills must be an array with maximum 50 items'),
    
  body('careerGoals')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Career goals must be less than 1000 characters'),
    
  body('weaknessAreas')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Weakness areas must be an array with maximum 20 items')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: errors.array()
      });
    }
    
    const userId = req.user.id;
    const profileData = {
      userId,
      jobTitle: req.body.jobTitle,
      jobDescription: req.body.jobDescription,
      industry: req.body.industry,
      yearsOfExperience: req.body.yearsOfExperience,
      skillLevel: req.body.skillLevel,
      preferredSessionType: req.body.preferredSessionType,
      preferredDifficulty: req.body.preferredDifficulty,
      preferredDuration: req.body.preferredDuration,
      resumeData: req.body.resumeData,
      skills: req.body.skills || [],
      careerGoals: req.body.careerGoals,
      weaknessAreas: req.body.weaknessAreas || []
    };
    
    // Check if profile exists
    let profile = await UserProfile.findByUserId(userId);
    
    if (profile) {
      // Update existing profile
      profile = await UserProfile.update(profile.id, profileData);
    } else {
      // Create new profile
      profile = await UserProfile.create(profileData);
    }
    
    // Clear cache
    const cacheKey = `user_profile:${userId}`;
    await cache.del(cacheKey);
    
    res.status(profile ? 200 : 201).json({
      success: true,
      data: profile,
      message: profile ? 'Profile updated successfully' : 'Profile created successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error creating/updating user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to save user profile'
    });
  }
});

/**
 * GET /api/user-profile/completion-tips
 * Get personalized tips for completing user profile
 */
router.get('/completion-tips', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user profile
    const profile = await UserProfile.findByUserId(userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: {
          tips: [
            'Start by adding your job title and industry',
            'Include your years of experience',
            'Set your preferred interview session type',
            'Add your key skills',
            'Include your career goals'
          ],
          completionScore: 0,
          completionPercentage: 0
        }
      });
    }
    
    const tips = UserProfile.getCompletionTips(profile);
    const completionScore = UserProfile.calculateCompletionScore(profile);
    
    res.json({
      success: true,
      data: {
        tips,
        completionScore,
        completionPercentage: Math.round((completionScore / 100) * 100)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error getting completion tips:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get completion tips'
    });
  }
});

/**
 * GET /api/user-profile/completion-score
 * Get user profile completion score
 */
router.get('/completion-score', async (req, res) => {
  try {
    const userId = req.user.id;
    
    const profile = await UserProfile.findByUserId(userId);
    
    if (!profile) {
      return res.json({
        success: true,
        data: {
          score: 0,
          percentage: 0,
          isComplete: false
        }
      });
    }
    
    const score = UserProfile.calculateCompletionScore(profile);
    const isComplete = UserProfile.isProfileComplete(profile);
    
    res.json({
      success: true,
      data: {
        score,
        percentage: Math.round((score / 100) * 100),
        isComplete
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error calculating completion score:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to calculate completion score'
    });
  }
});

export default router;
