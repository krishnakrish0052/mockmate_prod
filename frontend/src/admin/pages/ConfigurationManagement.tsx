import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
  CliSelect,
} from '../components/ui/CliComponents';
import {
  CogIcon,
  ServerIcon,
  CircleStackIcon,
  EnvelopeIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, createAuthHeaders } from '../utils/apiConfig';

interface ConfigItem {
  key: string;
  value: string;
  description: string;
  is_sensitive: boolean;
  updated_at: string;
  updated_by: string;
}

interface ApplicationConfig {
  [key: string]: ConfigItem;
}

const ConfigurationManagement: React.FC = () => {
  const [configs, setConfigs] = useState<{ [app: string]: ApplicationConfig }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeApp, setActiveApp] = useState('webapp_backend');
  const [activeCategory, setActiveCategory] = useState('system');
  const [editingConfigs, setEditingConfigs] = useState<{ [app: string]: ApplicationConfig }>({});
  const [regeneratingEnv, setRegeneratingEnv] = useState(false);

  const applications = [
    { id: 'webapp_backend', label: 'Web App Backend', icon: ServerIcon },
    { id: 'webapp_frontend', label: 'Web App Frontend', icon: CogIcon },
    { id: 'admin_panel', label: 'Admin Panel', icon: WrenchScrewdriverIcon },
    { id: 'desktop_app', label: 'Desktop App', icon: CircleStackIcon },
  ];

  const categories = [
    { id: 'system', label: 'System', icon: CogIcon, prefix: ['SYSTEM_', 'APP_', 'NODE_', 'PORT'] },
    { id: 'database', label: 'Database', icon: CircleStackIcon, prefix: ['DB_', 'DATABASE_'] },
    { id: 'email', label: 'Email', icon: EnvelopeIcon, prefix: ['EMAIL_', 'SMTP_', 'MAIL_'] },
    {
      id: 'payment',
      label: 'Payment',
      icon: CreditCardIcon,
      prefix: ['PAYMENT_', 'STRIPE_', 'PAYPAL_'],
    },
    {
      id: 'security',
      label: 'Security',
      icon: ShieldCheckIcon,
      prefix: ['JWT_', 'AUTH_', 'SECURITY_', 'SECRET_'],
    },
    {
      id: 'features',
      label: 'Features',
      icon: WrenchScrewdriverIcon,
      prefix: ['FEATURE_', 'ENABLE_'],
    },
  ];

  useEffect(() => {
    fetchConfigurations();
  }, []);

  const fetchConfigurations = async () => {
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/admin/config'), {
        headers: createAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setConfigs(result.data.configurations || {});
          setEditingConfigs(result.data.configurations || {});
        } else {
          console.error('Failed to fetch configurations:', result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to fetch configurations:', errorResult.message);
      }
    } catch (error) {
      console.error('Failed to fetch configurations:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfigurations = async () => {
    setSaving(true);
    try {
      // Get changes for the current application
      const currentConfig = configs[activeApp] || {};
      const editingConfig = editingConfigs[activeApp] || {};

      const updates = Object.keys(editingConfig)
        .filter(key => currentConfig[key]?.value !== editingConfig[key]?.value)
        .map(key => ({
          application: activeApp,
          key,
          value: editingConfig[key].value,
          description: editingConfig[key].description || '',
        }));

      if (updates.length === 0) {
        alert('No changes to save');
        return;
      }

      const response = await fetch(getApiUrl('/admin/config'), {
        method: 'PATCH',
        headers: createAuthHeaders(),
        body: JSON.stringify({ updates }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setConfigs(prev => ({
            ...prev,
            [activeApp]: editingConfig,
          }));
          alert('Configuration saved successfully!');
        } else {
          console.error('Failed to save configuration:', result.message);
          alert('Failed to save configuration: ' + result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to save configuration:', errorResult.message);
        alert('Failed to save configuration: ' + errorResult.message);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const regenerateEnvFile = async () => {
    setRegeneratingEnv(true);
    try {
      const response = await fetch(getApiUrl('/admin/config/regenerate-env'), {
        method: 'POST',
        headers: createAuthHeaders(),
        body: JSON.stringify({ application: activeApp }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert(
            `Environment file regenerated successfully for ${activeApp}!\nFile path: ${result.data.file_path}`
          );
        } else {
          console.error('Failed to regenerate env file:', result.message);
          alert('Failed to regenerate env file: ' + result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to regenerate env file:', errorResult.message);
        alert('Failed to regenerate env file: ' + errorResult.message);
      }
    } catch (error) {
      console.error('Failed to regenerate env file:', error);
      alert('Failed to regenerate env file');
    } finally {
      setRegeneratingEnv(false);
    }
  };

  const handleConfigChange = (key: string, value: string) => {
    setEditingConfigs(prev => ({
      ...prev,
      [activeApp]: {
        ...prev[activeApp],
        [key]: {
          ...prev[activeApp]?.[key],
          value: value,
        },
      },
    }));
  };

  const resetChanges = () => {
    setEditingConfigs(prev => ({
      ...prev,
      [activeApp]: { ...configs[activeApp] },
    }));
  };

  const hasChanges = () => {
    const currentConfig = configs[activeApp] || {};
    const editingConfig = editingConfigs[activeApp] || {};

    return Object.keys(editingConfig).some(
      key => currentConfig[key]?.value !== editingConfig[key]?.value
    );
  };

  const getConfigsByCategory = (category: string) => {
    const appConfig = editingConfigs[activeApp] || {};
    const categoryConfig = categories.find(cat => cat.id === category);

    if (!categoryConfig) return Object.entries(appConfig);

    return Object.entries(appConfig).filter(([key, _]) => {
      return categoryConfig.prefix.some(
        prefix => key.startsWith(prefix) || key.includes(prefix.replace('_', ''))
      );
    });
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./config --loading'>
          <div className='p-6'>
            <TypingText
              text='Loading system configurations...'
              className='mb-4 text-xl font-semibold text-primary-500'
            />
            <div className='animate-pulse space-y-4'>
              <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
              <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  const activeAppInfo = applications.find(app => app.id === activeApp);
  const activeCategoryInfo = categories.find(cat => cat.id === activeCategory);
  const ActiveAppIcon = activeAppInfo?.icon || CogIcon;
  const ActiveCategoryIcon = activeCategoryInfo?.icon || CogIcon;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./config --manage --interactive'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <div className='bg-cli-terminal flex h-12 w-12 items-center justify-center rounded-full'>
                <ActiveAppIcon className='h-6 w-6 text-primary-500' />
              </div>
              <div>
                <TypingText
                  text='Configuration Management System'
                  className='font-mono text-xl font-bold text-primary-500'
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  Managing configurations for {activeAppInfo?.label}
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-4'>
              {hasChanges() && (
                <div className='flex items-center space-x-2'>
                  <div className='h-3 w-3 animate-pulse rounded-full bg-cli-amber'></div>
                  <span className='font-mono text-sm text-cli-amber'>UNSAVED CHANGES</span>
                </div>
              )}
              <div className='flex items-center space-x-2'>
                <div className='h-3 w-3 rounded-full bg-cli-green'></div>
                <span className='font-mono text-sm text-cli-green'>CONNECTED</span>
              </div>
            </div>
          </div>

          {/* Application Selection */}
          <div className='mb-6'>
            <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
              Target Application
            </label>
            <div className='grid grid-cols-1 gap-2 md:grid-cols-4'>
              {applications.map(app => {
                const IconComponent = app.icon;
                return (
                  <button
                    key={app.id}
                    onClick={() => setActiveApp(app.id)}
                    className={`flex items-center space-x-2 rounded p-3 font-mono text-sm transition-all ${
                      activeApp === app.id
                        ? 'shadow-glow-primary bg-primary-500 text-white'
                        : 'bg-cli-terminal border border-cli-gray text-cli-light-gray hover:bg-cli-gray'
                    }`}
                  >
                    <IconComponent className='h-4 w-4' />
                    <span className='truncate'>{app.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Selection */}
          <div className='mb-6'>
            <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
              Configuration Category
            </label>
            <div className='flex space-x-2 overflow-x-auto'>
              {categories.map(category => {
                const IconComponent = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={`flex items-center space-x-2 whitespace-nowrap rounded px-4 py-2 font-mono text-sm transition-all ${
                      activeCategory === category.id
                        ? 'shadow-glow-primary bg-primary-500 text-white'
                        : 'bg-cli-terminal text-cli-light-gray hover:bg-cli-gray'
                    }`}
                  >
                    <IconComponent className='h-4 w-4' />
                    <span>{category.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className='font-mono text-sm text-cli-green'>
            $ ./config-manager --app={activeApp} --category={activeCategory} --edit
          </div>
        </div>
      </TerminalWindow>

      {/* Configuration Editor */}
      <TerminalWindow title={`admin@mockmate:~$ cat /etc/${activeApp}/${activeCategory}.conf`}>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <ActiveCategoryIcon className='h-5 w-5 text-primary-500' />
              <h3 className='font-mono text-lg font-bold text-primary-500'>
                {activeCategoryInfo?.label} Configuration
              </h3>
            </div>
            <div className='flex space-x-2'>
              <CliButton
                variant='secondary'
                onClick={resetChanges}
                disabled={!hasChanges() || saving}
              >
                Reset Changes
              </CliButton>
              <CliButton
                variant='primary'
                onClick={saveConfigurations}
                disabled={!hasChanges() || saving}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </CliButton>
              <CliButton
                variant='success'
                onClick={regenerateEnvFile}
                disabled={regeneratingEnv}
                className='flex items-center space-x-2'
              >
                <DocumentArrowUpIcon className='h-4 w-4' />
                <span>{regeneratingEnv ? 'Regenerating...' : 'Regenerate .env'}</span>
              </CliButton>
            </div>
          </div>

          <div className='space-y-4'>
            {getConfigsByCategory(activeCategory).length === 0 ? (
              <div className='py-12 text-center'>
                <div className='mb-2 font-mono text-cli-light-gray'>
                  No {activeCategory} configuration found for {activeAppInfo?.label}
                </div>
                <div className='font-mono text-xs text-cli-green'>
                  $ grep "{activeCategory}" {activeApp}.env | wc -l: 0
                </div>
              </div>
            ) : (
              getConfigsByCategory(activeCategory).map(
                ([key, configItem]: [string, ConfigItem]) => (
                  <CliCard key={key} className='hover:shadow-glow-info transition-all'>
                    <div className='p-4'>
                      <div className='grid grid-cols-1 items-center gap-4 lg:grid-cols-12'>
                        <div className='lg:col-span-3'>
                          <div className='mb-1 font-mono font-semibold text-cli-white'>{key}</div>
                          {configItem.description && (
                            <div className='font-mono text-sm text-cli-light-gray'>
                              {configItem.description}
                            </div>
                          )}
                        </div>

                        <div className='lg:col-span-6'>
                          {configItem.is_sensitive ? (
                            <CliInput
                              type='password'
                              value={configItem.value}
                              onChange={e => handleConfigChange(key, e.target.value)}
                              placeholder='Enter sensitive value'
                            />
                          ) : (
                            <CliInput
                              type='text'
                              value={configItem.value}
                              onChange={e => handleConfigChange(key, e.target.value)}
                              placeholder='Enter configuration value'
                            />
                          )}
                        </div>

                        <div className='lg:col-span-2'>
                          <div className='font-mono text-sm'>
                            {configItem.is_sensitive && (
                              <div className='mb-1 flex items-center space-x-1 text-cli-amber'>
                                <ShieldCheckIcon className='h-3 w-3' />
                                <span>Sensitive</span>
                              </div>
                            )}
                            <div className='text-cli-light-gray'>
                              Updated:{' '}
                              {configItem.updated_at
                                ? new Date(configItem.updated_at).toLocaleDateString()
                                : 'Never'}
                            </div>
                            {configItem.updated_by && (
                              <div className='text-xs text-cli-cyan'>
                                By: {configItem.updated_by}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className='lg:col-span-1'>
                          <div className='flex items-center justify-center'>
                            {configs[activeApp]?.[key]?.value !==
                              editingConfigs[activeApp]?.[key]?.value && (
                              <div
                                className='h-2 w-2 animate-pulse rounded-full bg-cli-amber'
                                title='Modified'
                              ></div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className='mt-3 border-t border-cli-gray pt-3'>
                        <div className='font-mono text-xs text-cli-green'>
                          $ export {key}="
                          {configItem.is_sensitive ? '[REDACTED]' : configItem.value}"
                        </div>
                      </div>
                    </div>
                  </CliCard>
                )
              )
            )}
          </div>

          {hasChanges() && (
            <div className='bg-cli-terminal mt-6 rounded border border-cli-amber p-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='mb-1 font-mono font-bold text-cli-amber'>
                    Unsaved Changes Detected
                  </div>
                  <div className='font-mono text-sm text-cli-light-gray'>
                    {
                      Object.keys(editingConfigs[activeApp] || {}).filter(
                        key =>
                          configs[activeApp]?.[key]?.value !==
                          editingConfigs[activeApp]?.[key]?.value
                      ).length
                    }{' '}
                    configuration values have been modified.
                  </div>
                </div>
                <div className='flex space-x-2'>
                  <CliButton variant='secondary' onClick={resetChanges}>
                    Reset
                  </CliButton>
                  <CliButton variant='primary' onClick={saveConfigurations} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </CliButton>
                </div>
              </div>
            </div>
          )}

          <div className='mt-6 font-mono text-xs text-cli-green'>
            $ tail -f /var/log/{activeApp}_config.log | grep -E "UPDATE|CREATE|DELETE"
          </div>
        </div>
      </TerminalWindow>

      {/* Environment File Status */}
      <TerminalWindow title={`admin@mockmate:~$ ls -la /etc/${activeApp}/.env`}>
        <div className='p-6'>
          <div className='mb-4 flex items-center justify-between'>
            <h3 className='font-mono font-bold text-primary-500'>Environment File Status</h3>
            <CliBadge variant='success'>SYNCED</CliBadge>
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <CliCard>
              <div className='p-4 text-center'>
                <div className='font-mono text-2xl font-bold text-cli-green'>
                  {Object.keys(configs[activeApp] || {}).length}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Total Variables</div>
              </div>
            </CliCard>

            <CliCard>
              <div className='p-4 text-center'>
                <div className='font-mono text-2xl font-bold text-cli-amber'>
                  {Object.values(configs[activeApp] || {}).filter(item => item.is_sensitive).length}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Sensitive Variables</div>
              </div>
            </CliCard>

            <CliCard>
              <div className='p-4 text-center'>
                <div className='font-mono text-2xl font-bold text-cli-cyan'>
                  {configs[activeApp]
                    ? new Date(
                        Math.max(
                          ...Object.values(configs[activeApp]).map(item =>
                            new Date(item.updated_at).getTime()
                          )
                        )
                      ).toLocaleDateString()
                    : 'N/A'}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Last Updated</div>
              </div>
            </CliCard>
          </div>

          <div className='mt-4 font-mono text-xs text-cli-green'>
            $ file /etc/{activeApp}/.env && wc -l /etc/{activeApp}/.env
          </div>
          <div className='mt-1 pl-6 font-mono text-xs text-cli-light-gray'>
            /etc/{activeApp}/.env: ASCII text, {Object.keys(configs[activeApp] || {}).length} lines
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
};

export default ConfigurationManagement;
