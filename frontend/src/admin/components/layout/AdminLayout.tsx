import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { CliBadge, TypingText, MatrixRain } from '../ui/CliComponents';
import '../../styles/terminal-overrides.css';
import {
  CommandLineIcon,
  HomeIcon,
  ChartBarIcon,
  UserGroupIcon,
  CogIcon,
  DocumentChartBarIcon,
  ShieldCheckIcon,
  ServerIcon,
  BellIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  ExclamationTriangleIcon,
  UserCircleIcon,
  CurrencyDollarIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  PhotoIcon,
  DevicePhoneMobileIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  command: string;
  permission?: string;
  badge?: string;
  children?: NavItem[];
}

const navigationItems: NavItem[] = [
  {
    path: '/admin',
    label: 'Dashboard',
    icon: HomeIcon,
    command: './dashboard --overview',
  },
  {
    path: '/admin/analytics',
    label: 'Analytics',
    icon: ChartBarIcon,
    command: './analytics --real-time',
    permission: 'analytics:read',
  },
  {
    path: '/admin/users',
    label: 'User Management',
    icon: UserGroupIcon,
    command: './users --manage --enhanced',
    permission: 'users:read',
    badge: 'ENHANCED',
  },
  {
    path: '/admin/app-management',
    label: 'App Management',
    icon: DevicePhoneMobileIcon,
    command: './app-management --desktop-apps',
    permission: 'apps:write',
    badge: 'NEW',
  },
  {
    path: '/admin/sessions',
    label: 'Session Monitor',
    icon: DocumentChartBarIcon,
    command: './sessions --monitor',
    permission: 'sessions:read',
  },
  {
    path: '/admin/reports',
    label: 'Reports',
    icon: DocumentChartBarIcon,
    command: './reports --generate',
    permission: 'reports:read',
  },
  {
    path: '/admin/system',
    label: 'System Health',
    icon: ServerIcon,
    command: './system --status',
    permission: 'system:read',
  },
  {
    path: '/admin/profile',
    label: 'Admin Profile',
    icon: UserCircleIcon,
    command: './profile --manage',
    permission: 'profile:write',
  },
  {
    path: '/admin/dynamic-config',
    label: 'Dynamic Config',
    icon: ServerIcon,
    command: './dynamic-config --manage --realtime',
    permission: 'config:write',
    badge: 'REALTIME',
  },
  {
    path: '/admin/pricing',
    label: 'Pricing Management',
    icon: CurrencyDollarIcon,
    command: './pricing --manage',
    permission: 'pricing:write',
    badge: 'NEW',
  },
  {
    path: '/admin/payments',
    label: 'Payment Gateways',
    icon: CurrencyDollarIcon,
    command: './payment-gateways --manage --multi-provider',
    permission: 'payments:write',
    badge: 'MULTI',
  },
  {
    path: '/admin/revenue',
    label: 'Revenue Analytics',
    icon: ChartBarIcon,
    command: './revenue --analytics',
    permission: 'analytics:read',
    badge: 'LIVE',
  },
  {
    path: '/admin/email-templates',
    label: 'Email Templates',
    icon: EnvelopeIcon,
    command: './email-templates --manage',
    permission: 'email:write',
    badge: 'MJML',
  },
  {
    path: '/admin/email-campaigns',
    label: 'Email Campaigns',
    icon: MegaphoneIcon,
    command: './email-campaigns --bulk --promotional',
    permission: 'email:write',
    badge: 'BULK',
  },
  {
    path: '/admin/icon-management',
    label: 'Icon Management',
    icon: PhotoIcon,
    command: './icon-management --branding',
    permission: 'config:write',
    badge: 'BRANDING',
  },
  {
    path: '/admin/policy-management',
    label: 'Policy Management',
    icon: DocumentTextIcon,
    command: './policy-management --legal',
    permission: 'config:write',
    badge: 'LEGAL',
  },
  {
    path: '/admin/alerts',
    label: 'Alert Management',
    icon: BellIcon,
    command: './alerts --manage --broadcast',
    permission: 'alerts:write',
    badge: 'BROADCAST',
  },
];

const AdminLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifications] = useState(3); // Mock notification count

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const filteredNavItems = navigationItems.filter(
    item => !item.permission || hasPermission(item.permission)
  );

  const isActiveRoute = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin' || location.pathname === '/admin/';
    }
    return location.pathname.startsWith(path);
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'text-red-400';
      case 'admin':
        return 'text-primary-500';
      case 'moderator':
        return 'text-cli-cyan';
      default:
        return 'text-cli-light-gray';
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'ROOT';
      case 'admin':
        return 'ADMIN';
      case 'moderator':
        return 'MOD';
      default:
        return 'USER';
    }
  };

  return (
    <div className='matrix-bg flex min-h-screen bg-cli-black'>
      <MatrixRain className='opacity-5' />

      {/* Sidebar */}
      <div
        className={`
        admin-sidebar relative z-10 transition-all duration-300
        ${sidebarOpen ? 'w-72' : 'w-16'}
        ${sidebarOpen ? '' : 'overflow-hidden'}
        border-r border-cli-gray
      `}
      >
        {/* Header */}
        <div className='border-b border-cli-gray p-4'>
          <div className='flex items-center justify-between'>
            <div className={`flex items-center space-x-3 ${sidebarOpen ? '' : 'justify-center'}`}>
              <div className='cli-terminal h-10 w-10 animate-pulse-golden p-2'>
                <CommandLineIcon className='h-full w-full text-primary-500' />
              </div>
              {sidebarOpen && (
                <div>
                  <h1 className='cli-glow font-mono text-xl font-bold text-cli-white'>
                    Mock<span className='text-primary-500'>Mate</span>
                  </h1>
                  <div className='flex items-center space-x-2'>
                    <CliBadge variant='warning' className='text-xs'>
                      {getRoleBadge(user?.role || 'user')}
                    </CliBadge>
                    <span className='font-mono text-xs text-cli-light-gray'>ADMIN</span>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className='rounded-md p-2 transition-colors hover:bg-cli-dark'
            >
              {sidebarOpen ? (
                <XMarkIcon className='h-5 w-5 text-cli-light-gray' />
              ) : (
                <Bars3Icon className='h-5 w-5 text-cli-light-gray' />
              )}
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className='flex-1 p-4'>
          <div className={`space-y-2 ${sidebarOpen ? '' : 'space-y-4'}`}>
            {filteredNavItems.map(item => {
              const isActive = isActiveRoute(item.path);
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`
                    admin-nav-item group w-full rounded-md p-3 text-left transition-all duration-300
                    ${isActive ? 'active' : ''}
                    ${sidebarOpen ? '' : 'justify-center'}
                    flex items-center space-x-3
                  `}
                >
                  <Icon
                    className={`
                    h-5 w-5 transition-colors
                    ${isActive ? 'text-primary-500' : 'text-cli-light-gray group-hover:text-primary-500'}
                  `}
                  />
                  {sidebarOpen && (
                    <div className='flex flex-1 items-center justify-between'>
                      <div>
                        <div
                          className={`
                          font-mono font-medium transition-colors
                          ${isActive ? 'text-primary-500' : 'text-cli-white group-hover:text-primary-500'}
                        `}
                        >
                          {item.label}
                        </div>
                        <div className='mt-1 font-mono text-xs text-cli-green'>{item.command}</div>
                      </div>
                      {item.badge && (
                        <CliBadge variant='info' className='ml-2'>
                          {item.badge}
                        </CliBadge>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User Info & Actions */}
        <div className='border-t border-cli-gray p-4'>
          {sidebarOpen ? (
            <div className='space-y-4'>
              {/* User Info */}
              <div className='cli-terminal p-3'>
                <div className='mb-2 font-mono text-xs text-cli-green'>$ whoami</div>
                <div className='flex items-center space-x-3'>
                  <div className='cli-terminal flex h-8 w-8 items-center justify-center rounded-full'>
                    <span
                      className={`font-mono text-sm font-bold ${getRoleColor(user?.role || '')}`}
                    >
                      {user?.username?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='truncate font-mono text-sm font-semibold text-cli-white'>
                      {user?.username}
                    </div>
                    <div className={`font-mono text-xs ${getRoleColor(user?.role || '')}`}>
                      {user?.role?.replace('_', ' ').toUpperCase()}
                    </div>
                  </div>
                </div>
                <div className='mt-2 border-t border-cli-gray pt-2'>
                  <div className='font-mono text-xs text-cli-light-gray'>
                    Last login:{' '}
                    {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                  </div>
                </div>
              </div>

              {/* Notifications */}
              {notifications > 0 && (
                <div className='flex items-center space-x-2 rounded-md border border-primary-500/30 bg-primary-500/10 p-2'>
                  <BellIcon className='h-4 w-4 text-primary-500' />
                  <span className='font-mono text-sm text-primary-500'>{notifications} alerts</span>
                </div>
              )}

              {/* Logout */}
              <button
                onClick={handleLogout}
                className='group flex w-full items-center space-x-3 rounded-md border border-red-500/30 bg-red-500/20 p-3 transition-colors hover:bg-red-500/30'
              >
                <ArrowRightOnRectangleIcon className='h-5 w-5 text-red-400 group-hover:text-red-300' />
                <div>
                  <div className='font-mono font-medium text-red-400 group-hover:text-red-300'>
                    Logout
                  </div>
                  <div className='font-mono text-xs text-cli-green'>./logout --admin</div>
                </div>
              </button>
            </div>
          ) : (
            <div className='flex flex-col items-center space-y-4'>
              <div className='cli-terminal flex h-8 w-8 items-center justify-center rounded-full'>
                <span className={`font-mono text-sm font-bold ${getRoleColor(user?.role || '')}`}>
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </div>
              {notifications > 0 && (
                <div className='relative'>
                  <BellIcon className='h-5 w-5 text-primary-500' />
                  <div className='absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500'></div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className='rounded-md border border-red-500/30 bg-red-500/20 p-2 transition-colors hover:bg-red-500/30'
              >
                <ArrowRightOnRectangleIcon className='h-5 w-5 text-red-400' />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className='flex min-h-screen flex-1 flex-col bg-cli-black'>
        {/* Top Bar */}
        <header className='relative z-10 border-b border-cli-gray bg-cli-darker'>
          <div className='px-6 py-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center space-x-4'>
                <div className='font-mono text-sm text-cli-light-gray'>
                  $ cd {location.pathname}
                </div>
              </div>
              <div className='flex items-center space-x-4'>
                <TypingText
                  text={`admin@mockmate:${location.pathname}$`}
                  className='text-sm text-cli-green'
                  speed={50}
                />
                <CliBadge variant='success' className='animate-pulse'>
                  ONLINE
                </CliBadge>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className='relative z-10 flex-1 bg-cli-black p-6'>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
