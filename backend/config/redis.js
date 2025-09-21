import redis from 'redis';
import { logger } from './logger.js';

let client;

const initializeRedis = async () => {
  try {
    client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        connectTimeout: 20000, // 20 seconds
        lazyConnect: true,
        keepAlive: 30000, // 30 seconds
        reconnectStrategy: (retries) => {
          if (retries > 20) {
            logger.error('Redis reconnection attempts exhausted');
            return false; // Stop retrying
          }
          const delay = Math.min(retries * 100, 5000);
          logger.info(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      // Connection options for better stability
      commandsQueueMaxLength: 1000,
      enableOfflineQueue: true,
      disableOfflineQueue: false,
      retryDelayOnClusterDown: 1000,
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 3,
    });

    client.on('error', err => {
      logger.error('Redis Client Error:', {
        error: err.message,
        stack: err.stack,
        code: err.code,
        syscall: err.syscall,
        errno: err.errno
      });
    });

    client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    client.on('ready', () => {
      logger.info('Redis ready for operations');
    });

    client.on('end', () => {
      logger.warn('Redis connection ended');
    });

    client.on('disconnect', () => {
      logger.warn('Redis disconnected');
    });

    await client.connect();

    // Test the connection
    await client.ping();
  } catch (error) {
    logger.error('Error initializing Redis:', error);
    // Don't throw error - app should work without Redis
    // throw error;
  }
};

const getRedisClient = () => {
  return client;
};

const closeRedis = async () => {
  if (client && client.isOpen) {
    await client.disconnect();
    logger.info('Redis connection closed');
  }
};

// Cache utility functions
const cache = {
  async get(key) {
    try {
      if (!client || !client.isOpen) return null;
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  async set(key, value, expireInSeconds = 3600) {
    try {
      if (!client || !client.isOpen) return false;
      await client.setEx(key, expireInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Redis set error:', error);
      return false;
    }
  },

  async del(key) {
    try {
      if (!client || !client.isOpen) return false;
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis delete error:', error);
      return false;
    }
  },

  async exists(key) {
    try {
      if (!client || !client.isOpen) return false;
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  },

  async increment(key, expireInSeconds = 3600) {
    try {
      if (!client || !client.isOpen) return 0;
      const result = await client.incr(key);
      if (result === 1) {
        // First increment, set expiry
        await client.expire(key, expireInSeconds);
      }
      return result;
    } catch (error) {
      logger.error('Redis increment error:', error);
      return 0;
    }
  },
};

// Session management
const sessionManager = {
  async storeSession(sessionId, data, expireInSeconds = 86400) {
    // 24 hours
    const key = `session:${sessionId}`;
    return await cache.set(key, data, expireInSeconds);
  },

  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.get(key);
  },

  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    return await cache.del(key);
  },

  async extendSession(sessionId, expireInSeconds = 86400) {
    try {
      if (!client || !client.isOpen) return false;
      const key = `session:${sessionId}`;
      await client.expire(key, expireInSeconds);
      return true;
    } catch (error) {
      logger.error('Redis extend session error:', error);
      return false;
    }
  },
};

// WebSocket connection tracking
const socketManager = {
  async addConnection(userId, socketId) {
    const key = `socket:${userId}`;
    return await cache.set(key, { socketId, connectedAt: Date.now() });
  },

  async removeConnection(userId) {
    const key = `socket:${userId}`;
    return await cache.del(key);
  },

  async getConnection(userId) {
    const key = `socket:${userId}`;
    return await cache.get(key);
  },
};

// Admin authentication management
const adminAuthManager = {
  // Store admin refresh token
  async storeRefreshToken(adminId, refreshToken, expireInSeconds = 604800) {
    // 7 days
    const key = `admin:refresh:${adminId}:${refreshToken}`;
    return await cache.set(
      key,
      { adminId, token: refreshToken, createdAt: Date.now() },
      expireInSeconds
    );
  },

  // Check if refresh token is valid
  async isRefreshTokenValid(adminId, refreshToken) {
    const key = `admin:refresh:${adminId}:${refreshToken}`;
    const tokenData = await cache.get(key);
    return tokenData !== null;
  },

  // Remove specific refresh token
  async removeRefreshToken(adminId, refreshToken) {
    const key = `admin:refresh:${adminId}:${refreshToken}`;
    return await cache.del(key);
  },

  // Remove all refresh tokens for an admin (useful for logout all devices)
  async removeAllRefreshTokens(adminId) {
    try {
      if (!client || !client.isOpen) return false;
      const pattern = `admin:refresh:${adminId}:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Redis remove all refresh tokens error:', error);
      return false;
    }
  },

  // Blacklist access token (for immediate logout)
  async blacklistToken(token, expireInSeconds = 28800) {
    // 8 hours (default JWT expiry)
    const key = `admin:blacklist:${token}`;
    return await cache.set(key, { blacklistedAt: Date.now() }, expireInSeconds);
  },

  // Check if access token is blacklisted
  async isTokenBlacklisted(token) {
    const key = `admin:blacklist:${token}`;
    return await cache.exists(key);
  },

  // Rate limiting for admin login attempts
  async incrementLoginAttempts(identifier, expireInSeconds = 900) {
    // 15 minutes
    const key = `admin:login_attempts:${identifier}`;
    return await cache.increment(key, expireInSeconds);
  },

  // Get current login attempt count
  async getLoginAttempts(identifier) {
    const key = `admin:login_attempts:${identifier}`;
    const attempts = await cache.get(key);
    return attempts || 0;
  },

  // Reset login attempts
  async resetLoginAttempts(identifier) {
    const key = `admin:login_attempts:${identifier}`;
    return await cache.del(key);
  },
};

export {
  initializeRedis,
  getRedisClient,
  closeRedis,
  cache,
  sessionManager,
  socketManager,
  adminAuthManager,
};
