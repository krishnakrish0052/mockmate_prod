/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_NODE_ENV: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_ANALYTICS: string;
  readonly VITE_ENABLE_REALTIME_UPDATES: string;
  readonly VITE_ENABLE_DEBUG_MODE: string;
  readonly VITE_SESSION_TIMEOUT: string;
  readonly VITE_TOKEN_REFRESH_THRESHOLD: string;
  readonly VITE_DEFAULT_THEME: string;
  readonly VITE_ENABLE_ANIMATIONS: string;
  readonly VITE_MATRIX_RAIN_DENSITY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
