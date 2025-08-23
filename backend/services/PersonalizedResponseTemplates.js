/**
 * Personalized Response Templates for Natural AI Interactions
 * This service provides templates that make AI responses feel more human and relatable
 * based on user profile data and context.
 */

class PersonalizedResponseTemplates {
  constructor() {
    this.greetingTemplates = {
      beginner: [
        "Hey {name}! Ready to practice for your {jobTitle} role? Let's start with some fundamentals and build your confidence step by step.",
        "Hi {name}! I'm excited to help you prepare for {jobTitle} interviews. We'll go at a comfortable pace and focus on the basics first.",
        "Hello {name}! As someone looking to break into {jobTitle}, let's work together to make sure you feel prepared and confident.",
      ],
      intermediate: [
        "Hi {name}! Great to see you're leveling up your {jobTitle} interview skills. With your {yearsOfExperience} years of experience, we can dive into some solid practice.",
        "Hey {name}! Ready to sharpen those {jobTitle} interview skills? Let's put your {yearsOfExperience} years of experience to good use.",
        'Hello {name}! Time to prep for that {jobTitle} opportunity. Your background gives us a great foundation to work with.',
      ],
      advanced: [
        'Hi {name}! Excellent to have an experienced {jobTitle} here. With {yearsOfExperience} years under your belt, we can tackle some challenging scenarios.',
        'Hey {name}! Ready to fine-tune your {jobTitle} interview game? Your expertise will make this an engaging session.',
        "Hello {name}! As a seasoned {jobTitle} professional, let's work on perfecting your interview presence for that next big role.",
      ],
      expert: [
        'Hi {name}! Always a pleasure working with a {jobTitle} expert. With your {yearsOfExperience} years of experience, we can explore some sophisticated topics.',
        'Hey {name}! Time to polish your executive-level {jobTitle} interview skills. Your extensive background opens up some interesting possibilities.',
        "Hello {name}! As a senior {jobTitle} professional, let's ensure your interview performance matches your impressive expertise.",
      ],
    };

    this.questionIntroTemplates = {
      behavioral: {
        beginner: [
          "Let's start with a scenario that's common in {industry} - think about how you'd handle this as a new {jobTitle}:",
          "Here's a situation you might face early in your {jobTitle} career - take your time to think it through:",
          'This next question is about teamwork, which is crucial for any {jobTitle} role:',
        ],
        intermediate: [
          "Given your {yearsOfExperience} years in {industry}, I'm curious how you'd approach this challenge:",
          'This scenario should feel familiar from your {jobTitle} experience - walk me through your thinking:',
          'As someone with solid {jobTitle} background, how would you navigate this situation:',
        ],
        advanced: [
          "With your extensive {jobTitle} experience, I'd love to hear your take on this leadership scenario:",
          'This is a situation that often comes up for senior {jobTitle} professionals - how do you handle it:',
          "Given your expertise in {industry}, what's your approach to this complex challenge:",
        ],
      },
      technical: {
        beginner: [
          "Don't worry if this seems challenging - we're here to learn! Let's break down this {industry} concept:",
          'This is a fundamental {jobTitle} question - take your time and talk through your approach:',
          "Let's start with something foundational that every {jobTitle} should know:",
        ],
        intermediate: [
          "This technical question should align well with your {jobTitle} experience - show me how you'd solve it:",
          'Given your background in {industry}, this problem might look familiar:',
          "Let's dive into a technical scenario that a {yearsOfExperience}-year {jobTitle} would encounter:",
        ],
        advanced: [
          "Here's a system design challenge that matches your senior {jobTitle} level:",
          'This complex technical scenario is perfect for someone with your {industry} expertise:',
          "Let's explore an architectural problem that experienced {jobTitle} professionals face:",
        ],
      },
    };

    this.feedbackTemplates = {
      positive: {
        beginner: [
          "Great job, {name}! That's exactly the kind of thinking that will serve you well in {jobTitle} roles.",
          "Excellent approach! You're really showing the potential that employers look for in entry-level {jobTitle} candidates.",
          'Well done! Your answer demonstrates the foundational understanding needed for {industry} roles.',
        ],
        intermediate: [
          "Solid answer, {name}! That response shows the maturity I'd expect from someone with {yearsOfExperience} years of {jobTitle} experience.",
          "Nice work! You're clearly leveraging your {industry} background effectively in your reasoning.",
          "Great response! That's the kind of practical thinking that comes from real {jobTitle} experience.",
        ],
        advanced: [
          'Excellent leadership thinking, {name}! That response shows the strategic mindset expected of senior {jobTitle} professionals.',
          "Outstanding! You're demonstrating exactly the kind of expertise that companies value in experienced {jobTitle} hires.",
          'Brilliant approach! Your {yearsOfExperience} years in {industry} really show in that comprehensive answer.',
        ],
      },
      constructive: {
        beginner: [
          'Good start, {name}! Let me help you strengthen that answer with some {industry} context that will impress interviewers.',
          "You're on the right track! Here's how to make your {jobTitle} answer even more compelling:",
          "Nice effort! Let's polish this response to better showcase your potential as a future {jobTitle}.",
        ],
        intermediate: [
          "Solid foundation, {name}! Given your {yearsOfExperience} years of experience, here's how to make this answer stand out:",
          'Good thinking! Let me suggest a way to better highlight your {industry} expertise in your response:',
          "You've got the right idea! Here's how to frame it more effectively for {jobTitle} interviews:",
        ],
        advanced: [
          'Good strategic thinking, {name}! For a senior {jobTitle} role, consider adding this leadership angle:',
          "Strong response! Here's how to elevate it to match the executive expectations for your level:",
          "Well-reasoned! Let's add some senior-level perspective that showcases your {yearsOfExperience} years of expertise:",
        ],
      },
    };

    this.encouragementTemplates = {
      struggling: [
        'No worries, {name}! This is exactly why we practice. Even experienced {jobTitle} professionals find these questions challenging.',
        'Take your time, {name}! Remember, the interviewer wants to see your thinking process, not just the perfect answer.',
        "That's totally normal, {name}! These {difficulty} level questions are meant to stretch your {jobTitle} skills.",
      ],
      improving: [
        "I can see you're getting more comfortable with these {jobTitle} scenarios, {name}! Your confidence is building.",
        "Much better, {name}! You're clearly absorbing the feedback and applying it to your {industry} thinking.",
        'Great progress, {name}! Your {jobTitle} interview skills are definitely sharpening with each question.',
      ],
      excelling: [
        "You're absolutely crushing this, {name}! Your {jobTitle} expertise is really shining through.",
        "Fantastic work, {name}! You're performing at the level I'd expect from the best {jobTitle} candidates.",
        "Impressive consistency, {name}! You're demonstrating exactly the kind of {industry} knowledge employers want.",
      ],
    };

    this.closingTemplates = {
      beginner: [
        "Awesome work today, {name}! You've shown great potential for {jobTitle} roles. Keep practicing these fundamentals and you'll be ready to impress.",
        "Great session, {name}! Your eagerness to learn is exactly what employers want to see in new {jobTitle} hires. You're on the right path!",
        "Well done, {name}! You've built a solid foundation today for your {jobTitle} interviews. Remember, growth mindset is your biggest asset.",
      ],
      intermediate: [
        'Excellent practice, {name}! Your {yearsOfExperience} years of experience combined with this prep work will definitely pay off in {jobTitle} interviews.',
        "Strong session, {name}! You're clearly ready to take the next step in your {jobTitle} career. Your responses showed real depth and understanding.",
        "Great work today, {name}! You've demonstrated the kind of practical expertise that makes {industry} professionals successful.",
      ],
      advanced: [
        'Outstanding session, {name}! Your senior-level thinking and {yearsOfExperience} years of expertise make you a formidable candidate for executive {jobTitle} roles.',
        "Impressive work, {name}! You've shown the strategic mindset and leadership qualities that companies seek in experienced {jobTitle} professionals.",
        'Excellent preparation, {name}! Your combination of deep {industry} knowledge and polished communication will serve you well in senior interviews.',
      ],
    };
  }

