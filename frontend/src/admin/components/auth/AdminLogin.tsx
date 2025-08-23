import React, { useState } from 'react';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { TerminalWindow, TypingText, CliButton, CliInput, MatrixRain } from '../ui/CliComponents';
import {
  ShieldCheckIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const AdminLogin: React.FC = () => {
  const { login, loading, error } = useAdminAuth();
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(credentials.username, credentials.password);
  };

  const handleInputChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className='matrix-bg flex min-h-screen items-center justify-center bg-cli-black p-4'>
      <MatrixRain />

      <div className='relative z-10 w-full max-w-md'>
        {/* Header */}
        <div className='mb-8 text-center'>
          <div className='mb-4 flex justify-center'>
            <div className='cli-terminal h-16 w-16 animate-pulse-golden rounded-lg p-3'>
              <CommandLineIcon className='h-full w-full text-primary-500' />
            </div>
          </div>
          <h1 className='cli-glow mb-2 font-mono text-3xl font-bold text-cli-white'>
            Mock<span className='text-primary-500'>Mate</span>
          </h1>
          <div className='mb-4 flex items-center justify-center space-x-2'>
            <ShieldCheckIcon className='h-5 w-5 text-primary-500' />
            <span className='font-mono font-semibold text-primary-500'>ADMIN PANEL</span>
          </div>
          <TypingText
            text='Unauthorized access prohibited. Administrators only.'
            className='text-sm text-cli-light-gray'
            speed={30}
          />
        </div>

        <TerminalWindow title='admin@mockmate:~$ ./secure-login --admin' className='mb-6'>
          <div className='p-6'>
            {/* CLI Prompt */}
            <div className='mb-6 space-y-2 font-mono text-cli-white'>
              <div className='flex items-center space-x-2'>
                <span className='text-cli-green'>$</span>
                <span className='text-cli-light-gray'>sudo su admin</span>
              </div>
              <div className='pl-6 text-cli-amber'>[sudo] password for admin: ****</div>
              <div className='pl-6 text-cli-green'>Welcome to MockMate Admin Terminal</div>
              <div className='pl-6 text-cli-light-gray'>Please authenticate to continue...</div>
            </div>

            <form onSubmit={handleSubmit} className='space-y-4'>
              <CliInput
                label='Username'
                type='text'
                value={credentials.username}
                onChange={e => handleInputChange('username', e.target.value)}
                placeholder='Enter admin username'
                required
                showPrompt
                disabled={loading}
              />

              <div className='relative'>
                <CliInput
                  label='Password'
                  type={showPassword ? 'text' : 'password'}
                  value={credentials.password}
                  onChange={e => handleInputChange('password', e.target.value)}
                  placeholder='Enter admin password'
                  required
                  disabled={loading}
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  className='absolute right-3 top-8 font-mono text-sm text-cli-light-gray transition-colors hover:text-primary-500'
                >
                  {showPassword ? 'hide' : 'show'}
                </button>
              </div>

              {error && (
                <div className='flex items-center space-x-2 rounded-md border border-red-500 bg-red-500/20 p-3'>
                  <ExclamationTriangleIcon className='h-5 w-5 flex-shrink-0 text-red-400' />
                  <span className='font-mono text-sm text-red-400'>{error}</span>
                </div>
              )}

              <div className='pt-4'>
                <CliButton
                  type='submit'
                  variant='primary'
                  size='lg'
                  className='w-full'
                  isLoading={loading}
                  disabled={!credentials.username || !credentials.password}
                >
                  {loading ? 'Authenticating...' : './authenticate --admin'}
                </CliButton>
              </div>
            </form>

            {/* Footer Commands */}
            <div className='mt-6 border-t border-cli-gray pt-4'>
              <div className='space-y-1 font-mono text-xs text-cli-light-gray'>
                <div>$ whoami</div>
                <div className='pl-6 text-cli-amber'>guest</div>
                <div>$ sudo --help</div>
                <div className='pl-6 text-cli-green'>
                  Authentication required for administrative access
                </div>
                <div>$ ls -la /admin</div>
                <div className='pl-6 text-red-400'>Permission denied</div>
              </div>
            </div>
          </div>
        </TerminalWindow>

        {/* Security Notice */}
        <div className='text-center'>
          <div className='inline-flex items-center space-x-2 rounded-md border border-cli-gray bg-cli-darker px-4 py-2'>
            <ShieldCheckIcon className='h-4 w-4 text-primary-500' />
            <span className='font-mono text-xs text-cli-light-gray'>
              All sessions are monitored and logged
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
