const { initializeDatabase } = require('../config/database');
const { User, Session, Resume, Payment, CreditTransaction } = require('../models');
const { logger } = require('../config/logger');

async function seed() {
  try {
    logger.info('Starting database seeding...');

    // Initialize database connection
    await initializeDatabase();

    // Create sample users
    const sampleUsers = await createSampleUsers();
    logger.info(`Created ${sampleUsers.length} sample users`);

    // Create sample sessions
    const sampleSessions = await createSampleSessions(sampleUsers);
    logger.info(`Created ${sampleSessions.length} sample sessions`);

    // Create sample resumes
    const sampleResumes = await createSampleResumes(sampleUsers);
    logger.info(`Created ${sampleResumes.length} sample resumes`);

    // Create sample payments and transactions
    const samplePayments = await createSamplePayments(sampleUsers);
    logger.info(`Created ${samplePayments.length} sample payments`);

    logger.info('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Database seeding failed:', error);
    process.exit(1);
  }
}

async function createSampleUsers() {
  const users = [];

  // Test user 1
  const user1 = await User.create({
    email: 'john.doe@example.com',
    name: 'John Doe',
    avatar_url: 'https://ui-avatars.com/api/?name=John+Doe&background=0D8ABC&color=fff',
    credits: 5,
    is_verified: true,
  });
  users.push(user1);

  // Test user 2
  const user2 = await User.create({
    email: 'jane.smith@example.com',
    name: 'Jane Smith',
    avatar_url: 'https://ui-avatars.com/api/?name=Jane+Smith&background=F39C12&color=fff',
    credits: 3,
    is_verified: true,
  });
  users.push(user2);

  // Test user 3 (Google user)
  const user3 = await User.create({
    email: 'alex.tech@gmail.com',
    google_id: 'google_123456789',
    name: 'Alex Johnson',
    avatar_url: 'https://lh3.googleusercontent.com/a/default-user',
    credits: 2,
    is_verified: true,
  });
  users.push(user3);

  return users;
}

async function createSampleSessions(users) {
  const sessions = [];

  // Session for user 1
  const session1 = await Session.create({
    user_id: users[0].id,
    session_name: 'Frontend Developer Interview',
    company_name: 'TechCorp Inc.',
    job_title: 'Senior Frontend Developer',
    job_description:
      'Looking for a Senior Frontend Developer with React experience to join our growing team.',
    status: 'completed',
  });

  // Add some messages to the session
  await session1.addMessage({
    message_type: 'question',
    content: 'Can you tell me about your experience with React?',
    metadata: { ai_generated: true, difficulty: 'medium' },
  });

  await session1.addMessage({
    message_type: 'answer',
    content:
      'I have 3 years of experience working with React, including hooks and state management with Redux.',
    metadata: { user_response: true, duration_seconds: 45 },
  });

  await session1.addMessage({
    message_type: 'feedback',
    content: 'Good answer! Your explanation of React hooks shows solid understanding.',
    metadata: { ai_generated: true, score: 8 },
  });

  sessions.push(session1);

  // Session for user 2
  const session2 = await Session.create({
    user_id: users[1].id,
    session_name: 'Backend Developer Interview',
    company_name: 'DataFlow Systems',
    job_title: 'Python Backend Developer',
    job_description: 'Seeking a Python developer with experience in Django and REST APIs.',
    status: 'active',
  });

  sessions.push(session2);

  // Session for user 3
  const session3 = await Session.create({
    user_id: users[2].id,
    session_name: 'Full-Stack Interview Prep',
    company_name: 'StartupXYZ',
    job_title: 'Full-Stack Developer',
    job_description: 'Full-stack position working with Node.js and React.',
    status: 'created',
  });

  sessions.push(session3);

  return sessions;
}

async function createSampleResumes(users) {
  const resumes = [];

  // Resume for user 1
  const resume1 = await Resume.create({
    user_id: users[0].id,
    file_name: 'john_doe_resume.pdf',
    file_path: '/uploads/resumes/john_doe_resume.pdf',
    parsed_content:
      'John Doe - Senior Frontend Developer with 3+ years experience in React, JavaScript, and modern web technologies. Experience at TechStartup Inc. and WebDev Corp.',
    skills: ['JavaScript', 'React', 'Node.js', 'HTML', 'CSS', 'Git', 'MongoDB'],
    experience: [
      {
        company: 'TechStartup Inc.',
        position: 'Frontend Developer',
        duration: '2021-2024',
        description: 'Developed responsive web applications using React and TypeScript',
      },
      {
        company: 'WebDev Corp',
        position: 'Junior Developer',
        duration: '2020-2021',
        description: 'Built websites using HTML, CSS, and vanilla JavaScript',
      },
    ],
    education: [
      {
        institution: 'Tech University',
        degree: 'Bachelor of Computer Science',
        year: '2020',
      },
    ],
    is_active: true,
  });
  resumes.push(resume1);

  // Resume for user 2
  const resume2 = await Resume.create({
    user_id: users[1].id,
    file_name: 'jane_smith_resume.docx',
    file_path: '/uploads/resumes/jane_smith_resume.docx',
    parsed_content:
      'Jane Smith - Python Backend Developer with expertise in Django, REST APIs, and database design. Strong background in data analysis and machine learning.',
    skills: ['Python', 'Django', 'PostgreSQL', 'REST APIs', 'Docker', 'AWS', 'Machine Learning'],
    experience: [
      {
        company: 'Data Analytics Co.',
        position: 'Backend Developer',
        duration: '2019-2024',
        description: 'Developed scalable backend systems and REST APIs using Python and Django',
      },
    ],
    education: [
      {
        institution: 'Data Science Institute',
        degree: 'Master of Data Science',
        year: '2019',
      },
    ],
    is_active: true,
  });
  resumes.push(resume2);

  return resumes;
}

async function createSamplePayments(users) {
  const payments = [];

  // Completed payment for user 1
  const payment1 = await Payment.create({
    user_id: users[0].id,
    amount_usd: 9.99,
    credits_purchased: 5,
    payment_provider: 'stripe',
    payment_reference: 'pi_1234567890',
    status: 'completed',
  });

  // Complete the payment (this will add credits to user and create transaction)
  await payment1.complete();
  payments.push(payment1);

  // Pending payment for user 2
  const payment2 = await Payment.create({
    user_id: users[1].id,
    amount_usd: 19.99,
    credits_purchased: 10,
    payment_provider: 'stripe',
    payment_reference: 'pi_0987654321',
    status: 'pending',
  });
  payments.push(payment2);

  // Create some credit usage transactions
  await CreditTransaction.recordSessionUsage(users[0].id, null, 1);
  await CreditTransaction.recordSessionUsage(users[1].id, null, 1);

  return payments;
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seed();
}

module.exports = seed;
