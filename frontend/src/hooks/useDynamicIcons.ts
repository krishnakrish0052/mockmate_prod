import { useState, useEffect } from 'react';
import {
  getIconConfig,
  getLogoUrl,
  getIconUrl,
  refreshIconConfig,
  loadIconConfig,
} from '../utils/iconLoader';

interface IconConfig {
  title: string;
  favicon: string;
  logo: string;
  icons: {
    '16x16': string;
    '32x32': string;
    '128x128': string;
    '256x256': string;
  };
}

interface UseDynamicIconsReturn {
  iconConfig: IconConfig | null;
  loading: boolean;
  error: string | null;
  logoUrl: string | null;
  getIcon: (size: string) => Promise<string>;
  refresh: () => Promise<void>;
}

export const useDynamicIcons = (): UseDynamicIconsReturn => {
  const [iconConfig, setIconConfig] = useState<IconConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const loadIcons = async () => {
    try {
      setLoading(true);
      setError(null);

      const config = await loadIconConfig();
      setIconConfig(config);

      const logo = await getLogoUrl();
      setLogoUrl(logo);
    } catch (err) {
      console.error('Failed to load icon configuration:', err);
      setError(err instanceof Error ? err.message : 'Failed to load icons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIcons();
  }, []);

  const getIcon = async (size: string): Promise<string> => {
    return await getIconUrl(size);
  };

  const refresh = async () => {
    await refreshIconConfig();
    await loadIcons();
  };

  return {
    iconConfig,
    loading,
    error,
    logoUrl,
    getIcon,
    refresh,
  };
};

export default useDynamicIcons;