  /**
   * Get a personalized greeting based on user profile
   */
  getGreeting(userProfile) {
    const {
      skill_level = 'intermediate',
      job_title = 'professional',
      years_of_experience = 0,
    } = userProfile;
    const templates = this.greetingTemplates[skill_level] || this.greetingTemplates.intermediate;
    const template = this.getRandomTemplate(templates);

    return this.interpolateTemplate(template, {
      name: this.getFirstName(userProfile.name),
      jobTitle: job_title,
      yearsOfExperience: years_of_experience,
      industry: userProfile.industry || 'your field',
    });
  }

  /**
   * Get a personalized question introduction
   */
  getQuestionIntro(userProfile, sessionType, questionNumber) {
    const {
      skill_level = 'intermediate',
      job_title = 'professional',
      years_of_experience = 0,
    } = userProfile;
    const templates =
      this.questionIntroTemplates[sessionType]?.[skill_level] ||
      this.questionIntroTemplates.behavioral.intermediate;

    if (questionNumber === 1 && Math.random() < 0.7) {
      // 70% chance to use intro for first question
      const template = this.getRandomTemplate(templates);
      return this.interpolateTemplate(template, {
        jobTitle: job_title,
        yearsOfExperience: years_of_experience,
        industry: userProfile.industry || 'your industry',
      });
    }

    return null; // No intro needed
  }

