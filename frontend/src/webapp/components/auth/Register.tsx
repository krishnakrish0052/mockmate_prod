import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, CommandLineIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { apiCall } from '../../utils/apiUtils';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliInput,
  MatrixRain,
  CliBadge,
  CliCard,
} from '../ui/CliComponents';

const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowSuccess(false);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      const result = await register(
        formData.email,
        formData.password,
        formData.firstName,
        formData.lastName
      );

      if (result.requiresEmailVerification) {
        // Show success message and prompt to check email
        setShowSuccess(true);
        setSuccessMessage(result.message);
        setRegisteredEmail(formData.email);
      } else {
        // Direct login (legacy flow)
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!registeredEmail) return;
    
    setResendLoading(true);
    setResendMessage('');
    
    try {
      await apiCall('/email-verification/resend', {
        method: 'POST',
        body: JSON.stringify({ email: registeredEmail }),
      });
      
      setResendMessage('Verification email resent! Please check your inbox.');
    } catch (err: any) {
      setResendMessage(err.response?.data?.message || 'Failed to resend email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black px-4 py-12 sm:px-6 lg:px-8'>
      <MatrixRain />

      <div className='relative z-10 w-full max-w-lg space-y-8'>
        <TerminalWindow title='mockmate@auth:~$ ./register.sh --new-user' className=''>
          <div className='p-8'>
            {/* Header */}
            <div className='mb-8 text-center'>
              <div className='cli-terminal mx-auto mb-4 h-12 w-12 p-2'>
                <UserPlusIcon className='h-full w-full text-primary-500' />
              </div>
              <TypingText
                text='Initialize User Registration Protocol'
                className='mb-2 font-mono text-2xl font-bold text-primary-500'
                speed={40}
              />
              <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
                <div>$ useradd --interactive --shell=/bin/bash</div>
                <div className='text-cli-gray'>Creating new user account...</div>
                <div>$ ./setup-profile --init</div>
              </div>
            </div>

            {/* Form */}
            <form className='space-y-6' onSubmit={handleSubmit}>
              {error && (
                <div className='rounded-lg border border-red-500 bg-red-900/20 p-4'>
                  <div className='font-mono text-sm text-red-400'>
                    <div className='mb-1 font-bold'>REGISTRATION ERROR:</div>
                    <div>{error}</div>
                    {error.includes('already exists') && (
                      <div className='mt-2 text-xs text-red-300'>
                        Try using a different email address or{' '}
                        <Link to='/login' className='text-primary-400 underline'>
                          sign in instead
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showSuccess && (
                <div className='rounded-lg border border-green-500 bg-green-900/20 p-4'>
                  <div className='font-mono text-sm text-green-400'>
                    <div className='mb-1 font-bold'>REGISTRATION SUCCESSFUL:</div>
                    <div>{successMessage}</div>
                    <div className='mt-2 text-xs text-green-300'>
                      Check your email inbox and click the verification link to activate your
                      account.
                      <br />
                      Then return to{' '}
                      <Link to='/login' className='text-primary-400 underline'>
                        login here
                      </Link>
                      .
                    </div>
                    <div className='mt-3 pt-3 border-t border-green-700'>
                      <div className='flex items-center justify-between'>
                        <span className='text-xs text-green-300'>Didn't receive the email?</span>
                        <button
                          type='button'
                          onClick={handleResendVerification}
                          disabled={resendLoading}
                          className='text-xs text-primary-400 underline hover:text-primary-300 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                          {resendLoading ? 'Sending...' : 'Resend verification email'}
                        </button>
                      </div>
                      {resendMessage && (
                        <div className={`mt-2 text-xs ${resendMessage.includes('Failed') ? 'text-red-300' : 'text-green-300'}`}>
                          {resendMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className='space-y-4'>
                {/* Name Fields */}
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      $ firstname --set
                    </label>
                    <CliInput
                      name='firstName'
                      type='text'
                      placeholder='John'
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      $ lastname --set
                    </label>
                    <CliInput
                      name='lastName'
                      type='text'
                      placeholder='Doe'
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                {/* Email Field */}
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ email --register
                  </label>
                  <CliInput
                    name='email'
                    type='email'
                    placeholder='user@domain.com'
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ passwd --new {showPassword ? '--visible' : '--hidden'}
                  </label>
                  <div className='relative'>
                    <CliInput
                      name='password'
                      type={showPassword ? 'text' : 'password'}
                      placeholder='Create secure passphrase'
                      value={formData.password}
                      onChange={handleChange}
                      className='pr-10'
                      required
                    />
                    <button
                      type='button'
                      className='absolute right-3 top-1/2 -translate-y-1/2 transform text-cli-gray transition-colors hover:text-primary-500'
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeSlashIcon className='h-5 w-5' />
                      ) : (
                        <EyeIcon className='h-5 w-5' />
                      )}
                    </button>
                  </div>
                  <div className='mt-1 font-mono text-xs text-cli-gray'>
                    # Requirements: 8+ chars, upper+lower+digit
                  </div>
                </div>

                {/* Confirm Password Field */}
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ passwd --confirm {showConfirmPassword ? '--visible' : '--hidden'}
                  </label>
                  <div className='relative'>
                    <CliInput
                      name='confirmPassword'
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder='Verify passphrase'
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className='pr-10'
                      required
                    />
                    <button
                      type='button'
                      className='absolute right-3 top-1/2 -translate-y-1/2 transform text-cli-gray transition-colors hover:text-primary-500'
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeSlashIcon className='h-5 w-5' />
                      ) : (
                        <EyeIcon className='h-5 w-5' />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className='flex items-center space-x-3'>
                <input
                  id='terms'
                  name='terms'
                  type='checkbox'
                  required
                  className='h-4 w-4 rounded border-cli-gray bg-cli-darker text-primary-500 focus:ring-primary-500'
                />
                <label htmlFor='terms' className='font-mono text-sm text-cli-light-gray'>
                  --accept-terms{' '}
                  <button
                    type='button'
                    className='text-primary-500 underline transition-colors hover:text-primary-400'
                  >
                    /legal/tos
                  </button>{' '}
                  and{' '}
                  <button
                    type='button'
                    className='text-primary-500 underline transition-colors hover:text-primary-400'
                  >
                    /legal/privacy
                  </button>
                </label>
              </div>

              <div>
                <CliButton
                  type='submit'
                  variant='primary'
                  disabled={loading}
                  className='w-full'
                  isLoading={loading}
                >
                  {loading ? './creating-account...' : './register --execute'}
                </CliButton>
              </div>

              <div className='border-t border-cli-gray pt-6 text-center'>
                <div className='font-mono text-sm text-cli-light-gray'>
                  $ ls /accounts/ --existing
                </div>
                <div className='mt-2 font-mono text-sm text-cli-gray'>
                  Account exists?{' '}
                  <Link
                    to='/login'
                    className='text-primary-500 transition-colors hover:text-primary-400'
                  >
                    ./login --signin
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </TerminalWindow>

        {/* Benefits */}
        <CliCard className=''>
          <div className='p-6'>
            <div className='mb-4 text-center'>
              <TypingText
                text='Account Benefits Package'
                className='font-mono text-lg font-bold text-primary-500'
                speed={50}
              />
            </div>
            <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
              <div className='flex items-center space-x-3'>
                <CliBadge variant='success' className='text-xs'>
                  5
                </CliBadge>
                <span>Free interview credits on signup</span>
              </div>
              <div className='flex items-center space-x-3'>
                <CliBadge variant='info' className='text-xs'>
                  AI
                </CliBadge>
                <span>Powered interview practice sessions</span>
              </div>
              <div className='flex items-center space-x-3'>
                <CliBadge variant='warning' className='text-xs'>
                  RT
                </CliBadge>
                <span>Real-time feedback and scoring</span>
              </div>
              <div className='flex items-center space-x-3'>
                <CliBadge variant='default' className='text-xs'>
                  CV
                </CliBadge>
                <span>Resume-based question generation</span>
              </div>
            </div>
            <div className='mt-4 font-mono text-xs text-cli-green'>
              $ ./start-journey --career-ready
            </div>
          </div>
        </CliCard>

        {/* CLI Status Bar */}
        <div className='text-center'>
          <CliBadge variant='info' className='font-mono text-xs'>
            REGISTRATION PORTAL ACTIVE
          </CliBadge>
        </div>
      </div>
    </div>
  );
};

export default Register;
