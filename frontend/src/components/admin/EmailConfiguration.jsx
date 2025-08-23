import React, { useState, useEffect } from 'react';
import {
  Settings,
  Mail,
  Server,
  Key,
  Zap,
  Clock,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Save,
  TestTube,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';

const EmailConfiguration = () => {
  const [activeTab, setActiveTab] = useState('provider');
  const [config, setConfig] = useState({
    provider: {
      type: 'sendgrid',
      settings: {},
      is_active: false,
    },
    automation: {
      enabled: true,
      rules: [],
    },
    general: {
      from_name: 'MockMate',
      from_email: 'noreply@mockmate.com',
      reply_to: 'support@mockmate.com',
      max_retries: 3,
      retry_delay: 300,
      queue_processing: true,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showSecrets, setShowSecrets] = useState({});

  useEffect(() => {
    fetchConfiguration();
  }, []);

  const fetchConfiguration = async () => {
    try {
      const response = await axios.get('/api/admin/email-config', {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      setConfig(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching configuration:', error);
      setLoading(false);
    }
  };

  const handleSaveConfiguration = async () => {
    setSaving(true);
    try {
      await axios.post('/api/admin/email-config', config, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      alert('Configuration saved successfully');
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Failed to save configuration');
    }
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await axios.post(
        '/api/admin/email-config/test',
        {
          provider: config.provider,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
        }
      );
      setTestResult({ success: true, message: response.data.message });
    } catch (error) {
      setTestResult({
        success: false,
        message: error.response?.data?.error || 'Connection test failed',
      });
    }
    setTesting(false);
  };

  const toggleSecretVisibility = field => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  if (loading) {
    return (
      <div className='flex min-h-64 items-center justify-center'>
        <div className='h-8 w-8 animate-spin rounded-full border-2 border-cli-amber border-t-transparent'></div>
      </div>
    );
  }

  return (
    <div className='cli-terminal min-h-screen bg-cli-darker p-6'>
      {/* Header */}
      <div className='mb-6 border-b border-cli-gray pb-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='mb-2 font-mono text-2xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> Email Configuration
            </h1>
            <p className='text-cli-light-gray'>
              Configure email providers, automation rules, and settings
            </p>
          </div>
          <button
            onClick={handleSaveConfiguration}
            disabled={saving}
            className='flex items-center gap-2 rounded bg-cli-amber px-4 py-2 font-medium text-cli-black transition-colors hover:bg-opacity-80 disabled:opacity-50'
          >
            {saving ? (
              <>
                <RefreshCw className='h-4 w-4 animate-spin' />
                Saving...
              </>
            ) : (
              <>
                <Save className='h-4 w-4' />
                Save Configuration
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className='mb-6 flex gap-1 rounded border border-cli-gray bg-cli-dark p-1'>
        {[
          { id: 'provider', label: 'Email Provider', icon: Server },
          { id: 'automation', label: 'Automation Rules', icon: Zap },
          { id: 'general', label: 'General Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-cli-amber text-cli-black'
                : 'text-cli-light-gray hover:bg-cli-gray hover:text-cli-white'
            }`}
          >
            <tab.icon className='h-4 w-4' />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className='space-y-6'
      >
        {activeTab === 'provider' && (
          <ProviderSettings
            config={config}
            setConfig={setConfig}
            onTest={handleTestConnection}
            testing={testing}
            testResult={testResult}
            showSecrets={showSecrets}
            toggleSecretVisibility={toggleSecretVisibility}
          />
        )}

        {activeTab === 'automation' && <AutomationSettings config={config} setConfig={setConfig} />}

        {activeTab === 'general' && <GeneralSettings config={config} setConfig={setConfig} />}
      </motion.div>
    </div>
  );
};

// Provider Settings Component
const ProviderSettings = ({
  config,
  setConfig,
  onTest,
  testing,
  testResult,
  showSecrets,
  toggleSecretVisibility,
}) => {
  const providers = [
    {
      id: 'sendgrid',
      name: 'SendGrid',
      description: 'Reliable email delivery service by Twilio',
      fields: [
        { key: 'api_key', label: 'API Key', type: 'password', required: true },
        {
          key: 'from_email_verified',
          label: 'Verified Sender Email',
          type: 'email',
          required: true,
        },
      ],
    },
    {
      id: 'ses',
      name: 'Amazon SES',
      description: 'Amazon Simple Email Service',
      fields: [
        { key: 'access_key_id', label: 'Access Key ID', type: 'password', required: true },
        { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
        {
          key: 'region',
          label: 'AWS Region',
          type: 'select',
          options: ['us-east-1', 'us-west-2', 'eu-west-1'],
          required: true,
        },
      ],
    },
    {
      id: 'smtp',
      name: 'SMTP',
      description: 'Generic SMTP server configuration',
      fields: [
        { key: 'host', label: 'SMTP Host', type: 'text', required: true },
        { key: 'port', label: 'Port', type: 'number', required: true, default: 587 },
        { key: 'secure', label: 'Use SSL/TLS', type: 'boolean', required: false },
        { key: 'username', label: 'Username', type: 'text', required: true },
        { key: 'password', label: 'Password', type: 'password', required: true },
      ],
    },
  ];

  const selectedProvider = providers.find(p => p.id === config.provider.type);

  const updateProviderSetting = (key, value) => {
    setConfig(prev => ({
      ...prev,
      provider: {
        ...prev.provider,
        settings: {
          ...prev.provider.settings,
          [key]: value,
        },
      },
    }));
  };

  const toggleProviderActive = () => {
    setConfig(prev => ({
      ...prev,
      provider: {
        ...prev.provider,
        is_active: !prev.provider.is_active,
      },
    }));
  };

  return (
    <div className='space-y-6'>
      {/* Provider Selection */}
      <div className='rounded border border-cli-gray bg-cli-dark p-6'>
        <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>Email Provider</h3>

        <div className='mb-6 grid gap-4'>
          {providers.map(provider => (
            <div
              key={provider.id}
              className={`cursor-pointer rounded border-2 p-4 transition-colors ${
                config.provider.type === provider.id
                  ? 'border-cli-amber bg-cli-amber bg-opacity-10'
                  : 'border-cli-gray hover:border-cli-light-gray'
              }`}
              onClick={() =>
                setConfig(prev => ({
                  ...prev,
                  provider: { ...prev.provider, type: provider.id, settings: {} },
                }))
              }
            >
              <div className='mb-2 flex items-center justify-between'>
                <h4 className='font-mono font-semibold text-cli-white'>{provider.name}</h4>
                {config.provider.type === provider.id && (
                  <CheckCircle className='h-5 w-5 text-cli-green' />
                )}
              </div>
              <p className='text-sm text-cli-light-gray'>{provider.description}</p>
            </div>
          ))}
        </div>

        {/* Provider Configuration */}
        {selectedProvider && (
          <div className='border-t border-cli-gray pt-6'>
            <div className='mb-4 flex items-center justify-between'>
              <h4 className='font-mono font-semibold text-cli-white'>
                {selectedProvider.name} Configuration
              </h4>
              <div className='flex items-center gap-2'>
                <button
                  onClick={toggleProviderActive}
                  className={`flex items-center gap-2 rounded px-3 py-1 text-sm font-medium transition-colors ${
                    config.provider.is_active
                      ? 'bg-cli-green text-cli-black'
                      : 'bg-cli-gray text-cli-white hover:bg-cli-light-gray'
                  }`}
                >
                  {config.provider.is_active ? (
                    <>
                      <CheckCircle className='h-4 w-4' />
                      Active
                    </>
                  ) : (
                    <>
                      <XCircle className='h-4 w-4' />
                      Inactive
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className='mb-4 grid gap-4'>
              {selectedProvider.fields.map(field => (
                <div key={field.key}>
                  <label className='mb-2 block text-sm font-medium text-cli-white'>
                    {field.label}
                    {field.required && <span className='text-cli-red ml-1'>*</span>}
                  </label>

                  {field.type === 'select' ? (
                    <select
                      value={config.provider.settings[field.key] || ''}
                      onChange={e => updateProviderSetting(field.key, e.target.value)}
                      className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
                    >
                      <option value=''>Select {field.label}</option>
                      {field.options.map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'boolean' ? (
                    <label className='flex cursor-pointer items-center gap-2'>
                      <input
                        type='checkbox'
                        checked={config.provider.settings[field.key] || false}
                        onChange={e => updateProviderSetting(field.key, e.target.checked)}
                        className='h-4 w-4 rounded border-cli-gray bg-cli-darker text-cli-amber focus:ring-cli-amber'
                      />
                      <span className='text-sm text-cli-white'>Enable {field.label}</span>
                    </label>
                  ) : field.type === 'password' ? (
                    <div className='relative'>
                      <input
                        type={showSecrets[field.key] ? 'text' : 'password'}
                        value={config.provider.settings[field.key] || ''}
                        onChange={e => updateProviderSetting(field.key, e.target.value)}
                        placeholder={`Enter ${field.label}`}
                        className='w-full rounded border border-cli-gray bg-cli-darker p-3 pr-10 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
                      />
                      <button
                        type='button'
                        onClick={() => toggleSecretVisibility(field.key)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 transform text-cli-light-gray hover:text-cli-white'
                      >
                        {showSecrets[field.key] ? (
                          <EyeOff className='h-4 w-4' />
                        ) : (
                          <Eye className='h-4 w-4' />
                        )}
                      </button>
                    </div>
                  ) : (
                    <input
                      type={field.type}
                      value={config.provider.settings[field.key] || field.default || ''}
                      onChange={e =>
                        updateProviderSetting(
                          field.key,
                          field.type === 'number' ? parseInt(e.target.value) : e.target.value
                        )
                      }
                      placeholder={`Enter ${field.label}`}
                      className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Test Connection */}
            <div className='flex items-center gap-4'>
              <button
                onClick={onTest}
                disabled={testing || !config.provider.is_active}
                className='flex items-center gap-2 rounded bg-cli-cyan px-4 py-2 text-cli-black transition-colors hover:bg-opacity-80 disabled:opacity-50'
              >
                {testing ? (
                  <>
                    <RefreshCw className='h-4 w-4 animate-spin' />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube className='h-4 w-4' />
                    Test Connection
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded px-3 py-1 ${
                    testResult.success
                      ? 'border border-cli-green bg-cli-green bg-opacity-20 text-cli-green'
                      : 'bg-cli-red text-cli-red border-cli-red border bg-opacity-20'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle className='h-4 w-4' />
                  ) : (
                    <XCircle className='h-4 w-4' />
                  )}
                  <span className='text-sm'>{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Automation Settings Component
const AutomationSettings = ({ config, setConfig }) => {
  const [newRule, setNewRule] = useState({
    name: '',
    trigger_event: '',
    template_id: '',
    delay_minutes: 0,
    conditions: {},
    is_active: true,
  });
  const [showAddRule, setShowAddRule] = useState(false);

  const triggerEvents = [
    { id: 'user_registered', name: 'User Registration', description: 'When a new user signs up' },
    {
      id: 'interview_scheduled',
      name: 'Interview Scheduled',
      description: 'When an interview is booked',
    },
    { id: 'interview_reminder', name: 'Interview Reminder', description: '24h before interview' },
    { id: 'interview_completed', name: 'Interview Completed', description: 'After interview ends' },
    { id: 'payment_failed', name: 'Payment Failed', description: 'When payment processing fails' },
    {
      id: 'subscription_expiring',
      name: 'Subscription Expiring',
      description: '7 days before expiry',
    },
  ];

  const addAutomationRule = () => {
    if (!newRule.name || !newRule.trigger_event) return;

    setConfig(prev => ({
      ...prev,
      automation: {
        ...prev.automation,
        rules: [...prev.automation.rules, { ...newRule, id: Date.now() }],
      },
    }));

    setNewRule({
      name: '',
      trigger_event: '',
      template_id: '',
      delay_minutes: 0,
      conditions: {},
      is_active: true,
    });
    setShowAddRule(false);
  };

  const removeAutomationRule = ruleId => {
    setConfig(prev => ({
      ...prev,
      automation: {
        ...prev.automation,
        rules: prev.automation.rules.filter(rule => rule.id !== ruleId),
      },
    }));
  };

  const toggleRuleActive = ruleId => {
    setConfig(prev => ({
      ...prev,
      automation: {
        ...prev.automation,
        rules: prev.automation.rules.map(rule =>
          rule.id === ruleId ? { ...rule, is_active: !rule.is_active } : rule
        ),
      },
    }));
  };

  return (
    <div className='space-y-6'>
      {/* Automation Toggle */}
      <div className='rounded border border-cli-gray bg-cli-dark p-6'>
        <div className='mb-4 flex items-center justify-between'>
          <div>
            <h3 className='mb-2 font-mono text-lg font-semibold text-cli-white'>
              Email Automation
            </h3>
            <p className='text-sm text-cli-light-gray'>
              Automatically send emails based on user actions and events
            </p>
          </div>
          <button
            onClick={() =>
              setConfig(prev => ({
                ...prev,
                automation: { ...prev.automation, enabled: !prev.automation.enabled },
              }))
            }
            className={`flex items-center gap-2 rounded px-4 py-2 font-medium transition-colors ${
              config.automation.enabled
                ? 'bg-cli-green text-cli-black'
                : 'bg-cli-gray text-cli-white hover:bg-cli-light-gray'
            }`}
          >
            {config.automation.enabled ? (
              <>
                <Zap className='h-4 w-4' />
                Enabled
              </>
            ) : (
              <>
                <XCircle className='h-4 w-4' />
                Disabled
              </>
            )}
          </button>
        </div>

        {!config.automation.enabled && (
          <div className='flex items-center gap-2 rounded border border-cli-amber bg-cli-amber bg-opacity-20 p-3'>
            <AlertTriangle className='h-4 w-4 text-cli-amber' />
            <span className='text-sm text-cli-amber'>Email automation is currently disabled</span>
          </div>
        )}
      </div>

      {/* Automation Rules */}
      <div className='rounded border border-cli-gray bg-cli-dark p-6'>
        <div className='mb-4 flex items-center justify-between'>
          <h3 className='font-mono text-lg font-semibold text-cli-white'>Automation Rules</h3>
          <button
            onClick={() => setShowAddRule(true)}
            className='flex items-center gap-2 rounded bg-cli-amber px-4 py-2 text-cli-black transition-colors hover:bg-opacity-80'
          >
            <Zap className='h-4 w-4' />
            Add Rule
          </button>
        </div>

        {/* Existing Rules */}
        <div className='space-y-4'>
          {config.automation.rules.map(rule => (
            <div key={rule.id} className='rounded border border-cli-gray p-4'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex items-center gap-3'>
                  <div
                    className={`h-2 w-2 rounded-full ${rule.is_active ? 'bg-cli-green' : 'bg-cli-light-gray'}`}
                  ></div>
                  <div>
                    <h4 className='font-mono font-semibold text-cli-white'>{rule.name}</h4>
                    <p className='text-sm text-cli-light-gray'>
                      Trigger: {triggerEvents.find(e => e.id === rule.trigger_event)?.name}
                      {rule.delay_minutes > 0 && ` • Delay: ${rule.delay_minutes} minutes`}
                    </p>
                  </div>
                </div>
                <div className='flex items-center gap-2'>
                  <button
                    onClick={() => toggleRuleActive(rule.id)}
                    className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                      rule.is_active
                        ? 'bg-cli-green text-cli-black'
                        : 'bg-cli-gray text-cli-white hover:bg-cli-light-gray'
                    }`}
                  >
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => removeAutomationRule(rule.id)}
                    className='text-cli-red rounded p-1 transition-colors hover:bg-cli-gray'
                  >
                    <XCircle className='h-4 w-4' />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {config.automation.rules.length === 0 && (
            <div className='py-8 text-center'>
              <Zap className='mx-auto mb-3 h-12 w-12 text-cli-light-gray' />
              <p className='text-cli-light-gray'>No automation rules configured</p>
              <p className='text-sm text-cli-light-gray'>Add your first rule to get started</p>
            </div>
          )}
        </div>

        {/* Add Rule Modal */}
        {showAddRule && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
            <div className='w-full max-w-md rounded-lg border border-cli-gray bg-cli-dark'>
              <div className='flex items-center justify-between border-b border-cli-gray p-4'>
                <h3 className='font-mono text-lg font-semibold text-cli-white'>
                  Add Automation Rule
                </h3>
                <button
                  onClick={() => setShowAddRule(false)}
                  className='p-2 text-cli-light-gray transition-colors hover:text-cli-white'
                >
                  ×
                </button>
              </div>

              <div className='space-y-4 p-4'>
                <div>
                  <label className='mb-2 block text-sm font-medium text-cli-white'>Rule Name</label>
                  <input
                    type='text'
                    value={newRule.name}
                    onChange={e => setNewRule({ ...newRule, name: e.target.value })}
                    placeholder='Welcome Email Rule'
                    className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
                  />
                </div>

                <div>
                  <label className='mb-2 block text-sm font-medium text-cli-white'>
                    Trigger Event
                  </label>
                  <select
                    value={newRule.trigger_event}
                    onChange={e => setNewRule({ ...newRule, trigger_event: e.target.value })}
                    className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
                  >
                    <option value=''>Select trigger event</option>
                    {triggerEvents.map(event => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className='mb-2 block text-sm font-medium text-cli-white'>
                    Delay (minutes)
                  </label>
                  <input
                    type='number'
                    value={newRule.delay_minutes}
                    onChange={e =>
                      setNewRule({ ...newRule, delay_minutes: parseInt(e.target.value) || 0 })
                    }
                    min='0'
                    className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
                  />
                </div>

                <div className='flex gap-3 pt-4'>
                  <button
                    onClick={() => setShowAddRule(false)}
                    className='flex-1 rounded border border-cli-gray px-4 py-2 text-cli-white transition-colors hover:bg-cli-gray'
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addAutomationRule}
                    className='flex-1 rounded bg-cli-amber px-4 py-2 text-cli-black transition-colors hover:bg-opacity-80'
                  >
                    Add Rule
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// General Settings Component
const GeneralSettings = ({ config, setConfig }) => {
  const updateGeneralSetting = (key, value) => {
    setConfig(prev => ({
      ...prev,
      general: {
        ...prev.general,
        [key]: value,
      },
    }));
  };

  return (
    <div className='space-y-6'>
      {/* Email Settings */}
      <div className='rounded border border-cli-gray bg-cli-dark p-6'>
        <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>
          Default Email Settings
        </h3>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <div>
            <label className='mb-2 block text-sm font-medium text-cli-white'>From Name</label>
            <input
              type='text'
              value={config.general.from_name}
              onChange={e => updateGeneralSetting('from_name', e.target.value)}
              className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-cli-white'>From Email</label>
            <input
              type='email'
              value={config.general.from_email}
              onChange={e => updateGeneralSetting('from_email', e.target.value)}
              className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
            />
          </div>
        </div>

        <div className='mt-4'>
          <label className='mb-2 block text-sm font-medium text-cli-white'>Reply-To Email</label>
          <input
            type='email'
            value={config.general.reply_to}
            onChange={e => updateGeneralSetting('reply_to', e.target.value)}
            className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
          />
        </div>
      </div>

      {/* Queue Settings */}
      <div className='rounded border border-cli-gray bg-cli-dark p-6'>
        <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>
          Queue & Retry Settings
        </h3>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <div>
            <label className='mb-2 block text-sm font-medium text-cli-white'>Max Retries</label>
            <input
              type='number'
              min='0'
              max='10'
              value={config.general.max_retries}
              onChange={e => updateGeneralSetting('max_retries', parseInt(e.target.value))}
              className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-cli-white'>
              Retry Delay (seconds)
            </label>
            <input
              type='number'
              min='0'
              value={config.general.retry_delay}
              onChange={e => updateGeneralSetting('retry_delay', parseInt(e.target.value))}
              className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
            />
          </div>

          <div className='flex items-end'>
            <label className='flex cursor-pointer items-center gap-2'>
              <input
                type='checkbox'
                checked={config.general.queue_processing}
                onChange={e => updateGeneralSetting('queue_processing', e.target.checked)}
                className='h-4 w-4 rounded border-cli-gray bg-cli-darker text-cli-amber focus:ring-cli-amber'
              />
              <span className='text-sm text-cli-white'>Enable queue processing</span>
            </label>
          </div>
        </div>

        <div className='mt-4 rounded border border-cli-gray bg-cli-darker p-3'>
          <div className='mb-2 flex items-center gap-2'>
            <Info className='h-4 w-4 text-cli-cyan' />
            <span className='text-sm font-medium text-cli-cyan'>Queue Information</span>
          </div>
          <p className='text-xs text-cli-light-gray'>
            Emails are queued for reliable delivery. Failed emails will be retried based on the
            settings above. Queue processing must be enabled for automatic email sending.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmailConfiguration;
