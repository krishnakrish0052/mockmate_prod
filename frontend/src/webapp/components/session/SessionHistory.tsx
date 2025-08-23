import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  ClockIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  CalendarIcon,
  UserIcon,
  BuildingOfficeIcon,
  AcademicCapIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
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

interface QAHistory {
  questionNumber: number;
  question: string;
  questionTime: string;
  answer: string | null;
  answerTime: string | null;
  responseTime: number | null;
  feedback: string | null;
}

interface SessionHistory {
  session: {
    id: string;
    sessionName: string;
    jobTitle: string;
    jobDescription: string;
    difficulty: string;
    sessionType: string;
    status: string;
    createdAt: string;
    startedAt: string;
    completedAt: string;
    user: {
      name: string;
      email: string;
    };
    resume: string | null;
  };
  qaHistory: QAHistory[];
  interactionLog: Array<{
    id: string;
    type: string;
    content: string;
    timestamp: string;
    metadata: any;
  }>;
  statistics: {
    totalQuestions: number;
    answeredQuestions: number;
    averageResponseTime: number;
    sessionDuration: number | null;
    completionRate: number;
  };
}

const SessionHistory: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [history, setHistory] = useState<SessionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'qa' | 'timeline'>('qa');

  useEffect(() => {
    if (sessionId) {
      fetchSessionHistory();
    }
  }, [sessionId]);

  const fetchSessionHistory = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/sessions/${sessionId}/history`);
      setHistory(response.data);
    } catch (error: any) {
      console.error('Failed to fetch session history:', error);
      setError(error.response?.data?.error || 'Failed to load session history');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
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
      alert(error.response?.data?.error || 'Failed to download PDF');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <div className='relative z-10 h-12 w-12 animate-spin rounded-full border-b-2 border-primary-500'></div>
      </div>
    );
  }

  if (error || !history) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <div className='relative z-10 text-center'>
          <XCircleIcon className='mx-auto mb-4 h-16 w-16 text-red-500' />
          <TypingText
            text='Unable to Load Session'
            className='mb-2 font-mono text-xl font-bold text-cli-white'
            speed={40}
          />
          <div className='mb-4 font-mono text-sm text-cli-light-gray'>
            {error || 'Session history not found'}
          </div>
          <Link to='/sessions'>
            <CliButton variant='primary' className='mx-auto flex items-center'>
              <ArrowLeftIcon className='mr-2 h-4 w-4' />
              ./back-to-sessions
            </CliButton>
          </Link>
        </div>
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
                to='/sessions'
                className='flex items-center space-x-2 font-mono text-cli-light-gray transition-colors hover:text-cli-white hover:shadow-glow-golden'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>$ cd ../sessions</span>
              </Link>
            </div>
            <div className='flex items-center space-x-4'>
              <Link
                to='/dashboard'
                className='font-mono text-sm text-cli-light-gray transition-colors hover:text-primary-500'
              >
                $ cd ~/dashboard
              </Link>
              {history?.session.status === 'completed' && (
                <CliButton
                  onClick={handleDownloadPDF}
                  variant='primary'
                  className='flex items-center'
                >
                  <DocumentArrowDownIcon className='mr-2 h-4 w-4' />
                  ./download-report.pdf
                </CliButton>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Session Overview */}
        <TerminalWindow
          title={`mockmate@interviews:~$ ./session-analyze.sh --id="${history.session.id.slice(0, 8)}"`}
          className='mb-6'
        >
          <div className='border-b border-cli-gray p-6'>
            <div className='mb-4 flex items-start justify-between'>
              <div className='flex-1'>
                <div className='mb-3 flex items-center space-x-4'>
                  <TypingText
                    text={history.session.sessionName || history.session.jobTitle}
                    className='cli-glow font-mono text-2xl font-bold text-primary-500'
                    speed={30}
                  />
                  <CliBadge
                    variant={
                      history.session.status === 'completed'
                        ? 'success'
                        : history.session.status === 'active'
                          ? 'warning'
                          : 'default'
                    }
                    className='animate-pulse font-mono text-xs'
                  >
                    {history.session.status.toUpperCase()}
                  </CliBadge>
                </div>

                {history.session.status !== 'completed' && (
                  <div className='cli-terminal mb-4 rounded-lg border border-yellow-500/40 bg-yellow-900/30 p-4'>
                    <div className='flex items-start space-x-3'>
                      <InformationCircleIcon className='mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400' />
                      <div>
                        <p className='mb-1 font-mono text-sm font-bold text-yellow-400'>
                          [SYSTEM WARNING] Session Status: {history.session.status.toUpperCase()}
                        </p>
                        <p className='font-mono text-xs text-yellow-300'>
                          {history.session.status === 'created' &&
                            '$ ./start-session.sh required to begin data collection'}
                          {(history.session.status === 'active' ||
                            history.session.status === 'paused') &&
                            '$ ./complete-session.sh required for full analytics'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className='grid grid-cols-1 gap-6 font-mono text-sm lg:grid-cols-2'>
                  <div className='space-y-2'>
                    <div className='flex items-center text-cli-light-gray'>
                      <span className='w-20 text-cli-green'>$ role:</span>
                      <BuildingOfficeIcon className='mr-2 h-4 w-4 text-primary-500' />
                      <span className='text-cli-white'>{history.session.jobTitle}</span>
                    </div>
                    <div className='flex items-center text-cli-light-gray'>
                      <span className='w-20 text-cli-green'>$ level:</span>
                      <AcademicCapIcon className='mr-2 h-4 w-4 text-primary-500' />
                      <span
                        className={`font-bold ${
                          history.session.difficulty === 'beginner'
                            ? 'text-cli-green'
                            : history.session.difficulty === 'intermediate'
                              ? 'text-primary-500'
                              : 'text-red-400'
                        }`}
                      >
                        {history.session.difficulty.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className='space-y-2'>
                    <div className='flex items-center text-cli-light-gray'>
                      <span className='w-20 text-cli-green'>$ type:</span>
                      <ChatBubbleLeftRightIcon className='mr-2 h-4 w-4 text-primary-500' />
                      <span className='text-cli-white'>{history.session.sessionType}</span>
                    </div>
                    <div className='flex items-center text-cli-light-gray'>
                      <span className='w-20 text-cli-green'>$ user:</span>
                      <UserIcon className='mr-2 h-4 w-4 text-primary-500' />
                      <span className='text-cli-white'>{history.session.user.name}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className='border-t border-cli-gray pt-4'>
              <div className='space-y-1 font-mono text-xs text-cli-gray'>
                <div>$ created_at: {new Date(history.session.createdAt).toLocaleString()}</div>
                {history.session.startedAt && (
                  <div>$ started_at: {new Date(history.session.startedAt).toLocaleString()}</div>
                )}
                {history.session.completedAt && (
                  <div>
                    $ completed_at: {new Date(history.session.completedAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className='grid grid-cols-1 gap-4 p-6 md:grid-cols-5'>
            <CliCard className='hover:shadow-glow-neon group transition-all duration-300'>
              <div className='text-center'>
                <div className='cli-glow mb-2 font-mono text-3xl font-bold text-primary-500'>
                  {history.statistics.totalQuestions}
                </div>
                <div className='mb-1 font-mono text-xs text-cli-light-gray'>TOTAL QUESTIONS</div>
                <div className='font-mono text-xs text-cli-green'>$ count --all</div>
              </div>
            </CliCard>

            <CliCard className='hover:shadow-glow-success group transition-all duration-300'>
              <div className='text-center'>
                <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-green'>
                  {history.statistics.answeredQuestions}
                </div>
                <div className='mb-1 font-mono text-xs text-cli-light-gray'>ANSWERED</div>
                <div className='font-mono text-xs text-cli-green'>$ grep "answered" | wc -l</div>
              </div>
            </CliCard>

            <CliCard className='group transition-all duration-300 hover:shadow-glow-golden'>
              <div className='text-center'>
                <div className='cli-glow mb-2 font-mono text-3xl font-bold text-primary-500'>
                  {history.statistics.completionRate}%
                </div>
                <div className='mb-1 font-mono text-xs text-cli-light-gray'>COMPLETION RATE</div>
                <div className='font-mono text-xs text-cli-green'>$ calc --percentage</div>
              </div>
            </CliCard>

            <CliCard className='hover:shadow-glow-warning group transition-all duration-300'>
              <div className='text-center'>
                <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                  {history.statistics.averageResponseTime > 0
                    ? formatTime(Math.round(history.statistics.averageResponseTime))
                    : 'N/A'}
                </div>
                <div className='mb-1 font-mono text-xs text-cli-light-gray'>AVG RESPONSE</div>
                <div className='font-mono text-xs text-cli-green'>$ timer --average</div>
              </div>
            </CliCard>

            <CliCard className='hover:shadow-glow-info group transition-all duration-300'>
              <div className='text-center'>
                <div className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
                  {formatDuration(history.statistics.sessionDuration)}
                </div>
                <div className='mb-1 font-mono text-xs text-cli-light-gray'>DURATION</div>
                <div className='font-mono text-xs text-cli-green'>$ uptime --session</div>
              </div>
            </CliCard>
          </div>
        </TerminalWindow>

        {/* Job Description */}
        {history.session.jobDescription && (
          <TerminalWindow title='mockmate@job-spec:~$ cat requirements.md' className='mb-6'>
            <div className='p-6'>
              <div className='mb-4 flex items-center space-x-2'>
                <span className='font-mono text-sm text-cli-green'>$ cat</span>
                <span className='font-mono text-sm text-primary-500'>job-description.txt</span>
                <span className='font-mono text-sm text-cli-gray'>| head -20</span>
              </div>
              <div className='rounded-lg border-l-4 border-primary-500 bg-cli-darker p-4'>
                <pre className='whitespace-pre-wrap font-mono text-sm leading-relaxed text-cli-light-gray'>
                  {history.session.jobDescription}
                </pre>
              </div>
              <div className='mt-3 font-mono text-xs text-cli-gray'>$ echo "EOF" # End of file</div>
            </div>
          </TerminalWindow>
        )}

        {/* Interactive Analysis Tabs */}
        <TerminalWindow
          title='mockmate@analysis:~$ ./session-parser.sh --mode=interactive'
          className='mb-6'
        >
          <div className='border-b border-cli-gray'>
            <nav className='flex space-x-2 px-6 py-2'>
              <CliButton
                onClick={() => setActiveTab('qa')}
                variant={activeTab === 'qa' ? 'primary' : 'ghost'}
                size='sm'
                className={`transition-all duration-200 ${activeTab === 'qa' ? 'shadow-glow-golden' : ''}`}
              >
                <ChatBubbleLeftRightIcon className='mr-2 h-4 w-4' />
                ./analyze-qa.sh [{history.qaHistory.length}]
              </CliButton>
              <CliButton
                onClick={() => setActiveTab('timeline')}
                variant={activeTab === 'timeline' ? 'primary' : 'ghost'}
                size='sm'
                className={`transition-all duration-200 ${activeTab === 'timeline' ? 'shadow-glow-golden' : ''}`}
              >
                <ClockIcon className='mr-2 h-4 w-4' />
                ./parse-timeline.sh [{history.interactionLog.length}]
              </CliButton>
            </nav>
          </div>

          <div className='p-6'>
            {activeTab === 'qa' && (
              <div className='space-y-6'>
                {history.qaHistory.length === 0 ? (
                  <div className='py-16 text-center'>
                    <div className='cli-terminal hover:shadow-glow-warning mx-auto max-w-md rounded-lg p-8 transition-all'>
                      <ChatBubbleLeftRightIcon className='mx-auto mb-6 h-20 w-20 text-cli-gray' />
                      <TypingText
                        text='No Q&A Data Located'
                        className='cli-glow mb-4 font-mono text-xl font-bold text-primary-500'
                        speed={50}
                      />
                      <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
                        <div>$ find ./session/qa/ -name "*.log" | wc -l</div>
                        <div className='text-red-400'>0</div>
                        <div className='mt-4 text-xs text-cli-gray'>
                          # Session must be started to generate Q&A logs
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  history.qaHistory.map((qa, index) => (
                    <TerminalWindow
                      key={index}
                      title={`mockmate@qa:~$ ./question-${String(qa.questionNumber).padStart(2, '0')}.log`}
                      className='transition-all duration-300 hover:shadow-glow-golden'
                    >
                      <div className='p-6'>
                        {/* Question Section */}
                        <div className='mb-6'>
                          <div className='mb-4 flex items-center justify-between'>
                            <div className='flex items-center space-x-3'>
                              <CliBadge
                                variant='info'
                                className='animate-pulse px-3 py-1 font-mono text-xs'
                              >
                                QUESTION #{qa.questionNumber}
                              </CliBadge>
                              <div className='font-mono text-xs text-cli-gray'>
                                $ created_at: {new Date(qa.questionTime).toLocaleString()}
                              </div>
                            </div>
                            <div className='font-mono text-xs text-cli-green'>
                              ./cat question.txt
                            </div>
                          </div>
                          <div className='cli-terminal cli-scanlines rounded-lg border-l-4 border-primary-500 bg-cli-darker p-4'>
                            <div className='flex items-start space-x-2'>
                              <span className='flex-shrink-0 font-mono text-sm text-cli-green'>
                                ❯
                              </span>
                              <p className='font-mono text-sm leading-relaxed text-cli-white'>
                                {qa.question}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Answer Section */}
                        <div className='mb-4'>
                          <div className='mb-4 flex items-center justify-between'>
                            <div className='flex items-center space-x-3'>
                              <CliBadge
                                variant={qa.answer ? 'success' : 'error'}
                                className={`px-3 py-1 font-mono text-xs ${qa.answer ? 'animate-pulse' : ''}`}
                              >
                                {qa.answer ? 'ANSWERED' : 'TIMEOUT'}
                              </CliBadge>
                              <div className='font-mono text-xs text-cli-light-gray'>
                                {qa.answer ? (
                                  <div className='flex items-center space-x-4'>
                                    <span>
                                      $ response_time: {new Date(qa.answerTime!).toLocaleString()}
                                    </span>
                                    {qa.responseTime && (
                                      <span className='flex items-center text-primary-500'>
                                        <ClockIcon className='mr-1 h-3 w-3' />
                                        {formatTime(qa.responseTime)}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className='text-red-400'>
                                    $ status: no_response_detected
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className='font-mono text-xs text-cli-green'>
                              ./cat {qa.answer ? 'response.txt' : 'timeout.log'}
                            </div>
                          </div>

                          {qa.answer ? (
                            <div className='cli-terminal cli-scanlines rounded-lg border-l-4 border-cli-green bg-cli-darker p-4'>
                              <div className='flex items-start space-x-2'>
                                <span className='flex-shrink-0 font-mono text-sm text-cli-green'>
                                  $
                                </span>
                                <pre className='flex-1 whitespace-pre-wrap font-mono text-sm leading-relaxed text-cli-light-gray'>
                                  {qa.answer}
                                </pre>
                              </div>
                            </div>
                          ) : (
                            <div className='cli-terminal cli-scanlines rounded-lg border-l-4 border-red-500 bg-red-900/20 p-4'>
                              <div className='flex items-center space-x-2'>
                                <XCircleIcon className='h-4 w-4 flex-shrink-0 text-red-400' />
                                <p className='font-mono text-sm italic text-red-400'>
                                  # TIMEOUT: No response recorded within time limit
                                </p>
                              </div>
                              <div className='mt-2 font-mono text-xs text-red-300'>
                                $ exit_code: 124 # Command timed out
                              </div>
                            </div>
                          )}
                        </div>

                        {/* AI Feedback Section */}
                        {qa.feedback && (
                          <div className='border-t border-cli-gray pt-6'>
                            <div className='mb-4 flex items-center justify-between'>
                              <div className='flex items-center space-x-3'>
                                <CliBadge
                                  variant='info'
                                  className='animate-pulse px-3 py-1 font-mono text-xs'
                                >
                                  AI_ANALYSIS
                                </CliBadge>
                                <span className='font-mono text-xs text-cli-gray'>
                                  $ ./ai-feedback.py --analyze
                                </span>
                              </div>
                              <CheckCircleIcon className='h-4 w-4 text-cli-green' />
                            </div>
                            <div className='cli-terminal cli-scanlines rounded-lg border border-blue-500/30 bg-blue-900/20 p-4'>
                              <div className='flex items-start space-x-2'>
                                <span className='flex-shrink-0 font-mono text-sm text-blue-400'>
                                  🤖
                                </span>
                                <div className='flex-1'>
                                  <pre className='whitespace-pre-wrap font-mono text-sm leading-relaxed text-cli-light-gray'>
                                    {qa.feedback}
                                  </pre>
                                  <div className='mt-3 border-t border-blue-500/20 pt-3 font-mono text-xs text-blue-300'>
                                    $ ai_model: gpt-4 | confidence: high | timestamp:{' '}
                                    {new Date().toISOString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </TerminalWindow>
                  ))
                )}
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className='space-y-4'>
                {history.interactionLog.length === 0 ? (
                  <div className='py-16 text-center'>
                    <div className='cli-terminal hover:shadow-glow-warning mx-auto max-w-md rounded-lg p-8 transition-all'>
                      <ClockIcon className='mx-auto mb-6 h-20 w-20 text-cli-gray' />
                      <TypingText
                        text='No Timeline Events'
                        className='cli-glow mb-4 font-mono text-xl font-bold text-primary-500'
                        speed={50}
                      />
                      <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
                        <div>$ tail -f /var/log/session_events.log</div>
                        <div className='text-red-400'>
                          tail: /var/log/session_events.log: No such file
                        </div>
                        <div className='mt-4 text-xs text-cli-gray'>
                          # Event logging begins when session starts
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  history.interactionLog.map((event, index) => (
                    <TerminalWindow
                      key={event.id}
                      title={`mockmate@timeline:~$ ./event-${String(index + 1).padStart(3, '0')}.log`}
                      className='hover:shadow-glow-info transition-all duration-300'
                    >
                      <div className='p-4'>
                        <div className='mb-4 flex items-center justify-between'>
                          <div className='flex items-center space-x-3'>
                            <CliBadge
                              variant={
                                event.type === 'question'
                                  ? 'info'
                                  : event.type === 'answer'
                                    ? 'success'
                                    : event.type === 'feedback'
                                      ? 'warning'
                                      : 'default'
                              }
                              className='animate-pulse px-3 py-1 font-mono text-xs'
                            >
                              {event.type.toUpperCase()}_EVENT
                            </CliBadge>
                            <span className='font-mono text-xs text-cli-gray'>
                              $ logged_at: {new Date(event.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className='font-mono text-xs text-cli-green'>
                            ./cat event.json | jq '.content'
                          </div>
                        </div>

                        <div className='cli-terminal cli-scanlines rounded-lg border-l-4 border-primary-500 bg-cli-darker p-4'>
                          <div className='flex items-start space-x-2'>
                            <span className='flex-shrink-0 font-mono text-sm text-primary-500'>
                              📄
                            </span>
                            <div className='flex-1'>
                              <pre className='whitespace-pre-wrap font-mono text-sm leading-relaxed text-cli-light-gray'>
                                {event.content.length > 300
                                  ? `${event.content.substring(0, 300)}...\n\n# Content truncated. Use './view-full.sh' to see complete log`
                                  : event.content}
                              </pre>
                              {event.metadata && (
                                <div className='mt-4 border-t border-cli-gray pt-3'>
                                  <div className='mb-2 font-mono text-xs text-cli-gray'>
                                    $ cat metadata.json
                                  </div>
                                  <pre className='font-mono text-xs text-cli-light-gray'>
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </TerminalWindow>
                  ))
                )}
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default SessionHistory;
