import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { 
  XCircleIcon,
  ArrowLeftIcon,
  CreditCardIcon 
} from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliCard,
  MatrixRain,
} from '../ui/CliComponents';

const PaymentCancel: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className='matrix-bg min-h-screen bg-cli-black'>
      <MatrixRain />
      
      <div className='relative z-10 mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8'>
        {/* Cancel Header */}
        <TerminalWindow title='mockmate@payments:~$ ./payment-cancelled' className='mb-8'>
          <div className='p-8 text-center'>
            <div className='mb-6 flex justify-center'>
              <XCircleIcon className='h-24 w-24 text-yellow-500' />
            </div>
            <TypingText
              text='Payment Cancelled'
              className='mb-4 font-mono text-3xl font-bold text-yellow-500'
              speed={30}
            />
            <div className='mb-4 font-mono text-lg text-cli-light-gray'>
              Your payment was cancelled and no charges were made
            </div>
            <div className='space-y-1 font-mono text-sm text-cli-gray'>
              <div>$ payment_status: CANCELLED</div>
              <div>$ amount_charged: $0.00</div>
              <div>$ session_status: TERMINATED</div>
            </div>
          </div>
        </TerminalWindow>

        {/* Current Balance */}
        <CliCard className='mb-8 transition-all hover:shadow-glow-golden'>
          <div className='p-6 text-center'>
            <div className='mb-2 flex items-center justify-center space-x-2'>
              <CreditCardIcon className='h-6 w-6 text-primary-500' />
              <span className='font-mono text-lg text-cli-light-gray'>Current Balance</span>
            </div>
            <div className='cli-glow mb-2 font-mono text-4xl font-bold text-cli-white'>
              {user?.credits} <span className='text-primary-500'>CREDITS</span>
            </div>
            <div className='font-mono text-sm text-cli-gray'>
              $ echo "No changes made to your account"
            </div>
          </div>
        </CliCard>

        {/* Information Card */}
        <CliCard className='mb-8'>
          <div className='p-6'>
            <h3 className='mb-4 font-mono text-lg font-bold text-primary-500'>
              $ cat /help/payment-cancelled.txt
            </h3>
            <div className='space-y-3 font-mono text-sm text-cli-light-gray'>
              <p>• No charges were processed to your payment method</p>
              <p>• Your account remains unchanged</p>
              <p>• You can try purchasing credits again anytime</p>
              <p>• Contact support if you experienced any issues</p>
            </div>
          </div>
        </CliCard>

        {/* Action Buttons */}
        <div className='text-center space-y-4'>
          <div className='space-x-4'>
            <Link to='/credits'>
              <CliButton variant='primary' className='inline-flex items-center'>
                <ArrowLeftIcon className='mr-2 h-4 w-4' />
                Try Again
              </CliButton>
            </Link>
            <Link to='/dashboard'>
              <CliButton variant='secondary'>
                Back to Dashboard
              </CliButton>
            </Link>
          </div>
          
          <div className='pt-4 border-t border-cli-gray'>
            <p className='mb-4 font-mono text-sm text-cli-light-gray'>
              Need help with your purchase?
            </p>
            <div className='space-x-4'>
              <CliButton variant='ghost' className='text-sm'>
                ./contact-support --payment-help
              </CliButton>
              <CliButton variant='ghost' className='text-sm'>
                ./faq --payment-issues
              </CliButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancel;
