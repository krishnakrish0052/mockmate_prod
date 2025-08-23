import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliInput,
  CliSelect,
} from '../components/ui/CliComponents';
import {
  UserCircleIcon,
  KeyIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  BellIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface AdminProfile {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  twoFactorEnabled: boolean;
  timezone: string;
  notificationSettings: {
    emailAlerts: boolean;
    systemAlerts: boolean;
    securityAlerts: boolean;
  };
  createdAt: string;
  lastLogin: string;
  loginAttempts: number;
  isActive: boolean;
}

const AdminProfile: React.FC = () => {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    timezone: '',
    notificationSettings: {
      emailAlerts: true,
      systemAlerts: true,
      securityAlerts: true,
    },
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin-profile/me', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const profileData = result.data;
          setProfile(profileData);
          setProfileForm({
            firstName: profileData.firstName || '',
            lastName: profileData.lastName || '',
            email: profileData.email || '',
            timezone: profileData.timezone || 'UTC',
            notificationSettings: profileData.notificationPreferences || {
              emailAlerts: true,
              systemAlerts: true,
              securityAlerts: true,
            },
          });
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to fetch profile:', errorResult.message);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async () => {
    setSaving(true);
    try {
      const updateData = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        email: profileForm.email,
        timezone: profileForm.timezone,
        notificationPreferences: profileForm.notificationSettings,
      };

      const response = await fetch('/api/admin-profile/me', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchProfile(); // Refresh the full profile data
          alert('Profile updated successfully!');
        } else {
          console.error('Failed to update profile:', result.message);
          alert('Failed to update profile: ' + result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to update profile:', errorResult.message);
        alert('Failed to update profile: ' + errorResult.message);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
      alert('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      alert('New password must be at least 8 characters long');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin-profile/me/change-password', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setPasswordForm({
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          });
          alert('Password changed successfully!');
        } else {
          console.error('Failed to change password:', result.message);
          alert('Failed to change password: ' + result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to change password:', errorResult.message);
        alert('Failed to change password: ' + errorResult.message);
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      alert('Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const toggle2FA = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin-profile/2fa', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: !profile?.twoFactorEnabled,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          fetchProfile(); // Refresh profile
          alert(
            `Two-factor authentication ${!profile?.twoFactorEnabled ? 'enabled' : 'disabled'}!`
          );
        } else {
          console.error('Failed to toggle 2FA:', result.message);
          alert('Failed to toggle 2FA: ' + result.message);
        }
      } else {
        const errorResult = await response.json();
        console.error('Failed to toggle 2FA:', errorResult.message);
        alert('Failed to toggle 2FA: ' + errorResult.message);
      }
    } catch (error) {
      console.error('Failed to toggle 2FA:', error);
      alert('Failed to toggle 2FA');
    } finally {
      setSaving(false);
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'text-red-400';
      case 'admin':
        return 'text-primary-500';
      case 'moderator':
        return 'text-cli-cyan';
      default:
        return 'text-cli-light-gray';
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'ROOT';
      case 'admin':
        return 'ADMIN';
      case 'moderator':
        return 'MOD';
      default:
        return 'USER';
    }
  };

  if (loading) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./profile --loading'>
          <div className='p-6'>
            <TypingText
              text='Loading admin profile...'
              className='mb-4 text-xl font-semibold text-primary-500'
            />
            <div className='animate-pulse space-y-4'>
              <div className='h-4 w-3/4 rounded bg-cli-gray'></div>
              <div className='h-4 w-1/2 rounded bg-cli-gray'></div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className='space-y-6'>
        <TerminalWindow title='admin@mockmate:~$ ./profile --error'>
          <div className='p-6'>
            <TypingText
              text='Failed to Load Profile'
              className='mb-4 text-xl font-semibold text-red-500'
            />
            <div className='space-y-2 font-mono text-sm text-cli-light-gray'>
              <div>$ ./profile-loader --diagnose</div>
              <div className='pl-6 text-red-500'>ERROR: Profile data not found</div>
              <CliButton variant='primary' onClick={fetchProfile}>
                Retry
              </CliButton>
            </div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: UserCircleIcon },
    { id: 'security', label: 'Security', icon: ShieldCheckIcon },
    { id: 'preferences', label: 'Preferences', icon: GlobeAltIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
  ];

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./profile --edit --interactive'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-4'>
              <div className='bg-cli-terminal flex h-12 w-12 items-center justify-center rounded-full'>
                <UserCircleIcon className='h-6 w-6 text-primary-500' />
              </div>
              <div>
                <TypingText
                  text={`${profile.firstName} ${profile.lastName}`.trim() || profile.username}
                  className='font-mono text-xl font-bold text-primary-500'
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  @{profile.username} • {profile.email}
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-4'>
              <CliBadge variant={profile.isActive ? 'success' : 'danger'}>
                {profile.isActive ? 'ACTIVE' : 'INACTIVE'}
              </CliBadge>
              <div
                className={`rounded px-2 py-1 font-mono text-xs uppercase ${getRoleColor(profile.role)} border border-current`}
              >
                {getRoleBadge(profile.role)}
              </div>
            </div>
          </div>

          {/* Profile Stats */}
          <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-3'>
            <CliCard>
              <div className='p-4 text-center'>
                <div className='font-mono text-2xl font-bold text-cli-green'>
                  {new Date(profile.createdAt).toLocaleDateString()}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Member Since</div>
              </div>
            </CliCard>
            <CliCard>
              <div className='p-4 text-center'>
                <div className='font-mono text-2xl font-bold text-cli-cyan'>
                  {profile.lastLogin ? new Date(profile.lastLogin).toLocaleDateString() : 'Never'}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Last Login</div>
              </div>
            </CliCard>
            <CliCard>
              <div className='p-4 text-center'>
                <div className='font-mono text-2xl font-bold text-cli-amber'>
                  {profile.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                </div>
                <div className='font-mono text-sm text-cli-light-gray'>Two-Factor Auth</div>
              </div>
            </CliCard>
          </div>

          {/* Tab Navigation */}
          <div className='flex space-x-2 overflow-x-auto'>
            {tabs.map(tab => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 rounded px-4 py-2 font-mono text-sm transition-all ${
                    activeTab === tab.id
                      ? 'shadow-glow-primary bg-primary-500 text-white'
                      : 'bg-cli-terminal text-cli-light-gray hover:bg-cli-gray'
                  }`}
                >
                  <IconComponent className='h-4 w-4' />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className='mt-4 font-mono text-sm text-cli-green'>
            $ ./profile-manager --section={activeTab} --edit
          </div>
        </div>
      </TerminalWindow>

      {/* Profile Settings */}
      <TerminalWindow title={`admin@mockmate:~$ cat ~/.config/${activeTab}.conf`}>
        <div className='p-6'>
          {activeTab === 'profile' && (
            <div className='space-y-6'>
              <div>
                <h3 className='mb-4 font-mono font-bold text-primary-500'>Basic Information</h3>
                <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      First Name
                    </label>
                    <CliInput
                      value={profileForm.firstName}
                      onChange={e =>
                        setProfileForm(prev => ({ ...prev, firstName: e.target.value }))
                      }
                      placeholder='Enter first name'
                    />
                  </div>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Last Name
                    </label>
                    <CliInput
                      value={profileForm.lastName}
                      onChange={e =>
                        setProfileForm(prev => ({ ...prev, lastName: e.target.value }))
                      }
                      placeholder='Enter last name'
                    />
                  </div>
                  <div className='md:col-span-2'>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Email Address
                    </label>
                    <CliInput
                      type='email'
                      value={profileForm.email}
                      onChange={e => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder='Enter email address'
                    />
                  </div>
                </div>
              </div>

              <div className='flex space-x-3'>
                <CliButton variant='primary' onClick={updateProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Profile'}
                </CliButton>
                <CliButton
                  variant='secondary'
                  onClick={() =>
                    setProfileForm({
                      firstName: profile.firstName || '',
                      lastName: profile.lastName || '',
                      email: profile.email || '',
                      timezone: profile.timezone || 'UTC',
                      notificationSettings: profile.notificationSettings || {
                        emailAlerts: true,
                        systemAlerts: true,
                        securityAlerts: true,
                      },
                    })
                  }
                >
                  Reset Changes
                </CliButton>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className='space-y-6'>
              {/* Password Change */}
              <div>
                <h3 className='mb-4 font-mono font-bold text-primary-500'>Change Password</h3>
                <div className='space-y-4'>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Current Password
                    </label>
                    <div className='relative'>
                      <CliInput
                        type={showPassword ? 'text' : 'password'}
                        value={passwordForm.currentPassword}
                        onChange={e =>
                          setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))
                        }
                        placeholder='Enter current password'
                      />
                      <button
                        type='button'
                        onClick={() => setShowPassword(!showPassword)}
                        className='absolute right-3 top-1/2 -translate-y-1/2 transform text-cli-light-gray hover:text-primary-500'
                      >
                        {showPassword ? (
                          <EyeSlashIcon className='h-4 w-4' />
                        ) : (
                          <EyeIcon className='h-4 w-4' />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      New Password
                    </label>
                    <CliInput
                      type='password'
                      value={passwordForm.newPassword}
                      onChange={e =>
                        setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))
                      }
                      placeholder='Enter new password'
                    />
                  </div>
                  <div>
                    <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                      Confirm New Password
                    </label>
                    <CliInput
                      type='password'
                      value={passwordForm.confirmPassword}
                      onChange={e =>
                        setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))
                      }
                      placeholder='Confirm new password'
                    />
                  </div>
                </div>
                <div className='mt-4 flex space-x-3'>
                  <CliButton
                    variant='primary'
                    onClick={changePassword}
                    disabled={
                      saving ||
                      !passwordForm.currentPassword ||
                      !passwordForm.newPassword ||
                      !passwordForm.confirmPassword
                    }
                  >
                    {saving ? 'Changing...' : 'Change Password'}
                  </CliButton>
                </div>
              </div>

              {/* Two-Factor Authentication */}
              <div className='border-t border-cli-gray pt-6'>
                <h3 className='mb-4 font-mono font-bold text-primary-500'>
                  Two-Factor Authentication
                </h3>
                <div className='flex items-center justify-between'>
                  <div>
                    <div className='mb-2 font-mono text-cli-white'>
                      2FA Status:{' '}
                      {profile.twoFactorEnabled ? (
                        <span className='text-cli-green'>ENABLED</span>
                      ) : (
                        <span className='text-cli-amber'>DISABLED</span>
                      )}
                    </div>
                    <div className='font-mono text-sm text-cli-light-gray'>
                      {profile.twoFactorEnabled
                        ? 'Your account is secured with two-factor authentication'
                        : 'Add an extra layer of security to your account'}
                    </div>
                  </div>
                  <CliButton
                    variant={profile.twoFactorEnabled ? 'danger' : 'success'}
                    onClick={toggle2FA}
                    disabled={saving}
                  >
                    {saving
                      ? 'Processing...'
                      : profile.twoFactorEnabled
                        ? 'Disable 2FA'
                        : 'Enable 2FA'}
                  </CliButton>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className='space-y-6'>
              <div>
                <h3 className='mb-4 font-mono font-bold text-primary-500'>Regional Settings</h3>
                <div>
                  <label className='mb-2 block font-mono text-sm text-cli-light-gray'>
                    Timezone
                  </label>
                  <CliSelect
                    value={profileForm.timezone}
                    onChange={e => setProfileForm(prev => ({ ...prev, timezone: e.target.value }))}
                    options={[
                      { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
                      { value: 'America/New_York', label: 'Eastern Time (ET)' },
                      { value: 'America/Chicago', label: 'Central Time (CT)' },
                      { value: 'America/Denver', label: 'Mountain Time (MT)' },
                      { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
                      { value: 'Europe/London', label: 'London (GMT)' },
                      { value: 'Europe/Paris', label: 'Paris (CET)' },
                      { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
                      { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
                      { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
                    ]}
                  />
                </div>
              </div>

              <div className='flex space-x-3'>
                <CliButton variant='primary' onClick={updateProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Preferences'}
                </CliButton>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className='space-y-6'>
              <div>
                <h3 className='mb-4 font-mono font-bold text-primary-500'>Notification Settings</h3>
                <div className='space-y-4'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <div className='font-mono text-cli-white'>Email Alerts</div>
                      <div className='font-mono text-sm text-cli-light-gray'>
                        Receive email notifications for important events
                      </div>
                    </div>
                    <label className='relative inline-flex cursor-pointer items-center'>
                      <input
                        type='checkbox'
                        checked={profileForm.notificationSettings.emailAlerts}
                        onChange={e =>
                          setProfileForm(prev => ({
                            ...prev,
                            notificationSettings: {
                              ...prev.notificationSettings,
                              emailAlerts: e.target.checked,
                            },
                          }))
                        }
                        className='peer sr-only'
                      />
                      <div className="peer h-6 w-11 rounded-full bg-cli-gray after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300"></div>
                    </label>
                  </div>

                  <div className='flex items-center justify-between'>
                    <div>
                      <div className='font-mono text-cli-white'>System Alerts</div>
                      <div className='font-mono text-sm text-cli-light-gray'>
                        Get notified about system events and maintenance
                      </div>
                    </div>
                    <label className='relative inline-flex cursor-pointer items-center'>
                      <input
                        type='checkbox'
                        checked={profileForm.notificationSettings.systemAlerts}
                        onChange={e =>
                          setProfileForm(prev => ({
                            ...prev,
                            notificationSettings: {
                              ...prev.notificationSettings,
                              systemAlerts: e.target.checked,
                            },
                          }))
                        }
                        className='peer sr-only'
                      />
                      <div className="peer h-6 w-11 rounded-full bg-cli-gray after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300"></div>
                    </label>
                  </div>

                  <div className='flex items-center justify-between'>
                    <div>
                      <div className='font-mono text-cli-white'>Security Alerts</div>
                      <div className='font-mono text-sm text-cli-light-gray'>
                        Important security-related notifications
                      </div>
                    </div>
                    <label className='relative inline-flex cursor-pointer items-center'>
                      <input
                        type='checkbox'
                        checked={profileForm.notificationSettings.securityAlerts}
                        onChange={e =>
                          setProfileForm(prev => ({
                            ...prev,
                            notificationSettings: {
                              ...prev.notificationSettings,
                              securityAlerts: e.target.checked,
                            },
                          }))
                        }
                        className='peer sr-only'
                      />
                      <div className="peer h-6 w-11 rounded-full bg-cli-gray after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300"></div>
                    </label>
                  </div>
                </div>
              </div>

              <div className='flex space-x-3'>
                <CliButton variant='primary' onClick={updateProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Notifications'}
                </CliButton>
              </div>
            </div>
          )}

          <div className='mt-6 font-mono text-xs text-cli-green'>
            $ echo "Profile section '{activeTab}' modified" &gt;&gt; ~/.admin_profile.log
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
};

export default AdminProfile;
