import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
  MatrixRain,
} from '../ui/CliComponents';
import './AppManagement.css';

interface Platform {
  id: string;
  name: string;
  display_name: string;
  icon: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

interface AppVersion {
  id: string;
  platform_id: string;
  platform_name: string;
  platform_display_name: string;
  platform_icon: string;
  version: string;
  display_name?: string;
  description?: string;
  changelog?: string;
  release_notes?: string;
  file_name: string;
  file_size: number;
  file_path: string;
  min_os_version?: string;
  is_latest: boolean;
  is_beta: boolean;
  is_featured: boolean;
  is_active: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
}

interface Statistics {
  platformStats: Array<{
    platform: string;
    download_count: number;
    unique_downloads: number;
  }>;
  versionStats: Array<{
    platform: string;
    version: string;
    download_count: number;
  }>;
}

interface UploadForm {
  platformId: string;
  version: string;
  displayName: string;
  description: string;
  changelog: string;
  releaseNotes: string;
  minOsVersion: string;
  isBeta: boolean;
  isFeatured: boolean;
  file: File | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface EditVersionModalProps {
  version: AppVersion;
  onSave: (versionId: string, updates: any) => Promise<void>;
  onClose: () => void;
}

const AppManagement: React.FC = () => {
  const { token, isAuthenticated } = useAdminAuth();
  const [activeTab, setActiveTab] = useState('versions');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingVersion, setEditingVersion] = useState<AppVersion | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  // Form states
  const [uploadForm, setUploadForm] = useState<UploadForm>({
    platformId: '',
    version: '',
    displayName: '',
    description: '',
    changelog: '',
    releaseNotes: '',
    minOsVersion: '',
    isBeta: false,
    isFeatured: false,
    file: null,
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    await Promise.all([fetchPlatforms(), fetchVersions(), fetchStatistics()]);
  };

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    if (!token) {
      throw new Error('No authentication token available');
    }
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const url = `${apiBaseUrl}/api${endpoint}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        // Don't set Content-Type for FormData - let browser set it with boundary
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'API request failed');
    }

    return response.json();
  };

  const fetchPlatforms = async () => {
    try {
      const data = await apiCall('/admin/apps/platforms');
      setPlatforms(data.data.platforms);
    } catch (err) {
      setError('Failed to load platforms: ' + (err as Error).message);
    }
  };

  const fetchVersions = async (page = 1, limit = 10) => {
    try {
      setLoading(true);
      const data = await apiCall(`/admin/apps/versions?page=${page}&limit=${limit}`);
      setVersions(data.data.versions);
      setPagination(data.data.pagination);
    } catch (err) {
      setError('Failed to load versions: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const data = await apiCall('/admin/apps/statistics');
      setStatistics(data.data);
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) {
      setError('Please select a file to upload');
      return;
    }

    const formData = new FormData();
    Object.entries(uploadForm).forEach(([key, value]) => {
      if (value !== null && value !== '') {
        // Use 'appFile' as the field name for the file to match backend expectation
        const fieldName = key === 'file' ? 'appFile' : key;
        formData.append(fieldName, value as string | Blob);
      }
    });

    return new Promise<void>((resolve, reject) => {
      if (!token) {
        reject(new Error('No authentication token available'));
        return;
      }

      setLoading(true);
      setUploadProgress(0);
      setError('');

      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
      const uploadUrl = `${apiBaseUrl}/api/admin/apps/versions/upload`;
      
      console.log('🚀 Starting upload to:', uploadUrl);
      console.log('📁 File size:', uploadForm.file?.size, 'bytes');
      console.log('📁 File name:', uploadForm.file?.name);
      
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
          console.log(`📊 Upload progress: ${percentComplete}%`);
        }
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            console.log('✅ Upload successful:', result);
            
            setUploadProgress(100);
            setShowUploadModal(false);
            resetUploadForm();
            fetchVersions();
            setLoading(false);
            resolve();
          } catch (parseError) {
            console.error('❌ Failed to parse response:', parseError);
            setError('Upload failed: Invalid server response');
            setLoading(false);
            reject(parseError);
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            console.error('❌ Upload failed:', errorData);
            setError(`Upload failed: ${errorData.message || xhr.statusText}`);
          } catch {
            console.error('❌ Upload failed:', xhr.statusText);
            setError(`Upload failed: ${xhr.status} ${xhr.statusText}`);
          }
          setLoading(false);
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        console.error('❌ Upload failed: Network error');
        setError('Upload failed: Network error');
        setLoading(false);
        reject(new Error('Network error'));
      });
      
      // Handle abort
      xhr.addEventListener('abort', () => {
        console.log('⚠️ Upload aborted');
        setError('Upload was cancelled');
        setLoading(false);
        reject(new Error('Upload cancelled'));
      });
      
      // Set up the request
      xhr.open('POST', uploadUrl, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      
      // Send the request
      xhr.send(formData);
    });
  };

  const handleUpdateVersion = async (versionId: string, updates: any) => {
    try {
      setLoading(true);
      await apiCall(`/admin/apps/versions/${versionId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      setEditingVersion(null);
      fetchVersions();
    } catch (err) {
      setError('Failed to update version: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = async (versionId: string, versionName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete version ${versionName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await apiCall(`/admin/apps/versions/${versionId}`, {
        method: 'DELETE',
      });

      fetchVersions();
      fetchStatistics(); // Refresh stats after deletion
    } catch (err) {
      setError('Failed to delete version: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadForm({
      platformId: '',
      version: '',
      displayName: '',
      description: '',
      changelog: '',
      releaseNotes: '',
      minOsVersion: '',
      isBeta: false,
      isFeatured: false,
      file: null,
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return (
      new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString()
    );
  };

  const getPlatformIcon = (iconClass: string): string => {
    const iconMap: Record<string, string> = {
      'fa-windows': '🪟',
      'fa-apple': '🍎',
      'fa-linux': '🐧',
    };
    return iconMap[iconClass] || '💻';
  };

  const handlePlatformToggle = async (platformId: string, currentStatus: boolean) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    const confirmMessage = `Are you sure you want to ${action} this platform? This will ${currentStatus ? 'hide' : 'show'} it from the download page.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      setLoading(true);
      await apiCall(`/admin/apps/platforms/${platformId}/toggle`, {
        method: 'POST',
      });

      // Refresh platforms and statistics
      await Promise.all([fetchPlatforms(), fetchStatistics()]);
    } catch (err) {
      setError(`Failed to ${action} platform: ` + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='app-management'>
      <div className='app-management-header'>
        <h1>Desktop App Management</h1>
        <button
          className='btn btn-primary'
          onClick={() => setShowUploadModal(true)}
          disabled={loading}
        >
          <span className='btn-icon'>⬆️</span>
          Upload New Version
        </button>
      </div>

      {error && (
        <div className='alert alert-error'>
          <span className='alert-icon'>❌</span>
          {error}
          <button className='alert-close' onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className='app-management-tabs'>
        <button
          className={`tab ${activeTab === 'versions' ? 'active' : ''}`}
          onClick={() => setActiveTab('versions')}
        >
          📱 App Versions
        </button>
        <button
          className={`tab ${activeTab === 'platforms' ? 'active' : ''}`}
          onClick={() => setActiveTab('platforms')}
        >
          💻 Platforms
        </button>
        <button
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          📊 Analytics
        </button>
      </div>

      <div className='app-management-content'>
        {activeTab === 'versions' && (
          <div className='versions-tab'>
            <div className='versions-header'>
              <div className='versions-filters'>
                <select
                  onChange={e => {
                    // Filter by platform if needed
                  }}
                >
                  <option value=''>All Platforms</option>
                  {platforms.map(platform => (
                    <option key={platform.id} value={platform.name}>
                      {platform.display_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading && (
              <div className='loading-state'>
                <div className='loading-spinner'></div>
                <p>Loading versions...</p>
              </div>
            )}

            <div className='versions-grid'>
              {versions.map(version => (
                <div
                  key={version.id}
                  className={`version-card ${version.is_latest ? 'latest' : ''} ${version.is_beta ? 'beta' : ''}`}
                >
                  <div className='version-header'>
                    <div className='version-info'>
                      <h3>
                        <span className='platform-icon'>
                          {getPlatformIcon(version.platform_icon)}
                        </span>
                        {version.display_name ||
                          `${version.platform_display_name} ${version.version}`}
                        {version.is_latest && <span className='badge latest-badge'>Latest</span>}
                        {version.is_beta && <span className='badge beta-badge'>Beta</span>}
                        {version.is_featured && (
                          <span className='badge featured-badge'>Featured</span>
                        )}
                      </h3>
                      <div className='version-meta'>
                        <span className='version-number'>v{version.version}</span>
                        <span className='file-size'>{formatFileSize(version.file_size)}</span>
                        <span className='downloads'>{version.download_count} downloads</span>
                      </div>
                    </div>
                    <div className='version-actions'>
                      <button
                        className='btn btn-small btn-secondary'
                        onClick={() => setEditingVersion(version)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className='btn btn-small btn-danger'
                        onClick={() => handleDeleteVersion(version.id, version.version)}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  {version.description && (
                    <div className='version-description'>
                      <p>{version.description}</p>
                    </div>
                  )}

                  <div className='version-footer'>
                    <span className='created-date'>Created: {formatDate(version.created_at)}</span>
                    {version.min_os_version && (
                      <span className='os-requirement'>Min OS: {version.min_os_version}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {versions.length === 0 && !loading && (
              <div className='empty-state'>
                <div className='empty-icon'>📱</div>
                <h3>No App Versions</h3>
                <p>Upload your first desktop app version to get started.</p>
                <button className='btn btn-primary' onClick={() => setShowUploadModal(true)}>
                  Upload First Version
                </button>
              </div>
            )}

            {pagination.totalPages > 1 && (
              <div className='pagination'>
                <button
                  className='btn btn-secondary'
                  disabled={pagination.page <= 1}
                  onClick={() => fetchVersions(pagination.page - 1)}
                >
                  Previous
                </button>
                <span className='pagination-info'>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  className='btn btn-secondary'
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchVersions(pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'platforms' && (
          <div className='platforms-tab'>
            <div className='platforms-grid'>
              {platforms.map(platform => (
                <div
                  key={platform.id}
                  className={`platform-card ${platform.is_active ? 'active' : 'inactive'}`}
                  onClick={() => handlePlatformToggle(platform.id, platform.is_active)}
                >
                  <div className='platform-header'>
                    <span className='platform-icon'>{getPlatformIcon(platform.icon)}</span>
                    <h3>{platform.display_name}</h3>
                    <span className={`status-badge ${platform.is_active ? 'active' : 'inactive'}`}>
                      {platform.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className='platform-info'>
                    <p>
                      <strong>Platform ID:</strong> {platform.name}
                    </p>
                    <p>
                      <strong>Sort Order:</strong> {platform.sort_order}
                    </p>
                    <p>
                      <strong>Created:</strong> {formatDate(platform.created_at)}
                    </p>
                    <p>
                      <strong>Versions:</strong>{' '}
                      {versions.filter(v => v.platform_id === platform.id).length} versions
                    </p>
                    <p>
                      <strong>Downloads:</strong>{' '}
                      {statistics?.platformStats.find(s => s.platform === platform.display_name)
                        ?.download_count || 0}{' '}
                      total
                    </p>
                  </div>
                  <div className='platform-actions'>
                    <span className='click-hint'>
                      Click to {platform.is_active ? 'deactivate' : 'activate'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {platforms.length === 0 && !loading && (
              <div className='empty-state'>
                <div className='empty-icon'>💻</div>
                <h3>No Platforms Available</h3>
                <p>Platform configuration is managed at the system level.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className='analytics-tab'>
            {statistics && (
              <>
                <div className='analytics-summary'>
                  <div className='stat-card'>
                    <h3>Total Downloads</h3>
                    <div className='stat-number'>
                      {statistics.platformStats.reduce(
                        (acc, stat) => acc + parseInt(stat.download_count.toString()),
                        0
                      )}
                    </div>
                  </div>
                  <div className='stat-card'>
                    <h3>Unique Users</h3>
                    <div className='stat-number'>
                      {statistics.platformStats.reduce(
                        (acc, stat) => acc + parseInt(stat.unique_downloads.toString()),
                        0
                      )}
                    </div>
                  </div>
                  <div className='stat-card'>
                    <h3>Active Versions</h3>
                    <div className='stat-number'>{versions.length}</div>
                  </div>
                  <div className='stat-card'>
                    <h3>Platforms</h3>
                    <div className='stat-number'>{platforms.filter(p => p.is_active).length}</div>
                  </div>
                </div>

                <div className='analytics-charts'>
                  <div className='chart-card'>
                    <h3>Downloads by Platform</h3>
                    <div className='platform-stats'>
                      {statistics.platformStats.map(stat => (
                        <div key={stat.platform} className='platform-stat'>
                          <div className='platform-stat-header'>
                            <span className='platform-name'>{stat.platform}</span>
                            <span className='platform-downloads'>
                              {stat.download_count} downloads
                            </span>
                          </div>
                          <div className='platform-stat-bar'>
                            <div
                              className='platform-stat-fill'
                              style={{
                                width: `${(stat.download_count / Math.max(...statistics.platformStats.map(s => s.download_count))) * 100}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className='chart-card'>
                    <h3>Version Statistics</h3>
                    <div className='version-stats'>
                      {statistics.versionStats.slice(0, 10).map(stat => (
                        <div key={`${stat.platform}-${stat.version}`} className='version-stat'>
                          <span className='version-label'>
                            {getPlatformIcon('fa-' + stat.platform.toLowerCase())} {stat.platform} v
                            {stat.version}
                          </span>
                          <span className='version-downloads'>{stat.download_count} total</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className='modal-overlay'>
          <div className='modal'>
            <div className='modal-header'>
              <h2>Upload New App Version</h2>
              <button
                className='modal-close'
                onClick={() => {
                  setShowUploadModal(false);
                  resetUploadForm();
                  setUploadProgress(0);
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpload} className='upload-form'>
              <div className='form-row'>
                <div className='form-group'>
                  <label>Platform *</label>
                  <select
                    value={uploadForm.platformId}
                    onChange={e => setUploadForm({ ...uploadForm, platformId: e.target.value })}
                    required
                  >
                    <option value=''>Select Platform</option>
                    {platforms
                      .filter(p => p.is_active)
                      .map(platform => (
                        <option key={platform.id} value={platform.id}>
                          {getPlatformIcon(platform.icon)} {platform.display_name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className='form-group'>
                  <label>Version *</label>
                  <input
                    type='text'
                    placeholder='1.0.0'
                    pattern='\d+\.\d+\.\d+'
                    value={uploadForm.version}
                    onChange={e => setUploadForm({ ...uploadForm, version: e.target.value })}
                    required
                  />
                  <small>Format: x.y.z (e.g., 1.0.0)</small>
                </div>
              </div>

              <div className='form-group'>
                <label>App File *</label>
                <input
                  type='file'
                  accept='.exe,.msi,.dmg,.pkg,.deb,.rpm,.AppImage,.zip,.tar.gz'
                  onChange={e =>
                    setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })
                  }
                  required
                />
                <small>
                  Max size: 500MB. Supported: .exe, .msi, .dmg, .pkg, .deb, .rpm, .AppImage
                </small>
              </div>

              {uploadProgress > 0 && (
                <div className='upload-progress'>
                  <div className='progress-header'>
                    <span className='progress-label'>Upload Progress</span>
                    <span className='progress-percentage'>{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className='progress-bar'>
                    <div 
                      className='progress-fill' 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <div className='progress-details'>
                    {uploadForm.file && (
                      <>
                        <span className='file-info'>
                          📁 {uploadForm.file.name} ({formatFileSize(uploadForm.file.size)})
                        </span>
                        {uploadProgress < 100 && (
                          <span className='upload-status'>
                            🔄 Uploading... {Math.round(uploadProgress)}% complete
                          </span>
                        )}
                        {uploadProgress === 100 && (
                          <span className='upload-status'>
                            ✅ Upload complete! Processing...
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className='form-group'>
                <label>Display Name</label>
                <input
                  type='text'
                  placeholder='MockMate Desktop App'
                  value={uploadForm.displayName}
                  onChange={e => setUploadForm({ ...uploadForm, displayName: e.target.value })}
                />
              </div>

              <div className='form-group'>
                <label>Description</label>
                <textarea
                  placeholder='Brief description of this version...'
                  rows={3}
                  value={uploadForm.description}
                  onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })}
                ></textarea>
              </div>

              <div className='form-row'>
                <div className='form-group'>
                  <label>Minimum OS Version</label>
                  <input
                    type='text'
                    placeholder='10.0 / 10.15 / 18.04'
                    value={uploadForm.minOsVersion}
                    onChange={e => setUploadForm({ ...uploadForm, minOsVersion: e.target.value })}
                  />
                </div>

                <div className='form-group'>
                  <div className='checkbox-group'>
                    <label className='checkbox-label'>
                      <input
                        type='checkbox'
                        checked={uploadForm.isBeta}
                        onChange={e => setUploadForm({ ...uploadForm, isBeta: e.target.checked })}
                      />
                      <span className='checkmark'></span>
                      Beta Version
                    </label>
                    <label className='checkbox-label'>
                      <input
                        type='checkbox'
                        checked={uploadForm.isFeatured}
                        onChange={e =>
                          setUploadForm({ ...uploadForm, isFeatured: e.target.checked })
                        }
                      />
                      <span className='checkmark'></span>
                      Featured Version
                    </label>
                  </div>
                </div>
              </div>

              <div className='form-group'>
                <label>Changelog</label>
                <textarea
                  placeholder="What's new in this version..."
                  rows={4}
                  value={uploadForm.changelog}
                  onChange={e => setUploadForm({ ...uploadForm, changelog: e.target.value })}
                ></textarea>
              </div>

              <div className='form-group'>
                <label>Release Notes</label>
                <textarea
                  placeholder='Detailed release notes (supports HTML)...'
                  rows={4}
                  value={uploadForm.releaseNotes}
                  onChange={e => setUploadForm({ ...uploadForm, releaseNotes: e.target.value })}
                ></textarea>
              </div>

              <div className='modal-actions'>
                <button
                  type='button'
                  className='btn btn-secondary'
                  onClick={() => {
                    setShowUploadModal(false);
                    resetUploadForm();
                    setUploadProgress(0);
                  }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  className='btn btn-primary'
                  disabled={loading || !uploadForm.file}
                >
                  {loading ? 'Uploading...' : 'Upload Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Version Modal */}
      {editingVersion && (
        <EditVersionModal
          version={editingVersion}
          onSave={handleUpdateVersion}
          onClose={() => setEditingVersion(null)}
        />
      )}
    </div>
  );
};

// Edit Version Modal Component
const EditVersionModal: React.FC<EditVersionModalProps> = ({ version, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    displayName: version.display_name || '',
    description: version.description || '',
    changelog: version.changelog || '',
    releaseNotes: version.release_notes || '',
    minOsVersion: version.min_os_version || '',
    isBeta: version.is_beta || false,
    isFeatured: version.is_featured || false,
    isActive: version.is_active !== false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(version.id, formData);
  };

  return (
    <div className='modal-overlay'>
      <div className='modal'>
        <div className='modal-header'>
          <h2>Edit Version {version.version}</h2>
          <button className='modal-close' onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className='edit-form'>
          <div className='form-group'>
            <label>Display Name</label>
            <input
              type='text'
              value={formData.displayName}
              onChange={e => setFormData({ ...formData, displayName: e.target.value })}
            />
          </div>

          <div className='form-group'>
            <label>Description</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            ></textarea>
          </div>

          <div className='form-group'>
            <label>Minimum OS Version</label>
            <input
              type='text'
              value={formData.minOsVersion}
              onChange={e => setFormData({ ...formData, minOsVersion: e.target.value })}
            />
          </div>

          <div className='form-group'>
            <div className='checkbox-group'>
              <label className='checkbox-label'>
                <input
                  type='checkbox'
                  checked={formData.isBeta}
                  onChange={e => setFormData({ ...formData, isBeta: e.target.checked })}
                />
                <span className='checkmark'></span>
                Beta Version
              </label>
              <label className='checkbox-label'>
                <input
                  type='checkbox'
                  checked={formData.isFeatured}
                  onChange={e => setFormData({ ...formData, isFeatured: e.target.checked })}
                />
                <span className='checkmark'></span>
                Featured Version
              </label>
              <label className='checkbox-label'>
                <input
                  type='checkbox'
                  checked={formData.isActive}
                  onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <span className='checkmark'></span>
                Active
              </label>
            </div>
          </div>

          <div className='form-group'>
            <label>Changelog</label>
            <textarea
              rows={4}
              value={formData.changelog}
              onChange={e => setFormData({ ...formData, changelog: e.target.value })}
            ></textarea>
          </div>

          <div className='form-group'>
            <label>Release Notes</label>
            <textarea
              rows={4}
              value={formData.releaseNotes}
              onChange={e => setFormData({ ...formData, releaseNotes: e.target.value })}
            ></textarea>
          </div>

          <div className='modal-actions'>
            <button type='button' className='btn btn-secondary' onClick={onClose}>
              Cancel
            </button>
            <button type='submit' className='btn btn-primary'>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AppManagement;
