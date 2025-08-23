/**
 * Auth Debug Utilities
 * Development-only debugging helpers for authentication
 */

// Only run in development mode
if (import.meta.env.DEV) {
  // Add global debugging helpers to window object
  (window as any).authDebug = {
    // Helper to check current auth state
    checkAuthState: () => {
      const token = localStorage.getItem('token');
      const user = localStorage.getItem('user');
      
      console.log('🔍 Auth Debug - Current State:');
      console.log('Token:', token ? `${token.substring(0, 20)}...` : 'None');
      console.log('User:', user ? JSON.parse(user) : 'None');
      
      return {
        hasToken: !!token,
        hasUser: !!user,
        tokenPreview: token ? `${token.substring(0, 20)}...` : null,
        user: user ? JSON.parse(user) : null
      };
    },

    // Helper to clear auth data
    clearAuth: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      console.log('🧹 Auth Debug - Cleared all auth data');
      window.location.reload();
    },

    // Helper to simulate login state
    simulateLogin: (userData = { id: 'debug-user', email: 'debug@example.com', name: 'Debug User' }) => {
      const mockToken = 'debug-token-' + Date.now();
      localStorage.setItem('token', mockToken);
      localStorage.setItem('user', JSON.stringify(userData));
      console.log('🎭 Auth Debug - Simulated login:', userData);
      window.location.reload();
    }
  };

  console.log('🔧 Auth Debug helpers loaded. Available commands:');
  console.log('  authDebug.checkAuthState() - Check current auth state');
  console.log('  authDebug.clearAuth() - Clear all auth data');
  console.log('  authDebug.simulateLogin() - Simulate user login');
}
