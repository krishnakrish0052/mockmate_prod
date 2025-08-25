import React, { useState, useEffect } from 'react';
import {
  TerminalWindow,
  TypingText,
  CliCard,
  CliBadge,
  CliButton,
  CliSelect,
} from '../components/ui/CliComponents';
import {
  DocumentTextIcon,
  DocumentChartBarIcon,
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { getApiUrl, API_ENDPOINTS, createAuthHeaders } from '../utils/apiConfig';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  parameters: string[];
  formats: string[];
}

interface ReportHistory {
  id: string;
  type: string;
  parameters: any;
  status: string;
  generatedBy: string;
  createdAt: string;
  completedAt?: string;
  fileSize: number;
  downloadCount: number;
}

interface ReportFilters {
  startDate: string;
  endDate: string;
  format: 'json' | 'csv' | 'pdf' | 'xlsx' | 'word';
}

// Mock data functions
const getMockReportTemplates = (): ReportTemplate[] => [
  {
    id: 'user_activity',
    name: 'User Activity Report',
    description: 'Comprehensive user engagement and activity metrics',
    parameters: ['dateRange', 'userSegment', 'activityType'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'session_analysis',
    name: 'Session Analytics',
    description: 'Detailed session tracking and user behavior patterns',
    parameters: ['dateRange', 'deviceType', 'location'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'revenue_analysis',
    name: 'Revenue & Financial Report',
    description: 'Financial performance and revenue breakdown analysis',
    parameters: ['dateRange', 'revenueStream', 'currency'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'api_usage',
    name: 'API Usage Statistics',
    description: 'API endpoint usage, response times, and error rates',
    parameters: ['dateRange', 'endpoint', 'httpStatus'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'security_audit',
    name: 'Security & Access Audit',
    description: 'Login attempts, security events, and access patterns',
    parameters: ['dateRange', 'eventType', 'riskLevel'],
    formats: ['json', 'csv', 'pdf'],
  },
  {
    id: 'performance_metrics',
    name: 'System Performance Report',
    description: 'System performance, uptime, and resource utilization',
    parameters: ['dateRange', 'metric', 'component'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'payment_transactions',
    name: 'Payment Transactions Report',
    description: 'Payment processing, transaction status, and payment methods',
    parameters: ['dateRange', 'paymentMethod', 'status'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'subscription_analysis',
    name: 'Subscription Analytics',
    description: 'Subscription plans, churn rate, and customer lifecycle',
    parameters: ['dateRange', 'planType', 'status'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'error_tracking',
    name: 'Error & Exception Tracking',
    description: 'Application errors, exceptions, and debugging information',
    parameters: ['dateRange', 'errorType', 'severity'],
    formats: ['json', 'csv', 'pdf'],
  },
  {
    id: 'content_analytics',
    name: 'Content & Feature Usage',
    description: 'Content consumption, feature adoption, and user preferences',
    parameters: ['dateRange', 'contentType', 'featureSet'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
  {
    id: 'compliance_report',
    name: 'Compliance & Regulatory Report',
    description: 'Data privacy, GDPR compliance, and regulatory requirements',
    parameters: ['dateRange', 'complianceType', 'jurisdiction'],
    formats: ['pdf', 'word', 'json'],
  },
  {
    id: 'custom_analytics',
    name: 'Custom Analytics Dashboard',
    description: 'Customizable metrics and KPIs based on specific requirements',
    parameters: ['dateRange', 'metrics', 'dimensions'],
    formats: ['json', 'csv', 'pdf', 'xlsx'],
  },
];

const getMockReportHistory = (): ReportHistory[] => [
  {
    id: 'rpt_001',
    type: 'user_activity',
    parameters: { startDate: '2024-01-01', endDate: '2024-01-31', format: 'pdf' },
    status: 'completed',
    generatedBy: 'admin',
    createdAt: '2024-01-31T10:30:00Z',
    completedAt: '2024-01-31T10:32:15Z',
    fileSize: 2457600, // 2.4MB
    downloadCount: 12,
  },
  {
    id: 'rpt_002',
    type: 'revenue_analysis',
    parameters: { startDate: '2024-01-01', endDate: '2024-01-31', format: 'xlsx' },
    status: 'completed',
    generatedBy: 'admin',
    createdAt: '2024-01-30T14:15:00Z',
    completedAt: '2024-01-30T14:16:45Z',
    fileSize: 1638400, // 1.6MB
    downloadCount: 8,
  },
  {
    id: 'rpt_003',
    type: 'session_analysis',
    parameters: { startDate: '2024-01-15', endDate: '2024-01-29', format: 'csv' },
    status: 'completed',
    generatedBy: 'admin',
    createdAt: '2024-01-29T09:20:00Z',
    completedAt: '2024-01-29T09:22:30Z',
    fileSize: 983040, // 960KB
    downloadCount: 5,
  },
  {
    id: 'rpt_004',
    type: 'api_usage',
    parameters: { startDate: '2024-01-01', endDate: '2024-01-28', format: 'json' },
    status: 'processing',
    generatedBy: 'admin',
    createdAt: '2024-01-28T16:45:00Z',
    fileSize: 0,
    downloadCount: 0,
  },
  {
    id: 'rpt_005',
    type: 'security_audit',
    parameters: { startDate: '2024-01-01', endDate: '2024-01-27', format: 'pdf' },
    status: 'completed',
    generatedBy: 'admin',
    createdAt: '2024-01-27T11:10:00Z',
    completedAt: '2024-01-27T11:15:20Z',
    fileSize: 3145728, // 3MB
    downloadCount: 15,
  },
  {
    id: 'rpt_006',
    type: 'performance_metrics',
    parameters: { startDate: '2024-01-20', endDate: '2024-01-26', format: 'csv' },
    status: 'failed',
    generatedBy: 'admin',
    createdAt: '2024-01-26T13:30:00Z',
    fileSize: 0,
    downloadCount: 0,
  },
  {
    id: 'rpt_007',
    type: 'payment_transactions',
    parameters: { startDate: '2024-01-01', endDate: '2024-01-25', format: 'xlsx' },
    status: 'completed',
    generatedBy: 'admin',
    createdAt: '2024-01-25T15:20:00Z',
    completedAt: '2024-01-25T15:23:10Z',
    fileSize: 2097152, // 2MB
    downloadCount: 22,
  },
  {
    id: 'rpt_008',
    type: 'subscription_analysis',
    parameters: { startDate: '2024-01-01', endDate: '2024-01-24', format: 'pdf' },
    status: 'completed',
    generatedBy: 'admin',
    createdAt: '2024-01-24T08:45:00Z',
    completedAt: '2024-01-24T08:47:55Z',
    fileSize: 1572864, // 1.5MB
    downloadCount: 7,
  },
];

const Reports: React.FC = () => {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
    format: 'json',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    fetchReportTemplates();
    fetchReportHistory();
  }, [pagination.page]);

  const fetchReportTemplates = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${getApiUrl(API_ENDPOINTS.REPORTS)}/templates`, {
        headers: createAuthHeaders(token || ''),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setTemplates(result.data);
        }
      } else {
        // Use comprehensive mock data when API is not available
        setTemplates(getMockReportTemplates());
      }
    } catch (error) {
      console.error('Failed to fetch report templates:', error);
      // Use comprehensive mock data when API fails
      setTemplates(getMockReportTemplates());
    }
  };

  const fetchReportHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${getApiUrl(API_ENDPOINTS.REPORTS)}/history?${params}`, {
        headers: createAuthHeaders(token || ''),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setHistory(result.data.reports);
          setPagination(prev => ({
            ...prev,
            total: result.data.pagination.totalRecords,
            totalPages: result.data.pagination.totalPages,
          }));
        }
      } else {
        // Use mock data when API is not available
        const mockHistory = getMockReportHistory();
        setHistory(
          mockHistory.slice(
            (pagination.page - 1) * pagination.limit,
            pagination.page * pagination.limit
          )
        );
        setPagination(prev => ({
          ...prev,
          total: mockHistory.length,
          totalPages: Math.ceil(mockHistory.length / pagination.limit),
        }));
      }
    } catch (error) {
      console.error('Failed to fetch report history:', error);
      // Use mock data when API fails
      const mockHistory = getMockReportHistory();
      setHistory(
        mockHistory.slice(
          (pagination.page - 1) * pagination.limit,
          pagination.page * pagination.limit
        )
      );
      setPagination(prev => ({
        ...prev,
        total: mockHistory.length,
        totalPages: Math.ceil(mockHistory.length / pagination.limit),
      }));
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (templateId: string) => {
    if (!filters.startDate || !filters.endDate) {
      alert('Please select both start and end dates');
      return;
    }

    if (new Date(filters.startDate) > new Date(filters.endDate)) {
      alert('Start date must be before end date');
      return;
    }

    setGenerating(templateId);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Generate comprehensive mock data for the report
      const mockData = generateMockReportData(templateId, filters.startDate, filters.endDate);

      // Handle different formats
      if (filters.format === 'json') {
        // Show JSON data in a new tab
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(`
            <html>
              <head>
                <title>Report: ${templates.find(t => t.id === templateId)?.name || templateId}</title>
                <style>
                  body { font-family: 'Courier New', monospace; margin: 20px; background: #1a1a1a; color: #00ff00; }
                  h1 { color: #00ddff; }
                  pre { background: #0a0a0a; padding: 20px; border-radius: 8px; overflow-x: auto; }
                </style>
              </head>
              <body>
                <h1>📊 MockMate Report: ${templates.find(t => t.id === templateId)?.name || templateId}</h1>
                <p>Generated: ${new Date().toLocaleString()}</p>
                <p>Period: ${filters.startDate} to ${filters.endDate}</p>
                <hr>
                <pre>${JSON.stringify(mockData, null, 2)}</pre>
              </body>
            </html>
          `);
        }
      } else {
        // Generate file content based on format
        let content = '';
        let mimeType = '';

        switch (filters.format) {
          case 'csv':
            content = generateCSVContent(mockData, templateId);
            mimeType = 'text/csv';
            break;
          case 'pdf':
            content = generatePDFContent(mockData, templateId);
            mimeType = 'application/pdf';
            break;
          case 'xlsx':
            content = generateExcelContent(mockData, templateId);
            mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            break;
          case 'word':
            content = generateWordContent(mockData, templateId);
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            break;
          default:
            content = JSON.stringify(mockData, null, 2);
            mimeType = 'application/json';
        }

        // Create and trigger download
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const templateName =
          templates.find(t => t.id === templateId)?.name.replace(/[\s&]/g, '_') || templateId;
        a.download = `${templateName}_${filters.startDate}_to_${filters.endDate}.${filters.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      // Add to history (simulate)
      const newReport: ReportHistory = {
        id: `rpt_${Date.now()}`,
        type: templateId,
        parameters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          format: filters.format,
        },
        status: 'completed',
        generatedBy: 'admin',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        fileSize: Math.floor(Math.random() * 2000000) + 500000, // Random size between 500KB-2.5MB
        downloadCount: 1,
      };

      // Update history with new report
      setHistory(prev => [newReport, ...prev]);
      setPagination(prev => ({ ...prev, total: prev.total + 1 }));

      alert(
        `Report generated successfully! ${filters.format.toUpperCase()} file ${filters.format === 'json' ? 'opened in new tab' : 'downloaded'}.`
      );
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGenerating(null);
    }
  };

  const generateMockReportData = (templateId: string, startDate: string, endDate: string) => {
    const baseData = {
      reportInfo: {
        id: `rpt_${Date.now()}`,
        type: templateId,
        name: templates.find(t => t.id === templateId)?.name || templateId,
        generatedAt: new Date().toISOString(),
        period: { startDate, endDate },
        totalRecords: Math.floor(Math.random() * 10000) + 1000,
      },
    };

    switch (templateId) {
      case 'user_activity':
        return {
          ...baseData,
          summary: {
            totalUsers: 15420,
            activeUsers: 8931,
            newUsers: 1247,
            retentionRate: 73.2,
          },
          activities: Array.from({ length: 50 }, (_, i) => ({
            userId: `user_${1000 + i}`,
            username: `user${1000 + i}`,
            loginCount: Math.floor(Math.random() * 30) + 1,
            lastActive: new Date(
              Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
            actionsPerformed: Math.floor(Math.random() * 200) + 10,
            sessionDuration: Math.floor(Math.random() * 3600) + 300, // seconds
          })),
        };

      case 'revenue_analysis':
        return {
          ...baseData,
          summary: {
            totalRevenue: 125430.5,
            averageOrderValue: 89.23,
            transactionCount: 1405,
            refundRate: 2.1,
          },
          transactions: Array.from({ length: 100 }, (_, i) => ({
            transactionId: `tx_${Date.now()}_${i}`,
            amount: (Math.random() * 500 + 10).toFixed(2),
            currency: 'USD',
            status: ['completed', 'pending', 'failed'][Math.floor(Math.random() * 3)],
            paymentMethod: ['credit_card', 'paypal', 'stripe'][Math.floor(Math.random() * 3)],
            createdAt: new Date(
              Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
          })),
        };

      case 'api_usage':
        return {
          ...baseData,
          summary: {
            totalRequests: 234567,
            averageResponseTime: 245,
            errorRate: 1.8,
            topEndpoint: '/api/v1/users',
          },
          endpoints: Array.from({ length: 20 }, (_, i) => ({
            endpoint: `/api/v1/${['users', 'payments', 'sessions', 'reports', 'auth'][i % 5]}`,
            method: ['GET', 'POST', 'PUT', 'DELETE'][Math.floor(Math.random() * 4)],
            requestCount: Math.floor(Math.random() * 10000) + 100,
            avgResponseTime: Math.floor(Math.random() * 1000) + 50,
            errorCount: Math.floor(Math.random() * 100),
            successRate: (95 + Math.random() * 5).toFixed(1),
          })),
        };

      default:
        return {
          ...baseData,
          data: Array.from({ length: 25 }, (_, i) => ({
            id: i + 1,
            timestamp: new Date(
              Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
            ).toISOString(),
            value: Math.floor(Math.random() * 1000) + 1,
            category: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
            status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
          })),
        };
    }
  };

  const generateCSVContent = (data: any, templateId: string) => {
    let csv = `# MockMate Report: ${templates.find(t => t.id === templateId)?.name || templateId}\n`;
    csv += `# Generated: ${new Date().toLocaleString()}\n`;
    csv += `# Period: ${data.reportInfo.period.startDate} to ${data.reportInfo.period.endDate}\n\n`;

    if (templateId === 'user_activity' && data.activities) {
      csv += 'User ID,Username,Login Count,Last Active,Actions Performed,Session Duration (min)\n';
      data.activities.forEach((activity: any) => {
        csv += `${activity.userId},${activity.username},${activity.loginCount},${activity.lastActive},${activity.actionsPerformed},${Math.round(activity.sessionDuration / 60)}\n`;
      });
    } else if (templateId === 'revenue_analysis' && data.transactions) {
      csv += 'Transaction ID,Amount,Currency,Status,Payment Method,Created At\n';
      data.transactions.forEach((tx: any) => {
        csv += `${tx.transactionId},${tx.amount},${tx.currency},${tx.status},${tx.paymentMethod},${tx.createdAt}\n`;
      });
    } else {
      // Generic CSV format
      csv += Object.keys(data.data[0] || {}).join(',') + '\n';
      (data.data || []).forEach((row: any) => {
        csv += Object.values(row).join(',') + '\n';
      });
    }

    return csv;
  };

  const generatePDFContent = (data: any, templateId: string) => {
    // This would normally generate actual PDF content
    // For demo purposes, returning formatted text that would be converted to PDF
    return `%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n\nMOCKMATE REPORT\n${templates.find(t => t.id === templateId)?.name || templateId}\n\nGenerated: ${new Date().toLocaleString()}\nPeriod: ${data.reportInfo.period.startDate} to ${data.reportInfo.period.endDate}\n\nSummary: ${JSON.stringify(data.summary || data.reportInfo, null, 2)}\n\n[PDF content would be properly formatted here]`;
  };

  const generateExcelContent = (data: any, templateId: string) => {
    // This would normally generate actual Excel content
    // For demo purposes, returning tab-separated values
    let excel = `MockMate Report: ${templates.find(t => t.id === templateId)?.name || templateId}\t\t\n`;
    excel += `Generated: ${new Date().toLocaleString()}\t\t\n`;
    excel += `Period: ${data.reportInfo.period.startDate} to ${data.reportInfo.period.endDate}\t\t\n\n`;

    if (data.summary) {
      excel += 'Summary\t\t\n';
      Object.entries(data.summary).forEach(([key, value]) => {
        excel += `${key}\t${value}\t\n`;
      });
      excel += '\n';
    }

    // Add data in Excel format (tab-separated)
    const dataArray = data.activities || data.transactions || data.endpoints || data.data || [];
    if (dataArray.length > 0) {
      excel += Object.keys(dataArray[0]).join('\t') + '\n';
      dataArray.forEach((row: any) => {
        excel += Object.values(row).join('\t') + '\n';
      });
    }

    return excel;
  };

  const generateWordContent = (data: any, templateId: string) => {
    // This would normally generate actual Word document content
    // For demo purposes, returning formatted text
    return `MockMate Report\n\n${templates.find(t => t.id === templateId)?.name || templateId}\n\nGenerated: ${new Date().toLocaleString()}\nPeriod: ${data.reportInfo.period.startDate} to ${data.reportInfo.period.endDate}\n\nExecutive Summary\n${JSON.stringify(data.summary || data.reportInfo, null, 2)}\n\nDetailed Data\n${JSON.stringify(data, null, 2)}\n\n[Word document formatting would be applied here]`;
  };

  const getReportIcon = (templateId: string) => {
    switch (templateId) {
      case 'user_activity':
        return <UsersIcon className='h-6 w-6 text-primary-500' />;
      case 'session_analysis':
        return <ChartBarIcon className='h-6 w-6 text-cli-cyan' />;
      case 'revenue_analysis':
        return <CurrencyDollarIcon className='h-6 w-6 text-cli-amber' />;
      case 'api_usage':
        return <DocumentTextIcon className='h-6 w-6 text-cli-green' />;
      case 'security_audit':
        return <ExclamationTriangleIcon className='h-6 w-6 text-red-500' />;
      case 'performance_metrics':
        return <ClockIcon className='h-6 w-6 text-cli-cyan' />;
      case 'payment_transactions':
        return <CurrencyDollarIcon className='h-6 w-6 text-cli-green' />;
      case 'subscription_analysis':
        return <UsersIcon className='h-6 w-6 text-cli-amber' />;
      case 'error_tracking':
        return <ExclamationTriangleIcon className='h-6 w-6 text-red-400' />;
      case 'content_analytics':
        return <DocumentIcon className='h-6 w-6 text-primary-500' />;
      case 'compliance_report':
        return <DocumentTextIcon className='h-6 w-6 text-cli-amber' />;
      case 'custom_analytics':
        return <ChartBarIcon className='h-6 w-6 text-primary-500' />;
      default:
        return <DocumentTextIcon className='h-6 w-6 text-cli-light-gray' />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <CliBadge variant='success'>COMPLETED</CliBadge>;
      case 'processing':
        return <CliBadge variant='warning'>PROCESSING</CliBadge>;
      case 'failed':
        return <CliBadge variant='danger'>FAILED</CliBadge>;
      default:
        return <CliBadge variant='secondary'>{status.toUpperCase()}</CliBadge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className='space-y-6'>
      {/* Header */}
      <TerminalWindow title='admin@mockmate:~$ ./reports --generate --analyze'>
        <div className='p-6'>
          <div className='mb-6 flex items-center justify-between'>
            <TypingText
              text='Reports & Analytics System'
              className='font-mono text-xl font-bold text-primary-500'
            />
            <div className='flex items-center space-x-4'>
              <div className='font-mono text-sm text-cli-light-gray'>
                Available Templates: <span className='text-primary-500'>{templates.length}</span>
              </div>
            </div>
          </div>

          {/* Report Generation Controls */}
          <div className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-4'>
            <CliInput
              type='date'
              label='Start Date'
              value={filters.startDate}
              onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
            />

            <CliInput
              type='date'
              label='End Date'
              value={filters.endDate}
              onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
            />

            <CliSelect
              label='Output Format'
              value={filters.format}
              onChange={e => setFilters(prev => ({ ...prev, format: e.target.value as any }))}
              options={[
                { value: 'json', label: 'JSON' },
                { value: 'csv', label: 'CSV' },
                { value: 'pdf', label: 'PDF' },
                { value: 'xlsx', label: 'Excel (XLSX)' },
                { value: 'word', label: 'Word Document' },
              ]}
            />

            <div className='flex items-end'>
              <CliButton variant='secondary' onClick={fetchReportHistory} disabled={loading}>
                Refresh History
              </CliButton>
            </div>
          </div>

          <div className='font-mono text-xs text-cli-green'>
            $ find /reports -name "*.{filters.format}" -newer $(date -d "{filters.startDate}" +%s) |
            head -10
          </div>
        </div>
      </TerminalWindow>

      {/* Report Templates */}
      <TerminalWindow title='admin@mockmate:~$ cat report_templates.conf'>
        <div className='p-6'>
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3'>
            {templates.map(template => (
              <CliCard
                key={template.id}
                className='hover:shadow-glow-info transition-all duration-300'
              >
                <div className='p-6'>
                  <div className='mb-4 flex items-center space-x-4'>
                    {getReportIcon(template.id)}
                    <div>
                      <h3 className='font-mono text-lg font-semibold text-cli-white'>
                        {template.name}
                      </h3>
                      <p className='mt-1 font-mono text-sm text-cli-light-gray'>
                        {template.description}
                      </p>
                    </div>
                  </div>

                  <div className='mb-6 space-y-2'>
                    <div className='font-mono text-xs text-cli-light-gray'>Supported formats:</div>
                    <div className='flex space-x-2'>
                      {template.formats.map(format => (
                        <CliBadge key={format} variant='secondary' className='text-xs'>
                          {format.toUpperCase()}
                        </CliBadge>
                      ))}
                    </div>
                  </div>

                  <CliButton
                    variant='primary'
                    onClick={() => generateReport(template.id)}
                    disabled={generating === template.id}
                    className='w-full'
                  >
                    {generating === template.id ? (
                      <>
                        <ClockIcon className='mr-2 h-4 w-4 animate-spin' />
                        Generating...
                      </>
                    ) : (
                      <>
                        <DocumentIcon className='mr-2 h-4 w-4' />
                        Generate Report
                      </>
                    )}
                  </CliButton>
                </div>
              </CliCard>
            ))}
          </div>
        </div>
      </TerminalWindow>

      {/* Report History */}
      <TerminalWindow title='admin@mockmate:~$ tail -f /var/log/reports.log'>
        <div className='p-6'>
          <h3 className='mb-4 font-mono text-lg font-semibold text-cli-white'>
            Report Generation History
          </h3>

          {loading ? (
            <div className='flex items-center justify-center py-12'>
              <TypingText text='Loading report history...' className='text-cli-light-gray' />
            </div>
          ) : (
            <div className='space-y-4'>
              {history.map(report => (
                <CliCard
                  key={report.id}
                  className='hover:shadow-glow-info transition-all duration-300'
                >
                  <div className='p-4'>
                    <div className='grid grid-cols-1 items-center gap-4 lg:grid-cols-12'>
                      {/* Report Info */}
                      <div className='lg:col-span-3'>
                        <div className='flex items-center space-x-3'>
                          {getReportIcon(report.type)}
                          <div>
                            <div className='font-mono font-semibold text-cli-white'>
                              {templates.find(t => t.id === report.type)?.name || report.type}
                            </div>
                            <div className='font-mono text-sm text-cli-light-gray'>
                              ID: {report.id}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Status & Timing */}
                      <div className='lg:col-span-2'>
                        <div className='space-y-1'>
                          {getStatusBadge(report.status)}
                          <div className='font-mono text-xs text-cli-light-gray'>
                            {new Date(report.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Parameters */}
                      <div className='lg:col-span-3'>
                        <div className='font-mono text-sm'>
                          <div className='text-cli-cyan'>
                            Period: {report.parameters.startDate} to {report.parameters.endDate}
                          </div>
                          <div className='text-cli-amber'>
                            Format: {report.parameters.format?.toUpperCase()}
                          </div>
                        </div>
                      </div>

                      {/* File Info */}
                      <div className='lg:col-span-2'>
                        <div className='space-y-1 font-mono text-sm'>
                          <div className='text-cli-light-gray'>
                            Size: {formatFileSize(report.fileSize)}
                          </div>
                          <div className='text-cli-light-gray'>
                            Downloads: {report.downloadCount}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className='lg:col-span-2'>
                        <div className='flex space-x-2'>
                          <button
                            className='p-1 text-cli-light-gray transition-colors hover:text-primary-500'
                            title='View Details'
                            onClick={() => {
                              // Implementation for viewing report details
                              console.log('View report:', report.id);
                            }}
                          >
                            <EyeIcon className='h-4 w-4' />
                          </button>

                          <button
                            className='p-1 text-cli-light-gray transition-colors hover:text-cli-green'
                            title='Download Report'
                            onClick={() => {
                              // Implementation for downloading report
                              console.log('Download report:', report.id);
                            }}
                          >
                            <ArrowDownTrayIcon className='h-4 w-4' />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CliCard>
              ))}

              {/* Pagination */}
              <div className='mt-6 flex items-center justify-between'>
                <div className='font-mono text-sm text-cli-light-gray'>
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} reports
                </div>
                <div className='flex space-x-2'>
                  <CliButton
                    variant='secondary'
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  >
                    Previous
                  </CliButton>
                  <div className='flex items-center space-x-1'>
                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => setPagination(prev => ({ ...prev, page }))}
                          className={`rounded px-3 py-1 font-mono text-sm ${
                            page === pagination.page
                              ? 'bg-primary-500 text-black'
                              : 'text-cli-light-gray hover:text-primary-500'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <CliButton
                    variant='secondary'
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </CliButton>
                </div>
              </div>
            </div>
          )}

          <div className='mt-4 font-mono text-xs text-cli-green'>
            $ watch -n 5 "ls -la /reports/*.{filters.format} | tail -10"
          </div>
        </div>
      </TerminalWindow>
    </div>
  );
};

export default Reports;
