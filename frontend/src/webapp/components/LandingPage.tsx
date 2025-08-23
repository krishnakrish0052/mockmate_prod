import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChatBubbleLeftRightIcon,
  AcademicCapIcon,
  SparklesIcon,
  UserGroupIcon,
  ArrowRightIcon,
  CheckIcon,
  CommandLineIcon,
  CpuChipIcon,
  CodeBracketIcon,
  PlayIcon,
  ChartBarIcon,
  EyeSlashIcon,
  SpeakerWaveIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliPrompt,
  CliBadge,
} from './ui/CliComponents';
import { usePolicies } from '../../contexts/PolicyContext';

interface SubscriptionPlan {
  id: string;
  planId: string;
  planName: string;
  description: string;
  priceUsd: number;
  creditsIncluded: number;
  features: string[];
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number;
}

const LandingPage: React.FC = () => {
  const [showDemo, setShowDemo] = useState(false);
  const [pricingPlans, setPricingPlans] = useState<any[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const { getActivePolicies } = usePolicies();

  const features = [
    {
      icon: EyeSlashIcon,
      title: '100% Stealth Mode',
      description:
        'Completely undetectable interview assistance. No traces left behind, seamless integration during live calls.',
      color: 'text-cli-green',
    },
    {
      icon: SpeakerWaveIcon,
      title: 'Fast Transcription',
      description:
        'Real-time audio processing with lightning-fast transcription. Get instant text from interview questions.',
      color: 'text-cli-cyan',
    },
    {
      icon: ChatBubbleLeftRightIcon,
      title: 'Real-Time Answers',
      description:
        'Instant AI-generated responses during live interviews. Get perfect answers within seconds.',
      color: 'text-primary-500',
    },
    {
      icon: DocumentTextIcon,
      title: 'Context-Aware AI',
      description:
        'Answers tailored to your resume, job description, and company details. Personalized and relevant responses.',
      color: 'text-cli-golden',
    },
    {
      icon: ArrowPathIcon,
      title: 'Lightweight Design',
      description:
        'Minimal system resources usage. Fast startup, low memory footprint, optimized for performance.',
      color: 'text-cli-purple',
    },
    {
      icon: ShieldCheckIcon,
      title: 'Enhanced Security',
      description:
        'End-to-end encryption for all your interview data and personal information. Zero data retention policy.',
      color: 'text-cli-red',
    },
  ];

  // Fetch subscription plans from database
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        console.log('🔄 Fetching credit packages from API...');
        setPlansLoading(true);
        const response = await axios.get('/api/payments/packages');
        console.log('📡 API Response:', JSON.stringify(response.data, null, 2));

        if (response.data.success) {
          // Transform backend credit packages to frontend format
          const plans = response.data.packages.map((pkg: any) => {
            // Ensure we have features, use defaults if not
            let features = pkg.features && Array.isArray(pkg.features) ? pkg.features : [];

            // Add default features based on package name if missing
            if (features.length === 0) {
              if (pkg.name.toLowerCase().includes('test')) {
                features = ['Basic AI interviews', 'Email support', 'Standard questions'];
              } else if (pkg.name.toLowerCase().includes('professional')) {
                features = [
                  'Advanced AI interviews',
                  'Priority support',
                  'All question types',
                  'Session recordings',
                ];
              } else if (pkg.name.toLowerCase().includes('mega')) {
                features = [
                  'Premium AI interviews',
                  'Dedicated support',
                  'Custom integrations',
                  'Advanced analytics',
                ];
              } else {
                features = ['AI-powered interviews', 'Standard support', 'Basic features'];
              }
            }

            return {
              name: pkg.name.toLowerCase(),
              price: pkg.priceFormatted || `$${(pkg.price / 100).toFixed(2)}`,
              credits: `${pkg.credits} CREDITS`,
              features: features,
              popular: pkg.popular || false,
              variant: pkg.popular ? ('primary' as const) : ('secondary' as const),
              planId: pkg.id,
            };
          });
          console.log('✨ Transformed plans:', plans);
          setPricingPlans(
            plans.sort((a: any, b: any) => {
              if (a.popular && !b.popular) return -1;
              if (!a.popular && b.popular) return 1;
              return 0;
            })
          );
          console.log('🎡 Final sorted plans set to state:', plans);
        }
      } catch (error) {
        console.error('Failed to fetch subscription plans:', error);
        // Fallback to empty array or show error
        setPricingPlans([]);
      } finally {
        setPlansLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const demoCommands = [
    {
      command: 'mockmate init --session interview',
      output: 'Initializing AI interview session...',
    },
    {
      command: 'mockmate start --difficulty advanced',
      output:
        'Loading advanced interview questions...\nAI Interviewer ready. Type "ready" to begin.',
    },
    {
      command: 'ready',
      output: "Welcome! Let's discuss your experience with React and TypeScript...",
    },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setShowDemo(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />

      {/* Header */}
      <header className='relative overflow-hidden border-b border-cli-gray'>
        <div className='mx-auto max-w-7xl'>
          {/* Navigation */}
          <nav className='relative px-4 pt-6 sm:px-6 lg:px-8'>
            <div className='relative flex items-center justify-between sm:h-10'>
              <Link to='/' className='group flex items-center space-x-3'>
                <div className='cli-terminal h-10 w-10 p-2 transition-all duration-300 group-hover:shadow-glow-golden'>
                  <CommandLineIcon className='h-full w-full text-primary-500' />
                </div>
                <span className='cli-glow font-mono text-2xl font-bold text-cli-white'>
                  Mock<span className='text-primary-500'>Mate</span>
                </span>
              </Link>

              <div className='hidden space-x-6 md:block'>
                <Link to='/login'>
                  <CliButton variant='ghost' size='sm'>
                    login
                  </CliButton>
                </Link>
                <Link to='/register'>
                  <CliButton variant='primary' size='sm'>
                    register
                  </CliButton>
                </Link>
              </div>
            </div>
          </nav>

          {/* Hero Section */}
          <div className='grid grid-cols-1 gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24'>
            <div className='space-y-8'>
              <div className='space-y-6'>
                <CliBadge variant='success' className='animate-pulse'>
                  STATUS: ONLINE
                </CliBadge>

                <h1 className='font-mono text-4xl font-bold leading-tight text-cli-white lg:text-6xl'>
                  <div className='mb-2'>
                    <span className='text-cli-green'>$</span>
                    <TypingText
                      text='master-interview-skills'
                      className='cli-glow text-primary-500'
                    />
                  </div>
                  <div className='text-cli-white'>
                    <span className='text-cli-light-gray'>--with</span> AI
                  </div>
                </h1>

                <p className='font-mono text-lg leading-relaxed text-cli-light-gray'>
                  Practice technical interviews in a familiar CLI environment. Get real-time
                  feedback from advanced AI and boost your confidence for your next{' '}
                  <span className='text-primary-500'>big opportunity</span>.
                </p>
              </div>

              <div className='flex flex-col gap-4 sm:flex-row'>
                <Link to='/register'>
                  <CliButton
                    variant='primary'
                    size='lg'
                    className='group flex w-full items-center justify-center'
                  >
                    <span>bootstrap --session</span>
                    <ArrowRightIcon className='ml-2 h-5 w-5 transition-transform group-hover:translate-x-1' />
                  </CliButton>
                </Link>
                <Link to='/login'>
                  <CliButton variant='secondary' size='lg' className='w-full'>
                    --login
                  </CliButton>
                </Link>
              </div>

              <div className='font-mono text-sm text-cli-light-gray'>
                <span className='text-cli-green'>✓</span> Free tier available •
                <span className='text-cli-green'>✓</span> No credit card required •
                <span className='text-cli-green'>✓</span> Start in 30 seconds
              </div>
            </div>

            {/* Terminal Demo */}
            <div className='relative animate-slide-up'>
              <TerminalWindow title='mockmate@terminal:~$ interview-session' className='h-96'>
                <div className='h-full overflow-auto p-6'>
                  {showDemo ? (
                    <CliPrompt commands={demoCommands} />
                  ) : (
                    <div className='flex h-full items-center justify-center'>
                      <div className='font-mono text-cli-light-gray'>
                        Initializing demo...
                        <span className='animate-terminal-cursor text-primary-500'>_</span>
                      </div>
                    </div>
                  )}
                </div>
              </TerminalWindow>

              {/* Floating elements */}
              <div className='absolute -right-4 -top-4 animate-float'>
                <div className='h-8 w-8 animate-pulse rounded-full bg-cli-green'></div>
              </div>
              <div
                className='absolute -bottom-4 -left-4 animate-float'
                style={{ animationDelay: '1s' }}
              >
                <div className='h-6 w-6 animate-pulse rounded-full bg-primary-500'></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className='relative bg-cli-dark py-20'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-16 text-center'>
            <CliBadge variant='info' className='mb-6'>
              SYSTEM FEATURES
            </CliBadge>
            <h2 className='mb-6 font-mono text-4xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> ls -la /features
            </h2>
            <p className='mx-auto max-w-3xl font-mono text-xl text-cli-light-gray'>
              Next-generation interview assistance with undetectable AI-powered features for the
              modern professional.
            </p>
          </div>

          <div className='grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3'>
            {features.map((feature, index) => (
              <CliCard
                key={feature.title}
                className={`animate-slide-up transition-all duration-500 hover:scale-105`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className='flex items-start space-x-4'>
                  <div className={`cli-terminal flex-shrink-0 p-3 ${feature.color}`}>
                    <feature.icon className='h-6 w-6' />
                  </div>
                  <div className='flex-1'>
                    <h3 className='mb-3 font-mono text-lg font-bold text-primary-500'>
                      {feature.title.toLowerCase().split(' ').join('-')}
                    </h3>
                    <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                      {feature.description}
                    </p>
                    <div className='mt-4 flex items-center space-x-2 font-mono text-xs text-cli-green'>
                      <span>✓</span>
                      <span>production-ready</span>
                    </div>
                  </div>
                </div>
              </CliCard>
            ))}
          </div>
        </div>
      </section>

      {/* Interviews Showcase Section */}
      <section className='relative border-y border-cli-gray bg-cli-darker py-20'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-16 text-center'>
            <CliBadge variant='warning' className='mb-6 animate-pulse'>
              WEBAPP POWERED
            </CliBadge>
            <h2 className='mb-6 font-mono text-4xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> ./navigate --to interviews --mode=webapp
            </h2>
            <p className='mx-auto max-w-3xl font-mono text-xl text-cli-light-gray'>
              All your interview sessions run seamlessly in our web application.
              <span className='text-primary-500'> No downloads, no installations</span> - just
              instant access to AI-powered interviews.
            </p>
          </div>

          <div className='grid grid-cols-1 items-center gap-12 lg:grid-cols-2'>
            {/* Features List */}
            <div className='space-y-8'>
              <CliCard className='hover:shadow-glow-neon group transition-all duration-300'>
                <div className='p-6'>
                  <div className='flex items-start space-x-4'>
                    <div className='cli-terminal flex-shrink-0 p-3 text-cli-green'>
                      <PlayIcon className='h-6 w-6' />
                    </div>
                    <div className='flex-1'>
                      <h3 className='mb-3 font-mono text-lg font-bold text-primary-500'>
                        ./instant-access --browser-only
                      </h3>
                      <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                        Start interviews immediately in your browser. No software to download, no
                        setup required. Just log in and begin your AI-powered interview session.
                      </p>
                    </div>
                  </div>
                </div>
              </CliCard>

              <CliCard className='group transition-all duration-300 hover:shadow-glow-golden'>
                <div className='p-6'>
                  <div className='flex items-start space-x-4'>
                    <div className='cli-terminal flex-shrink-0 p-3 text-primary-500'>
                      <CpuChipIcon className='h-6 w-6' />
                    </div>
                    <div className='flex-1'>
                      <h3 className='mb-3 font-mono text-lg font-bold text-primary-500'>
                        ./ai-interviewer --real-time
                      </h3>
                      <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                        Experience real-time AI conversations directly in the web app. Advanced
                        language models provide contextual questions and feedback.
                      </p>
                    </div>
                  </div>
                </div>
              </CliCard>

              <CliCard className='hover:shadow-glow-cyan group transition-all duration-300'>
                <div className='p-6'>
                  <div className='flex items-start space-x-4'>
                    <div className='cli-terminal flex-shrink-0 p-3 text-cli-cyan'>
                      <ChartBarIcon className='h-6 w-6' />
                    </div>
                    <div className='flex-1'>
                      <h3 className='mb-3 font-mono text-lg font-bold text-primary-500'>
                        ./dashboard --analytics
                      </h3>
                      <p className='font-mono text-sm leading-relaxed text-cli-light-gray'>
                        Track your progress with detailed analytics, session history, and
                        performance metrics all within the unified web interface.
                      </p>
                    </div>
                  </div>
                </div>
              </CliCard>
            </div>

            {/* Demo Terminal */}
            <div className='relative'>
              <TerminalWindow title='mockmate@webapp:~$ ./demo-interview-flow' className='h-96'>
                <div className='h-full space-y-3 overflow-auto p-6 font-mono text-sm'>
                  <div className='text-cli-green'>$ ./login --user=candidate</div>
                  <div className='text-cli-light-gray'>
                    Authentication successful. Redirecting to dashboard...
                  </div>
                  <div className='text-cli-green'>
                    $ ./start-interview --position="Software Engineer"
                  </div>
                  <div className='text-cli-light-gray'>Initializing AI interviewer...</div>
                  <div className='text-primary-500'>
                    AI: Hello! I'm your AI interviewer today. Let's discuss your experience with
                    React and system design.
                  </div>
                  <div className='text-cli-white'>
                    You: I have 5 years of experience building React applications...
                  </div>
                  <div className='text-primary-500'>
                    AI: That's great! Can you walk me through how you would architect a scalable
                    React application?
                  </div>
                  <div className='mt-4 text-cli-gray'>[Interview session in progress...]</div>
                  <div className='text-cli-green'>$ ./session-status --current</div>
                  <div className='text-cli-light-gray'>
                    Status: Active | Duration: 15:30 | Questions: 8/15
                  </div>
                  <div className='animate-terminal-cursor text-primary-500'>_</div>
                </div>
              </TerminalWindow>

              {/* Floating indicators */}
              <div className='absolute -right-4 -top-4 animate-float'>
                <CliBadge variant='success' className='animate-pulse'>
                  LIVE
                </CliBadge>
              </div>
              <div
                className='absolute -bottom-4 -left-4 animate-float'
                style={{ animationDelay: '1.5s' }}
              >
                <CliBadge variant='info'>WEB-BASED</CliBadge>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className='mt-16 text-center'>
            <div className='mx-auto max-w-3xl'>
              <h3 className='mb-6 font-mono text-2xl font-bold text-cli-white'>
                <TypingText
                  text='Ready to experience interviews in the web app?'
                  className='cli-glow'
                  speed={60}
                />
              </h3>
              <div className='flex flex-col justify-center gap-4 sm:flex-row'>
                <Link to='/register'>
                  <CliButton
                    variant='primary'
                    size='lg'
                    className='group flex w-full items-center justify-center'
                  >
                    <span>./access-webapp --register</span>
                    <ArrowRightIcon className='ml-2 h-5 w-5 transition-transform group-hover:translate-x-1' />
                  </CliButton>
                </Link>
                <Link to='/login'>
                  <CliButton variant='secondary' size='lg' className='w-full'>
                    ./webapp --existing-user
                  </CliButton>
                </Link>
              </div>
              <div className='mt-6 flex items-center justify-center space-x-4 font-mono text-sm text-cli-light-gray'>
                <span className='text-cli-green'>✓</span>
                <span>Instant access</span>
                <span className='text-cli-gray'>•</span>
                <span className='text-cli-green'>✓</span>
                <span>No downloads</span>
                <span className='text-cli-gray'>•</span>
                <span className='text-cli-green'>✓</span>
                <span>AI-powered</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className='relative bg-cli-black py-20'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mb-16 text-center'>
            <CliBadge variant='warning' className='mb-6'>
              PRICING MATRIX
            </CliBadge>
            <h2 className='mb-6 font-mono text-4xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> cat /pricing/plans.json
            </h2>
            <p className='mx-auto max-w-3xl font-mono text-xl text-cli-light-gray'>
              Select your deployment configuration. All plans include SSL encryption and 24/7
              monitoring.
            </p>
          </div>

          <div className='mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3'>
            {plansLoading ? (
              <div className='col-span-full py-12 text-center'>
                <TypingText
                  text='Loading pricing plans...'
                  className='mb-4 font-mono text-lg text-primary-500'
                />
                <div className='font-mono text-sm text-cli-gray'>
                  $ ./fetch-plans --from-database
                </div>
              </div>
            ) : pricingPlans.length === 0 ? (
              <div className='col-span-full py-12 text-center'>
                <div className='mb-2 font-mono text-lg text-cli-light-gray'>
                  No pricing plans available
                </div>
                <div className='font-mono text-sm text-cli-gray'>
                  $ echo "No plans found in database"
                </div>
              </div>
            ) : (
              pricingPlans.map((plan, index) => (
                <CliCard
                  key={plan.name}
                  className={`transition-all duration-500 hover:scale-105 ${plan.popular ? 'animate-pulse-golden' : ''}`}
                  glowing={plan.popular}
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  <div className='text-center'>
                    {plan.popular && (
                      <CliBadge variant='success' className='mb-4'>
                        RECOMMENDED
                      </CliBadge>
                    )}

                    <h3 className='mb-4 font-mono text-xl font-bold text-primary-500'>
                      ./{plan.name.toLowerCase()}
                    </h3>

                    <div className='mb-6'>
                      <div className='mb-2 font-mono text-4xl font-bold text-cli-white'>
                        {plan.price}
                        <span className='text-lg text-cli-light-gray'> one-time</span>
                      </div>
                      <div className='font-mono text-sm text-primary-500'>{plan.credits}</div>
                    </div>

                    <div className='mb-8 space-y-3 text-left'>
                      {plan.features.map((feature, featureIndex) => (
                        <div
                          key={feature}
                          className='flex items-center space-x-3 font-mono text-sm'
                        >
                          <span className='text-cli-green'>✓</span>
                          <span className='text-cli-light-gray'>{feature}</span>
                        </div>
                      ))}
                    </div>

                    <Link to='/register'>
                      <CliButton variant={plan.variant} size='md' className='w-full'>
                        ./deploy --plan={plan.name.toLowerCase()}
                      </CliButton>
                    </Link>
                  </div>
                </CliCard>
              ))
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className='relative border-t border-cli-gray bg-cli-dark py-20'>
        <div className='mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8'>
          <TerminalWindow title='mockmate@system:~$ ready-to-deploy' className='mb-8'>
            <div className='p-8'>
              <h2 className='mb-6 font-mono text-3xl font-bold text-cli-white'>
                <TypingText
                  text='System ready. Initialize interview protocol?'
                  className='cli-glow'
                  speed={80}
                />
              </h2>

              <p className='mb-8 font-mono text-lg leading-relaxed text-cli-light-gray'>
                Join <span className='text-primary-500'>10,000+</span> developers who have
                successfully deployed their interview skills with MockMate.
              </p>

              <div className='flex flex-col justify-center gap-4 sm:flex-row'>
                <Link to='/register'>
                  <CliButton
                    variant='primary'
                    size='lg'
                    className='group flex w-full items-center justify-center'
                  >
                    <span>sudo ./bootstrap --production</span>
                    <ArrowRightIcon className='ml-2 h-5 w-5 transition-transform group-hover:translate-x-1' />
                  </CliButton>
                </Link>
                <Link to='/login'>
                  <CliButton variant='ghost' size='lg' className='w-full'>
                    ./login --existing-user
                  </CliButton>
                </Link>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-cli-gray bg-cli-darker'>
        <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8'>
          <div className='flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0'>
            <Link to='/' className='group flex items-center space-x-3'>
              <div className='cli-terminal h-8 w-8 p-2 transition-all duration-300 group-hover:shadow-glow-golden'>
                <CommandLineIcon className='h-full w-full text-primary-500' />
              </div>
              <span className='font-mono text-xl font-bold text-cli-white'>
                Mock<span className='text-primary-500'>Mate</span>
              </span>
            </Link>

            <div className='flex items-center space-x-6 font-mono text-sm text-cli-light-gray'>
              <span>© 2024 MockMate Systems</span>
              <span className='text-cli-gray'>|</span>
              {(() => {
                const activePolicies = getActivePolicies();
                console.log('🔍 LandingPage Footer - Active policies:', activePolicies);
                return activePolicies.map((policy, index) => (
                  <React.Fragment key={policy.id}>
                    <Link
                      to={`/${policy.slug}`}
                      className='transition-colors hover:text-primary-500'
                    >
                      {policy.title}
                    </Link>
                    {index < activePolicies.length - 1 && <span className='text-cli-gray'>|</span>}
                  </React.Fragment>
                ));
              })()}
              {getActivePolicies().length > 0 && <span className='text-cli-gray'>|</span>}
              <span className='text-cli-green'>Status: Online</span>
            </div>
          </div>

          <div className='mt-8 flex items-center justify-center border-t border-cli-gray pt-8'>
            <div className='flex items-center space-x-4 font-mono text-xs text-cli-light-gray'>
              <span>Built with</span>
              <div className='flex items-center space-x-1'>
                <span className='text-red-500'>♥</span>
                <span>by developers, for developers</span>
              </div>
              <span className='text-cli-gray'>•</span>
              <span className='text-primary-500'>Powered by AI</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
