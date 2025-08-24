import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './components/LandingPage';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import VerifyEmail from './components/auth/VerifyEmail';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import Dashboard from './components/Dashboard';
import CreateSession from './components/session/CreateSession';
import SessionView from './components/session/SessionView';
import SessionsList from './components/session/SessionsList';
import SessionHistory from './components/session/SessionHistory';
import SessionEdit from './components/session/SessionEdit';
import ResumeManager from './components/resume/ResumeManager';
import CreditsPage from './components/credits/CreditsPage';
import AppDownload from './components/AppDownload';
import Policy from './components/Policy';
import PaymentSuccess from './components/payments/PaymentSuccess';
import PaymentCancel from './components/payments/PaymentCancel';
import UserProfile from './components/profile/UserProfile';
import ProtectedRoute from './components/ProtectedRoute';

// Debug helper for development
if (import.meta.env.DEV) {
  import('./debug/authDebug');
}

function App() {
  return (
    <AuthProvider>
      <div className='App'>
        <Routes>
          {/* Public Routes */}
          <Route
            path='/'
            element={
              <PublicRoute>
                <LandingPage />
              </PublicRoute>
            }
          />
          <Route
            path='/login'
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path='/register'
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path='/verify-email'
            element={
              <PublicRoute>
                <VerifyEmail />
              </PublicRoute>
            }
          />
          <Route
            path='/forgot-password'
            element={
              <PublicRoute>
                <ForgotPassword />
              </PublicRoute>
            }
          />
          <Route
            path='/reset-password'
            element={
              <PublicRoute>
                <ResetPassword />
              </PublicRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path='/dashboard'
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path='/session/create'
            element={
              <ProtectedRoute>
                <CreateSession />
              </ProtectedRoute>
            }
          />

          <Route
            path='/session/:sessionId'
            element={
              <ProtectedRoute>
                <SessionView />
              </ProtectedRoute>
            }
          />

          <Route
            path='/sessions'
            element={
              <ProtectedRoute>
                <SessionsList />
              </ProtectedRoute>
            }
          />

          <Route
            path='/session/:sessionId/view'
            element={
              <ProtectedRoute>
                <SessionHistory />
              </ProtectedRoute>
            }
          />

          <Route
            path='/session/:sessionId/edit'
            element={
              <ProtectedRoute>
                <SessionEdit />
              </ProtectedRoute>
            }
          />

          <Route
            path='/resumes'
            element={
              <ProtectedRoute>
                <ResumeManager />
              </ProtectedRoute>
            }
          />

          <Route
            path='/credits'
            element={
              <ProtectedRoute>
                <CreditsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path='/download'
            element={
              <ProtectedRoute>
                <AppDownload />
              </ProtectedRoute>
            }
          />

          <Route
            path='/profile'
            element={
              <ProtectedRoute>
                <UserProfile />
              </ProtectedRoute>
            }
          />

          {/* Payment Routes */}
          <Route
            path='/payment/success'
            element={
              <ProtectedRoute>
                <PaymentSuccess />
              </ProtectedRoute>
            }
          />

          <Route
            path='/payment/cancel'
            element={
              <ProtectedRoute>
                <PaymentCancel />
              </ProtectedRoute>
            }
          />

          {/* Policy Routes - Public */}
          <Route path='/privacy-policy' element={<Policy />} />
          <Route path='/terms-of-service' element={<Policy />} />
          <Route path='/:slug' element={<Policy />} />

          {/* Catch all route */}
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

// Component to redirect authenticated users away from auth pages
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-cli-black'>
        <div className='text-center'>
          <div className='mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary-500'></div>
          <p className='font-mono text-cli-light-gray'>Loading...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated and trying to access auth pages, redirect to dashboard
  if (user && (location.pathname === '/login' || location.pathname === '/register')) {
    return <Navigate to='/dashboard' replace />;
  }

  return <>{children}</>;
};

export default App;
