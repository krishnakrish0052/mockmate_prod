import React, { useState, useEffect } from 'react';
import { Alert } from '../../components/alerts/AlertNotification';
import alertService, { CreateAlertRequest, AlertTemplate } from '../../services/alertService';

interface AlertFormProps {
  initialAlert?: Partial<CreateAlertRequest>;
  alertId?: string;
  onSubmit?: (alert: Alert) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

export const AlertForm: React.FC<AlertFormProps> = ({
  initialAlert = {},
  alertId,
  onSubmit,
  onCancel,
  submitLabel = 'Create Alert',
}) => {
  const [formData, setFormData] = useState<CreateAlertRequest>({
    title: '',
    message: '',
    alertType: 'info',
    priority: 'normal',
    targetUserIds: [],
    targetRoles: [],
    actionUrl: '',
    actionText: '',
    icon: '',
    isDismissible: true,
    sendEmail: false,
    emailTemplateId: '',
    ...initialAlert,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<AlertTemplate[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  // Load templates on mount
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const response = await alertService.getAlertTemplates();
        setTemplates(response?.templates?.filter(t => t.isActive) || []);
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    };

    loadTemplates();
  }, []);

  // Search users with debounce
  useEffect(() => {
    if (!userSearch.trim() || userSearch.length < 2) {
      setUserResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const response = await alertService.searchUsers(userSearch);
        setUserResults(
          response?.users?.filter(user => !selectedUsers.some(selected => selected.id === user.id)) || []
        );
      } catch (error) {
        console.error('Failed to search users:', error);
        setUserResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [userSearch, selectedUsers]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    }

    if (formData.targetUserIds.length === 0 && formData.targetRoles.length === 0) {
      newErrors.targeting = 'Please select target users or roles';
    }

    if (formData.actionUrl && formData.actionUrl.trim() && !formData.actionText?.trim()) {
      newErrors.actionText = 'Action text is required when action URL is provided';
    }

    if (expiresAt && new Date(expiresAt) <= new Date()) {
      newErrors.expiresAt = 'Expiration date must be in the future';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Update form data with selected users and expiration
      const submitData: CreateAlertRequest = {
        ...formData,
        targetUserIds: selectedUsers.map(user => user.id),
        ...(expiresAt && { expiresAt }),
      };

      let result;
      if (alertId) {
        result = await alertService.updateAlert(alertId, submitData);
      } else {
        result = await alertService.createAlert(submitData);
      }

      onSubmit?.(result.alert);
    } catch (error) {
      setErrors({
        general: error instanceof Error ? error.message : 'Failed to save alert',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (template: AlertTemplate) => {
    setFormData(prev => ({
      ...prev,
      title: template.title,
      message: template.message,
      alertType: template.alertType as any,
      priority: template.priority as any,
      actionUrl: template.actionUrl || '',
      actionText: template.actionText || '',
      icon: template.icon || '',
      isDismissible: template.isDismissible,
      emailTemplateId: template.emailTemplate || '',
    }));
  };

  const addUser = (user: User) => {
    setSelectedUsers(prev => [...prev, user]);
    setUserResults(prev => prev.filter(u => u.id !== user.id));
    setUserSearch('');
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(user => user.id !== userId));
  };

  const roles = ['admin', 'user', 'moderator', 'subscriber'];

  return (
    <div className='mx-auto max-w-4xl rounded-lg bg-cli-darker border border-cli-gray p-6 shadow-cli-border'>
      <div className='mb-6'>
        <h2 className='text-2xl font-bold text-cli-golden'>
          {alertId ? 'Edit Alert' : 'Create New Alert'}
        </h2>
        <p className='mt-2 text-cli-light-gray'>
          Create alerts to notify users about important information or updates.
        </p>
      </div>

      {errors.general && (
        <div className='mb-6 rounded-md border border-red-600 bg-cli-dark p-4 shadow-glow-red'>
          <p className='text-sm text-red-400 cli-glow'>{errors.general}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className='space-y-6'>
        {/* Template Selection */}
        {templates.length > 0 && !alertId && (
          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>
              Use Template (Optional)
            </label>
            <select
              onChange={e => {
                const template = templates.find(t => t.id === e.target.value);
                if (template) handleTemplateSelect(template);
              }}
              className='w-full rounded-md border border-cli-gray bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            >
              <option value=''>Select a template...</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} - {template.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Basic Information */}
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Title *</label>
            <input
              type='text'
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full rounded-md border bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:ring-1 transition-colors ${
                errors.title
                  ? 'border-red-500 focus:border-red-400 focus:ring-red-500'
                  : 'border-cli-gray focus:border-cli-golden focus:ring-cli-golden'
              }`}
              placeholder='Alert title...'
            />
            {errors.title && <p className='mt-1 text-sm text-red-400'>{errors.title}</p>}
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Alert Type</label>
            <select
              value={formData.alertType}
              onChange={e => setFormData(prev => ({ ...prev, alertType: e.target.value as any }))}
              className='w-full rounded-md border border-cli-gray bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            >
              <option value='info'>Info</option>
              <option value='warning'>Warning</option>
              <option value='error'>Error</option>
              <option value='success'>Success</option>
              <option value='announcement'>Announcement</option>
            </select>
          </div>
        </div>

        <div>
          <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Message *</label>
          <textarea
            value={formData.message}
            onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
            className={`w-full rounded-md border bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:ring-1 transition-colors ${
              errors.message
                ? 'border-red-500 focus:border-red-400 focus:ring-red-500'
                : 'border-cli-gray focus:border-cli-golden focus:ring-cli-golden'
            }`}
            rows={4}
            placeholder='Alert message...'
          />
          {errors.message && <p className='mt-1 text-sm text-red-400'>{errors.message}</p>}
        </div>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Priority</label>
            <select
              value={formData.priority}
              onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value as any }))}
              className='w-full rounded-md border border-cli-gray bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
            >
              <option value='low'>Low</option>
              <option value='normal'>Normal</option>
              <option value='high'>High</option>
              <option value='critical'>Critical</option>
            </select>
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Icon (Optional)</label>
            <input
              type='text'
              value={formData.icon}
              onChange={e => setFormData(prev => ({ ...prev, icon: e.target.value }))}
              className='w-full rounded-md border border-cli-gray bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
              placeholder='Icon name or emoji...'
            />
          </div>
        </div>

        {/* Targeting */}
        <div>
          <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Target Audience *</label>
          {errors.targeting && <p className='mb-2 text-sm text-red-400 cli-glow'>{errors.targeting}</p>}

          {/* Role Targeting */}
          <div className='mb-4'>
            <label className='mb-2 block text-sm text-cli-light-gray opacity-80'>By Role:</label>
            <div className='flex flex-wrap gap-3'>
              {roles.map(role => (
                <label key={role} className='flex items-center'>
                  <input
                    type='checkbox'
                    checked={formData.targetRoles?.includes(role) || false}
                    onChange={e => {
                      setFormData(prev => {
                        const targetRoles = prev.targetRoles || [];
                        if (e.target.checked) {
                          return { ...prev, targetRoles: [...targetRoles, role] };
                        } else {
                          return { ...prev, targetRoles: targetRoles.filter(r => r !== role) };
                        }
                      });
                    }}
                    className='mr-2 rounded border-cli-gray bg-cli-dark text-cli-golden focus:ring-cli-golden'
                  />
                  <span className='text-sm capitalize text-cli-white'>{role}</span>
                </label>
              ))}
            </div>
          </div>

          {/* User Targeting */}
          <div>
            <label className='mb-2 block text-sm text-cli-light-gray opacity-80'>Specific Users:</label>
            <input
              type='text'
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className='w-full rounded-md border border-cli-gray bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
              placeholder='Search users by name or email...'
            />

            {/* User Search Results */}
            {userResults.length > 0 && (
              <div className='mt-2 max-h-40 overflow-y-auto rounded-md border border-cli-gray bg-cli-dark'>
                {userResults.map(user => (
                  <button
                    key={user.id}
                    type='button'
                    onClick={() => addUser(user)}
                    className='w-full border-b border-cli-gray px-3 py-2 text-left last:border-b-0 hover:bg-cli-gray transition-colors text-cli-white'
                  >
                    <div className='font-medium text-cli-golden'>{user.name}</div>
                    <div className='text-sm text-cli-light-gray'>{user.email}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Users */}
            {selectedUsers.length > 0 && (
              <div className='mt-3'>
                <div className='mb-2 text-sm text-cli-light-gray opacity-80'>Selected Users:</div>
                <div className='flex flex-wrap gap-2'>
                  {selectedUsers.map(user => (
                    <span
                      key={user.id}
                      className='inline-flex items-center rounded-full bg-cli-golden bg-opacity-20 border border-cli-golden px-2.5 py-0.5 text-xs font-medium text-cli-golden'
                    >
                      {user.name}
                      <button
                        type='button'
                        onClick={() => removeUser(user.id)}
                        className='ml-1.5 text-cli-amber hover:text-cli-golden transition-colors'
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action URL */}
        <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>
              Action URL (Optional)
            </label>
            <input
              type='url'
              value={formData.actionUrl}
              onChange={e => setFormData(prev => ({ ...prev, actionUrl: e.target.value }))}
              className='w-full rounded-md border border-cli-gray bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:border-cli-golden focus:ring-1 focus:ring-cli-golden transition-colors'
              placeholder='https://example.com/action'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-cli-light-gray'>Action Text</label>
            <input
              type='text'
              value={formData.actionText}
              onChange={e => setFormData(prev => ({ ...prev, actionText: e.target.value }))}
              className={`w-full rounded-md border bg-cli-dark text-cli-white px-3 py-2 focus:outline-none focus:ring-1 transition-colors ${
                errors.actionText
                  ? 'border-red-500 focus:border-red-400 focus:ring-red-500'
                  : 'border-cli-gray focus:border-cli-golden focus:ring-cli-golden'
              }`}
              placeholder='View Details'
            />
            {errors.actionText && <p className='mt-1 text-sm text-red-400'>{errors.actionText}</p>}
          </div>
        </div>

        {/* Advanced Options */}
        <div>
          <button
            type='button'
            onClick={() => setShowAdvanced(!showAdvanced)}
            className='text-sm font-medium text-cli-cyan hover:text-cli-golden transition-colors'
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>
        </div>

        {showAdvanced && (
          <div className='grid grid-cols-1 gap-6 rounded-md bg-cli-dark border border-cli-gray p-4 md:grid-cols-2'>
            <div>
              <label className='mb-2 block text-sm font-medium text-cli-light-gray'>
                Expires At (Optional)
              </label>
              <input
                type='datetime-local'
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className={`w-full rounded-md border bg-cli-darker text-cli-white px-3 py-2 focus:outline-none focus:ring-1 transition-colors ${
                  errors.expiresAt
                    ? 'border-red-500 focus:border-red-400 focus:ring-red-500'
                    : 'border-cli-gray focus:border-cli-golden focus:ring-cli-golden'
                }`}
              />
              {errors.expiresAt && <p className='mt-1 text-sm text-red-400'>{errors.expiresAt}</p>}
            </div>

            <div className='space-y-3'>
              <label className='flex items-center'>
                <input
                  type='checkbox'
                  checked={formData.isDismissible}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, isDismissible: e.target.checked }))
                  }
                  className='mr-2 rounded border-cli-gray bg-cli-dark text-cli-golden focus:ring-cli-golden'
                />
                <span className='text-sm text-cli-white'>Allow users to dismiss this alert</span>
              </label>

              <label className='flex items-center'>
                <input
                  type='checkbox'
                  checked={formData.sendEmail}
                  onChange={e => setFormData(prev => ({ ...prev, sendEmail: e.target.checked }))}
                  className='mr-2 rounded border-cli-gray bg-cli-dark text-cli-golden focus:ring-cli-golden'
                />
                <span className='text-sm text-cli-white'>Send email notification</span>
              </label>
            </div>
          </div>
        )}

        {/* Submit Buttons */}
        <div className='flex justify-end space-x-3 border-t border-cli-gray pt-6'>
          {onCancel && (
            <button
              type='button'
              onClick={onCancel}
              className='rounded-md border border-cli-gray bg-cli-dark px-4 py-2 text-cli-light-gray hover:bg-cli-gray hover:text-cli-white focus:outline-none focus:ring-1 focus:ring-cli-golden transition-colors'
              disabled={loading}
            >
              Cancel
            </button>
          )}

          <button
            type='submit'
            disabled={loading}
            className='flex items-center rounded-md bg-cli-golden px-6 py-2 text-cli-black font-medium hover:bg-cli-amber focus:outline-none focus:ring-1 focus:ring-cli-golden disabled:cursor-not-allowed disabled:opacity-50 transition-colors'
          >
            {loading && (
              <svg
                className='-ml-1 mr-3 h-5 w-5 animate-spin text-cli-black'
                fill='none'
                viewBox='0 0 24 24'
              >
                <circle
                  cx='12'
                  cy='12'
                  r='10'
                  stroke='currentColor'
                  strokeWidth='4'
                  className='opacity-25'
                ></circle>
                <path
                  fill='currentColor'
                  d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                  className='opacity-75'
                ></path>
              </svg>
            )}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AlertForm;
