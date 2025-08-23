import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Alert } from '../components/alerts/AlertNotification';
import alertService, { AlertFilters } from '../services/alertService';

interface UseAlertsOptions {
  enableRealTime?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  initialFilters?: AlertFilters;
}

interface AlertsState {
  alerts: Alert[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  total: number;
}

export function useAlerts(options: UseAlertsOptions = {}) {
  const {
    enableRealTime = true,
    autoRefresh = false,
    refreshInterval = 30000,
    initialFilters = {},
  } = options;

  const [state, setState] = useState<AlertsState>({
    alerts: [],
    unreadCount: 0,
    loading: false,
    error: null,
    total: 0,
  });

  const [filters, setFilters] = useState<AlertFilters>(initialFilters);
  const socketRef = useRef<Socket | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize socket connection
  useEffect(() => {
    if (!enableRealTime) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    const socket = io(process.env.REACT_APP_WS_URL || '', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to alerts WebSocket');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from alerts WebSocket');
    });

    socket.on('alert:new', (alert: Alert) => {
      setState(prev => ({
        ...prev,
        alerts: [alert, ...prev.alerts],
        unreadCount: prev.unreadCount + (alert.isRead ? 0 : 1),
        total: prev.total + 1,
      }));
    });

    socket.on('alert:updated', (updatedAlert: Alert) => {
      setState(prev => {
        const alertIndex = prev.alerts.findIndex(a => a.id === updatedAlert.id);
        if (alertIndex === -1) return prev;

        const oldAlert = prev.alerts[alertIndex];
        const newAlerts = [...prev.alerts];
        newAlerts[alertIndex] = updatedAlert;

        // Update unread count based on read status change
        let unreadCountChange = 0;
        if (oldAlert.isRead && !updatedAlert.isRead) {
          unreadCountChange = 1;
        } else if (!oldAlert.isRead && updatedAlert.isRead) {
          unreadCountChange = -1;
        }

        return {
          ...prev,
          alerts: newAlerts,
          unreadCount: prev.unreadCount + unreadCountChange,
        };
      });
    });

    socket.on('alert:deleted', (alertId: string) => {
      setState(prev => {
        const alert = prev.alerts.find(a => a.id === alertId);
        if (!alert) return prev;

        return {
          ...prev,
          alerts: prev.alerts.filter(a => a.id !== alertId),
          unreadCount: prev.unreadCount - (alert.isRead ? 0 : 1),
          total: prev.total - 1,
        };
      });
    });

    socket.on('alert:read', (alertId: string) => {
      setState(prev => {
        const alertIndex = prev.alerts.findIndex(a => a.id === alertId);
        if (alertIndex === -1) return prev;

        const alert = prev.alerts[alertIndex];
        if (alert.isRead) return prev;

        const newAlerts = [...prev.alerts];
        newAlerts[alertIndex] = { ...alert, isRead: true };

        return {
          ...prev,
          alerts: newAlerts,
          unreadCount: prev.unreadCount - 1,
        };
      });
    });

    socket.on('alert:dismissed', (alertId: string) => {
      setState(prev => {
        const alert = prev.alerts.find(a => a.id === alertId);
        if (!alert) return prev;

        return {
          ...prev,
          alerts: prev.alerts.filter(a => a.id !== alertId),
          unreadCount: prev.unreadCount - (alert.isRead ? 0 : 1),
          total: prev.total - 1,
        };
      });
    });

    socket.on('alert:unreadCount', (count: number) => {
      setState(prev => ({
        ...prev,
        unreadCount: count,
      }));
    });

    socket.on('error', (error: any) => {
      console.error('WebSocket error:', error);
      setState(prev => ({
        ...prev,
        error: error.message || 'WebSocket connection error',
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, [enableRealTime]);

  // Auto refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const scheduleRefresh = () => {
      refreshTimeoutRef.current = setTimeout(() => {
        refreshAlerts();
        scheduleRefresh();
      }, refreshInterval);
    };

    scheduleRefresh();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, filters]);

  // Load alerts
  const loadAlerts = useCallback(
    async (newFilters?: AlertFilters) => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const filtersToUse = newFilters || filters;
        const response = await alertService.getUserAlerts(filtersToUse);

        setState(prev => ({
          ...prev,
          alerts: response.alerts,
          total: response.total,
          loading: false,
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load alerts',
          loading: false,
        }));
      }
    },
    [filters]
  );

