import React, { useState, useEffect } from 'react';
import './AppDownloadSection.css';

const AppDownloadSection = () => {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  useEffect(() => {
    fetchAvailableDownloads();
  }, []);

  const fetchAvailableDownloads = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/apps/available');
      const data = await response.json();

      if (data.success) {
        setDownloads(data.data.platforms);
        // Auto-select detected platform
        const detected = data.data.platforms.find(p => p.isDetected);
        if (detected) {
          setSelectedPlatform(detected.platform);
        }
      } else {
        setError('Failed to load available downloads');
      }
    } catch (err) {
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (versionId, fileName) => {
    try {
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.href = `/api/apps/download/${versionId}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const getPlatformIcon = (iconClass) => {
    const iconMap = {
      'fa-windows': '🪟',
      'fa-apple': '🍎',
      'fa-linux': '🐧'
    };
    return iconMap[iconClass] || '💻';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="app-download-section">
        <div className="download-loading">
          <div className="loading-spinner"></div>
          <p>Loading available downloads...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-download-section">
        <div className="download-error">
          <h3>Download Unavailable</h3>
          <p>{error}</p>
          <button onClick={fetchAvailableDownloads} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-download-section">
      <div className="download-header">
        <h2>Download MockMate Desktop App</h2>
        <p>Get the full MockMate experience with our desktop application</p>
      </div>

      {/* Platform Selection */}
      <div className="platform-selection">
        {downloads.map((platform) => (
          <button
            key={platform.platform}
            className={`platform-btn ${selectedPlatform === platform.platform ? 'active' : ''} ${platform.isDetected ? 'detected' : ''}`}
            onClick={() => setSelectedPlatform(platform.platform)}
          >
            <span className="platform-icon">
              {getPlatformIcon(platform.icon)}
            </span>
            <span className="platform-name">{platform.displayName}</span>
            {platform.isDetected && (
              <span className="detected-badge">Detected</span>
            )}
          </button>
        ))}
      </div>

      {/* Selected Platform Downloads */}
      {selectedPlatform && (
        <div className="platform-downloads">
          {downloads
            .find(p => p.platform === selectedPlatform)
            ?.versions.map((version) => (
              <div
                key={version.id}
                className={`version-card ${version.isLatest ? 'latest' : ''} ${version.isBeta ? 'beta' : ''}`}
              >
                <div className="version-header">
                  <div className="version-info">
                    <h3>
                      {version.displayName || `MockMate ${version.version}`}
                      {version.isLatest && <span className="latest-badge">Latest</span>}
                      {version.isBeta && <span className="beta-badge">Beta</span>}
                    </h3>
                    <div className="version-meta">
                      <span className="version-number">v{version.version}</span>
                      <span className="file-size">{formatFileSize(version.fileSize)}</span>
                      <span className="release-date">{formatDate(version.createdAt)}</span>
                    </div>
                  </div>
                  <button
                    className="download-btn primary"
                    onClick={() => handleDownload(version.id, version.fileName)}
                  >
                    <span className="download-icon">⬇️</span>
                    Download
                  </button>
                </div>

                {version.description && (
                  <div className="version-description">
                    <p>{version.description}</p>
                  </div>
                )}

                {version.minOsVersion && (
                  <div className="system-requirements">
                    <small>
                      <strong>System Requirements:</strong> {selectedPlatform === 'windows' ? 'Windows' : selectedPlatform === 'macos' ? 'macOS' : 'Linux'} {version.minOsVersion} or later
                    </small>
                  </div>
                )}

                {version.changelog && (
                  <details className="version-details">
                    <summary>What's New</summary>
                    <div className="changelog">
                      <pre>{version.changelog}</pre>
                    </div>
                  </details>
                )}

                {version.releaseNotes && (
                  <details className="version-details">
                    <summary>Release Notes</summary>
                    <div className="release-notes">
                      <div dangerouslySetInnerHTML={{ __html: version.releaseNotes }} />
                    </div>
                  </details>
                )}

                <div className="version-footer">
                  <span className="download-count">
                    {version.downloadCount} downloads
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Feature Highlights */}
      <div className="desktop-features">
        <h3>Why Download the Desktop App?</h3>
        <div className="features-grid">
          <div className="feature-item">
            <span className="feature-icon">🚀</span>
            <h4>Better Performance</h4>
            <p>Optimized for desktop with faster loading times and smoother interactions</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔔</span>
            <h4>Native Notifications</h4>
            <p>Get desktop notifications for interview invitations and updates</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📱</span>
            <h4>Offline Access</h4>
            <p>Access your interview history and practice sessions even when offline</p>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔐</span>
            <h4>Enhanced Security</h4>
            <p>Advanced encryption and secure local storage for your data</p>
          </div>
        </div>
      </div>

      {/* System Requirements */}
      <div className="system-requirements-section">
        <h3>System Requirements</h3>
        <div className="requirements-grid">
          <div className="requirement-item">
            <h4>🪟 Windows</h4>
            <ul>
              <li>Windows 10 or later (64-bit)</li>
              <li>4 GB RAM minimum</li>
              <li>200 MB disk space</li>
            </ul>
          </div>
          <div className="requirement-item">
            <h4>🍎 macOS</h4>
            <ul>
              <li>macOS 10.15 (Catalina) or later</li>
              <li>4 GB RAM minimum</li>
              <li>200 MB disk space</li>
            </ul>
          </div>
          <div className="requirement-item">
            <h4>🐧 Linux</h4>
            <ul>
              <li>Ubuntu 18.04+ / Debian 10+ / CentOS 8+</li>
              <li>4 GB RAM minimum</li>
              <li>200 MB disk space</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppDownloadSection;
