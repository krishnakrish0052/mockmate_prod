import React, { useState, useEffect, useMemo } from 'react';
import AlertNotification, { Alert } from './AlertNotification';

interface AlertListProps {
  alerts: Alert[];
  loading?: boolean;
  onMarkAsRead?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  onAction?: (alertId: string, actionUrl: string) => void;
  onMarkAllAsRead?: () => void;
  onDismissAll?: () => void;
  showFilters?: boolean;
  compact?: boolean;
  maxHeight?: string;
  emptyMessage?: string;
}

type FilterType = 'all' | 'unread' | 'info' | 'warning' | 'error' | 'success' | 'announcement';
type SortType = 'newest' | 'oldest' | 'priority' | 'type';

export const AlertList: React.FC<AlertListProps> = ({
  alerts,
  loading = false,
  onMarkAsRead,
  onDismiss,
  onAction,
  onMarkAllAsRead,
  onDismissAll,
  showFilters = true,
  compact = false,
  maxHeight = '400px',
  emptyMessage = 'No alerts to display',
}) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter and sort alerts based on current settings
  const filteredAndSortedAlerts = useMemo(() => {
    let filtered = alerts;

    // Apply filter
    switch (filter) {
      case 'unread':
        filtered = alerts.filter(alert => !alert.isRead);
        break;
      case 'info':
      case 'warning':
      case 'error':
      case 'success':
      case 'announcement':
        filtered = alerts.filter(alert => alert.alertType === filter);
        break;
      case 'all':
      default:
        filtered = alerts;
        break;
    }

    // Apply search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        alert =>
          alert.title.toLowerCase().includes(term) || alert.message.toLowerCase().includes(term)
      );
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
          const diff = priorityOrder[b.priority] - priorityOrder[a.priority];
          if (diff === 0) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return diff;
        case 'type':
          const typeOrder = { error: 5, warning: 4, info: 3, success: 2, announcement: 1 };
          const typeDiff = typeOrder[b.alertType] - typeOrder[a.alertType];
          if (typeDiff === 0) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return typeDiff;
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return filtered;
  }, [alerts, filter, sortBy, searchTerm]);

  // Get counts for filter badges
  const getCounts = () => {
    return {
      total: alerts.length,
      unread: alerts.filter(alert => !alert.isRead).length,
      info: alerts.filter(alert => alert.alertType === 'info').length,
      warning: alerts.filter(alert => alert.alertType === 'warning').length,
      error: alerts.filter(alert => alert.alertType === 'error').length,
      success: alerts.filter(alert => alert.alertType === 'success').length,
      announcement: alerts.filter(alert => alert.alertType === 'announcement').length,
    };
  };

  const counts = getCounts();

  const handleMarkAllAsRead = () => {
    if (onMarkAllAsRead) {
      onMarkAllAsRead();
    }
  };

  const handleDismissAll = () => {
    if (onDismissAll && window.confirm('Are you sure you want to dismiss all alerts?')) {
      onDismissAll();
    }
  };

  const FilterButton: React.FC<{
    filterType: FilterType;
    label: string;
    count?: number;
    icon?: string;
  }> = ({ filterType, label, count, icon }) => (
    <button
      onClick={() => setFilter(filterType)}
      className={`flex items-center space-x-1 rounded-full px-3 py-1.5 text-sm transition-colors ${
        filter === filterType
          ? 'border border-blue-200 bg-blue-100 text-blue-800'
          : 'border border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-xs ${
            filter === filterType ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-600'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );

  if (loading) {
    return (
      <div className='flex items-center justify-center p-8'>
        <div className='h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600'></div>
        <span className='ml-2 text-gray-600'>Loading alerts...</span>
      </div>
    );
  }

  return (
    <div className='rounded-lg bg-white shadow'>
      {/* Header with filters and actions */}
      {showFilters && (
        <div className='border-b border-gray-200 p-4'>
          {/* Search and actions bar */}
          <div className='mb-4 flex items-center justify-between'>
            <div className='max-w-md flex-1'>
              <input
                type='text'
                placeholder='Search alerts...'
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className='w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
              />
            </div>

            <div className='flex items-center space-x-2'>
              {counts.unread > 0 && onMarkAllAsRead && (
                <button
                  onClick={handleMarkAllAsRead}
                  className='rounded px-3 py-1.5 text-sm text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800'
                >
                  Mark all read
                </button>
              )}

              {onDismissAll && alerts.some(alert => alert.isDismissible) && (
                <button
                  onClick={handleDismissAll}
                  className='rounded px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 hover:text-red-800'
                >
                  Dismiss all
                </button>
              )}

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortType)}
                className='rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
              >
                <option value='newest'>Newest first</option>
                <option value='oldest'>Oldest first</option>
                <option value='priority'>By priority</option>
                <option value='type'>By type</option>
              </select>
            </div>
          </div>

          {/* Filter buttons */}
          <div className='flex flex-wrap gap-2'>
            <FilterButton filterType='all' label='All' count={counts.total} />
            <FilterButton filterType='unread' label='Unread' count={counts.unread} />
            <FilterButton filterType='error' label='Errors' count={counts.error} />
            <FilterButton filterType='warning' label='Warnings' count={counts.warning} />
            <FilterButton filterType='info' label='Info' count={counts.info} />
            <FilterButton filterType='success' label='Success' count={counts.success} />
            <FilterButton
              filterType='announcement'
              label='Announcements'
              count={counts.announcement}
            />
          </div>
        </div>
      )}

      {/* Alert list */}
      <div className='overflow-auto' style={{ maxHeight }}>
        {filteredAndSortedAlerts.length === 0 ? (
          <div className='py-8 text-center text-gray-500'>
            <div className='mb-2 text-4xl'>📭</div>
            <p>{searchTerm ? `No alerts match "${searchTerm}"` : emptyMessage}</p>
            {filter !== 'all' && (
              <button
                onClick={() => {
                  setFilter('all');
                  setSearchTerm('');
                }}
                className='mt-2 text-sm text-blue-600 hover:text-blue-800'
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className='divide-y divide-gray-100'>
            {filteredAndSortedAlerts.map(alert => (
              <div key={alert.id} className='p-4'>
                <AlertNotification
                  alert={alert}
                  onMarkAsRead={onMarkAsRead}
                  onDismiss={onDismiss}
                  onAction={onAction}
                  compact={compact}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with summary */}
      {filteredAndSortedAlerts.length > 0 && (
        <div className='border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-600'>
          Showing {filteredAndSortedAlerts.length} of {alerts.length} alerts
          {counts.unread > 0 && ` • ${counts.unread} unread`}
        </div>
      )}
    </div>
  );
};

export default AlertList;
