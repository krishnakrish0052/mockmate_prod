import { createClient } from 'redis';

export class RedisService {
  constructor() {
    this.client = null;
  }

  async connect() {
    try {
      // Build Redis URL from individual environment variables
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = process.env.REDIS_PORT || 6379;
      const redisUsername = process.env.REDIS_USERNAME;
      const redisPassword = process.env.REDIS_PASSWORD;

      let redisUrl;
      if (process.env.REDIS_URL) {
        // Use REDIS_URL if provided
        redisUrl = process.env.REDIS_URL;
      } else if (redisUsername && redisPassword) {
        // Build URL with authentication
        redisUrl = `redis://${redisUsername}:${redisPassword}@${redisHost}:${redisPort}`;
      } else {
        // Build URL without authentication
        redisUrl = `redis://${redisHost}:${redisPort}`;
      }

      console.log(`Connecting to Redis at: ${redisHost}:${redisPort}`);

      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 60000,
          lazyConnect: true,
        },
      });

      this.client.on('error', err => {
        console.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis');
      });

      await this.client.connect();
      console.log('Redis connection established');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      // For development, we might want to continue without Redis
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Continuing without Redis in development mode');
        this.client = {
          // Mock Redis client for development
          get: () => Promise.resolve(null),
          set: () => Promise.resolve('OK'),
          setex: () => Promise.resolve('OK'),
          del: () => Promise.resolve(1),
          exists: () => Promise.resolve(0),
          expire: () => Promise.resolve(1),
          info: () => Promise.resolve({}),
          disconnect: () => Promise.resolve(),
        };
        return;
      }
      throw error;
    }
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key, value, ttl = null) {
    try {
      if (ttl) {
        return await this.client.setEx(key, ttl, value);
      }
      return await this.client.set(key, value);
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error);
      return null;
    }
  }

  async setex(key, ttl, value) {
    try {
      return await this.client.setEx(key, ttl, value);
    } catch (error) {
      console.error(`Redis SETEX error for key ${key}:`, error);
      return null;
    }
  }

  async del(key) {
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error(`Redis DEL error for key ${key}:`, error);
      return 0;
    }
  }

  async exists(key) {
    try {
      return await this.client.exists(key);
    } catch (error) {
      console.error(`Redis EXISTS error for key ${key}:`, error);
      return 0;
    }
  }

  async expire(key, ttl) {
    try {
      return await this.client.expire(key, ttl);
    } catch (error) {
      console.error(`Redis EXPIRE error for key ${key}:`, error);
      return 0;
    }
  }

  async info() {
    try {
      const info = await this.client.info();
      // Parse info string into object
      const infoObj = {};
      info.split('\r\n').forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          infoObj[key] = isNaN(value) ? value : Number(value);
        }
      });
      return infoObj;
    } catch (error) {
      console.error('Redis INFO error:', error);
      return {};
    }
  }

  async disconnect() {
    if (this.client && this.client.disconnect) {
      await this.client.disconnect();
    }
  }

  isConnected() {
    return this.client && this.client.isOpen;
  }

  // Token management methods
  async storeRefreshToken(adminId, refreshToken, ttl = 7 * 24 * 60 * 60) {
    try {
      const key = `refresh_token:${adminId}`;
      return await this.client.setEx(key, ttl, refreshToken);
    } catch (error) {
      console.error(`Error storing refresh token for admin ${adminId}:`, error);
      return null;
    }
  }

  async isRefreshTokenValid(adminId, refreshToken) {
    try {
      const key = `refresh_token:${adminId}`;
      const storedToken = await this.client.get(key);
      return storedToken === refreshToken;
    } catch (error) {
      console.error(`Error validating refresh token for admin ${adminId}:`, error);
      return false;
    }
  }

  async removeRefreshToken(adminId, refreshToken) {
    try {
      const key = `refresh_token:${adminId}`;
      return await this.client.del(key);
    } catch (error) {
      console.error(`Error removing refresh token for admin ${adminId}:`, error);
      return 0;
    }
  }

  async blacklistToken(token, ttl = 8 * 60 * 60) {
    try {
      const key = `blacklist:${token}`;
      return await this.client.setEx(key, ttl, 'blacklisted');
    } catch (error) {
      console.error(`Error blacklisting token:`, error);
      return null;
    }
  }

  async isTokenBlacklisted(token) {
    try {
      const key = `blacklist:${token}`;
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Error checking if token is blacklisted:`, error);
      return false;
    }
  }
}
