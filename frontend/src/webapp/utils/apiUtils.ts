/**
 * API Utilities for consistent API calls across the application
 * This ensures all API calls use the correct base URL configuration
 */

// Get the correct API base URL from environment variables
export const getApiBaseUrl = (): string => {
  // Use environment variable or fallback to localhost
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
  return baseUrl;
};

// Get the full API URL with the /api prefix
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  // Add /api prefix if not already present
  const apiEndpoint = normalizedEndpoint.startsWith('/api') ? normalizedEndpoint : `/api${normalizedEndpoint}`;
  return `${baseUrl}${apiEndpoint}`;
};

// Standard headers for API requests
export const getApiHeaders = (includeAuth: boolean = true): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (includeAuth) {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('accessToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
};

// Utility for making API calls with consistent error handling
export const apiCall = async <T = any>(
  endpoint: string,
  options: RequestInit = {},
  useAdminAuth: boolean = false
): Promise<T> => {
  const url = getApiUrl(endpoint);
  const token = useAdminAuth ? localStorage.getItem('admin_token') : localStorage.getItem('accessToken');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Network error' }));
    throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

// Specific utility for admin API calls
export const adminApiCall = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  return apiCall<T>(endpoint, options, true);
};

// Export for backward compatibility
export default {
  getApiBaseUrl,
  getApiUrl,
  getApiHeaders,
  apiCall,
  adminApiCall,
};
