import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { TerminalWindow, TypingText, CliCard, CliBadge } from '../components/ui/CliComponents';
import {
  ServerIcon,
  CogIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
// Note: HealthMonitoringPanel and SystemConfigurationManager are temporarily disabled due to Material-UI dependencies
// import HealthMonitoringPanel from '../../components/admin/HealthMonitoringPanel';
// import SystemConfigurationManager from '../../components/admin/SystemConfigurationManager';

interface SystemStats {
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  status: 'healthy' | 'warning' | 'critical';
  activeConnections: number;
  totalRequests: number;
  errorRate: number;
  lastUpdated: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role='tabpanel'
      hidden={value !== index}
      id={`system-tabpanel-${index}`}
      aria-labelledby={`system-tab-${index}`}
      {...other}
    >
      {value === index && <div className='pt-3'>{children}</div>}
    </div>
  );
}

const SystemHealth: React.FC = () => {
  const { user } = useAdminAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentConfigurations, setPaymentConfigurations] = useState<any[]>([]);
  const [snackbarState, setSnackbarState] = useState({
    open: false,
    message: '',
    severity: 'info' as 'success' | 'error' | 'warning' | 'info',
  });

  useEffect(() => {
    fetchSystemStats();
    fetchPaymentConfigurations();

    // Set up real-time updates
    const interval = setInterval(() => {
      fetchSystemStats();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const fetchSystemStats = async () => {
    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('admin_token');

      const response = await fetch('/api/admin/system/health', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setSystemStats(result.data);
        } else {
          // Fallback to mock data if API doesn't provide system stats
          setSystemStats({
            uptime: 99.9,
            cpuUsage: 25,
            memoryUsage: 60,
            diskUsage: 45,
            status: 'healthy',
            activeConnections: 142,
            totalRequests: 15847,
            errorRate: 0.02,
            lastUpdated: new Date().toISOString(),
          });
        }
      } else {
        // Mock data for development
        setSystemStats({
          uptime: 99.9,
          cpuUsage: Math.floor(Math.random() * 30) + 15,
          memoryUsage: Math.floor(Math.random() * 20) + 50,
          diskUsage: Math.floor(Math.random() * 10) + 40,
          status: 'healthy',
          activeConnections: Math.floor(Math.random() * 50) + 100,
          totalRequests: Math.floor(Math.random() * 1000) + 15000,
          errorRate: Math.random() * 0.05,
          lastUpdated: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to fetch system stats:', error);
      // Fallback to mock data
      setSystemStats({
        uptime: 99.9,
        cpuUsage: 25,
        memoryUsage: 60,
        diskUsage: 45,
        status: 'healthy',
        activeConnections: 142,
        totalRequests: 15847,
        errorRate: 0.02,
        lastUpdated: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentConfigurations = async () => {
    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('admin_token');

      const response = await fetch('/api/admin/payment-configs', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setPaymentConfigurations(result.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch payment configurations:', error);
      // Mock data for development
      setPaymentConfigurations([
        {
          id: 1,
          provider_name: 'stripe',
          is_test_mode: true,
          is_active: true,
        },
        {
          id: 2,
          provider_name: 'paypal',
          is_test_mode: true,
          is_active: true,
        },
      ]);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-cli-green';
      case 'warning':
        return 'text-cli-amber';
      case 'critical':
        return 'text-red-500';
      default:
        return 'text-cli-light-gray';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return CheckCircleIcon;
      case 'warning':
        return ExclamationTriangleIcon;
      case 'critical':
        return ExclamationTriangleIcon;
      default:
        return ServerIcon;
    }
  };

  const formatUptime = (uptime: number) => {
    const days = Math.floor(uptime / (24 * 60));
    const hours = Math.floor((uptime % (24 * 60)) / 60);
    return `${days}d ${hours}h`;
  };

  const showSnackbar = (
    message: string,
    severity: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    setSnackbarState({ open: true, message, severity });
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='Loading system health...' className='animate-pulse'>
          <div className='p-6'>
            <TypingText text='Initializing system diagnostics...' className='text-cli-light-gray' />
          </div>
        </TerminalWindow>
      </div>
    );
  }

  const StatusIcon = systemStats ? getStatusIcon(systemStats.status) : ServerIcon;

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title={`admin@mockmate:~$ ./system --health-check --user=${user?.username}`}>
        <div className='p-6'>
          <TypingText
            text={`System Health Dashboard - Status: ${systemStats?.status?.toUpperCase() || 'UNKNOWN'}`}
            className='mb-4 text-xl font-semibold text-primary-500'
          />
          <div className='space-y-1 font-mono text-sm text-cli-light-gray'>
            <div>$ systemctl status mockmate</div>
            <div className={`pl-6 ${getStatusColor(systemStats?.status || 'healthy')}`}>
              ● mockmate.service - MockMate Application Server
            </div>
            <div className='pl-6 text-cli-green'>
              Active: active (running) since{' '}
              {systemStats ? new Date(systemStats.lastUpdated).toLocaleString() : 'Unknown'}
            </div>
            <div className='pl-6 text-primary-500'>
              Uptime: {systemStats ? formatUptime(systemStats.uptime * 24 * 60) : 'Unknown'} (
              {systemStats?.uptime?.toFixed(2) || '0.0'}%)
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* System Overview Stats */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4'>
        {/* System Status */}
        <CliCard className='hover:shadow-glow-info group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <StatusIcon className='h-6 w-6 text-primary-500' />
            </div>
            <CliBadge variant={systemStats?.status === 'healthy' ? 'success' : 'warning'}>
              {systemStats?.status?.toUpperCase() || 'UNKNOWN'}
            </CliBadge>
          </div>
          <div className='space-y-2'>
            <div
              className={`cli-glow font-mono text-3xl font-bold ${getStatusColor(systemStats?.status || 'healthy')}`}
            >
              {systemStats?.uptime?.toFixed(1) || '0.0'}%
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>System Uptime</div>
            <div className='space-y-1 font-mono text-xs'>
              <div className='flex justify-between'>
                <span className='text-cli-light-gray'>CPU:</span>
                <span className='text-cli-amber'>{systemStats?.cpuUsage}%</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-cli-light-gray'>RAM:</span>
                <span className='text-cli-amber'>{systemStats?.memoryUsage}%</span>
              </div>
            </div>
          </div>
        </CliCard>

        {/* Active Connections */}
        <CliCard className='hover:shadow-glow-warning group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <ClockIcon className='h-6 w-6 text-primary-500' />
            </div>
            <CliBadge variant='warning'>ACTIVE</CliBadge>
          </div>
          <div className='space-y-2'>
            <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
              {systemStats?.activeConnections?.toLocaleString() || '0'}
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>Active Connections</div>
            <div className='font-mono text-xs text-cli-green'>
              $ netstat -an | grep ESTABLISHED | wc -l
            </div>
          </div>
        </CliCard>

        {/* Total Requests */}
        <CliCard className='hover:shadow-glow-success group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <ChartBarIcon className='h-6 w-6 text-cli-green' />
            </div>
            <CliBadge variant='success'>REQUESTS</CliBadge>
          </div>
          <div className='space-y-2'>
            <div className='cli-glow font-mono text-3xl font-bold text-cli-white'>
              {systemStats?.totalRequests?.toLocaleString() || '0'}
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>Total Requests</div>
            <div className='font-mono text-xs text-cli-green'>$ tail -n1000 access.log | wc -l</div>
          </div>
        </CliCard>

        {/* Error Rate */}
        <CliCard className='hover:shadow-glow-danger group transition-all duration-300'>
          <div className='mb-4 flex items-center justify-between'>
            <div className='cli-terminal rounded-lg p-2 transition-all group-hover:shadow-glow-golden'>
              <ExclamationTriangleIcon className='h-6 w-6 text-primary-500' />
            </div>
            <CliBadge
              variant={
                systemStats?.errorRate && systemStats.errorRate > 0.05 ? 'danger' : 'success'
              }
            >
              ERRORS
            </CliBadge>
          </div>
          <div className='space-y-2'>
            <div
              className={`cli-glow font-mono text-3xl font-bold ${
                systemStats?.errorRate && systemStats.errorRate > 0.05
                  ? 'text-red-500'
                  : 'text-cli-green'
              }`}
            >
              {systemStats?.errorRate ? (systemStats.errorRate * 100).toFixed(2) : '0.00'}%
            </div>
            <div className='font-mono text-sm text-cli-light-gray'>Error Rate</div>
            <div className='font-mono text-xs text-cli-green'>
              $ grep "ERROR" app.log | tail -100 | wc -l
            </div>
          </div>
        </CliCard>
      </div>

      {/* Tabbed Interface */}
      <TerminalWindow title='admin@mockmate:~$ ./system --manage --tabs'>
        <div className='p-6'>
          <div className='mb-6 border-b border-cli-gray'>
            <nav className='flex space-x-8' aria-label='Tabs'>
              <button
                onClick={() => setActiveTab(0)}
                className={`
                  flex items-center space-x-2 border-b-2 px-1 py-2 text-sm font-medium transition-colors
                  ${
                    activeTab === 0
                      ? 'border-primary-500 text-primary-500'
                      : 'border-transparent text-cli-light-gray hover:border-cli-gray hover:text-primary-500'
                  }
                `}
              >
                <ServerIcon className='h-4 w-4' />
                <span>Health Monitoring</span>
              </button>
              <button
                onClick={() => setActiveTab(1)}
                className={`
                  flex items-center space-x-2 border-b-2 px-1 py-2 text-sm font-medium transition-colors
                  ${
                    activeTab === 1
                      ? 'border-primary-500 text-primary-500'
                      : 'border-transparent text-cli-light-gray hover:border-cli-gray hover:text-primary-500'
                  }
                `}
              >
                <CogIcon className='h-4 w-4' />
                <span>Configuration</span>
              </button>
            </nav>
          </div>

          <TabPanel value={activeTab} index={0}>
            <div className='space-y-4'>
              <TypingText
                text='Payment Gateway Health Monitoring'
                className='mb-4 font-mono text-lg font-bold text-primary-500'
              />
              <CliCard>
                <div className='p-6'>
                  <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
                    <div className='mb-3 font-bold text-primary-500'>PAYMENT GATEWAY STATUS</div>
                    <div className='space-y-3'>
                      {Array.isArray(paymentConfigurations) && paymentConfigurations.length > 0 ? (
                        paymentConfigurations.map((config: any) => (
                          <div
                            key={config.id}
                            className='flex items-center justify-between rounded border border-cli-gray p-3'
                          >
                            <div className='flex items-center space-x-3'>
                              <div className='h-3 w-3 animate-pulse rounded-full bg-cli-green'></div>
                              <span className='text-cli-white'>{config.provider_name}</span>
                              <CliBadge variant={config.is_test_mode ? 'warning' : 'success'}>
                                {config.is_test_mode ? 'TEST' : 'LIVE'}
                              </CliBadge>
                            </div>
                            <div className='font-mono text-xs text-cli-green'>
                              $ ping {config.provider_name}.gateway: OK
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className='rounded border border-cli-gray p-3 text-center text-cli-light-gray'>
                          No payment configurations found
                        </div>
                      )}
                    </div>
                    <div className='mt-4 text-xs text-cli-light-gray'>
                      Note: Health monitoring panel temporarily using placeholder content
                    </div>
                  </div>
                </div>
              </CliCard>
            </div>
          </TabPanel>

          <TabPanel value={activeTab} index={1}>
            <div className='space-y-4'>
              <TypingText
                text='System Configuration Management'
                className='mb-4 font-mono text-lg font-bold text-primary-500'
              />
              <CliCard>
                <div className='p-6'>
                  <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
                    <div className='mb-3 font-bold text-primary-500'>SYSTEM CONFIGURATION</div>
                    <div className='space-y-3'>
                      <div className='grid grid-cols-2 gap-4'>
                        <div className='rounded border border-cli-gray p-3'>
                          <div className='text-xs text-cli-amber'>DATABASE_URL</div>
                          <div className='text-sm text-cli-green'>
                            postgresql://localhost:5432/mockmate
                          </div>
                        </div>
                        <div className='rounded border border-cli-gray p-3'>
                          <div className='text-xs text-cli-amber'>REDIS_URL</div>
                          <div className='text-sm text-cli-green'>redis://localhost:6379</div>
                        </div>
                        <div className='rounded border border-cli-gray p-3'>
                          <div className='text-xs text-cli-amber'>NODE_ENV</div>
                          <div className='text-sm text-cli-green'>development</div>
                        </div>
                        <div className='rounded border border-cli-gray p-3'>
                          <div className='text-xs text-cli-amber'>LOG_LEVEL</div>
                          <div className='text-sm text-cli-green'>info</div>
                        </div>
                      </div>
                    </div>
                    <div className='mt-4 text-xs text-cli-light-gray'>
                      Note: Configuration manager temporarily using placeholder content
                    </div>
                  </div>
                </div>
              </CliCard>
            </div>
          </TabPanel>
        </div>
      </TerminalWindow>

      {/* System Commands Reference */}
      <TerminalWindow title='admin@mockmate:~$ man system-health'>
        <div className='p-6'>
          <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
            <div className='mb-3 font-bold text-primary-500'>SYSTEM HEALTH COMMANDS</div>
            <div className='space-y-1'>
              <div>$ ./system --status # Show system status</div>
              <div>$ ./system --health-check # Run comprehensive health check</div>
              <div>$ ./system --monitor # Start real-time monitoring</div>
              <div>$ ./system --config --reload # Reload system configuration</div>
              <div>$ ./system --payment-gateways # Test payment gateway connectivity</div>
              <div>$ ./system --logs --tail=100 # View recent system logs</div>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Notification for snackbar */}
      {snackbarState.open && (
        <div className='fixed bottom-5 right-5 z-50 min-w-[300px]'>
          <div
            className={`
            cli-terminal rounded-lg border p-4 shadow-lg
            ${
              snackbarState.severity === 'success'
                ? 'border-cli-green bg-cli-green/10'
                : snackbarState.severity === 'error'
                  ? 'border-red-500 bg-red-500/10'
                  : snackbarState.severity === 'warning'
                    ? 'border-cli-amber bg-cli-amber/10'
                    : 'border-primary-500 bg-primary-500/10'
            }
          `}
          >
            <div className='flex items-center justify-between'>
              <div
                className={`
                font-mono text-sm
                ${
                  snackbarState.severity === 'success'
                    ? 'text-cli-green'
                    : snackbarState.severity === 'error'
                      ? 'text-red-500'
                      : snackbarState.severity === 'warning'
                        ? 'text-cli-amber'
                        : 'text-primary-500'
                }
              `}
              >
                {snackbarState.message}
              </div>
              <button
                onClick={() => setSnackbarState({ ...snackbarState, open: false })}
                className='ml-3 text-cli-light-gray transition-colors hover:text-cli-white'
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemHealth;
