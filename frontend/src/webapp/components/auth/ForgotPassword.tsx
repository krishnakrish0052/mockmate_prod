import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiCall } from '../../utils/apiUtils';

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiCall('/auth/password-reset-request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      setSubmitted(true);
    } catch (err: any) {
      console.error('Password reset request failed:', err);
      setError(
        err.response?.data?.error || 
        err.message || 
        'Failed to send password reset email. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-cli-black flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-primary-500 mb-2 font-mono">
              MockMate
            </h1>
            <h2 className="text-xl text-cli-light-gray font-mono mb-8">
              Check Your Email
            </h2>
          </div>

          <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-cli-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 4.26c.3.16.67.16.96 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-primary-500 mb-4 font-mono">
                Password Reset Email Sent!
              </h3>
              
              <p className="text-cli-light-gray text-sm mb-6 font-mono">
                If an account with that email exists, we've sent you a password reset link.
              </p>

              <p className="text-cli-gray text-sm mb-6 font-mono">
                Please check your email and click the reset link to create a new password.
                The link will expire in 1 hour for security.
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => setSubmitted(false)}
                  className="w-full border border-cli-gray text-cli-light-gray font-bold py-3 px-4 rounded-md hover:bg-cli-gray hover:text-cli-black transition duration-150 font-mono"
                >
                  Send Another Email
                </button>
                
                <Link
                  to="/login"
                  className="block w-full bg-primary-500 text-cli-black font-bold py-3 px-4 rounded-md hover:bg-primary-600 transition duration-150 text-center font-mono"
                >
                  Back to Login
                </Link>
              </div>

              <p className="text-cli-gray text-xs mt-4 font-mono">
                Didn't receive the email? Check your spam folder or try again.
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
            Reset Your Password
          </h2>
        </div>

        <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8 space-y-6">
          <div className="text-center mb-6">
            <p className="text-cli-light-gray text-sm font-mono">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded-md text-sm font-mono">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-cli-gray rounded-md shadow-sm bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                placeholder="Enter your email"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-cli-black bg-primary-500 hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cli-black mr-2"></div>
                  Sending...
                </div>
              ) : (
                'Send Reset Link'
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

        <div className="text-center">
          <p className="text-cli-gray text-sm font-mono">
            Remember your password?{' '}
            <Link to="/login" className="text-primary-500 hover:underline">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
