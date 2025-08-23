import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliSelect,
} from '../components/ui/CliComponents';
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ChartBarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CalendarIcon,
  UserGroupIcon,
  CreditCardIcon,
  BanknotesIcon,
  DocumentChartBarIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

interface RevenueData {
  summary: {
    totalRevenue: number;
    totalCreditsUsed: number;
    payingUsers: number;
    avgCreditsPerTransaction: number;
    totalTransactions: number;
    revenuePerUser: number;
  };
  trends: Array<{
    date: string;
    transactionCount: number;
    creditsUsed: number;
    estimatedRevenue: number;
  }>;
  revenueByType: Array<{
    type: string;
    sessionCount: number;
    totalCredits: number;
    estimatedRevenue: number;
    avgCreditsPerSession: number;
  }>;
  topSpendingUsers: Array<{
    id: string;
    name: string;
    email: string;
    totalCreditsUsed: number;
    estimatedSpent: number;
    totalSessions: number;
    createdAt: string;
  }>;
}

const Revenue: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [period, setPeriod] = useState('30d');
  const [error, setError] = useState<string | null>(null);

  const periodOptions = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: '1y', label: '1 Year' },
  ];

  useEffect(() => {
    fetchRevenueData();
  }, [period]);

  const fetchRevenueData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/analytics/revenue?period=${period}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setRevenueData(result.data);
        } else {
          setError('Failed to fetch revenue data');
        }
      } else {
        setError('Failed to fetch revenue data');
      }
    } catch (err) {
      console.error('Error fetching revenue data:', err);
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: 'csv' | 'pdf') => {
    try {
      const response = await fetch('/api/admin/analytics/export', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'revenue',
          format,
          period,
          filters: {},
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(
            `Export initiated! Download will be available in ${result.data.estimatedCompletionTime}`
          );
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export report');
    }
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./revenue --loading'>
          <div className='p-6'>
            <TypingText
              text='Loading revenue analytics...'
              className='mb-4 text-xl font-semibold text-primary-500'
            />
            <div className='animate-pulse space-y-4'>
              <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
              <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (error || !revenueData) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./revenue --error'>
          <div className='p-6'>
            <div className='py-12 text-center font-mono text-red-500'>
              <ExclamationTriangleIcon className='mx-auto mb-4 h-12 w-12' />
              <div className='mb-2 text-xl'>Revenue Data Unavailable</div>
              <div className='mb-4 text-sm text-cli-light-gray'>
                {error || 'Unable to load revenue analytics'}
              </div>
              <CliButton variant='primary' onClick={fetchRevenueData}>
                Retry
              </CliButton>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  // Chart configurations
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#9CA3AF',
          font: { family: 'JetBrains Mono, monospace' },
        },
      },
      tooltip: {
        titleFont: { family: 'JetBrains Mono, monospace' },
        bodyFont: { family: 'JetBrains Mono, monospace' },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9CA3AF', font: { family: 'JetBrains Mono, monospace' } },
        grid: { color: '#374151' },
      },
      y: {
        ticks: { color: '#9CA3AF', font: { family: 'JetBrains Mono, monospace' } },
        grid: { color: '#374151' },
      },
    },
  };

  const revenueChartData = {
    labels: revenueData.trends.map(item => new Date(item.date).toLocaleDateString()),
    datasets: [
      {
        label: 'Revenue ($)',
        data: revenueData.trends.map(item => item.estimatedRevenue),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Transactions',
        data: revenueData.trends.map(item => item.transactionCount),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        yAxisID: 'y1',
      },
    ],
  };

  const typeRevenueChartData = {
    labels: revenueData.revenueByType.map(item => item.type),
    datasets: [
      {
        label: 'Revenue by Type ($)',
        data: revenueData.revenueByType.map(item => item.estimatedRevenue),
        backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'],
        borderColor: ['#059669', '#2563EB', '#D97706', '#DC2626', '#7C3AED'],
        borderWidth: 1,
      },
    ],
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatNumber = (num: number) => num.toLocaleString();

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./revenue --dashboard --analytics'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <div className='bg-cli-terminal flex h-12 w-12 items-center justify-center rounded-full'>
                <CurrencyDollarIcon className='h-6 w-6 text-primary-500' />
              </div>
              <div>
                <TypingText
                  text='Revenue Analytics Dashboard'
                  className='font-mono text-xl font-bold text-primary-500'
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  Financial insights and revenue tracking
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-4'>
              <CliSelect
                value={period}
                onChange={e => setPeriod(e.target.value)}
                options={periodOptions}
                className='min-w-[120px]'
              />
              <div className='flex space-x-2'>
                <CliButton
                  variant='secondary'
                  onClick={() => exportReport('csv')}
                  className='flex items-center space-x-2 text-xs'
                >
                  <ArrowDownTrayIcon className='h-4 w-4' />
                  <span>CSV</span>
                </CliButton>
                <CliButton
                  variant='secondary'
                  onClick={() => exportReport('pdf')}
                  className='flex items-center space-x-2 text-xs'
                >
                  <DocumentChartBarIcon className='h-4 w-4' />
                  <span>PDF</span>
                </CliButton>
              </div>
            </div>
          </div>

          <div className='font-mono text-sm text-cli-green'>
            $ ./revenue-analyzer --period={period} --export=enabled
          </div>
        </div>
      </TerminalWindow>

      {/* Revenue Summary */}
      <TerminalWindow title='admin@mockmate:~$ cat revenue_summary.json'>
        <div className='p-6'>
          <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
            <CliCard className='from-cli-terminal bg-gradient-to-br to-cli-gray p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='mb-1 font-mono text-sm text-cli-light-gray'>Total Revenue</div>
                  <div className='font-mono text-2xl font-bold text-cli-green'>
                    {formatCurrency(revenueData.summary.totalRevenue)}
                  </div>
                </div>
                <div className='rounded-full bg-cli-green bg-opacity-20 p-3'>
                  <BanknotesIcon className='h-6 w-6 text-cli-green' />
                </div>
              </div>
            </CliCard>

            <CliCard className='from-cli-terminal bg-gradient-to-br to-cli-gray p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='mb-1 font-mono text-sm text-cli-light-gray'>Paying Users</div>
                  <div className='font-mono text-2xl font-bold text-primary-500'>
                    {formatNumber(revenueData.summary.payingUsers)}
                  </div>
                </div>
                <div className='rounded-full bg-primary-500 bg-opacity-20 p-3'>
                  <UserGroupIcon className='h-6 w-6 text-primary-500' />
                </div>
              </div>
            </CliCard>

            <CliCard className='from-cli-terminal bg-gradient-to-br to-cli-gray p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='mb-1 font-mono text-sm text-cli-light-gray'>Credits Used</div>
                  <div className='font-mono text-2xl font-bold text-cli-amber'>
                    {formatNumber(revenueData.summary.totalCreditsUsed)}
                  </div>
                </div>
                <div className='rounded-full bg-cli-amber bg-opacity-20 p-3'>
                  <CreditCardIcon className='h-6 w-6 text-cli-amber' />
                </div>
              </div>
            </CliCard>

            <CliCard className='from-cli-terminal bg-gradient-to-br to-cli-gray p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='mb-1 font-mono text-sm text-cli-light-gray'>Revenue/User</div>
                  <div className='font-mono text-2xl font-bold text-cli-cyan'>
                    {formatCurrency(revenueData.summary.revenuePerUser)}
                  </div>
                </div>
                <div className='rounded-full bg-cli-cyan bg-opacity-20 p-3'>
                  <ArrowTrendingUpIcon className='h-6 w-6 text-cli-cyan' />
                </div>
              </div>
            </CliCard>
          </div>

          <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
            <CliCard className='p-4'>
              <div className='mb-2 font-mono text-sm text-cli-light-gray'>Transactions</div>
              <div className='font-mono text-xl font-bold text-cli-white'>
                {formatNumber(revenueData.summary.totalTransactions)}
              </div>
            </CliCard>
            <CliCard className='p-4'>
              <div className='mb-2 font-mono text-sm text-cli-light-gray'>
                Avg Credits/Transaction
              </div>
              <div className='font-mono text-xl font-bold text-cli-white'>
                {revenueData.summary.avgCreditsPerTransaction.toFixed(1)}
              </div>
            </CliCard>
            <CliCard className='p-4'>
              <div className='mb-2 font-mono text-sm text-cli-light-gray'>Period</div>
              <div className='font-mono text-xl font-bold text-primary-500'>
                {period.toUpperCase()}
              </div>
            </CliCard>
          </div>
        </div>
      </TerminalWindow>

      {/* Charts */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <TerminalWindow title='admin@mockmate:~$ ./charts --revenue-trends'>
          <div className='p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <h3 className='font-mono text-lg font-bold text-primary-500'>Revenue Trends</h3>
              <CliBadge variant='success'>LIVE</CliBadge>
            </div>
            <div className='h-64'>
              <Line data={revenueChartData} options={chartOptions} />
            </div>
          </div>
        </TerminalWindow>

        <TerminalWindow title='admin@mockmate:~$ ./charts --revenue-by-type'>
          <div className='p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <h3 className='font-mono text-lg font-bold text-primary-500'>Revenue by Type</h3>
              <CliBadge variant='info'>BREAKDOWN</CliBadge>
            </div>
            <div className='h-64'>
              <Pie data={typeRevenueChartData} options={chartOptions} />
            </div>
          </div>
        </TerminalWindow>
      </div>

      {/* Revenue by Type Details */}
      <TerminalWindow title='admin@mockmate:~$ cat revenue_by_type.db'>
        <div className='p-6'>
          <h3 className='mb-4 font-mono text-lg font-bold text-primary-500'>
            Revenue Analysis by Session Type
          </h3>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {revenueData.revenueByType.map((item, index) => (
              <CliCard key={index} className='hover:shadow-glow-info p-4 transition-all'>
                <div className='mb-3 flex items-center justify-between'>
                  <h4 className='font-mono font-bold capitalize text-cli-white'>{item.type}</h4>
                  <ChartBarIcon className='h-5 w-5 text-primary-500' />
                </div>
                <div className='space-y-2 font-mono text-sm'>
                  <div className='flex justify-between'>
                    <span className='text-cli-light-gray'>Revenue:</span>
                    <span className='font-bold text-cli-green'>
                      {formatCurrency(item.estimatedRevenue)}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-cli-light-gray'>Sessions:</span>
                    <span className='text-cli-cyan'>{formatNumber(item.sessionCount)}</span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-cli-light-gray'>Credits:</span>
                    <span className='text-cli-amber'>{formatNumber(item.totalCredits)}</span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-cli-light-gray'>Avg/Session:</span>
                    <span className='text-cli-white'>{item.avgCreditsPerSession.toFixed(1)}</span>
                  </div>
                </div>
              </CliCard>
            ))}
          </div>
        </div>
      </TerminalWindow>

      {/* Top Spending Users */}
      <TerminalWindow title='admin@mockmate:~$ ./users --top-spenders --limit=10'>
        <div className='p-6'>
          <h3 className='mb-4 font-mono text-lg font-bold text-primary-500'>Top Spending Users</h3>
          <div className='overflow-x-auto'>
            <table className='w-full font-mono text-sm'>
              <thead>
                <tr className='border-b border-cli-gray'>
                  <th className='py-2 text-left text-cli-light-gray'>Rank</th>
                  <th className='py-2 text-left text-cli-light-gray'>User</th>
                  <th className='py-2 text-left text-cli-light-gray'>Email</th>
                  <th className='py-2 text-right text-cli-light-gray'>Spent</th>
                  <th className='py-2 text-right text-cli-light-gray'>Credits</th>
                  <th className='py-2 text-right text-cli-light-gray'>Sessions</th>
                  <th className='py-2 text-center text-cli-light-gray'>Joined</th>
                </tr>
              </thead>
              <tbody>
                {revenueData.topSpendingUsers.map((user, index) => (
                  <tr
                    key={user.id}
                    className='border-b border-cli-gray hover:bg-cli-gray hover:bg-opacity-50'
                  >
                    <td className='py-3'>
                      <CliBadge variant={index < 3 ? 'warning' : 'secondary'}>
                        #{index + 1}
                      </CliBadge>
                    </td>
                    <td className='py-3 font-semibold text-cli-white'>{user.name}</td>
                    <td className='py-3 text-cli-cyan'>{user.email}</td>
                    <td className='py-3 text-right font-bold text-cli-green'>
                      {formatCurrency(user.estimatedSpent)}
                    </td>
                    <td className='py-3 text-right text-cli-amber'>
                      {formatNumber(user.totalCreditsUsed)}
                    </td>
                    <td className='py-3 text-right text-cli-light-gray'>
                      {formatNumber(user.totalSessions)}
                    </td>
                    <td className='py-3 text-center text-xs text-cli-light-gray'>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TerminalWindow>

      {/* System Status */}
      <div className='text-center font-mono text-xs text-cli-green'>
        $ tail -f revenue.log | grep -E "TRANSACTION|PAYMENT|CREDIT_USAGE"
        <br />
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  );
};

export default Revenue;
