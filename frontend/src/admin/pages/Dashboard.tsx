import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useNavigate } from 'react-router-dom';
import { TerminalWindow, TypingText, CliCard, CliBadge } from '../components/ui/CliComponents';
import {
  UsersIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ServerIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  QuestionMarkCircleIcon,
  ChatBubbleLeftIcon,
} from '@heroicons/react/24/outline';

interface DashboardStats {
  users: {
    total: number;
    active: number;
    newToday: number;
    growth: number;
  };
  sessions: {
    total: number;
    activeNow: number;
    completedToday: number;
    avgDuration: number;
  };
  questions: {
    totalAsked: number;
    todayAsked: number;
    avgPerSession: number;
    growth: number;
  };
  answers: {
    totalGiven: number;
    todayGiven: number;
    avgScore: number;
    completionRate: number;
  };
  revenue: {
    total: number;
    today: number;
    thisMonth: number;
    growth: number;
  };
  system: {
    uptime: number;
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    status: 'healthy' | 'warning' | 'critical';
  };
}

interface RecentActivity {
  id: string;
  type: 'user_registered' | 'session_completed' | 'payment_received' | 'system_alert';
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

const Dashboard: React.FC = () => {
  const { user } = useAdminAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();

    // Set up real-time updates
    const interval = setInterval(fetchDashboardData, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      // Fetch real data from the analytics overview API
      const response = await fetch(`${apiBaseUrl}/api/admin/analytics/overview`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const apiData = result.data;

        // Map the API data to our dashboard format
        const realStats: DashboardStats = {
          users: {
            total: parseInt(apiData.users?.total) || 0,
            active: parseInt(apiData.users?.active) || 0,
            newToday: parseInt(apiData.users?.newToday) || 0,
            growth: apiData.users?.growth || 0,
          },
          sessions: {
            total: parseInt(apiData.sessions?.total) || 0,
            activeNow: parseInt(apiData.sessions?.activeNow) || 0,
            completedToday: parseInt(apiData.sessions?.completedToday) || 0,
            avgDuration: apiData.sessions?.avgDuration || 0,
          },
          questions: {
            totalAsked: apiData.questions?.totalAsked || 0,
            todayAsked: apiData.questions?.askedToday || 0,
            avgPerSession: apiData.questions?.avgPerSession || 0,
            growth: apiData.questions?.growth || 0,
          },
          answers: {
            totalGiven: apiData.answers?.totalGiven || 0,
            todayGiven: apiData.answers?.givenToday || 0,
            avgScore: apiData.answers?.avgScore || 0,
            completionRate: apiData.answers?.completionRate || 0,
          },
          revenue: {
            total: apiData.revenue?.total || 0,
            today: apiData.revenue?.today || 0,
            thisMonth: apiData.revenue?.thisMonth || 0,
            growth: apiData.revenue?.growth || 0,
          },
          system: {
            uptime: apiData.system?.uptime || 99.9,
            cpuUsage: 25, // Mock values for system stats not provided by API
            memoryUsage: 60,
            diskUsage: 45,
            status: apiData.system?.status || 'healthy',
          },
        };

        const realActivities: RecentActivity[] = apiData.recentActivity || [];

        setStats(realStats);
        setActivities(realActivities);
        setLoading(false);
        return;
      } else {
        console.error('Invalid API response:', result);
        // Fall back to basic structure with zeros
        setStats({
          users: { total: 0, active: 0, newToday: 0, growth: 0 },
          sessions: { total: 0, activeNow: 0, completedToday: 0, avgDuration: 0 },
          questions: { totalAsked: 0, todayAsked: 0, avgPerSession: 0, growth: 0 },
          answers: { totalGiven: 0, todayGiven: 0, avgScore: 0, completionRate: 0 },
          revenue: { total: 0, today: 0, thisMonth: 0, growth: 0 },
          system: { uptime: 99.9, cpuUsage: 25, memoryUsage: 60, diskUsage: 45, status: 'healthy' },
        });
        setActivities([]);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSystemStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-cli-green';
      case 'warning':
        return 'text-cli-amber';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-cli-light-gray';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'user_registered':
        return UsersIcon;
      case 'session_completed':
        return CheckCircleIcon;
      case 'payment_received':
        return CurrencyDollarIcon;
      case 'system_alert':
        return ExclamationTriangleIcon;
      default:
        return ChartBarIcon;
    }
  };

  const getActivityColor = (severity: string) => {
    switch (severity) {
      case 'success':
        return 'text-cli-green';
      case 'warning':
        return 'text-cli-amber';
      case 'error':
        return 'text-red-500';
      case 'info':
        return 'text-cli-cyan';
      default:
        return 'text-cli-light-gray';
    }
  };

  const formatUptime = (uptime: number) => {
    const days = Math.floor(uptime / (24 * 60));
    const hours = Math.floor((uptime % (24 * 60)) / 60);
    return `${days}d ${hours}h`;
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='Loading dashboard...' className='animate-pulse'>
          <div className='p-6'>
            <TypingText text='Fetching real-time data...' className='text-cli-light-gray' />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title={`admin@mockmate:~$ ./dashboard --user=${user?.username}`}>
        <div className='p-6'>
          <TypingText
            text={`Welcome back, ${user?.firstName || user?.username}! System status: ${stats?.system.status.toUpperCase()}`}
            className='mb-4 text-xl font-semibold text-primary-500'
          />
          <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
            <div>$ uptime</div>
            <div className='pl-6 text-cli-green'>
              System uptime: {stats && formatUptime(stats.system.uptime)} (
              {stats?.system.uptime.toFixed(2)}%)
            </div>
            <div>$ ps aux | grep "active_sessions" | wc -l</div>
            <div className='pl-6 text-primary-500'>{stats?.sessions.activeNow} active sessions</div>
          </div>
        </div>
      </TerminalWindow>

      {/* Main Stats Grid */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4'>
        {/* Users Stats */}
        <button
          onClick={() => navigate('/admin/users')}
          className='w-full text-left focus:outline-none'
        >
          <CliCard className='hover:shadow-glow-info group cursor-pointer transition-all duration-300'>
            <div className='mb-4 flex items-center justify-between'>
              <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                <UsersIcon className='h-6 w-6 text-primary-500' />
              </div>
              <CliBadge variant='info'>USERS</CliBadge>
            </div>
            <div className='space-y-2'>
              <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
                {stats?.users.total.toLocaleString()}
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Total Users</div>
              <div className='flex items-center space-x-2'>
                <span className='font-mono text-sm text-cli-green'>
                  +{stats?.users.newToday} today
                </span>
                <div className='flex items-center'>
                  <ArrowTrendingUpIcon className='h-3 w-3 text-cli-green' />
                  <span className='font-mono text-xs text-cli-green'>{stats?.users.growth}%</span>
                </div>
              </div>
            </div>
            <div className='mt-3 font-mono text-xs text-cli-green'>
              $ grep "ACTIVE" users.log | wc -l: {stats?.users.active}
            </div>
          </CliCard>
        </button>

        {/* Sessions Stats */}
        <button
          onClick={() => navigate('/admin/sessions')}
          className='w-full text-left focus:outline-none'
        >
          <CliCard className='hover:shadow-glow-warning group cursor-pointer transition-all duration-300'>
            <div className='mb-4 flex items-center justify-between'>
              <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                <ClockIcon className='h-6 w-6 text-primary-500' />
              </div>
              <CliBadge variant='warning'>SESSIONS</CliBadge>
            </div>
            <div className='space-y-2'>
              <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
                {stats?.sessions.total.toLocaleString()}
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Total Sessions</div>
              <div className='flex items-center space-x-2'>
                <span className='font-mono text-sm text-cli-green'>
                  {stats?.sessions.completedToday} completed today
                </span>
              </div>
            </div>
            <div className='mt-3 font-mono text-xs text-cli-green'>
              $ tail -f sessions.log | grep "ACTIVE": {stats?.sessions.activeNow}
            </div>
          </CliCard>
        </button>

        {/* Revenue Stats */}
        <button
          onClick={() => navigate('/admin/pricing')}
          className='w-full text-left focus:outline-none'
        >
          <CliCard className='hover:shadow-glow-success group cursor-pointer transition-all duration-300'>
            <div className='mb-4 flex items-center justify-between'>
              <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                <CurrencyDollarIcon className='h-6 w-6 text-cli-green' />
              </div>
              <CliBadge variant='success'>REVENUE</CliBadge>
            </div>
            <div className='space-y-2'>
              <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
                ${stats?.revenue.total.toLocaleString()}
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>Total Revenue</div>
              <div className='flex items-center space-x-2'>
                <span className='font-mono text-sm text-cli-green'>
                  +${stats?.revenue.today} today
                </span>
                <div className='flex items-center'>
                  <ArrowTrendingUpIcon className='h-3 w-3 text-cli-green' />
                  <span className='font-mono text-xs text-cli-green'>{stats?.revenue.growth}%</span>
                </div>
              </div>
            </div>
            <div className='mt-3 font-mono text-xs text-cli-green'>
              $ sum payments_this_month.csv: ${stats?.revenue.thisMonth.toLocaleString()}
            </div>
          </CliCard>
        </button>

        {/* System Stats */}
        <button
          onClick={() => navigate('/admin/system')}
          className='w-full text-left focus:outline-none'
        >
          <CliCard className='hover:shadow-glow-danger group cursor-pointer transition-all duration-300'>
            <div className='mb-4 flex items-center justify-between'>
              <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
                <ServerIcon className='h-6 w-6 text-primary-500' />
              </div>
              <CliBadge variant={stats?.system.status === 'healthy' ? 'success' : 'warning'}>
                {stats?.system.status.toUpperCase()}
              </CliBadge>
            </div>
            <div className='space-y-2'>
              <div
                className={`cli-glow font-mono text-3xl font-bold ${getSystemStatusColor(stats?.system.status || 'healthy')}`}
              >
                {stats?.system.uptime.toFixed(1)}%
              </div>
              <div className='font-mono text-sm text-cli-light-gray'>System Uptime</div>
              <div className='space-y-1 font-mono text-xs'>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>CPU:</span>
                  <span className='text-cli-amber'>{stats?.system.cpuUsage}%</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>RAM:</span>
                  <span className='text-cli-amber'>{stats?.system.memoryUsage}%</span>
                </div>
              </div>
            </div>
            <div className='mt-3 font-mono text-xs text-cli-green'>
              $ df -h /: {stats?.system.diskUsage}% used
            </div>
          </CliCard>
        </button>
      </div>

      {/* Recent Activity and Quick Actions */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {/* Recent Activity */}
        <TerminalWindow title='admin@mockmate:~$ tail -f /var/log/activity'>
          <div className='p-6'>
            <div className='mb-6 flex items-center justify-between'>
              <TypingText
                text='Real-time System Activity'
                className='font-mono font-bold text-primary-500'
              />
              <CliBadge variant='success' className='animate-pulse'>
                LIVE
              </CliBadge>
            </div>

            <div className='max-h-80 space-y-3 overflow-y-auto'>
              {activities.map(activity => {
                const Icon = getActivityIcon(activity.type);
                return (
                  <CliCard
                    key={activity.id}
                    className='hover:shadow-glow-info group transition-all'
                  >
                    <div className='p-3'>
                      <div className='flex items-start space-x-3'>
                        <Icon className={`mt-1 h-4 w-4 ${getActivityColor(activity.severity)}`} />
                        <div className='min-w-0 flex-1'>
                          <div className='font-mono text-sm text-cli-white'>{activity.message}</div>
                          <div className='mt-1 font-mono text-xs text-cli-light-gray'>
                            {new Date(activity.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        <CliBadge variant={activity.severity as any} className='text-xs'>
                          {activity.severity.toUpperCase()}
                        </CliBadge>
                      </div>
                      <div className='mt-2 font-mono text-xs text-cli-green'>
                        $ echo "{activity.type}" &gt;&gt; activity.log
                      </div>
                    </div>
                  </CliCard>
                );
              })}
            </div>
          </div>
        </TerminalWindow>

        {/* Quick Actions */}
        <TerminalWindow title='admin@mockmate:~$ ls /usr/bin/admin-tools/'>
          <div className='p-6'>
            <div className='mb-6'>
              <TypingText
                text='Quick Administration Tools'
                className='font-mono font-bold text-primary-500'
              />
            </div>

            <div className='space-y-4'>
              <div className='grid grid-cols-1 gap-3'>
                <button
                  onClick={() => navigate('/admin/users')}
                  className='admin-nav-item group rounded-md p-4 text-left'
                >
                  <div className='flex items-center space-x-3'>
                    <UsersIcon className='h-5 w-5 text-cli-light-gray group-hover:text-primary-500' />
                    <div>
                      <div className='font-mono font-medium text-cli-white group-hover:text-primary-500'>
                        View Users
                      </div>
                      <div className='font-mono text-xs text-cli-green'>
                        ./users --list --active
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/admin/analytics')}
                  className='admin-nav-item group rounded-md p-4 text-left'
                >
                  <div className='flex items-center space-x-3'>
                    <ChartBarIcon className='h-5 w-5 text-cli-light-gray group-hover:text-primary-500' />
                    <div>
                      <div className='font-mono font-medium text-cli-white group-hover:text-primary-500'>
                        Analytics Report
                      </div>
                      <div className='font-mono text-xs text-cli-green'>
                        ./analytics --generate --today
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/admin/system')}
                  className='admin-nav-item group rounded-md p-4 text-left'
                >
                  <div className='flex items-center space-x-3'>
                    <ServerIcon className='h-5 w-5 text-cli-light-gray group-hover:text-primary-500' />
                    <div>
                      <div className='font-mono font-medium text-cli-white group-hover:text-primary-500'>
                        System Status
                      </div>
                      <div className='font-mono text-xs text-cli-green'>
                        ./system --health-check --verbose
                      </div>
                    </div>
                  </div>
                </button>
              </div>

              <div className='border-t border-cli-gray pt-4'>
                <div className='space-y-1 font-mono text-xs text-cli-light-gray'>
                  <div>$ ps aux | head -5</div>
                  <div className='pl-6 text-cli-green'>root 1234 0.1 2.3 node /app/server.js</div>
                  <div className='pl-6 text-cli-green'>
                    admin 5678 0.0 1.1 redis /etc/redis/redis.conf
                  </div>
                  <div className='pl-6 text-cli-green'>www 9012 0.2 3.4 nginx master process</div>
                </div>
              </div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default Dashboard;
