import React, { useState, useEffect } from 'react';
import { Alert } from '../../components/alerts/AlertNotification';
import AlertList from '../../components/alerts/AlertList';
import AlertForm from './AlertForm';
import alertService, { AlertFilters, AlertAnalytics } from '../../services/alertService';

interface AlertDashboardProps {
  className?: string;
}

type ViewMode = 'dashboard' | 'create' | 'edit' | 'analytics';

export const AlertDashboard: React.FC<AlertDashboardProps> = ({ className = '' }) => {
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AlertAnalytics | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [filters, setFilters] = useState<AlertFilters>({ limit: 50 });
  const [total, setTotal] = useState(0);

  // Load alerts
  const loadAlerts = async (newFilters?: AlertFilters) => {
    setLoading(true);
    setError(null);

    try {
      const filtersToUse = newFilters || filters;
      const response = await alertService.getAdminAlerts(filtersToUse);
      setAlerts(response?.alerts || []);
      setTotal(response?.total || 0);
    } catch (error) {
      console.error('Error loading alerts:', error);
      setAlerts([]);
      setTotal(0);
      setError(error instanceof Error ? error.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  // Load analytics
  const loadAnalytics = async () => {
    try {
      const response = await alertService.getAlertAnalytics();
      // Handle the response format from backend (wrapped in success/data structure)
      setAnalytics(response.data || response);
    } catch (error) {
      console.error('Failed to load analytics:', error);
      setError(error instanceof Error ? error.message : 'Failed to load analytics');
    }
  };

  // Initial load
  useEffect(() => {
    if (currentView === 'dashboard' || currentView === 'analytics') {
      loadAlerts();
    }
    if (currentView === 'analytics') {
      loadAnalytics();
    }
  }, [currentView]);

  const handleCreateAlert = (alert: Alert) => {
    setAlerts(prev => [alert, ...prev]);
    setCurrentView('dashboard');
    // Show success message
    alert && console.log('Alert created successfully');
  };

  const handleEditAlert = (alert: Alert) => {
    setAlerts(prev => prev.map(a => (a.id === alert.id ? alert : a)));
    setSelectedAlert(null);
    setCurrentView('dashboard');
    // Show success message
    alert && console.log('Alert updated successfully');
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!window.confirm('Are you sure you want to delete this alert?')) {
      return;
    }

    try {
      await alertService.deleteAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      // Show success message
      console.log('Alert deleted successfully');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete alert');
    }
  };

  const handleBroadcastAlert = async (alertData: any) => {
    try {
      const response = await alertService.broadcastAlert(alertData);
      setAlerts(prev => [response.alert, ...prev]);
      setCurrentView('dashboard');
      // Show success message with recipient count
      console.log(`Alert broadcasted to ${response.recipientCount} users`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to broadcast alert');
    }
  };

  const renderDashboard = () => (
    <div className='space-y-6'>
      {/* Header with actions */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-cli-golden'>Alert Management</h1>
          <p className='text-cli-light-gray'>Create and manage system alerts for users</p>
        </div>

        <div className='flex space-x-3'>
          <button
            onClick={() => setCurrentView('analytics')}
            className='rounded-md border border-cli-gray bg-cli-dark px-4 py-2 text-cli-amber transition-colors hover:bg-cli-gray hover:text-cli-golden'
          >
            View Analytics
          </button>

          <button
            onClick={() => setCurrentView('create')}
            className='rounded-md bg-cli-golden px-4 py-2 text-cli-black font-medium transition-colors hover:bg-cli-amber'
          >
            Create Alert
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      {analytics && (
        <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
          <div className='rounded-lg border border-cli-gray bg-cli-darker p-4 shadow-cli-border'>
            <div className='text-2xl font-bold text-cli-cyan'>{analytics.totalAlerts}</div>
            <div className='text-sm text-cli-light-gray'>Total Alerts</div>
          </div>

          <div className='rounded-lg border border-cli-gray bg-cli-darker p-4 shadow-cli-border'>
            <div className='text-2xl font-bold text-cli-amber'>{analytics.unreadCount}</div>
            <div className='text-sm text-cli-light-gray'>Unread Alerts</div>
          </div>

          <div className='rounded-lg border border-cli-gray bg-cli-darker p-4 shadow-cli-border'>
            <div className='text-2xl font-bold text-cli-green'>
              {analytics.totalAlerts - analytics.unreadCount}
            </div>
            <div className='text-sm text-cli-light-gray'>Read Alerts</div>
          </div>

          <div className='rounded-lg border border-cli-gray bg-cli-darker p-4 shadow-cli-border'>
            <div className='text-2xl font-bold text-red-400'>
              {analytics?.typeBreakdown?.critical || 0}
            </div>
            <div className='text-sm text-cli-light-gray'>Critical Alerts</div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className='rounded-md border border-red-600 bg-cli-dark p-4 shadow-glow-golden'>
          <p className='text-sm text-red-400 cli-glow'>{error}</p>
          <button
            onClick={() => setError(null)}
            className='mt-2 text-xs text-red-300 underline hover:text-red-200 transition-colors'
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters and Search */}
      <div className='rounded-lg border border-cli-gray bg-cli-darker p-4 shadow-cli-border'>
        <h3 className='mb-4 text-lg font-semibold text-cli-golden'>Filter Alerts</h3>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5'>
          <div>
            <label className='mb-1 block text-sm text-cli-light-gray'>Type</label>
            <select
              value={filters.alertType?.[0] || ''}
              onChange={e => {
                const newFilters = { ...filters };
                if (e.target.value) {
                  newFilters.alertType = [e.target.value];
                } else {
                  delete newFilters.alertType;
                }
                setFilters(newFilters);
                loadAlerts(newFilters);
              }}
              className='w-full rounded border border-cli-gray bg-cli-dark px-3 py-2 text-sm text-cli-white focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            >
              <option value=''>All Types</option>
              <option value='info'>Info</option>
              <option value='warning'>Warning</option>
              <option value='error'>Error</option>
              <option value='success'>Success</option>
              <option value='announcement'>Announcement</option>
            </select>
          </div>

          <div>
            <label className='mb-1 block text-sm text-cli-light-gray'>Priority</label>
            <select
              value={filters.priority?.[0] || ''}
              onChange={e => {
                const newFilters = { ...filters };
                if (e.target.value) {
                  newFilters.priority = [e.target.value];
                } else {
                  delete newFilters.priority;
                }
                setFilters(newFilters);
                loadAlerts(newFilters);
              }}
              className='w-full rounded border border-cli-gray bg-cli-dark px-3 py-2 text-sm text-cli-white focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            >
              <option value=''>All Priorities</option>
              <option value='low'>Low</option>
              <option value='normal'>Normal</option>
              <option value='high'>High</option>
              <option value='critical'>Critical</option>
            </select>
          </div>

          <div>
            <label className='mb-1 block text-sm text-cli-light-gray'>Status</label>
            <select
              value={filters.isRead !== undefined ? filters.isRead.toString() : ''}
              onChange={e => {
                const newFilters = { ...filters };
                if (e.target.value === '') {
                  delete newFilters.isRead;
                } else {
                  newFilters.isRead = e.target.value === 'true';
                }
                setFilters(newFilters);
                loadAlerts(newFilters);
              }}
              className='w-full rounded border border-cli-gray bg-cli-dark px-3 py-2 text-sm text-cli-white focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            >
              <option value=''>All Status</option>
              <option value='false'>Unread</option>
              <option value='true'>Read</option>
            </select>
          </div>

          <div>
            <label className='mb-1 block text-sm text-cli-light-gray'>Start Date</label>
            <input
              type='date'
              value={filters.startDate || ''}
              onChange={e => {
                const newFilters = { ...filters };
                if (e.target.value) {
                  newFilters.startDate = e.target.value;
                } else {
                  delete newFilters.startDate;
                }
                setFilters(newFilters);
                loadAlerts(newFilters);
              }}
              className='w-full rounded border border-cli-gray bg-cli-dark px-3 py-2 text-sm text-cli-white focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            />
          </div>

          <div>
            <label className='mb-1 block text-sm text-cli-light-gray'>End Date</label>
            <input
              type='date'
              value={filters.endDate || ''}
              onChange={e => {
                const newFilters = { ...filters };
                if (e.target.value) {
                  newFilters.endDate = e.target.value;
                } else {
                  delete newFilters.endDate;
                }
                setFilters(newFilters);
                loadAlerts(newFilters);
              }}
              className='w-full rounded border border-cli-gray bg-cli-dark px-3 py-2 text-sm text-cli-white focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            />
          </div>
        </div>

        <div className='mt-4 flex items-center justify-between'>
          <button
            onClick={() => {
              setFilters({ limit: 50 });
              loadAlerts({ limit: 50 });
            }}
            className='text-sm text-cli-cyan hover:text-cli-golden transition-colors'
          >
            Clear Filters
          </button>

          <button
            onClick={() => loadAlerts()}
            className='rounded border border-cli-gray bg-cli-dark px-4 py-2 text-sm text-cli-amber transition-colors hover:bg-cli-gray hover:text-cli-golden'
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className='rounded-lg bg-cli-darker border border-cli-gray shadow-cli-border'>
        <div className='border-b border-cli-gray p-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-lg font-semibold text-cli-golden'>Recent Alerts ({total})</h3>

            <div className='flex space-x-2'>
              <button
                onClick={() => setCurrentView('create')}
                className='rounded bg-cli-green px-3 py-1 text-sm text-cli-black font-medium transition-colors hover:bg-cli-cyan'
              >
                Quick Create
              </button>
            </div>
          </div>
        </div>

        <div className='p-4'>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <div className='loading-spinner h-8 w-8'></div>
              <span className='ml-2 text-cli-light-gray'>Loading alerts...</span>
            </div>
          ) : alerts.length === 0 ? (
            <div className='py-8 text-center text-cli-light-gray'>
              <div className='mb-2 text-4xl'>📢</div>
              <p>No alerts found. Create your first alert to get started.</p>
              <button
                onClick={() => setCurrentView('create')}
                className='mt-4 rounded-md bg-cli-golden px-4 py-2 text-cli-black font-medium transition-colors hover:bg-cli-amber'
              >
                Create Alert
              </button>
            </div>
          ) : (
            <div className='space-y-4'>
              {alerts.map(alert => (
                <div key={alert.id} className='rounded-lg border border-cli-gray bg-cli-dark p-4 transition-colors hover:bg-cli-gray'>
                  <div className='flex items-start justify-between'>
                    <div className='flex-1'>
                      <div className='flex items-center space-x-3'>
                        <h4 className='font-semibold text-cli-white'>{alert.title}</h4>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            alert.alertType === 'info'
                              ? 'bg-blue-900 text-blue-300 border border-blue-600'
                              : alert.alertType === 'warning'
                                ? 'bg-yellow-900 text-yellow-300 border border-yellow-600'
                                : alert.alertType === 'error'
                                  ? 'bg-red-900 text-red-300 border border-red-600'
                                  : alert.alertType === 'success'
                                    ? 'bg-green-900 text-green-300 border border-green-600'
                                    : 'bg-purple-900 text-purple-300 border border-purple-600'
                          }`}
                        >
                          {alert.alertType}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            alert.priority === 'critical'
                              ? 'bg-red-900 text-red-300 border border-red-500 cli-glow'
                              : alert.priority === 'high'
                                ? 'bg-orange-900 text-orange-300 border border-orange-600'
                                : alert.priority === 'normal'
                                  ? 'bg-cli-gray text-cli-light-gray border border-cli-gray'
                                  : 'bg-cli-gray text-cli-light-gray border border-cli-gray'
                          }`}
                        >
                          {alert.priority}
                        </span>
                      </div>

                      <p className='mt-1 text-cli-light-gray'>{alert.message}</p>

                      <div className='mt-2 text-xs text-cli-light-gray opacity-70'>
                        Created: {new Date(alert.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className='ml-4 flex items-center space-x-2'>
                      <button
                        onClick={() => {
                          setSelectedAlert(alert);
                          setCurrentView('edit');
                        }}
                        className='rounded border border-cli-amber bg-cli-dark px-3 py-1 text-xs text-cli-amber transition-colors hover:bg-cli-amber hover:text-cli-black'
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDeleteAlert(alert.id)}
                        className='rounded border border-red-500 bg-cli-dark px-3 py-1 text-xs text-red-400 transition-colors hover:bg-red-500 hover:text-white'
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAnalytics = () => (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-gray-900'>Alert Analytics</h1>
          <p className='text-gray-600'>Monitor alert engagement and performance</p>
        </div>

        <button
          onClick={() => setCurrentView('dashboard')}
          className='rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-600 hover:bg-gray-50'
        >
          Back to Dashboard
        </button>
      </div>

      {analytics && (
        <>
          {/* Overview Stats */}
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4'>
            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='text-sm font-medium text-gray-500'>Total Alerts</h3>
              <p className='text-3xl font-bold text-blue-600'>{analytics.totalAlerts}</p>
            </div>

            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='text-sm font-medium text-gray-500'>Unread Alerts</h3>
              <p className='text-3xl font-bold text-yellow-600'>{analytics.unreadCount}</p>
            </div>

            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='text-sm font-medium text-gray-500'>Read Rate</h3>
              <p className='text-3xl font-bold text-green-600'>
                {analytics.totalAlerts > 0
                  ? Math.round(
                      ((analytics.totalAlerts - analytics.unreadCount) / analytics.totalAlerts) *
                        100
                    )
                  : 0}
                %
              </p>
            </div>

            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='text-sm font-medium text-gray-500'>Critical Alerts</h3>
              <p className='text-3xl font-bold text-red-600'>
                {analytics?.priorityBreakdown?.critical || 0}
              </p>
            </div>
          </div>

          {/* Breakdowns */}
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='mb-4 text-lg font-semibold text-gray-900'>Alert Types</h3>
              <div className='space-y-3'>
                {analytics?.typeBreakdown && Object.entries(analytics.typeBreakdown).map(([type, count]) => (
                  <div key={type} className='flex items-center justify-between'>
                    <span className='capitalize text-gray-700'>{type}</span>
                    <span className='font-medium text-gray-900'>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='mb-4 text-lg font-semibold text-gray-900'>Priority Levels</h3>
              <div className='space-y-3'>
                {analytics?.priorityBreakdown && Object.entries(analytics.priorityBreakdown).map(([priority, count]) => (
                  <div key={priority} className='flex items-center justify-between'>
                    <span className='capitalize text-gray-700'>{priority}</span>
                    <span className='font-medium text-gray-900'>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          {analytics.recentActivity && analytics.recentActivity.length > 0 && (
            <div className='rounded-lg border bg-white p-6 shadow'>
              <h3 className='mb-4 text-lg font-semibold text-gray-900'>Recent Activity</h3>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b border-gray-200'>
                      <th className='py-2 text-left'>Date</th>
                      <th className='py-2 text-left'>Created</th>
                      <th className='py-2 text-left'>Read</th>
                      <th className='py-2 text-left'>Dismissed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentActivity.map((activity, index) => (
                      <tr key={index} className='border-b border-gray-100'>
                        <td className='py-2'>{new Date(activity.date).toLocaleDateString()}</td>
                        <td className='py-2'>{activity.alertsCreated}</td>
                        <td className='py-2'>{activity.alertsRead}</td>
                        <td className='py-2'>{activity.alertsDismissed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className={`min-h-screen bg-cli-black py-6 ${className}`}>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        {currentView === 'dashboard' && renderDashboard()}

        {currentView === 'analytics' && renderAnalytics()}

        {currentView === 'create' && (
          <AlertForm
            onSubmit={handleCreateAlert}
            onCancel={() => setCurrentView('dashboard')}
            submitLabel='Create Alert'
          />
        )}

        {currentView === 'edit' && selectedAlert && (
          <AlertForm
            initialAlert={{
              title: selectedAlert.title,
              message: selectedAlert.message,
              alertType: selectedAlert.alertType,
              priority: selectedAlert.priority,
              actionUrl: selectedAlert.actionUrl,
              actionText: selectedAlert.actionText,
              icon: selectedAlert.icon,
              isDismissible: selectedAlert.isDismissible,
            }}
            alertId={selectedAlert.id}
            onSubmit={handleEditAlert}
            onCancel={() => {
              setSelectedAlert(null);
              setCurrentView('dashboard');
            }}
            submitLabel='Update Alert'
          />
        )}
      </div>
    </div>
  );
};

export default AlertDashboard;
