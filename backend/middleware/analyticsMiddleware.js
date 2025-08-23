import { logger } from '../config/logger.js';

// Analytics middleware factory that accepts the analytics service
export function createAnalyticsMiddleware(analyticsService) {
  return async (req, res, next) => {
    try {
      // Skip tracking for certain routes
      const skipRoutes = [
        '/health',
        '/favicon.ico',
        '/robots.txt',
        '/sitemap.xml',
        '/api/analytics', // Don't track analytics API calls themselves
        '/admin/analytics', // Don't track admin analytics dashboard
      ];

      const shouldSkip = skipRoutes.some(
        route => req.path === route || req.path.startsWith(route + '/')
      );

      if (shouldSkip) {
        return next();
      }

      // Skip tracking for static assets
      const staticAssetExtensions = [
        '.css',
        '.js',
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.svg',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.eot',
      ];
      const isStaticAsset = staticAssetExtensions.some(ext => req.path.toLowerCase().endsWith(ext));

      if (isStaticAsset) {
        return next();
      }

      // Get user ID if available
      const userId = req.user?.id || req.session?.userId || null;

      // Track page visit asynchronously to avoid blocking the request
      setImmediate(async () => {
        try {
          await analyticsService.trackPageVisit(req, userId);
        } catch (error) {
          logger.error('Failed to track page visit in middleware:', error);
        }
      });

      // Add analytics tracking helper to request object
      req.analytics = {
        track: (actionType, actionDetails = {}) => {
          setImmediate(async () => {
            try {
              await analyticsService.trackUserActivity(userId, actionType, actionDetails, req);
            } catch (error) {
              logger.error(`Failed to track ${actionType}:`, error);
            }
          });
        },

        trackRegistration: (newUserId, method = 'email') => {
          setImmediate(async () => {
            try {
              await analyticsService.trackUserRegistration(newUserId, method, req);
            } catch (error) {
              logger.error('Failed to track user registration:', error);
            }
          });
        },

        trackLogin: (loginUserId, method = 'email') => {
          setImmediate(async () => {
            try {
              await analyticsService.trackUserLogin(loginUserId, method, req);
            } catch (error) {
              logger.error('Failed to track user login:', error);
            }
          });
        },

        trackPurchase: (purchaseUserId, purchaseDetails) => {
          setImmediate(async () => {
            try {
              await analyticsService.trackCreditPurchase(purchaseUserId, purchaseDetails, req);
            } catch (error) {
              logger.error('Failed to track credit purchase:', error);
            }
          });
        },

        trackInterviewSession: (sessionUserId, sessionDetails) => {
          setImmediate(async () => {
            try {
              await analyticsService.trackInterviewSession(sessionUserId, sessionDetails, req);
            } catch (error) {
              logger.error('Failed to track interview session:', error);
            }
          });
        },
      };

      next();
    } catch (error) {
      logger.error('Analytics middleware error:', error);
      // Don't block the request if analytics fails
      next();
    }
  };
}

// Alternative middleware for tracking specific events
export function createEventTrackingMiddleware(analyticsService) {
  return {
    // Middleware for tracking API endpoint usage
    trackApiUsage: endpoint => {
      return async (req, res, next) => {
        const userId = req.user?.id || req.session?.userId || null;

        setImmediate(async () => {
          try {
            await analyticsService.trackUserActivity(
              userId,
              'api_usage',
              {
                endpoint,
                method: req.method,
                path: req.path,
                query: req.query,
                timestamp: new Date().toISOString(),
              },
              req
            );
          } catch (error) {
            logger.error(`Failed to track API usage for ${endpoint}:`, error);
          }
        });

        next();
      };
    },

    // Middleware for tracking form submissions
    trackFormSubmission: formName => {
      return async (req, res, next) => {
        const userId = req.user?.id || req.session?.userId || null;

        setImmediate(async () => {
          try {
            await analyticsService.trackUserActivity(
              userId,
              'form_submission',
              {
                formName,
                path: req.path,
                timestamp: new Date().toISOString(),
              },
              req
            );
          } catch (error) {
            logger.error(`Failed to track form submission for ${formName}:`, error);
          }
        });

        next();
      };
    },

    // Middleware for tracking file downloads
    trackDownload: (fileName, fileType) => {
      return async (req, res, next) => {
        const userId = req.user?.id || req.session?.userId || null;

        setImmediate(async () => {
          try {
            await analyticsService.trackUserActivity(
              userId,
              'file_download',
              {
                fileName,
                fileType,
                path: req.path,
                timestamp: new Date().toISOString(),
              },
              req
            );
          } catch (error) {
            logger.error(`Failed to track download for ${fileName}:`, error);
          }
        });

        next();
      };
    },

    // Middleware for tracking search queries
    trackSearch: async (req, res, next) => {
      const userId = req.user?.id || req.session?.userId || null;
      const searchQuery = req.query.q || req.body.query || '';

      if (searchQuery) {
        setImmediate(async () => {
          try {
            await analyticsService.trackUserActivity(
              userId,
              'search',
              {
                query: searchQuery,
                path: req.path,
                timestamp: new Date().toISOString(),
              },
              req
            );
          } catch (error) {
            logger.error('Failed to track search query:', error);
          }
        });
      }

      next();
    },
  };
}

export default { createAnalyticsMiddleware, createEventTrackingMiddleware };
