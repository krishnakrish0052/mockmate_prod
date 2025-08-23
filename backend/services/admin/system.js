import os from 'os';
import process from 'process';

export class SystemService {
  constructor(database, redis) {
    this.database = database;
    this.redis = redis;
  }

  async getSystemHealth() {
    const healthMetrics = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
        },
        cpu: {
          cores: os.cpus().length,
          loadAverage: os.loadavg(),
        },
      },
    };

    // Check database connection
    try {
      await this.database.query('SELECT 1');
      healthMetrics.services.database = 'healthy';
    } catch (error) {
      healthMetrics.services.database = 'unhealthy';
      healthMetrics.status = 'degraded';
    }

    // Check Redis connection
    try {
      if (this.redis.isConnected && this.redis.isConnected()) {
        await this.redis.set('health_check', 'ok', 10);
        healthMetrics.services.redis = 'healthy';
      } else {
        healthMetrics.services.redis = 'unhealthy';
        healthMetrics.status = 'degraded';
      }
    } catch (error) {
      healthMetrics.services.redis = 'unhealthy';
      healthMetrics.status = 'degraded';
    }

    return healthMetrics;
  }

  async getDetailedMetrics() {
    const metrics = await this.getSystemHealth();

    // Add more detailed metrics
    try {
      // Database metrics
      const dbStats = await this.database.query(`
        SELECT 
          schemaname,
          tablename,
          n_live_tup as live_tuples,
          n_dead_tup as dead_tuples
        FROM pg_stat_user_tables 
        ORDER BY n_live_tup DESC 
        LIMIT 5
      `);

      metrics.database = {
        status: metrics.services.database,
        tables: dbStats.rows || [],
      };

      // Application-specific metrics
      const appMetrics = await this.database.query(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM sessions WHERE status = 'active') as active_sessions,
          (SELECT COUNT(*) FROM sessions WHERE created_at > NOW() - INTERVAL '24 hours') as sessions_24h
      `);

      metrics.application = {
        totalUsers: parseInt(appMetrics.rows[0]?.total_users || 0),
        activeSessions: parseInt(appMetrics.rows[0]?.active_sessions || 0),
        sessions24h: parseInt(appMetrics.rows[0]?.sessions_24h || 0),
      };
    } catch (error) {
      metrics.error = 'Failed to fetch detailed metrics';
      console.error('Error getting detailed metrics:', error);
    }

    return metrics;
  }

  async getRealtimeMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        system: {
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
          uptime: process.uptime(),
        },
      };

      // Add database connection count if available
      const dbConnections = await this.database.query(`
        SELECT COUNT(*) as connection_count
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
      `);

      metrics.database = {
        connections: parseInt(dbConnections.rows[0]?.connection_count || 0),
      };

      return metrics;
    } catch (error) {
      console.error('Error getting realtime metrics:', error);
      return {
        error: 'Failed to get realtime metrics',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async runMaintenanceTasks() {
    const tasks = [];

    try {
      // Clean up expired sessions
      tasks.push(
        this.database.query(`
        UPDATE sessions 
        SET status = 'expired' 
        WHERE status = 'created' 
        AND created_at < NOW() - INTERVAL '24 hours'
      `)
      );

      // Clear old cache entries if Redis is available
      if (this.redis.isConnected && this.redis.isConnected()) {
        // This is a placeholder - actual cache cleanup would depend on your caching strategy
        tasks.push(Promise.resolve());
      }

      await Promise.all(tasks);
      console.log('Maintenance tasks completed successfully');

      return {
        success: true,
        tasksRun: tasks.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error running maintenance tasks:', error);
      throw error;
    }
  }

  scheduleMaintenanceTasks() {
    // This would typically use node-cron or similar
    // For now, just log that scheduling would happen here
    console.log('Maintenance task scheduling initialized');

    // Example: Run maintenance every hour
    // cron.schedule('0 * * * *', () => {
    //   this.runMaintenanceTasks().catch(console.error);
    // });
  }
}
