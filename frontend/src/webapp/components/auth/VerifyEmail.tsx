import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { apiCall } from '../../utils/apiUtils';
import { useAuth } from '../../contexts/AuthContext';

interface VerificationResult {
  success: boolean;
  message: string;
  userId?: string;
  email?: string;
  alreadyVerified?: boolean;
}

const VerifyEmail: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const verifyToken = async () => {
      const searchParams = new URLSearchParams(location.search);
      const token = searchParams.get('token');

      if (!token) {
        setError('Invalid verification link - missing token');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Call the backend verification API
        const response = await apiCall(`/email-verification/verify/${token}`, {
          method: 'GET',
        });

        if (response.success) {
          setResult({
            success: true,
            message: response.message,
            userId: response.data?.userId,
            email: response.data?.email,
            alreadyVerified: response.data?.alreadyVerified,
          });

          // Refresh the user context to update verification status
          await refreshUser();

          // Redirect to dashboard after 3 seconds if newly verified
          if (!response.data?.alreadyVerified) {
            setTimeout(() => {
              navigate('/dashboard', { replace: true });
            }, 3000);
          }
        } else {
          setError(response.message || 'Email verification failed');
        }
      } catch (err: any) {
        console.error('Email verification failed:', err);
        setError(
          err.response?.data?.message || 
          err.message || 
          'An error occurred during email verification'
        );
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [location.search, navigate, refreshUser]);

  const handleResendVerification = async () => {
    if (!result?.email) return;

    try {
      await apiCall('/email-verification/resend', {
        method: 'POST',
        body: JSON.stringify({ email: result.email }),
      });
      
      alert('Verification email sent! Please check your inbox.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to resend verification email');
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard', { replace: true });
  };

  const handleGoToLogin = () => {
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cli-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-cli-light-gray font-mono text-lg">Verifying your email...</p>
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
            Email Verification
          </h2>
        </div>

        <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8 space-y-6">
          {result?.success ? (
            <>
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
                  {result.alreadyVerified ? 'Already Verified!' : 'Email Verified!'}
                </h3>
                
                <p className="text-cli-light-gray text-sm mb-6 font-mono">
                  {result.message}
                </p>

                {result.email && (
                  <p className="text-cli-gray text-sm mb-4 font-mono">
                    Account: <span className="text-primary-500">{result.email}</span>
                  </p>
                )}

                <div className="space-y-4">
                  <button
                    onClick={handleGoToDashboard}
                    className="w-full bg-primary-500 text-cli-black font-bold py-3 px-4 rounded-md hover:bg-primary-600 transition duration-150 font-mono"
                  >
                    Go to Dashboard
                  </button>
                  
                  {result.alreadyVerified && (
                    <button
                      onClick={handleGoToLogin}
                      className="w-full border border-cli-gray text-cli-light-gray font-bold py-3 px-4 rounded-md hover:bg-cli-gray hover:text-cli-black transition duration-150 font-mono"
                    >
                      Go to Login
                    </button>
                  )}
                </div>

                {!result.alreadyVerified && (
                  <p className="text-cli-gray text-sm mt-4 font-mono">
                    Redirecting to dashboard in 3 seconds...
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
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
                  Verification Failed
                </h3>
                
                <p className="text-cli-light-gray text-sm mb-6 font-mono">
                  {error}
                </p>

                <div className="space-y-4">
                  {result?.email && (
                    <button
                      onClick={handleResendVerification}
                      className="w-full bg-primary-500 text-cli-black font-bold py-3 px-4 rounded-md hover:bg-primary-600 transition duration-150 font-mono"
                    >
                      Resend Verification Email
                    </button>
                  )}
                  
                  <button
                    onClick={handleGoToLogin}
                    className="w-full border border-cli-gray text-cli-light-gray font-bold py-3 px-4 rounded-md hover:bg-cli-gray hover:text-cli-black transition duration-150 font-mono"
                  >
                    Go to Login
                  </button>
                </div>

                <p className="text-cli-gray text-xs mt-4 font-mono">
                  Having trouble? Check if your verification link is correct or request a new one.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="text-center">
          <p className="text-cli-gray text-sm font-mono">
            Need help?{' '}
            <a href="/support" className="text-primary-500 hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
