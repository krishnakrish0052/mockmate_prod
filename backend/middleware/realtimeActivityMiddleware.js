import { logger } from '../config/logger.js';

/**
 * Create real-time activity monitoring middleware
 */
export function createRealtimeActivityMiddleware(realtimeAnalyticsService, analyticsService) {
  return {
    // Middleware for tracking user authentication events
    trackAuthActivity: activityType => {
      return (req, res, next) => {
        // Store original methods to call after tracking
        const originalJson = res.json;
        const originalStatus = res.status;

        let statusCode = 200;

        // Override status to capture status code
        res.status = function (code) {
          statusCode = code;
          return originalStatus.call(this, code);
        };

        // Override json to capture response and track activity
        res.json = function (data) {
          // Track successful authentication activities
          if (statusCode >= 200 && statusCode < 300) {
            const userId = req.user?.id || req.body?.userId || data?.user?.id;

            if (userId) {
              setImmediate(async () => {
                try {
                  // Track in analytics service
                  if (analyticsService) {
                    await analyticsService.trackUserActivity(
                      userId,
                      activityType,
                      {
                        method: req.method,
                        path: req.path,
                        statusCode,
                        timestamp: new Date().toISOString(),
                      },
                      req
                    );
                  }

                  // Broadcast to admin dashboards
                  if (realtimeAnalyticsService) {
                    realtimeAnalyticsService.broadcastUserActivity(
                      userId,
                      activityType,
                      {
                        method: req.method,
                        path: req.path,
                        statusCode,
                        userAgent: req.get('User-Agent'),
                        timestamp: new Date().toISOString(),
                      },
                      req
                    );
                  }
                } catch (error) {
                  logger.error(`Failed to track ${activityType}:`, error);
                }
              });
            }
          }

          return originalJson.call(this, data);
        };

        next();
      };
    },

    // Middleware for tracking payment activities
    trackPaymentActivity: () => {
      return (req, res, next) => {
        const originalJson = res.json;
        let statusCode = 200;

        res.status = function (code) {
          statusCode = code;
          return this;
        };

        res.json = function (data) {
          // Track successful payments
          if (statusCode >= 200 && statusCode < 300 && data?.success) {
            const userId = req.user?.id || req.body?.userId;
            const paymentDetails = {
              amount: req.body?.amount || data?.payment?.amount,
              currency: req.body?.currency || data?.payment?.currency || 'USD',
              credits: req.body?.credits || data?.payment?.credits,
              provider: req.body?.provider || data?.payment?.provider,
              transactionId: data?.payment?.transactionId || data?.transactionId,
              status: 'completed',
            };

            if (userId) {
              setImmediate(async () => {
                try {
                  // Track in analytics service
                  if (analyticsService) {
                    await analyticsService.trackCreditPurchase(userId, paymentDetails, req);
                  }

                  // Broadcast payment activity to admin dashboards
                  if (realtimeAnalyticsService) {
                    realtimeAnalyticsService.broadcastPaymentActivity(userId, paymentDetails);
                  }
                } catch (error) {
                  logger.error('Failed to track payment activity:', error);
                }
              });
            }
          }

          return originalJson.call(this, data);
        };

        next();
      };
    },

    // Middleware for tracking session activities
    trackSessionActivity: activityType => {
      return (req, res, next) => {
        const originalJson = res.json;
        let statusCode = 200;

        res.status = function (code) {
          statusCode = code;
          return this;
        };

        res.json = function (data) {
          if (statusCode >= 200 && statusCode < 300) {
            const userId = req.user?.id;
            const sessionId = req.body?.sessionId || req.params?.sessionId || data?.sessionId;

            if (userId && sessionId) {
              const sessionDetails = {
                sessionId,
                type: req.body?.sessionType || req.body?.type,
                duration: req.body?.duration,
                questionsCount: req.body?.questionsCount,
                completed: req.body?.completed,
                jobTitle: req.body?.jobTitle,
                difficulty: req.body?.difficulty,
              };

              setImmediate(async () => {
                try {
                  // Track in analytics service
                  if (analyticsService) {
                    await analyticsService.trackInterviewSession(userId, sessionDetails, req);
                  }

                  // Broadcast session activity to admin dashboards
                  if (realtimeAnalyticsService) {
                    realtimeAnalyticsService.broadcastSessionActivity(
                      sessionId,
                      userId,
                      activityType,
                      sessionDetails
                    );
                  }
                } catch (error) {
                  logger.error(`Failed to track session ${activityType}:`, error);
                }
              });
            }
          }

          return originalJson.call(this, data);
        };

        next();
      };
    },

    // Middleware for tracking file operations
    trackFileActivity: activityType => {
      return (req, res, next) => {
        const originalJson = res.json;
        let statusCode = 200;

        res.status = function (code) {
          statusCode = code;
          return this;
        };

        res.json = function (data) {
          if (statusCode >= 200 && statusCode < 300) {
            const userId = req.user?.id;

            if (userId) {
              const fileDetails = {
                filename: req.file?.filename || req.body?.filename,
                originalName: req.file?.originalname || req.body?.originalName,
                size: req.file?.size || req.body?.size,
                mimetype: req.file?.mimetype || req.body?.mimetype,
                path: req.path,
                activity: activityType,
              };

              setImmediate(async () => {
                try {
                  // Track in analytics service
                  if (analyticsService) {
                    await analyticsService.trackUserActivity(
                      userId,
                      `file_${activityType}`,
                      fileDetails,
                      req
                    );
                  }

                  // Broadcast file activity to admin dashboards
                  if (realtimeAnalyticsService) {
                    realtimeAnalyticsService.broadcastUserActivity(
                      userId,
                      `file_${activityType}`,
                      fileDetails,
                      req
                    );
                  }
                } catch (error) {
                  logger.error(`Failed to track file ${activityType}:`, error);
                }
              });
            }
          }

          return originalJson.call(this, data);
        };

        next();
      };
    },

    // Middleware for tracking API usage and errors
    trackApiActivity: () => {
      return (req, res, next) => {
        const startTime = Date.now();
        const originalJson = res.json;
        const originalSend = res.send;
        let statusCode = 200;

        res.status = function (code) {
          statusCode = code;
          return this;
        };

        // Track API response
        const trackResponse = function (data) {
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          const userId = req.user?.id;

          // Skip tracking for certain routes to avoid noise
          const skipRoutes = ['/health', '/favicon.ico', '/robots.txt'];
          const shouldSkip = skipRoutes.some(route => req.path.startsWith(route));

          if (!shouldSkip) {
            setImmediate(async () => {
              try {
                const apiActivity = {
                  endpoint: req.path,
                  method: req.method,
                  statusCode,
                  responseTime,
                  userAgent: req.get('User-Agent'),
                  isError: statusCode >= 400,
                  timestamp: new Date().toISOString(),
                };

                // Track in analytics service
                if (analyticsService && userId) {
                  await analyticsService.trackUserActivity(
                    userId,
                    statusCode >= 400 ? 'api_error' : 'api_call',
                    apiActivity,
                    req
                  );
                }

                // Broadcast errors to admin dashboards
                if (realtimeAnalyticsService && statusCode >= 400) {
                  realtimeAnalyticsService.broadcastUserActivity(
                    userId || 'anonymous',
                    'api_error',
                    {
                      ...apiActivity,
                      errorData: data,
                    },
                    req
                  );
                }
              } catch (error) {
                logger.error('Failed to track API activity:', error);
              }
            });
          }
        };

        res.json = function (data) {
          trackResponse(data);
          return originalJson.call(this, data);
        };

        res.send = function (data) {
          trackResponse(data);
          return originalSend.call(this, data);
        };

        next();
      };
    },

    // Middleware for tracking user profile changes
    trackProfileActivity: () => {
      return (req, res, next) => {
        const originalJson = res.json;
        let statusCode = 200;

        res.status = function (code) {
          statusCode = code;
          return this;
        };

        res.json = function (data) {
          if (statusCode >= 200 && statusCode < 300 && data?.success) {
            const userId = req.user?.id;

            if (userId) {
              const profileChanges = {
                fields: Object.keys(req.body || {}),
                timestamp: new Date().toISOString(),
              };

              setImmediate(async () => {
                try {
                  // Track in analytics service
                  if (analyticsService) {
                    await analyticsService.trackUserActivity(
                      userId,
                      'profile_update',
                      profileChanges,
                      req
                    );
                  }

                  // Broadcast profile activity to admin dashboards
                  if (realtimeAnalyticsService) {
                    realtimeAnalyticsService.broadcastUserActivity(
                      userId,
                      'profile_update',
                      profileChanges,
                      req
                    );
                  }
                } catch (error) {
                  logger.error('Failed to track profile activity:', error);
                }
              });
            }
          }

          return originalJson.call(this, data);
        };

        next();
      };
    },

    // Middleware for tracking system events
    trackSystemActivity: (eventType, eventDetails = {}) => {
      return (req, res, next) => {
        setImmediate(async () => {
          try {
            const systemEvent = {
              eventType,
              details: eventDetails,
              adminId: req.admin?.id,
              adminUsername: req.admin?.username,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent'),
              timestamp: new Date().toISOString(),
            };

            // Broadcast system events to admin dashboards
            if (realtimeAnalyticsService) {
              realtimeAnalyticsService.broadcastToSubscribed('system_activity', systemEvent);
            }
          } catch (error) {
            logger.error(`Failed to track system activity ${eventType}:`, error);
          }
        });

        next();
      };
    },
  };
}

