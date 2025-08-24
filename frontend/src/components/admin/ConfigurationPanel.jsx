import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  PlayArrow,
  CheckCircle,
  Error,
} from '@mui/icons-material';
import PaymentProviderForm from './PaymentProviderForm';

const ConfigurationPanel = ({ configurations, onConfigurationChange, showSnackbar, loading }) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState(null);
  const [testingConfig, setTestingConfig] = useState(null);

  const handleAddNew = () => {
    setEditingConfig(null);
    setFormOpen(true);
  };

  const handleEdit = config => {
    setEditingConfig(config);
    setFormOpen(true);
  };

  const handleDelete = config => {
    setConfigToDelete(config);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!configToDelete) return;

    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${apiBaseUrl}/admin/payment-configs/${configToDelete.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        showSnackbar('Payment configuration deleted successfully');
        onConfigurationChange();
      } else {
        throw new Error('Failed to delete configuration');
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
      showSnackbar('Failed to delete payment configuration', 'error');
    } finally {
      setDeleteDialogOpen(false);
      setConfigToDelete(null);
    }
  };

  const handleToggleStatus = async (config, newStatus) => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${apiBaseUrl}/admin/payment-configs/${config.id}/toggle-status`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: newStatus }),
      });

      if (response.ok) {
        showSnackbar(`Configuration ${newStatus ? 'activated' : 'deactivated'} successfully`);
        onConfigurationChange();
      } else {
        throw new Error('Failed to toggle status');
      }
    } catch (error) {
      console.error('Error toggling status:', error);
      showSnackbar('Failed to toggle configuration status', 'error');
    }
  };

  const handleTestConfig = async config => {
    setTestingConfig(config.id);
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${apiBaseUrl}/admin/payment-configs/${config.id}/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test_type: 'connectivity' }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.data.status === 'pass') {
          showSnackbar('Configuration test passed successfully');
        } else {
          showSnackbar(`Configuration test failed: ${result.data.message}`, 'warning');
        }
      } else {
        throw new Error('Failed to test configuration');
      }
    } catch (error) {
      console.error('Error testing configuration:', error);
      showSnackbar('Failed to test payment configuration', 'error');
    } finally {
      setTestingConfig(null);
    }
  };

  const getProviderIcon = providerName => {
    const icons = {
      stripe: '💳',
      paypal: '🅿️',
      razorpay: '💰',
      square: '⬜',
      braintree: '🧠',
    };
    return icons[providerName.toLowerCase()] || '💳';
  };

  const getStatusColor = (isActive, isTestMode) => {
    if (!isActive) return 'error';
    return isTestMode ? 'warning' : 'success';
  };

  const getStatusText = (isActive, isTestMode) => {
    if (!isActive) return 'Inactive';
    return isTestMode ? 'Test Mode' : 'Live';
  };

  if (loading) {
    return (
      <Box display='flex' justifyContent='center' alignItems='center' minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display='flex' justifyContent='space-between' alignItems='center' mb={3}>
        <Typography variant='h6'>Payment Provider Configurations</Typography>
        <Button
          variant='contained'
          startIcon={<Add />}
          onClick={handleAddNew}
          sx={{ borderRadius: 2 }}
        >
          Add Provider
        </Button>
      </Box>

      {configurations.length === 0 ? (
        <Alert severity='info' sx={{ mb: 3 }}>
          No payment configurations found. Add your first payment provider to get started.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Supported Currencies</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configurations.map(config => (
                <TableRow key={config.id} hover>
                  <TableCell>
                    <Box display='flex' alignItems='center' gap={1}>
                      <span style={{ fontSize: '20px' }}>
                        {getProviderIcon(config.provider_name)}
                      </span>
                      <Box>
                        <Typography variant='body2' fontWeight='medium'>
                          {config.provider_name}
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {config.display_name || config.provider_name}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={config.provider_type} size='small' variant='outlined' />
                  </TableCell>
                  <TableCell>
                    <Box display='flex' flexDirection='column' gap={0.5}>
                      <Chip
                        label={getStatusText(config.is_active, config.is_test_mode)}
                        color={getStatusColor(config.is_active, config.is_test_mode)}
                        size='small'
                        icon={config.is_active ? <CheckCircle /> : <Error />}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={config.is_active}
                            onChange={e => handleToggleStatus(config, e.target.checked)}
                            size='small'
                          />
                        }
                        label='Active'
                        sx={{ m: 0 }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip label={config.priority} size='small' />
                  </TableCell>
                  <TableCell>
                    <Typography variant='body2'>
                      {config.supported_currencies?.slice(0, 3).join(', ')}
                      {config.supported_currencies?.length > 3 && '...'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='body2' color='text.secondary'>
                      {new Date(config.created_at).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box display='flex' gap={0.5}>
                      <Tooltip title='Test Configuration'>
                        <IconButton
                          size='small'
                          onClick={() => handleTestConfig(config)}
                          disabled={testingConfig === config.id}
                          color='primary'
                        >
                          {testingConfig === config.id ? (
                            <CircularProgress size={16} />
                          ) : (
                            <PlayArrow />
                          )}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title='Edit Configuration'>
                        <IconButton size='small' onClick={() => handleEdit(config)} color='primary'>
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title='Delete Configuration'>
                        <IconButton size='small' onClick={() => handleDelete(config)} color='error'>
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Provider Form Dialog */}
      <PaymentProviderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editingConfig={editingConfig}
        onSuccess={() => {
          setFormOpen(false);
          onConfigurationChange();
          showSnackbar(
            editingConfig
              ? 'Configuration updated successfully'
              : 'Configuration created successfully'
          );
        }}
        onError={message => showSnackbar(message, 'error')}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth='sm'
        fullWidth
      >
        <DialogTitle>Delete Payment Configuration</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the configuration for{' '}
            <strong>{configToDelete?.provider_name}</strong>?
          </Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 1 }}>
            This action will deactivate the configuration but preserve historical data.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color='error' variant='contained'>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ConfigurationPanel;
