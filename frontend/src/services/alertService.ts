import { Alert } from '../components/alerts/AlertNotification';

// API base URL - use environment variable or fallback to localhost
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export interface CreateAlertRequest {
  title: string;
  message: string;
  alertType: 'info' | 'warning' | 'error' | 'success' | 'announcement';
  priority?: 'low' | 'normal' | 'high' | 'critical';
  targetUserIds?: string[];
  targetRoles?: string[];
  actionUrl?: string;
  actionText?: string;
  icon?: string;
  expiresAt?: string;
  isDismissible?: boolean;
  sendEmail?: boolean;
  emailTemplateId?: string;
}

export interface AlertFilters {
  alertType?: string[];
  priority?: string[];
  isRead?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AlertAnalytics {
  totalAlerts: number;
  unreadCount: number;
  typeBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  recentActivity: {
    date: string;
    alertsCreated: number;
    alertsRead: number;
    alertsDismissed: number;
  }[];
}

export interface AlertTemplate {
  id: string;
  name: string;
  title: string;
  message: string;
  alertType: string;
  priority: string;
  actionUrl?: string;
  actionText?: string;
  icon?: string;
  isDismissible: boolean;
  emailTemplate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

class AlertService {
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('admin_token');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const config: RequestInit = {
      headers: this.getAuthHeaders(),
      ...options,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // User alert methods
  async getUserAlerts(filters: AlertFilters = {}): Promise<{ alerts: Alert[]; total: number }> {
    const params = new URLSearchParams();

    if (filters.alertType?.length) {
      params.append('alertType', filters.alertType.join(','));
    }
    if (filters.priority?.length) {
      params.append('priority', filters.priority.join(','));
    }
    if (filters.isRead !== undefined) {
      params.append('isRead', filters.isRead.toString());
    }
    if (filters.startDate) {
      params.append('startDate', filters.startDate);
    }
    if (filters.endDate) {
      params.append('endDate', filters.endDate);
    }
    if (filters.limit) {
      params.append('limit', filters.limit.toString());
    }
    if (filters.offset) {
      params.append('offset', filters.offset.toString());
    }

    const query = params.toString();
    return this.request<{ alerts: Alert[]; total: number }>(`/alerts${query ? `?${query}` : ''}`);
  }

  async getUnreadCount(): Promise<{ count: number }> {
    return this.request<{ count: number }>('/alerts/unread-count');
  }

  async getAlert(alertId: string): Promise<{ alert: Alert }> {
    return this.request<{ alert: Alert }>(`/alerts/${alertId}`);
  }

  async markAsRead(alertId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/alerts/${alertId}/read`, {
      method: 'POST',
    });
  }

  async markAllAsRead(): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>('/alerts/mark-all-read', {
      method: 'POST',
    });
  }

  async dismissAlert(alertId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/alerts/${alertId}/dismiss`, {
      method: 'POST',
    });
  }

  async dismissAllAlerts(): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>('/alerts/dismiss-all', {
      method: 'POST',
    });
  }

  // Admin alert methods
  async getAdminAlerts(filters: AlertFilters = {}): Promise<{ alerts: Alert[]; total: number }> {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          params.append(key, value.join(','));
        } else {
          params.append(key, value.toString());
        }
      }
    });

    const query = params.toString();
    return this.request<{ alerts: Alert[]; total: number }>(
      `/admin/alerts${query ? `?${query}` : ''}`
    );
  }

  async createAlert(alertData: CreateAlertRequest): Promise<{ alert: Alert }> {
    return this.request<{ alert: Alert }>('/admin/alerts', {
      method: 'POST',
      body: JSON.stringify(alertData),
    });
  }

  async updateAlert(
    alertId: string,
    updates: Partial<CreateAlertRequest>
  ): Promise<{ alert: Alert }> {
    return this.request<{ alert: Alert }>(`/admin/alerts/${alertId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAlert(alertId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/admin/alerts/${alertId}`, {
      method: 'DELETE',
    });
  }

  async getAlertAnalytics(): Promise<AlertAnalytics> {
    return this.request<AlertAnalytics>('/admin/alerts/analytics/summary');
  }

  async broadcastAlert(
    alertData: CreateAlertRequest
  ): Promise<{ alert: Alert; recipientCount: number }> {
    return this.request<{ alert: Alert; recipientCount: number }>('/admin/alerts/broadcast', {
      method: 'POST',
      body: JSON.stringify(alertData),
    });
  }

  async searchUsers(
    query: string
  ): Promise<{ users: Array<{ id: string; name: string; email: string }> }> {
    const params = new URLSearchParams({ q: query });
    return this.request<{ users: Array<{ id: string; name: string; email: string }> }>(
      `/admin/alerts/users/search?${params}`
    );
  }

  // Alert template methods
  async getAlertTemplates(): Promise<{ templates: AlertTemplate[] }> {
    return this.request<{ templates: AlertTemplate[] }>('/admin/alerts/templates');
  }

  async createAlertTemplate(
    templateData: Omit<AlertTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ template: AlertTemplate }> {
    return this.request<{ template: AlertTemplate }>('/admin/alerts/templates', {
      method: 'POST',
      body: JSON.stringify(templateData),
    });
  }

  async updateAlertTemplate(
    templateId: string,
    updates: Partial<AlertTemplate>
  ): Promise<{ template: AlertTemplate }> {
    return this.request<{ template: AlertTemplate }>(`/admin/alerts/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAlertTemplate(templateId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/admin/alerts/templates/${templateId}`, {
      method: 'DELETE',
    });
  }

  // Batch operations
  async markMultipleAsRead(alertIds: string[]): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>('/alerts/batch/mark-read', {
      method: 'POST',
      body: JSON.stringify({ alertIds }),
    });
  }

  async dismissMultiple(alertIds: string[]): Promise<{ success: boolean; count: number }> {
    return this.request<{ success: boolean; count: number }>('/alerts/batch/dismiss', {
      method: 'POST',
      body: JSON.stringify({ alertIds }),
    });
  }
}

export const alertService = new AlertService();
export default alertService;
