import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
  CliSelect,
} from '../components/ui/CliComponents';
import {
  UsersIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  PencilIcon,
  NoSymbolIcon,
  CheckCircleIcon,
  CreditCardIcon,
  TrashIcon,
  DocumentIcon,
  ClockIcon,
  GlobeAltIcon,
  PhoneIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import UserDetails from '../components/users/UserDetails';

interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  country?: string;
  avatarUrl?: string;

  // Account status
  credits: number;
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  isActive: boolean;
  isVerified: boolean;
  isSuspended: boolean;
  suspensionReason?: string;
  suspendedAt?: string;
  suspendedByName?: string;

  // Registration info
  registrationSource?: string;
  registrationIp?: string;
  createdAt: string;
  lastActivity: string;
  emailVerifiedAt?: string;

  // Statistics
  totalSessions: number;
  sessionCount: number;
  completedSessions: number;
  recentSessions: number;
  avgSessionDuration: number;

  // Financial
  totalSpent: number;
  lifetimeValue: number;
  paymentCount: number;
  totalPayments: number;
  lastPaymentDate?: string;

  // Credits
  creditTransactionCount: number;
  totalCreditsUsed: number;

  // Admin
  adminNotes?: string;
  tags?: string[];
  marketingConsent?: boolean;
}

interface UserFilters {
  search: string;
  status: 'all' | 'active' | 'suspended' | 'inactive';
  subscription: 'all' | 'free' | 'premium' | 'enterprise';
  dateFrom: string;
  dateTo: string;
  sortBy: 'name' | 'email' | 'credits' | 'lastActive' | 'registrationDate';
  sortOrder: 'asc' | 'desc';
}

