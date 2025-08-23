import { useState } from 'react';
import axios from 'axios';

// Create a dedicated admin API hook
export const useAdminApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create an axios instance specifically for admin API calls
  const adminApi = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  });

  // Configure request interceptor to add authentication
  adminApi.interceptors.request.use(
    config => {
      const token = localStorage.getItem('admin_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    error => Promise.reject(error)
  );

  // Configure response interceptor to handle errors
  adminApi.interceptors.response.use(
    response => response,
    async error => {
      const original = error.config;

      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;

        try {
          const refreshToken = localStorage.getItem('admin_refresh_token');
          if (refreshToken) {
            const refreshResponse = await adminApi.post('/admin/refresh', {
              refreshToken: refreshToken,
            });

            if (refreshResponse.data.success && refreshResponse.data.data) {
              const { accessToken } = refreshResponse.data.data;
              localStorage.setItem('admin_token', accessToken);

              // Update the authorization header for the original request
              original.headers.Authorization = `Bearer ${accessToken}`;

              // Retry the original request
              return adminApi(original);
            }
          }
        } catch (refreshError) {
          // Refresh failed, clear tokens and redirect to login
          localStorage.removeItem('admin_token');
          localStorage.removeItem('admin_refresh_token');
          window.location.href = '/admin/login';
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  const apiCall = async <T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      data?: any;
    } = {}
  ): Promise<T> => {
    try {
      setError(null);
      setLoading(true);

      const { method = 'GET', data } = options;

      const response = await adminApi({
        method,
        url: `/admin/${endpoint}`,
        data,
      });

      return response.data;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'API request failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return {
    apiCall,
    loading,
    error,
    clearError,
  };
};

export default useAdminApi;
