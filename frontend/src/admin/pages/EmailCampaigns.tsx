import React, { useState, useEffect, useRef } from 'react';
import {
  EnvelopeIcon,
  UserGroupIcon,
  ChartBarIcon,
  PlusIcon,
  EyeIcon,
  PaperAirplaneIcon,
  TrashIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { TerminalWindow, TypingText, CliBadge } from '../components/ui/CliComponents';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useAdminApi } from '../hooks/useAdminApi';
import { emailThemes } from '../components/EmailThemes';

interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  template_id: number;
  recipient_type: 'all_users' | 'specific_users' | 'custom_emails';
  total_recipients: number;
  sent_count: number;
  success_count: number;
  failed_count: number;
  created_at: string;
  sent_at?: string;
}

interface EmailTemplate {
  id: number;
  template_name: string;
  subject: string;
  template_type: string;
}

interface User {
  id: number;
  email: string;
  username: string;
  created_at: string;
}

const EmailCampaigns: React.FC = () => {
  const { user } = useAdminAuth();
  const { apiCall, loading: apiLoading, error: apiError } = useAdminApi();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'create'>('campaigns');
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Campaign creation/editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    subject: '',
    html_content: '',
    recipient_type: 'all_users' as const,
    specific_users: [] as number[],
    custom_emails: [] as string[],
    customEmailInput: '',
  });

  // HTML Editor state
  const [selectedTheme, setSelectedTheme] = useState('modern');
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [previewContent, setPreviewContent] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  // Available variables for email templates
  const availableVariables = [
    {
      key: 'USER_NAME',
      label: 'User Name',
      description: "The recipient's full name",
    },
    {
      key: 'USER_EMAIL',
      label: 'User Email',
      description: "The recipient's email address",
    },
    {
      key: 'TITLE',
      label: 'Email Title',
      description: 'Main heading/title of the email',
    },
    {
      key: 'CONTENT',
      label: 'Email Content',
      description: 'Main body content of the email',
    },
    {
      key: 'CTA_TEXT',
      label: 'Button Text',
      description: 'Call-to-action button text',
    },
    {
      key: 'CTA_LINK',
      label: 'Button Link',
      description: 'Call-to-action button URL',
    },
    {
      key: 'COMPANY_NAME',
      label: 'Company Name',
      description: 'Your company/brand name',
    },
    {
      key: 'SUPPORT_EMAIL',
      label: 'Support Email',
      description: 'Customer support email address',
    },
    {
      key: 'WEBSITE_URL',
      label: 'Website URL',
      description: 'Your website/platform URL',
    },
    {
      key: 'CURRENT_DATE',
      label: 'Current Date',
      description: "Today's date",
    },
    {
      key: 'HIGHLIGHT_TEXT',
      label: 'Highlight Text',
      description: 'Important highlighted information',
    },
    {
      key: 'FOOTER_TEXT',
      label: 'Footer Text',
      description: 'Additional footer information',
    },
  ];

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setError(null);
      const [campaignsData, templatesData, usersData] = await Promise.all([
        apiCall('email-notifications/campaigns'),
        apiCall('email-templates'),
        apiCall('email-notifications/users'),
      ]);

      setCampaigns(campaignsData.data?.campaigns || []);
      setTemplates(templatesData.data?.templates || []);
      setUsers(usersData.data?.users || []);
    } catch (err) {
      setError(`Failed to load data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleEditCampaign = (campaign: EmailCampaign) => {
    // Reset any previous messages
    setError(null);
    setSuccess(null);

    // Set editing state
    setIsEditing(true);
    setEditingCampaignId(campaign.id);

    // Load campaign data into the form
    setNewCampaign({
      name: campaign.name,
      subject: campaign.subject,
      html_content: '', // We'll need to fetch this from the API
      recipient_type: campaign.recipient_type,
      specific_users: [], // We'll need to fetch this from the API if it's specific_users
      custom_emails: [], // We'll need to fetch this from the API if it's custom_emails
      customEmailInput: '',
    });

    // Switch to create tab
    setActiveTab('create');

    // Load the full campaign details including HTML content and recipients
    loadCampaignDetails(campaign.id);
  };

  const loadCampaignDetails = async (campaignId: number) => {
    try {
      setLoading(true);
      const response = await apiCall(`email-notifications/campaigns/${campaignId}`);
      const campaignDetails = response.data?.campaign;

      if (campaignDetails) {
        // Update the form with full campaign details
        setNewCampaign(prev => ({
          ...prev,
          html_content: campaignDetails.html_content || '',
          specific_users: campaignDetails.recipient_data?.user_ids || [],
          custom_emails: campaignDetails.recipient_data?.emails || [],
        }));
      }
    } catch (err) {
      setError(
        `Failed to load campaign details: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validation
      if (
        newCampaign.recipient_type === 'specific_users' &&
        newCampaign.specific_users.length === 0
      ) {
        setError('Please select at least one user for specific users campaign.');
        setLoading(false);
        return;
      }

      if (
        newCampaign.recipient_type === 'custom_emails' &&
        newCampaign.custom_emails.length === 0
      ) {
        setError('Please add at least one email address for custom email campaign.');
        setLoading(false);
        return;
      }

      const campaignData = {
        name: newCampaign.name,
        subject: newCampaign.subject,
        html_content: newCampaign.html_content,
        recipient_type: newCampaign.recipient_type,
        ...(newCampaign.recipient_type === 'specific_users' && {
          recipient_data: { user_ids: newCampaign.specific_users },
        }),
        ...(newCampaign.recipient_type === 'custom_emails' && {
          recipient_data: { emails: newCampaign.custom_emails },
        }),
      };

      if (isEditing && editingCampaignId) {
        // Update existing campaign
        await apiCall(`email-notifications/campaigns/${editingCampaignId}`, {
          method: 'PUT',
          data: campaignData,
        });
        setSuccess('Campaign updated successfully!');
      } else {
        // Create new campaign
        await apiCall('email-notifications/campaigns', {
          method: 'POST',
          data: campaignData,
        });
        setSuccess('Campaign created successfully!');
      }

      // Reset form and state
      setActiveTab('campaigns');
      setIsEditing(false);
      setEditingCampaignId(null);
      setNewCampaign({
        name: '',
        subject: '',
        html_content: '',
        recipient_type: 'all_users',
        specific_users: [],
        custom_emails: [],
        customEmailInput: '',
      });
      loadInitialData();
    } catch (err) {
      setError(
        `Failed to ${isEditing ? 'update' : 'create'} campaign: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendCampaign = async (campaignId: number) => {
    if (!confirm('Are you sure you want to send this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await apiCall(`email-notifications/campaigns/${campaignId}/send`, {
        method: 'POST',
      });
      setSuccess('Campaign sending initiated!');
      loadInitialData();
    } catch (err) {
      setError(`Failed to send campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewCampaign = async (campaignId: number) => {
    try {
      setLoading(true);
      // Get campaign details first to get the HTML content
      const response = await apiCall(`email-notifications/campaigns/${campaignId}`);
      const campaignDetails = response.data;

      // Use the custom HTML content or template HTML for preview
      let htmlContent = campaignDetails.custom_html || campaignDetails.html_content;

      if (!htmlContent && campaignDetails.template_id) {
        // If no custom HTML, try to get template preview
        const templateResponse = await apiCall(
          `email-notifications/campaigns/preview/${campaignDetails.template_id}`
        );
        htmlContent = templateResponse.data?.preview || '';
      }

      // If still no content, create a basic preview
      if (!htmlContent) {
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #333;">${campaignDetails.subject || 'Campaign Preview'}</h1>
            <p>Hello {{USER_NAME}},</p>
            <p>This is a preview of the campaign: <strong>${campaignDetails.name}</strong></p>
            <p>Best regards,<br>The MockMate Team</p>
          </div>
        `;
      }

      // Replace variables with sample data for preview
      const previewVariables = {
        USER_NAME: 'John Doe',
        USER_EMAIL: 'john.doe@example.com',
        TITLE: campaignDetails.subject,
        CONTENT: 'Sample email content',
        CTA_TEXT: 'Click Here',
        CTA_LINK: '#',
        COMPANY_NAME: 'MockMate',
        SUPPORT_EMAIL: 'support@mockmate.com',
        WEBSITE_URL: 'https://mockmate.com',
        CURRENT_DATE: new Date().toLocaleDateString(),
        HIGHLIGHT_TEXT: 'Important Information',
        FOOTER_TEXT: 'Thank you for using MockMate',
      };

      let renderedHtml = htmlContent;
      Object.entries(previewVariables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        renderedHtml = renderedHtml.replace(regex, value);
      });

      setPreviewContent(renderedHtml);
      setShowPreview(true);
    } catch (err) {
      setError(`Failed to preview: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetCampaign = async (campaignId: number, campaignName: string) => {
    if (
      !confirm(
        `Are you sure you want to reset the campaign "${campaignName}" back to draft status? This will allow you to resend it.`
      )
    ) {
      return;
    }

    try {
      setLoading(true);
      await apiCall(`email-notifications/campaigns/${campaignId}/reset`, {
        method: 'PATCH',
      });
      setSuccess('Campaign status reset to draft successfully!');
      loadInitialData();
    } catch (err) {
      setError(`Failed to reset campaign: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: number, campaignName: string) => {
    if (!confirm(`Are you sure you want to delete the campaign "${campaignName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      await apiCall(`email-notifications/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      setSuccess('Campaign deleted successfully!');
      loadInitialData();
    } catch (err) {
      setError(
        `Failed to delete campaign: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const addCustomEmail = () => {
    if (
      newCampaign.customEmailInput.trim() &&
      newCampaign.customEmailInput.includes('@') &&
      !newCampaign.custom_emails.includes(newCampaign.customEmailInput.trim())
    ) {
      setNewCampaign({
        ...newCampaign,
        custom_emails: [...newCampaign.custom_emails, newCampaign.customEmailInput.trim()],
        customEmailInput: '',
      });
    }
  };

  const removeCustomEmail = (email: string) => {
    setNewCampaign({
      ...newCampaign,
      custom_emails: newCampaign.custom_emails.filter(e => e !== email),
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <ClockIcon className='h-5 w-5 text-cli-light-gray' />;
      case 'sending':
        return <PaperAirplaneIcon className='h-5 w-5 animate-pulse text-yellow-400' />;
      case 'sent':
        return <CheckCircleIcon className='h-5 w-5 text-green-400' />;
      case 'failed':
        return <XCircleIcon className='h-5 w-5 text-red-400' />;
      default:
        return <ClockIcon className='h-5 w-5 text-cli-light-gray' />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'text-cli-light-gray';
      case 'sending':
        return 'text-yellow-400';
      case 'sent':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-cli-light-gray';
    }
  };

  const getThemeTemplate = (theme: string) => {
    const themeData = emailThemes.find(t => t.id === theme);
    return themeData ? themeData.html : '';
  };

  const insertVariable = (variableKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const variable = `{{${variableKey}}}`;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentContent = newCampaign.html_content;

    // Insert the variable at cursor position
    const newContent =
      currentContent.substring(0, start) + variable + currentContent.substring(end);

    // Update the content
    setNewCampaign({ ...newCampaign, html_content: newContent });

    // Focus back on textarea and set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + variable.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const resetEditingState = () => {
    setIsEditing(false);
    setEditingCampaignId(null);
    setNewCampaign({
      name: '',
      subject: '',
      html_content: '',
      recipient_type: 'all_users',
      specific_users: [],
      custom_emails: [],
      customEmailInput: '',
    });
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow
        title='admin@mockmate:~$ ./email-campaigns --bulk-management'
        className='w-full'
      >
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <EnvelopeIcon className='h-8 w-8 text-primary-500' />
              <div>
                <h1 className='text-2xl font-bold text-cli-white'>Email Campaigns</h1>
                <TypingText
                  text='Manage bulk email notifications and promotional campaigns'
                  className='text-cli-light-gray'
                  speed={30}
                />
              </div>
            </div>
            <div className='flex space-x-2'>
              <button
                onClick={() => setActiveTab('campaigns')}
                className={`rounded-md px-4 py-2 transition-colors ${
                  activeTab === 'campaigns'
                    ? 'bg-primary-600 text-white'
                    : 'bg-cli-dark text-cli-light-gray hover:bg-cli-gray'
                }`}
              >
                Campaigns
              </button>
              <button
                onClick={() => {
                  resetEditingState();
                  setActiveTab('create');
                }}
                className={`flex items-center space-x-2 rounded-md px-4 py-2 transition-colors ${
                  activeTab === 'create'
                    ? 'bg-primary-600 text-white'
                    : 'bg-cli-dark text-cli-light-gray hover:bg-cli-gray'
                }`}
              >
                <PlusIcon className='h-4 w-4' />
                <span>Create Campaign</span>
              </button>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className='mb-4 rounded-md border border-green-400 bg-green-900/20 p-4'>
              <div className='flex items-center space-x-2'>
                <CheckCircleIcon className='h-5 w-5 text-green-400' />
                <span className='text-green-400'>{success}</span>
              </div>
            </div>
          )}

          {error && (
            <div className='mb-4 rounded-md border border-red-400 bg-red-900/20 p-4'>
              <div className='flex items-center space-x-2'>
                <ExclamationTriangleIcon className='h-5 w-5 text-red-400' />
                <span className='text-red-400'>{error}</span>
              </div>
            </div>
          )}

          {/* Content */}
          {activeTab === 'campaigns' ? (
            <div className='space-y-4'>
              {loading ? (
                <div className='py-8 text-center'>
                  <div className='inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent'></div>
                  <p className='mt-2 text-cli-light-gray'>Loading campaigns...</p>
                </div>
              ) : campaigns.length === 0 ? (
                <div className='py-8 text-center'>
                  <EnvelopeIcon className='mx-auto mb-4 h-16 w-16 text-cli-gray' />
                  <p className='text-cli-light-gray'>
                    No campaigns found. Create your first campaign!
                  </p>
                </div>
              ) : (
                <div className='grid gap-4'>
                  {campaigns.map(campaign => (
                    <div
                      key={campaign.id}
                      className='rounded-lg border border-cli-gray bg-cli-dark p-6'
                    >
                      <div className='mb-4 flex items-center justify-between'>
                        <div className='flex items-center space-x-3'>
                          {getStatusIcon(campaign.status)}
                          <div>
                            <h3 className='text-lg font-semibold text-cli-white'>
                              {campaign.name}
                            </h3>
                            <p className='text-sm text-cli-light-gray'>{campaign.subject}</p>
                          </div>
                        </div>
                        <div className='flex items-center space-x-2'>
                          <CliBadge variant={campaign.status === 'sent' ? 'success' : 'warning'}>
                            {campaign.status.toUpperCase()}
                          </CliBadge>
                        </div>
                      </div>

                      <div className='mb-4 grid grid-cols-2 gap-4 md:grid-cols-4'>
                        <div className='text-center'>
                          <UserGroupIcon className='mx-auto mb-1 h-6 w-6 text-cli-cyan' />
                          <p className='font-semibold text-cli-white'>
                            {campaign.total_recipients}
                          </p>
                          <p className='text-xs text-cli-light-gray'>Recipients</p>
                        </div>
                        <div className='text-center'>
                          <PaperAirplaneIcon className='mx-auto mb-1 h-6 w-6 text-blue-400' />
                          <p className='font-semibold text-cli-white'>{campaign.sent_count}</p>
                          <p className='text-xs text-cli-light-gray'>Sent</p>
                        </div>
                        <div className='text-center'>
                          <CheckCircleIcon className='mx-auto mb-1 h-6 w-6 text-green-400' />
                          <p className='font-semibold text-cli-white'>{campaign.success_count}</p>
                          <p className='text-xs text-cli-light-gray'>Success</p>
                        </div>
                        <div className='text-center'>
                          <XCircleIcon className='mx-auto mb-1 h-6 w-6 text-red-400' />
                          <p className='font-semibold text-cli-white'>{campaign.failed_count}</p>
                          <p className='text-xs text-cli-light-gray'>Failed</p>
                        </div>
                      </div>

                      <div className='flex items-center justify-between'>
                        <div className='text-sm text-cli-light-gray'>
                          Created: {new Date(campaign.created_at).toLocaleString()}
                          {campaign.sent_at && (
                            <span className='ml-4'>
                              Last Sent: {new Date(campaign.sent_at).toLocaleString()}
                            </span>
                          )}
                          {campaign.sent_count > 0 && (
                            <span className='ml-4 text-cli-cyan'>
                              Sent {campaign.sent_count} times
                            </span>
                          )}
                        </div>
                        <div className='flex space-x-2'>
                          <button
                            onClick={() => handlePreviewCampaign(campaign.id)}
                            className='rounded-md bg-cli-gray p-2 text-cli-white transition-colors hover:bg-cli-light-gray'
                            title='Preview'
                          >
                            <EyeIcon className='h-4 w-4' />
                          </button>
                          <button
                            onClick={() => handleSendCampaign(campaign.id)}
                            className='rounded-md bg-green-600 p-2 text-white transition-colors hover:bg-green-700'
                            title={campaign.sent_count > 0 ? 'Send Again' : 'Send Campaign'}
                            disabled={loading}
                          >
                            <PaperAirplaneIcon className='h-4 w-4' />
                          </button>
                          <button
                            onClick={() => handleEditCampaign(campaign)}
                            className='rounded-md bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700'
                            title='Edit Campaign'
                          >
                            <svg
                              className='h-4 w-4'
                              fill='none'
                              viewBox='0 0 24 24'
                              stroke='currentColor'
                            >
                              <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth={2}
                                d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
                              />
                            </svg>
                          </button>
                          {/* Development only: Reset campaign button */}
                          {campaign.status === 'sent' && process.env.NODE_ENV !== 'production' && (
                            <button
                              onClick={() => handleResetCampaign(campaign.id, campaign.name)}
                              className='rounded-md bg-yellow-600 p-2 text-white transition-colors hover:bg-yellow-700'
                              title='Reset to Draft (Development Only)'
                            >
                              <svg
                                className='h-4 w-4'
                                fill='none'
                                viewBox='0 0 24 24'
                                stroke='currentColor'
                              >
                                <path
                                  strokeLinecap='round'
                                  strokeLinejoin='round'
                                  strokeWidth={2}
                                  d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                                />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                            className='rounded-md bg-red-600 p-2 text-white transition-colors hover:bg-red-700'
                            title='Delete'
                          >
                            <TrashIcon className='h-4 w-4' />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Create/Edit Campaign Form
            <div className='mx-auto max-w-2xl space-y-6'>
              <h2 className='mb-4 text-xl font-semibold text-cli-white'>
                {isEditing ? 'Edit Campaign' : 'Create New Campaign'}
              </h2>

              {/* Campaign Name */}
              <div>
                <label className='mb-2 block text-sm font-medium text-cli-white'>
                  Campaign Name
                </label>
                <input
                  type='text'
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className='w-full rounded-md border border-cli-gray bg-cli-dark px-3 py-2 text-cli-white focus:border-primary-500 focus:outline-none'
                  placeholder='Enter campaign name...'
                />
              </div>

              {/* Subject */}
              <div>
                <label className='mb-2 block text-sm font-medium text-cli-white'>
                  Email Subject
                </label>
                <input
                  type='text'
                  value={newCampaign.subject}
                  onChange={e => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                  className='w-full rounded-md border border-cli-gray bg-cli-dark px-3 py-2 text-cli-white focus:border-primary-500 focus:outline-none'
                  placeholder='Enter email subject...'
                />
              </div>

              {/* Email Design */}
              <div>
                <label className='mb-2 block text-sm font-medium text-cli-white'>
                  Email Design
                </label>

                {/* Theme Selection */}
                <div className='mb-4'>
                  <label className='mb-2 block text-xs text-cli-light-gray'>Choose a Theme</label>
                  <div className='mb-4 grid grid-cols-2 gap-3 md:grid-cols-4'>
                    {['modern', 'professional', 'minimal', 'colorful'].map(theme => (
                      <button
                        key={theme}
                        type='button'
                        onClick={() => {
                          setSelectedTheme(theme);
                          // Load theme template into HTML content
                          const themeTemplate = getThemeTemplate(theme);
                          setNewCampaign({ ...newCampaign, html_content: themeTemplate });
                        }}
                        className={`rounded-lg border p-3 text-center transition-all ${
                          selectedTheme === theme
                            ? 'border-primary-500 bg-primary-600 text-white'
                            : 'border-cli-gray bg-cli-dark text-cli-light-gray hover:border-primary-500'
                        }`}
                      >
                        <div className='text-xs font-medium capitalize'>{theme}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* HTML Editor */}
                <div className='space-y-3'>
                  <div className='flex items-center justify-between'>
                    <label className='block text-xs text-cli-light-gray'>HTML Content</label>
                    <div className='flex items-center space-x-2'>
                      <button
                        type='button'
                        onClick={() => setShowVariables(!showVariables)}
                        className='text-xs text-primary-400 hover:text-primary-300'
                      >
                        {showVariables ? 'Hide Variables' : 'Show Variables'}
                      </button>
                      <button
                        type='button'
                        onClick={() => setShowHtmlPreview(!showHtmlPreview)}
                        className='text-xs text-primary-400 hover:text-primary-300'
                      >
                        {showHtmlPreview ? 'Hide Preview' : 'Show Preview'}
                      </button>
                    </div>
                  </div>

                  {/* Variables Panel */}
                  {showVariables && (
                    <div className='mb-4 rounded-md border border-cli-gray bg-cli-dark p-4'>
                      <h4 className='mb-3 text-sm font-medium text-cli-white'>
                        Available Variables
                      </h4>
                      <div className='grid grid-cols-2 gap-2 md:grid-cols-3'>
                        {availableVariables.map(variable => (
                          <button
                            key={variable.key}
                            type='button'
                            onClick={() => insertVariable(variable.key)}
                            className='rounded border border-cli-gray bg-cli-gray p-2 text-left text-xs text-cli-white transition-all hover:border-primary-500 hover:bg-cli-light-gray'
                            title={variable.description}
                          >
                            <div className='font-mono text-primary-400'>
                              {'{'}
                              {'{'}
                              {variable.key}
                              {'}'}
                              {'}'}
                            </div>
                            <div className='mt-1 text-xs text-cli-light-gray'>{variable.label}</div>
                          </button>
                        ))}
                      </div>
                      <div className='mt-3 text-xs text-cli-light-gray'>
                        💡 Click any variable to insert it at cursor position
                      </div>
                    </div>
                  )}

                  <div
                    className={`grid gap-4 ${showHtmlPreview ? 'md:grid-cols-2' : 'grid-cols-1'}`}
                  >
                    {/* HTML Editor */}
                    <div>
                      <textarea
                        ref={textareaRef}
                        value={newCampaign.html_content}
                        onChange={e =>
                          setNewCampaign({ ...newCampaign, html_content: e.target.value })
                        }
                        placeholder='Paste your HTML content here or select a theme above...'
                        className='h-64 w-full resize-none rounded-md border border-cli-gray bg-cli-dark px-3 py-2 font-mono text-sm text-cli-white focus:border-primary-500 focus:outline-none'
                      />
                      <div className='mt-2 text-xs text-cli-light-gray'>
                        💡 Use the "Show Variables" button above to insert dynamic content
                      </div>
                    </div>

                    {/* Preview */}
                    {showHtmlPreview && (
                      <div>
                        <div className='overflow-hidden rounded-md border border-cli-gray bg-white'>
                          <div className='border-b border-cli-gray bg-cli-dark p-2'>
                            <div className='text-xs text-cli-light-gray'>Preview</div>
                          </div>
                          <div className='h-64 overflow-auto'>
                            <div
                              dangerouslySetInnerHTML={{
                                __html:
                                  newCampaign.html_content ||
                                  '<div class="p-4 text-gray-500">Select a theme or add HTML content to see preview</div>',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recipient Type */}
              <div>
                <label className='mb-2 block text-sm font-medium text-cli-white'>Recipients</label>
                <div className='space-y-2'>
                  <label className='flex items-center'>
                    <input
                      type='radio'
                      name='recipient_type'
                      value='all_users'
                      checked={newCampaign.recipient_type === 'all_users'}
                      onChange={e =>
                        setNewCampaign({ ...newCampaign, recipient_type: e.target.value as any })
                      }
                      className='mr-2'
                    />
                    <span className='text-cli-white'>All Users ({users.length} users)</span>
                  </label>
                  <label className='flex items-center'>
                    <input
                      type='radio'
                      name='recipient_type'
                      value='specific_users'
                      checked={newCampaign.recipient_type === 'specific_users'}
                      onChange={e =>
                        setNewCampaign({ ...newCampaign, recipient_type: e.target.value as any })
                      }
                      className='mr-2'
                    />
                    <span className='text-cli-white'>Specific Users</span>
                  </label>
                  <label className='flex items-center'>
                    <input
                      type='radio'
                      name='recipient_type'
                      value='custom_emails'
                      checked={newCampaign.recipient_type === 'custom_emails'}
                      onChange={e =>
                        setNewCampaign({ ...newCampaign, recipient_type: e.target.value as any })
                      }
                      className='mr-2'
                    />
                    <span className='text-cli-white'>Custom Email List</span>
                  </label>
                </div>
              </div>

              {/* Specific Users Selection */}
              {newCampaign.recipient_type === 'specific_users' && (
                <div>
                  <label className='mb-2 block text-sm font-medium text-cli-white'>
                    Select Users
                  </label>
                  <div className='max-h-48 overflow-y-auto rounded-md border border-cli-gray bg-cli-dark p-3'>
                    {users.map(user => (
                      <label key={user.id} className='flex items-center py-1'>
                        <input
                          type='checkbox'
                          checked={newCampaign.specific_users.includes(user.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setNewCampaign({
                                ...newCampaign,
                                specific_users: [...newCampaign.specific_users, user.id],
                              });
                            } else {
                              setNewCampaign({
                                ...newCampaign,
                                specific_users: newCampaign.specific_users.filter(
                                  id => id !== user.id
                                ),
                              });
                            }
                          }}
                          className='mr-2'
                        />
                        <span className='text-sm text-cli-white'>
                          {user.email} ({user.username})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Emails */}
              {newCampaign.recipient_type === 'custom_emails' && (
                <div>
                  <label className='mb-2 block text-sm font-medium text-cli-white'>
                    Custom Email Addresses
                  </label>
                  <div className='mb-2 flex space-x-2'>
                    <input
                      type='email'
                      value={newCampaign.customEmailInput}
                      onChange={e =>
                        setNewCampaign({ ...newCampaign, customEmailInput: e.target.value })
                      }
                      placeholder='Enter email address...'
                      className='flex-1 rounded-md border border-cli-gray bg-cli-dark px-3 py-2 text-cli-white focus:border-primary-500 focus:outline-none'
                      onKeyPress={e => e.key === 'Enter' && addCustomEmail()}
                    />
                    <button
                      onClick={addCustomEmail}
                      className='rounded-md bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700'
                    >
                      Add
                    </button>
                  </div>
                  {newCampaign.custom_emails.length > 0 && (
                    <div className='rounded-md border border-cli-gray bg-cli-dark p-3'>
                      {newCampaign.custom_emails.map((email, index) => (
                        <div key={index} className='flex items-center justify-between py-1'>
                          <span className='text-sm text-cli-white'>{email}</span>
                          <button
                            onClick={() => removeCustomEmail(email)}
                            className='text-sm text-red-400 hover:text-red-300'
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className='flex justify-end space-x-4'>
                <button
                  onClick={() => {
                    resetEditingState();
                    setActiveTab('campaigns');
                  }}
                  className='rounded-md bg-cli-gray px-6 py-2 text-cli-white transition-colors hover:bg-cli-light-gray'
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCampaign}
                  disabled={
                    loading ||
                    !newCampaign.name ||
                    !newCampaign.subject ||
                    !newCampaign.html_content
                  }
                  className='rounded-md bg-primary-600 px-6 py-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {loading
                    ? isEditing
                      ? 'Updating...'
                      : 'Creating...'
                    : isEditing
                      ? 'Update Campaign'
                      : 'Create Campaign'}
                </button>
              </div>
            </div>
          )}
        </div>
      </TerminalWindow>

      {/* Preview Modal */}
      {showPreview && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75'>
          <div className='max-h-[90vh] max-w-4xl overflow-auto rounded-lg border border-cli-gray bg-cli-black'>
            <div className='flex items-center justify-between border-b border-cli-gray p-4'>
              <h3 className='text-lg font-semibold text-cli-white'>Email Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className='text-cli-light-gray hover:text-cli-white'
              >
                <XCircleIcon className='h-6 w-6' />
              </button>
            </div>
            <div className='p-6'>
              <div
                className='rounded-md bg-white p-4'
                dangerouslySetInnerHTML={{ __html: previewContent }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailCampaigns;
