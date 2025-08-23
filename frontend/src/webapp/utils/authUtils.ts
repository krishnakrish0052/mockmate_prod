/**
 * Utility functions for authentication management
 */

/**
 * Clear all stored authentication tokens and reset auth state
 * Useful for debugging or when tokens are corrupted
 */
export const clearAuthTokens = (): void => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  console.log('Auth tokens cleared');
};

/**
 * Check if user has valid tokens stored
 */
export const hasStoredTokens = (): boolean => {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  return !!(accessToken && refreshToken);
};

/**
 * Get stored tokens (for debugging purposes)
 */
export const getStoredTokens = (): { accessToken: string | null; refreshToken: string | null } => {
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
};

/**
 * Debug function to log current auth state
 */
export const debugAuthState = (): void => {
  const tokens = getStoredTokens();
  console.log('=== AUTH DEBUG ===');
  console.log('Has Access Token:', !!tokens.accessToken);
  console.log('Has Refresh Token:', !!tokens.refreshToken);
  if (tokens.accessToken) {
    try {
      // Try to decode JWT payload (basic, no verification)
      const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
      console.log('Token Expires At:', new Date(payload.exp * 1000));
      console.log('Token Issued At:', new Date(payload.iat * 1000));
      console.log('Token Subject:', payload.sub);
    } catch (e) {
      console.log('Could not decode token');
    }
  }
  console.log('==================');
};
