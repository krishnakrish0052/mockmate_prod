import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  CheckCircleIcon,
  SparklesIcon,
  ArrowRightIcon 
} from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';
import axios from 'axios';

const PaymentSuccess: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    const verifyPayment = async () => {
      if (!sessionId) {
        setError('No payment session found');
        setLoading(false);
        return;
      }

      try {
        // Verify payment with backend
        const response = await axios.post('/payments/verify-session', {
          sessionId
        });

        if (response.data.success) {
          setPaymentData(response.data.payment);
          // Refresh user to get updated credits
          await refreshUser();
        } else {
          setError(response.data.error || 'Payment verification failed');
        }
      } catch (error: any) {
        console.error('Payment verification error:', error);
        setError(error.response?.data?.error || 'Failed to verify payment');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [sessionId, refreshUser]);

  if (loading) {
    return (
      <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black'>
        <MatrixRain />
        <TerminalWindow title='mockmate@payments:~$ ./verify-payment...' className='relative z-10 w-96'>
          <div className='flex flex-col items-center space-y-4 p-8'>
            <div className='h-12 w-12 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
            <TypingText
              text='Verifying your payment...'
              className='text-cli-light-gray'
              speed={50}
            />
            <div className='font-mono text-xs text-cli-gray'>$ stripe payment --validate</div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (error) {
    return (
      <div className='matrix-bg min-h-screen bg-cli-black'>
        <MatrixRain />
        <div className='relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8'>
          <TerminalWindow title='mockmate@payments:~$ ./payment-error' className='text-center'>
            <div className='p-8'>
              <div className='mb-6 text-6xl'>⚠️</div>
              <TypingText
                text='Payment Verification Failed'
                className='mb-4 font-mono text-xl font-bold text-red-400'
                speed={50}
              />
              <p className='mb-6 font-mono text-sm text-cli-light-gray'>{error}</p>
              <div className='space-x-4'>
                <Link to='/credits'>
                  <CliButton variant='primary'>Try Again</CliButton>
                </Link>
                <Link to='/dashboard'>
                  <CliButton variant='secondary'>Back to Dashboard</CliButton>
                </Link>
              </div>
            </div>
          </TerminalWindow>
        </div>
      </div>
    );
  }

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />
      
      <div className='relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Success Header */}
        <TerminalWindow title='mockmate@payments:~$ ./payment-success --confirmed' className='mb-8'>
          <div className='p-8 text-center'>
            <div className='mb-6 flex justify-center'>
              <CheckCircleIcon className='h-24 w-24 text-cli-green animate-pulse' />
            </div>
            <TypingText
              text='Payment Successful!'
              className='mb-4 font-mono text-3xl font-bold text-cli-green'
              speed={30}
            />
            <div className='mb-4 font-mono text-lg text-cli-light-gray'>
              Your credits have been added to your account
            </div>
            <div className='space-y-1 font-mono text-sm text-cli-gray'>
              <div>$ payment_status: COMPLETED</div>
              <div>$ transaction_verified: TRUE</div>
              <div>$ credits_updated: SUCCESS</div>
            </div>
          </div>
        </TerminalWindow>

        {/* Payment Details */}
        {paymentData && (
          <CliCard className='mb-8 transition-all hover:shadow-glow-golden'>
            <div className='p-6'>
              <h3 className='mb-4 font-mono text-lg font-bold text-primary-500'>
                $ cat /payments/receipt.txt
              </h3>
              <div className='space-y-3 font-mono text-sm'>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>Package:</span>
                  <span className='text-cli-white'>{paymentData.packageName}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>Credits Purchased:</span>
                  <span className='text-primary-500 font-bold'>
                    {paymentData.credits}
                    {paymentData.bonusCredits > 0 && (
                      <span className='text-cli-green'> +{paymentData.bonusCredits} bonus</span>
                    )}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>Amount Paid:</span>
                  <span className='text-cli-white'>${paymentData.amount}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>Payment Method:</span>
                  <span className='text-cli-white'>{paymentData.paymentMethod}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-cli-light-gray'>Transaction ID:</span>
                  <span className='text-cli-gray font-mono text-xs'>{paymentData.transactionId}</span>
                </div>
              </div>
            </div>
          </CliCard>
        )}

        {/* Current Balance */}
        <CliCard className='mb-8 transition-all hover:shadow-glow-golden'>
          <div className='p-6 text-center'>
            <div className='mb-2 flex items-center justify-center space-x-2'>
              <SparklesIcon className='h-6 w-6 text-primary-500' />
              <span className='font-mono text-lg text-cli-light-gray'>New Balance</span>
            </div>
            <div className='cli-glow mb-2 font-mono text-4xl font-bold text-cli-white'>
              {user?.credits} <span className='text-primary-500'>CREDITS</span>
            </div>
            <div className='font-mono text-sm text-cli-gray'>
              $ echo "Ready for {user?.credits} interview sessions"
            </div>
          </div>
        </CliCard>

        {/* Action Buttons */}
        <div className='text-center space-y-4'>
          <div className='space-x-4'>
            <Link to='/session/create'>
              <CliButton variant='primary' className='inline-flex items-center'>
                Start Interview Session
                <ArrowRightIcon className='ml-2 h-4 w-4' />
              </CliButton>
            </Link>
            <Link to='/dashboard'>
              <CliButton variant='secondary'>
                Back to Dashboard
              </CliButton>
            </Link>
          </div>
          <Link to='/credits'>
            <CliButton variant='ghost' className='text-sm'>
              View All Packages
            </CliButton>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
