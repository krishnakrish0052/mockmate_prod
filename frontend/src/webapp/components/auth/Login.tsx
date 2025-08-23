import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { EyeIcon, EyeSlashIcon, CommandLineIcon } from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliInput,
  MatrixRain,
  CliBadge,
} from '../ui/CliComponents';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black px-4 py-12 sm:px-6 lg:px-8'>
      <MatrixRain />

      <div className='relative z-10 w-full max-w-md space-y-8'>
        <TerminalWindow title='mockmate@auth:~$ ./login.sh' className=''>
          <div className='p-8'>
            {/* Header */}
            <div className='mb-8 text-center'>
              <div className='cli-terminal mx-auto mb-4 h-12 w-12 p-2'>
                <CommandLineIcon className='h-full w-full text-primary-500' />
              </div>
              <TypingText
                text='Initialize Authentication Sequence'
                className='mb-2 font-mono text-2xl font-bold text-primary-500'
                speed={40}
              />
              <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
                <div>$ whoami</div>
                <div className='text-cli-gray'>Authentication required</div>
                <div>$ ./authenticate --user</div>
              </div>
            </div>

            {/* Form */}
            <form className='space-y-6' onSubmit={handleSubmit}>
              {error && (
                <div className='rounded-lg border border-red-500 bg-red-900/20 p-4'>
                  <div className='font-mono text-sm text-red-400'>ERROR: {error}</div>
                </div>
              )}

              <div className='space-y-4'>
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ email --input
                  </label>
                  <CliInput
                    type='email'
                    placeholder='user@domain.com'
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    $ password --secure {showPassword ? '--visible' : '--hidden'}
                  </label>
                  <div className='relative'>
                    <CliInput
                      type={showPassword ? 'text' : 'password'}
                      placeholder='Enter secure passphrase'
                      value={password}
                      onChange={e => setPassword(e.target.value)}
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
                </div>
              </div>

              <div className='flex items-center justify-between'>
                <div className='flex items-center'>
                  <input
                    id='remember-me'
                    name='remember-me'
                    type='checkbox'
                    className='h-4 w-4 rounded border-cli-gray bg-cli-darker text-primary-500 focus:ring-primary-500'
                  />
                  <label
                    htmlFor='remember-me'
                    className='ml-2 font-mono text-sm text-cli-light-gray'
                  >
                    --remember-session
                  </label>
                </div>

                <Link
                  to='/forgot-password'
                  className='font-mono text-sm text-primary-500 transition-colors hover:text-primary-400'
                >
                  ./forgot-password
                </Link>
              </div>

              <div>
                <CliButton
                  type='submit'
                  variant='primary'
                  disabled={loading}
                  className='w-full'
                  isLoading={loading}
                >
                  {loading ? './authenticating...' : './login --execute'}
                </CliButton>
              </div>

              <div className='border-t border-cli-gray pt-6 text-center'>
                <div className='font-mono text-sm text-cli-light-gray'>$ ls /accounts/ --new</div>
                <div className='mt-2 font-mono text-sm text-cli-gray'>
                  No account found?{' '}
                  <Link
                    to='/register'
                    className='text-primary-500 transition-colors hover:text-primary-400'
                  >
                    ./register --create
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </TerminalWindow>

        {/* CLI Status Bar */}
        <div className='text-center'>
          <CliBadge variant='info' className='font-mono text-xs'>
            SECURE CONNECTION ESTABLISHED
          </CliBadge>
        </div>
      </div>
    </div>
  );
};

export default Login;
