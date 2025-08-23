import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  PlayIcon,
  ChartBarIcon,
  CalendarIcon,
  ClockIcon,
  TrophyIcon,
  EyeIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  StopIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';

interface Session {
  id: string;
  jobTitle: string;
  jobDescription?: string;
  difficulty: string;
  sessionType: string;
  duration: number;
  status: string;
  creditCost: number;
  score: number | null;
  createdAt: string;
  completedAt: string | null;
  questions?: number;
  answeredQuestions?: number;
}

const SessionsList: React.FC = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const response = await axios.get('/api/sessions');
      setSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleStartSession = async (sessionId: string) => {
    setActionLoading(`start-${sessionId}`);
    try {
      await axios.post(`/api/sessions/${sessionId}/start`);
      fetchSessions(); // Refresh the list
      // Redirect to session page
      window.location.href = `/session/${sessionId}`;
    } catch (error: any) {
      console.error('Failed to start session:', error);
      alert(error.response?.data?.error || 'Failed to start session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEndSession = async (sessionId: string) => {
    setActionLoading(`end-${sessionId}`);
    try {
      await axios.put(`/api/sessions/${sessionId}`, { status: 'completed' });
      fetchSessions(); // Refresh the list
    } catch (error: any) {
      console.error('Failed to end session:', error);
      alert(error.response?.data?.error || 'Failed to end session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSession = async (sessionId: string, force: boolean = false) => {
    setActionLoading(`delete-${sessionId}`);
    try {
      await axios.delete(`/api/sessions/${sessionId}${force ? '?force=true' : ''}`);
      fetchSessions(); // Refresh the list
      setDeleteConfirmId(null);
    } catch (error: any) {
      console.error('Failed to delete session:', error);
      if (error.response?.data?.code === 'SESSION_DELETION_REQUIRES_CONFIRMATION') {
        // Use window.confirm instead of direct confirm to avoid ESLint error
        const confirmed = window.confirm(
          'This session has been started. Are you sure you want to delete it permanently?'
        );
        if (confirmed) {
          handleDeleteSession(sessionId, true);
          return;
        }
      } else {
        alert(error.response?.data?.error || 'Failed to delete session');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownloadPDF = async (sessionId: string) => {
    setActionLoading(`download-${sessionId}`);
    try {
      const response = await axios.get(`/api/sessions/${sessionId}/download-pdf`, {
        responseType: 'blob',
      });

      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `interview-session-${sessionId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Failed to download PDF:', error);
      alert(
        error.response?.data?.error || 'Failed to download PDF. Make sure the session is completed.'
      );
    } finally {
      setActionLoading(null);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <TrophyIcon className='h-5 w-5 text-cli-green' />;
      case 'active':
        return <PlayIcon className='h-5 w-5 text-primary-500' />;
      case 'paused':
        return <ClockIcon className='h-5 w-5 text-primary-500' />;
      default:
        return <ChartBarIcon className='h-5 w-5 text-primary-500' />;
    }
  };

  const filteredSessions = sessions.filter(session => {
    if (filter === 'all') return true;
    return session.status === filter;
  });

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    switch (sortBy) {
      case 'createdAt':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'score':
        return (b.score || 0) - (a.score || 0);
      case 'jobTitle':
        return a.jobTitle.localeCompare(b.jobTitle);
      default:
        return 0;
    }
  });

  const stats = {
    total: sessions.length,
    completed: sessions.filter(s => s.status === 'completed').length,
    averageScore:
      sessions.filter(s => s.score !== null).reduce((sum, s) => sum + (s.score || 0), 0) /
        sessions.filter(s => s.score !== null).length || 0,
    totalCreditsSpent: sessions.reduce((sum, s) => sum + s.creditCost, 0),
  };

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <TerminalWindow title='mockmate@loading:~$' className='relative z-10 w-96'>
          <div className='flex flex-col items-center space-y-4 p-8'>
            <div className='h-12 w-12 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
            <TypingText
              text='Loading session database...'
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
            <div className='flex items-center space-x-4'>
              <Link
                to='/dashboard'
                className='flex items-center space-x-2 font-mono text-cli-light-gray transition-colors hover:text-cli-white hover:shadow-glow-golden'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>$ cd ../dashboard</span>
              </Link>
            </div>
            <div className='flex items-center space-x-4'>
              <CliBadge variant='success' className='animate-pulse'>
                CREDITS: {user?.credits}
              </CliBadge>
              <CliButton
                variant='primary'
                className='flex items-center'
                onClick={() => (window.location.href = '/session/create')}
              >
                <PlusIcon className='mr-2 h-4 w-4' />
                ./new-session --create
              </CliButton>
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Welcome Section */}
        <TerminalWindow title='mockmate@sessions:~$ ls -la ./interview-logs/' className='mb-8'>
          <div className='p-6'>
            <TypingText
              text='Interview Session Database'
              className='cli-glow mb-4 text-2xl font-semibold text-primary-500'
              speed={30}
            />
            <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
              <div>$ find ./sessions -type f -name "*.log" | wc -l</div>
              <div className='text-cli-green'>{stats.total} session files found</div>
              <div>$ grep -c "COMPLETED" ./sessions/*.log</div>
              <div className='text-cli-green'>{stats.completed} completed interviews</div>
            </div>
          </div>
        </TerminalWindow>

        {/* Stats Cards */}
        <div className='mb-8 grid grid-cols-1 gap-6 md:grid-cols-4'>
          <CliCard className='hover:shadow-glow-info group cursor-pointer transition-all duration-300'
            onClick={() => setFilter('all')}
          >
            <div className='text-center p-6'>
              <div className='mb-4 flex items-center justify-center'>
                <ChartBarIcon className='h-8 w-8 text-primary-500' />
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.total}
              </div>
              <div className='mb-1 font-mono text-xs text-cli-light-gray'>TOTAL SESSIONS</div>
              <div className='font-mono text-xs text-cli-green'>$ find . -name "*.session"</div>
            </div>
          </CliCard>

          <CliCard className='hover:shadow-glow-success group cursor-pointer transition-all duration-300'
            onClick={() => setFilter('completed')}
          >
            <div className='text-center p-6'>
              <div className='mb-4 flex items-center justify-center'>
                <TrophyIcon className='h-8 w-8 text-cli-green' />
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.completed}
              </div>
              <div className='mb-1 font-mono text-xs text-cli-light-gray'>COMPLETED</div>
              <div className='font-mono text-xs text-cli-green'>$ grep "COMPLETED" *.log</div>
            </div>
          </CliCard>

          <CliCard className='hover:shadow-glow-warning group cursor-pointer transition-all duration-300'
            onClick={() => setSortBy('score')}
          >
            <div className='text-center p-6'>
              <div className='mb-4 flex items-center justify-center'>
                <ClockIcon className='h-8 w-8 text-primary-500' />
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.averageScore > 0 ? `${Math.round(stats.averageScore)}/10` : 'N/A'}
              </div>
              <div className='mb-1 font-mono text-xs text-cli-light-gray'>AVERAGE SCORE</div>
              <div className='font-mono text-xs text-cli-green'>$ awk 'avg score' results.log</div>
            </div>
          </CliCard>

          <CliCard className='group cursor-pointer transition-all duration-300 hover:shadow-glow-golden'>
            <Link to='/credits' className='block text-center p-6'>
              <div className='mb-4 flex items-center justify-center'>
                <span className='text-2xl'>💳</span>
              </div>
              <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                {stats.totalCreditsSpent}
              </div>
              <div className='mb-1 font-mono text-xs text-cli-light-gray'>CREDITS USED</div>
              <div className='font-mono text-xs text-cli-green'>$ sum credit_usage.log</div>
            </Link>
          </CliCard>
        </div>

        {/* Filters and Controls */}
        <TerminalWindow
          title='mockmate@filter:~$ ./session-filter.sh --interactive'
          className='mb-6'
        >
          <div className='border-b border-cli-gray p-6'>
            <div className='flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0'>
              <div className='flex items-center space-x-6'>
                <div className='flex items-center space-x-2'>
                  <span className='font-mono text-sm text-primary-500'>$ --filter=</span>
                  <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className='rounded border border-cli-gray bg-cli-dark px-3 py-1 font-mono text-sm text-cli-white focus:border-primary-500 focus:outline-none'
                  >
                    <option value='all'>all</option>
                    <option value='completed'>completed</option>
                    <option value='active'>active</option>
                    <option value='paused'>paused</option>
                    <option value='created'>created</option>
                    <option value='cancelled'>cancelled</option>
                  </select>
                </div>
                <div className='flex items-center space-x-2'>
                  <span className='font-mono text-sm text-primary-500'>$ --sort=</span>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    className='rounded border border-cli-gray bg-cli-dark px-3 py-1 font-mono text-sm text-cli-white focus:border-primary-500 focus:outline-none'
                  >
                    <option value='createdAt'>created</option>
                    <option value='score'>score</option>
                    <option value='jobTitle'>title</option>
                  </select>
                </div>
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>
                $ echo "{sortedSessions.length}/{sessions.length} sessions found"
              </div>
            </div>
          </div>

          <div className='p-6'>
            {sortedSessions.length === 0 ? (
              <div className='py-16 text-center'>
                <div className='cli-terminal hover:shadow-glow-warning mx-auto max-w-md rounded-lg p-8 transition-all'>
                  <PlayIcon className='mx-auto mb-6 h-20 w-20 text-cli-gray' />
                  <TypingText
                    text={
                      filter === 'all' ? 'No Sessions Found' : `No ${filter.toUpperCase()} Sessions`
                    }
                    className='cli-glow mb-4 font-mono text-xl font-bold text-primary-500'
                    speed={50}
                  />
                  <div className='mb-6 space-y-2 font-mono text-sm text-cli-light-gray'>
                    <div>$ ls ./sessions/{filter === 'all' ? '*' : filter}.log</div>
                    <div className='text-red-400'>ls: no match found</div>
                    <div className='mt-4 text-xs text-cli-gray'>
                      {filter === 'all'
                        ? '# Initialize your first interview session'
                        : `# No ${filter} sessions in database`}
                    </div>
                  </div>
                  <CliButton
                    variant='primary'
                    onClick={() => (window.location.href = '/session/create')}
                    className='mx-auto flex items-center'
                  >
                    <PlusIcon className='mr-2 h-4 w-4' />
                    ./create-session --new
                  </CliButton>
                </div>
              </div>
            ) : (
              <div className='space-y-4'>
                {sortedSessions.map((session, index) => {
                  const badge = getStatusBadge(session.status);
                  const getCardClickUrl = (session: any) => {
                    if (session.status === 'completed') {
                      return `/session/${session.id}/view`;
                    } else if (session.status === 'active' || session.status === 'paused') {
                      return `/session/${session.id}`;
                    } else {
                      return `/session/${session.id}/view`; // For created sessions, view details
                    }
                  };
                  
                  return (
                    <CliCard
                      key={session.id}
                      className='hover:shadow-glow-info group cursor-pointer transition-all duration-300'
                    >
                      <div className='relative'>
                        {/* Clickable overlay for the entire card */}
                        <Link 
                          to={getCardClickUrl(session)} 
                          className='absolute inset-0 z-0'
                          aria-label={`View session: ${session.jobTitle}`}
                        />
                        
                        <div className='relative z-10 p-6'>
                          <div className='mb-4 flex items-center justify-between'>
                            <div className='flex items-center space-x-4'>
                              <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                                {getStatusIcon(session.status)}
                              </div>
                              <div className='flex-1'>
                                <div className='mb-2 flex items-center space-x-3'>
                                  <h3 className='cli-glow font-mono text-lg font-bold text-cli-white'>
                                    {session.jobTitle}
                                  </h3>
                                  <CliBadge variant={badge.variant} className='animate-pulse'>
                                    {badge.text}
                                  </CliBadge>
                                </div>
                                <div className='flex items-center space-x-6 font-mono text-sm'>
                                  <span
                                    className={`font-bold ${getDifficultyColor(session.difficulty)}`}
                                  >
                                    {session.difficulty.toUpperCase()}
                                  </span>
                                  <span className='text-cli-light-gray'>{session.sessionType}</span>
                                  <span className='text-cli-light-gray'>{session.duration}min</span>
                                  <span className='text-primary-500'>
                                    {session.creditCost} credits
                                  </span>
                                  {session.score && (
                                    <span className='font-bold text-cli-green'>
                                      SCORE: {session.score}/10
                                    </span>
                                  )}
                                </div>
                                {session.jobDescription && (
                                  <div className='mt-3 rounded border-l-4 border-cli-gray bg-cli-darker p-3'>
                                    <p className='font-mono text-xs leading-relaxed text-cli-light-gray'>
                                      {session.jobDescription.length > 150
                                        ? `${session.jobDescription.substring(0, 150)}...`
                                        : session.jobDescription}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className='mt-4 border-t border-cli-gray pt-4'>
                            <div className='flex items-center justify-between'>
                              <div className='space-y-1 font-mono text-xs text-cli-gray'>
                                <div className='flex items-center'>
                                  <CalendarIcon className='mr-2 h-3 w-3 text-primary-500' />$ created:{' '}
                                  {new Date(session.createdAt).toLocaleDateString()}
                                </div>
                                {session.completedAt && (
                                  <div>
                                    $ completed: {new Date(session.completedAt).toLocaleDateString()}
                                  </div>
                                )}
                              </div>

                              <div className='flex items-center space-x-2'>
                                {/* View Session */}
                                <CliButton
                                  size='sm'
                                  variant='ghost'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.location.href = `/session/${session.id}/view`;
                                  }}
                                  className='relative z-20 text-xs'
                                >
                                  <EyeIcon className='mr-1 h-3 w-3' />
                                  ./view
                                </CliButton>

                                {/* Download PDF - Only for completed sessions */}
                                {session.status === 'completed' && (
                                  <CliButton
                                    size='sm'
                                    variant='ghost'
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadPDF(session.id);
                                    }}
                                    disabled={actionLoading === `download-${session.id}`}
                                    className='relative z-20 text-xs text-cli-green'
                                  >
                                    {actionLoading === `download-${session.id}` ? (
                                      <div className='mr-1 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent' />
                                    ) : (
                                      <ArrowDownTrayIcon className='mr-1 h-3 w-3' />
                                    )}
                                    ./pdf
                                  </CliButton>
                                )}

                                {/* Session Start - Only for created sessions */}
                                {session.status === 'created' && (
                                  <CliButton
                                    size='sm'
                                    variant='primary'
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartSession(session.id);
                                    }}
                                    disabled={actionLoading === `start-${session.id}`}
                                    className='relative z-20 text-xs'
                                  >
                                    {actionLoading === `start-${session.id}` ? (
                                      <div className='mr-1 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent' />
                                    ) : (
                                      <PlayIcon className='mr-1 h-3 w-3' />
                                    )}
                                    ./start
                                  </CliButton>
                                )}

                                {/* Continue Session - For active/paused sessions */}
                                {(session.status === 'active' || session.status === 'paused') && (
                                  <CliButton
                                    size='sm'
                                    variant='primary'
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.location.href = `/session/${session.id}`;
                                    }}
                                    className='relative z-20 text-xs'
                                  >
                                    <PlayIcon className='mr-1 h-3 w-3' />
                                    ./continue
                                  </CliButton>
                                )}

                                {/* End Session - Only for active/paused sessions */}
                                {(session.status === 'active' || session.status === 'paused') && (
                                  <CliButton
                                    size='sm'
                                    variant='danger'
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEndSession(session.id);
                                    }}
                                    disabled={actionLoading === `end-${session.id}`}
                                    className='relative z-20 text-xs'
                                  >
                                    {actionLoading === `end-${session.id}` ? (
                                      <div className='mr-1 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent' />
                                    ) : (
                                      <StopIcon className='mr-1 h-3 w-3' />
                                    )}
                                    ./end
                                  </CliButton>
                                )}

                                {/* Edit Session - Only for created (not started) sessions */}
                                {session.status === 'created' && (
                                  <CliButton
                                    size='sm'
                                    variant='ghost'
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.location.href = `/session/${session.id}/edit`;
                                    }}
                                    className='relative z-20 text-xs text-primary-500'
                                  >
                                    <PencilIcon className='mr-1 h-3 w-3' />
                                    ./edit
                                  </CliButton>
                                )}

                                {/* Delete Session */}
                                <CliButton
                                  size='sm'
                                  variant='danger'
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (deleteConfirmId === session.id) {
                                      handleDeleteSession(session.id);
                                    } else {
                                      setDeleteConfirmId(session.id);
                                      // Reset confirmation after 3 seconds
                                      setTimeout(() => setDeleteConfirmId(null), 3000);
                                    }
                                  }}
                                  disabled={actionLoading === `delete-${session.id}`}
                                  className={`relative z-20 text-xs ${deleteConfirmId === session.id ? 'animate-pulse' : ''}`}
                                >
                                  {actionLoading === `delete-${session.id}` ? (
                                    <div className='mr-1 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent' />
                                  ) : (
                                    <TrashIcon className='mr-1 h-3 w-3' />
                                  )}
                                  {deleteConfirmId === session.id ? './confirm' : './rm'}
                                </CliButton>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CliCard>
                  );
                })}
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default SessionsList;
