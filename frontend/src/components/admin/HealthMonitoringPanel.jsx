import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  PlayArrow,
  CheckCircle,
  Error,
  Warning,
  Refresh,
  ExpandMore,
  Speed,
  Security,
  Wifi,
  Payment,
  BugReport,
  Timeline,
  Settings,
} from '@mui/icons-material';

const HealthMonitoringPanel = ({ configurations, onConfigurationChange, showSnackbar }) => {
  const [loading, setLoading] = useState(false);
  const [healthResults, setHealthResults] = useState([]);
  const [testingConfigs, setTestingConfigs] = useState(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [bulkTesting, setBulkTesting] = useState(false);
  const [detailDialog, setDetailDialog] = useState({ open: false, result: null });

  const testTypes = [
    {
      value: 'connectivity',
      label: 'Connectivity',
      icon: <Wifi />,
      description: 'Test basic connection to provider',
    },
    {
      value: 'authentication',
      label: 'Authentication',
      icon: <Security />,
      description: 'Verify API credentials',
    },
    {
      value: 'full_transaction',
      label: 'Full Transaction',
      icon: <Payment />,
      description: 'Complete payment flow test',
    },
  ];

  const fetchHealthStatus = async () => {
    setLoading(true);
    try {
      const results = [];

      for (const config of configurations) {
        try {
          // Mock health check results for demonstration
          const mockResult = {
            configId: config.id,
            provider: config.provider_name,
            status: Math.random() > 0.2 ? 'pass' : 'fail',
            responseTime: Math.floor(Math.random() * 1000) + 100,
            lastChecked: new Date().toISOString(),
            tests: {
              connectivity: { status: 'pass', responseTime: 150, message: 'Connection successful' },
              authentication: { status: 'pass', responseTime: 200, message: 'Credentials valid' },
              api_limits: { status: 'pass', responseTime: 100, message: 'Within limits' },
              webhook: {
                status: Math.random() > 0.3 ? 'pass' : 'warning',
                responseTime: 300,
                message: 'Webhook endpoint reachable',
              },
            },
          };

          // Simulate some failures
          if (Math.random() < 0.1) {
            mockResult.status = 'fail';
            mockResult.tests.authentication.status = 'fail';
            mockResult.tests.authentication.message = 'Invalid credentials';
          }

          results.push(mockResult);
        } catch (error) {
          results.push({
            configId: config.id,
            provider: config.provider_name,
            status: 'fail',
            error: error.message,
            lastChecked: new Date().toISOString(),
          });
        }
      }

      setHealthResults(results);
    } catch (error) {
      console.error('Error fetching health status:', error);
      showSnackbar('Failed to fetch health status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runSingleTest = async (config, testType = 'connectivity') => {
    setTestingConfigs(prev => new Set(prev.add(config.id)));

    try {
      const response = await fetch(`/api/admin/payment-configs/${config.id}/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test_type: testType }),
      });

      if (response.ok) {
        const result = await response.json();
        showSnackbar(
          `Test ${result.data.status === 'pass' ? 'passed' : 'failed'} for ${config.provider_name}`
        );
        fetchHealthStatus(); // Refresh results
      } else {
        throw new Error('Test failed');
      }
    } catch (error) {
      console.error('Error running test:', error);
      showSnackbar(`Test failed for ${config.provider_name}`, 'error');
    } finally {
      setTestingConfigs(prev => {
        const newSet = new Set(prev);
        newSet.delete(config.id);
        return newSet;
      });
    }
  };

  const runBulkHealthCheck = async () => {
    setBulkTesting(true);

    try {
      const response = await fetch('/api/admin/payment-configs/bulk-health-check', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        showSnackbar(`Bulk health check completed: ${result.data.length} providers tested`);
        fetchHealthStatus();
      } else {
        throw new Error('Bulk health check failed');
      }
    } catch (error) {
      console.error('Error running bulk health check:', error);
      showSnackbar('Bulk health check failed', 'error');
    } finally {
      setBulkTesting(false);
    }
  };

  const toggleAutoRefresh = enabled => {
    setAutoRefresh(enabled);

    if (enabled) {
      const interval = setInterval(fetchHealthStatus, 30000); // Refresh every 30 seconds
      setRefreshInterval(interval);
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  };

  useEffect(() => {
    fetchHealthStatus();

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, []);

  const getStatusColor = status => {
    switch (status) {
      case 'pass':
        return 'success';
      case 'warning':
        return 'warning';
      case 'fail':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'pass':
        return <CheckCircle color='success' />;
      case 'warning':
        return <Warning color='warning' />;
      case 'fail':
        return <Error color='error' />;
      default:
        return <Error color='disabled' />;
    }
  };

  const calculateOverallHealth = () => {
    if (healthResults.length === 0) return { healthy: 0, warning: 0, unhealthy: 0 };

    return healthResults.reduce(
      (acc, result) => {
        if (result.status === 'pass') acc.healthy++;
        else if (result.status === 'warning') acc.warning++;
        else acc.unhealthy++;
        return acc;
      },
      { healthy: 0, warning: 0, unhealthy: 0 }
    );
  };

  const overallHealth = calculateOverallHealth();

  return (
    <Box>
      {/* Header */}
      <Box display='flex' justifyContent='space-between' alignItems='center' mb={3}>
        <Typography variant='h6'>Health Monitoring</Typography>
        <Box display='flex' gap={2} alignItems='center'>
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={e => toggleAutoRefresh(e.target.checked)}
                size='small'
              />
            }
            label='Auto Refresh'
          />
          <Button startIcon={<Refresh />} onClick={fetchHealthStatus} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant='contained'
            startIcon={bulkTesting ? <CircularProgress size={16} /> : <PlayArrow />}
            onClick={runBulkHealthCheck}
            disabled={bulkTesting || configurations.length === 0}
          >
            Run All Tests
          </Button>
        </Box>
      </Box>

      {/* Health Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display='flex' alignItems='center' justifyContent='space-between'>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Healthy Providers
                  </Typography>
                  <Typography variant='h4' color='success.main'>
                    {overallHealth.healthy}
                  </Typography>
                </Box>
                <CheckCircle color='success' sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display='flex' alignItems='center' justifyContent='space-between'>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Warning Providers
                  </Typography>
                  <Typography variant='h4' color='warning.main'>
                    {overallHealth.warning}
                  </Typography>
                </Box>
                <Warning color='warning' sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box display='flex' alignItems='center' justifyContent='space-between'>
                <Box>
                  <Typography variant='body2' color='text.secondary'>
                    Unhealthy Providers
                  </Typography>
                  <Typography variant='h4' color='error.main'>
                    {overallHealth.unhealthy}
                  </Typography>
                </Box>
                <Error color='error' sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Health Status Table */}
      <Card>
        <CardContent>
          <Typography variant='h6' gutterBottom>
            Provider Health Status
          </Typography>

          {loading ? (
            <Box display='flex' justifyContent='center' p={3}>
              <CircularProgress />
            </Box>
          ) : healthResults.length === 0 ? (
            <Alert severity='info'>
              No health check results available. Run a health check to see provider status.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Provider</TableCell>
                    <TableCell>Overall Status</TableCell>
                    <TableCell>Response Time</TableCell>
                    <TableCell>Last Checked</TableCell>
                    <TableCell>Test Results</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {healthResults.map(result => {
                    const config = configurations.find(c => c.id === result.configId);
                    return (
                      <TableRow key={result.configId}>
                        <TableCell>
                          <Box display='flex' alignItems='center' gap={1}>
                            <span style={{ fontSize: '20px' }}>
                              {result.provider === 'stripe'
                                ? '💳'
                                : result.provider === 'paypal'
                                  ? '🅿️'
                                  : result.provider === 'razorpay'
                                    ? '💰'
                                    : result.provider === 'square'
                                      ? '⬜'
                                      : '💳'}
                            </span>
                            <Box>
                              <Typography variant='body2' fontWeight='medium'>
                                {result.provider}
                              </Typography>
                              <Typography variant='caption' color='text.secondary'>
                                {config?.is_test_mode ? 'Test Mode' : 'Live Mode'}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display='flex' alignItems='center' gap={1}>
                            {getStatusIcon(result.status)}
                            <Chip
                              label={result.status?.toUpperCase() || 'UNKNOWN'}
                              color={getStatusColor(result.status)}
                              size='small'
                            />
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box display='flex' alignItems='center' gap={1}>
                            <Speed fontSize='small' color='action' />
                            {result.responseTime || 'N/A'}ms
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant='body2' color='text.secondary'>
                            {result.lastChecked
                              ? new Date(result.lastChecked).toLocaleString()
                              : 'Never'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {result.tests ? (
                            <Box display='flex' gap={0.5}>
                              {Object.entries(result.tests).map(([testName, testResult]) => (
                                <Tooltip
                                  key={testName}
                                  title={`${testName}: ${testResult.message || testResult.status}`}
                                >
                                  <Chip
                                    size='small'
                                    label={testName}
                                    color={getStatusColor(testResult.status)}
                                    variant='outlined'
                                  />
                                </Tooltip>
                              ))}
                            </Box>
                          ) : (
                            <Typography variant='body2' color='text.secondary'>
                              No test results
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box display='flex' gap={0.5}>
                            {testTypes.map(test => (
                              <Tooltip key={test.value} title={`Run ${test.label} test`}>
                                <IconButton
                                  size='small'
                                  onClick={() => runSingleTest(config, test.value)}
                                  disabled={testingConfigs.has(result.configId)}
                                  color='primary'
                                >
                                  {testingConfigs.has(result.configId) ? (
                                    <CircularProgress size={16} />
                                  ) : (
                                    test.icon
                                  )}
                                </IconButton>
                              </Tooltip>
                            ))}
                            <Tooltip title='View Details'>
                              <IconButton
                                size='small'
                                onClick={() => setDetailDialog({ open: true, result })}
                                color='primary'
                              >
                                <Timeline />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Test Types Information */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant='h6' gutterBottom>
            Available Health Checks
          </Typography>
          <Grid container spacing={2}>
            {testTypes.map(test => (
              <Grid item xs={12} md={4} key={test.value}>
                <Card variant='outlined'>
                  <CardContent>
                    <Box display='flex' alignItems='center' gap={1} mb={1}>
                      {test.icon}
                      <Typography variant='subtitle1'>{test.label}</Typography>
                    </Box>
                    <Typography variant='body2' color='text.secondary'>
                      {test.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Detailed Results Dialog */}
      <Dialog
        open={detailDialog.open}
        onClose={() => setDetailDialog({ open: false, result: null })}
        maxWidth='md'
        fullWidth
      >
        <DialogTitle>Health Check Details - {detailDialog.result?.provider}</DialogTitle>
        <DialogContent>
          {detailDialog.result && (
            <Box>
              <Typography variant='h6' gutterBottom>
                Overall Status
              </Typography>
              <Box display='flex' alignItems='center' gap={1} mb={3}>
                {getStatusIcon(detailDialog.result.status)}
                <Chip
                  label={detailDialog.result.status?.toUpperCase() || 'UNKNOWN'}
                  color={getStatusColor(detailDialog.result.status)}
                />
                <Typography variant='body2' color='text.secondary'>
                  Response Time: {detailDialog.result.responseTime || 'N/A'}ms
                </Typography>
              </Box>

              {detailDialog.result.tests && (
                <>
                  <Typography variant='h6' gutterBottom>
                    Test Results
                  </Typography>
                  <List>
                    {Object.entries(detailDialog.result.tests).map(([testName, testResult]) => (
                      <ListItem key={testName}>
                        <ListItemIcon>{getStatusIcon(testResult.status)}</ListItemIcon>
                        <ListItemText
                          primary={testName.replace(/_/g, ' ').toUpperCase()}
                          secondary={
                            <Box>
                              <Typography variant='body2'>{testResult.message}</Typography>
                              {testResult.responseTime && (
                                <Typography variant='caption' color='text.secondary'>
                                  Response time: {testResult.responseTime}ms
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}

              {detailDialog.result.error && (
                <>
                  <Typography variant='h6' gutterBottom color='error'>
                    Error Details
                  </Typography>
                  <Alert severity='error'>{detailDialog.result.error}</Alert>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialog({ open: false, result: null })}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HealthMonitoringPanel;
