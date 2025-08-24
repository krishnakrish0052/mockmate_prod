import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { useAdminApi } from '../hooks/useAdminApi';
import {
  EnvelopeIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { CliBadge, TerminalWindow, TypingText } from '../components/ui/CliComponents';

interface EmailTemplate {
  id: number;
  template_key: string;
  template_name?: string;
  name: string;
  display_name?: string;
  subject_template: string;
  html_template?: string;
  text_template?: string;
  mjml_template?: string;
  description?: string;
  category_id?: number;
  category_name?: string;
  category_color?: string;
  category_icon?: string;
  variables?: any[];
  tags?: string[];
  usage_notes?: string;
  is_active: boolean;
  is_system?: boolean;
  supports_personalization?: boolean;
  version?: number;
  current_version_id?: string;
  created_at: string;
  updated_at?: string;
  created_by_username?: string;
  updated_by_username?: string;
  variable_count?: number;
  total_sent?: number;
}

interface EmailCategory {
  id: number;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sort_order?: number;
  is_active?: boolean;
  template_count?: number;
}

const EmailTemplates: React.FC = () => {
  const { hasPermission } = useAdminAuth();
  const { apiCall } = useAdminApi();
  
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [categories, setCategories] = useState<EmailCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Check permissions
  const canRead = hasPermission('content_management') || hasPermission('email_templates');
  const canWrite = hasPermission('content_management') || hasPermission('email_templates');

  useEffect(() => {
    if (canRead) {
      loadTemplates();
      loadCategories();
    }
  }, [canRead]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await apiCall('email-templates', {
        method: 'GET',
      });
      
      if (response.success) {
        setTemplates(response.data.templates || response.data || []);
      } else {
        setError(response.message || 'Failed to load templates');
      }
    } catch (err: any) {
      console.error('Error loading templates:', err);
      setError(err.message || 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await apiCall('email-templates/categories', {
        method: 'GET',
      });
      
      if (response.success) {
        setCategories(response.data || []);
      }
    } catch (err: any) {
      console.error('Error loading categories:', err);
      // Categories are not critical, so don't show error for this
    }
  };

  const handlePreviewTemplate = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = searchTerm === '' || 
      template.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.template_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.subject_template?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === null || template.category_id === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: number | undefined) => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(cat => cat.id === categoryId);
    return category?.name || 'Unknown';
  };

  const formatTemplateName = (name: string) => {
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!canRead) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <TerminalWindow title="admin@mockmate:~$ ./access-denied" className="w-96">
          <div className="p-6 text-center">
            <div className="text-red-400 mb-4">
              <DocumentTextIcon className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-cli-white font-mono font-bold mb-2">Access Denied</h3>
            <p className="text-cli-light-gray font-mono text-sm">
              You don't have permission to manage email templates.
            </p>
          </div>
        </TerminalWindow>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <EnvelopeIcon className="h-8 w-8 text-primary-500" />
            <div>
              <h1 className="text-2xl font-bold text-cli-white font-mono">
                Email Templates
              </h1>
              <p className="text-cli-light-gray font-mono text-sm">
                $ ./email-templates --manage --mjml
              </p>
            </div>
            <CliBadge variant="info">MJML</CliBadge>
          </div>
        </div>
        
        {canWrite && (
          <button className="admin-btn-primary group">
            <PlusIcon className="h-5 w-5" />
            <span>Create Template</span>
            <div className="font-mono text-xs text-cli-green mt-1">
              ./new-template --mjml
            </div>
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <TerminalWindow title="admin@mockmate:~$ ./filter-templates">
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-cli-light-gray" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="admin-input pl-10"
              />
            </div>
            
            {/* Category Filter */}
            <div className="relative">
              <FunnelIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-cli-light-gray" />
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
                className="admin-input pl-10"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Results Count */}
            <div className="flex items-center space-x-2 font-mono text-sm text-cli-light-gray">
              <DocumentTextIcon className="h-5 w-5" />
              <span>{filteredTemplates.length} templates found</span>
            </div>
          </div>
        </div>
      </TerminalWindow>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <TerminalWindow title="admin@mockmate:~$ ./loading-templates..." className="w-96">
            <div className="flex flex-col items-center space-y-4 p-8">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
              <TypingText
                text="Loading email templates..."
                className="text-cli-light-gray"
                speed={50}
              />
            </div>
          </TerminalWindow>
        </div>
      ) : error ? (
        <TerminalWindow title="admin@mockmate:~$ ./error" className="border-red-500">
          <div className="p-6 text-center">
            <div className="text-red-400 mb-4">
              <DocumentTextIcon className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-cli-white font-mono font-bold mb-2">Error Loading Templates</h3>
            <p className="text-cli-light-gray font-mono text-sm mb-4">{error}</p>
            <button
              onClick={loadTemplates}
              className="admin-btn-secondary"
            >
              Retry
            </button>
          </div>
        </TerminalWindow>
      ) : filteredTemplates.length === 0 ? (
        <TerminalWindow title="admin@mockmate:~$ ./no-templates-found" className="border-yellow-500">
          <div className="p-8 text-center">
            <EnvelopeIcon className="h-16 w-16 text-yellow-400 mx-auto mb-4" />
            <h3 className="text-cli-white font-mono font-bold mb-2">No Templates Found</h3>
            <p className="text-cli-light-gray font-mono text-sm mb-4">
              {searchTerm || selectedCategory 
                ? 'No templates match your current filters.'
                : 'No email templates have been created yet.'
              }
            </p>
            {canWrite && !searchTerm && !selectedCategory && (
              <button className="admin-btn-primary">
                <PlusIcon className="h-5 w-5" />
                Create Your First Template
              </button>
            )}
          </div>
        </TerminalWindow>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <TerminalWindow
              key={template.id}
              title={`template@${template.template_name || template.name}`}
              className="group hover:border-primary-500 transition-colors"
            >
              <div className="p-4">
                {/* Template Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-mono font-bold text-cli-white mb-1">
                      {formatTemplateName(template.name || template.template_name)}
                    </h3>
                    <div className="flex items-center space-x-2 mb-2">
                      <CliBadge variant={template.is_active ? 'success' : 'warning'}>
                        {template.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </CliBadge>
                      <CliBadge variant="info">
                        {getCategoryName(template.category_id)}
                      </CliBadge>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handlePreviewTemplate(template)}
                      className="p-2 rounded text-cli-light-gray hover:text-primary-500 hover:bg-cli-dark transition-colors"
                      title="Preview"
                    >
                      <EyeIcon className="h-4 w-4" />
                    </button>
                    {canWrite && (
                      <>
                        <button className="p-2 rounded text-cli-light-gray hover:text-cli-cyan hover:bg-cli-dark transition-colors" title="Edit">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button className="p-2 rounded text-cli-light-gray hover:text-red-400 hover:bg-cli-dark transition-colors" title="Delete">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Template Details */}
                <div className="space-y-2">
                  <div>
                    <div className="font-mono text-xs text-cli-green mb-1">Subject:</div>
                    <div className="font-mono text-sm text-cli-white bg-cli-darker p-2 rounded">
                      {template.subject_template}
                    </div>
                  </div>
                  
                  {template.description && (
                    <div>
                      <div className="font-mono text-xs text-cli-green mb-1">Description:</div>
                      <div className="font-mono text-sm text-cli-light-gray">
                        {template.description}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs font-mono text-cli-light-gray pt-2 border-t border-cli-gray">
                    <span>ID: {template.id}</span>
                    <span>{new Date(template.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-cli-gray">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePreviewTemplate(template)}
                      className="flex-1 admin-btn-secondary text-xs py-2"
                    >
                      <EyeIcon className="h-4 w-4" />
                      Preview
                    </button>
                    {canWrite && (
                      <button className="flex-1 admin-btn-primary text-xs py-2">
                        <CodeBracketIcon className="h-4 w-4" />
                        Edit MJML
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </TerminalWindow>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && selectedTemplate && (
        <div className="fixed inset-0 bg-cli-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-cli-dark border border-cli-gray rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-cli-gray">
              <h3 className="font-mono font-bold text-cli-white">
                Template Preview: {formatTemplateName(selectedTemplate.name || selectedTemplate.template_name)}
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-cli-light-gray hover:text-cli-white"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-4">
                <div>
                  <label className="block font-mono text-sm text-cli-green mb-2">Subject:</label>
                  <div className="bg-cli-darker p-3 rounded font-mono text-cli-white">
                    {selectedTemplate.subject_template}
                  </div>
                </div>
                <div>
                  <label className="block font-mono text-sm text-cli-green mb-2">Preview:</label>
                  <div className="bg-white p-4 rounded">
                    <p className="text-gray-800 font-mono text-sm">
                      Email template preview would be rendered here.
                      Template ID: {selectedTemplate.id}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailTemplates;
