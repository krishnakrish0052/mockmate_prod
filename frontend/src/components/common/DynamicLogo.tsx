import React, { useState, useEffect } from 'react';
import { getLogoUrl } from '../../utils/iconLoader';

interface DynamicLogoProps {
  className?: string;
  alt?: string;
  fallback?: string;
  onClick?: () => void;
}

const DynamicLogo: React.FC<DynamicLogoProps> = ({
  className = 'h-8 w-auto',
  alt = 'MockMate Logo',
  fallback = '/mockmate_128x128.png',
  onClick,
}) => {
  const [logoUrl, setLogoUrl] = useState<string>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const loadLogo = async () => {
      try {
        setLoading(true);
        const url = await getLogoUrl();
        setLogoUrl(url);
        setError(false);
      } catch (err) {
        console.warn('Failed to load dynamic logo, using fallback:', err);
        setLogoUrl(fallback);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadLogo();
  }, [fallback]);

  const handleImageError = () => {
    if (logoUrl !== fallback) {
      console.warn('Logo failed to load, falling back to default');
      setLogoUrl(fallback);
      setError(true);
    }
  };

  if (loading) {
    return (
      <div className={`${className} animate-pulse rounded bg-gray-200`}>
        {/* Loading skeleton */}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt}
      className={`${className} ${onClick ? 'cursor-pointer' : ''}`}
      onError={handleImageError}
      onClick={onClick}
      loading='lazy'
    />
  );
};

export default DynamicLogo;
