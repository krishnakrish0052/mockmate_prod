/**
 * Example: How to use the enhanced AI service with personalized responses
 * This shows the transformation from robotic AI to natural, relatable interactions
 */

import aiService from '../services/aiService.js';
import UserProfile from '../models/UserProfile.js';

// Example 1: Interview route that uses personalized AI
export async function handleInterviewMessage(req, res) {
  try {
    const { message, sessionType, difficulty } = req.body;
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Get conversation history (from your session management)
    const conversationHistory = await getSessionHistory(sessionId);

    // OLD WAY (robotic, generic):
    // const response = await aiService.generateInterviewResponse(
    //   message, sessionType, difficulty, conversationHistory
    // );

    // NEW WAY (personalized, natural):
    const response = await aiService.generateInterviewResponse(
      message,
      sessionType,
      difficulty,
      conversationHistory,
      userId, // <- This enables personalization!
      sessionId // <- This provides session context
    );

    res.json({
      success: true,
      response: response,
      personalized: true,
    });
  } catch (_error) {
    res.status(500).json({
      error: 'Failed to generate response',
      code: 'AI_RESPONSE_ERROR',
    });
  }
}

// Example 2: Creating a user profile for maximum personalization
export async function createExampleProfile(userId) {
  try {
    const profileData = {
      user_id: userId,
      job_title: 'Senior Software Engineer',
      job_description:
        'Leading full-stack development team, focusing on scalable web applications using React, Node.js, and cloud architecture. Responsible for mentoring junior developers and making technical decisions.',
      industry: 'Technology',
      years_of_experience: 5,
      skill_level: 'advanced',
      preferred_session_type: 'mixed',
      preferred_difficulty: 'advanced',
      preferred_duration: 60,
    };

    const profile = await UserProfile.createOrUpdate(profileData);
    console.log('Profile created successfully:', profile.toJSON());

    return profile;
  } catch (error) {
    console.error('Failed to create profile:', error);
    throw error;
  }
}

// Example 3: Response comparison - Before vs After personalization
export async function demonstrateResponseTransformation() {
  const userMessage = "I'm ready to start the interview";
  const sessionType = 'technical';
  const difficulty = 'intermediate';
  const conversationHistory = [];

  console.log('=== RESPONSE COMPARISON ===\n');

  // WITHOUT personalization (old way)
  console.log('🤖 STANDARD AI RESPONSE (robotic):');
  const standardResponse = await aiService.generateInterviewResponse(
    userMessage,
    sessionType,
    difficulty,
    conversationHistory
    // No userId or sessionId = standard generic response
  );
  console.log(standardResponse);
  console.log('\n' + '─'.repeat(50) + '\n');

  // WITH personalization (new way)
  console.log('👨‍💼 PERSONALIZED AI RESPONSE (natural):');
  const personalizedResponse = await aiService.generateInterviewResponse(
    userMessage,
    sessionType,
    difficulty,
    conversationHistory,
    'example-user-id', // Would be actual user ID
    'example-session-id'
  );
  console.log(personalizedResponse);
  console.log('\n' + '='.repeat(50) + '\n');
}

// Example 4: Complete interview flow with personalization
export async function examplePersonalizedInterviewFlow() {
  const userId = 'example-user-123';
  const sessionId = 'session-456';

  // 1. Create user profile for personalization
  await createExampleProfile(userId);

  // 2. Start interview with personalized greeting
  console.log('Starting personalized interview...\n');

  const greetingResponse = await aiService.generateInterviewResponse(
    "Hello, I'm ready to begin my interview",
    'mixed',
    'intermediate',
    [], // Empty history for first message
    userId,
    sessionId
  );

  console.log('AI INTERVIEWER:', greetingResponse);
  console.log('\n' + '─'.repeat(30) + '\n');

  // 3. Continue with user response
  const conversationHistory = [
    { role: 'assistant', content: greetingResponse },
    {
      role: 'user',
      content:
        "I have 5 years of experience in full-stack development and I'm applying for a Senior Software Engineer role at a tech company.",
    },
  ];

  const followUpResponse = await aiService.generateInterviewResponse(
    'Can you give me a technical question?',
    'mixed',
    'intermediate',
    conversationHistory,
    userId,
    sessionId
  );

  console.log('AI INTERVIEWER:', followUpResponse);
  console.log('\n' + '─'.repeat(30) + '\n');

  // 4. Analyze a response with personalization
  const userAnswer =
    'I would use a hash map to solve this problem because it provides O(1) lookup time and fits well with the scalability requirements we discussed.';
  const question = 'How would you optimize a search algorithm for a large dataset?';

  const analysis = await aiService.analyzeResponse(
    userAnswer,
    question,
    'technical',
    'intermediate',
    userId // <- Enables personalized feedback
  );

  console.log('PERSONALIZED FEEDBACK:');
  console.log(`Score: ${analysis.score}/10`);
  console.log(`Feedback: ${analysis.feedback}`);
  console.log('\n' + '─'.repeat(30) + '\n');

  // 5. Generate session summary with personalization
  const sessionSummary = await aiService.generateSessionSummary(
    conversationHistory,
    'mixed',
    'intermediate',
    userId // <- Enables personalized summary
  );

  console.log('PERSONALIZED SESSION SUMMARY:');
  console.log(sessionSummary.summary);
  console.log(`Overall Score: ${sessionSummary.overallScore}/10`);
  console.log(`Personalized: ${sessionSummary.personalized}`);
}

