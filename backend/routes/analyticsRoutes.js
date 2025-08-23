import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminMiddleware.js';
import { logger } from '../config/logger.js';
import { createEventTrackingMiddleware } from '../middleware/analyticsMiddleware.js';

const router = express.Router();

// Analytics routes factory that accepts the analytics service
export function createAnalyticsRoutes(analyticsService) {
  const eventTracking = createEventTrackingMiddleware(analyticsService);

  // Apply authentication and admin middleware to all routes
  router.use(authenticateToken);
  router.use(requireAdmin);

  // Get dashboard analytics
  router.get('/dashboard', async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const analytics = await analyticsService.getDashboardAnalytics(timeRange);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.error('Failed to get dashboard analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve analytics data',
        error: error.message,
      });
    }
  });

  // Get user analytics overview
  router.get('/users', async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const interval = req.query.timeRange?.replace(' ', '_') || '30_days';

      const [totalUsers, recentRegistrations, userActivity] = await Promise.all([
        analyticsService.getTotalUsers(),
        analyticsService.getRecentRegistrations(interval),
        analyticsService.getUserActivityBreakdown(interval),
      ]);

      res.json({
        success: true,
        data: {
          totalUsers: totalUsers.count,
          recentRegistrations: recentRegistrations.count,
          userActivity,
          timeRange,
        },
      });
    } catch (error) {
      logger.error('Failed to get user analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve user analytics',
        error: error.message,
      });
    }
  });

  // Get traffic analytics
  router.get('/traffic', async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const interval = timeRange.replace(' ', '_');

      const [totalVisits, totalPageViews, dailyAnalytics, topPages, topReferrers] =
        await Promise.all([
          analyticsService.getTotalVisits(interval),
          analyticsService.getTotalPageViews(interval),
          analyticsService.getDailyAnalytics(interval),
          analyticsService.getTopPages(interval, 15),
          analyticsService.getTopReferrers(interval, 15),
        ]);

      res.json({
        success: true,
        data: {
          totalVisits: totalVisits.count,
          totalPageViews: totalPageViews.count,
          dailyAnalytics,
          topPages,
          topReferrers,
          timeRange,
        },
      });
    } catch (error) {
      logger.error('Failed to get traffic analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve traffic analytics',
        error: error.message,
      });
    }
  });

  // Get device and browser statistics
  router.get('/devices', async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const interval = timeRange.replace(' ', '_');

      const [browserStats, deviceStats, osStats] = await Promise.all([
        analyticsService.getBrowserStats(interval),
        analyticsService.getDeviceStats(interval),
        analyticsService.getOperatingSystemStats(interval),
      ]);

      res.json({
        success: true,
        data: {
          browsers: browserStats,
          devices: deviceStats,
          operatingSystems: osStats,
          timeRange,
        },
      });
    } catch (error) {
      logger.error('Failed to get device analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve device analytics',
        error: error.message,
      });
    }
  });

  // Get geographical statistics
  router.get('/geography', async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const interval = timeRange.replace(' ', '_');

      const [locationStats, cityStats] = await Promise.all([
        analyticsService.getLocationStats(interval),
        analyticsService.getCityStats(interval),
      ]);

      res.json({
        success: true,
        data: {
          countries: locationStats,
          cities: cityStats,
          timeRange,
        },
      });
    } catch (error) {
      logger.error('Failed to get geography analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve geographical analytics',
        error: error.message,
      });
    }
  });

  // Get business metrics
  router.get('/business', async (req, res) => {
    try {
      const timeRange = req.query.timeRange || '30 days';
      const interval = timeRange.replace(' ', '_');

      const [creditPurchases, interviewSessions, conversionMetrics, revenueMetrics] =
        await Promise.all([
          analyticsService.getTotalCreditPurchases(interval),
          analyticsService.getInterviewSessionStats(interval),
          analyticsService.getConversionMetrics(interval),
          analyticsService.getRevenueMetrics(interval),
        ]);

      res.json({
        success: true,
        data: {
          creditPurchases: creditPurchases.count,
          interviewSessions,
          conversion: conversionMetrics,
          revenue: revenueMetrics,
          timeRange,
        },
      });
    } catch (error) {
      logger.error('Failed to get business analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve business analytics',
        error: error.message,
      });
    }
  });

  // Get real-time analytics
  router.get('/realtime', async (req, res) => {
    try {
      const realtimeData = await analyticsService.getRealtimeAnalytics();

      res.json({
        success: true,
        data: realtimeData,
      });
    } catch (error) {
      logger.error('Failed to get real-time analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve real-time analytics',
        error: error.message,
      });
    }
  });

  // Get custom analytics report
  router.post('/custom-report', async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        metrics = ['page_views', 'unique_visitors'],
        groupBy = 'day',
        filters = {},
      } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required',
        });
      }

      const report = await analyticsService.generateCustomReport({
        startDate,
        endDate,
        metrics,
        groupBy,
        filters,
      });

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error('Failed to generate custom report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate custom report',
        error: error.message,
      });
    }
  });

  // Export analytics data
  router.get('/export', async (req, res) => {
    try {
      const { format = 'csv', timeRange = '30 days', includeDetails = 'false' } = req.query;

      const interval = timeRange.replace(' ', '_');

      const exportData = await analyticsService.exportAnalyticsData({
        format,
        interval,
        includeDetails: includeDetails === 'true',
      });

      // Set appropriate headers based on format
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.csv"`);
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.json"`);
      }

      res.send(exportData);
    } catch (error) {
      logger.error('Failed to export analytics data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export analytics data',
        error: error.message,
      });
    }
  });

  // Cleanup old analytics data (admin only)
  router.delete('/cleanup', async (req, res) => {
    try {
      const daysToKeep = parseInt(req.query.daysToKeep) || 365;

      if (daysToKeep < 30) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete data newer than 30 days',
        });
      }

      const deletedCount = await analyticsService.cleanupOldData(daysToKeep);

      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} old analytics records`,
        deletedCount,
      });
    } catch (error) {
      logger.error('Failed to cleanup analytics data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup analytics data',
        error: error.message,
      });
    }
  });

  return router;
}

// Export the router factory
export default createAnalyticsRoutes;
