import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './contexts/AdminAuthContext';
import AdminLogin from './components/auth/AdminLogin';
import AdminLayout from './components/layout/AdminLayout';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Users from './pages/Users';
import Sessions from './pages/Sessions';
import AdminProfile from './pages/AdminProfile';
import DynamicConfigurationManagement from './pages/DynamicConfigurationManagement';
import PricingManagement from './pages/PricingManagement';
import Revenue from './pages/Revenue';
import SystemHealth from './pages/SystemHealth';
import Reports from './pages/Reports';
import EmailCampaigns from './pages/EmailCampaigns';
import IconManagement from './pages/IconManagement';
import AppManagement from './pages/AppManagement';
import PolicyManagement from './components/PolicyManagement';
import AlertManagement from './pages/AlertManagement';
import { TerminalWindow, TypingText, MatrixRain } from './components/ui/CliComponents';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <TerminalWindow
          title='admin@mockmate:~$ ./authenticating...'
          className='relative z-10 w-96'
        >
          <div className='flex flex-col items-center space-y-4 p-8'>
            <div className='h-12 w-12 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
            <TypingText
              text='Verifying admin credentials...'
              className='text-cli-light-gray'
              speed={50}
            />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to='/admin/login' replace />;
  }

  return <>{children}</>;
};

// Public Route Component (redirects authenticated users)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <TerminalWindow title='admin@mockmate:~$ ./initializing...' className='relative z-10 w-96'>
          <div className='flex flex-col items-center space-y-4 p-8'>
            <div className='h-12 w-12 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
            <TypingText text='Loading admin panel...' className='text-cli-light-gray' speed={50} />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to='/admin' replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <AdminAuthProvider>
      <div className='App'>
        <Routes>
          {/* Public Routes */}
          <Route
            path='login'
            element={
              <PublicRoute>
                <AdminLogin />
              </PublicRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path='/'
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard */}
            <Route index element={<Dashboard />} />

            {/* Analytics */}
            <Route path='analytics' element={<Analytics />} />

            {/* User Management */}
            <Route path='users' element={<Users />} />

            {/* App Management */}
            <Route path='app-management' element={<AppManagement />} />

            {/* Sessions */}
            <Route path='sessions' element={<Sessions />} />

            {/* Admin Profile */}
            <Route path='profile' element={<AdminProfile />} />

            {/* Dynamic Configuration */}
            <Route path='dynamic-config' element={<DynamicConfigurationManagement />} />

            {/* Pricing Management */}
            <Route path='pricing' element={<PricingManagement />} />

            {/* Revenue Analytics */}
            <Route path='revenue' element={<Revenue />} />

            {/* System Health */}
            <Route path='system' element={<SystemHealth />} />

            {/* Reports */}
            <Route path='reports' element={<Reports />} />

            {/* Email Campaigns */}
            <Route path='email-campaigns' element={<EmailCampaigns />} />

            {/* Icon Management */}
            <Route path='icon-management' element={<IconManagement />} />

            {/* Policy Management */}
            <Route path='policy-management' element={<PolicyManagement />} />

            {/* Alert Management */}
            <Route path='alerts' element={<AlertManagement />} />
          </Route>
        </Routes>
      </div>
    </AdminAuthProvider>
  );
}

export default App;