const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    status: 'all',
    subscription: 'all',
    dateFrom: '',
    dateTo: '',
    sortBy: 'registrationDate',
    sortOrder: 'desc',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    fetchUsers();
  }, [filters, pagination.page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        search: filters.search,
        status: filters.status,
        subscription_tier: filters.subscription,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
      });

      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      // Remove empty parameters
      for (const [key, value] of [...params.entries()]) {
        if (!value || value === 'all') {
          params.delete(key);
        }
      }

      const response = await fetch(`/api/admin/users-enhanced?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setUsers(result.data.users);
          setPagination(prev => ({
            ...prev,
            total: result.data.pagination.totalRecords,
            totalPages: result.data.pagination.totalPages,
          }));
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to fetch users:', errorResult.message);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (userId: string, action: 'suspend' | 'activate' | 'block') => {
    try {
      let endpoint: string;
      let method = 'PATCH';
      let body: any = {};

      switch (action) {
        case 'suspend':
          endpoint = `/api/admin/users-enhanced/${userId}/suspend`;
          body = {
            reason: 'Suspended by admin',
            admin_notes: `User suspended on ${new Date().toISOString()}`,
          };
          break;
        case 'activate':
          endpoint = `/api/admin/users-enhanced/${userId}/unsuspend`;
          break;
        case 'block':
          endpoint = `/api/admin/users-enhanced/${userId}/suspend`;
          body = {
            reason: 'Blocked by admin',
            admin_notes: `User blocked on ${new Date().toISOString()}`,
          };
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchUsers(); // Refresh the list
        } else {
          console.error(`Failed to ${action} user:`, result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error(`Failed to ${action} user:`, errorResult.message);
      }
    } catch (error) {
      console.error(`Failed to ${action} user:`, error);
    }
  };

  const updateUserCredits = async (userId: string, credits: number) => {
    try {
      const response = await fetch(`/api/admin/users-enhanced/${userId}/credits/adjust`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: credits,
          reason: `Credits adjusted to ${credits} by admin on ${new Date().toISOString()}`,
          type: 'adjustment',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchUsers(); // Refresh the list
        } else {
          console.error('Failed to update credits:', result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to update credits:', errorResult.message);
      }
    } catch (error) {
      console.error('Failed to update credits:', error);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleUpdateUser = async (updatedUser: Partial<User>) => {
    if (!editingUser) return;

    try {
      const response = await fetch(`/api/admin/users-enhanced/${editingUser.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          phone: updatedUser.phone,
          country: updatedUser.country,
          subscriptionTier: updatedUser.subscriptionTier,
          adminNotes: updatedUser.adminNotes,
          admin_notes: `User updated by admin on ${new Date().toISOString()}`,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchUsers(); // Refresh the list
          setShowEditModal(false);
          setEditingUser(null);
          alert('User updated successfully!');
        } else {
          console.error('Failed to update user:', result.message);
          alert(`Failed to update user: ${result.message}`);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to update user:', errorResult.message);
        alert(`Failed to update user: ${errorResult.message}`);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
      alert('Failed to update user. Please check the console for more details.');
    }
  };

  const handleDeleteUser = async (userId: string, userName: string, userEmail: string) => {
    // Show confirmation dialog
    const isConfirmed = window.confirm(
      `Are you sure you want to delete user "${userName}" (${userEmail})?

` +
        `This action will:
` +
        `• Permanently remove the user account
` +
        `• Delete all user sessions and data
` +
        `• Archive user information for audit purposes

` +
        `This action cannot be easily undone. Type "DELETE" to confirm.`
    );

    if (!isConfirmed) return;

    // Ask for additional confirmation with typing "DELETE"
    const confirmationText = window.prompt(
      `To confirm deletion of user "${userName}", please type "DELETE" (all caps):`
    );

    if (confirmationText !== 'DELETE') {
      alert('Deletion cancelled. You must type "DELETE" exactly to confirm.');
      return;
    }

    try {
      const response = await fetch(`/api/admin/users-enhanced/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(`User "${userName}" has been successfully deleted.`);
          fetchUsers(); // Refresh the list
        } else {
          alert(`Failed to delete user: ${result.message}`);
        }
      } else {
        const errorResult = await response.json();
        if (response.status === 409) {
          alert(`Cannot delete user: ${errorResult.message}`);
        } else {
          alert(`Failed to delete user: ${errorResult.message || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert('Failed to delete user. Please check the console for more details.');
    }
  };

  const getStatusColor = (user: User) => {
    if (user.isSuspended) return 'text-red-500';
    if (user.isActive) return 'text-cli-green';
    return 'text-cli-amber';
  };

  const getStatusBadge = (user: User) => {
    if (user.isSuspended) return <CliBadge variant='danger'>SUSPENDED</CliBadge>;
    if (user.isActive) return <CliBadge variant='success'>ACTIVE</CliBadge>;
    return <CliBadge variant='warning'>INACTIVE</CliBadge>;
  };

  const getSubscriptionBadge = (type: string, status: string) => {
    const variant = status === 'active' ? 'success' : status === 'expired' ? 'warning' : 'danger';
    return <CliBadge variant={variant}>{type.toUpperCase()}</CliBadge>;
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./users --manage --all'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <TypingText
              text='User Management System'
              className='font-mono text-xl font-bold text-primary-500'
            />
            <div className='flex items-center space-x-4'>
              <div className='font-mono text-sm text-cli-light-gray'>
                Total Users: <span className='text-primary-500'>{pagination.total}</span>
              </div>
              <CliButton variant='primary' onClick={() => (window.location.href = '/users/create')}>
                + Add User
              </CliButton>
            </div>
          </div>

          {/* Filters */}
          <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6'>
            <CliInput
              placeholder='Search users...'
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className='lg:col-span-2'
            />

            <CliSelect
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />

            <CliSelect
              value={filters.subscription}
              onChange={e => setFilters(prev => ({ ...prev, subscription: e.target.value as any }))}
              options={[
                { value: 'all', label: 'All Plans' },
                { value: 'free', label: 'Free' },
                { value: 'premium', label: 'Premium' },
                { value: 'enterprise', label: 'Enterprise' },
              ]}
            />

            <CliInput
              type='date'
              value={filters.dateFrom}
              onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
              placeholder='From Date'
            />

            <CliInput
              type='date'
              value={filters.dateTo}
              onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
              placeholder='To Date'
            />
          </div>

          <div className='font-mono text-xs text-cli-green'>
            $ grep -E "(active|suspended)" users.log | sort -k3 | head -{pagination.limit}
          </div>
        </div>
      </TerminalWindow>

      {/* Users Table */}
      <TerminalWindow title='admin@mockmate:~$ cat users.db | less'>
        <div className='p-6'>
          {loading ? (
            <div className='flex items-center justify-center py-12'>
              <TypingText text='Loading users...' className='text-cli-light-gray' />
            </div>
          ) : (
            <div className='space-y-4'>
              {users.map(user => (
                <CliCard
                  key={user.id}
                  className='hover:shadow-glow-info transition-all duration-300'
                >
                  <div className='p-4'>
                    <div className='grid grid-cols-1 items-center gap-4 lg:grid-cols-12'>
                      {/* User Info */}
                      <div className='lg:col-span-3'>
                        <div className='flex items-center space-x-3'>
                          <div className='bg-cli-terminal flex h-10 w-10 items-center justify-center rounded-full'>
                            <UsersIcon className='h-5 w-5 text-primary-500' />
                          </div>
                          <div>
                            <div className='font-mono font-semibold text-cli-white'>
                              {user.name || 'Unknown User'}
                              {user.country && (
                                <span className='ml-2 inline-flex items-center text-xs'>
                                  <GlobeAltIcon className='mr-1 h-3 w-3' />
                                  {user.country}
                                </span>
                              )}
                            </div>
                            <div className='font-mono text-sm text-cli-light-gray'>
                              {user.email}
                            </div>
                            {user.phone && (
                              <div className='flex items-center font-mono text-xs text-cli-light-gray'>
                                <PhoneIcon className='mr-1 h-3 w-3' />
                                {user.phone}
                              </div>
                            )}
                            <div className='flex items-center font-mono text-xs text-cli-light-gray'>
                              <CalendarIcon className='mr-1 h-3 w-3' />
                              Joined{' '}
                              {user.createdAt
                                ? new Date(user.createdAt).toLocaleDateString()
                                : 'Unknown'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Status & Subscription */}
                      <div className='lg:col-span-2'>
                        <div className='space-y-1'>
                          {getStatusBadge(user)}
                          <CliBadge
                            variant={
                              user.subscriptionTier === 'pro'
                                ? 'success'
                                : user.subscriptionTier === 'enterprise'
                                  ? 'info'
                                  : 'secondary'
                            }
                          >
                            {user.subscriptionTier?.toUpperCase() || 'FREE'}
                          </CliBadge>
                        </div>
                      </div>

                      {/* Credits & Revenue */}
                      <div className='lg:col-span-2'>
                        <div className='font-mono text-sm'>
                          <div className='text-cli-green'>Credits: {user.credits}</div>
                          <div className='text-cli-amber'>Spent: ${user.totalSpent || 0}</div>
                        </div>
                      </div>

                      {/* Activity */}
                      <div className='lg:col-span-2'>
                        <div className='space-y-1 font-mono text-sm'>
                          <div className='text-cli-cyan'>Sessions: {user.totalSessions || 0}</div>
                          <div className='text-cli-light-gray'>
                            Last:{' '}
                            {user.lastActivity
                              ? new Date(user.lastActivity).toLocaleDateString()
                              : 'Never'}
                          </div>
                        </div>
                      </div>

                      {/* Indicators */}
                      <div className='lg:col-span-1'>
                        <div className='flex space-x-2'>
                          {user.isVerified && (
                            <CheckCircleIcon className='h-4 w-4 text-cli-green' title='Verified' />
                          )}
                          {user.adminNotes && (
                            <DocumentIcon
                              className='h-4 w-4 text-cli-amber'
                              title='Has Admin Notes'
                            />
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className='lg:col-span-2'>
                        <div className='flex space-x-2'>
                          <button
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setShowUserDetails(true);
                            }}
                            className='p-1 text-cli-light-gray transition-colors hover:text-primary-500'
                            title='View Details'
                          >
                            <EyeIcon className='h-4 w-4' />
                          </button>

                          <button
                            onClick={() => handleEditUser(user)}
                            className='p-1 text-cli-light-gray transition-colors hover:text-cli-cyan'
                            title='Edit User'
                          >
                            <PencilIcon className='h-4 w-4' />
                          </button>

                          {user.isSuspended ? (
                            <button
                              onClick={() => handleUserAction(user.id, 'activate')}
                              className='p-1 text-cli-light-gray transition-colors hover:text-cli-green'
                              title='Activate User'
                            >
                              <CheckCircleIcon className='h-4 w-4' />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleUserAction(user.id, 'suspend')}
                                className='p-1 text-cli-light-gray transition-colors hover:text-cli-amber'
                                title='Suspend User'
                              >
                                <NoSymbolIcon className='h-4 w-4' />
                              </button>
                              <button
                                onClick={() => handleUserAction(user.id, 'block')}
                                className='p-1 text-cli-light-gray transition-colors hover:text-red-500'
                                title='Block User'
                              >
                                <NoSymbolIcon className='h-4 w-4 text-red-500' />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => {
                              const credits = prompt(
                                'Enter new credit amount:',
                                user.credits.toString()
                              );
                              if (credits && !isNaN(parseInt(credits))) {
                                updateUserCredits(user.id, parseInt(credits));
                              }
                            }}
                            className='p-1 text-cli-light-gray transition-colors hover:text-cli-amber'
                            title='Update Credits'
                          >
                            <CreditCardIcon className='h-4 w-4' />
                          </button>

                          <button
                            onClick={() =>
                              handleDeleteUser(
                                user.id,
                                user.name ||
                                  `${user.firstName} ${user.lastName}`.trim() ||
                                  'Unknown User',
                                user.email
                              )
                            }
                            className='p-1 text-cli-light-gray transition-colors hover:text-red-500'
                            title='Delete User'
                          >
                            <TrashIcon className='h-4 w-4' />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CliCard>
              ))}

              {/* Pagination */}
              <div className='mt-6 flex items-center justify-between'>
                <div className='font-mono text-sm text-cli-light-gray'>
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} users
                </div>
                <div className='flex space-x-2'>
                  <CliButton
                    variant='secondary'
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </CliButton>
                  <div className='flex items-center space-x-1'>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => setPagination(prev => ({ ...prev, page }))}
                          className={`rounded px-3 py-1 font-mono text-sm ${
                            page === pagination.page
                              ? 'bg-primary-500 text-black'
                              : 'text-cli-light-gray hover:text-primary-500'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <CliButton
                    variant='secondary'
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </CliButton>
                </div>
              </div>

              <div className='mt-4 font-mono text-xs text-cli-green'>
                $ tail -f users.log | grep -E "(login|logout|action)" --color=always
              </div>
            </div>
          )}
        </div>
      </TerminalWindow>

      {/* User Details Modal */}
      {showUserDetails && selectedUserId && (
        <UserDetails
          userId={selectedUserId}
          onClose={() => {
            setShowUserDetails(false);
            setSelectedUserId(null);
          }}
          onUserUpdate={updatedUser => {
            // Refresh the users list when a user is updated
            fetchUsers();
          }}
        />
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUser && (
        <TerminalWindow title={`admin@mockmate:~$ ./users --edit --id=${editingUser.id}`}>
          <div className='p-6'>
            <div className='mb-6 flex items-center justify-between'>
              <TypingText
                text={`Edit User: ${editingUser.name || editingUser.email}`}
                className='text-xl font-semibold text-primary-500'
              />
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUser(null);
                }}
                className='p-2 text-cli-light-gray transition-colors hover:text-red-500'
                title='Close'
              >
                ×
              </button>
            </div>

            <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2'>
              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  First Name
                </label>
                <CliInput
                  value={editingUser.firstName || ''}
                  onChange={e =>
                    setEditingUser(prev => (prev ? { ...prev, firstName: e.target.value } : null))
                  }
                  placeholder='Enter first name'
                />
              </div>

              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  Last Name
                </label>
                <CliInput
                  value={editingUser.lastName || ''}
                  onChange={e =>
                    setEditingUser(prev => (prev ? { ...prev, lastName: e.target.value } : null))
                  }
                  placeholder='Enter last name'
                />
              </div>

              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>Email</label>
                <CliInput
                  type='email'
                  value={editingUser.email || ''}
                  onChange={e =>
                    setEditingUser(prev => (prev ? { ...prev, email: e.target.value } : null))
                  }
                  placeholder='Enter email address'
                />
              </div>

              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>Phone</label>
                <CliInput
                  value={editingUser.phone || ''}
                  onChange={e =>
                    setEditingUser(prev => (prev ? { ...prev, phone: e.target.value } : null))
                  }
                  placeholder='Enter phone number'
                />
              </div>

              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>Country</label>
                <CliInput
                  value={editingUser.country || ''}
                  onChange={e =>
                    setEditingUser(prev => (prev ? { ...prev, country: e.target.value } : null))
                  }
                  placeholder='Enter country'
                />
              </div>

              <div>
                <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                  Subscription Tier
                </label>
                <CliSelect
                  value={editingUser.subscriptionTier || 'free'}
                  onChange={e =>
                    setEditingUser(prev =>
                      prev ? { ...prev, subscriptionTier: e.target.value as any } : null
                    )
                  }
                  options={[
                    { value: 'free', label: 'Free' },
                    { value: 'pro', label: 'Pro' },
                    { value: 'enterprise', label: 'Enterprise' },
                  ]}
                />
              </div>
            </div>

            <div className='mb-6'>
              <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                Admin Notes
              </label>
              <textarea
                value={editingUser.adminNotes || ''}
                onChange={e =>
                  setEditingUser(prev => (prev ? { ...prev, adminNotes: e.target.value } : null))
                }
                className='w-full resize-none rounded border border-cli-gray bg-cli-darker px-3 py-2 font-mono text-sm text-cli-white focus:outline-none focus:ring-2 focus:ring-primary-500'
                rows={3}
                placeholder='Enter admin notes...'
              />
            </div>

            <div className='flex items-center justify-between'>
              <div className='font-mono text-xs text-cli-green'>
                $ usermod -c "{editingUser.firstName} {editingUser.lastName}" {editingUser.email}
              </div>

              <div className='flex space-x-3'>
                <CliButton
                  variant='secondary'
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingUser(null);
                  }}
                >
                  Cancel
                </CliButton>
                <CliButton variant='primary' onClick={() => handleUpdateUser(editingUser)}>
                  Update User
                </CliButton>
              </div>
            </div>
          </div>
        </TerminalWindow>
      )}
    </div>
  );
};

export default Users;
