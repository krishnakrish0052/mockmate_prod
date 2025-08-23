import OpenAI from 'openai';
import { logError, logPerformance } from '../config/logger.js';
import { cache } from '../config/redis.js';
import UserProfile from '../models/UserProfile.js';
import PersonalizedResponseTemplates from './PersonalizedResponseTemplates.js';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize personalized templates
const responseTemplates = new PersonalizedResponseTemplates();

// System prompts for different interview types
const SYSTEM_PROMPTS = {
  technical: {
    beginner: `You are an experienced technical interviewer conducting a beginner-level technical interview. 
    Ask clear, foundational questions about programming concepts, basic algorithms, and fundamental CS principles.
    Be encouraging and provide helpful hints when the candidate struggles. Keep questions practical and relevant to entry-level positions.`,

    intermediate: `You are an experienced technical interviewer conducting an intermediate-level technical interview.
    Ask questions about data structures, algorithms, system design basics, and practical programming problems.
    Challenge the candidate but provide guidance when needed. Focus on problem-solving approaches and code quality.`,

    advanced: `You are a senior technical interviewer conducting an advanced-level technical interview.
    Ask complex questions about system design, advanced algorithms, performance optimization, and scalability.
    Expect detailed explanations and deep technical knowledge. Challenge architectural decisions and probe for edge cases.`,
  },

  behavioral: {
    beginner: `You are conducting a behavioral interview for an entry-level position.
    Ask questions about teamwork, communication, learning ability, and basic workplace scenarios.
    Focus on potential, attitude, and willingness to learn rather than extensive experience.`,

    intermediate: `You are conducting a behavioral interview for a mid-level position.
    Ask questions about leadership, conflict resolution, project management, and handling challenges.
    Look for examples of growth, adaptability, and professional maturity.`,

    advanced: `You are conducting a behavioral interview for a senior position.
    Ask questions about strategic thinking, mentoring, decision-making under pressure, and organizational impact.
    Expect detailed examples of leadership and complex problem-solving.`,
  },

  mixed: {
    beginner: `You are conducting a mixed interview combining technical and behavioral questions for an entry-level position.
    Balance technical fundamentals with behavioral questions about learning, teamwork, and growth.
    Adjust the technical difficulty based on the candidate's responses.`,

    intermediate: `You are conducting a mixed interview for a mid-level position.
    Combine technical problem-solving with behavioral questions about leadership and collaboration.
    Look for both technical competence and professional maturity.`,

    advanced: `You are conducting a mixed interview for a senior position.
    Blend complex technical questions with strategic behavioral questions.
    Evaluate both deep technical expertise and leadership capabilities.`,
  },
};

// Question banks for different categories
const QUESTION_BANKS = {
  technical: {
    beginner: [
      'Can you explain what a variable is and how you would use it?',
      "What's the difference between a for loop and a while loop?",
      'How would you find the largest number in an array?',
      'Explain what recursion is with a simple example.',
      'What is the difference between a stack and a queue?',
    ],
    intermediate: [
      'How would you implement a hash table?',
      'Explain the difference between breadth-first and depth-first search.',
      'Design a simple caching system.',
      'How would you detect a cycle in a linked list?',
      'Explain database indexing and when you would use it.',
    ],
    advanced: [
      'Design a URL shortener like bit.ly',
      'How would you design a distributed cache?',
      'Explain consistent hashing and its applications.',
      'Design a real-time chat system for millions of users.',
      'How would you handle race conditions in a multi-threaded environment?',
    ],
  },
  behavioral: {
    beginner: [
      'Tell me about a time when you learned something new quickly.',
      'Describe a challenging project you worked on in school or personally.',
      'How do you handle constructive criticism?',
      'What motivates you to pursue this career?',
      'Tell me about a time when you worked in a team.',
    ],
    intermediate: [
      'Describe a time when you had to convince someone to change their mind.',
      "Tell me about a project that didn't go as planned. How did you handle it?",
      'How do you prioritize tasks when everything seems urgent?',
      'Describe a time when you mentored someone or helped a colleague.',
      'Tell me about a time when you disagreed with your manager.',
    ],
    advanced: [
      'Describe a time when you had to make a difficult decision with incomplete information.',
      'How have you influenced change in your organization?',
      'Tell me about a time when you had to deliver bad news to stakeholders.',
      'Describe your approach to building and leading high-performing teams.',
      'How do you balance technical debt with feature development?',
    ],
  },
};

