import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ClockIcon, 
  PlayIcon, 
  PauseIcon, 
  StopIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';
import axios from 'axios';

interface SessionTimerProps {
  sessionId: string;
  onTimerStop?: (duration: number) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

interface TimerStatus {
  sessionId: string;
  status: string;
  isRunning: boolean;
  isPaused: boolean;
  elapsedSeconds: number;
  remainingSeconds: number | null;
  estimatedDurationMinutes: number | null;
  startedAt: string | null;
  endedAt: string | null;
  pausedAt: string | null;
}

const SessionTimer: React.FC<SessionTimerProps> = ({ 
  sessionId, 
  onTimerStop, 
  className = '', 
  size = 'md' 
}) => {
  const [timerStatus, setTimerStatus] = useState<TimerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Local timer for real-time updates
  const [localElapsedSeconds, setLocalElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<Date>(new Date());

  // Style configuration based on size
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return {
          container: 'p-3',
          timer: 'text-lg',
          button: 'h-8 w-8',
          icon: 'h-4 w-4',
          text: 'text-xs'
        };
      case 'lg':
        return {
          container: 'p-6',
          timer: 'text-3xl',
          button: 'h-12 w-12',
          icon: 'h-6 w-6',
          text: 'text-base'
        };
      default: // md
        return {
          container: 'p-4',
          timer: 'text-2xl',
          button: 'h-10 w-10',
          icon: 'h-5 w-5',
          text: 'text-sm'
        };
    }
  };

  const sizeClasses = getSizeClasses();

