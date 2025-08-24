import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
  PlayIcon,
  PlusIcon,
  DocumentTextIcon,
  CreditCardIcon,
  ChartBarIcon,
  ClockIcon,
  StarIcon,
  TrophyIcon,
  CalendarIcon,
  UserCircleIcon,
  CommandLineIcon,
  CpuChipIcon,
  CodeBracketIcon,
  CheckIcon,
  DevicePhoneMobileIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from './ui/CliComponents';

interface Session {
  id: string;
  jobTitle: string;
  difficulty: string;
  sessionType: string;
  status: string;
  creditCost: number;
  score: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface Resume {
  id: string;
  filename: string;
  wordCount: number;
  sectionsFound: string[];
  skillsFound: string[];
  createdAt: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalSessions: 0,
    completedSessions: 0,
    averageScore: 0,
    totalResumes: 0,
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [sessionsRes, resumesRes] = await Promise.all([
        axios.get('/api/sessions?limit=5'),
        axios.get('/api/resumes?limit=3'),
      ]);

      setSessions(sessionsRes.data.sessions || []);
      setResumes(resumesRes.data.resumes || []);

      // Calculate stats
      const allSessions = sessionsRes.data.sessions || [];
      const completedSessions = allSessions.filter((s: Session) => s.status === 'completed');
      const totalScore = completedSessions.reduce(
        (sum: number, s: Session) => sum + (s.score || 0),
        0
      );

      setStats({
        totalSessions: allSessions.length,
        completedSessions: completedSessions.length,
        averageScore:
          completedSessions.length > 0 ? Math.round(totalScore / completedSessions.length) : 0,
        totalResumes: (resumesRes.data.resumes || []).length,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badgeMap = {
      created: { variant: 'info' as const, text: 'CREATED' },
      active: { variant: 'success' as const, text: 'ACTIVE' },
      paused: { variant: 'warning' as const, text: 'PAUSED' },
      completed: { variant: 'success' as const, text: 'COMPLETED' },
      cancelled: { variant: 'error' as const, text: 'CANCELLED' },
    };
    return (
      badgeMap[status as keyof typeof badgeMap] || {
        variant: 'default' as const,
        text: status.toUpperCase(),
      }
    );
  };

  const getDifficultyColor = (difficulty: string) => {
    const colors = {
      beginner: 'text-cli-green',
      intermediate: 'text-primary-500',
      advanced: 'text-red-400',
    };
    return colors[difficulty as keyof typeof colors] || 'text-cli-light-gray';
  };

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <TerminalWindow title='mockmate@loading:~$' className='w-96'>
          <div className='flex flex-col items-center space-y-4 p-8'>
            <div className='h-12 w-12 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
            <TypingText
              text='Initializing dashboard components...'
              className='text-cli-light-gray'
              speed={50}
            />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />

      {/* Header */}
      <header className='relative z-10 border-b border-cli-gray bg-cli-darker'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between py-4'>
            <Link to='/dashboard' className='group flex items-center space-x-3'>
              <div className='cli-terminal h-10 w-10 p-2 transition-all duration-300 group-hover:shadow-glow-golden'>
                <CommandLineIcon className='h-full w-full text-primary-500' />
              </div>
              <span className='cli-glow font-mono text-2xl font-bold text-cli-white'>
                Mock<span className='text-primary-500'>Mate</span>
              </span>
            </Link>

            <div className='flex items-center space-x-6'>
              <div className='flex items-center space-x-3'>
                <CliBadge variant='success' className='animate-pulse'>
                  CREDITS: {user?.credits}
                </CliBadge>
                <CliBadge variant='info'>USER: {user?.firstName?.toUpperCase()}</CliBadge>
              </div>

              <div className='flex items-center space-x-4'>
                <Link to='/'>
                  <CliButton variant='ghost' size='sm' onClick={logout}>
                    ./logout
                  </CliButton>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Welcome Section */}
        <TerminalWindow title={`mockmate@dashboard:~$ whoami`} className='mb-8'>
          <div className='p-6'>
            <TypingText
              text={`Welcome back, ${user?.firstName}! Ready to ace your next interview?`}
              className='mb-4 text-xl font-semibold text-primary-500'
              speed={30}
            />
            <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
              <div>$ ls -la /skills</div>
              <div className='text-cli-green'>drwxr-xr-x interviews ready_to_practice</div>
              <div>$ ./start_interview.sh --mode=ace</div>
            </div>
          </div>
        </TerminalWindow>

        {/* Quick Actions */}
        <div className='mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4'>
          <CliCard className='hover:shadow-glow-neon group transition-all duration-300'>
            <Link to='/session/create' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <PlayIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='success' className='animate-pulse'>
                  READY
                </CliBadge>
              </div>
              <h3 className='cli-glow mb-2 font-mono text-xl font-bold text-cli-white'>
                ./start-interview
              </h3>
              <p className='mb-3 font-mono text-sm text-cli-light-gray'>
                Initialize AI-powered mock session
              </p>
              <div className='font-mono text-xs text-cli-green'>
                $ ./interview --mode=practice --ai=enabled
              </div>
            </Link>
          </CliCard>

          <CliCard className='group transition-all duration-300 hover:shadow-glow-golden'>
            <Link to='/resumes' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <DocumentTextIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='info'>{stats.totalResumes} FILES</CliBadge>
              </div>
              <h3 className='cli-glow mb-2 font-mono text-xl font-bold text-cli-white'>
                ./manage-resumes
              </h3>
              <p className='mb-3 font-mono text-sm text-cli-light-gray'>
                Upload & manage CV documents
              </p>
              <div className='font-mono text-xs text-cli-green'>$ ls ~/documents/resumes/ -la</div>
            </Link>
          </CliCard>

          <CliCard className='hover:shadow-glow-warning group transition-all duration-300'>
            <Link to='/credits' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <CreditCardIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='warning'>{user?.credits} LEFT</CliBadge>
              </div>
              <h3 className='cli-glow mb-2 font-mono text-xl font-bold text-cli-white'>
                ./buy-credits
              </h3>
              <p className='mb-3 font-mono text-sm text-cli-light-gray'>
                Purchase interview credits
              </p>
              <div className='font-mono text-xs text-cli-green'>$ payment --package=premium</div>
            </Link>
          </CliCard>

          <CliCard className='hover:shadow-glow-cyan group transition-all duration-300'>
            <Link to='/download' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <DevicePhoneMobileIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='warning' className='animate-pulse'>
                  NEW
                </CliBadge>
              </div>
              <h3 className='cli-glow mb-2 font-mono text-xl font-bold text-cli-white'>
                ./download-app
              </h3>
              <p className='mb-3 font-mono text-sm text-cli-light-gray'>
                Get our mobile & desktop apps
              </p>
              <div className='font-mono text-xs text-cli-green'>
                $ ./install --platform=mobile,desktop
              </div>
            </Link>
          </CliCard>
        </div>

        {/* Stats Cards */}
        <div className='mb-8 grid grid-cols-1 gap-6 md:grid-cols-4'>
          <CliCard className='hover:shadow-glow-info group cursor-pointer transition-all duration-300'>
            <Link to='/sessions' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <ChartBarIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='info'>TOTAL</CliBadge>
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.totalSessions}
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Sessions Executed</div>
              <div className='mt-2 font-mono text-xs text-cli-green'>$ wc -l /var/log/sessions</div>
            </Link>
          </CliCard>

