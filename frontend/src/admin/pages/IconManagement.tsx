import React, { useState, useEffect } from 'react';
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { TerminalWindow, TypingText, CliBadge } from '../components/ui/CliComponents';

interface IconConfig {
  favicon: string;
  logo: string;
  title: string;
  icons: {
    [key: string]: string;
  };
}

interface AvailableIcon {
  filename: string;
  url: string;
  size?: number;
  created?: string;
}

interface UploadedFiles {
  [key: string]: string;
}

const IconManagement: React.FC = () => {
  const [iconConfig, setIconConfig] = useState<IconConfig>({
    favicon: '',
    logo: '',
    title: '',
    icons: {},
  });
  const [availableIcons, setAvailableIcons] = useState<AvailableIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [settings, setSettings] = useState<IconConfig>({
    favicon: '',
    logo: '',
    title: '',
    icons: {},
  });

  // Load current icon configuration
  useEffect(() => {
    loadIconConfig();
    loadAvailableIcons();
  }, []);

  const loadIconConfig = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/config/icons');
      const data = await response.json();
      if (data.success) {
        setIconConfig(data);
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to load icon config:', error);
      showMessage('Failed to load icon configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableIcons = async () => {
    try {
      const authToken = localStorage.getItem('admin_token');
      const response = await fetch('http://localhost:5000/api/config/icons/list', {
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      if (data.success) {
        setAvailableIcons(data.icons || []);
      } else if (response.status === 403) {
        console.warn('Admin authentication required for icon list');
        // Don't show error for this since it's optional functionality
      }
    } catch (error) {
      console.error('Failed to load available icons:', error);
    }
  };

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 5000);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    const inputName = event.target.name;
    formData.append(inputName, files[0]);

    try {
      const authToken = localStorage.getItem('admin_token');
      const response = await fetch('http://localhost:5000/api/config/icons/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        showMessage('Icon uploaded successfully!', 'success');
        await loadIconConfig();
        await loadAvailableIcons();
      } else {
        showMessage(`Upload failed: ${data.message || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showMessage('Upload failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSettingsUpdate = async () => {
    setUploading(true);
    setMessage('');

    try {
      const authToken = localStorage.getItem('admin_token');
      const response = await fetch('http://localhost:5000/api/config/icons/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(settings),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        showMessage('Icon settings updated successfully!', 'success');
        await loadIconConfig();
      } else {
        showMessage(`Update failed: ${data.message || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      console.error('Settings update error:', error);
      showMessage('Update failed. Please try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const selectIconFromAvailable = (iconUrl: string, targetField: string) => {
    setSettings(prev => {
      if (targetField.includes('icon')) {
        const iconSize = targetField.replace('app_icon_', '').replace('_', 'x');
        return {
          ...prev,
          icons: {
            ...prev.icons,
            [`${iconSize}`]: iconUrl,
          },
        };
      } else if (targetField === 'app_favicon') {
        return { ...prev, favicon: iconUrl };
      } else if (targetField === 'app_logo') {
        return { ...prev, logo: iconUrl };
      }
      return prev;
    });
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~/icon-management$ ./loading...'>
          <div className='flex items-center justify-center p-8'>
            <div className='flex items-center space-x-4'>
              <div className='h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
              <TypingText
                text='Loading icon management system...'
                className='text-cli-light-gray'
                speed={50}
              />
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~/icon-management$ ./manage --branding'>
        <div className='p-6'>
          <div className='mb-6 flex items-center space-x-4'>
            <div className='cli-terminal h-12 w-12 animate-pulse-golden p-2'>
              <PhotoIcon className='h-full w-full text-primary-500' />
            </div>
            <div>
              <h1 className='cli-glow font-mono text-2xl font-bold text-cli-white'>
                Icon Management System
              </h1>
              <p className='font-mono text-cli-light-gray'>
                Manage application branding and icons dynamically
              </p>
            </div>
            <CliBadge variant='info'>BRANDING</CliBadge>
          </div>

          {/* Status Messages */}
          {message && (
            <div
              className={`mb-6 rounded-md border p-4 ${
                messageType === 'success'
                  ? 'border-green-500/30 bg-green-500/10 text-green-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              <div className='flex items-center space-x-2'>
                {messageType === 'success' ? (
                  <CheckCircleIcon className='h-5 w-5' />
                ) : (
                  <ExclamationCircleIcon className='h-5 w-5' />
                )}
                <span className='font-mono'>{message}</span>
              </div>
            </div>
          )}

          <div className='grid gap-8 lg:grid-cols-2'>
            {/* Current Icons Display */}
            <div className='space-y-6'>
              <div className='cli-terminal p-4'>
                <div className='mb-4 font-mono text-sm text-cli-green'>$ ./icons --current</div>
                <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>
                  Current Configuration
                </h3>

                <div className='space-y-4'>
                  {/* Favicon */}
                  <div className='flex items-center space-x-4 rounded-md bg-cli-darker/50 p-3'>
                    <img
                      src={iconConfig.favicon}
                      alt='Favicon'
                      className='h-8 w-8 rounded border border-cli-gray'
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className='flex-1'>
                      <div className='font-mono font-medium text-cli-white'>Favicon (32x32)</div>
                      <div className='font-mono text-sm text-cli-light-gray'>
                        {iconConfig.favicon}
                      </div>
                    </div>
                  </div>

                  {/* Logo */}
                  <div className='flex items-center space-x-4 rounded-md bg-cli-darker/50 p-3'>
                    <img
                      src={iconConfig.logo}
                      alt='Logo'
                      className='h-12 w-12 rounded border border-cli-gray'
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className='flex-1'>
                      <div className='font-mono font-medium text-cli-white'>Logo (128x128)</div>
                      <div className='font-mono text-sm text-cli-light-gray'>{iconConfig.logo}</div>
                    </div>
                  </div>

                  {/* Other Icons */}
                  {iconConfig.icons &&
                    Object.entries(iconConfig.icons).map(([size, url]) => (
                      <div
                        key={size}
                        className='flex items-center space-x-4 rounded-md bg-cli-darker/50 p-3'
                      >
                        <img
                          src={url}
                          alt={`Icon ${size}`}
                          className='h-10 w-10 rounded border border-cli-gray'
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className='flex-1'>
                          <div className='font-mono font-medium text-cli-white'>Icon {size}</div>
                          <div className='font-mono text-sm text-cli-light-gray'>{url}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Upload and Settings */}
            <div className='space-y-6'>
              <div className='cli-terminal p-4'>
                <div className='mb-4 font-mono text-sm text-cli-green'>$ ./icons --upload</div>
                <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>
                  Upload New Icons
                </h3>

                {/* File Upload Inputs */}
                <div className='space-y-4'>
                  <div>
                    <label className='mb-2 block font-mono text-sm font-medium text-cli-light-gray'>
                      Favicon (16x16 or 32x32)
                    </label>
                    <input
                      type='file'
                      name='favicon'
                      accept='image/*'
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className='block w-full rounded-md border border-cli-gray
                        bg-cli-darker p-2 font-mono text-sm text-cli-light-gray 
                        file:mr-4 file:rounded file:border 
                        file:border-0 file:border-primary-500/30
                        file:bg-primary-500/20 file:px-4 file:py-2
                        file:font-mono file:text-sm file:font-semibold file:text-primary-400 hover:file:bg-primary-500/30'
                    />
                  </div>

                  <div>
                    <label className='mb-2 block font-mono text-sm font-medium text-cli-light-gray'>
                      Logo (128x128 recommended)
                    </label>
                    <input
                      type='file'
                      name='logo'
                      accept='image/*'
                      onChange={handleFileUpload}
                      disabled={uploading}
                      className='block w-full rounded-md border border-cli-gray
                        bg-cli-darker p-2 font-mono text-sm text-cli-light-gray 
                        file:mr-4 file:rounded file:border 
                        file:border-0 file:border-primary-500/30
                        file:bg-primary-500/20 file:px-4 file:py-2
                        file:font-mono file:text-sm file:font-semibold file:text-primary-400 hover:file:bg-primary-500/30'
                    />
                  </div>

                  <div className='grid grid-cols-2 gap-4'>
                    <div>
                      <label className='mb-2 block font-mono text-sm font-medium text-cli-light-gray'>
                        Icon 16x16
                      </label>
                      <input
                        type='file'
                        name='icon16'
                        accept='image/*'
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className='block w-full rounded-md border border-cli-gray
                          bg-cli-darker p-2 font-mono text-sm text-cli-light-gray 
                          file:mr-4 file:rounded file:border 
                          file:border-0 file:border-primary-500/30
                          file:bg-primary-500/20 file:px-4 file:py-2
                          file:font-mono file:text-xs file:font-semibold file:text-primary-400 hover:file:bg-primary-500/30'
                      />
                    </div>
                    <div>
                      <label className='mb-2 block font-mono text-sm font-medium text-cli-light-gray'>
                        Icon 32x32
                      </label>
                      <input
                        type='file'
                        name='icon32'
                        accept='image/*'
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className='block w-full rounded-md border border-cli-gray
                          bg-cli-darker p-2 font-mono text-sm text-cli-light-gray 
                          file:mr-4 file:rounded file:border 
                          file:border-0 file:border-primary-500/30
                          file:bg-primary-500/20 file:px-4 file:py-2
                          file:font-mono file:text-xs file:font-semibold file:text-primary-400 hover:file:bg-primary-500/30'
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings Form */}
              <div className='cli-terminal p-4'>
                <div className='mb-4 font-mono text-sm text-cli-green'>
                  $ ./settings --configure
                </div>
                <h4 className='mb-4 font-mono font-medium text-cli-white'>Application Settings</h4>

                <div className='space-y-4'>
                  <div>
                    <label className='mb-2 block font-mono text-sm font-medium text-cli-light-gray'>
                      App Title
                    </label>
                    <input
                      type='text'
                      value={settings.title}
                      onChange={e => setSettings(prev => ({ ...prev, title: e.target.value }))}
                      className='w-full rounded-md border border-cli-gray bg-cli-darker px-3 py-2 
                        font-mono text-cli-white focus:border-primary-500 focus:outline-none focus:ring-2
                        focus:ring-primary-500/50'
                      placeholder='MockMate - AI-powered Interview Platform'
                    />
                  </div>

                  <button
                    onClick={handleSettingsUpdate}
                    disabled={uploading}
                    className='w-full rounded-md border border-primary-500/30 bg-primary-500/20
                      px-4 py-2 font-mono font-medium text-primary-400 transition-colors 
                      hover:bg-primary-500/30 disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    {uploading ? (
                      <div className='flex items-center justify-center space-x-2'>
                        <ArrowUpTrayIcon className='h-4 w-4 animate-spin' />
                        <span>Updating...</span>
                      </div>
                    ) : (
                      'Update Settings'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Available Icons Gallery */}
          {availableIcons.length > 0 && (
            <div className='cli-terminal mt-8 p-4'>
              <div className='mb-4 font-mono text-sm text-cli-green'>$ ./icons --gallery</div>
              <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>
                Available Icons
              </h3>
              <div className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
                {availableIcons.map(icon => (
                  <div key={icon.filename} className='group relative'>
                    <img
                      src={icon.url}
                      alt={icon.filename}
                      className='h-16 w-16 cursor-pointer rounded-lg border border-cli-gray 
                        object-cover transition-colors hover:border-primary-500'
                      onClick={() => selectIconFromAvailable(icon.url, 'app_favicon')}
                    />
                    <div
                      className='absolute inset-0 rounded-lg bg-black bg-opacity-0 
                      transition-opacity group-hover:bg-opacity-20'
                    ></div>
                    <div className='mt-1 truncate font-mono text-xs text-cli-light-gray'>
                      {icon.filename}
                    </div>
                  </div>
                ))}
              </div>
              <p className='mt-4 font-mono text-sm text-cli-light-gray'>
                Click on any icon to use it as the favicon. Upload more icons using the form above.
              </p>
            </div>
          )}
        </div>
      </TerminalWindow>
    </div>
  );
};

export default IconManagement;
