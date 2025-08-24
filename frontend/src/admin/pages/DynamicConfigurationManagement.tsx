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
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface ConfigItem {
  key: string;
  value: any;
  type: string;
  description: string;
  category: string;
  isSensitive: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  name: string;
  configCount: number;
}

interface ConfigurationStats {
  totalConfigurations: number;
  publicConfigurations: number;
  sensitiveConfigurations: number;
  totalCategories: number;
}

const DynamicConfigurationManagement: React.FC = () => {
  const { token } = useAdminAuth();
  const [configurations, setConfigurations] = useState<{
    [category: string]: { [key: string]: ConfigItem };
  }>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<ConfigurationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [editingConfigs, setEditingConfigs] = useState<{ [key: string]: any }>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showSensitive, setShowSensitive] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'public' | 'sensitive'>('all');

  const categoryIcons: { [key: string]: any } = {
    server: ServerIcon,
    database: CircleStackIcon,
    redis: CircleStackIcon,
    auth: ShieldCheckIcon,
    oauth: ShieldCheckIcon,
    email: EnvelopeIcon,
    ai: WrenchScrewdriverIcon,
    upload: DocumentArrowUpIcon,
    security: ShieldCheckIcon,
    frontend: CogIcon,
    payment: CreditCardIcon,
    general: CogIcon,
  };

  useEffect(() => {
    fetchConfigurations();
  }, []);

  const fetchConfigurations = async () => {
    setLoading(true);
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/dynamic-config?include_sensitive=true`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setConfigurations(result.data.configurations || {});
          setCategories(result.data.categories || []);
          setStats(result.data.stats || null);
          setEditingConfigs({});

          // Set first category as active if none selected
          if (!activeCategory && result.data.categories?.length > 0) {
            setActiveCategory(result.data.categories[0].name);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch configurations:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async (key: string, value: any, reason?: string) => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/dynamic-config/${key}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value, reason }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Update local state
          setConfigurations(prev => {
            const newState = { ...prev };
            Object.keys(newState).forEach(category => {
              if (newState[category][key]) {
                newState[category][key].value = value;
                newState[category][key].updatedAt = new Date().toISOString();
              }
            });
            return newState;
          });

          // Clear from editing state
          setEditingConfigs(prev => {
            const newState = { ...prev };
            delete newState[key];
            return newState;
          });

          return { success: true };
        }
      }
      throw new Error('Failed to save configuration');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      return { success: false, error: error.message };
    }
  };

  const batchSaveConfigurations = async () => {
    setSaving(true);
    const updates = Object.entries(editingConfigs).map(([key, value]) => ({
      key,
      value,
    }));

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/dynamic-config/batch-update`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configurations: updates,
          reason: 'Batch update from admin panel',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await fetchConfigurations(); // Refresh all data
          alert(`Successfully updated ${result.data.succeeded.length} configurations`);
        } else {
          alert(`Some updates failed: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('Failed to batch save:', error);
      alert('Failed to save configurations');
    } finally {
      setSaving(false);
    }
  };

  const reloadConfigurations = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/dynamic-config/reload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        await fetchConfigurations();
        alert('Configuration cache reloaded successfully');
      }
    } catch (error) {
      console.error('Failed to reload:', error);
      alert('Failed to reload configurations');
    }
  };

  const exportConfigurations = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBaseUrl}/admin/dynamic-config/export?include_sensitive=false`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `configurations-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export:', error);
      alert('Failed to export configurations');
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    setEditingConfigs(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetChanges = () => {
    setEditingConfigs({});
  };

  const hasChanges = () => {
    return Object.keys(editingConfigs).length > 0;
  };

  const togglePasswordVisibility = (key: string) => {
    setVisiblePasswords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const getFilteredConfigs = () => {
    const categoryConfigs = configurations[activeCategory] || {};
    let filtered = Object.entries(categoryConfigs);

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        ([key, config]) =>
          key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          config.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply visibility filter
    if (filter === 'public') {
      filtered = filtered.filter(([, config]) => config.isPublic);
    } else if (filter === 'sensitive') {
      filtered = filtered.filter(([, config]) => config.isSensitive);
    }

    return filtered;
  };

  const renderConfigValue = (key: string, config: ConfigItem) => {
    const currentValue = editingConfigs[key] !== undefined ? editingConfigs[key] : config.value;
    const hasUnsavedChange = editingConfigs[key] !== undefined;

    if (config.isSensitive) {
      const isVisible = visiblePasswords.has(key);
      return (
        <div className='flex items-center space-x-2'>
          <CliInput
            type={isVisible ? 'text' : 'password'}
            value={currentValue || ''}
            onChange={e => handleConfigChange(key, e.target.value)}
            placeholder='Enter sensitive value'
            className='flex-1'
          />
          <button
            onClick={() => togglePasswordVisibility(key)}
            className='text-cli-light-gray transition-colors hover:text-primary-500'
          >
            {isVisible ? <EyeSlashIcon className='h-4 w-4' /> : <EyeIcon className='h-4 w-4' />}
          </button>
          {hasUnsavedChange && (
            <div className='h-2 w-2 animate-pulse rounded-full bg-cli-amber' title='Modified' />
          )}
        </div>
      );
    }

    if (config.type === 'boolean') {
      return (
        <div className='flex items-center space-x-4'>
          <label className='flex cursor-pointer items-center space-x-2'>
            <input
              type='checkbox'
              checked={currentValue === true || currentValue === 'true'}
              onChange={e => handleConfigChange(key, e.target.checked)}
              className='rounded border-cli-gray bg-cli-dark text-primary-500 focus:ring-primary-500 focus:ring-offset-cli-black'
            />
            <span className='font-mono text-sm text-cli-light-gray'>Enabled</span>
          </label>
          {hasUnsavedChange && (
            <div className='h-2 w-2 animate-pulse rounded-full bg-cli-amber' title='Modified' />
          )}
        </div>
      );
    }

    if (config.type === 'number') {
      return (
        <div className='flex items-center space-x-2'>
          <CliInput
            type='number'
            value={currentValue || ''}
            onChange={e => handleConfigChange(key, e.target.value)}
            placeholder='Enter number'
            className='flex-1'
          />
          {hasUnsavedChange && (
            <div className='h-2 w-2 animate-pulse rounded-full bg-cli-amber' title='Modified' />
          )}
        </div>
      );
    }

    // Default to text input
    return (
      <div className='flex items-center space-x-2'>
        <CliInput
          type='text'
          value={currentValue || ''}
          onChange={e => handleConfigChange(key, e.target.value)}
          placeholder='Enter value'
          className='flex-1'
        />
        {hasUnsavedChange && (
          <div className='h-2 w-2 animate-pulse rounded-full bg-cli-amber' title='Modified' />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./dynamic-config --loading'>
          <div className='p-6'>
            <TypingText
              text='Loading dynamic configuration system...'
              className='mb-4 text-xl font-semibold text-primary-500'
            />
            <div className='animate-pulse space-y-4'>
              <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
              <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
              <div className='h-4 w-2/3 rounded bg-cli-gray'></div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  const ActiveCategoryIcon = categoryIcons[activeCategory] || CogIcon;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./dynamic-config --manage --realtime'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <div className='bg-cli-terminal flex h-12 w-12 items-center justify-center rounded-full'>
                <CogIcon className='h-6 w-6 text-primary-500' />
              </div>
              <div>
                <TypingText
                  text='Dynamic Configuration Management'
                  className='font-mono text-xl font-bold text-primary-500'
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  Real-time configuration management system
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-4'>
              {hasChanges() && (
                <div className='flex items-center space-x-2'>
                  <div className='h-3 w-3 animate-pulse rounded-full bg-cli-amber'></div>
                  <span className='font-mono text-sm text-cli-amber'>
                    {Object.keys(editingConfigs).length} UNSAVED CHANGES
                  </span>
                </div>
              )}
              <div className='flex items-center space-x-2'>
                <div className='h-3 w-3 rounded-full bg-cli-green'></div>
                <span className='font-mono text-sm text-cli-green'>CONNECTED</span>
              </div>
            </div>
          </div>

          {/* Statistics */}
          {stats && (
            <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-4'>
              <CliCard>
                <div className='p-4 text-center'>
                  <div className='font-mono text-2xl font-bold text-primary-500'>
                    {stats.totalConfigurations}
                  </div>
                  <div className='font-mono text-sm text-cli-light-gray'>Total Configs</div>
                </div>
              </CliCard>
              <CliCard>
                <div className='p-4 text-center'>
                  <div className='font-mono text-2xl font-bold text-cli-green'>
                    {stats.publicConfigurations}
                  </div>
                  <div className='font-mono text-sm text-cli-light-gray'>Public</div>
                </div>
              </CliCard>
              <CliCard>
                <div className='p-4 text-center'>
                  <div className='font-mono text-2xl font-bold text-cli-amber'>
                    {stats.sensitiveConfigurations}
                  </div>
                  <div className='font-mono text-sm text-cli-light-gray'>Sensitive</div>
                </div>
              </CliCard>
              <CliCard>
                <div className='p-4 text-center'>
                  <div className='font-mono text-2xl font-bold text-cli-cyan'>
                    {stats.totalCategories}
                  </div>
                  <div className='font-mono text-sm text-cli-light-gray'>Categories</div>
                </div>
              </CliCard>
            </div>
          )}

          {/* Controls */}
          <div className='flex flex-wrap items-center justify-between gap-4'>
            <div className='flex items-center space-x-4'>
              <CliButton
                variant='secondary'
                onClick={reloadConfigurations}
                className='flex items-center space-x-2'
              >
                <ArrowPathIcon className='h-4 w-4' />
                <span>Reload</span>
              </CliButton>
              <CliButton
                variant='ghost'
                onClick={exportConfigurations}
                className='flex items-center space-x-2'
              >
                <DocumentArrowDownIcon className='h-4 w-4' />
                <span>Export</span>
              </CliButton>
            </div>

            {hasChanges() && (
              <div className='flex space-x-2'>
                <CliButton variant='secondary' onClick={resetChanges} disabled={saving}>
                  Reset Changes
                </CliButton>
                <CliButton
                  variant='primary'
                  onClick={batchSaveConfigurations}
                  disabled={saving}
                  isLoading={saving}
                >
                  {saving ? 'Saving...' : 'Save All Changes'}
                </CliButton>
              </div>
            )}
          </div>

          <div className='mt-4 font-mono text-sm text-cli-green'>
            $ ./config-manager --categories={categories.length} --total={stats?.totalConfigurations}{' '}
            --status=ready
          </div>
        </div>
      </TerminalWindow>

      {/* Category Selection */}
      <TerminalWindow title='admin@mockmate:~$ ls -la /etc/dynamic-config/'>
        <div className='p-6'>
          <div className='mb-4'>
            <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
              Configuration Categories
            </label>
            <div className='grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6'>
              {categories.map(category => {
                const IconComponent = categoryIcons[category.name] || CogIcon;
                return (
                  <button
                    key={category.name}
                    onClick={() => setActiveCategory(category.name)}
                    className={`flex items-center justify-center space-x-2 rounded p-3 font-mono text-sm transition-all ${
                      activeCategory === category.name
                        ? 'shadow-glow-primary bg-primary-500 text-cli-black'
                        : 'bg-cli-terminal border border-cli-gray text-cli-light-gray hover:bg-cli-gray'
                    }`}
                  >
                    <IconComponent className='h-4 w-4' />
                    <div className='flex flex-col items-start'>
                      <span className='truncate'>{category.name}</span>
                      <span className='text-xs opacity-75'>({category.configCount})</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Configuration Editor */}
      <TerminalWindow title={`admin@mockmate:~$ cat /etc/dynamic-config/${activeCategory}.conf`}>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <ActiveCategoryIcon className='h-5 w-5 text-primary-500' />
              <h3 className='font-mono text-lg font-bold text-primary-500'>
                {activeCategory} Configuration
              </h3>
            </div>

            {/* Search and Filter */}
            <div className='flex items-center space-x-4'>
              <div className='flex items-center space-x-2'>
                <MagnifyingGlassIcon className='h-4 w-4 text-cli-light-gray' />
                <CliInput
                  type='text'
                  placeholder='Search configs...'
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className='w-48'
                />
              </div>

              <select
                value={filter}
                onChange={e => setFilter(e.target.value as any)}
                className='rounded border border-cli-gray bg-cli-dark px-3 py-2 font-mono text-sm text-cli-white focus:border-primary-500 focus:outline-none'
              >
                <option value='all'>All Configs</option>
                <option value='public'>Public Only</option>
                <option value='sensitive'>Sensitive Only</option>
              </select>
            </div>
          </div>

          <div className='space-y-4'>
            {getFilteredConfigs().length === 0 ? (
              <div className='py-12 text-center'>
                <div className='mb-2 font-mono text-cli-light-gray'>
                  No configurations found matching your criteria
                </div>
                <div className='font-mono text-xs text-cli-green'>
                  $ find /etc/{activeCategory} -name "*.conf" | wc -l: 0
                </div>
              </div>
            ) : (
              getFilteredConfigs().map(([key, config]) => (
                <CliCard key={key} className='hover:shadow-glow-info transition-all'>
                  <div className='p-4'>
                    <div className='grid grid-cols-1 items-start gap-4 lg:grid-cols-12'>
                      <div className='lg:col-span-3'>
                        <div className='mb-1 flex items-center space-x-2'>
                          <div className='font-mono font-semibold text-cli-white'>{key}</div>
                          {config.isSensitive && (
                            <ShieldCheckIcon className='h-4 w-4 text-cli-amber' title='Sensitive' />
                          )}
                          {config.isPublic && (
                            <EyeIcon className='h-4 w-4 text-cli-green' title='Public' />
                          )}
                        </div>
                        {config.description && (
                          <div className='font-mono text-sm text-cli-light-gray'>
                            {config.description}
                          </div>
                        )}
                        <div className='mt-1 font-mono text-xs text-cli-cyan'>
                          Type: {config.type}
                        </div>
                      </div>

                      <div className='lg:col-span-7'>{renderConfigValue(key, config)}</div>

                      <div className='lg:col-span-2'>
                        <div className='font-mono text-sm'>
                          <div className='mb-1 text-cli-light-gray'>
                            Updated:{' '}
                            {config.updatedAt
                              ? new Date(config.updatedAt).toLocaleDateString()
                              : 'Never'}
                          </div>
                          <div className='flex flex-wrap gap-1'>
                            {config.isSensitive && (
                              <CliBadge variant='warning' size='sm'>
                                Sensitive
                              </CliBadge>
                            )}
                            {config.isPublic && (
                              <CliBadge variant='success' size='sm'>
                                Public
                              </CliBadge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className='mt-3 border-t border-cli-gray pt-3'>
                      <div className='font-mono text-xs text-cli-green'>
                        $ export {key}="
                        {config.isSensitive
                          ? '[REDACTED]'
                          : editingConfigs[key] !== undefined
                            ? editingConfigs[key]
                            : config.value}
                        "
                      </div>
                    </div>
                  </div>
                </CliCard>
              ))
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
                    {Object.keys(editingConfigs).length} configuration values have been modified.
                  </div>
                  <div className='mt-2 font-mono text-xs text-cli-cyan'>
                    Modified keys: {Object.keys(editingConfigs).join(', ')}
                  </div>
                </div>
                <div className='flex space-x-2'>
                  <CliButton variant='secondary' onClick={resetChanges}>
                    Reset
                  </CliButton>
                  <CliButton variant='primary' onClick={batchSaveConfigurations} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </CliButton>
                </div>
              </div>
            </div>
          )}

          <div className='mt-6 font-mono text-xs text-cli-green'>
            $ tail -f /var/log/dynamic-config.log | grep -E "UPDATE|CREATE|DELETE"
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
};

export default DynamicConfigurationManagement;
