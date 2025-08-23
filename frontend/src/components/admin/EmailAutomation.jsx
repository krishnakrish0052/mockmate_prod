import React, { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  Pause,
  Settings,
  Plus,
  Edit,
  Trash2,
  Eye,
  Clock,
  Users,
  Mail,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BarChart3,
  Filter,
  Search,
  Calendar,
  Target,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const EmailAutomation = () => {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAutomation, setSelectedAutomation] = useState(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [templates, setTemplates] = useState([]);

  const triggerTypes = [
    {
      id: 'user_registered',
      name: 'User Registration',
      description: 'When a new user signs up',
      icon: '👋',
      category: 'system',
    },
    {
      id: 'interview_scheduled',
      name: 'Interview Scheduled',
      description: 'When an interview is booked',
      icon: '📅',
      category: 'interview',
    },
    {
      id: 'interview_reminder_24h',
      name: 'Interview Reminder (24h)',
      description: '24 hours before interview',
      icon: '⏰',
      category: 'interview',
    },
    {
      id: 'interview_reminder_1h',
      name: 'Interview Reminder (1h)',
      description: '1 hour before interview',
      icon: '🚨',
      category: 'interview',
    },
    {
      id: 'interview_completed',
      name: 'Interview Completed',
      description: 'After interview session ends',
      icon: '✅',
      category: 'interview',
    },
    {
      id: 'interview_feedback',
      name: 'Interview Feedback Request',
      description: '24h after interview completion',
      icon: '💬',
      category: 'engagement',
    },
    {
      id: 'payment_failed',
      name: 'Payment Failed',
      description: 'When payment processing fails',
      icon: '💳',
      category: 'billing',
    },
    {
      id: 'subscription_expiring',
      name: 'Subscription Expiring',
      description: '7 days before expiration',
      icon: '⚠️',
      category: 'billing',
    },
    {
      id: 'subscription_expired',
      name: 'Subscription Expired',
      description: 'When subscription expires',
      icon: '🔒',
      category: 'billing',
    },
    {
      id: 'password_reset',
      name: 'Password Reset Requested',
      description: 'When user requests password reset',
      icon: '🔑',
      category: 'system',
    },
    {
      id: 'account_verification',
      name: 'Account Verification',
      description: 'Email verification required',
      icon: '🔐',
      category: 'system',
    },
  ];

  useEffect(() => {
    fetchAutomations();
    fetchTemplates();
  }, []);

  const fetchAutomations = async () => {
    try {
      const response = await axios.get('/api/admin/email-automations', {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      setAutomations(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching automations:', error);
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await axios.get('/api/email-templates?active_only=true', {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      setTemplates(response.data.templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const toggleAutomationStatus = async (id, currentStatus) => {
    try {
      await axios.put(
        `/api/admin/email-automations/${id}`,
        {
          is_active: !currentStatus,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
        }
      );
      fetchAutomations();
    } catch (error) {
      console.error('Error updating automation:', error);
    }
  };

  const deleteAutomation = async id => {
    if (!window.confirm('Are you sure you want to delete this automation?')) return;

    try {
      await axios.delete(`/api/admin/email-automations/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      fetchAutomations();
    } catch (error) {
      console.error('Error deleting automation:', error);
    }
  };

  const getFilteredAutomations = () => {
    return automations.filter(automation => {
      const matchesSearch =
        automation.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        automation.trigger_event.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && automation.is_active) ||
        (statusFilter === 'inactive' && !automation.is_active);

      const matchesCategory = categoryFilter === 'all' || automation.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  };

  const getTriggerInfo = triggerEvent => {
    return (
      triggerTypes.find(t => t.id === triggerEvent) || {
        name: triggerEvent,
        description: '',
        icon: '📧',
      }
    );
  };

  if (loading) {
    return (
      <div className='flex min-h-64 items-center justify-center'>
        <div className='h-8 w-8 animate-spin rounded-full border-2 border-cli-amber border-t-transparent'></div>
      </div>
    );
  }

  const filteredAutomations = getFilteredAutomations();

  return (
    <div className='cli-terminal min-h-screen bg-cli-darker p-6'>
      {/* Header */}
      <div className='mb-6 border-b border-cli-gray pb-6'>
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='mb-2 font-mono text-2xl font-bold text-cli-white'>
              <span className='text-cli-green'>$</span> Email Automation
            </h1>
            <p className='text-cli-light-gray'>Create and manage automated email workflows</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className='flex items-center gap-2 rounded bg-cli-amber px-4 py-2 font-medium text-cli-black transition-colors hover:bg-opacity-80'
          >
            <Plus className='h-4 w-4' />
            Create Automation
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className='mb-6 flex flex-col gap-4 md:flex-row'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-cli-light-gray' />
          <input
            type='text'
            placeholder='Search automations...'
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className='w-full rounded border border-cli-gray bg-cli-dark py-2 pl-10 pr-4 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
          />
        </div>

        <div className='flex items-center gap-2'>
          <Filter className='h-4 w-4 text-cli-light-gray' />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className='rounded border border-cli-gray bg-cli-dark px-3 py-2 text-cli-white focus:border-cli-amber focus:outline-none'
          >
            <option value='all'>All Status</option>
            <option value='active'>Active</option>
            <option value='inactive'>Inactive</option>
          </select>
        </div>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className='rounded border border-cli-gray bg-cli-dark px-3 py-2 text-cli-white focus:border-cli-amber focus:outline-none'
        >
          <option value='all'>All Categories</option>
          <option value='system'>System</option>
          <option value='interview'>Interview</option>
          <option value='billing'>Billing</option>
          <option value='engagement'>Engagement</option>
        </select>
      </div>

      {/* Automation Cards */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
        <AnimatePresence>
          {filteredAutomations.map(automation => {
            const triggerInfo = getTriggerInfo(automation.trigger_event);

            return (
              <motion.div
                key={automation.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className='rounded border border-cli-gray bg-cli-dark p-5 transition-colors hover:border-cli-amber'
              >
                {/* Header */}
                <div className='mb-4 flex items-start justify-between'>
                  <div className='flex items-center gap-3'>
                    <div className='text-2xl'>{triggerInfo.icon}</div>
                    <div>
                      <h3 className='font-mono text-sm font-semibold text-cli-white'>
                        {automation.name}
                      </h3>
                      <p className='text-xs capitalize text-cli-light-gray'>
                        {automation.category}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`h-2 w-2 rounded-full ${
                      automation.is_active ? 'bg-cli-green' : 'bg-cli-light-gray'
                    }`}
                  ></div>
                </div>

                {/* Trigger Info */}
                <div className='mb-4'>
                  <p className='mb-1 text-sm font-medium text-cli-white'>{triggerInfo.name}</p>
                  <p className='text-xs text-cli-light-gray'>{triggerInfo.description}</p>
                  {automation.delay_minutes > 0 && (
                    <div className='mt-2 flex items-center gap-1'>
                      <Clock className='h-3 w-3 text-cli-amber' />
                      <span className='text-xs text-cli-amber'>
                        Delay: {automation.delay_minutes} minutes
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className='mb-4 grid grid-cols-3 gap-3'>
                  <div className='text-center'>
                    <p className='font-mono text-sm font-bold text-cli-white'>
                      {automation.sent_count || 0}
                    </p>
                    <p className='text-xs text-cli-light-gray'>Sent</p>
                  </div>
                  <div className='text-center'>
                    <p className='font-mono text-sm font-bold text-cli-green'>
                      {automation.success_rate || 0}%
                    </p>
                    <p className='text-xs text-cli-light-gray'>Success</p>
                  </div>
                  <div className='text-center'>
                    <p className='text-cli-red font-mono text-sm font-bold'>
                      {automation.failure_count || 0}
                    </p>
                    <p className='text-xs text-cli-light-gray'>Failed</p>
                  </div>
                </div>

                {/* Actions */}
                <div className='flex items-center justify-between border-t border-cli-gray pt-3'>
                  <div className='flex items-center gap-2'>
                    <button
                      onClick={() => {
                        setSelectedAutomation(automation);
                        setShowStatsModal(true);
                      }}
                      className='rounded p-2 text-cli-cyan transition-colors hover:bg-cli-gray'
                      title='View Stats'
                    >
                      <BarChart3 className='h-4 w-4' />
                    </button>
                    <button
                      className='rounded p-2 text-cli-white transition-colors hover:bg-cli-gray'
                      title='Edit'
                    >
                      <Edit className='h-4 w-4' />
                    </button>
                  </div>

                  <div className='flex items-center gap-2'>
                    <button
                      onClick={() => toggleAutomationStatus(automation.id, automation.is_active)}
                      className={`rounded p-2 transition-colors hover:bg-cli-gray ${
                        automation.is_active ? 'text-cli-green' : 'text-cli-light-gray'
                      }`}
                      title={automation.is_active ? 'Pause' : 'Activate'}
                    >
                      {automation.is_active ? (
                        <Pause className='h-4 w-4' />
                      ) : (
                        <Play className='h-4 w-4' />
                      )}
                    </button>
                    <button
                      onClick={() => deleteAutomation(automation.id)}
                      className='text-cli-red rounded p-2 transition-colors hover:bg-cli-gray'
                      title='Delete'
                    >
                      <Trash2 className='h-4 w-4' />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Empty State */}
      {filteredAutomations.length === 0 && (
        <div className='py-12 text-center'>
          <Zap className='mx-auto mb-4 h-16 w-16 text-cli-light-gray' />
          <h3 className='mb-2 font-mono text-xl text-cli-white'>No automations found</h3>
          <p className='mb-4 text-cli-light-gray'>
            {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'Create your first email automation to get started'}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className='inline-flex items-center gap-2 rounded bg-cli-amber px-4 py-2 text-cli-black transition-colors hover:bg-opacity-80'
          >
            <Plus className='h-4 w-4' />
            Create Automation
          </button>
        </div>
      )}

      {/* Create Automation Modal */}
      <CreateAutomationModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          fetchAutomations();
        }}
        triggerTypes={triggerTypes}
        templates={templates}
      />

      {/* Stats Modal */}
      <AutomationStatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        automation={selectedAutomation}
      />
    </div>
  );
};

// Create Automation Modal
const CreateAutomationModal = ({ isOpen, onClose, onSuccess, triggerTypes, templates }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_event: '',
    template_id: '',
    delay_minutes: 0,
    conditions: {},
    is_active: true,
  });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setCreating(true);

    try {
      await axios.post('/api/admin/email-automations', formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      onSuccess();
      setFormData({
        name: '',
        description: '',
        trigger_event: '',
        template_id: '',
        delay_minutes: 0,
        conditions: {},
        is_active: true,
      });
    } catch (error) {
      console.error('Error creating automation:', error);
      alert('Failed to create automation');
    }
    setCreating(false);
  };

  if (!isOpen) return null;

  const selectedTrigger = triggerTypes.find(t => t.id === formData.trigger_event);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
      <div className='max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-cli-gray bg-cli-dark'>
        <div className='flex items-center justify-between border-b border-cli-gray p-4'>
          <h3 className='font-mono text-lg font-semibold text-cli-white'>
            Create Email Automation
          </h3>
          <button
            onClick={onClose}
            className='p-2 text-cli-light-gray transition-colors hover:text-cli-white'
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className='max-h-[calc(90vh-120px)] space-y-4 overflow-y-auto p-4'
        >
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div>
              <label className='mb-2 block text-sm font-medium text-cli-white'>
                Automation Name
              </label>
              <input
                type='text'
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder='Welcome Email Automation'
                className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
                required
              />
            </div>

            <div>
              <label className='mb-2 block text-sm font-medium text-cli-white'>Trigger Event</label>
              <select
                value={formData.trigger_event}
                onChange={e => setFormData({ ...formData, trigger_event: e.target.value })}
                className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
                required
              >
                <option value=''>Select trigger event</option>
                {triggerTypes.map(trigger => (
                  <option key={trigger.id} value={trigger.id}>
                    {trigger.icon} {trigger.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedTrigger && (
            <div className='rounded border border-cli-gray bg-cli-darker p-3'>
              <div className='mb-2 flex items-center gap-2'>
                <span className='text-xl'>{selectedTrigger.icon}</span>
                <span className='font-medium text-cli-white'>{selectedTrigger.name}</span>
              </div>
              <p className='text-sm text-cli-light-gray'>{selectedTrigger.description}</p>
            </div>
          )}

          <div>
            <label className='mb-2 block text-sm font-medium text-cli-white'>Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder='Describe when and why this automation runs...'
              rows='3'
              className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
            />
          </div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div>
              <label className='mb-2 block text-sm font-medium text-cli-white'>
                Email Template
              </label>
              <select
                value={formData.template_id}
                onChange={e => setFormData({ ...formData, template_id: e.target.value })}
                className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white focus:border-cli-amber focus:outline-none'
                required
              >
                <option value=''>Select template</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className='mb-2 block text-sm font-medium text-cli-white'>
                Delay (minutes)
              </label>
              <input
                type='number'
                value={formData.delay_minutes}
                onChange={e =>
                  setFormData({ ...formData, delay_minutes: parseInt(e.target.value) || 0 })
                }
                min='0'
                placeholder='0'
                className='w-full rounded border border-cli-gray bg-cli-darker p-3 text-cli-white placeholder-cli-light-gray focus:border-cli-amber focus:outline-none'
              />
              <p className='mt-1 text-xs text-cli-light-gray'>
                0 = Send immediately when triggered
              </p>
            </div>
          </div>

          <div className='flex gap-3 pt-4'>
            <button
              type='button'
              onClick={onClose}
              className='flex-1 rounded border border-cli-gray px-4 py-2 text-cli-white transition-colors hover:bg-cli-gray'
            >
              Cancel
            </button>
            <button
              type='submit'
              disabled={creating}
              className='flex-1 rounded bg-cli-amber px-4 py-2 text-cli-black transition-colors hover:bg-opacity-80 disabled:opacity-50'
            >
              {creating ? 'Creating...' : 'Create Automation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Automation Stats Modal
const AutomationStatsModal = ({ isOpen, onClose, automation }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && automation) {
      fetchStats();
    }
  }, [isOpen, automation]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/admin/email-automations/${automation.id}/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
    setLoading(false);
  };

  if (!isOpen || !automation) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4'>
      <div className='max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border border-cli-gray bg-cli-dark'>
        <div className='flex items-center justify-between border-b border-cli-gray p-4'>
          <div>
            <h3 className='font-mono text-lg font-semibold text-cli-white'>Automation Stats</h3>
            <p className='text-sm text-cli-light-gray'>{automation.name}</p>
          </div>
          <button
            onClick={onClose}
            className='p-2 text-cli-light-gray transition-colors hover:text-cli-white'
          >
            ×
          </button>
        </div>

        <div className='max-h-[calc(90vh-80px)] overflow-y-auto p-4'>
          {loading ? (
            <div className='flex items-center justify-center py-8'>
              <div className='h-6 w-6 animate-spin rounded-full border-2 border-cli-amber border-t-transparent'></div>
            </div>
          ) : stats ? (
            <div className='space-y-6'>
              {/* Overview Stats */}
              <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                <div className='rounded border border-cli-gray bg-cli-darker p-4 text-center'>
                  <p className='font-mono text-2xl font-bold text-cli-white'>
                    {stats.total_triggered}
                  </p>
                  <p className='text-sm text-cli-light-gray'>Triggered</p>
                </div>
                <div className='rounded border border-cli-gray bg-cli-darker p-4 text-center'>
                  <p className='font-mono text-2xl font-bold text-cli-green'>{stats.total_sent}</p>
                  <p className='text-sm text-cli-light-gray'>Sent</p>
                </div>
                <div className='rounded border border-cli-gray bg-cli-darker p-4 text-center'>
                  <p className='font-mono text-2xl font-bold text-cli-amber'>
                    {stats.success_rate}%
                  </p>
                  <p className='text-sm text-cli-light-gray'>Success Rate</p>
                </div>
                <div className='rounded border border-cli-gray bg-cli-darker p-4 text-center'>
                  <p className='text-cli-red font-mono text-2xl font-bold'>{stats.total_failed}</p>
                  <p className='text-sm text-cli-light-gray'>Failed</p>
                </div>
              </div>

              {/* Recent Activity */}
              {stats.recent_activity && stats.recent_activity.length > 0 && (
                <div>
                  <h4 className='mb-3 font-mono font-semibold text-cli-white'>Recent Activity</h4>
                  <div className='max-h-40 space-y-2 overflow-y-auto'>
                    {stats.recent_activity.map((activity, index) => (
                      <div
                        key={index}
                        className='flex items-center justify-between rounded bg-cli-darker p-3'
                      >
                        <div className='flex items-center gap-2'>
                          {activity.status === 'sent' ? (
                            <CheckCircle className='h-4 w-4 text-cli-green' />
                          ) : (
                            <XCircle className='text-cli-red h-4 w-4' />
                          )}
                          <span className='text-sm text-cli-white'>{activity.recipient}</span>
                        </div>
                        <div className='flex items-center gap-2 text-xs text-cli-light-gray'>
                          <Calendar className='h-3 w-3' />
                          {activity.created_at}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Log */}
              {stats.recent_errors && stats.recent_errors.length > 0 && (
                <div>
                  <h4 className='mb-3 flex items-center gap-2 font-mono font-semibold text-cli-white'>
                    <AlertTriangle className='text-cli-red h-4 w-4' />
                    Recent Errors
                  </h4>
                  <div className='max-h-32 space-y-2 overflow-y-auto'>
                    {stats.recent_errors.map((error, index) => (
                      <div
                        key={index}
                        className='bg-cli-red border-cli-red rounded border bg-opacity-10 p-3'
                      >
                        <p className='text-cli-red text-sm font-medium'>{error.error_message}</p>
                        <p className='mt-1 text-xs text-cli-light-gray'>{error.created_at}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default EmailAutomation;
