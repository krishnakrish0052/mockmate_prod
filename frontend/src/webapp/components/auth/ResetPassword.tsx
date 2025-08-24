import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { apiCall } from '../../utils/apiUtils';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const resetToken = searchParams.get('token');
    
    if (!resetToken) {
      setError('Invalid reset link - missing token');
      return;
    }
    
    setToken(resetToken);
  }, [location.search]);

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/(?=.*[a-z])/.test(pwd)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/(?=.*[A-Z])/.test(pwd)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/(?=.*\d)/.test(pwd)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Invalid reset token');
      return;
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await apiCall('/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({
          token,
          password,
        }),
      });

      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      
      if (err.response?.data?.code === 'INVALID_RESET_TOKEN') {
        setError('This password reset link is invalid or has expired. Please request a new one.');
      } else {
        setError(
          err.response?.data?.error || 
          err.message || 
          'Failed to reset password. Please try again.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token && error) {
    return (
      <div className="min-h-screen bg-cli-black flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary-500 mb-2 font-mono">
              MockMate
            </h1>
            <h2 className="text-xl text-cli-light-gray font-mono mb-8">
              Reset Password
            </h2>
          </div>

          <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-red-500 mb-2 font-mono">
                Invalid Reset Link
              </h3>
              
              <p className="text-cli-light-gray text-sm mb-6 font-mono">
                {error}
              </p>

              <div className="space-y-4">
                <Link
                  to="/forgot-password"
                  className="block w-full bg-primary-500 text-cli-black font-bold py-3 px-4 rounded-md hover:bg-primary-600 transition duration-150 text-center font-mono"
                >
                  Request New Reset Link
                </Link>
                
                <Link
                  to="/login"
                  className="block w-full border border-cli-gray text-cli-light-gray font-bold py-3 px-4 rounded-md hover:bg-cli-gray hover:text-cli-black transition duration-150 text-center font-mono"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-cli-black flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary-500 mb-2 font-mono">
              MockMate
            </h1>
            <h2 className="text-xl text-cli-light-gray font-mono mb-8">
              Password Reset
            </h2>
          </div>

          <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-green-500 mb-2 font-mono">
                Password Reset Successfully!
              </h3>
              
              <p className="text-cli-light-gray text-sm mb-6 font-mono">
                Your password has been updated. You can now sign in with your new password.
              </p>

              <Link
                to="/login"
                className="block w-full bg-primary-500 text-cli-black font-bold py-3 px-4 rounded-md hover:bg-primary-600 transition duration-150 text-center font-mono"
              >
                Go to Login
              </Link>

              <p className="text-cli-gray text-sm mt-4 font-mono">
                Redirecting to login in 3 seconds...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cli-black flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-500 mb-2 font-mono">
            MockMate
          </h1>
          <h2 className="text-xl text-cli-light-gray font-mono mb-8">
            Create New Password
          </h2>
        </div>

        <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8 space-y-6">
          <div className="text-center mb-6">
            <p className="text-cli-light-gray text-sm font-mono">
              Enter your new password below. Make sure it's strong and secure.
            </p>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded-md text-sm font-mono">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                New Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-cli-gray rounded-md shadow-sm bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                placeholder="Enter new password"
                disabled={loading}
              />
              <p className="text-cli-gray text-xs mt-1 font-mono">
                Must be 8+ chars with uppercase, lowercase, and number
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-cli-gray rounded-md shadow-sm bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                placeholder="Confirm new password"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-cli-black bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cli-black mr-2"></div>
                  Resetting Password...
                </div>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          <div className="text-center">
            <Link
              to="/login"
              className="text-primary-500 hover:text-primary-400 text-sm font-mono"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
