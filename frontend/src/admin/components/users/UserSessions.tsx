import React, { useState, useEffect } from 'react';
import { 
  TerminalWindow, 
  TypingText, 
  CliCard, 
  CliBadge,
  CliButton,
  CliInput
} from '../ui/CliComponents';
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  DeviceTabletIcon,
  MapPinIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
  ArrowPathIcon,
  SignalIcon
} from '@heroicons/react/24/outline';

interface UserSessionsProps {
  userId?: string;
  className?: string;
}

interface SessionData {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  session_token: string;
  ip_address: string;
  user_agent: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string;
  os: string;
  location?: {
    country: string;
    city: string;
    region: string;
  };
  is_active: boolean;
  last_activity: string;
  created_at: string;
  expires_at?: string;
  activity_count: number;
  is_current?: boolean;
}

interface SessionStats {
  total_sessions: number;
  active_sessions: number;
  inactive_sessions: number;
  unique_ips: number;
  unique_devices: number;
}

const UserSessions: React.FC<UserSessionsProps> = ({ userId, className = '' }) => {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSessions, setSelectedSessions] = useState<string[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    fetchSessions();
    
    if (autoRefresh) {
      const interval = setInterval(fetchSessions, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [userId, showInactive, autoRefresh]);

  const fetchSessions = async () => {
    try {
      const params = new URLSearchParams({
        include_inactive: showInactive.toString()
      });

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const endpoint = userId 
        ? `${apiBaseUrl}/admin/users-enhanced/${userId}/sessions?${params}`
        : `${apiBaseUrl}/admin/user-sessions?${params}`;

      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSessions(result.data.sessions || []);
          setStats(result.data.stats || null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const terminateSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to terminate this session? The user will be logged out immediately.')) {
      return;
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/user-sessions/${sessionId}/terminate`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchSessions();
        }
      }
    } catch (error) {
      console.error('Failed to terminate session:', error);
    }
  };

  const terminateSelectedSessions = async () => {
    if (selectedSessions.length === 0) return;
    
    if (!confirm(`Are you sure you want to terminate ${selectedSessions.length} sessions? Users will be logged out immediately.`)) {
      return;
    }

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/user-sessions/bulk-terminate`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_ids: selectedSessions
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSelectedSessions([]);
          await fetchSessions();
        }
      }
    } catch (error) {
      console.error('Failed to terminate sessions:', error);
    }
  };

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'desktop':
        return <ComputerDesktopIcon className="h-5 w-5" />;
      case 'mobile':
        return <DevicePhoneMobileIcon className="h-5 w-5" />;
      case 'tablet':
        return <DeviceTabletIcon className="h-5 w-5" />;
      default:
        return <ComputerDesktopIcon className="h-5 w-5" />;
    }
  };

  const getSessionStatusBadge = (session: SessionData) => {
    if (session.is_current) {
      return <CliBadge variant="primary">CURRENT</CliBadge>;
    }
    if (session.is_active) {
      const lastActivity = new Date(session.last_activity);
      const minutesAgo = Math.floor((Date.now() - lastActivity.getTime()) / 60000);
      if (minutesAgo < 5) {
        return <CliBadge variant="success">ACTIVE</CliBadge>;
      } else if (minutesAgo < 30) {
        return <CliBadge variant="warning">IDLE</CliBadge>;
      } else {
        return <CliBadge variant="secondary">STALE</CliBadge>;
      }
    }
    return <CliBadge variant="danger">INACTIVE</CliBadge>;
  };

  const formatLastActivity = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSessionSelect = (sessionId: string, selected: boolean) => {
    if (selected) {
      setSelectedSessions(prev => [...prev, sessionId]);
    } else {
      setSelectedSessions(prev => prev.filter(id => id !== sessionId));
    }
  };

  const selectAllSessions = () => {
    const activeSessionIds = sessions
      .filter(s => s.is_active && !s.is_current)
      .map(s => s.id);
    setSelectedSessions(activeSessionIds);
  };

  const deselectAllSessions = () => {
    setSelectedSessions([]);
  };

  if (loading) {
    return (
      <CliCard className={className}>
        <div className="p-6">
          <TypingText 
            text="Loading user sessions..." 
            className="text-primary-500 text-lg font-semibold mb-4"
          />
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-cli-gray rounded w-3/4"></div>
            <div className="h-4 bg-cli-gray rounded w-1/2"></div>
            <div className="h-4 bg-cli-gray rounded w-2/3"></div>
          </div>
        </div>
      </CliCard>
    );
  }

  return (
    <CliCard className={className}>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <EyeIcon className="h-6 w-6 text-primary-500" />
            <TypingText 
              text={userId ? "User Sessions" : "Active Sessions"}
              className="text-primary-500 text-xl font-mono font-bold"
            />
          </div>
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded bg-cli-terminal border-cli-gray text-primary-500 focus:ring-primary-500"
              />
              <span className="text-cli-white font-mono text-sm">Show Inactive</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded bg-cli-terminal border-cli-gray text-primary-500 focus:ring-primary-500"
              />
              <span className="text-cli-white font-mono text-sm">Auto Refresh</span>
            </label>
            <CliButton variant="secondary" onClick={() => fetchSessions()}>
              <ArrowPathIcon className="h-4 w-4 mr-1" />
              Refresh
            </CliButton>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="text-center p-3 border border-cli-gray rounded">
              <div className="text-2xl font-mono font-bold text-primary-500">{stats.total_sessions}</div>
              <div className="text-cli-light-gray text-sm">Total</div>
            </div>
            <div className="text-center p-3 border border-cli-gray rounded">
              <div className="text-2xl font-mono font-bold text-cli-green">{stats.active_sessions}</div>
              <div className="text-cli-light-gray text-sm">Active</div>
            </div>
            <div className="text-center p-3 border border-cli-gray rounded">
              <div className="text-2xl font-mono font-bold text-cli-amber">{stats.inactive_sessions}</div>
              <div className="text-cli-light-gray text-sm">Inactive</div>
            </div>
            <div className="text-center p-3 border border-cli-gray rounded">
              <div className="text-2xl font-mono font-bold text-cli-cyan">{stats.unique_ips}</div>
              <div className="text-cli-light-gray text-sm">Unique IPs</div>
            </div>
            <div className="text-center p-3 border border-cli-gray rounded">
              <div className="text-2xl font-mono font-bold text-cli-white">{stats.unique_devices}</div>
              <div className="text-cli-light-gray text-sm">Devices</div>
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedSessions.length > 0 && (
          <div className="mb-4 p-3 bg-cli-darker border border-cli-gray rounded">
            <div className="flex items-center justify-between">
              <span className="text-cli-white font-mono text-sm">
                {selectedSessions.length} session{selectedSessions.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex space-x-2">
                <CliButton variant="danger" onClick={terminateSelectedSessions}>
                  <XMarkIcon className="h-4 w-4 mr-1" />
                  Terminate Selected
                </CliButton>
                <CliButton variant="secondary" onClick={deselectAllSessions}>
                  Deselect All
                </CliButton>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex space-x-2 mb-6">
          <CliButton variant="secondary" onClick={selectAllSessions}>
            Select All Active
          </CliButton>
          <CliButton variant="secondary" onClick={deselectAllSessions}>
            Deselect All
          </CliButton>
        </div>

        {/* Sessions List */}
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-cli-light-gray font-mono">
              <EyeIcon className="h-12 w-12 mx-auto mb-4 text-cli-gray" />
              <div className="text-lg">No sessions found</div>
              <div className="text-sm mt-2">
                {showInactive ? 'No sessions available' : 'Try showing inactive sessions'}
              </div>
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="border border-cli-gray rounded p-4 hover:border-primary-500/50 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-4">
                    {/* Selection checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedSessions.includes(session.id)}
                      onChange={(e) => handleSessionSelect(session.id, e.target.checked)}
                      disabled={session.is_current || !session.is_active}
                      className="rounded bg-cli-terminal border-cli-gray text-primary-500 focus:ring-primary-500"
                    />
                    
                    {/* Device icon */}
                    <div className="text-cli-cyan">
                      {getDeviceIcon(session.device_type)}
                    </div>
                    
                    {/* Session info */}
                    <div>
                      <div className="flex items-center space-x-3 mb-1">
                        {getSessionStatusBadge(session)}
                        <span className="text-cli-white font-mono text-sm font-semibold">
                          {session.browser} on {session.os}
                        </span>
                      </div>
                      
                      {/* User info (for global sessions) */}
                      {!userId && (
                        <div className="text-cli-cyan font-mono text-xs mb-1">
                          {session.user_name || session.user_email} ({session.user_id.slice(0, 8)}...)
                        </div>
                      )}
                      
                      <div className="text-cli-light-gray font-mono text-xs">
                        IP: {session.ip_address}
                        {session.location && (
                          <span className="ml-4">
                            <MapPinIcon className="inline h-3 w-3 mr-1" />
                            {session.location.city}, {session.location.country}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-cli-light-gray font-mono text-xs mb-1">
                      Last active: {formatLastActivity(session.last_activity)}
                    </div>
                    <div className="text-cli-light-gray font-mono text-xs">
                      Activities: {session.activity_count}
                    </div>
                    {!session.is_current && session.is_active && (
                      <CliButton
                        variant="danger"
                        size="sm"
                        onClick={() => terminateSession(session.id)}
                        className="mt-2 text-xs"
                      >
                        <XMarkIcon className="h-3 w-3 mr-1" />
                        Terminate
                      </CliButton>
                    )}
                  </div>
                </div>

                {/* Session details */}
                <div className="pl-12 space-y-2">
                  <div className="text-cli-light-gray font-mono text-xs">
                    <span className="text-cli-green">Created:</span> {new Date(session.created_at).toLocaleString()}
                    {session.expires_at && (
                      <span className="ml-4">
                        <span className="text-cli-amber">Expires:</span> {new Date(session.expires_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-cli-light-gray font-mono text-xs">
                    <span className="text-cli-green">User Agent:</span> {session.user_agent.slice(0, 100)}...
                  </div>
                  
                  <div className="text-cli-light-gray font-mono text-xs">
                    <span className="text-cli-green">Session ID:</span> {session.session_token.slice(0, 16)}...
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="text-cli-green font-mono text-xs mt-6">
          $ echo "Sessions loaded: {sessions.length} total, {sessions.filter(s =&gt; s.is_active).length} active" &gt;&gt; admin.log
        </div>
      </div>
    </CliCard>
  );
};

export default UserSessions;
