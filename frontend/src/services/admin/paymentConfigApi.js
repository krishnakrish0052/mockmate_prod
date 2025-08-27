import { adminApiCall } from '../../utils/apiUtils';

export const paymentConfigApi = {
  // Get all payment configurations
  async getPaymentConfigurations(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...filters
    });

    return await adminApiCall(`/admin/payment-configs?${params}`);
  },

  // Get specific payment configuration
  async getPaymentConfiguration(id) {
    return await adminApiCall(`/admin/payment-configs/${id}`);
  },

  // Create new payment configuration
  async createPaymentConfiguration(configData) {
    return await adminApiCall('/admin/payment-configs', {
      method: 'POST',
      body: JSON.stringify(configData)
    });
  },

  // Update payment configuration
  async updatePaymentConfiguration(id, configData) {
    return await adminApiCall(`/admin/payment-configs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(configData)
    });
  },

  // Toggle payment gateway status (enable/disable)
  async togglePaymentGateway(id, isActive) {
    return await adminApiCall(`/admin/payment-configs/${id}/toggle-status`, {
      method: 'POST',
      body: JSON.stringify({ is_active: isActive })
    });
  },

  // Test payment configuration
  async testPaymentConfiguration(id, testType = 'connectivity') {
    return await adminApiCall(`/admin/payment-configs/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ test_type: testType })
    });
  },

  // Get active payment configurations
  async getActiveConfigurations(testMode = null) {
    const params = testMode !== null ? `?test_mode=${testMode}` : '';
    return await adminApiCall(`/admin/payment-configs/active${params}`);
  },

  // Get provider statistics
  async getProviderStats() {
    return await adminApiCall('/admin/payment-configs/analytics/provider-stats');
  },

  // Run bulk health check
  async runBulkHealthCheck() {
    return await adminApiCall('/admin/payment-configs/bulk-health-check', {
      method: 'POST'
    });
  },

  // Get audit log for configuration
  async getConfigAuditLog(id, page = 1, limit = 50) {
    return await adminApiCall(`/admin/payment-configs/${id}/audit-log?page=${page}&limit=${limit}`);
  },

  // Delete payment configuration
  async deletePaymentConfiguration(id) {
    return await adminApiCall(`/admin/payment-configs/${id}`, {
      method: 'DELETE'
    });
  }
};
