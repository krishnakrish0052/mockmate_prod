import React, { useState, useRef, useEffect } from 'react';
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid';
import AlertBadge from './AlertBadge';
import AlertList from './AlertList';
import { useAlerts } from '../../hooks/useAlerts';

interface AlertDropdownProps {
  className?: string;
  badgeClassName?: string;
  dropdownClassName?: string;
  maxHeight?: string;
}

export const AlertDropdown: React.FC<AlertDropdownProps> = ({
  className = '',
  badgeClassName = '',
  dropdownClassName = '',
  maxHeight = '400px',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    alerts,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    dismissAlert,
    dismissAllAlerts,
    handleAlertAction,
    clearError,
  } = useAlerts({
    enableRealTime: true,
    initialFilters: { limit: 20 },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      return () => {
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      // Keep dropdown open to show updated state
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleDismissAll = async () => {
    try {
      await dismissAllAlerts();
      // Keep dropdown open to show updated state
    } catch (error) {
      console.error('Failed to dismiss all:', error);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Alert Badge Button */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className={`hover:shadow-glow-info relative rounded-full p-2 transition-all duration-200 hover:bg-cli-gray focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-darker ${badgeClassName}`}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
      >
        {unreadCount > 0 ? (
          <BellIconSolid className='h-6 w-6 animate-pulse text-primary-500' />
        ) : (
          <BellIcon className='h-6 w-6 text-cli-light-gray transition-colors hover:text-primary-500' />
        )}

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span className='absolute -right-1 -top-1 flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white'>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Connection status indicator */}
        <div
          className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-cli-darker ${
            loading ? 'animate-pulse bg-yellow-500' : 'bg-green-500'
          }`}
        ></div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute right-0 z-50 mt-2 w-96 rounded-lg border border-cli-gray bg-cli-darker shadow-2xl ${dropdownClassName}`}
          style={{ maxHeight: '80vh', overflow: 'hidden' }}
        >
          {/* Header */}
          <div className='rounded-t-lg border-b border-cli-gray bg-cli-black px-4 py-3'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center space-x-2'>
                <BellIcon className='h-5 w-5 text-primary-500' />
                <h3 className='font-mono text-lg font-bold text-cli-white'>Notifications</h3>
                {unreadCount > 0 && (
                  <span className='rounded bg-primary-500 px-2 py-1 text-xs font-bold text-cli-black'>
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className='flex items-center space-x-2'>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className='font-mono text-xs text-primary-500 transition-colors hover:text-primary-400'
                    disabled={loading}
                  >
                    Mark all read
                  </button>
                )}

                <button
                  onClick={() => setIsOpen(false)}
                  className='p-1 text-cli-gray transition-colors hover:text-cli-light-gray'
                  aria-label='Close notifications'
                >
                  <XMarkIcon className='h-4 w-4' />
                </button>
              </div>
            </div>

            {/* Connection Status */}
            <div className='mt-2 flex items-center space-x-2 font-mono text-xs text-cli-light-gray'>
              <div
                className={`h-2 w-2 rounded-full ${
                  loading ? 'animate-pulse bg-yellow-500' : 'bg-green-500'
                }`}
              ></div>
              <span>{loading ? 'Syncing...' : 'Real-time connected'}</span>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className='border-b border-cli-gray bg-red-900 px-4 py-3'>
              <div className='flex items-start justify-between'>
                <div className='flex items-start space-x-2'>
                  <div className='mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-red-400'></div>
                  <p className='font-mono text-sm text-red-200'>{error}</p>
                </div>
                <button
                  onClick={clearError}
                  className='text-red-400 transition-colors hover:text-red-300'
                >
                  <XMarkIcon className='h-4 w-4' />
                </button>
              </div>
            </div>
          )}

          {/* Alert List */}
          <div style={{ maxHeight }} className='overflow-hidden'>
            <AlertList
              alerts={alerts}
              loading={loading}
              onMarkAsRead={markAsRead}
              onDismiss={dismissAlert}
              onAction={handleAlertAction}
              onMarkAllAsRead={handleMarkAllAsRead}
              onDismissAll={handleDismissAll}
              showFilters={false}
              compact={true}
              maxHeight={maxHeight}
              emptyMessage="No alerts yet. We'll notify you of important updates."
            />
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div className='rounded-b-lg border-t border-cli-gray bg-cli-black px-4 py-3'>
              <div className='flex items-center justify-between font-mono text-xs text-cli-light-gray'>
                <span>
                  {alerts.length} notification{alerts.length !== 1 ? 's' : ''} loaded
                </span>

                <div className='flex items-center space-x-2'>
                  <button
                    onClick={() => {
                      // TODO: Navigate to full alerts page
                      setIsOpen(false);
                    }}
                    className='text-primary-500 transition-colors hover:text-primary-400'
                  >
                    View all
                  </button>

                  {alerts.some(alert => alert.isDismissible) && (
                    <button
                      onClick={handleDismissAll}
                      className='text-red-400 transition-colors hover:text-red-300'
                      disabled={loading}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className='fixed inset-0 z-40 bg-black bg-opacity-50 sm:hidden'
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default AlertDropdown;
