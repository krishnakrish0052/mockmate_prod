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
  XMarkIcon,
  UserIcon,
  CreditCardIcon,
  DocumentIcon,
  ClockIcon,
  CurrencyDollarIcon,
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

interface UserDetailsProps {
  userId: string;
  onClose: () => void;
  onUserUpdate?: (user: any) => void;
}

interface UserDetail {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  credits: number;
  is_active: boolean;
  is_suspended: boolean;
  subscription_type: string;
  subscription_status: string;
  registration_date: string;
  last_active: string;
  total_sessions: number;
  total_payments: number;
  total_revenue: number;
  desktop_connected: boolean;
  resume_uploaded: boolean;
  profile_completed: number;
  admin_notes?: string;
  suspension_reason?: string;
  created_at: string;
  updated_at: string;
}

interface UserHistory {
  id: string;
  activity_type: string;
  description: string;
  metadata: any;
  created_at: string;
  admin_id?: string;
  admin_name?: string;
}

const UserDetails: React.FC<UserDetailsProps> = ({ userId, onClose, onUserUpdate }) => {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [history, setHistory] = useState<UserHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [editingNotes, setEditingNotes] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchUserDetails();
      fetchUserHistory();
    }
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      const response = await fetch(`/api/admin/users-enhanced/${userId}/profile`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setUser(result.data.user);
          setAdminNotes(result.data.user.admin_notes || '');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserHistory = async () => {
    try {
      const response = await fetch(`/api/admin/users-enhanced/${userId}/history`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setHistory(result.data.history || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user history:', error);
    }
  };

  const saveAdminNotes = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users-enhanced/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          admin_notes: adminNotes,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setUser(prev => (prev ? { ...prev, admin_notes: adminNotes } : null));
          setEditingNotes(false);
          if (onUserUpdate && user) {
            onUserUpdate({ ...user, admin_notes: adminNotes });
          }
        }
      }
    } catch (error) {
      console.error('Failed to save admin notes:', error);
    } finally {
      setSaving(false);
    }
  };

  const adjustCredits = async () => {
    const newCredits = prompt('Enter new credit amount:', user?.credits.toString());
    if (newCredits && !isNaN(parseInt(newCredits))) {
      try {
        const response = await fetch(`/api/admin/users-enhanced/${userId}/credits/adjust`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            credits: parseInt(newCredits),
            admin_notes: `Credits adjusted from ${user?.credits} to ${newCredits} by admin on ${new Date().toISOString()}`,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            await fetchUserDetails();
            await fetchUserHistory();
            if (onUserUpdate) {
              onUserUpdate(result.data.user);
            }
          }
        }
      } catch (error) {
        console.error('Failed to adjust credits:', error);
      }
    }
  };

  const toggleSuspension = async () => {
    if (!user) return;

    const action = user.is_suspended ? 'unsuspend' : 'suspend';
    const reason = action === 'suspend' ? prompt('Enter suspension reason:') : null;

    if (action === 'suspend' && !reason) return;

    try {
      const endpoint = `/api/admin/users-enhanced/${userId}/${action}`;
      const body =
        action === 'suspend'
          ? { reason, admin_notes: `User ${action}ed by admin on ${new Date().toISOString()}` }
          : {};

      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchUserDetails();
          await fetchUserHistory();
          if (onUserUpdate) {
            onUserUpdate(result.data.user);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
    }
  };

  const getStatusBadge = (user: UserDetail) => {
    if (user.is_suspended) return <CliBadge variant='danger'>SUSPENDED</CliBadge>;
    if (user.is_active) return <CliBadge variant='success'>ACTIVE</CliBadge>;
    return <CliBadge variant='warning'>INACTIVE</CliBadge>;
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'credit_adjustment':
        return <CreditCardIcon className='h-4 w-4 text-cli-amber' />;
      case 'suspension':
      case 'unsuspension':
        return <ExclamationTriangleIcon className='h-4 w-4 text-red-500' />;
      case 'login':
        return <CheckCircleIcon className='h-4 w-4 text-cli-green' />;
      case 'profile_update':
        return <PencilIcon className='h-4 w-4 text-cli-cyan' />;
      default:
        return <ClockIcon className='h-4 w-4 text-cli-light-gray' />;
    }
  };

  if (loading) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
        <div className='max-h-[90vh] w-full max-w-6xl overflow-auto'>
          <TerminalWindow title='admin@mockmate:~$ ./user-details --loading'>
            <div className='p-6'>
              <TypingText
                text='Loading user details...'
                className='mb-4 text-xl font-semibold text-primary-500'
              />
              <div className='animate-pulse space-y-4'>
                <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
                <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
        <div className='w-full max-w-2xl'>
          <TerminalWindow title='admin@mockmate:~$ ./user-details --error'>
            <div className='p-6'>
              <TypingText
                text='User Not Found'
                className='mb-4 text-xl font-semibold text-red-500'
              />
              <div className='font-mono text-sm text-cli-light-gray'>
                User with ID {userId} could not be loaded.
              </div>
              <CliButton variant='primary' onClick={onClose} className='mt-4'>
                Close
              </CliButton>
            </div>
          </TerminalWindow>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'details', label: 'User Details', icon: UserIcon },
    { id: 'history', label: 'Activity History', icon: ClockIcon },
    { id: 'payments', label: 'Payment History', icon: CurrencyDollarIcon },
  ];

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
      <div className='max-h-[90vh] w-full max-w-6xl overflow-auto'>
        <TerminalWindow title={`admin@mockmate:~$ ./user-details --id=${userId}`}>
          <div className='p-6'>
            {/* Header */}
            <div className='mb-6 flex items-center justify-between'>
              <div className='flex items-center space-x-4'>
                <div className='bg-cli-terminal flex h-12 w-12 items-center justify-center rounded-full'>
                  <UserIcon className='h-6 w-6 text-primary-500' />
                </div>
                <div>
                  <TypingText
                    text={user.name || `${user.first_name} ${user.last_name}`.trim()}
                    className='font-mono text-xl font-bold text-primary-500'
                  />
                  <div className='font-mono text-sm text-cli-light-gray'>
                    {user.email} • ID: {user.id.slice(0, 8)}...
                  </div>
                </div>
              </div>
              <div className='flex items-center space-x-4'>
                {getStatusBadge(user)}
                <CliButton variant='secondary' onClick={onClose}>
                  <XMarkIcon className='h-4 w-4' />
                </CliButton>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className='mb-6 flex space-x-2 border-b border-cli-gray'>
              {tabs.map(tab => {
                const IconComponent = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 border-b-2 px-4 py-2 font-mono text-sm transition-all ${
                      activeTab === tab.id
                        ? 'border-primary-500 text-primary-500'
                        : 'border-transparent text-cli-light-gray hover:text-cli-white'
                    }`}
                  >
                    <IconComponent className='h-4 w-4' />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className='space-y-6'>
              {activeTab === 'details' && (
                <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
                  {/* Basic Information */}
                  <CliCard>
                    <div className='p-4'>
                      <h3 className='mb-4 font-mono font-bold text-primary-500'>
                        Basic Information
                      </h3>
                      <div className='space-y-3 font-mono text-sm'>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Name:</span>
                          <span className='text-cli-white'>
                            {user.name || `${user.first_name} ${user.last_name}`.trim()}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Email:</span>
                          <span className='text-cli-white'>{user.email}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Status:</span>
                          <span>{getStatusBadge(user)}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Credits:</span>
                          <span className='text-cli-green'>{user.credits}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Profile Complete:</span>
                          <span className='text-cli-cyan'>{user.profile_completed}%</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Registered:</span>
                          <span className='text-cli-white'>
                            {new Date(user.registration_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Last Active:</span>
                          <span className='text-cli-white'>
                            {new Date(user.last_active).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CliCard>

                  {/* Subscription & Activity */}
                  <CliCard>
                    <div className='p-4'>
                      <h3 className='mb-4 font-mono font-bold text-primary-500'>
                        Subscription & Activity
                      </h3>
                      <div className='space-y-3 font-mono text-sm'>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Plan:</span>
                          <span className='text-cli-green'>
                            {user.subscription_type.toUpperCase()}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Status:</span>
                          <span className='text-cli-cyan'>
                            {user.subscription_status.toUpperCase()}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Total Sessions:</span>
                          <span className='text-cli-white'>{user.total_sessions}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Total Payments:</span>
                          <span className='text-cli-white'>{user.total_payments}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Total Revenue:</span>
                          <span className='text-cli-green'>${user.total_revenue}</span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Desktop App:</span>
                          <span
                            className={user.desktop_connected ? 'text-cli-green' : 'text-cli-amber'}
                          >
                            {user.desktop_connected ? 'Connected' : 'Not Connected'}
                          </span>
                        </div>
                        <div className='flex justify-between'>
                          <span className='text-cli-light-gray'>Resume:</span>
                          <span
                            className={user.resume_uploaded ? 'text-cli-green' : 'text-cli-amber'}
                          >
                            {user.resume_uploaded ? 'Uploaded' : 'Not Uploaded'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CliCard>

                  {/* Admin Notes */}
                  <CliCard className='lg:col-span-2'>
                    <div className='p-4'>
                      <div className='mb-4 flex items-center justify-between'>
                        <h3 className='font-mono font-bold text-primary-500'>Admin Notes</h3>
                        <CliButton
                          variant='secondary'
                          onClick={() => setEditingNotes(!editingNotes)}
                          className='text-xs'
                        >
                          <PencilIcon className='h-3 w-3' />
                        </CliButton>
                      </div>
                      {editingNotes ? (
                        <div className='space-y-3'>
                          <textarea
                            value={adminNotes}
                            onChange={e => setAdminNotes(e.target.value)}
                            className='h-24 w-full resize-none rounded border border-cli-gray bg-cli-darker px-3 py-2 font-mono text-sm text-cli-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                            placeholder='Enter admin notes...'
                          />
                          <div className='flex space-x-2'>
                            <CliButton variant='primary' onClick={saveAdminNotes} disabled={saving}>
                              {saving ? 'Saving...' : 'Save Notes'}
                            </CliButton>
                            <CliButton
                              variant='secondary'
                              onClick={() => {
                                setEditingNotes(false);
                                setAdminNotes(user.admin_notes || '');
                              }}
                            >
                              Cancel
                            </CliButton>
                          </div>
                        </div>
                      ) : (
                        <div className='font-mono text-sm text-cli-light-gray'>
                          {user.admin_notes || 'No admin notes available.'}
                        </div>
                      )}
                    </div>
                  </CliCard>

                  {/* Quick Actions */}
                  <CliCard className='lg:col-span-2'>
                    <div className='p-4'>
                      <h3 className='mb-4 font-mono font-bold text-primary-500'>Quick Actions</h3>
                      <div className='flex flex-wrap gap-3'>
                        <CliButton variant='primary' onClick={adjustCredits}>
                          <CreditCardIcon className='mr-2 h-4 w-4' />
                          Adjust Credits
                        </CliButton>
                        <CliButton
                          variant={user.is_suspended ? 'success' : 'danger'}
                          onClick={toggleSuspension}
                        >
                          <ExclamationTriangleIcon className='mr-2 h-4 w-4' />
                          {user.is_suspended ? 'Unsuspend User' : 'Suspend User'}
                        </CliButton>
                        <CliButton variant='secondary'>
                          <BellIcon className='mr-2 h-4 w-4' />
                          Send Notification
                        </CliButton>
                        <CliButton variant='secondary'>
                          <DocumentIcon className='mr-2 h-4 w-4' />
                          View Sessions
                        </CliButton>
                      </div>
                    </div>
                  </CliCard>
                </div>
              )}

              {activeTab === 'history' && (
                <CliCard>
                  <div className='p-4'>
                    <h3 className='mb-4 font-mono font-bold text-primary-500'>Activity History</h3>
                    <div className='space-y-3'>
                      {history.length === 0 ? (
                        <div className='py-8 text-center font-mono text-cli-light-gray'>
                          No activity history found
                        </div>
                      ) : (
                        history.map(activity => (
                          <div key={activity.id} className='border-l-2 border-cli-gray pb-3 pl-4'>
                            <div className='flex items-start space-x-3'>
                              {getActivityIcon(activity.activity_type)}
                              <div className='flex-1'>
                                <div className='font-mono text-sm font-semibold text-cli-white'>
                                  {activity.description}
                                </div>
                                <div className='mt-1 font-mono text-xs text-cli-light-gray'>
                                  {new Date(activity.created_at).toLocaleString()}
                                  {activity.admin_name && (
                                    <span className='ml-2 text-cli-cyan'>
                                      by {activity.admin_name}
                                    </span>
                                  )}
                                </div>
                                {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                  <div className='mt-2 font-mono text-xs text-cli-green'>
                                    {JSON.stringify(activity.metadata, null, 2)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </CliCard>
              )}

              {activeTab === 'payments' && (
                <CliCard>
                  <div className='p-4'>
                    <h3 className='mb-4 font-mono font-bold text-primary-500'>Payment History</h3>
                    <div className='py-8 text-center font-mono text-cli-light-gray'>
                      Payment history will be implemented when payment data is available
                    </div>
                  </div>
                </CliCard>
              )}
            </div>

            <div className='mt-6 font-mono text-xs text-cli-green'>
              $ echo "User details loaded for {user.id}" &gt;&gt; admin.log
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};

export default UserDetails;