  /**
   * Get personalized feedback based on response quality
   */
  getFeedback(userProfile, isPositive = true) {
    const {
      skill_level = 'intermediate',
      job_title = 'professional',
      years_of_experience = 0,
    } = userProfile;
    const feedbackType = isPositive ? 'positive' : 'constructive';
    const templates =
      this.feedbackTemplates[feedbackType][skill_level] ||
      this.feedbackTemplates[feedbackType].intermediate;

    const template = this.getRandomTemplate(templates);
    return this.interpolateTemplate(template, {
      name: this.getFirstName(userProfile.name),
      jobTitle: job_title,
      yearsOfExperience: years_of_experience,
      industry: userProfile.industry || 'your field',
    });
  }

  /**
   * Get encouraging message based on performance
   */
  getEncouragement(userProfile, performanceLevel = 'improving') {
    const templates =
      this.encouragementTemplates[performanceLevel] || this.encouragementTemplates.improving;

    const template = this.getRandomTemplate(templates);
    return this.interpolateTemplate(template, {
      name: this.getFirstName(userProfile.name),
      jobTitle: userProfile.job_title || 'professional',
      difficulty: userProfile.skill_level || 'intermediate',
      industry: userProfile.industry || 'your field',
    });
  }

  /**
   * Get personalized session closing
   */
  getClosing(userProfile, overallPerformance = 'good') {
    const {
      skill_level = 'intermediate',
      job_title = 'professional',
      years_of_experience = 0,
    } = userProfile;
    const templates = this.closingTemplates[skill_level] || this.closingTemplates.intermediate;

    const template = this.getRandomTemplate(templates);
    return this.interpolateTemplate(template, {
      name: this.getFirstName(userProfile.name),
      jobTitle: job_title,
      yearsOfExperience: years_of_experience,
      industry: userProfile.industry || 'your field',
    });
  }

