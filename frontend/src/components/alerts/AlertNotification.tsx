import React, { useState } from 'react';

export interface Alert {
  id: string;
  title: string;
  message: string;
  alertType: 'info' | 'warning' | 'error' | 'success' | 'announcement';
  priority: 'low' | 'normal' | 'high' | 'critical';
  actionUrl?: string;
  actionText?: string;
  icon?: string;
  isRead: boolean;
  isDismissible: boolean;
  createdAt: string;
}

interface AlertNotificationProps {
  alert: Alert;
  onMarkAsRead?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  onAction?: (alertId: string, actionUrl: string) => void;
  compact?: boolean;
}

export const AlertNotification: React.FC<AlertNotificationProps> = ({
  alert,
  onMarkAsRead,
  onDismiss,
  onAction,
  compact = false,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  // Get alert styling based on type and priority
  const getAlertStyles = () => {
    const baseStyles = 'relative p-4 rounded-lg border shadow-sm transition-all duration-200';
    const priorityStyles = {
      low: 'border-l-4',
      normal: 'border-l-4',
      high: 'border-l-4 shadow-md',
      critical: 'border-l-4 shadow-lg ring-2 ring-opacity-50',
    };

    const typeStyles = {
      info: 'bg-blue-50 border-blue-200 border-l-blue-500 text-blue-800',
      warning: 'bg-yellow-50 border-yellow-200 border-l-yellow-500 text-yellow-800',
      error: 'bg-red-50 border-red-200 border-l-red-500 text-red-800',
      success: 'bg-green-50 border-green-200 border-l-green-500 text-green-800',
      announcement: 'bg-purple-50 border-purple-200 border-l-purple-500 text-purple-800',
    };

    const criticalRingStyles = {
      info: 'ring-blue-300',
      warning: 'ring-yellow-300',
      error: 'ring-red-300',
      success: 'ring-green-300',
      announcement: 'ring-purple-300',
    };

    let styles = `${baseStyles} ${priorityStyles[alert.priority]} ${typeStyles[alert.alertType]}`;

    if (alert.priority === 'critical') {
      styles += ` ${criticalRingStyles[alert.alertType]}`;
    }

    if (!alert.isRead) {
      styles += ' font-medium';
    } else {
      styles += ' opacity-75';
    }

    if (compact) {
      styles = styles.replace('p-4', 'p-3').replace('rounded-lg', 'rounded');
    }

    return styles;
  };

  // Get icon for alert type
  const getIcon = () => {
    if (alert.icon) {
      // Custom icon mapping could be added here
      return alert.icon;
    }

    switch (alert.alertType) {
      case 'info':
        return 'information-circle';
      case 'warning':
        return 'exclamation-triangle';
      case 'error':
        return 'x-circle';
      case 'success':
        return 'check-circle';
      case 'announcement':
        return 'megaphone';
      default:
        return 'bell';
    }
  };

  const handleMarkAsRead = () => {
    if (!alert.isRead && onMarkAsRead) {
      onMarkAsRead(alert.id);
    }
  };

  const handleDismiss = () => {
    if (alert.isDismissible && onDismiss) {
      setIsVisible(false);
      setTimeout(() => onDismiss(alert.id), 200);
    }
  };

  const handleAction = () => {
    if (alert.actionUrl && onAction) {
      onAction(alert.id, alert.actionUrl);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={getAlertStyles()} onClick={handleMarkAsRead}>
      <div className='flex items-start space-x-3'>
        {/* Alert Icon */}
        <div className='flex-shrink-0'>
          <div
            className={`rounded-full p-1 ${alert.priority === 'critical' ? 'animate-pulse' : ''}`}
          >
            {/* Icon placeholder - you can replace with actual icon library */}
            <div className='h-5 w-5 rounded-full bg-current opacity-20'></div>
          </div>
        </div>

        {/* Alert Content */}
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between'>
            <div className='flex-1'>
              <h4 className={`text-sm font-medium ${compact ? 'text-xs' : ''}`}>
                {alert.title}
                {!alert.isRead && (
                  <span className='ml-2 inline-block h-2 w-2 rounded-full bg-current opacity-60'></span>
                )}
              </h4>
              {!compact && <p className='mt-1 text-sm opacity-90'>{alert.message}</p>}
              <p className='mt-1 text-xs opacity-60'>{formatTimeAgo(alert.createdAt)}</p>
            </div>

            {/* Action Buttons */}
            <div className='ml-4 flex items-center space-x-2'>
              {alert.actionUrl && alert.actionText && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleAction();
                  }}
                  className='rounded bg-current bg-opacity-10 px-2 py-1 text-xs transition-colors hover:bg-opacity-20'
                >
                  {alert.actionText}
                </button>
              )}

              {alert.isDismissible && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDismiss();
                  }}
                  className='rounded p-1 text-xs transition-colors hover:bg-current hover:bg-opacity-10'
                  aria-label='Dismiss notification'
                >
                  <svg className='h-4 w-4' fill='currentColor' viewBox='0 0 20 20'>
                    <path
                      fillRule='evenodd'
                      d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                      clipRule='evenodd'
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Priority indicator for critical alerts */}
      {alert.priority === 'critical' && (
        <div className='absolute right-0 top-0 -mr-1 -mt-1'>
          <div className='h-3 w-3 animate-ping rounded-full bg-red-500'></div>
          <div className='absolute right-0 top-0 h-3 w-3 rounded-full bg-red-500'></div>
        </div>
      )}
    </div>
  );
};

export default AlertNotification;