// Example 5: Profile completeness check
export async function checkProfileOptimization(userId) {
  const profile = await UserProfile.findByUserId(userId);

  if (!profile) {
    return {
      completeness: 0,
      recommendations: [
        'Create a profile to unlock personalized interviews',
        'Add job title for role-specific questions',
        'Include experience level for appropriate difficulty',
      ],
    };
  }

  // Calculate completeness
  const requiredFields = [
    'job_title',
    'industry',
    'years_of_experience',
    'skill_level',
    'preferred_session_type',
  ];

  const completedFields = requiredFields.filter(
    field => profile[field] && profile[field].toString().trim().length > 0
  );

  const completeness = Math.round((completedFields.length / requiredFields.length) * 100);

  return {
    completeness,
    profile: profile.toJSON(),
    recommendations:
      completeness < 100
        ? [
            'Complete your profile for maximum personalization',
            'Add missing fields to get more relevant questions',
            'Update your experience level for appropriate challenges',
          ]
        : [
            'Your profile is complete! Enjoy fully personalized interviews.',
            'Keep your profile updated as you gain more experience',
          ],
  };
}

// Example API endpoint that demonstrates the full enhancement
export function createPersonalizedInterviewEndpoint(app) {
  app.post('/api/sessions/:sessionId/chat-personalized', async (req, res) => {
    try {
      const { message } = req.body;
      const { sessionId } = req.params;
      const userId = req.user.id;

      // Get session details
      const session = await getSessionDetails(sessionId, userId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get conversation history
      const conversationHistory = await getSessionHistory(sessionId);

      // Generate personalized response
      const response = await aiService.generateInterviewResponse(
        message,
        session.interview_type,
        session.difficulty_level,
        conversationHistory,
        userId, // <- Enables personalization
        sessionId // <- Provides session context
      );

      // Store the interaction
      await storeInterviewMessage(sessionId, 'user_message', message);
      await storeInterviewMessage(sessionId, 'ai_response', response);

      res.json({
        success: true,
        response: response,
        metadata: {
          personalized: true,
          sessionType: session.interview_type,
          difficulty: session.difficulty_level,
          questionNumber: conversationHistory.length / 2 + 1,
        },
      });
    } catch (error) {
      console.error('Personalized interview error:', error);
      res.status(500).json({
        error: 'Failed to generate personalized response',
        code: 'PERSONALIZED_AI_ERROR',
      });
    }
  });
}

// Mock helper functions (replace with your actual implementations)
async function getSessionHistory(_sessionId) {
  // Return array of {role: 'user'|'assistant', content: string} objects
  return [];
}

async function getSessionDetails(_sessionId, userId) {
  // Return session object with interview_type, difficulty_level, etc.
  return {
    id: _sessionId,
    user_id: userId,
    interview_type: 'mixed',
    difficulty_level: 'intermediate',
    status: 'active',
  };
}

async function storeInterviewMessage(sessionId, messageType, content) {
  // Store message in your database
  console.log(`Storing ${messageType}: ${content.substring(0, 50)}...`);
}

// Run example if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Running personalized AI examples...\n');

  // Demonstrate the transformation
  demonstrateResponseTransformation()
    .then(() => {
      console.log('Example completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}
