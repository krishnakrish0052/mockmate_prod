import { api } from '../api';

export const paymentConfigApi = {
  // Get all payment configurations
  async getPaymentConfigurations(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...filters
    });

    const response = await api.get(`/admin/payment-configs?${params}`);
    return response.data;
  },

  // Get specific payment configuration
  async getPaymentConfiguration(id) {
    const response = await api.get(`/admin/payment-configs/${id}`);
    return response.data;
  },

  // Create new payment configuration
  async createPaymentConfiguration(configData) {
    const response = await api.post('/admin/payment-configs', configData);
    return response.data;
  },

  // Update payment configuration
  async updatePaymentConfiguration(id, configData) {
    const response = await api.put(`/admin/payment-configs/${id}`, configData);
    return response.data;
  },

  // Toggle payment gateway status (enable/disable)
  async togglePaymentGateway(id, isActive) {
    const response = await api.post(`/admin/payment-configs/${id}/toggle-status`, {
      is_active: isActive
    });
    return response.data;
  },

  // Test payment configuration
  async testPaymentConfiguration(id, testType = 'connectivity') {
    const response = await api.post(`/admin/payment-configs/${id}/test`, {
      test_type: testType
    });
    return response.data;
  },

  // Get active payment configurations
  async getActiveConfigurations(testMode = null) {
    const params = testMode !== null ? `?test_mode=${testMode}` : '';
    const response = await api.get(`/admin/payment-configs/active${params}`);
    return response.data;
  },

  // Get provider statistics
  async getProviderStats() {
    const response = await api.get('/admin/payment-configs/analytics/provider-stats');
    return response.data;
  },

  // Run bulk health check
  async runBulkHealthCheck() {
    const response = await api.post('/admin/payment-configs/bulk-health-check');
    return response.data;
  },

  // Get audit log for configuration
  async getConfigAuditLog(id, page = 1, limit = 50) {
    const response = await api.get(`/admin/payment-configs/${id}/audit-log?page=${page}&limit=${limit}`);
    return response.data;
  },

  // Delete payment configuration
  async deletePaymentConfiguration(id) {
    const response = await api.delete(`/admin/payment-configs/${id}`);
    return response.data;
  }
};