  // Load unread count
  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await alertService.getUnreadCount();
      setState(prev => ({ ...prev, unreadCount: response.count }));
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }, []);

  // Refresh alerts
  const refreshAlerts = useCallback(() => {
    return Promise.all([loadAlerts(), loadUnreadCount()]);
  }, [loadAlerts, loadUnreadCount]);

  // Initial load
  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  // Update filters
  const updateFilters = useCallback(
    (newFilters: AlertFilters) => {
      setFilters(newFilters);
      loadAlerts(newFilters);
    },
    [loadAlerts]
  );

  // Mark alert as read
  const markAsRead = useCallback(
    async (alertId: string) => {
      try {
        await alertService.markAsRead(alertId);

        // Update local state if not using real-time
        if (!enableRealTime) {
          setState(prev => {
            const alertIndex = prev.alerts.findIndex(a => a.id === alertId);
            if (alertIndex === -1 || prev.alerts[alertIndex].isRead) return prev;

            const newAlerts = [...prev.alerts];
            newAlerts[alertIndex] = { ...newAlerts[alertIndex], isRead: true };

            return {
              ...prev,
              alerts: newAlerts,
              unreadCount: prev.unreadCount - 1,
            };
          });
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to mark alert as read',
        }));
      }
    },
    [enableRealTime]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await alertService.markAllAsRead();

      if (!enableRealTime) {
        setState(prev => ({
          ...prev,
          alerts: prev.alerts.map(alert => ({ ...alert, isRead: true })),
          unreadCount: 0,
        }));
      }

      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to mark all alerts as read',
      }));
      throw error;
    }
  }, [enableRealTime]);

  // Dismiss alert
  const dismissAlert = useCallback(
    async (alertId: string) => {
      try {
        await alertService.dismissAlert(alertId);

        if (!enableRealTime) {
          setState(prev => {
            const alert = prev.alerts.find(a => a.id === alertId);
            if (!alert) return prev;

            return {
              ...prev,
              alerts: prev.alerts.filter(a => a.id !== alertId),
              unreadCount: prev.unreadCount - (alert.isRead ? 0 : 1),
              total: prev.total - 1,
            };
          });
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to dismiss alert',
        }));
      }
    },
    [enableRealTime]
  );

  // Dismiss all alerts
  const dismissAllAlerts = useCallback(async () => {
    try {
      const response = await alertService.dismissAllAlerts();

      if (!enableRealTime) {
        setState(prev => ({
          ...prev,
          alerts: [],
          unreadCount: 0,
          total: 0,
        }));
      }

      return response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to dismiss all alerts',
      }));
      throw error;
    }
  }, [enableRealTime]);

  // Handle alert action
  const handleAlertAction = useCallback(
    async (alertId: string, actionUrl: string) => {
      // Mark as read when action is taken
      await markAsRead(alertId);

      // Navigate to action URL
      if (actionUrl.startsWith('http') || actionUrl.startsWith('//')) {
        window.open(actionUrl, '_blank');
      } else {
        window.location.href = actionUrl;
      }
    },
    [markAsRead]
  );

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    alerts: state.alerts,
    unreadCount: state.unreadCount,
    loading: state.loading,
    error: state.error,
    total: state.total,
    filters,

    // Actions
    loadAlerts,
    refreshAlerts,
    updateFilters,
    markAsRead,
    markAllAsRead,
    dismissAlert,
    dismissAllAlerts,
    handleAlertAction,
    clearError,

    // Utilities
    isConnected: socketRef.current?.connected || false,
  };
}
