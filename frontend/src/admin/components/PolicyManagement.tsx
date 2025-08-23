import React, { useState, useEffect, useRef } from 'react';
import {
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  TerminalWindow,
  TypingText,
  CliButton,
  CliInput,
  CliCard,
  CliBadge,
  MatrixRain,
  CliSelect,
  CliTextarea,
} from './ui/CliComponents';
import { usePolicies, Policy } from '../../contexts/PolicyContext';

const PolicyManagement: React.FC = () => {
  const { policies, addPolicy, updatePolicy, deletePolicy, togglePolicyStatus } = usePolicies();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [formData, setFormData] = useState({
    slug: '',
    title: '',
    content: '',
    version: '1.0',
    isActive: true,
    effectiveDate: new Date().toISOString().split('T')[0],
  });

  const handleCreate = () => {
    setEditingPolicy(null);
    setFormData({
      slug: '',
      title: '',
      content: '',
      version: '1.0',
      isActive: true,
      effectiveDate: new Date().toISOString().split('T')[0],
    });
    setShowEditor(true);
  };

  const handleEdit = (policy: Policy) => {
    setEditingPolicy(policy);
    setFormData({
      slug: policy.slug,
      title: policy.title,
      content: policy.content,
      version: policy.version,
      isActive: policy.isActive,
      effectiveDate: policy.effectiveDate.split('T')[0],
    });
    setShowEditor(true);
  };

  const handleSave = async () => {
    try {
      if (editingPolicy) {
        // Update existing policy
        updatePolicy(editingPolicy.id, {
          ...formData,
          lastUpdated: new Date().toISOString(),
        });
      } else {
        // Add new policy
        const newPolicy: Policy = {
          id: Date.now().toString(),
          ...formData,
          lastUpdated: new Date().toISOString(),
        };
        addPolicy(newPolicy);
      }

      setShowEditor(false);
      setEditingPolicy(null);
      setError(null);
    } catch (err) {
      console.error('Error saving policy:', err);
      setError('Failed to save policy');
    }
  };

  const handleDelete = (policy: Policy) => {
    if (!confirm(`Are you sure you want to delete "${policy.title}"?`)) {
      return;
    }

    try {
      deletePolicy(policy.id);
      setError(null);
    } catch (err) {
      console.error('Error deleting policy:', err);
      setError('Failed to delete policy');
    }
  };

  const handleToggleStatus = (policy: Policy) => {
    try {
      togglePolicyStatus(policy.id);
      setError(null);
    } catch (err) {
      console.error('Error toggling policy status:', err);
      setError('Failed to toggle policy status');
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  if (loading) {
    return (
      <div className='matrix-bg relative min-h-screen bg-cli-black'>
        <MatrixRain className='opacity-5' />
        <TerminalWindow
          title='admin@policies:~$ loading --policies'
          className='mx-auto mt-8 max-w-2xl'
        >
          <div className='p-8 text-center'>
            <TypingText
              text='Initializing policy management system...'
              className='mb-4 font-mono text-lg text-primary-500'
              speed={50}
            />
            <div className='font-mono text-sm text-cli-gray'>$ ./fetch-policies --admin</div>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className='matrix-bg relative min-h-screen bg-cli-black'>
      <MatrixRain className='opacity-5' />

      <div className='relative z-10 p-6'>
        {/* Header */}
        <TerminalWindow title='admin@policies:~$ ./policy-management --legal' className='mb-6'>
          <div className='p-6'>
            <div className='mb-4 flex items-center justify-between'>
              <div>
                <TypingText
                  text='Policy Management System'
                  className='cli-glow mb-2 font-mono text-2xl font-bold text-primary-500'
                  speed={40}
                />
                <div className='font-mono text-sm text-cli-light-gray'>
                  $ ./manage-policies --legal-docs --status=active
                </div>
              </div>
              <CliButton
                variant='primary'
                size='md'
                onClick={handleCreate}
                className='flex items-center'
              >
                <PlusIcon className='mr-2 h-4 w-4' />
                ./create-policy
              </CliButton>
            </div>

            <CliBadge variant='info' className='mr-2'>
              LEGAL
            </CliBadge>
            <CliBadge variant='success'>{policies.length} POLICIES LOADED</CliBadge>
          </div>
        </TerminalWindow>

        {/* Error Display */}
        {error && (
          <TerminalWindow title='admin@policies:~$ error --display' className='mb-6'>
            <div className='p-6'>
              <div className='flex items-start space-x-3'>
                <ExclamationTriangleIcon className='mt-1 h-6 w-6 text-red-500' />
                <div className='flex-1'>
                  <CliBadge variant='warning' className='mb-3'>
                    ERROR: API_FAILURE
                  </CliBadge>
                  <p className='mb-4 font-mono text-sm text-cli-light-gray'>{error}</p>
                  <CliButton variant='danger' size='sm' onClick={() => setError(null)}>
                    ./dismiss-error
                  </CliButton>
                </div>
              </div>
            </div>
          </TerminalWindow>
        )}

        {/* Policies List */}
        <CliCard className='mb-6'>
          <div className='p-6'>
            <div className='mb-4'>
              <div className='mb-2 font-mono text-sm text-cli-green'>$ ls -la /legal/policies/</div>
            </div>

            {policies.length === 0 ? (
              <div className='py-12 text-center'>
                <DocumentTextIcon className='mx-auto mb-4 h-16 w-16 text-cli-gray' />
                <TypingText
                  text='No policies found in database'
                  className='mb-4 font-mono text-lg text-cli-light-gray'
                  speed={60}
                />
                <div className='mb-6 font-mono text-sm text-cli-gray'>
                  $ find /legal/policies -name "*.md" | wc -l → 0
                </div>
                <CliButton variant='primary' onClick={handleCreate}>
                  ./create-first-policy
                </CliButton>
              </div>
            ) : (
              <div className='space-y-4'>
                {policies.map(policy => (
                  <div
                    key={policy.id}
                    className='cli-terminal border border-cli-gray p-4 transition-colors hover:border-primary-500'
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center space-x-4'>
                        <div className='cli-terminal flex-shrink-0 p-2 text-primary-500'>
                          <DocumentTextIcon className='h-6 w-6' />
                        </div>
                        <div className='flex-1'>
                          <div className='mb-1 flex items-center space-x-3'>
                            <h3 className='font-mono text-lg font-bold text-cli-white'>
                              {policy.title}
                            </h3>
                            <CliBadge variant='info'>v{policy.version}</CliBadge>
                            {policy.isActive ? (
                              <CliBadge variant='success'>ACTIVE</CliBadge>
                            ) : (
                              <CliBadge variant='warning'>INACTIVE</CliBadge>
                            )}
                          </div>
                          <div className='mb-2 font-mono text-sm text-cli-green'>
                            $ cat /legal/{policy.slug}.md
                          </div>
                          <div className='flex items-center space-x-4 font-mono text-xs text-cli-light-gray'>
                            <span>
                              • Effective: {new Date(policy.effectiveDate).toLocaleDateString()}
                            </span>
                            <span>
                              • Updated: {new Date(policy.lastUpdated).toLocaleDateString()}
                            </span>
                            <span>• Size: {policy.content.length} chars</span>
                          </div>
                        </div>
                      </div>

                      <div className='flex items-center space-x-2'>
                        <CliButton
                          variant='ghost'
                          size='sm'
                          onClick={() => window.open(`/${policy.slug}`, '_blank')}
                          title='Preview policy'
                        >
                          <EyeIcon className='h-4 w-4' />
                        </CliButton>
                        <CliButton
                          variant='secondary'
                          size='sm'
                          onClick={() => handleToggleStatus(policy)}
                          title={policy.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {policy.isActive ? (
                            <XCircleIcon className='h-4 w-4' />
                          ) : (
                            <CheckCircleIcon className='h-4 w-4' />
                          )}
                        </CliButton>
                        <CliButton
                          variant='primary'
                          size='sm'
                          onClick={() => handleEdit(policy)}
                          title='Edit policy'
                        >
                          <PencilIcon className='h-4 w-4' />
                        </CliButton>
                        <CliButton
                          variant='danger'
                          size='sm'
                          onClick={() => handleDelete(policy)}
                          title='Delete policy'
                        >
                          <TrashIcon className='h-4 w-4' />
                        </CliButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CliCard>

        {/* Editor Modal */}
        {showEditor && (
          <div className='fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 p-4'>
            <MatrixRain className='opacity-10' />
            <div className='cli-terminal relative z-10 max-h-[95vh] w-full max-w-5xl overflow-hidden border border-primary-500'>
              {/* Modal Header */}
              <div className='flex items-center justify-between border-b border-cli-gray bg-cli-darker p-4'>
                <div>
                  <TypingText
                    text={editingPolicy ? `Editing: ${editingPolicy.title}` : 'Creating New Policy'}
                    className='font-mono text-lg font-bold text-primary-500'
                    speed={30}
                  />
                  <div className='mt-1 font-mono text-sm text-cli-green'>
                    $ ./nano /legal/{formData.slug || 'new-policy'}.md
                  </div>
                </div>
                <CliButton variant='danger' size='sm' onClick={() => setShowEditor(false)}>
                  <XCircleIcon className='h-4 w-4' />
                </CliButton>
              </div>

              {/* Modal Content */}
              <div className='max-h-[calc(95vh-140px)] overflow-y-auto bg-cli-black p-6'>
                <div className='space-y-6'>
                  {/* Basic Info */}
                  <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                    <CliInput
                      label='Policy Title *'
                      value={formData.title}
                      onChange={e => {
                        const title = e.target.value;
                        setFormData(prev => ({
                          ...prev,
                          title,
                          slug: !editingPolicy ? generateSlug(title) : prev.slug,
                        }));
                      }}
                      placeholder='Enter policy title'
                      showPrompt
                    />

                    <CliInput
                      label='URL Slug *'
                      value={formData.slug}
                      onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder='policy-slug'
                      showPrompt
                    />
                  </div>

                  {/* Metadata */}
                  <div className='grid grid-cols-1 gap-6 md:grid-cols-3'>
                    <CliInput
                      label='Version'
                      value={formData.version}
                      onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))}
                      placeholder='1.0'
                      showPrompt
                    />

                    <div>
                      <label className='mb-2 block font-mono text-sm font-medium text-primary-500'>
                        Effective Date
                      </label>
                      <input
                        type='date'
                        value={formData.effectiveDate}
                        onChange={e =>
                          setFormData(prev => ({ ...prev, effectiveDate: e.target.value }))
                        }
                        className='block w-full rounded-md border-2 border-cli-gray bg-cli-dark py-2 pl-3 pr-3 font-mono text-cli-white transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-cli-black'
                      />
                    </div>

                    <CliSelect
                      label='Status'
                      value={formData.isActive ? 'active' : 'inactive'}
                      onChange={e =>
                        setFormData(prev => ({ ...prev, isActive: e.target.value === 'active' }))
                      }
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                      ]}
                    />
                  </div>

                  {/* URL Preview */}
                  {formData.slug && (
                    <div className='cli-terminal border border-cli-gray p-3'>
                      <div className='mb-1 font-mono text-sm text-cli-green'>
                        $ echo "Policy URL Preview:"
                      </div>
                      <div className='font-mono text-sm text-primary-500'>
                        https://mockmate.com/{formData.slug}
                      </div>
                    </div>
                  )}

                  {/* Content Editor */}
                  <div>
                    <div className='cli-terminal mb-3 border border-cli-gray p-3'>
                      <div className='mb-2 font-mono text-xs text-cli-green'>
                        $ vim /legal/{formData.slug || 'new-policy'}.md
                      </div>
                      <div className='font-mono text-xs text-cli-light-gray'>
                        Markdown support: # H1, ## H2, ### H3, - List items
                      </div>
                    </div>
                    <CliTextarea
                      label='Policy Content *'
                      value={formData.content}
                      onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                      rows={20}
                      placeholder='# Policy Title\n\n## Section 1\nEnter your policy content here...\n\n### Subsection\n- List item 1\n- List item 2\n\n## Section 2\nMore content...'
                    />
                    <div className='mt-2 font-mono text-xs text-cli-light-gray'>
                      Lines: {formData.content.split('\n').length} | Characters:{' '}
                      {formData.content.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className='flex items-center justify-between border-t border-cli-gray bg-cli-darker p-4'>
                <div className='font-mono text-sm text-cli-light-gray'>
                  $ {editingPolicy ? './update-policy' : './create-policy'} --validate --deploy
                </div>
                <div className='flex items-center space-x-3'>
                  <CliButton variant='secondary' onClick={() => setShowEditor(false)}>
                    ./cancel
                  </CliButton>
                  <CliButton
                    variant='success'
                    onClick={handleSave}
                    disabled={
                      !formData.title.trim() || !formData.slug.trim() || !formData.content.trim()
                    }
                  >
                    {editingPolicy ? './update-policy' : './deploy-policy'}
                  </CliButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolicyManagement;
