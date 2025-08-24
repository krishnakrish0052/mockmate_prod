// Utility functions for dynamic icon loading

let iconConfig = null;
let configLoaded = false;

/**
 * Load icon configuration from the backend
 * @returns {Promise<Object>} Icon configuration object
 */
export const loadIconConfig = async () => {
  if (configLoaded && iconConfig) {
    return iconConfig;
  }

  try {
    // Use environment variable for API base URL, fallback to relative path for dev
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const iconConfigUrl = `${apiBaseUrl}/api/config/icons`;
    
    console.log('Loading icon config from:', iconConfigUrl);
    
    const response = await fetch(iconConfigUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging requests
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    // Check if response is actually JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.warn('Icon config endpoint returned non-JSON response, using defaults');
      const defaultConfig = getDefaultIconConfig();
      iconConfig = defaultConfig;
      configLoaded = true;
      return iconConfig;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
      iconConfig = data;
      configLoaded = true;
      return iconConfig;
    } else {
      console.warn('Failed to load icon config:', data.message);
      const defaultConfig = getDefaultIconConfig();
      iconConfig = defaultConfig;
      configLoaded = true;
      return iconConfig;
    }
  } catch (error) {
    console.warn('Error loading icon config, using defaults:', error.message);
    // Always return default config instead of throwing
    const defaultConfig = getDefaultIconConfig();
    iconConfig = defaultConfig;
    configLoaded = true;
    return iconConfig;
  }
};

/**
 * Get default icon configuration
 * @returns {Object} Default icon configuration
 */
const getDefaultIconConfig = () => {
  return {
    title: 'MockMate - AI-powered Interview Platform',
    favicon: '/icons/mockmate-favicon-32x32.png',
    logo: '/icons/mockmate-logo-128x128.png',
    icons: {
      '16x16': '/icons/mockmate-icon-16x16.png',
      '32x32': '/icons/mockmate-icon-32x32.png',
      '128x128': '/icons/mockmate-icon-128x128.png',
      '256x256': '/icons/mockmate-icon-256x256.png',
    },
  };
};

/**
 * Update the page favicon dynamically
 * @param {string} faviconUrl - URL of the favicon
 */
export const updateFavicon = faviconUrl => {
  try {
    // Remove existing favicon links
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    existingFavicons.forEach(link => link.remove());

    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = faviconUrl;
    document.head.appendChild(link);

    // Also update apple-touch-icon if it exists
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleTouchIcon) {
      appleTouchIcon.href = faviconUrl;
    }
  } catch (error) {
    console.error('Error updating favicon:', error);
  }
};

/**
 * Update the page title dynamically
 * @param {string} title - New page title
 */
export const updatePageTitle = title => {
  try {
    if (title && title.trim()) {
      document.title = title;
    }
  } catch (error) {
    console.error('Error updating page title:', error);
  }
};

/**
 * Get the current icon configuration
 * @returns {Object|null} Current icon configuration or null if not loaded
 */
export const getIconConfig = () => {
  return iconConfig;
};

/**
 * Initialize dynamic icons on app startup
 */
export const initializeDynamicIcons = async () => {
  try {
    const config = await loadIconConfig();

    // Update page title
    if (config.title) {
      updatePageTitle(config.title);
    }

    // Update favicon
    if (config.favicon) {
      updateFavicon(config.favicon);
    }

    // Update manifest.json dynamically if needed
    updateManifestIcons(config);

    return config;
  } catch (error) {
    console.error('Error initializing dynamic icons:', error);
    return getDefaultIconConfig();
  }
};

/**
 * Update manifest.json icons dynamically (if manifest is fetched dynamically)
 * @param {Object} config - Icon configuration
 */
const updateManifestIcons = _config => {
  try {
    // This would require the manifest to be served dynamically
    // For static manifest.json, this is mainly for future enhancement

    // We can update the manifest link to point to a dynamic endpoint
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink && window.location.hostname !== 'localhost') {
      // Only update for production, keep static for development
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      manifestLink.href = `${apiBaseUrl}/api/config/manifest`;
    }
  } catch (error) {
    console.error('Error updating manifest icons:', error);
  }
};

/**
 * Refresh icon configuration (useful for admin interface)
 */
export const refreshIconConfig = async () => {
  configLoaded = false;
  iconConfig = null;
  return await loadIconConfig();
};

/**
 * Get logo URL for use in components
 * @returns {Promise<string>} Logo URL
 */
export const getLogoUrl = async () => {
  const config = await loadIconConfig();
  return config.logo || getDefaultIconConfig().logo;
};

/**
 * Get icon URL by size
 * @param {string} size - Icon size (e.g., '16x16', '32x32')
 * @returns {Promise<string>} Icon URL
 */
export const getIconUrl = async size => {
  const config = await loadIconConfig();
  return config.icons?.[size] || getDefaultIconConfig().icons[size];
};
