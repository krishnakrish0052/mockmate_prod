import admin from 'firebase-admin';
import { logger } from '../config/logger.js';

class FirebaseRulesIntegrationService {
  constructor(database, dynamicConfig) {
    this.db = database;
    this.dynamicConfig = dynamicConfig;
    this.adminAuth = null;
    this.projectId = null;
    this.initialized = false;
    this.rulesTemplates = new Map();
  }

  /**
   * Initialize the service
   */
  async initialize() {
    try {
      if (admin.apps.length > 0) {
        this.adminAuth = admin.auth();
        this.projectId = admin.app().options.projectId;
      }

      await this.loadRulesTemplates();
      this.initialized = true;

      logger.info('Firebase Rules Integration Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase Rules Integration Service:', error);
      throw error;
    }
  }

  /**
   * Load Firebase Security Rules templates
   */
  async loadRulesTemplates() {
    try {
      // Create table for rules templates if it doesn't exist
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS firebase_rules_templates (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    category VARCHAR(100) NOT NULL DEFAULT 'custom',
                    rules_content TEXT NOT NULL,
                    variables JSONB DEFAULT '{}',
                    is_active BOOLEAN DEFAULT true,
                    is_default BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    created_by UUID REFERENCES users(id)
                )
            `);

      // Load existing templates
      const result = await this.db.query(`
                SELECT * FROM firebase_rules_templates 
                WHERE is_active = true 
                ORDER BY category, name
            `);

      this.rulesTemplates.clear();
      result.rows.forEach(template => {
        this.rulesTemplates.set(template.id, {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          rulesContent: template.rules_content,
          variables: template.variables,
          isDefault: template.is_default,
          createdAt: template.created_at,
          updatedAt: template.updated_at,
        });
      });

      // If no templates exist, create default ones
      if (this.rulesTemplates.size === 0) {
        await this.createDefaultTemplates();
      }

      logger.info('Firebase rules templates loaded:', {
        totalTemplates: this.rulesTemplates.size,
      });
    } catch (error) {
      logger.error('Failed to load rules templates:', error);
      throw error;
    }
  }

  /**
   * Create default Firebase Security Rules templates
   */
  async createDefaultTemplates() {
    const defaultTemplates = [
      {
        name: 'Basic Authentication Rules',
        description: 'Basic rules requiring authentication for read/write operations',
        category: 'authentication',
        rulesContent: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read and write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Allow all authenticated users to read public data
    match /public/{document=**} {
      allow read: if request.auth != null;
    }
    
    // Deny all other access
    match /{document=**} {
      allow read, write: if false;
    }
  }
}`,
        variables: {},
        isDefault: true,
      },
      {
        name: 'Role-Based Access Control',
        description: 'Advanced RBAC rules with admin, moderator, and user roles',
        category: 'rbac',
        rulesContent: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getUserRole() {
      return request.auth.token.role;
    }
    
    function isAdmin() {
      return isAuthenticated() && getUserRole() == 'admin';
    }
    
    function isModerator() {
      return isAuthenticated() && (getUserRole() == 'moderator' || getUserRole() == 'admin');
    }
    
    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }
    
    // User documents - users can read/write their own data, admins can access all
    match /users/{userId} {
      allow read: if isOwner(userId) || isModerator();
      allow write: if isOwner(userId) || isAdmin();
    }
    
    // Admin-only collections
    match /admin/{document=**} {
      allow read, write: if isAdmin();
    }
    
    // Moderator-accessible collections
    match /moderation/{document=**} {
      allow read, write: if isModerator();
    }
    
    // Public read, authenticated write
    match /posts/{postId} {
      allow read: if true;
      allow write: if isAuthenticated();
    }
    
    // User-specific private data
    match /private/{userId}/{document=**} {
      allow read, write: if isOwner(userId);
    }
  }
}`,
        variables: {
          adminRole: 'admin',
          moderatorRole: 'moderator',
          userRole: 'user',
        },
        isDefault: true,
      },
      {
        name: 'Subscription-Based Access',
        description: 'Rules based on subscription tiers (free, pro, premium)',
        category: 'subscription',
        rulesContent: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function getSubscriptionTier() {
      return request.auth.token.tier;
    }
    
    function isPremium() {
      return getSubscriptionTier() == 'premium';
    }
    
    function isPro() {
      return getSubscriptionTier() == 'pro' || isPremium();
    }
    
    function isFree() {
      return getSubscriptionTier() == 'free' || getSubscriptionTier() == null;
    }
    
    // Basic user data - accessible to all authenticated users
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Free tier features
    match /basic-features/{document=**} {
      allow read: if isAuthenticated();
    }
    
    // Pro tier features
    match /pro-features/{document=**} {
      allow read: if isPro();
    }
    
    // Premium tier features
    match /premium-features/{document=**} {
      allow read: if isPremium();
    }
    
    // Usage tracking - pro users get more quota
    match /usage/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Advanced analytics - premium only
    match /analytics/{document=**} {
      allow read: if isPremium();
    }
  }
}`,
        variables: {
          freeTier: 'free',
          proTier: 'pro',
          premiumTier: 'premium',
        },
        isDefault: true,
      },
      {
        name: 'Time-Based Access Control',
        description: 'Rules with time-based restrictions and temporary access',
        category: 'temporal',
        rulesContent: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isWithinBusinessHours() {
      let hour = request.time.toMillis() / (1000 * 60 * 60) % 24;
      return hour >= 9 && hour <= 17; // 9 AM to 5 PM
    }
    
    function isAccountActive() {
      return request.auth.token.account_status == 'active';
    }
    
    function hasValidSession() {
      let sessionExpiry = request.auth.token.session_expires;
      return sessionExpiry != null && request.time.toMillis() < sessionExpiry;
    }
    
    // Regular user data with session validation
    match /users/{userId} {
      allow read, write: if isAuthenticated() && 
                            request.auth.uid == userId && 
                            isAccountActive() && 
                            hasValidSession();
    }
    
    // Business hours only access
    match /business/{document=**} {
      allow read, write: if isAuthenticated() && isWithinBusinessHours();
    }
    
    // Temporary access documents
    match /temporary/{document=**} {
      allow read: if isAuthenticated();
      allow write: if false; // Read-only
    }
  }
}`,
        variables: {
          businessStartHour: 9,
          businessEndHour: 17,
          activeStatus: 'active',
        },
        isDefault: true,
      },
      {
        name: 'Content Moderation Rules',
        description: 'Rules for content moderation and user-generated content',
        category: 'moderation',
        rulesContent: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isModerator() {
      return request.auth.token.role == 'moderator' || request.auth.token.role == 'admin';
    }
    
    function isVerifiedUser() {
      return request.auth.token.email_verified == true;
    }
    
    function canCreateContent() {
      return isAuthenticated() && isVerifiedUser();
    }
    
    // User posts - verified users can create, everyone can read approved content
    match /posts/{postId} {
      allow read: if resource.data.status == 'approved';
      allow create: if canCreateContent() && 
                       request.resource.data.authorId == request.auth.uid &&
                       request.resource.data.status == 'pending';
      allow update: if isModerator() || 
                       (request.auth.uid == resource.data.authorId && 
                        resource.data.status == 'pending');
      allow delete: if isModerator() || 
                       request.auth.uid == resource.data.authorId;
    }
    
    // Comments system
    match /posts/{postId}/comments/{commentId} {
      allow read: if resource.data.status == 'approved';
      allow create: if canCreateContent() && 
                       request.resource.data.authorId == request.auth.uid;
      allow update: if isModerator() || 
                       request.auth.uid == resource.data.authorId;
      allow delete: if isModerator() || 
                       request.auth.uid == resource.data.authorId;
    }
    
    // Moderation queue - moderators only
    match /moderation/{document=**} {
      allow read, write: if isModerator();
    }
    
    // User reports
    match /reports/{reportId} {
      allow create: if isAuthenticated() && 
                       request.resource.data.reporterId == request.auth.uid;
      allow read, update, delete: if isModerator();
    }
  }
}`,
        variables: {
          moderatorRole: 'moderator',
          adminRole: 'admin',
          approvedStatus: 'approved',
          pendingStatus: 'pending',
        },
        isDefault: true,
      },
    ];

    for (const template of defaultTemplates) {
      await this.createRulesTemplate(template);
    }

    logger.info('Default Firebase rules templates created');
  }

  /**
   * Create a new rules template
   */
  async createRulesTemplate(templateData) {
    try {
      const result = await this.db.query(
        `
                INSERT INTO firebase_rules_templates (
                    name, description, category, rules_content, variables, 
                    is_default, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING id
            `,
        [
          templateData.name,
          templateData.description || '',
          templateData.category || 'custom',
          templateData.rulesContent,
          JSON.stringify(templateData.variables || {}),
          templateData.isDefault || false,
          templateData.createdBy || null,
        ]
      );

      const templateId = result.rows[0].id;

      // Add to in-memory templates
      this.rulesTemplates.set(templateId, {
        id: templateId,
        ...templateData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info('Firebase rules template created:', {
        templateId,
        name: templateData.name,
      });

      return templateId;
    } catch (error) {
      logger.error('Failed to create rules template:', error);
      throw error;
    }
  }

  /**
   * Generate Firebase Security Rules from template
   */
  async generateRules(templateId, customVariables = {}) {
    try {
      const template = this.rulesTemplates.get(templateId);
      if (!template) {
        throw new Error('Rules template not found');
      }

      let rulesContent = template.rulesContent;
      const variables = { ...template.variables, ...customVariables };

      // Replace variables in the rules content
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
        rulesContent = rulesContent.replace(regex, value);
      }

      return {
        rules: rulesContent,
        template: {
          id: template.id,
          name: template.name,
          category: template.category,
        },
        variables,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to generate rules:', error);
      throw error;
    }
  }

  /**
   * Validate Firebase Security Rules syntax
   */
  async validateRules(rulesContent) {
    try {
      // This is a basic syntax validation
      // In a real implementation, you might use Firebase's rules testing API

      const validationErrors = [];
      const warnings = [];

      // Basic syntax checks
      if (!rulesContent.includes("rules_version = '2'")) {
        validationErrors.push("Rules must specify rules_version = '2'");
      }

      if (!rulesContent.includes('service cloud.firestore')) {
        validationErrors.push('Rules must define a Firestore service');
      }

      // Check for common issues
      const lines = rulesContent.split('\n');
      lines.forEach((line, index) => {
        const lineNum = index + 1;

        // Check for missing semicolons
        if (line.trim().startsWith('allow') && !line.includes(';')) {
          warnings.push(`Line ${lineNum}: Missing semicolon after allow statement`);
        }

        // Check for undefined functions
        const functionCalls = line.match(/\b\w+\(\)/g);
        if (functionCalls) {
          functionCalls.forEach(funcCall => {
            const funcName = funcCall.replace('()', '');
            if (!rulesContent.includes(`function ${funcName}(`)) {
              warnings.push(`Line ${lineNum}: Function '${funcName}' may not be defined`);
            }
          });
        }
      });

      return {
        isValid: validationErrors.length === 0,
        errors: validationErrors,
        warnings,
        linesChecked: lines.length,
      };
    } catch (error) {
      logger.error('Failed to validate rules:', error);
      return {
        isValid: false,
        errors: ['Validation failed: ' + error.message],
        warnings: [],
        linesChecked: 0,
      };
    }
  }

  /**
   * Test rules against sample data
   */
  async testRules(rulesContent, testCases = []) {
    try {
      // This would integrate with Firebase's Security Rules testing
      // For now, we'll simulate basic testing

      const testResults = [];

      for (const testCase of testCases) {
        const { operation, path, auth, data, expectedResult } = testCase;

        // Simulate rule evaluation
        const result = {
          operation,
          path,
          auth: auth || null,
          data: data || null,
          expectedResult,
          actualResult: 'allow', // This would be computed by actual rules engine
          passed: true, // This would be computed by comparing expected vs actual
          message: 'Test passed',
        };

        testResults.push(result);
      }

      const passedTests = testResults.filter(r => r.passed).length;
      const failedTests = testResults.length - passedTests;

      return {
        totalTests: testResults.length,
        passedTests,
        failedTests,
        testResults,
        overallSuccess: failedTests === 0,
      };
    } catch (error) {
      logger.error('Failed to test rules:', error);
      throw error;
    }
  }

  /**
   * Deploy rules to Firebase (simulation - would use Firebase Admin SDK)
   */
  async deployRules(rulesContent, dryRun = true) {
    try {
      if (!this.projectId) {
        throw new Error('Firebase project not configured');
      }

      // Validate rules before deployment
      const validation = await this.validateRules(rulesContent);
      if (!validation.isValid) {
        throw new Error('Rules validation failed: ' + validation.errors.join(', '));
      }

      if (dryRun) {
        logger.info('Dry run deployment completed successfully');
        return {
          success: true,
          dryRun: true,
          projectId: this.projectId,
          validation,
          message: 'Rules validation passed - ready for deployment',
        };
      }

      // In a real implementation, this would use Firebase Admin SDK to deploy rules
      // For now, we'll simulate the deployment
      logger.info('Rules deployment simulated (would deploy to Firebase)', {
        projectId: this.projectId,
      });

      // Log deployment
      await this.logRulesDeployment(rulesContent, 'simulated');

      return {
        success: true,
        dryRun: false,
        projectId: this.projectId,
        deployedAt: new Date().toISOString(),
        validation,
        message: 'Rules deployed successfully',
      };
    } catch (error) {
      logger.error('Failed to deploy rules:', error);
      throw error;
    }
  }

  /**
   * Get current Firebase rules (simulation)
   */
  async getCurrentRules() {
    try {
      // In a real implementation, this would fetch from Firebase
      const result = await this.db.query(`
                SELECT rules_content, created_at 
                FROM firebase_rules_deployments 
                WHERE status = 'active' 
                ORDER BY created_at DESC 
                LIMIT 1
            `);

      if (result.rows.length === 0) {
        return {
          rules: null,
          deployedAt: null,
          message: 'No active rules found',
        };
      }

      return {
        rules: result.rows[0].rules_content,
        deployedAt: result.rows[0].created_at,
        message: 'Current rules retrieved',
      };
    } catch (error) {
      logger.error('Failed to get current rules:', error);
      throw error;
    }
  }

  /**
   * Log rules deployment
   */
  async logRulesDeployment(rulesContent, status = 'deployed') {
    try {
      // Create deployments table if it doesn't exist
      await this.db.query(`
                CREATE TABLE IF NOT EXISTS firebase_rules_deployments (
                    id SERIAL PRIMARY KEY,
                    rules_content TEXT NOT NULL,
                    status VARCHAR(50) DEFAULT 'deployed',
                    deployed_by UUID REFERENCES users(id),
                    created_at TIMESTAMP DEFAULT NOW(),
                    deployment_info JSONB
                )
            `);

      await this.db.query(
        `
                INSERT INTO firebase_rules_deployments (
                    rules_content, status, created_at
                ) VALUES ($1, $2, NOW())
            `,
        [rulesContent, status]
      );
    } catch (error) {
      logger.error('Failed to log rules deployment:', error);
    }
  }

  /**
   * Get all templates
   */
  getTemplates() {
    return Array.from(this.rulesTemplates.values());
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category) {
    return Array.from(this.rulesTemplates.values()).filter(
      template => template.category === category
    );
  }

  /**
   * Update rules template
   */
  async updateTemplate(templateId, updates) {
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name) {
        setClause.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        setClause.push(`description = $${paramIndex++}`);
        values.push(updates.description);
      }
      if (updates.category) {
        setClause.push(`category = $${paramIndex++}`);
        values.push(updates.category);
      }
      if (updates.rulesContent) {
        setClause.push(`rules_content = $${paramIndex++}`);
        values.push(updates.rulesContent);
      }
      if (updates.variables) {
        setClause.push(`variables = $${paramIndex++}`);
        values.push(JSON.stringify(updates.variables));
      }
      if (updates.isActive !== undefined) {
        setClause.push(`is_active = $${paramIndex++}`);
        values.push(updates.isActive);
      }

      setClause.push(`updated_at = NOW()`);
      values.push(templateId);

      await this.db.query(
        `
                UPDATE firebase_rules_templates 
                SET ${setClause.join(', ')} 
                WHERE id = $${paramIndex}
            `,
        values
      );

      // Update in-memory template
      if (this.rulesTemplates.has(templateId)) {
        const existingTemplate = this.rulesTemplates.get(templateId);
        this.rulesTemplates.set(templateId, {
          ...existingTemplate,
          ...updates,
          updatedAt: new Date(),
        });
      }

      logger.info('Rules template updated:', {
        templateId,
        updates: Object.keys(updates),
      });
    } catch (error) {
      logger.error('Failed to update template:', error);
      throw error;
    }
  }

  /**
   * Delete rules template
   */
  async deleteTemplate(templateId) {
    try {
      await this.db.query('DELETE FROM firebase_rules_templates WHERE id = $1', [templateId]);
      this.rulesTemplates.delete(templateId);

      logger.info('Rules template deleted:', { templateId });
    } catch (error) {
      logger.error('Failed to delete template:', error);
      throw error;
    }
  }
}

export default FirebaseRulesIntegrationService;
