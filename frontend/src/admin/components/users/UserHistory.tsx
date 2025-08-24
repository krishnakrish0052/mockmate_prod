import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
} from '../ui/CliComponents';
import {
  ClockIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PencilIcon,
  UserIcon,
  EyeIcon,
  DocumentIcon,
  BellIcon,
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';

interface UserHistoryProps {
  userId?: string;
  className?: string;
}

interface HistoryEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  activity_type: string;
  description: string;
  details?: string;
  metadata: any;
  ip_address?: string;
  user_agent?: string;
  admin_id?: string;
  admin_name?: string;
  created_at: string;
}

interface FilterOptions {
  activity_type: string;
  admin_only: boolean;
  date_range: string;
  search: string;
}

const UserHistory: React.FC<UserHistoryProps> = ({ userId, className = '' }) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<FilterOptions>({
    activity_type: 'all',
    admin_only: false,
    date_range: '30d',
    search: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const activityTypes = [
    { value: 'all', label: 'All Activities' },
    { value: 'login', label: 'Login' },
    { value: 'logout', label: 'Logout' },
    { value: 'profile_update', label: 'Profile Update' },
    { value: 'credit_adjustment', label: 'Credit Adjustment' },
    { value: 'suspension', label: 'Suspension' },
    { value: 'unsuspension', label: 'Unsuspension' },
    { value: 'payment', label: 'Payment' },
    { value: 'subscription_change', label: 'Subscription Change' },
    { value: 'password_change', label: 'Password Change' },
    { value: 'email_change', label: 'Email Change' },
    { value: 'session_start', label: 'Session Start' },
    { value: 'session_end', label: 'Session End' },
    { value: 'admin_action', label: 'Admin Action' },
  ];

  const dateRanges = [
    { value: '1d', label: 'Last 24 hours' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: 'all', label: 'All time' },
  ];

  useEffect(() => {
    fetchHistory();
  }, [userId, currentPage, filters]);

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        activity_type: filters.activity_type,
        admin_only: filters.admin_only.toString(),
        date_range: filters.date_range,
        search: filters.search,
      });

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const endpoint = userId
        ? `${apiBaseUrl}/admin/users-enhanced/${userId}/history?${params}`
        : `${apiBaseUrl}/admin/user-history?${params}`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setHistory(result.data.history || []);
          setTotalPages(result.data.pagination?.total_pages || 1);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'login':
        return <CheckCircleIcon className='h-4 w-4 text-cli-green' />;
      case 'logout':
        return <CheckCircleIcon className='h-4 w-4 text-cli-amber' />;
      case 'profile_update':
        return <PencilIcon className='h-4 w-4 text-cli-cyan' />;
      case 'credit_adjustment':
        return <CreditCardIcon className='h-4 w-4 text-cli-amber' />;
      case 'suspension':
      case 'unsuspension':
        return <ExclamationTriangleIcon className='h-4 w-4 text-red-500' />;
      case 'payment':
        return <CreditCardIcon className='h-4 w-4 text-cli-green' />;
      case 'subscription_change':
        return <ShieldCheckIcon className='h-4 w-4 text-primary-500' />;
      case 'password_change':
      case 'email_change':
        return <ShieldCheckIcon className='h-4 w-4 text-cli-cyan' />;
      case 'session_start':
      case 'session_end':
        return <EyeIcon className='h-4 w-4 text-cli-light-gray' />;
      case 'admin_action':
        return <UserIcon className='h-4 w-4 text-primary-500' />;
      default:
        return <ClockIcon className='h-4 w-4 text-cli-light-gray' />;
    }
  };

  const getActivityBadge = (activityType: string) => {
    switch (activityType) {
      case 'login':
        return <CliBadge variant='success'>LOGIN</CliBadge>;
      case 'logout':
        return <CliBadge variant='warning'>LOGOUT</CliBadge>;
      case 'suspension':
        return <CliBadge variant='danger'>SUSPEND</CliBadge>;
      case 'unsuspension':
        return <CliBadge variant='success'>UNSUSPEND</CliBadge>;
      case 'credit_adjustment':
        return <CliBadge variant='info'>CREDITS</CliBadge>;
      case 'admin_action':
        return <CliBadge variant='primary'>ADMIN</CliBadge>;
      case 'payment':
        return <CliBadge variant='success'>PAYMENT</CliBadge>;
      default:
        return <CliBadge variant='secondary'>{activityType.toUpperCase()}</CliBadge>;
    }
  };

  const formatMetadata = (metadata: any) => {
    if (!metadata || Object.keys(metadata).length === 0) return null;

    return Object.entries(metadata).map(([key, value]) => (
      <div key={key} className='font-mono text-xs text-cli-green'>
        <span className='text-cli-light-gray'>{key}:</span> {JSON.stringify(value)}
      </div>
    ));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchHistory();
  };

  const resetFilters = () => {
    setFilters({
      activity_type: 'all',
      admin_only: false,
      date_range: '30d',
      search: '',
    });
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <CliCard className={className}>
        <div className='p-6'>
          <TypingText
            text='Loading user history...'
            className='mb-4 text-lg font-semibold text-primary-500'
          />
          <div className='animate-pulse space-y-4'>
            <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
            <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
            <div className='h-4 w-2/3 rounded bg-cli-gray'></div>
          </div>
        </div>
      </CliCard>
    );
  }

  return (
    <CliCard className={className}>
      <div className='p-6'>
        {/* Header */}
        <div className='mb-6 flex items-center justify-between'>
          <div className='flex items-center space-x-3'>
            <ClockIcon className='h-6 w-6 text-primary-500' />
            <TypingText
              text={userId ? 'User Activity History' : 'Global Activity History'}
              className='font-mono text-xl font-bold text-primary-500'
            />
          </div>
          <div className='flex space-x-2'>
            <CliButton
              variant='secondary'
              onClick={() => setShowFilters(!showFilters)}
              className='text-sm'
            >
              <FunnelIcon className='mr-1 h-4 w-4' />
              Filters
            </CliButton>
            <CliButton variant='primary' onClick={() => fetchHistory()} className='text-sm'>
              Refresh
            </CliButton>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className='mb-6 rounded border border-cli-gray bg-cli-darker p-4'>
            <div className='mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'>
              {/* Activity Type Filter */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  Activity Type
                </label>
                <select
                  value={filters.activity_type}
                  onChange={e => setFilters(prev => ({ ...prev, activity_type: e.target.value }))}
                  className='bg-cli-terminal w-full rounded border border-cli-gray px-3 py-2 font-mono text-sm text-cli-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                >
                  {activityTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  Date Range
                </label>
                <select
                  value={filters.date_range}
                  onChange={e => setFilters(prev => ({ ...prev, date_range: e.target.value }))}
                  className='bg-cli-terminal w-full rounded border border-cli-gray px-3 py-2 font-mono text-sm text-cli-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                >
                  {dateRanges.map(range => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Admin Only Filter */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  Show Only
                </label>
                <div className='mt-2 flex items-center space-x-4'>
                  <label className='flex items-center space-x-2'>
                    <input
                      type='checkbox'
                      checked={filters.admin_only}
                      onChange={e =>
                        setFilters(prev => ({ ...prev, admin_only: e.target.checked }))
                      }
                      className='bg-cli-terminal rounded border-cli-gray text-primary-500 focus:ring-primary-500'
                    />
                    <span className='font-mono text-sm text-cli-white'>Admin Actions</span>
                  </label>
                </div>
              </div>

              {/* Search */}
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>Search</label>
                <form onSubmit={handleSearch} className='flex space-x-2'>
                  <CliInput
                    type='text'
                    value={filters.search}
                    onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    placeholder='Search descriptions...'
                    className='flex-1'
                  />
                  <CliButton variant='secondary' type='submit' className='px-3'>
                    <MagnifyingGlassIcon className='h-4 w-4' />
                  </CliButton>
                </form>
              </div>
            </div>

            <div className='flex space-x-2'>
              <CliButton
                variant='primary'
                onClick={() => {
                  setCurrentPage(1);
                  fetchHistory();
                }}
              >
                Apply Filters
              </CliButton>
              <CliButton variant='secondary' onClick={resetFilters}>
                Reset
              </CliButton>
            </div>
          </div>
        )}

        {/* History Timeline */}
        <div className='space-y-4'>
          {history.length === 0 ? (
            <div className='py-12 text-center font-mono text-cli-light-gray'>
              <ClockIcon className='mx-auto mb-4 h-12 w-12 text-cli-gray' />
              <div className='text-lg'>No activity history found</div>
              <div className='mt-2 text-sm'>Try adjusting your filters or date range</div>
            </div>
          ) : (
            history.map((entry, index) => (
              <div key={entry.id} className='relative'>
                {/* Timeline line */}
                {index < history.length - 1 && (
                  <div className='absolute left-6 top-12 h-full w-px bg-cli-gray' />
                )}

                {/* History Entry */}
                <div className='flex items-start space-x-4 rounded border border-cli-gray p-4 transition-all hover:border-primary-500/50'>
                  {/* Icon */}
                  <div className='bg-cli-terminal flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 border-cli-gray'>
                    {getActivityIcon(entry.activity_type)}
                  </div>

                  {/* Content */}
                  <div className='min-w-0 flex-1'>
                    <div className='mb-2 flex items-start justify-between'>
                      <div className='flex items-center space-x-3'>
                        {getActivityBadge(entry.activity_type)}
                        <div className='font-mono text-sm font-semibold text-cli-white'>
                          {entry.description}
                        </div>
                      </div>
                      <div className='ml-4 whitespace-nowrap font-mono text-xs text-cli-light-gray'>
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </div>

                    {/* User info (for global history) */}
                    {!userId && (
                      <div className='mb-2 flex items-center space-x-2'>
                        <UserIcon className='h-3 w-3 text-cli-cyan' />
                        <span className='font-mono text-xs text-cli-cyan'>
                          {entry.user_name || entry.user_email} ({entry.user_id.slice(0, 8)}...)
                        </span>
                      </div>
                    )}

                    {/* Admin info */}
                    {entry.admin_name && (
                      <div className='mb-2 flex items-center space-x-2'>
                        <ShieldCheckIcon className='h-3 w-3 text-primary-500' />
                        <span className='font-mono text-xs text-primary-500'>
                          Admin: {entry.admin_name}
                        </span>
                      </div>
                    )}

                    {/* Details */}
                    {entry.details && (
                      <div className='mb-2 font-mono text-xs text-cli-light-gray'>
                        {entry.details}
                      </div>
                    )}

                    {/* Technical details */}
                    <div className='flex flex-wrap gap-4 font-mono text-xs text-cli-light-gray'>
                      {entry.ip_address && <span>IP: {entry.ip_address}</span>}
                      {entry.user_agent && <span>UA: {entry.user_agent.slice(0, 50)}...</span>}
                    </div>

                    {/* Metadata */}
                    {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                      <div className='bg-cli-terminal mt-2 rounded border border-cli-gray p-2'>
                        <div className='mb-1 font-mono text-xs text-cli-light-gray'>Metadata:</div>
                        {formatMetadata(entry.metadata)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className='mt-6 flex items-center justify-between border-t border-cli-gray pt-4'>
            <div className='font-mono text-sm text-cli-light-gray'>
              Page {currentPage} of {totalPages}
            </div>
            <div className='flex space-x-2'>
              <CliButton
                variant='secondary'
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </CliButton>
              <CliButton
                variant='secondary'
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </CliButton>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className='mt-4 font-mono text-xs text-cli-green'>
          $ echo "History loaded: {history.length} entries" &gt;&gt; admin.log
        </div>
      </div>
    </CliCard>
  );
};

export default UserHistory;