          <CliCard className='hover:shadow-glow-success group cursor-pointer transition-all duration-300'>
            <Link to='/sessions?filter=completed' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <CheckIcon className='h-6 w-6 text-cli-green' />
                </div>
                <CliBadge variant='success'>DONE</CliBadge>
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.completedSessions}
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Completed Tasks</div>
              <div className='mt-2 font-mono text-xs text-cli-green'>
                $ grep "COMPLETED" /var/log/sessions
              </div>
            </Link>
          </CliCard>

          <CliCard className='hover:shadow-glow-warning group cursor-pointer transition-all duration-300'>
            <Link to='/sessions?sort=score' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <StarIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='warning'>AVG</CliBadge>
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.averageScore}/10
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Performance Score</div>
              <div className='mt-2 font-mono text-xs text-cli-green'>
                $ awk 'avg score /var/log/results'
              </div>
            </Link>
          </CliCard>

          <CliCard className='group cursor-pointer transition-all duration-300 hover:shadow-glow-golden'>
            <Link to='/resumes' className='block p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                  <DocumentTextIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='default'>DOCS</CliBadge>
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.totalResumes}
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Resume Files</div>
              <div className='mt-2 font-mono text-xs text-cli-green'>
                $ find ~/resumes -type f | wc -l
              </div>
            </Link>
          </CliCard>
        </div>

        <div className='grid grid-cols-1 gap-8 lg:grid-cols-2'>
          {/* Recent Sessions */}
          <TerminalWindow title='mockmate@sessions:~$ tail -f /var/log/sessions' className=''>
            <div className='p-6'>
              <div className='mb-6 flex items-center justify-between'>
                <TypingText
                  text='Recent Interview Sessions'
                  className='font-mono font-bold text-primary-500'
                  speed={40}
                />
                <Link to='/sessions'>
                  <CliButton variant='ghost' size='sm'>
                    ./view-all --sessions
                  </CliButton>
                </Link>
              </div>

              {sessions.length === 0 ? (
                <div className='py-8 text-center'>
                  <div className='cli-terminal mx-auto mb-4 w-fit rounded-lg p-4'>
                    <PlayIcon className='h-8 w-8 text-cli-gray' />
                  </div>
                  <p className='mb-4 font-mono text-cli-light-gray'>
                    $ find /sessions -name "*.log" | wc -l
                  </p>
                  <p className='mb-4 font-mono text-cli-gray'>0</p>
                  <Link to='/session/create'>
                    <CliButton variant='primary'>
                      <PlusIcon className='mr-2 h-4 w-4' />
                      ./create-session --new
                    </CliButton>
                  </Link>
                </div>
              ) : (
                <div className='space-y-3'>
                  {sessions.map((session, index) => {
                    const badge = getStatusBadge(session.status);
                    const getSessionUrl = (session: Session) => {
                      if (session.status === 'completed') {
                        return `/session/${session.id}/view`;
                      } else if (session.status === 'active' || session.status === 'paused') {
                        return `/session/${session.id}`;
                      } else {
                        return `/sessions`; // For created sessions, go to sessions list
                      }
                    };
                    
                    return (
                      <CliCard
                        key={session.id}
                        className='hover:shadow-glow-info group cursor-pointer transition-all'
                      >
                        <Link to={getSessionUrl(session)} className='block p-4'>
                          <div className='mb-3 flex items-center justify-between'>
                            <h3 className='cli-glow font-mono font-bold text-cli-white'>
                              {session.jobTitle}
                            </h3>
                            <CliBadge variant={badge.variant}>{badge.text}</CliBadge>
                          </div>
                          <div className='flex items-center justify-between'>
                            <div className='flex items-center space-x-4 text-sm'>
                              <span
                                className={`font-mono ${getDifficultyColor(session.difficulty)}`}
                              >
                                {session.difficulty.toUpperCase()}
                              </span>
                              <span className='font-mono text-cli-light-gray'>
                                {session.sessionType}
                              </span>
                              {session.score && (
                                <span className='font-mono font-bold text-primary-500'>
                                  {session.score}/10
                                </span>
                              )}
                            </div>
                            <div className='font-mono text-xs text-cli-gray'>
                              {new Date(session.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className='mt-2 font-mono text-xs text-cli-green'>
                            $ cat session_{String(index + 1).padStart(3, '0')}.log
                          </div>
                        </Link>
                      </CliCard>
                    );
                  })}
                </div>
              )}
            </div>
          </TerminalWindow>

          {/* Resume Library */}
          <TerminalWindow title='mockmate@documents:~$ ls -la ~/resumes/' className=''>
            <div className='p-6'>
              <div className='mb-6 flex items-center justify-between'>
                <TypingText
                  text='Resume Document Store'
                  className='font-mono font-bold text-primary-500'
                  speed={40}
                />
                <Link to='/resumes'>
                  <CliButton variant='ghost' size='sm'>
                    ./manage-docs --all
                  </CliButton>
                </Link>
              </div>

              {resumes.length === 0 ? (
                <div className='py-8 text-center'>
                  <div className='cli-terminal mx-auto mb-4 w-fit rounded-lg p-4'>
                    <DocumentTextIcon className='h-8 w-8 text-cli-gray' />
                  </div>
                  <p className='mb-4 font-mono text-cli-light-gray'>$ ls ~/documents/resumes/</p>
                  <p className='mb-4 font-mono text-cli-gray'>
                    ls: cannot access '~/documents/resumes/': No such file or directory
                  </p>
                  <Link to='/resumes'>
                    <CliButton variant='primary'>
                      <PlusIcon className='mr-2 h-4 w-4' />
                      ./upload-resume --new
                    </CliButton>
                  </Link>
                </div>
              ) : (
                <div className='space-y-3'>
                  {resumes.map((resume, index) => (
                    <CliCard
                      key={resume.id}
                      className='group cursor-pointer transition-all hover:shadow-glow-golden'
                    >
                      <Link to='/resumes' className='block p-4'>
                        <div className='mb-3 flex items-center justify-between'>
                          <h3 className='cli-glow font-mono font-bold text-cli-white'>
                            {resume.filename}
                          </h3>
                          <CliBadge variant='info'>{resume.wordCount} WORDS</CliBadge>
                        </div>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center space-x-4 text-sm'>
                            <span className='font-mono text-cli-green'>
                              {resume.sectionsFound.length} sections
                            </span>
                            <span className='font-mono text-primary-500'>
                              {resume.skillsFound.length} skills
                            </span>
                          </div>
                          <div className='font-mono text-xs text-cli-gray'>
                            {new Date(resume.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <div className='mt-2 font-mono text-xs text-cli-green'>
                          $ file {resume.filename} | head -1
                        </div>
                      </Link>
                    </CliCard>
                  ))}
                </div>
              )}
            </div>
          </TerminalWindow>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
