/**
 * API Configuration Utility
 * Provides consistent API URL construction across all admin components
 */

/**
 * Get the properly formatted API base URL
 * Ensures /api suffix is always present
 */
export const getApiBaseUrl = (): string => {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
};

/**
 * Construct a full API endpoint URL
 * @param endpoint - The endpoint path (e.g., '/admin/dynamic-config')
 * @returns Full API URL
 */
export const getApiUrl = (endpoint: string): string => {
  const apiBase = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${apiBase}${cleanEndpoint}`;
};

/**
 * Common API endpoints used across admin components
 */
export const API_ENDPOINTS = {
  DYNAMIC_CONFIG: '/admin/dynamic-config',
  DYNAMIC_CONFIG_RELOAD: '/admin/dynamic-config/reload',
  DYNAMIC_CONFIG_EXPORT: '/admin/dynamic-config/export',
  DYNAMIC_CONFIG_BATCH_UPDATE: '/admin/dynamic-config/batch-update',
  USERS: '/admin/users',
  ANALYTICS: '/admin/analytics',
  SYSTEM: '/admin/system',
  ALERTS: '/admin/alerts',
  EMAIL_TEMPLATES: '/admin/email-templates',
  EMAIL_CAMPAIGNS: '/admin/email-campaigns',
  ICON_MANAGEMENT: '/admin/icons',
  APP_MANAGEMENT: '/admin/apps',
  SESSIONS: '/admin/sessions',
  REPORTS: '/admin/reports',
  PROFILE: '/admin/profile',
  PRICING: '/admin/pricing',
  ADMIN: {
    PRICING_PACKAGES: '/admin/pricing-management/packages',
    PRICING_PLANS: '/admin/pricing-management/plans',
    SYSTEM_HEALTH: '/admin/system/health',
    PAYMENT_CONFIGS: '/admin/payment-configs',
  },
} as const;

/**
 * Create fetch headers with authentication
 * @param token - Admin authentication token (optional - will get from localStorage if not provided)
 * @param additionalHeaders - Any additional headers to include
 * @returns Headers object for fetch requests
 */
export const createAuthHeaders = (
  token?: string,
  additionalHeaders: Record<string, string> = {}
): HeadersInit => {
  const authToken = token || localStorage.getItem('admin_token') || '';
  return {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };
};

/**
 * Make an authenticated API request
 * @param endpoint - API endpoint
 * @param token - Admin auth token
 * @param options - Fetch options
 * @returns Promise with response
 */
export const apiRequest = async (
  endpoint: string,
  token: string,
  options: RequestInit = {}
) => {
  const url = getApiUrl(endpoint);
  const headers = createAuthHeaders(token, options.headers as Record<string, string>);
  
  return fetch(url, {
    ...options,
    headers,
  });
};
