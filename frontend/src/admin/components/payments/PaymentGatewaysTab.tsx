import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
  CliModal,
} from '../ui/CliComponents';
import {
  CreditCardIcon,
  CogIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, createAuthHeaders } from '../../utils/apiConfig';

interface PaymentGateway {
  id: string;
  provider_name: string;
  display_name: string;
  is_active: boolean;
  is_test_mode: boolean;
  priority: number;
  supported_currencies: string[];
  supported_countries: string[];
  configuration: any;
  webhook_url: string;
  health_status: string;
  last_health_check: string;
  created_at: string;
  updated_at: string;
}

interface GatewayConfig {
  stripe?: {
    secret_key: string;
    publishable_key: string;
    webhook_secret: string;
  };
  cashfree?: {
    app_id: string;
    secret_key: string;
    is_test_mode: boolean;
  };
}

const PaymentGatewaysTab: React.FC = () => {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configuration, setConfiguration] = useState<GatewayConfig>({});
  const [showSecrets, setShowSecrets] = useState<{ [key: string]: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchGateways();
  }, []);

  const fetchGateways = async () => {
    try {
      const response = await fetch(getApiUrl('/admin/payment-configs'), {
        headers: createAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setGateways(result.data.configs || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch payment gateways:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleGatewayStatus = async (gateway: PaymentGateway, isActive: boolean) => {
    try {
      const response = await fetch(getApiUrl(`/admin/payment-configs/${gateway.id}/toggle-status`), {
        method: 'POST',
        headers: createAuthHeaders(),
        body: JSON.stringify({ is_active: isActive }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setGateways(prev =>
            prev.map(g => (g.id === gateway.id ? { ...g, is_active: isActive } : g))
          );
        }
      }
    } catch (error) {
      console.error('Failed to toggle gateway status:', error);
    }
  };

  const testGatewayConnection = async (gateway: PaymentGateway) => {
    setTesting(prev => ({ ...prev, [gateway.id]: true }));
    
    try {
      const response = await fetch(getApiUrl(`/admin/payment-configs/${gateway.id}/test`), {
        method: 'POST',
        headers: createAuthHeaders(),
      });

      const result = await response.json();
      
      if (result.success) {
        // Show success notification
        alert(`${gateway.display_name} connection test passed!`);
      } else {
        alert(`${gateway.display_name} connection test failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Failed to test gateway connection:', error);
      alert(`Failed to test ${gateway.display_name} connection`);
    } finally {
      setTesting(prev => ({ ...prev, [gateway.id]: false }));
    }
  };

  const openConfigModal = (gateway: PaymentGateway) => {
    setSelectedGateway(gateway);
    setConfiguration(gateway.configuration || {});
    setConfigModalOpen(true);
  };

  const closeConfigModal = () => {
    setSelectedGateway(null);
    setConfiguration({});
    setConfigModalOpen(false);
    setShowSecrets({});
  };

  const saveConfiguration = async () => {
    if (!selectedGateway) return;

    setSaving(true);
    try {
      const response = await fetch(getApiUrl(`/admin/payment-configs/${selectedGateway.id}`), {
        method: 'PUT',
        headers: createAuthHeaders(),
        body: JSON.stringify({
          configuration,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setGateways(prev =>
            prev.map(g =>
              g.id === selectedGateway.id ? { ...g, configuration } : g
            )
          );
          closeConfigModal();
        }
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateConfiguration = (gateway: string, field: string, value: string | boolean) => {
    setConfiguration(prev => ({
      ...prev,
      [gateway]: {
        ...prev[gateway as keyof GatewayConfig],
        [field]: value,
      },
    }));
  };

  const toggleSecretVisibility = (field: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const getGatewayIcon = (gatewayName: string) => {
    switch (gatewayName.toLowerCase()) {
      case 'stripe':
        return '💳';
      case 'cashfree':
        return '🇮🇳';
      default:
        return '💰';
    }
  };

  const getHealthStatusBadge = (gateway: PaymentGateway) => {
    if (!gateway.health_status) {
      return <CliBadge variant="warning">UNKNOWN</CliBadge>;
    }
    
    switch (gateway.health_status) {
      case 'pass':
      case 'healthy':
        return <CliBadge variant="success">HEALTHY</CliBadge>;
      case 'fail':
      case 'unhealthy':
        return <CliBadge variant="danger">UNHEALTHY</CliBadge>;
      case 'warn':
      case 'degraded':
        return <CliBadge variant="warning">DEGRADED</CliBadge>;
      default:
        return <CliBadge variant="warning">UNKNOWN</CliBadge>;
    }
  };

  const getStatusBadge = (gateway: PaymentGateway) => {
    if (gateway.is_active) {
      return <CliBadge variant="success">ACTIVE</CliBadge>;
    }
    return <CliBadge variant="danger">INACTIVE</CliBadge>;
  };

  const getTestModeBadge = (gateway: PaymentGateway) => {
    if (gateway.is_test_mode) {
      return <CliBadge variant="warning">TEST</CliBadge>;
    }
    return <CliBadge variant="success">LIVE</CliBadge>;
  };

  if (loading) {
    return (
      <div className="p-6">
        <TerminalWindow title="admin@mockmate:~$ ./payment-gateways --loading">
          <div className="p-6">
            <TypingText
              text="Loading payment gateways..."
              className="text-primary-500 mb-4"
            />
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-cli-gray rounded w-3/4"></div>
              <div className="h-4 bg-cli-gray rounded w-1/2"></div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <TerminalWindow title="admin@mockmate:~$ ./payment-gateways --manage">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <TypingText
                text="Payment Gateway Management"
                className="text-2xl font-bold text-primary-500 mb-2"
              />
              <p className="text-cli-light-gray font-mono text-sm">
                Configure and manage payment providers for credit purchases
              </p>
            </div>
            <CliButton
              variant="secondary"
              onClick={fetchGateways}
              className="inline-flex items-center"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Refresh
            </CliButton>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gateways.map((gateway) => (
              <CliCard
                key={gateway.id}
                className="transition-all hover:shadow-glow-golden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">
                        {getGatewayIcon(gateway.provider_name)}
                      </span>
                      <div>
                        <h3 className="font-mono font-bold text-cli-white text-lg">
                          {gateway.display_name}
                        </h3>
                        <p className="text-cli-light-gray font-mono text-sm">
                          Priority: {gateway.priority}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(gateway)}
                      {getTestModeBadge(gateway)}
                      {getHealthStatusBadge(gateway)}
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between">
                      <span className="text-cli-light-gray font-mono text-sm">
                        Supported Currencies:
                      </span>
                      <span className="text-cli-white font-mono text-sm">
                        {gateway.supported_currencies?.join(', ') || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cli-light-gray font-mono text-sm">
                        Supported Countries:
                      </span>
                      <span className="text-cli-white font-mono text-sm">
                        {gateway.supported_countries?.join(', ') || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cli-light-gray font-mono text-sm">
                        Webhook URL:
                      </span>
                      <span className="text-cli-green font-mono text-xs break-all">
                        {gateway.webhook_url}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <CliButton
                      variant={gateway.is_active ? 'danger' : 'success'}
                      size="sm"
                      onClick={() => toggleGatewayStatus(gateway, !gateway.is_active)}
                      className="inline-flex items-center"
                    >
                      {gateway.is_active ? (
                        <XCircleIcon className="w-4 h-4 mr-1" />
                      ) : (
                        <CheckCircleIcon className="w-4 h-4 mr-1" />
                      )}
                      {gateway.is_active ? 'Disable' : 'Enable'}
                    </CliButton>

                    <CliButton
                      variant="secondary"
                      size="sm"
                      onClick={() => openConfigModal(gateway)}
                      className="inline-flex items-center"
                    >
                      <CogIcon className="w-4 h-4 mr-1" />
                      Configure
                    </CliButton>

                    <CliButton
                      variant="ghost"
                      size="sm"
                      onClick={() => testGatewayConnection(gateway)}
                      disabled={testing[gateway.id]}
                      className="inline-flex items-center"
                    >
                      {testing[gateway.id] ? (
                        <ArrowPathIcon className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                      )}
                      Test
                    </CliButton>
                  </div>
                </div>
              </CliCard>
            ))}
          </div>
        </div>
      </TerminalWindow>

      {/* Configuration Modal */}
      <CliModal
        isOpen={configModalOpen}
        onClose={closeConfigModal}
        title={`Configure ${selectedGateway?.display_name}`}
      >
        <div className="space-y-6">
          {selectedGateway?.provider_name === 'stripe' && (
            <div className="space-y-4">
              <h4 className="text-primary-500 font-mono font-bold">Stripe Configuration</h4>
              
              <div>
                <label className="block text-cli-light-gray font-mono text-sm mb-2">
                  Secret Key
                </label>
                <div className="relative">
                  <CliInput
                    type={showSecrets['stripe_secret'] ? 'text' : 'password'}
                    value={configuration.stripe?.secret_key || ''}
                    onChange={(e) => updateConfiguration('stripe', 'secret_key', e.target.value)}
                    placeholder="sk_test_..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretVisibility('stripe_secret')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-cli-light-gray hover:text-cli-white"
                  >
                    {showSecrets['stripe_secret'] ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-cli-light-gray font-mono text-sm mb-2">
                  Publishable Key
                </label>
                <CliInput
                  type="text"
                  value={configuration.stripe?.publishable_key || ''}
                  onChange={(e) => updateConfiguration('stripe', 'publishable_key', e.target.value)}
                  placeholder="pk_test_..."
                />
              </div>

              <div>
                <label className="block text-cli-light-gray font-mono text-sm mb-2">
                  Webhook Secret
                </label>
                <div className="relative">
                  <CliInput
                    type={showSecrets['stripe_webhook'] ? 'text' : 'password'}
                    value={configuration.stripe?.webhook_secret || ''}
                    onChange={(e) => updateConfiguration('stripe', 'webhook_secret', e.target.value)}
                    placeholder="whsec_..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretVisibility('stripe_webhook')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-cli-light-gray hover:text-cli-white"
                  >
                    {showSecrets['stripe_webhook'] ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedGateway?.provider_name === 'cashfree' && (
            <div className="space-y-4">
              <h4 className="text-primary-500 font-mono font-bold">Cashfree Configuration</h4>
              
              <div>
                <label className="block text-cli-light-gray font-mono text-sm mb-2">
                  App ID
                </label>
                <CliInput
                  type="text"
                  value={configuration.cashfree?.app_id || ''}
                  onChange={(e) => updateConfiguration('cashfree', 'app_id', e.target.value)}
                  placeholder="Your Cashfree App ID"
                />
              </div>

              <div>
                <label className="block text-cli-light-gray font-mono text-sm mb-2">
                  Secret Key
                </label>
                <div className="relative">
                  <CliInput
                    type={showSecrets['cashfree_secret'] ? 'text' : 'password'}
                    value={configuration.cashfree?.secret_key || ''}
                    onChange={(e) => updateConfiguration('cashfree', 'secret_key', e.target.value)}
                    placeholder="Your Cashfree Secret Key"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecretVisibility('cashfree_secret')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-cli-light-gray hover:text-cli-white"
                  >
                    {showSecrets['cashfree_secret'] ? (
                      <EyeSlashIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="cashfree_test_mode"
                  checked={configuration.cashfree?.is_test_mode || true}
                  onChange={(e) => updateConfiguration('cashfree', 'is_test_mode', e.target.checked)}
                  className="rounded bg-cli-darker border-cli-gray text-primary-500 focus:ring-primary-500"
                />
                <label htmlFor="cashfree_test_mode" className="text-cli-light-gray font-mono text-sm">
                  Test Mode (Sandbox)
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t border-cli-gray">
            <CliButton
              variant="secondary"
              onClick={closeConfigModal}
              disabled={saving}
            >
              Cancel
            </CliButton>
            <CliButton
              variant="primary"
              onClick={saveConfiguration}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </CliButton>
          </div>
        </div>
      </CliModal>
    </div>
  );
};

export default PaymentGatewaysTab;
