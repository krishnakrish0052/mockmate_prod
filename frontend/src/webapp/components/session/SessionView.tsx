import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  RocketLaunchIcon,
  CommandLineIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon,
  ComputerDesktopIcon,
  LinkIcon,
  StopCircleIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { apiCall } from '../../../utils/apiUtils';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';
import { launchWithAutoFeatures } from '../../utils/desktopLauncher';

interface SessionData {
  id: string;
  jobTitle: string;
  jobDescription?: string;
  difficulty: string;
  sessionType: string;
  duration: number;
  status: string;
  creditCost: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  desktopConnected?: boolean;
}

const SessionView: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [desktopStatus, setDesktopStatus] = useState<'checking' | 'available' | 'unavailable'>(
    'checking'
  );
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchSession();
      checkDesktopAppAvailability();

      // Start polling session status every 10 seconds
      statusCheckIntervalRef.current = setInterval(() => {
        fetchSessionStatus();
      }, 10000);
    }

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, [sessionId]);

  const fetchSession = async () => {
    try {
      const response = await apiCall(`/sessions/${sessionId}`);
      setSession(response.session);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionStatus = async () => {
    try {
      const response = await apiCall(`/sessions/${sessionId}`);
      setSession(prev =>
        prev
          ? {
              ...prev,
              status: response.session.status,
              desktopConnected: response.session.desktopConnected,
            }
          : response.session
      );
    } catch (error) {
      console.error('Failed to fetch session status:', error);
    }
  };

  const checkDesktopAppAvailability = () => {
    console.log('🔍 Checking desktop app availability...');

    // Method 1: Try protocol handler detection with visibility change
    let detectionTimeout: NodeJS.Timeout;
    let isDetectionComplete = false;

    const handleVisibilityChange = () => {
      if (document.hidden && !isDetectionComplete) {
        // Page became hidden, likely due to protocol handler working
        console.log('✅ Desktop app appears to be installed (page visibility changed)');
        isDetectionComplete = true;
        clearTimeout(detectionTimeout);
        setDesktopStatus('available');
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };

    // Method 2: Try with iframe and error detection
    const testUrl = `mockmate://test`;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';

    // Listen for iframe errors (indicates protocol not handled)
    iframe.onerror = () => {
      if (!isDetectionComplete) {
        console.log('❌ Desktop app not detected (iframe error)');
        isDetectionComplete = true;
        clearTimeout(detectionTimeout);
        setDesktopStatus('unavailable');
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Set the test URL
    iframe.src = testUrl;
    document.body.appendChild(iframe);

    // Method 3: Fallback timeout-based detection
    detectionTimeout = setTimeout(() => {
      if (!isDetectionComplete) {
        // Try to detect based on whether the protocol was handled
        // If we're still here after 2 seconds, likely no app installed
        console.log('⚠️ Desktop app detection timeout - assuming not installed');
        isDetectionComplete = true;
        setDesktopStatus('unavailable');
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      // Clean up iframe
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 2000);

    // Method 4: Try window.open as additional test
    setTimeout(() => {
      if (!isDetectionComplete) {
        try {
          const popup = window.open(testUrl, '_blank', 'width=1,height=1');
          if (popup) {
            setTimeout(() => {
              if (popup && !popup.closed) {
                popup.close();
                // If popup is still open, protocol likely not handled
                if (!isDetectionComplete) {
                  console.log('❌ Desktop app not detected (popup remained open)');
                  isDetectionComplete = true;
                  clearTimeout(detectionTimeout);
                  setDesktopStatus('unavailable');
                  document.removeEventListener('visibilitychange', handleVisibilityChange);
                }
              } else {
                // Popup was closed or blocked, might indicate protocol was handled
                console.log('🤔 Protocol test popup behavior unclear');
              }
            }, 500);
          }
        } catch (error) {
          console.log('❌ Protocol test failed:', error);
        }
      }
    }, 100);

    console.log('⏳ Desktop app detection started - waiting for results...');
  };

  const launchDesktopApp = async () => {
    if (!session || !sessionId) return;

    setLaunching(true);
    setLaunchError('');

    try {
      console.log('🚀 Launching desktop app with enhanced features for session:', sessionId);

      // Enhanced launch with auto-fill and auto-connect enabled
      const success = await launchWithAutoFeatures(sessionId, {
        token: localStorage.getItem('auth_token') || undefined,
        userId: user?.id,
        autoFill: true,
        autoConnect: true,
        showDebugInfo: true,
      });

      if (success) {
        console.log('✅ Desktop app launched successfully with auto-features');

        // Give the desktop app some time to launch and connect
        setTimeout(() => {
          setLaunching(false);
        }, 3000);
      } else {
        throw new Error('Failed to launch desktop app with auto-features');
      }
    } catch (error) {
      console.error('❌ Failed to launch desktop app:', error);
      setLaunchError(
        'Failed to launch desktop application with auto-features. Please ensure MockMate desktop is installed.'
      );
      setLaunching(false);
    }
  };

  const downloadDesktopApp = () => {
    // For now, redirect to a download page or show instructions
    window.open('https://mockmate.app/download', '_blank');
  };

  const stopSession = async () => {
    if (!session) return;

    setStopping(true);
    setStopError('');

    try {
      // Call the new dedicated stop endpoint
      const response = await apiCall(`/sessions/${sessionId}/stop`, {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Stopped from web interface',
          forceStop: false,
        })
      });

      // Update local session state with the response
      setSession(prev =>
        prev
          ? {
              ...prev,
              status: response.session.status,
              completedAt: response.session.stoppedAt,
              desktopConnected: false,
            }
          : null
      );

      // Force refresh session data to get updated info from server
      setTimeout(() => {
        fetchSession();
      }, 1000);
    } catch (error: any) {
      console.error('Failed to stop session:', error);
      setStopError(
        error.message ||
          'Failed to stop session. Please try again or contact support.'
      );
    } finally {
      setStopping(false);
    }
  };

  const formatCreatedDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'created':
        return 'text-blue-400';
      case 'active':
        return 'text-green-400';
      case 'completed':
        return 'text-purple-400';
      case 'cancelled':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'created':
        return <CommandLineIcon className='h-5 w-5' />;
      case 'active':
        return <RocketLaunchIcon className='h-5 w-5' />;
      case 'completed':
        return <CheckCircleIcon className='h-5 w-5' />;
      default:
        return <ClockIcon className='h-5 w-5' />;
    }
  };

  const copySessionId = async () => {
    if (!session?.id) return;

    try {
      await navigator.clipboard.writeText(session.id);
      setCopySuccess(true);
      // Reset the success message after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy session ID:', error);
      // Fallback method for older browsers
      try {
        const textArea = document.createElement('textarea');
        textArea.value = session.id;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => {
          setCopySuccess(false);
        }, 2000);
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
    }
  };

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-900'>
        <div className='text-center text-white'>
          <div className='mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white'></div>
          <p>Loading interview session...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-900'>
        <div className='text-center text-white'>
          <ExclamationTriangleIcon className='mx-auto mb-4 h-16 w-16' />
          <h2 className='mb-2 text-xl font-semibold'>Session Not Found</h2>
          <p className='mb-4 text-gray-400'>The interview session could not be loaded.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className='rounded-lg bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700'
          >
            Return to Dashboard
          </button>
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
                to='/dashboard'
                className='flex items-center space-x-2 font-mono text-cli-light-gray transition-colors hover:text-cli-white'
              >
                <ArrowLeftIcon className='h-5 w-5' />
                <span>$ cd ../dashboard</span>
              </Link>
            </div>
            <div className='flex items-center space-x-3'>
              <CliBadge variant='info' className={getStatusColor(session.status)}>
                STATUS: {session.status.toUpperCase()}
              </CliBadge>
              {session.desktopConnected && (
                <CliBadge variant='success' className='animate-pulse'>
                  DESKTOP: CONNECTED
                </CliBadge>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className='relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8'>
        <TerminalWindow
          title={`mockmate@session:~$ ./launch-interview --session=${session.id.substring(0, 8)}`}
          className=''
        >
          <div className='p-8'>
            <div className='mb-8 text-center'>
              <div className='cli-terminal mx-auto mb-4 h-16 w-16 p-3'>
                <ComputerDesktopIcon className='h-full w-full text-primary-500' />
              </div>
              <TypingText
                text='Desktop Application Launcher'
                className='mb-2 font-mono text-2xl font-bold text-primary-500'
                speed={40}
              />
              <div className='font-mono text-sm text-cli-light-gray'>
                Launch MockMate Desktop for optimal interview experience
              </div>
            </div>

            {/* Session Info Card */}
            <CliCard className='mb-6'>
              <div className='p-6'>
                <div className='mb-4 flex items-center justify-between'>
                  <div>
                    <h2 className='mb-2 font-mono text-xl font-bold text-cli-white'>
                      {session.jobTitle}
                    </h2>
                    <div className='mb-3 flex items-center space-x-4 font-mono text-sm text-cli-light-gray'>
                      <span>$ type --{session.sessionType}</span>
                      <span>$ difficulty --{session.difficulty}</span>
                      <span>$ duration --{session.duration}min</span>
                    </div>

                    {/* Session ID Copy Button */}
                    <div className='flex items-center space-x-2'>
                      <span className='font-mono text-xs text-cli-gray'>Session ID:</span>
                      <div className='flex items-center space-x-2 rounded border border-cli-gray/30 bg-cli-dark/30 px-3 py-1'>
                        <span className='font-mono text-xs text-cli-light-gray'>
                          {session.id.substring(0, 8)}...
                          {session.id.substring(session.id.length - 4)}
                        </span>
                        <CliButton
                          variant='ghost'
                          size='sm'
                          onClick={copySessionId}
                          className='!h-6 !w-6 !p-1 hover:bg-primary-500/20'
                          title='Copy full session ID'
                        >
                          <DocumentDuplicateIcon className='h-3 w-3' />
                        </CliButton>
                      </div>
                      {copySuccess && (
                        <CliBadge variant='success' className='animate-pulse text-xs'>
                          COPIED!
                        </CliBadge>
                      )}
                    </div>
                  </div>
                  <div className='text-right'>
                    <div className='mb-2 flex items-center space-x-2'>
                      {getStatusIcon(session.status)}
                      <span className={`font-mono font-bold ${getStatusColor(session.status)}`}>
                        {session.status.toUpperCase()}
                      </span>
                    </div>
                    <div className='font-mono text-xs text-cli-gray'>
                      Created: {formatCreatedDate(session.createdAt)}
                    </div>
                  </div>
                </div>

                {session.jobDescription && (
                  <div className='mt-4 rounded border border-cli-gray bg-cli-dark/50 p-4'>
                    <div className='mb-1 font-mono text-xs text-cli-light-gray'>
                      $ job-description --preview
                    </div>
                    <p className='font-mono text-sm text-cli-light-gray'>
                      {session.jobDescription.substring(0, 200)}
                      {session.jobDescription.length > 200 ? '...' : ''}
                    </p>
                  </div>
                )}
              </div>
            </CliCard>

            {/* Launch Error */}
            {launchError && (
              <CliCard className='mb-6 border-red-500/30 bg-red-900/20'>
                <div className='p-4'>
                  <CliBadge variant='error' className='mb-3'>
                    LAUNCH ERROR
                  </CliBadge>
                  <div className='font-mono text-sm text-red-400'>{launchError}</div>
                </div>
              </CliCard>
            )}

            {/* Stop Session Error */}
            {stopError && (
              <CliCard className='mb-6 border-red-500/30 bg-red-900/20'>
                <div className='p-4'>
                  <CliBadge variant='error' className='mb-3'>
                    STOP SESSION ERROR
                  </CliBadge>
                  <div className='font-mono text-sm text-red-400'>{stopError}</div>
                </div>
              </CliCard>
            )}

            {/* Desktop Status */}
            <CliCard className='mb-6 border-blue-500/30 bg-gradient-to-r from-blue-900/20 to-purple-900/20'>
              <div className='p-6'>
                <div className='mb-4 flex items-center justify-between'>
                  <div className='flex items-center space-x-3'>
                    <CliBadge variant={desktopStatus === 'available' ? 'success' : 'warning'}>
                      DESKTOP STATUS
                    </CliBadge>
                    <span className='font-mono text-sm text-cli-light-gray'>
                      {desktopStatus === 'checking' && 'Checking availability...'}
                      {desktopStatus === 'available' && 'Desktop app detected'}
                      {desktopStatus === 'unavailable' && 'Desktop app not found'}
                    </span>
                  </div>
                  {session.desktopConnected && (
                    <div className='flex items-center space-x-2 text-green-400'>
                      <CheckCircleIcon className='h-5 w-5' />
                      <span className='font-mono text-sm'>Connected</span>
                    </div>
                  )}
                </div>

                <div className='space-y-1 font-mono text-xs text-cli-gray'>
                  <div>$ mockmate-desktop --version: checking...</div>
                  <div>$ protocol-handler --status: {desktopStatus}</div>
                  <div>
                    $ session-connection --ready: {session.desktopConnected ? 'true' : 'false'}
                  </div>
                </div>
              </div>
            </CliCard>

            {/* Action Buttons */}
            <div className='space-y-4'>
              {/* Primary Launch Button */}
              {desktopStatus === 'available' && session.status === 'created' && (
                <CliButton
                  onClick={launchDesktopApp}
                  variant='primary'
                  disabled={launching}
                  isLoading={launching}
                  className='flex w-full items-center justify-center space-x-3 py-4'
                >
                  {launching ? (
                    <span>./launching-desktop-app...</span>
                  ) : (
                    <>
                      <RocketLaunchIcon className='h-6 w-6' />
                      <span>./launch-desktop-interview --start</span>
                    </>
                  )}
                </CliButton>
              )}

              {/* Desktop App Download */}
              {desktopStatus === 'unavailable' && (
                <div className='text-center'>
                  <CliButton
                    onClick={downloadDesktopApp}
                    variant='secondary'
                    className='mb-4 flex w-full items-center justify-center space-x-3 py-4'
                  >
                    <LinkIcon className='h-5 w-5' />
                    <span>./download-desktop-app --install</span>
                  </CliButton>
                  <p className='font-mono text-sm text-cli-light-gray'>
                    Desktop app required for interview execution
                  </p>
                </div>
              )}

              {/* Session Already Active */}
              {session.status === 'active' && (
                <CliCard className='border-green-500/30 bg-green-900/20'>
                  <div className='p-6 text-center'>
                    <CliBadge variant='success' className='mb-3'>
                      SESSION ACTIVE
                    </CliBadge>
                    <div className='mb-4 font-mono text-sm text-green-400'>
                      Interview is currently running in desktop app
                    </div>
                    <div className='flex flex-col space-y-3'>
                      <div className='flex justify-center space-x-3'>
                        <CliButton
                          variant='ghost'
                          size='sm'
                          onClick={() => navigate(`/session/${sessionId}/history`)}
                        >
                          ./view-progress --live
                        </CliButton>
                        <CliButton
                          variant='danger'
                          size='sm'
                          onClick={stopSession}
                          disabled={stopping}
                          isLoading={stopping}
                        >
                          {stopping ? (
                            <span>./stopping-session...</span>
                          ) : (
                            <>
                              <StopCircleIcon className='h-4 w-4' />
                              <span>./stop-session --force</span>
                            </>
                          )}
                        </CliButton>
                      </div>
                      <div className='font-mono text-xs text-cli-gray'>
                        # Stop session remotely from web interface
                      </div>
                    </div>
                  </div>
                </CliCard>
              )}

              {/* Session Completed */}
              {session.status === 'completed' && (
                <CliCard className='border-purple-500/30 bg-purple-900/20'>
                  <div className='p-6 text-center'>
                    <CliBadge variant='info' className='mb-3'>
                      SESSION COMPLETED
                    </CliBadge>
                    <div className='mb-4 font-mono text-sm text-purple-400'>
                      Interview session has been completed
                    </div>
                    <div className='flex justify-center space-x-3'>
                      <CliButton
                        variant='ghost'
                        size='sm'
                        onClick={() => navigate(`/session/${sessionId}/history`)}
                      >
                        ./view-results --detailed
                      </CliButton>
                      <CliButton variant='ghost' size='sm' onClick={() => navigate('/dashboard')}>
                        ./back-to-dashboard
                      </CliButton>
                    </div>
                  </div>
                </CliCard>
              )}

              {/* Session Cancelled */}
              {session.status === 'cancelled' && (
                <CliCard className='border-red-500/30 bg-red-900/20'>
                  <div className='p-6 text-center'>
                    <CliBadge variant='error' className='mb-3'>
                      SESSION CANCELLED
                    </CliBadge>
                    <div className='mb-4 font-mono text-sm text-red-400'>
                      Interview session has been cancelled
                    </div>
                    <div className='flex justify-center space-x-3'>
                      <CliButton
                        variant='ghost'
                        size='sm'
                        onClick={() => navigate(`/session/${sessionId}/history`)}
                      >
                        ./view-session-log
                      </CliButton>
                      <CliButton variant='ghost' size='sm' onClick={() => navigate('/dashboard')}>
                        ./back-to-dashboard
                      </CliButton>
                    </div>
                  </div>
                </CliCard>
              )}

              {/* Bottom Navigation */}
              <div className='flex items-center justify-center space-x-4 border-t border-cli-gray pt-6'>
                <Link to='/dashboard'>
                  <CliButton variant='ghost'>./back-to-dashboard</CliButton>
                </Link>
                <Link to={`/session/${sessionId}/history`}>
                  <CliButton variant='ghost'>./view-session-history</CliButton>
                </Link>
              </div>
            </div>

            {/* Enhanced Information Panel */}
            <CliCard className='mt-8 border-primary-500/30 bg-gradient-to-r from-cli-dark/40 to-cli-darker/60'>
              <div className='p-6'>
                <div className='space-y-2 font-mono text-xs text-cli-light-gray'>
                  <div className='mb-3 text-sm font-bold text-primary-400'>
                    $ mockmate --features --enhanced
                  </div>

                  <div className='mb-2 font-bold text-cli-green'>
                    # ✨ Enhanced Launch Features:
                  </div>
                  <div>
                    {' '}
                    • 🔄 <span className='text-primary-400'>AUTO-FILL:</span> Session details
                    automatically populated
                  </div>
                  <div>
                    {' '}
                    • ⚡ <span className='text-primary-400'>AUTO-CONNECT:</span> Instant connection
                    to interview server
                  </div>
                  <div>
                    {' '}
                    • 🚀 <span className='text-primary-400'>SMART-LAUNCH:</span> Optimized desktop
                    app initialization
                  </div>
                  <div>
                    {' '}
                    • 📊 <span className='text-primary-400'>REAL-TIME:</span> Live session status
                    monitoring
                  </div>
                  <div></div>

                  <div className='mb-2 font-bold text-cli-green'>
                    # 🎯 MockMate Desktop Capabilities:
                  </div>
                  <div> • 📹 Advanced video/audio recording with AI analysis</div>
                  <div> • 🤖 Real-time AI interview interaction & feedback</div>
                  <div> • 💾 Offline interview execution & local storage</div>
                  <div> • 🔄 Automatic session synchronization & backup</div>
                  <div> • 🔐 Enhanced privacy and performance optimization</div>
                  <div> • 📈 Advanced analytics and progress tracking</div>
                  <div></div>

                  <div className='mb-2 font-bold text-primary-400'># 🔧 Technical Details:</div>
                  <div> • Session handoff: Web → Desktop seamlessly</div>
                  <div> • Credits deducted when desktop app activates</div>
                  <div>
                    {' '}
                    • Protocol: mockmate://session/
                    {sessionId ? sessionId.substring(0, 8) : 'xxxxxxxx'}...
                  </div>
                  <div> • Auto-features enabled by default for optimal UX</div>
                  <div></div>

                  <div className='text-xs text-cli-gray'>
                    # Launch data stored in localStorage for desktop consumption
                  </div>
                </div>
              </div>
            </CliCard>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default SessionView;
