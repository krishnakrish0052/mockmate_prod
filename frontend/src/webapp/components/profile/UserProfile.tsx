import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiCall } from '../../utils/apiUtils';
import { EyeIcon, EyeSlashIcon, UserIcon, KeyIcon } from '@heroicons/react/24/outline';

interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

const UserProfile: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'info' | 'security'>('info');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: '',
    lastName: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
      }));
    }
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const validatePassword = (password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/(?=.*[a-z])/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/(?=.*\d)/.test(password)) {
      return 'Password must contain at least one number';
    }
    return null;
  };

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      await apiCall('/users/profile', {
        method: 'PUT',
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
        }),
      });

      await refreshUser();
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to update profile',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Validate new password
    const passwordError = validatePassword(formData.newPassword);
    if (passwordError) {
      setMessage({ type: 'error', text: passwordError });
      setLoading(false);
      return;
    }

    // Check password confirmation
    if (formData.newPassword !== formData.confirmNewPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setLoading(false);
      return;
    }

    try {
      await apiCall('/users/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      // Clear password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      }));

      setMessage({ type: 'success', text: 'Password changed successfully!' });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to change password',
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-cli-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-cli-light-gray font-mono">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cli-black p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary-500 mb-2 font-mono">
            User Profile
          </h1>
          <p className="text-cli-gray font-mono">Manage your account settings and security</p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('info')}
              className={`flex items-center px-3 py-2 font-mono text-sm ${
                activeTab === 'info'
                  ? 'text-primary-500 border-b-2 border-primary-500'
                  : 'text-cli-gray hover:text-cli-light-gray'
              } transition-colors`}
            >
              <UserIcon className="w-4 h-4 mr-2" />
              Personal Information
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center px-3 py-2 font-mono text-sm ${
                activeTab === 'security'
                  ? 'text-primary-500 border-b-2 border-primary-500'
                  : 'text-cli-gray hover:text-cli-light-gray'
              } transition-colors`}
            >
              <KeyIcon className="w-4 h-4 mr-2" />
              Security Settings
            </button>
          </nav>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-md font-mono text-sm ${
              message.type === 'success'
                ? 'bg-green-900/20 border border-green-500 text-green-400'
                : 'bg-red-900/20 border border-red-500 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Content */}
        <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-8">
          {activeTab === 'info' && (
            <form onSubmit={handleInfoSubmit} className="space-y-6">
              <h2 className="text-xl font-bold text-cli-light-gray mb-6 font-mono">
                Personal Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-cli-gray rounded-md bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                    placeholder="Enter your first name"
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 border border-cli-gray rounded-md bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                    placeholder="Enter your last name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-cli-gray rounded-md bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                  placeholder="Enter your email address"
                />
                <p className="text-cli-gray text-xs mt-1 font-mono">
                  Note: Changing your email will require verification
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-primary-500 text-cli-black font-bold rounded-md hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                >
                  {loading ? 'Updating...' : 'Update Information'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <h2 className="text-xl font-bold text-cli-light-gray mb-6 font-mono">
                Change Password
              </h2>

              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    id="currentPassword"
                    name="currentPassword"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-cli-gray rounded-md bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                    placeholder="Enter your current password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cli-gray hover:text-primary-500"
                    onClick={() => togglePasswordVisibility('current')}
                  >
                    {showPasswords.current ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    id="newPassword"
                    name="newPassword"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-cli-gray rounded-md bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                    placeholder="Enter your new password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cli-gray hover:text-primary-500"
                    onClick={() => togglePasswordVisibility('new')}
                  >
                    {showPasswords.new ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="text-cli-gray text-xs mt-1 font-mono">
                  Must be 8+ characters with uppercase, lowercase, and number
                </p>
              </div>

              <div>
                <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-cli-light-gray mb-2 font-mono">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    id="confirmNewPassword"
                    name="confirmNewPassword"
                    value={formData.confirmNewPassword}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 pr-10 border border-cli-gray rounded-md bg-cli-black text-cli-light-gray focus:outline-none focus:ring-primary-500 focus:border-primary-500 font-mono"
                    placeholder="Confirm your new password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cli-gray hover:text-primary-500"
                    onClick={() => togglePasswordVisibility('confirm')}
                  >
                    {showPasswords.confirm ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-primary-500 text-cli-black font-bold rounded-md hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Account Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-6">
            <h3 className="text-lg font-bold text-primary-500 mb-2 font-mono">Credits</h3>
            <p className="text-2xl font-bold text-cli-light-gray font-mono">{user.credits || 0}</p>
            <p className="text-cli-gray text-sm font-mono">Available interview credits</p>
          </div>

          <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-6">
            <h3 className="text-lg font-bold text-primary-500 mb-2 font-mono">Account Status</h3>
            <p className="text-lg font-bold text-green-400 font-mono">Active</p>
            <p className="text-cli-gray text-sm font-mono">Email verified</p>
          </div>

          <div className="bg-cli-dark-gray border border-cli-gray rounded-lg p-6">
            <h3 className="text-lg font-bold text-primary-500 mb-2 font-mono">Member Since</h3>
            <p className="text-lg font-bold text-cli-light-gray font-mono">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
            </p>
            <p className="text-cli-gray text-sm font-mono">Registration date</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
