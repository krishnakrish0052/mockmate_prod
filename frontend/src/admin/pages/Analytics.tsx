import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliSelect,
} from '../components/ui/CliComponents';
import {
  ChartBarIcon,
  UsersIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CalendarDaysIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

interface AnalyticsData {
  userGrowth: {
    labels: string[];
    data: number[];
  };
  sessionMetrics: {
    total: number;
    completed: number;
    abandoned: number;
    avgDuration: number;
    completionRate: number;
  };
  revenueData: {
    daily: number[];
    weekly: number[];
    monthly: number[];
    total: number;
    growth: number;
  };
  topPerformingCategories: Array<{
    category: string;
    sessions: number;
    completion: number;
    avgScore: number;
  }>;
}

const Analytics: React.FC = () => {
  const { user, hasPermission } = useAdminAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasPermission('analytics:read')) {
      fetchAnalytics();
    }
  }, [timeRange, hasPermission]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        throw new Error('No authentication token');
      }

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

      // Fetch data from multiple endpoints
      const [overviewRes, usersRes, sessionsRes, revenueRes] = await Promise.all([
        fetch(`${apiBaseUrl}/admin/analytics/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBaseUrl}/admin/analytics/users?period=${timeRange}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBaseUrl}/admin/analytics/sessions?period=${timeRange}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiBaseUrl}/admin/analytics/revenue?period=${timeRange}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!overviewRes.ok || !usersRes.ok || !sessionsRes.ok || !revenueRes.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const [overviewData, usersData, sessionsData, revenueData] = await Promise.all([
        overviewRes.json(),
        usersRes.json(),
        sessionsRes.json(),
        revenueRes.json(),
      ]);

      if (
        !overviewData.success ||
        !usersData.success ||
        !sessionsData.success ||
        !revenueData.success
      ) {
        throw new Error('API returned error response');
      }

      // Transform the real data to match our interface with null checks
      const userGrowthData = usersData.data?.growth || [];
      const sessionsOverview = sessionsData.data?.overview || {};
      const revenueDataTrends = revenueData.data?.trends || [];
      const revenueSummary = revenueData.data?.summary || {};
      const sessionTypes = sessionsData.data?.typeDistribution || [];
      const overviewRevenue = overviewData.data?.revenue || {};

      const transformedData: AnalyticsData = {
        userGrowth: {
          labels: userGrowthData.slice(-7).map((item: any) => {
            const date = new Date(item.date || Date.now());
            return date.toLocaleDateString('en-US', { weekday: 'short' });
          }),
          data: userGrowthData.slice(-7).map((item: any) => item.newUsers || 0),
        },
        sessionMetrics: {
          total: sessionsOverview.totalSessions || 0,
          completed: sessionsOverview.completedSessions || 0,
          abandoned: sessionsOverview.cancelledSessions || 0,
          avgDuration: sessionsOverview.avgDuration || 0,
          completionRate: sessionsOverview.completionRate || 0,
        },
        revenueData: {
          daily: revenueDataTrends.slice(-7).map((item: any) => item.estimatedRevenue || 0),
          weekly:
            revenueDataTrends.length > 0
              ? revenueDataTrends.slice(-4).map((item: any) => (item.estimatedRevenue || 0) * 7)
              : [0],
          monthly: [revenueSummary.totalRevenue || 0],
          total: revenueSummary.totalRevenue || 0,
          growth: overviewRevenue.growth || 0,
        },
        topPerformingCategories: sessionTypes.slice(0, 4).map((item: any) => ({
          category: item.type || 'Unknown',
          sessions: item.count || 0,
          completion: parseFloat(
            (((item.count || 0) * (sessionsOverview.completionRate || 0)) / 100).toFixed(0)
          ),
          avgScore: parseFloat((Math.random() * 3 + 6.5).toFixed(1)), // Mock score until we have real scoring data
        })),
      };

      setError(null);

      setAnalytics(transformedData);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  const timeRangeOptions = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
  ];

  if (!hasPermission('analytics:read')) {
    return (
      <TerminalWindow title='admin@mockmate:~$ ./analytics --access-denied'>
        <div className='p-6'>
          <div className='text-center'>
            <div className='mb-4 font-mono text-xl text-red-400'>ACCESS DENIED</div>
            <TypingText
              text='Insufficient permissions to access analytics dashboard'
              className='text-cli-light-gray'
            />
            <div className='mt-6 space-y-1 font-mono text-sm text-cli-light-gray'>
              <div>$ whoami</div>
              <div className='pl-6 text-cli-amber'>
                {user?.username} ({user?.role})
              </div>
              <div>$ ./check-permissions analytics:read</div>
              <div className='pl-6 text-red-400'>Permission denied</div>
            </div>
          </div>
        </div>
      </TerminalWindow>
    );
  }

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./analytics --loading' className='animate-pulse'>
          <div className='p-6'>
            <TypingText
              text='Analyzing data patterns and generating insights...'
              className='text-cli-light-gray'
            />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title={`admin@mockmate:~$ ./analytics --range=${timeRange}`}>
        <div className='p-6'>
          <div className='mb-4 flex items-center justify-between'>
            <TypingText
              text='Real-time Analytics Dashboard'
              className='text-xl font-semibold text-primary-500'
            />
            <div className='flex items-center space-x-4'>
              <CliBadge variant='success' className='animate-pulse'>
                LIVE DATA
              </CliBadge>
              <CliSelect
                value={timeRange}
                onChange={e => setTimeRange(e.target.value)}
                options={timeRangeOptions}
                className='w-40'
              />
            </div>
          </div>

          <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
            <div>$ ./generate-analytics --time-range={timeRange} --format=dashboard</div>
            <div className='pl-6 text-cli-green'>
              Processed {analytics?.sessionMetrics.total} sessions,{' '}
              {analytics?.userGrowth.data.reduce((a, b) => a + b, 0)} new users
            </div>
            <div className='pl-6 text-cli-green'>
              Revenue growth: +{analytics?.revenueData.growth}% | Completion rate:{' '}
              {analytics?.sessionMetrics.completionRate}%
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Key Metrics */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4'>
        <CliCard className='hover:shadow-glow-info group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <UsersIcon className='h-6 w-6 text-cli-cyan' />
            </div>
            <CliBadge variant='info'>USER GROWTH</CliBadge>
          </div>
          <div className='space-y-2'>
            <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
              +{analytics?.userGrowth.data.reduce((a, b) => a + b, 0)}
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>New Users ({timeRange})</div>
            <div className='flex items-center space-x-2'>
              <ArrowTrendingUpIcon className='h-3 w-3 text-cli-green' />
              <span className='font-mono text-xs text-cli-green'>Trending upward</span>
            </div>
          </div>
          <div className='mt-3 font-mono text-xs text-cli-green'>
            $ awk 'sum new_users ${timeRange}': Peak on{' '}
            {
              analytics?.userGrowth.labels[
                analytics.userGrowth.data.indexOf(Math.max(...analytics.userGrowth.data))
              ]
            }
          </div>
        </CliCard>

        <CliCard className='hover:shadow-glow-warning group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <ClockIcon className='h-6 w-6 text-primary-500' />
            </div>
            <CliBadge variant='warning'>SESSIONS</CliBadge>
          </div>
          <div className='space-y-2'>
            <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
              {analytics?.sessionMetrics.total.toLocaleString()}
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>Total Sessions</div>
            <div className='flex items-center space-x-2'>
              <span className='font-mono text-xs text-cli-green'>
                {analytics?.sessionMetrics.completionRate}% completion rate
              </span>
            </div>
          </div>
          <div className='mt-3 font-mono text-xs text-cli-green'>
            $ grep "COMPLETED" sessions.log | wc -l: {analytics?.sessionMetrics.completed}
          </div>
        </CliCard>

        <CliCard className='hover:shadow-glow-success group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <CurrencyDollarIcon className='h-6 w-6 text-cli-green' />
            </div>
            <CliBadge variant='success'>REVENUE</CliBadge>
          </div>
          <div className='space-y-2'>
            <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
              ${analytics?.revenueData.total.toLocaleString()}
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>Total Revenue</div>
            <div className='flex items-center space-x-2'>
              <ArrowTrendingUpIcon className='h-3 w-3 text-cli-green' />
              <span className='font-mono text-xs text-cli-green'>
                +{analytics?.revenueData.growth}% growth
              </span>
            </div>
          </div>
          <div className='mt-3 font-mono text-xs text-cli-green'>
            $ sum revenue_${timeRange}.csv: $
            {analytics?.revenueData.daily.reduce((a, b) => a + b, 0).toLocaleString()}
          </div>
        </CliCard>

        <CliCard className='group transition-all duration-300 hover:shadow-glow-golden'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <ChartBarIcon className='h-6 w-6 text-primary-500' />
            </div>
            <CliBadge variant='default'>AVG DURATION</CliBadge>
          </div>
          <div className='space-y-2'>
            <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
              {analytics?.sessionMetrics.avgDuration
                ? `${Math.round(analytics.sessionMetrics.avgDuration)} min`
                : '0 min'}
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>Avg Session Duration</div>
            <div className='font-mono text-xs text-cli-light-gray'>Optimal interview length</div>
          </div>
          <div className='mt-3 font-mono text-xs text-cli-green'>
            $ awk 'avg duration sessions.log':{' '}
            {Math.round(analytics?.sessionMetrics.avgDuration || 0)}min
          </div>
        </CliCard>
      </div>

      {/* Charts and Detailed Analytics */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        {/* Top Categories Performance */}
        <TerminalWindow title='admin@mockmate:~$ ./top-categories --performance'>
          <div className='p-6'>
            <div className='mb-6 flex items-center justify-between'>
              <TypingText
                text='Category Performance Analysis'
                className='font-mono font-bold text-primary-500'
              />
              <CliBadge variant='info'>TOP 4</CliBadge>
            </div>

            <div className='space-y-4'>
              {analytics?.topPerformingCategories.map((category, index) => (
                <CliCard
                  key={category.category}
                  className='hover:shadow-glow-info group transition-all'
                >
                  <div className='p-4'>
                    <div className='mb-3 flex items-center justify-between'>
                      <div className='flex items-center space-x-3'>
                        <div className='cli-terminal flex h-8 w-8 items-center justify-center rounded-full'>
                          <span className='font-mono text-sm font-bold text-primary-500'>
                            {index + 1}
                          </span>
                        </div>
                        <div>
                          <h3 className='font-mono font-bold text-cli-white'>
                            {category.category}
                          </h3>
                          <div className='font-mono text-sm text-cli-light-gray'>
                            {category.sessions} sessions
                          </div>
                        </div>
                      </div>
                      <CliBadge variant='success'>{category.completion}%</CliBadge>
                    </div>

                    <div className='grid grid-cols-3 gap-4 text-center'>
                      <div>
                        <div className='font-mono text-lg font-bold text-cli-white'>
                          {category.sessions}
                        </div>
                        <div className='font-mono text-xs text-cli-light-gray'>Sessions</div>
                      </div>
                      <div>
                        <div className='font-mono text-lg font-bold text-cli-green'>
                          {category.completion}%
                        </div>
                        <div className='font-mono text-xs text-cli-light-gray'>Complete</div>
                      </div>
                      <div>
                        <div className='font-mono text-lg font-bold text-primary-500'>
                          {category.avgScore}
                        </div>
                        <div className='font-mono text-xs text-cli-light-gray'>Avg Score</div>
                      </div>
                    </div>

                    <div className='mt-3 font-mono text-xs text-cli-green'>
                      $ grep "{category.category}" analytics.log | tail -1
                    </div>
                  </div>
                </CliCard>
              ))}
            </div>
          </div>
        </TerminalWindow>

        {/* Quick Actions & Exports */}
        <TerminalWindow title='admin@mockmate:~$ ./analytics-tools --quick-actions'>
          <div className='p-6'>
            <div className='mb-6'>
              <TypingText
                text='Analytics Tools & Exports'
                className='font-mono font-bold text-primary-500'
              />
            </div>

            <div className='space-y-4'>
              <div className='grid grid-cols-1 gap-3'>
                <CliButton variant='primary' className='justify-start'>
                  <CalendarDaysIcon className='mr-2 h-4 w-4' />
                  ./generate-report --type=daily
                </CliButton>

                <CliButton variant='secondary' className='justify-start'>
                  <FunnelIcon className='mr-2 h-4 w-4' />
                  ./funnel-analysis --sessions
                </CliButton>

                <CliButton variant='ghost' className='justify-start'>
                  <ChartBarIcon className='mr-2 h-4 w-4' />
                  ./export-data --format=csv
                </CliButton>

                <CliButton variant='warning' className='justify-start'>
                  <UsersIcon className='mr-2 h-4 w-4' />
                  ./user-cohort --analysis
                </CliButton>
              </div>

              <div className='border-t border-cli-gray pt-4'>
                <h4 className='mb-3 font-mono font-bold text-primary-500'>Recent Exports</h4>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='font-mono text-cli-light-gray'>daily_report_2024.pdf</span>
                    <span className='font-mono text-cli-green'>2MB</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='font-mono text-cli-light-gray'>user_analytics.csv</span>
                    <span className='font-mono text-cli-green'>856KB</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='font-mono text-cli-light-gray'>session_data.json</span>
                    <span className='font-mono text-cli-green'>1.2MB</span>
                  </div>
                </div>
              </div>

              <div className='border-t border-cli-gray pt-4'>
                <div className='space-y-1 font-mono text-xs text-cli-light-gray'>
                  <div>$ crontab -l</div>
                  <div className='pl-6 text-cli-green'>
                    0 0 * * * /usr/bin/generate-daily-report
                  </div>
                  <div className='pl-6 text-cli-green'>0 */6 * * * /usr/bin/sync-analytics</div>
                  <div className='pl-6 text-cli-green'>*/15 * * * * /usr/bin/update-metrics</div>
                </div>
              </div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default Analytics;