/**
 * Enhanced analytics middleware that combines page tracking with activity monitoring
 */
export function createEnhancedAnalyticsMiddleware(analyticsService, realtimeAnalyticsService) {
  return async (req, res, next) => {
    try {
      // Skip tracking for certain routes
      const skipRoutes = [
        '/health',
        '/favicon.ico',
        '/robots.txt',
        '/sitemap.xml',
        '/api/analytics',
        '/admin/analytics',
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

      // Track page visit asynchronously
      setImmediate(async () => {
        try {
          // Track in analytics service
          if (analyticsService) {
            await analyticsService.trackPageVisit(req, userId);
          }

          // Broadcast page visit to admin dashboards
          if (realtimeAnalyticsService && userId) {
            realtimeAnalyticsService.broadcastUserActivity(
              userId,
              'page_visit',
              {
                path: req.path,
                method: req.method,
                query: req.query,
                timestamp: new Date().toISOString(),
              },
              req
            );
          }
        } catch (error) {
          logger.error('Failed to track page visit in enhanced middleware:', error);
        }
      });

      // Add enhanced analytics tracking helpers to request object
      req.analytics = {
        track: (actionType, actionDetails = {}) => {
          setImmediate(async () => {
            try {
              if (analyticsService) {
                await analyticsService.trackUserActivity(userId, actionType, actionDetails, req);
              }
              if (realtimeAnalyticsService) {
                realtimeAnalyticsService.broadcastUserActivity(
                  userId,
                  actionType,
                  actionDetails,
                  req
                );
              }
            } catch (error) {
              logger.error(`Failed to track ${actionType}:`, error);
            }
          });
        },

        trackWithBroadcast: (actionType, actionDetails = {}) => {
          setImmediate(async () => {
            try {
              if (analyticsService) {
                await analyticsService.trackUserActivity(userId, actionType, actionDetails, req);
              }
              if (realtimeAnalyticsService) {
                realtimeAnalyticsService.broadcastUserActivity(
                  userId,
                  actionType,
                  actionDetails,
                  req
                );
              }
            } catch (error) {
              logger.error(`Failed to track with broadcast ${actionType}:`, error);
            }
          });
        },

        broadcastOnly: (actionType, actionDetails = {}) => {
          if (realtimeAnalyticsService) {
            realtimeAnalyticsService.broadcastUserActivity(userId, actionType, actionDetails, req);
          }
        },
      };

      next();
    } catch (error) {
      logger.error('Enhanced analytics middleware error:', error);
      next(); // Don't block the request if analytics fails
    }
  };
}

export default {
  createRealtimeActivityMiddleware,
  createEnhancedAnalyticsMiddleware,
};
