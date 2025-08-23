import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliSelect,
  CliInput,
} from '../components/ui/CliComponents';
import {
  ClockIcon,
  UsersIcon,
  ComputerDesktopIcon,
  CurrencyDollarIcon,
  EyeIcon,
  ArrowPathIcon,
  FunnelIcon,
  ChevronLeftIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

interface Session {
  id: string;
  sessionName: string;
  companyName: string;
  jobTitle: string;
  interviewType: string;
  difficultyLevel: string;
  status: string;
  creditsUsed: number;
  duration: number;
  desktopConnected: boolean;
  createdAt: string;
  startedAt: string;
  endedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  messageCount: number;
  questionsCount: number;
  answersCount: number;
}

interface SessionDetail {
  session: Session & {
    jobDescription?: string;
    sessionConfig?: any;
    sessionNotes?: string;
    statistics: {
      totalMessages: number;
      questionsCount: number;
      answersCount: number;
      performanceScore?: number;
    };
  };
  messages: Array<{
    id: string;
    type: string;
    content: string;
    metadata?: any;
    timestamp: string;
    confidence?: number;
  }>;
  questions: Array<{
    id: string;
    questionNumber: number;
    questionText: string;
    questionType: string;
    difficultyLevel: string;
    category: string;
    timeAsked: string;
    timeLimitSeconds?: number;
    answer?: {
      id: string;
      answerText: string;
      timeStarted: string;
      timeSubmitted: string;
      durationSeconds: number;
      isComplete: boolean;
      aiScore?: number;
      aiFeedback?: string;
      keywordsMentioned: string[];
    };
  }>;
  analytics?: {
    totalQuestionsAsked: number;
    totalAnswersGiven: number;
    avgResponseTime: number;
    communicationScore?: number;
    technicalAccuracyScore?: number;
    confidenceScore?: number;
    completenessScore?: number;
    overallScore?: number;
    strengths?: string[];
    improvementAreas?: string[];
    recommendations?: string[];
    aiModel?: string;
  };
}

const Sessions: React.FC = () => {
  const { user, hasPermission } = useAdminAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    difficulty: 'all',
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  useEffect(() => {
    if (hasPermission('sessions.read')) {
      fetchSessions();
    }
  }, [page, filters, hasPermission]);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...filters,
      });

      const response = await fetch(`/api/admin/sessions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setSessions(result.data.sessions || []);
          setTotalPages(result.data.pagination?.totalPages || 1);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionDetail = async (sessionId: string) => {
    setDetailLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(`/api/admin/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setSelectedSession(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch session detail:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CliBadge variant='success'>COMPLETED</CliBadge>;
      case 'active':
        return <CliBadge variant='warning'>ACTIVE</CliBadge>;
      case 'cancelled':
        return <CliBadge variant='danger'>CANCELLED</CliBadge>;
      default:
        return <CliBadge variant='secondary'>{status.toUpperCase()}</CliBadge>;
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  if (!hasPermission('sessions.read')) {
    return (
      <TerminalWindow title='admin@mockmate:~$ ./sessions --access-denied'>
        <div className='p-6'>
          <div className='text-center'>
            <div className='mb-4 font-mono text-xl text-red-400'>ACCESS DENIED</div>
            <TypingText
              text='Insufficient permissions to access session data'
              className='text-cli-light-gray'
            />
          </div>
        </div>
      </TerminalWindow>
    );
  }

  if (selectedSession) {
    return (
      <div className='space-y-6'>
        {/* Session Detail Header */}
        <TerminalWindow
          title={`admin@mockmate:~$ ./session --id=${selectedSession.session.id.slice(0, 8)}`}
        >
          <div className='p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <div className='flex items-center space-x-3'>
                <CliButton variant='secondary' onClick={() => setSelectedSession(null)}>
                  <ChevronLeftIcon className='mr-1 h-4 w-4' />
                  Back to Sessions
                </CliButton>
                <TypingText
                  text={`Session Details: ${selectedSession.session.sessionName}`}
                  className='text-xl font-semibold text-primary-500'
                />
              </div>
              {getStatusBadge(selectedSession.session.status)}
            </div>

            <div className='grid grid-cols-1 gap-4 font-mono text-sm text-cli-light-gray md:grid-cols-3'>
              <div>
                <span className='text-cli-green'>Company:</span>{' '}
                {selectedSession.session.companyName}
              </div>
              <div>
                <span className='text-cli-green'>Position:</span> {selectedSession.session.jobTitle}
              </div>
              <div>
                <span className='text-cli-green'>Type:</span>{' '}
                {selectedSession.session.interviewType}
              </div>
              <div>
                <span className='text-cli-green'>Duration:</span>{' '}
                {formatDuration(selectedSession.session.duration)}
              </div>
              <div>
                <span className='text-cli-green'>Credits:</span>{' '}
                {selectedSession.session.creditsUsed}
              </div>
              <div>
                <span className='text-cli-green'>Started:</span>{' '}
                {formatTimestamp(selectedSession.session.startedAt)}
              </div>
            </div>
          </div>
        </TerminalWindow>

        {/* Session Analytics */}
        {selectedSession.analytics && (
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4'>
            <CliCard className='hover:shadow-glow-info group transition-all'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2'>
                  <QuestionMarkCircleIcon className='h-6 w-6 text-cli-cyan' />
                </div>
                <CliBadge variant='info'>QUESTIONS</CliBadge>
              </div>
              <div className='space-y-2'>
                <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
                  {selectedSession.analytics.totalQuestionsAsked}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Total Asked</div>
                <div className='font-mono text-xs text-cli-green'>
                  Avg Response: {selectedSession.analytics.avgResponseTime.toFixed(1)}s
                </div>
              </div>
            </CliCard>

            <CliCard className='hover:shadow-glow-success group transition-all'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2'>
                  <ChatBubbleLeftIcon className='h-6 w-6 text-cli-green' />
                </div>
                <CliBadge variant='success'>ANSWERS</CliBadge>
              </div>
              <div className='space-y-2'>
                <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
                  {selectedSession.analytics.totalAnswersGiven}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Total Given</div>
                <div className='font-mono text-xs text-cli-green'>
                  Completion Rate:{' '}
                  {Math.round(
                    (selectedSession.analytics.totalAnswersGiven /
                      selectedSession.analytics.totalQuestionsAsked) *
                      100
                  )}
                  %
                </div>
              </div>
            </CliCard>

            {selectedSession.analytics.overallScore && (
              <CliCard className='hover:shadow-glow-warning group transition-all'>
                <div className='mb-4 flex items-center justify-between'>
                  <div className='cli-terminal rounded-lg p-2'>
                    <ChartBarIcon className='h-6 w-6 text-primary-500' />
                  </div>
                  <CliBadge variant='warning'>SCORE</CliBadge>
                </div>
                <div className='space-y-2'>
                  <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
                    {selectedSession.analytics.overallScore.toFixed(1)}
                  </div>
                  <div className='font-mono text-sm text-cli-light-gray'>Overall Score</div>
                  <div className='font-mono text-xs text-cli-green'>
                    Tech: {selectedSession.analytics.technicalAccuracyScore?.toFixed(1) || 'N/A'}
                  </div>
                </div>
              </CliCard>
            )}

            <CliCard className='group transition-all hover:shadow-glow-golden'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='cli-terminal rounded-lg p-2'>
                  <UsersIcon className='h-6 w-6 text-primary-500' />
                </div>
                <CliBadge variant='default'>USER</CliBadge>
              </div>
              <div className='space-y-2'>
                <div className='font-mono text-lg font-bold text-cli-white'>
                  {selectedSession.session.user.name}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>
                  {selectedSession.session.user.email}
                </div>
                <div className='font-mono text-xs text-cli-green'>
                  Messages: {selectedSession.session.statistics.totalMessages}
                </div>
              </div>
            </CliCard>
          </div>
        )}

        {/* Questions and Answers */}
        <TerminalWindow title='admin@mockmate:~$ ./session --questions-answers'>
          <div className='p-6'>
            <TypingText
              text='Interview Questions & Answers'
              className='mb-6 font-mono font-bold text-primary-500'
            />

            <div className='space-y-4'>
              {selectedSession.questions && selectedSession.questions.length > 0 ? (
                selectedSession.questions.map((question, index) => (
                  <CliCard
                    key={question.id}
                    className='hover:shadow-glow-info group transition-all'
                  >
                    <div className='p-4'>
                      <div className='mb-3 flex items-start justify-between'>
                        <div className='flex items-center space-x-3'>
                          <div className='cli-terminal flex h-8 w-8 items-center justify-center rounded-full'>
                            <span className='font-mono text-sm font-bold text-primary-500'>
                              {question.questionNumber}
                            </span>
                          </div>
                          <div>
                            <CliBadge variant='info' className='text-xs'>
                              {question.questionType.toUpperCase()}
                            </CliBadge>
                            <CliBadge variant='warning' className='ml-2 text-xs'>
                              {question.difficultyLevel.toUpperCase()}
                            </CliBadge>
                          </div>
                        </div>
                        <div className='font-mono text-xs text-cli-light-gray'>
                          {formatTimestamp(question.timeAsked)}
                        </div>
                      </div>

                      <div className='mb-4'>
                        <div className='mb-2 font-mono text-sm font-semibold text-cli-green'>
                          Question:
                        </div>
                        <div className='font-mono text-sm text-cli-white'>
                          {question.questionText}
                        </div>
                      </div>

                      {question.answer ? (
                        <div>
                          <div className='mb-2 font-mono text-sm font-semibold text-cli-green'>
                            Answer:
                          </div>
                          <div className='mb-2 font-mono text-sm text-cli-light-gray'>
                            {question.answer.answerText}
                          </div>
                          <div className='grid grid-cols-2 gap-2 text-xs md:grid-cols-4'>
                            <div>
                              <span className='text-cli-green'>Duration:</span>{' '}
                              {question.answer.durationSeconds}s
                            </div>
                            <div>
                              <span className='text-cli-green'>Complete:</span>{' '}
                              {question.answer.isComplete ? 'Yes' : 'No'}
                            </div>
                            {question.answer.aiScore && (
                              <div>
                                <span className='text-cli-green'>AI Score:</span>{' '}
                                {question.answer.aiScore.toFixed(1)}
                              </div>
                            )}
                            <div>
                              <span className='text-cli-green'>Keywords:</span>{' '}
                              {question.answer.keywordsMentioned.length}
                            </div>
                          </div>
                          {question.answer.aiFeedback && (
                            <div className='cli-terminal mt-2 rounded p-2 text-xs'>
                              <div className='mb-1 font-semibold text-cli-green'>AI Feedback:</div>
                              <div className='text-cli-light-gray'>
                                {question.answer.aiFeedback}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className='font-mono text-sm text-cli-amber'>No answer provided</div>
                      )}
                    </div>
                  </CliCard>
                ))
              ) : (
                <div className='py-8 text-center'>
                  <QuestionMarkCircleIcon className='mx-auto mb-4 h-12 w-12 text-cli-gray' />
                  <div className='font-mono text-cli-light-gray'>
                    No questions found for this session
                  </div>
                </div>
              )}
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./sessions --list --verbose'>
        <div className='p-6'>
          <div className='mb-4 flex items-center justify-between'>
            <TypingText
              text='Interview Sessions Dashboard'
              className='text-xl font-semibold text-primary-500'
            />
            <CliBadge variant='success' className='animate-pulse'>
              LIVE DATA
            </CliBadge>
          </div>

          <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
            <div>$ find /var/sessions -name "*.log" | wc -l</div>
            <div className='pl-6 text-cli-green'>
              Found {sessions.length} sessions (Page {page} of {totalPages})
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Filters */}
      <TerminalWindow title='admin@mockmate:~$ ./filter-sessions --interactive'>
        <div className='p-6'>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6'>
            <CliSelect
              value={filters.status}
              onChange={e => handleFilterChange('status', e.target.value)}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'completed', label: 'Completed' },
                { value: 'active', label: 'Active' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />

            <CliSelect
              value={filters.type}
              onChange={e => handleFilterChange('type', e.target.value)}
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'technical', label: 'Technical' },
                { value: 'behavioral', label: 'Behavioral' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />

            <CliSelect
              value={filters.difficulty}
              onChange={e => handleFilterChange('difficulty', e.target.value)}
              options={[
                { value: 'all', label: 'All Difficulties' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />

            <CliInput
              placeholder='Search sessions...'
              value={filters.search}
              onChange={e => handleFilterChange('search', e.target.value)}
            />

            <CliSelect
              value={filters.sortBy}
              onChange={e => handleFilterChange('sortBy', e.target.value)}
              options={[
                { value: 'created_at', label: 'Created Date' },
                { value: 'started_at', label: 'Start Date' },
                { value: 'duration', label: 'Duration' },
                { value: 'credits_used', label: 'Credits Used' },
              ]}
            />

            <CliButton variant='primary' onClick={fetchSessions}>
              <ArrowPathIcon className='mr-1 h-4 w-4' />
              Refresh
            </CliButton>
          </div>
        </div>
      </TerminalWindow>

      {/* Sessions List */}
      <div className='space-y-4'>
        {loading ? (
          <CliCard className='animate-pulse'>
            <div className='p-6'>
              <TypingText text='Loading sessions data...' className='text-cli-light-gray' />
            </div>
          </CliCard>
        ) : sessions.length === 0 ? (
          <CliCard>
            <div className='p-6 text-center'>
              <ClockIcon className='mx-auto mb-4 h-12 w-12 text-cli-gray' />
              <div className='font-mono text-cli-light-gray'>No sessions found</div>
            </div>
          </CliCard>
        ) : (
          sessions.map(session => (
            <CliCard
              key={session.id}
              className='hover:shadow-glow-info group cursor-pointer transition-all'
            >
              <div className='p-4' onClick={() => fetchSessionDetail(session.id)}>
                <div className='mb-3 flex items-center justify-between'>
                  <div className='flex items-center space-x-3'>
                    <div className='cli-terminal rounded p-2'>
                      {session.desktopConnected ? (
                        <ComputerDesktopIcon className='h-5 w-5 text-cli-cyan' />
                      ) : (
                        <ClockIcon className='h-5 w-5 text-cli-amber' />
                      )}
                    </div>
                    <div>
                      <h3 className='font-mono font-bold text-cli-white'>{session.sessionName}</h3>
                      <div className='font-mono text-sm text-cli-light-gray'>
                        {session.companyName} - {session.jobTitle}
                      </div>
                    </div>
                  </div>
                  <div className='flex items-center space-x-2'>
                    {getStatusBadge(session.status)}
                    <CliButton variant='ghost' size='sm'>
                      <EyeIcon className='h-4 w-4' />
                    </CliButton>
                  </div>
                </div>

                <div className='grid grid-cols-2 gap-4 text-sm md:grid-cols-4'>
                  <div>
                    <span className='font-mono text-cli-green'>User:</span>{' '}
                    <span className='font-mono text-cli-light-gray'>{session.user.name}</span>
                  </div>
                  <div>
                    <span className='font-mono text-cli-green'>Duration:</span>{' '}
                    <span className='font-mono text-cli-light-gray'>
                      {formatDuration(session.duration)}
                    </span>
                  </div>
                  <div>
                    <span className='font-mono text-cli-green'>Questions:</span>{' '}
                    <span className='font-mono text-cli-light-gray'>{session.questionsCount}</span>
                  </div>
                  <div>
                    <span className='font-mono text-cli-green'>Credits:</span>{' '}
                    <span className='font-mono text-cli-light-gray'>{session.creditsUsed}</span>
                  </div>
                </div>

                <div className='mt-3 font-mono text-xs text-cli-green'>
                  $ session_details --id={session.id.slice(0, 8)} --created=
                  {formatTimestamp(session.createdAt)}
                </div>
              </div>
            </CliCard>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex justify-center space-x-2'>
          <CliButton
            variant='secondary'
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </CliButton>

          <span className='flex items-center px-4 font-mono text-sm text-cli-light-gray'>
            Page {page} of {totalPages}
          </span>

          <CliButton
            variant='secondary'
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </CliButton>
        </div>
      )}
    </div>
  );
};

export default Sessions;
