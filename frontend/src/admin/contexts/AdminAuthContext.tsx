import React, { createContext, useContext, useReducer, useEffect } from 'react';
import axios from 'axios';

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  firstName?: string;
  lastName?: string;
  lastLogin?: string;
  createdAt: string;
}

interface AdminAuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  token: string | null;
}

type AdminAuthAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LOGIN_SUCCESS'; payload: { user: AdminUser; token: string } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: AdminUser };

interface AdminAuthContextType extends AdminAuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  updateProfile: (data: Partial<AdminUser>) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

const initialState: AdminAuthState = {
  user: null,
  isAuthenticated: false,
  loading: true,
  error: null,
  token: localStorage.getItem('admin_token'),
};

function adminAuthReducer(state: AdminAuthState, action: AdminAuthAction): AdminAuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        loading: false,
        error: null,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
        error: null,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
        loading: false,
      };
    default:
      return state;
  }
}

// Create a separate axios instance for admin requests to avoid conflicts
const adminAxios = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
});

// Configure admin axios instance with admin-specific interceptors
adminAxios.interceptors.request.use(
  config => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Add response interceptor to handle token expiration
adminAxios.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        const refreshToken = localStorage.getItem('admin_refresh_token');
        if (refreshToken) {
          // Use environment variable for refresh call to avoid hardcoded path
          const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
          const refreshResponse = await axios.post(`${apiBaseUrl}/api/admin/refresh`, {
            refreshToken: refreshToken,
          });

          if (refreshResponse.data.success && refreshResponse.data.data) {
            const { accessToken } = refreshResponse.data.data;
            localStorage.setItem('admin_token', accessToken);

            // Update the authorization header for the original request
            original.headers.Authorization = `Bearer ${accessToken}`;

            // Retry the original request
            return adminAxios(original);
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

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(adminAuthReducer, initialState);

  // Check token on mount
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      validateToken();
    } else {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const validateToken = async () => {
    try {
      // Get fresh token from localStorage
      const token = localStorage.getItem('admin_token');
      if (!token) {
        throw new Error('No token found');
      }

      // Check if it's a debug token
      if (import.meta.env.VITE_ENABLE_DEBUG_MODE === 'true' && token.startsWith('dev-token-')) {
        // For debug mode, recreate the mock user
        const mockUser: AdminUser = {
          id: '1',
          username: 'admin',
          email: 'admin@mockmate.com',
          role: 'super_admin',
          permissions: ['*'],
          firstName: 'Admin',
          lastName: 'User',
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: mockUser,
            token: token,
          },
        });
        return;
      }

      // For real tokens, validate with server using the validate-token endpoint
      const response = await adminAxios.get('/admin/validate-token');
      if (response.data.success && response.data.data.admin) {
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: response.data.data.admin,
            token: token,
          },
        });
      } else {
        throw new Error('Invalid token response');
      }
    } catch (error: any) {
      console.log('Token validation failed:', error.message);
      // Try to refresh the token before giving up
      try {
        await refreshToken();
      } catch (refreshError) {
        console.log('Token refresh also failed:', refreshError);
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh_token');
        dispatch({ type: 'LOGOUT' });
      }
    }
  };

  const login = async (username: string, password: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Development mode bypass - remove this in production
      if (
        import.meta.env.VITE_ENABLE_DEBUG_MODE === 'true' &&
        username === 'admin' &&
        password === 'admin'
      ) {
        const mockUser: AdminUser = {
          id: '1',
          username: 'admin',
          email: 'admin@mockmate.com',
          role: 'super_admin',
          permissions: ['*'],
          firstName: 'Admin',
          lastName: 'User',
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        const mockToken = 'dev-token-' + Date.now();

        localStorage.setItem('admin_token', mockToken);
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: mockUser, token: mockToken } });
        return;
      }

      const response = await adminAxios.post('/admin/login', { username, password });

      if (response.data.success && response.data.data) {
        const { admin, tokens } = response.data.data;
        const token = tokens.accessToken;

        localStorage.setItem('admin_token', token);
        localStorage.setItem('admin_refresh_token', tokens.refreshToken);
        dispatch({ type: 'LOGIN_SUCCESS', payload: { user: admin, token } });
      } else {
        throw new Error(response.data.error || 'Login failed');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    }
  };

  const logout = async () => {
    try {
      await adminAxios.post('/admin/logout');
    } catch (error) {
      // Continue with logout even if server request fails
    }

    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    dispatch({ type: 'LOGOUT' });
  };

  const refreshToken = async () => {
    try {
      const refreshTokenValue = localStorage.getItem('admin_refresh_token');
      if (!refreshTokenValue) {
        throw new Error('No refresh token available');
      }

      const response = await adminAxios.post('/admin/refresh', {
        refreshToken: refreshTokenValue,
      });
      if (response.data.success && response.data.data) {
        // The refresh endpoint only returns the new access token, not user data
        const { accessToken } = response.data.data;

        localStorage.setItem('admin_token', accessToken);

        // Now get the updated user profile with the new token
        const profileResponse = await adminAxios.get('/admin/validate-token');
        if (profileResponse.data.success && profileResponse.data.data.admin) {
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: profileResponse.data.data.admin,
              token: accessToken,
            },
          });
        } else {
          throw new Error('Failed to get user profile after token refresh');
        }
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      console.log('Refresh token failed:', error);
      logout();
      throw error;
    }
  };

  const updateProfile = async (data: Partial<AdminUser>) => {
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const response = await adminAxios.put('/admin/profile', data);
      if (response.data.success && response.data.data.profile) {
        dispatch({ type: 'UPDATE_USER', payload: response.data.data.profile });
      } else {
        throw new Error('Profile update failed');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Update failed';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      throw error;
    }
  };

  const hasPermission = (permission: string): boolean => {
    if (!state.user) return false;
    if (state.user.role === 'super_admin') return true;
    // Check for wildcard permission
    if (state.user.permissions.includes('*')) return true;
    return state.user.permissions.includes(permission);
  };

  const hasRole = (role: string): boolean => {
    if (!state.user) return false;
    return state.user.role === role;
  };

  const value: AdminAuthContextType = {
    ...state,
    login,
    logout,
    refreshToken,
    updateProfile,
    hasPermission,
    hasRole,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = (): AdminAuthContextType => {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};

export default AdminAuthContext;