class AIService {
  constructor() {
    this.rateLimitCache = new Map();
    this.responseCache = new Map();
  }

  /**
   * Generate an interview response based on user input and session context
   */
  async generateInterviewResponse(
    userMessage,
    sessionType,
    difficulty,
    conversationHistory = [],
    userId = null,
    sessionId = null
  ) {
    const startTime = Date.now();

    try {
      // Check rate limiting
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded for AI requests');
      }

      // Get user profile for personalization if userId is provided
      let userProfile = null;
      let personalizedPrompt = null;

      if (userId) {
        // Check cache first
        const cacheKey = `user_profile:${userId}`;
        const cachedProfile = await cache.get(cacheKey);

        if (cachedProfile) {
          userProfile = JSON.parse(cachedProfile);
        } else {
          // Fetch from database
          userProfile = await UserProfile.getProfileWithResume(userId);

          // Cache if found
          if (userProfile) {
            await cache.setex(cacheKey, 3600, JSON.stringify(userProfile));
          }
        }

        // Create personalized system prompt if profile exists
        if (userProfile) {
          personalizedPrompt = responseTemplates.createPersonalizedSystemPrompt(
            userProfile,
            sessionType,
            difficulty
          );
        }
      }

      // Use personalized prompt if available, otherwise use standard one
      const systemPrompt = personalizedPrompt || this.getSystemPrompt(sessionType, difficulty);

      // Check if it's the start of conversation and add a personalized greeting
      let enhancedUserMessage = userMessage;

      if (conversationHistory.length === 0 && userProfile) {
        // Add personalized greeting for first message
        const greeting = responseTemplates.getGreeting(userProfile);
        const enhancedPrompt = `${greeting}\n\nThe user's message is: ${userMessage}`;
        enhancedUserMessage = enhancedPrompt;
      }

      // Build conversation context
      const messages = this.buildConversationContext(
        systemPrompt,
        enhancedUserMessage,
        conversationHistory,
        sessionType,
        difficulty,
        userProfile
      );

      // Generate response using OpenAI
      const response = await this.callOpenAI(messages);

      // Track performance with user profile info
      const performanceMetadata = {
        sessionType,
        difficulty,
        messageLength: userMessage.length,
        responseLength: response.length,
        personalized: !!userProfile,
        sessionId,
      };

      logPerformance('AI_RESPONSE_GENERATION', Date.now() - startTime, performanceMetadata);

      return response;
    } catch (error) {
      logError(error, {
        context: 'generateInterviewResponse',
        sessionType,
        difficulty,
        messageLength: userMessage.length,
      });

      // Return fallback response
      return this.getFallbackResponse(sessionType, difficulty);
    }
  }

  /**
   * Generate follow-up questions based on the conversation
   */
  async generateFollowUpQuestions(conversationHistory, sessionType, difficulty, userId = null) {
    try {
      // Get user profile for personalization if userId is provided
      let userProfile = null;

      if (userId) {
        // Check cache first
        const cacheKey = `user_profile:${userId}`;
        const cachedProfile = await cache.get(cacheKey);

        if (cachedProfile) {
          userProfile = JSON.parse(cachedProfile);
        } else {
          // Fetch from database
          userProfile = await UserProfile.findByUserId(userId);

          // Cache if found
          if (userProfile) {
            await cache.setex(cacheKey, 3600, JSON.stringify(userProfile));
          }
        }
      }

      // Build personalized or standard system prompt
      let systemPrompt;

      if (userProfile && userProfile.job_title) {
        systemPrompt = `You are an interview assistant for ${userProfile.job_title} roles. 
        Based on the conversation history, generate 2-3 relevant follow-up questions for a ${difficulty} ${sessionType} interview 
        that would be appropriate for someone with ${userProfile.years_of_experience || '0-2'} years of experience. 
        Ensure questions are specifically relevant to ${userProfile.job_title} in the ${userProfile.industry || 'technology'} industry.
        Return only the questions, one per line.`;
      } else {
        systemPrompt = `You are an interview assistant. Based on the conversation history, 
        generate 2-3 relevant follow-up questions for a ${difficulty} ${sessionType} interview. 
        Return only the questions, one per line.`;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Conversation history:\n${this.formatConversationHistory(conversationHistory)}`,
        },
      ];

      const response = await this.callOpenAI(messages, { max_tokens: 200 });

      return response
        .split('\n')
        .filter(q => q.trim().length > 0)
        .slice(0, 3);
    } catch (error) {
      logError(error, { context: 'generateFollowUpQuestions' });
      return this.getFallbackQuestions(sessionType, difficulty);
    }
  }

  /**
   * Analyze and score a user's response
   */
  async analyzeResponse(userResponse, question, sessionType, difficulty, userId = null) {
    try {
      // Get user profile for personalization if userId is provided
      let userProfile = null;

      if (userId) {
        // Check cache first
        const cacheKey = `user_profile:${userId}`;
        const cachedProfile = await cache.get(cacheKey);

        if (cachedProfile) {
          userProfile = JSON.parse(cachedProfile);
        } else {
          // Fetch from database
          userProfile = await UserProfile.findByUserId(userId);

          // Cache if found
          if (userProfile) {
            await cache.setex(cacheKey, 3600, JSON.stringify(userProfile));
          }
        }
      }

      // Build personalized or standard system prompt
      let systemPrompt;

      if (userProfile && userProfile.job_title) {
        systemPrompt = `You are an expert interviewer analyzing responses for a ${difficulty} ${sessionType} interview for a ${userProfile.job_title} position.
        The candidate has about ${userProfile.years_of_experience || '0-2'} years of experience in ${userProfile.industry || 'the field'}.
        Provide a score (1-10) and specific, actionable feedback tailored to a ${userProfile.job_title} candidate.
        Include insights related to industry standards in ${userProfile.industry || 'technology'} if relevant.
        Format: Score: X/10\nFeedback: [your detailed, personalized feedback]`;
      } else {
        systemPrompt = `You are an expert interviewer analyzing responses for a ${difficulty} ${sessionType} interview.
        Provide a score (1-10) and brief feedback for the candidate's response.
        Format: Score: X/10\nFeedback: [your feedback]`;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Question: ${question}\nResponse: ${userResponse}` },
      ];

      const analysis = await this.callOpenAI(messages, { max_tokens: 300 });

      // Parse score and feedback
      const scoreMatch = analysis.match(/Score:\s*(\d+)\/10/i);
      const feedbackMatch = analysis.match(/Feedback:\s*(.+)/is);

      let feedbackText = feedbackMatch ? feedbackMatch[1].trim() : 'Good response overall.';

      // If we have a user profile, enhance the feedback with a personalized template
      if (userProfile) {
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
        const isPositive = score >= 7;
        const personalizedIntro = responseTemplates.getFeedback(userProfile, isPositive);

        // Only prepend if it doesn't make the feedback too long
        if (feedbackText.length + personalizedIntro.length < 400) {
          feedbackText = `${personalizedIntro} ${feedbackText}`;
        }
      }

      return {
        score: scoreMatch ? parseInt(scoreMatch[1]) : 5,
        feedback: feedbackText,
        analysis: analysis,
      };
    } catch (error) {
      logError(error, { context: 'analyzeResponse' });
      return {
        score: 5,
        feedback: 'Thank you for your response.',
        analysis: 'Analysis unavailable',
      };
    }
  }

  /**
   * Generate a session summary and overall feedback
   */
  async generateSessionSummary(conversationHistory, sessionType, difficulty, userId = null) {
    try {
      // Get user profile for personalization if userId is provided
      let userProfile = null;

      if (userId) {
        // Check cache first
        const cacheKey = `user_profile:${userId}`;
        const cachedProfile = await cache.get(cacheKey);

        if (cachedProfile) {
          userProfile = JSON.parse(cachedProfile);
        } else {
          // Fetch from database
          userProfile = await UserProfile.findByUserId(userId);

          // Cache if found
          if (userProfile) {
            await cache.setex(cacheKey, 3600, JSON.stringify(userProfile));
          }
        }
      }

      // Build personalized or standard system prompt
      let systemPrompt;

      if (userProfile && userProfile.job_title) {
        systemPrompt = `You are providing final interview feedback for a ${difficulty} ${sessionType} interview for a ${userProfile.job_title} position.
        The candidate, ${this.getFirstName(userProfile.name) || 'the candidate'}, has about ${userProfile.years_of_experience || '0-2'} years of experience in ${userProfile.industry || 'the field'}.
        Analyze the entire conversation and provide:
        1. Overall performance summary tailored to ${userProfile.job_title} requirements
        2. Specific strengths identified that are valuable for ${userProfile.job_title} roles
        3. Areas for improvement with actionable advice for this career path
        4. Overall score (1-10)
        5. Specific next steps to improve interview performance for ${userProfile.job_title} positions
        
        Format your response with clear sections. Be personable and supportive while providing honest, constructive feedback.`;
      } else {
        systemPrompt = `You are providing final interview feedback for a ${difficulty} ${sessionType} interview.
        Analyze the entire conversation and provide:
        1. Overall performance summary
        2. Strengths identified
        3. Areas for improvement
        4. Overall score (1-10)
        
        Format your response with clear sections.`;
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Interview conversation:\n${this.formatConversationHistory(conversationHistory)}`,
        },
      ];

      const summary = await this.callOpenAI(messages, { max_tokens: 600 });

      // Extract overall score
      const scoreMatch = summary.match(/(?:overall\s+)?score:\s*(\d+)\/10/i);
      const overallScore = scoreMatch ? parseInt(scoreMatch[1]) : 5;

      // Add personalized closing if profile exists
      let enhancedSummary = summary;

      if (userProfile) {
        const closing = responseTemplates.getClosing(
          userProfile,
          overallScore >= 7 ? 'excelling' : 'improving'
        );
        enhancedSummary = `${summary}\n\n${closing}`;
      }

      return {
        summary: enhancedSummary,
        overallScore,
        timestamp: new Date().toISOString(),
        personalized: !!userProfile,
      };
    } catch (error) {
      logError(error, { context: 'generateSessionSummary' });
      return {
        summary: 'Thank you for completing the interview session.',
        overallScore: 5,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get system prompt based on session type and difficulty
   */
  getSystemPrompt(sessionType, difficulty) {
    const prompts = SYSTEM_PROMPTS[sessionType] || SYSTEM_PROMPTS.technical;
    return prompts[difficulty] || prompts.intermediate;
  }

  /**
   * Build conversation context for OpenAI
   */
  buildConversationContext(
    systemPrompt,
    userMessage,
    conversationHistory,
    sessionType,
    difficulty,
    userProfile = null
  ) {
    const messages = [{ role: 'system', content: systemPrompt }];

    // Add conversation history (last 6 messages to stay within token limits)
    const recentHistory = conversationHistory.slice(-6);
    messages.push(...recentHistory);

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    // Add context about session progression
    const sessionLength = conversationHistory.length;
    let contextNote = '';

    if (sessionLength < 2) {
      contextNote = 'This is the beginning of the interview. Start with an opening question.';
    } else if (sessionLength < 8) {
      contextNote = 'Continue the interview with relevant follow-up questions.';
    } else {
      contextNote =
        'The interview is progressing well. Consider deeper or more challenging questions.';
    }

    // Add personalized context if available
    if (userProfile) {
      // Add additional guidance based on user profile
      if (userProfile.job_title) {
        contextNote += ` Focus on topics relevant to the ${userProfile.job_title} role.`;
      }

      if (userProfile.skill_level) {
        contextNote += ` Maintain a ${userProfile.skill_level} difficulty level appropriate for their experience.`;
      }

      // For technical interviews, reference the user's background
      if (sessionType === 'technical' && userProfile.years_of_experience > 0) {
        contextNote += ` Draw on scenarios that would be familiar to someone with ${userProfile.years_of_experience} years of experience.`;
      }
    }

    if (contextNote) {
      messages.push({ role: 'system', content: contextNote });
    }

    return messages;
  }

  /**
   * Call OpenAI API with retry logic
   */
  async callOpenAI(messages, options = {}) {
    const defaultOptions = {
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages,
      max_tokens: options.max_tokens || 400,
      temperature: options.temperature || 0.7,
      presence_penalty: 0.2,
      frequency_penalty: 0.1,
    };

    const cacheKey = this.generateCacheKey(messages);

    // Check cache first
    const cached = await cache.get(`ai_response:${cacheKey}`);
    if (cached) {
      return cached;
    }

    let lastError;
    const maxRetries = 2;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const completion = await openai.chat.completions.create(defaultOptions);
        const response = completion.choices[0].message.content.trim();

        // Cache successful responses for 1 hour
        await cache.set(`ai_response:${cacheKey}`, response, 3600);

        return response;
      } catch (error) {
        lastError = error;

        if (error.status === 429) {
          // Rate limit hit, wait before retry
          await this.delay(Math.pow(2, attempt) * 1000);
        } else if (error.status >= 500) {
          // Server error, retry
          await this.delay(1000 * attempt);
        } else {
          // Client error, don't retry
          break;
        }
      }
    }

    throw lastError;
  }

  /**
   * Check rate limiting for AI requests
   */
  checkRateLimit() {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 30; // 30 requests per minute

    // Clean old entries
    for (const [timestamp] of this.rateLimitCache) {
      if (now - timestamp > windowMs) {
        this.rateLimitCache.delete(timestamp);
      }
    }

    if (this.rateLimitCache.size >= maxRequests) {
      return false;
    }

    this.rateLimitCache.set(now, true);
    return true;
  }

  /**
   * Generate cache key for messages
   */
  generateCacheKey(messages) {
    const content = messages.map(m => `${m.role}:${m.content}`).join('|');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Format conversation history for AI context
   */
  formatConversationHistory(history) {
    return history.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
  }

  /**
   * Extract first name from full name
   */
  getFirstName(fullName) {
    if (!fullName) return 'candidate';
    return fullName.split(' ')[0];
  }

  /**
   * Get fallback response when AI fails
   */
  getFallbackResponse(sessionType, difficulty) {
    const responses = {
      technical: {
        beginner:
          'Can you tell me about your experience with programming? What languages have you worked with?',
        intermediate:
          "Let's discuss a technical challenge you've faced. How did you approach solving it?",
        advanced:
          "I'd like to explore your system design experience. Can you walk me through how you would architect a scalable web application?",
      },
      behavioral: {
        beginner: 'Tell me about yourself and what interests you about this field.',
        intermediate:
          'Describe a situation where you had to work with a difficult team member. How did you handle it?',
        advanced:
          'Can you share an example of a time when you had to lead a project or initiative? What was your approach?',
      },
      mixed: {
        beginner:
          "Let's start with a simple question: What programming concept do you find most interesting and why?",
        intermediate:
          "I'd like to understand both your technical skills and your approach to teamwork. Can you describe a project where both were important?",
        advanced:
          "Let's discuss a complex problem you've solved. I'm interested in both your technical approach and how you managed the stakeholders involved.",
      },
    };

    return responses[sessionType]?.[difficulty] || responses.technical.intermediate;
  }

  /**
   * Get fallback questions when AI fails
   */
  getFallbackQuestions(sessionType, difficulty) {
    const questions =
      QUESTION_BANKS[sessionType]?.[difficulty] || QUESTION_BANKS.technical.intermediate;
    return questions.slice(0, 3);
  }

  /**
   * Utility function for delays
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const aiService = new AIService();

export default aiService;
