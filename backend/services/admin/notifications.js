export class NotificationService {
  constructor(redis) {
    this.redis = redis;
  }

  async sendNotification(type, data, targetAdminId = null) {
    const notification = {
      id: this.generateId(),
      type,
      data,
      targetAdminId,
      timestamp: new Date().toISOString(),
      read: false,
    };

    try {
      // Store notification in Redis for persistence
      const key = targetAdminId ? `notifications:${targetAdminId}` : 'notifications:global';
      await this.redis.set(
        `${key}:${notification.id}`,
        JSON.stringify(notification),
        3600 // TTL of 1 hour
      );

      return notification;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return null;
    }
  }

  async getNotifications(adminId, limit = 20) {
    try {
      // This is a simplified implementation
      // In a real system, you'd want to use Redis lists or sorted sets for better performance
      return [];
    } catch (error) {
      console.error('Failed to get notifications:', error);
      return [];
    }
  }

  async markAsRead(notificationId, adminId) {
    try {
      const key = `notifications:${adminId}:${notificationId}`;
      const notification = await this.redis.get(key);

      if (notification) {
        const parsedNotification = JSON.parse(notification);
        parsedNotification.read = true;
        parsedNotification.readAt = new Date().toISOString();

        await this.redis.set(key, JSON.stringify(parsedNotification), 3600);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