  /**
   * Create a personalized system prompt that sounds natural
   */
  createPersonalizedSystemPrompt(userProfile, sessionType, difficulty) {
    const basePrompt = this.getBaseSystemPrompt(sessionType, difficulty);
    const personalContext = this.buildPersonalContext(userProfile);

    return `${basePrompt}

IMPORTANT PERSONALIZATION CONTEXT:
${personalContext}

RESPONSE STYLE GUIDELINES:
- Address the candidate by their first name occasionally (not every response)
- Reference their background naturally when relevant
- Use conversational, supportive tone rather than robotic language
- Show genuine interest in their responses
- Acknowledge their experience level appropriately
- Make questions feel tailored to their role and industry
- Celebrate progress and provide constructive feedback
- Sound like an experienced interviewer who knows their background

Remember: You're not just an AI asking generic questions - you're an interviewer who has reviewed their profile and is conducting a personalized session. Be natural, encouraging, and professional while maintaining appropriate challenge level.`;
  }

  /**
   * Helper Methods
   */
  getRandomTemplate(templates) {
    return templates[Math.floor(Math.random() * templates.length)];
  }

  interpolateTemplate(template, variables) {
    let result = template;
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, variables[key] || `{${key}}`);
    });
    return result;
  }

  getFirstName(fullName) {
    if (!fullName) return 'there';
    return fullName.split(' ')[0];
  }

  buildPersonalContext(userProfile) {
    const context = [];

    if (userProfile.job_title) {
      context.push(`- Candidate is applying for: ${userProfile.job_title}`);
    }

    if (userProfile.industry) {
      context.push(`- Industry focus: ${userProfile.industry}`);
    }

    if (userProfile.years_of_experience > 0) {
      context.push(`- Experience level: ${userProfile.years_of_experience} years`);
    }

    if (userProfile.skill_level) {
      context.push(`- Self-assessed skill level: ${userProfile.skill_level}`);
    }

    if (userProfile.job_description) {
      context.push(`- Role requirements: ${userProfile.job_description.substring(0, 200)}...`);
    }

    if (userProfile.resume) {
      context.push(`- Resume available: Yes (reference relevant skills when appropriate)`);
    }

    const name = this.getFirstName(userProfile.name);
    context.push(`- Candidate's name: ${name} (use naturally in conversation)`);

    return context.join('\n');
  }

  getBaseSystemPrompt(sessionType, difficulty) {
    const prompts = {
      technical: {
        beginner:
          'You are conducting a supportive technical interview for someone new to the field. Focus on fundamentals, provide hints when needed, and build confidence while assessing core knowledge.',
        intermediate:
          'You are conducting a technical interview for someone with solid experience. Ask practical questions that reflect real-world scenarios and probe for depth of understanding.',
        advanced:
          'You are conducting a technical interview for a senior professional. Explore complex topics, system design, and expect detailed explanations with architectural thinking.',
        expert:
          'You are conducting a technical interview for an expert-level candidate. Discuss cutting-edge technologies, leadership in technical decisions, and strategic technical vision.',
      },
      behavioral: {
        beginner:
          'You are conducting a behavioral interview focused on potential and learning ability. Ask about academic projects, internships, and demonstrate scenarios that assess adaptability and growth mindset.',
        intermediate:
          "You are conducting a behavioral interview for an experienced professional. Explore leadership examples, conflict resolution, and how they've grown in their career.",
        advanced:
          'You are conducting a behavioral interview for a senior professional. Focus on strategic thinking, team leadership, organizational impact, and complex decision-making scenarios.',
        expert:
          'You are conducting a behavioral interview for an executive-level candidate. Explore transformational leadership, organizational change, industry influence, and strategic vision.',
      },
      mixed: {
        beginner:
          'You are conducting a comprehensive interview combining technical foundations with behavioral potential assessment. Balance technical basics with growth mindset evaluation.',
        intermediate:
          'You are conducting a mixed interview for an experienced candidate. Combine technical competency with leadership and collaboration assessment.',
        advanced:
          'You are conducting a mixed interview for a senior professional. Evaluate both deep technical expertise and executive leadership capabilities.',
        expert:
          'You are conducting a mixed interview for a top-tier candidate. Assess technical vision, strategic thinking, and transformational leadership capabilities.',
      },
    };

    return prompts[sessionType]?.[difficulty] || prompts.mixed.intermediate;
  }
}

export default PersonalizedResponseTemplates;