  // Format time as MM:SS or HH:MM:SS
  const formatTime = useCallback((seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Fetch timer status from API
  const fetchTimerStatus = useCallback(async () => {
    try {
      const response = await axios.get(`/api/sessions/${sessionId}/timer`);
      const status = response.data;
      
      setTimerStatus(status);
      setLocalElapsedSeconds(status.elapsedSeconds);
      lastSyncRef.current = new Date();
      setError(null);
      
      return status;
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to fetch timer status';
      setError(errorMessage);
      console.error('Timer fetch error:', err);
      return null;
    }
  }, [sessionId]);

  // Start local timer updates
  const startLocalTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setLocalElapsedSeconds(prev => {
        // Only increment if timer is running and not paused
        if (timerStatus?.isRunning && !timerStatus?.isPaused) {
          return prev + 1;
        }
        return prev;
      });
    }, 1000);
  }, [timerStatus?.isRunning, timerStatus?.isPaused]);

  // Stop local timer updates
  const stopLocalTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Sync with server periodically
  const syncWithServer = useCallback(async () => {
    // Sync every 30 seconds if running, every 60 seconds if not
    const syncInterval = timerStatus?.isRunning ? 30000 : 60000;
    
    if (Date.now() - lastSyncRef.current.getTime() >= syncInterval) {
      await fetchTimerStatus();
    }
  }, [fetchTimerStatus, timerStatus?.isRunning]);

  // Pause session timer
  const pauseTimer = async () => {
    setActionLoading('pause');
    try {
      await axios.post(`/api/sessions/${sessionId}/timer/pause`);
      await fetchTimerStatus();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to pause timer';
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  // Resume session timer
  const resumeTimer = async () => {
    setActionLoading('resume');
    try {
      await axios.post(`/api/sessions/${sessionId}/timer/resume`);
      await fetchTimerStatus();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to resume timer';
      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  // Stop session (optional - if parent wants to handle this)
  const stopTimer = async () => {
    if (onTimerStop) {
      const duration = Math.floor(localElapsedSeconds / 60);
      onTimerStop(duration);
    }
  };

  // Initialize timer
  useEffect(() => {
    const initTimer = async () => {
      setLoading(true);
      const status = await fetchTimerStatus();
      setLoading(false);
      
      if (status?.isRunning) {
        startLocalTimer();
      }
    };

    initTimer();

    return () => {
      stopLocalTimer();
    };
  }, [sessionId, fetchTimerStatus, startLocalTimer, stopLocalTimer]);

  // Update local timer when status changes
  useEffect(() => {
    if (timerStatus?.isRunning && !timerStatus?.isPaused) {
      startLocalTimer();
    } else {
      stopLocalTimer();
    }
  }, [timerStatus?.isRunning, timerStatus?.isPaused, startLocalTimer, stopLocalTimer]);

  // Periodic sync with server
  useEffect(() => {
    const syncInterval = setInterval(syncWithServer, 30000);
    return () => clearInterval(syncInterval);
  }, [syncWithServer]);

  // Check for low time warning
  const isLowTime = timerStatus?.remainingSeconds !== null && 
                    timerStatus?.remainingSeconds < 300 && // Less than 5 minutes
                    timerStatus?.remainingSeconds > 0;

  const isOvertime = timerStatus?.remainingSeconds !== null && 
                     timerStatus?.remainingSeconds <= 0;

  if (loading) {
    return (
      <div className={`bg-gray-800/50 border border-gray-600 rounded-lg ${sizeClasses.container} ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
          <span className={`ml-2 text-gray-400 font-mono ${sizeClasses.text}`}>Loading timer...</span>
        </div>
      </div>
    );
  }

  if (error || !timerStatus) {
    return (
      <div className={`bg-red-900/20 border border-red-500/30 rounded-lg ${sizeClasses.container} ${className}`}>
        <div className="flex items-center">
          <ExclamationTriangleIcon className={`${sizeClasses.icon} text-red-400 flex-shrink-0`} />
          <span className={`ml-2 text-red-400 font-mono ${sizeClasses.text}`}>
            {error || 'Timer unavailable'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`
      bg-gradient-to-r from-gray-800/80 to-gray-900/80 
      border rounded-lg backdrop-blur-sm transition-all duration-200
      ${isOvertime ? 'border-red-500/50 shadow-red-500/20' : 
        isLowTime ? 'border-yellow-500/50 shadow-yellow-500/20' : 
        'border-gray-600/50 shadow-gray-500/10'}
      ${className}
    `}>
      <div className={sizeClasses.container}>
        <div className="flex items-center justify-between">
          {/* Timer Display */}
          <div className="flex items-center space-x-3">
            <div className={`
              p-2 rounded-lg transition-colors duration-200
              ${isOvertime ? 'bg-red-500/20' : 
                isLowTime ? 'bg-yellow-500/20' : 
                timerStatus.isRunning ? 'bg-green-500/20' : 'bg-gray-500/20'}
            `}>
              <ClockIcon className={`
                ${sizeClasses.icon}
                ${isOvertime ? 'text-red-400' : 
                  isLowTime ? 'text-yellow-400' : 
                  timerStatus.isRunning ? 'text-green-400' : 'text-gray-400'}
                ${timerStatus.isRunning ? 'animate-pulse' : ''}
              `} />
            </div>
            
            <div>
              <div className={`
                font-mono font-bold tracking-wider
                ${sizeClasses.timer}
                ${isOvertime ? 'text-red-400' : 
                  isLowTime ? 'text-yellow-400' : 
                  'text-white'}
              `}>
                {formatTime(localElapsedSeconds)}
              </div>
              
              <div className={`
                font-mono opacity-75 mt-1
                ${sizeClasses.text}
                ${isOvertime ? 'text-red-300' : 
                  isLowTime ? 'text-yellow-300' : 
                  'text-gray-400'}
              `}>
                {timerStatus.isPaused ? 'PAUSED' :
                 timerStatus.isRunning ? 'RUNNING' :
                 timerStatus.status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Timer Controls */}
          {timerStatus.status === 'active' && (
            <div className="flex items-center space-x-2">
              {timerStatus.isPaused ? (
                <button
                  onClick={resumeTimer}
                  disabled={actionLoading === 'resume'}
                  className={`
                    ${sizeClasses.button}
                    bg-green-600 hover:bg-green-700 disabled:bg-green-800
                    text-white rounded-lg transition-colors duration-200
                    flex items-center justify-center
                  `}
                  title="Resume timer"
                >
                  {actionLoading === 'resume' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <PlayIcon className={sizeClasses.icon} />
                  )}
                </button>
              ) : (
                <button
                  onClick={pauseTimer}
                  disabled={actionLoading === 'pause'}
                  className={`
                    ${sizeClasses.button}
                    bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800
                    text-white rounded-lg transition-colors duration-200
                    flex items-center justify-center
                  `}
                  title="Pause timer"
                >
                  {actionLoading === 'pause' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <PauseIcon className={sizeClasses.icon} />
                  )}
                </button>
              )}

              {onTimerStop && (
                <button
                  onClick={stopTimer}
                  className={`
                    ${sizeClasses.button}
                    bg-red-600 hover:bg-red-700
                    text-white rounded-lg transition-colors duration-200
                    flex items-center justify-center
                  `}
                  title="Stop session"
                >
                  <StopIcon className={sizeClasses.icon} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Remaining Time Display */}
        {timerStatus.remainingSeconds !== null && (
          <div className="mt-3 pt-3 border-t border-gray-600/30">
            <div className="flex items-center justify-between">
              <span className={`text-gray-400 font-mono ${sizeClasses.text}`}>
                Remaining:
              </span>
              <span className={`
                font-mono font-bold
                ${sizeClasses.text}
                ${isOvertime ? 'text-red-400' : 
                  isLowTime ? 'text-yellow-400' : 
                  'text-white'}
              `}>
                {isOvertime ? 'OVERTIME' : formatTime(timerStatus.remainingSeconds)}
              </span>
            </div>
          </div>
        )}

        {/* Warning Messages */}
        {isLowTime && (
          <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-4 w-4 text-yellow-400 flex-shrink-0" />
              <span className="ml-2 text-yellow-400 text-xs font-mono">
                Less than 5 minutes remaining
              </span>
            </div>
          </div>
        )}

        {isOvertime && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-400 flex-shrink-0" />
              <span className="ml-2 text-red-400 text-xs font-mono">
                Session has exceeded estimated time
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionTimer;
