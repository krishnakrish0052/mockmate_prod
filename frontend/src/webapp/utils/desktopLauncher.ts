/**
 * Desktop App Launcher Utility
 * Handles launching the MockMate desktop app with proper user gesture handling
 */

export interface LaunchOptions {
  token?: string;
  userId?: string;
  autoConnect?: boolean;
  autoFill?: boolean;
  showDebugInfo?: boolean;
}

export interface LaunchData {
  sessionId: string;
  token?: string;
  userId?: string;
  autoFill: boolean;
  autoConnect: boolean;
  timestamp: number;
  source: string;
}

export interface ConnectionStatus {
  connected: boolean;
  status: string;
  lastSeen?: string | null;
  sessionId: string;
  error?: string;
}

export interface CreateButtonOptions {
  text?: string;
  className?: string;
  token?: string;
  userId?: string;
}

/**
 * Launch the desktop app with a session ID
 * Must be called within a user event handler (click, etc.)
 */
export const launchDesktopApp = async (
  sessionId: string,
  options: LaunchOptions = {}
): Promise<boolean> => {
  const { token, userId, autoConnect = true, autoFill = true } = options;

  try {
    // Validate session ID format (UUID)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(sessionId)) {
      throw new Error('Invalid session ID format');
    }

    // Generate temporary authentication token
    let tempToken: string;
    try {
      const tokenResponse = await fetch(`/api/sessions/${sessionId}/generate-desktop-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({}),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Failed to generate desktop token: ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json();
      tempToken = tokenData.tempToken;
      console.log('Generated temporary desktop token:', tempToken.substring(0, 8) + '...');
    } catch (tokenError) {
      console.error('Failed to generate temporary token:', tokenError);
      throw new Error('Could not generate temporary authentication token for desktop app');
    }

    // Build the protocol URL with temporary token
    let protocolUrl = `mockmate://session/${sessionId}`;

    // Add query parameters
    const params = new URLSearchParams();
    params.append('temp_token', tempToken);
    if (userId) params.append('user_id', userId);

    // Add auto-fill and auto-connect flags
    if (autoFill) params.append('auto_fill', 'true');
    if (autoConnect) params.append('auto_connect', 'true');

    // Add additional parameters for desktop app initialization
    params.append('source', 'webapp');
    params.append('timestamp', Date.now().toString());

    protocolUrl += `?${params.toString()}`;

    console.log('Launching desktop app with secure temporary token');
    console.log(
      'Protocol URL (token masked):',
      protocolUrl.replace(/temp_token=[^&]+/, 'temp_token=***')
    );
    console.log('Auto-fill enabled:', autoFill);
    console.log('Auto-connect enabled:', autoConnect);

    // Store launch intent in localStorage for desktop app to detect (without sensitive token)
    const launchData = {
      sessionId,
      userId,
      autoFill,
      autoConnect,
      timestamp: Date.now(),
      source: 'webapp',
      tempTokenGenerated: true,
    };

    try {
      localStorage.setItem('mockmate_launch_data', JSON.stringify(launchData));
      console.log('Launch data stored in localStorage (without token):', launchData);
    } catch (storageError) {
      console.warn('Could not store launch data in localStorage:', storageError);
    }

    // Method 1: Direct window.location (most reliable for user gestures)
    window.location.href = protocolUrl;

    // Method 2: Fallback with window.open for better protocol handling
    setTimeout(() => {
      try {
        const popup = window.open(protocolUrl, '_blank', 'width=1,height=1');
        if (popup) {
          setTimeout(() => popup.close(), 1000);
        }
      } catch (fallbackError) {
        console.warn('Fallback launch method failed:', fallbackError);
      }
    }, 500);

    return true;
  } catch (error) {
    console.error('Failed to launch desktop app:', error);
    return false;
  }
};

/**
 * Alternative launch method using window.open
 */
export const launchDesktopAppAlternative = (
  sessionId: string,
  options: LaunchOptions = {}
): boolean => {
  const { token, userId } = options;

  try {
    let protocolUrl = `mockmate://session/${sessionId}`;

    const params = new URLSearchParams();
    if (token) params.append('token', token);
    if (userId) params.append('user_id', userId);

    if (params.toString()) {
      protocolUrl += `?${params.toString()}`;
    }

    // Try to open in a new window/tab, then close it immediately
    const popup = window.open(protocolUrl, '_blank');

    // Close the popup immediately since it's just to trigger the protocol
    setTimeout(() => {
      if (popup && !popup.closed) {
        popup.close();
      }
    }, 1000);

    return true;
  } catch (error) {
    console.error('Alternative launch failed:', error);
    return false;
  }
};

/**
 * Create a clickable button/link that launches the desktop app
 */
export const createDesktopLaunchButton = (
  sessionId: string,
  options: CreateButtonOptions = {}
): HTMLButtonElement => {
  const { text = 'Open in Desktop App', className = 'desktop-launch-btn', token, userId } = options;

  const button = document.createElement('button');
  button.textContent = text;
  button.className = className;
  button.type = 'button';

  button.addEventListener('click', event => {
    event.preventDefault();
    launchDesktopApp(sessionId, { token, userId });
  });

  return button;
};

/**
 * Check if the desktop app is likely installed by testing the protocol
 * Uses multiple detection methods for better accuracy
 */
export const checkDesktopAppInstalled = (): Promise<boolean> => {
  return new Promise(resolve => {
    console.log('🔍 Starting desktop app detection...');

    let detectionComplete = false;
    let detectionTimeout: NodeJS.Timeout;

    // Method 1: Visibility change detection
    const handleVisibilityChange = () => {
      if (document.hidden && !detectionComplete) {
        console.log('✅ Desktop app detected (visibility change)');
        detectionComplete = true;
        clearTimeout(detectionTimeout);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        resolve(true);
      }
    };

    // Method 2: Iframe with protocol test
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.src = 'mockmate://test';

    iframe.onerror = () => {
      if (!detectionComplete) {
        console.log('❌ Desktop app not detected (iframe error)');
        detectionComplete = true;
        clearTimeout(detectionTimeout);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        resolve(false);
      }
    };

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Add iframe to DOM
    document.body.appendChild(iframe);

    // Method 3: Window.open test (fallback)
    setTimeout(() => {
      if (!detectionComplete) {
        try {
          const popup = window.open('mockmate://test', '_blank', 'width=1,height=1');
          if (popup) {
            setTimeout(() => {
              if (popup && !popup.closed) {
                popup.close();
                // Popup remained open, likely no protocol handler
                if (!detectionComplete) {
                  console.log('❌ Desktop app not detected (popup test failed)');
                  detectionComplete = true;
                  clearTimeout(detectionTimeout);
                  document.removeEventListener('visibilitychange', handleVisibilityChange);
                  resolve(false);
                }
              }
            }, 500);
          }
        } catch (error) {
          console.log('⚠️ Protocol test error:', error);
        }
      }
    }, 100);

    // Final timeout - assume not installed if no detection after 3 seconds
    detectionTimeout = setTimeout(() => {
      if (!detectionComplete) {
        console.log('⏰ Desktop app detection timeout - assuming not installed');
        detectionComplete = true;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        resolve(false);
      }
    }, 3000);

    console.log('⏳ Desktop app detection in progress...');
  });
};

/**
 * Show a user-friendly error message with instructions
 */
export const showDesktopAppError = (sessionId: string): HTMLDivElement => {
  const errorHtml = `
        <div class="desktop-app-error" style="
            background: #fee2e2;
            border: 1px solid #fca5a5;
            border-radius: 8px;
            padding: 16px;
            margin: 16px 0;
            color: #991b1b;
        ">
            <h3 style="margin: 0 0 8px 0;">Desktop App Not Found</h3>
            <p style="margin: 0 0 12px 0;">
                The MockMate desktop application doesn't appear to be installed or registered.
            </p>
            <p style="margin: 0 0 12px 0; font-weight: bold;">
                Session ID: ${sessionId}
            </p>
            <div style="font-size: 14px;">
                <p><strong>To fix this:</strong></p>
                <ol style="margin: 8px 0 0 20px; padding: 0;">
                    <li>Download and install the MockMate desktop app</li>
                    <li>Run it at least once to register the URL handler</li>
                    <li>Try clicking the launch button again</li>
                </ol>
            </div>
        </div>
    `;

  // You can customize how/where to show this error
  // For now, we'll create a modal or insert it into the page
  const errorDiv = document.createElement('div');
  errorDiv.innerHTML = errorHtml;

  return errorDiv;
};

/**
 * Get launch data stored for desktop app consumption
 */
export const getLaunchData = (): LaunchData | null => {
  try {
    const data = localStorage.getItem('mockmate_launch_data');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn('Failed to retrieve launch data:', error);
    return null;
  }
};

/**
 * Clear launch data after desktop app consumes it
 */
export const clearLaunchData = (): void => {
  try {
    localStorage.removeItem('mockmate_launch_data');
    console.log('Launch data cleared');
  } catch (error) {
    console.warn('Failed to clear launch data:', error);
  }
};

/**
 * Launch desktop app with automatic session filling and connection
 * Enhanced version specifically for the web app integration
 */
export const launchWithAutoFeatures = async (
  sessionId: string,
  options: LaunchOptions = {}
): Promise<boolean> => {
  const {
    token = localStorage.getItem('auth_token') || undefined,
    userId,
    autoConnect = true,
    autoFill = true,
    showDebugInfo = false,
  } = options;

  if (showDebugInfo) {
    console.group('🚀 MockMate Desktop Launch');
    console.log('Session ID:', sessionId);
    console.log('User ID:', userId);
    console.log('Token present:', !!token);
    console.log('Auto-fill:', autoFill);
    console.log('Auto-connect:', autoConnect);
    console.groupEnd();
  }

  // Enhanced launch with all features enabled
  return await launchDesktopApp(sessionId, {
    token,
    userId,
    autoConnect,
    autoFill,
  });
};

/**
 * Monitor desktop app connection status
 * Polls for desktop app status and returns connection info
 */
export const monitorDesktopConnection = (
  sessionId: string,
  callback: (status: ConnectionStatus) => void,
  interval: number = 5000
): (() => void) => {
  let isMonitoring = true;
  let timeoutId: NodeJS.Timeout;

  const checkConnection = async () => {
    if (!isMonitoring) return;

    try {
      // Try to detect if desktop app is running with this session
      const response = await fetch(`/api/sessions/${sessionId}/desktop-status`);
      const data = await response.json();

      if (callback && typeof callback === 'function') {
        callback({
          connected: data.connected || false,
          status: data.status || 'unknown',
          lastSeen: data.lastSeen || null,
          sessionId,
        });
      }
    } catch (error) {
      console.warn('Failed to check desktop connection:', error);
      if (callback && typeof callback === 'function') {
        callback({
          connected: false,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });
      }
    }

    if (isMonitoring) {
      timeoutId = setTimeout(checkConnection, interval);
    }
  };

  // Start monitoring
  checkConnection();

  // Return cleanup function
  return () => {
    isMonitoring = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    console.log('Desktop connection monitoring stopped for session:', sessionId);
  };
};

/**
 * Send message to desktop app if connected
 */
export const sendDesktopMessage = async (
  sessionId: string,
  action: string,
  data: any = {}
): Promise<boolean> => {
  try {
    const response = await fetch(`/api/sessions/${sessionId}/desktop-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        data,
        timestamp: Date.now(),
        source: 'webapp',
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send desktop message:', error);
    return false;
  }
};

// Default export for easier importing
export default {
  launchDesktopApp,
  launchDesktopAppAlternative,
  launchWithAutoFeatures,
  createDesktopLaunchButton,
  checkDesktopAppInstalled,
  showDesktopAppError,
  getLaunchData,
  clearLaunchData,
  monitorDesktopConnection,
  sendDesktopMessage,
};
