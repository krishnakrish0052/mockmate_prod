import { paymentConfigApi } from './paymentConfigApi';

// Admin API that combines all admin-related API functions
export const adminApi = {
  // Payment Configuration functions
  ...paymentConfigApi,
  
  // Alias commonly used functions for backwards compatibility
  getPaymentConfigurations: paymentConfigApi.getPaymentConfigurations,
  updatePaymentConfiguration: paymentConfigApi.updatePaymentConfiguration,
  togglePaymentGateway: paymentConfigApi.togglePaymentGateway,
  testPaymentConfiguration: paymentConfigApi.testPaymentConfiguration,
};

export default adminApi;
