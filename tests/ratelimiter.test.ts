/**
 * Comprehensive automated tests for @periodic/titanium with ioredis
 *
 * Run with: npm test
 */

import Redis from 'ioredis';
import { RateLimiter } from '../src/core/limiter';

describe('RateLimiter Core with IORedis', () => {
  let redis: Redis;
  let limiter: RateLimiter;

  beforeAll(async () => {
    // Support both local and cloud Redis
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      // Use Redis Cloud or remote Redis
      redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
      });
    } else {
      // Use local Redis
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
      });
    }

    // Wait for Redis connection with helpful error message
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            'Redis connection timeout. Make sure Redis is running.\n\n' +
              'Options:\n' +
              '1. Start local Redis: docker run -p 6379:6379 -d redis:alpine\n' +
              '2. Use Redis Cloud: REDIS_URL=redis://user:pass@host:port npm test\n'
          )
        );
      }, 5000);

      redis.on('ready', () => {
        clearTimeout(timeout);
        console.log('✅ Redis connected successfully');
        resolve();
      });

      redis.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Redis connection failed: ${err.message}`));
      });
    });
  }, 10000);

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear all test keys
    await redis.flushdb();

    limiter = new RateLimiter({
      redis,
      limit: 10,
      window: 60,
      keyPrefix: 'test',
    });
  });

  describe('Basic Functionality', () => {
    test('should allow first request', async () => {
      const result = await limiter.limit('user-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
      expect(result.ttl).toBeGreaterThan(0);
      expect(result.reset).toBeGreaterThan(Date.now() / 1000);
    });

    test('should decrement remaining on each request', async () => {
      await limiter.limit('user-123');
      const result = await limiter.limit('user-123');

      expect(result.remaining).toBe(8);
      expect(result.allowed).toBe(true);
    });

    test('should block requests after limit exceeded', async () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await limiter.limit('user-123');
      }

      // 11th request should be blocked
      const result = await limiter.limit('user-123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should track different identifiers separately', async () => {
      await limiter.limit('user-123');
      await limiter.limit('user-123');

      const result = await limiter.limit('user-456');

      // user-456 should have full limit
      expect(result.remaining).toBe(9);
      expect(result.allowed).toBe(true);
    });

    test('should handle multiple concurrent requests correctly', async () => {
      const promises = Array(5)
        .fill(null)
        .map(() => limiter.limit('user-concurrent'));

      const results = await Promise.all(promises);

      // All should be allowed
      results.forEach((r) => expect(r.allowed).toBe(true));
    });
  });

  describe('Reset Functionality', () => {
    test('should reset rate limit for identifier', async () => {
      // Make some requests
      await limiter.limit('user-123');
      await limiter.limit('user-123');
      await limiter.limit('user-123');

      // Reset
      const resetSuccess = await limiter.reset('user-123');
      expect(resetSuccess).toBe(true);

      // Should have full limit again
      const result = await limiter.limit('user-123');
      expect(result.remaining).toBe(9);
    });

    test('should return false when resetting non-existent identifier', async () => {
      const resetSuccess = await limiter.reset('non-existent');
      expect(resetSuccess).toBe(false);
    });

    test('should only reset specific identifier', async () => {
      await limiter.limit('user-123');
      await limiter.limit('user-456');

      await limiter.reset('user-123');

      // user-123 should be reset
      const result123 = await limiter.limit('user-123');
      expect(result123.remaining).toBe(9);

      // user-456 should still have used count
      const result456 = await limiter.limit('user-456');
      expect(result456.remaining).toBe(8);
    });
  });

  describe('Status Check', () => {
    test('should get current status', async () => {
      await limiter.limit('user-123');
      await limiter.limit('user-123');
      await limiter.limit('user-123');

      const status = await limiter.getStatus('user-123');

      expect(status).not.toBeNull();
      expect(status?.current).toBe(3);
      expect(status?.ttl).toBeGreaterThan(0);
      expect(status?.ttl).toBeLessThanOrEqual(60);
    });

    test('should return null for non-existent identifier', async () => {
      const status = await limiter.getStatus('non-existent');
      expect(status).toBeNull();
    });

    test('should return accurate count after multiple requests', async () => {
      for (let i = 0; i < 7; i++) {
        await limiter.limit('user-status');
      }

      const status = await limiter.getStatus('user-status');
      expect(status?.current).toBe(7);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for empty identifier', async () => {
      await expect(limiter.limit('')).rejects.toThrow(
        'Identifier cannot be empty'
      );
    });

    test('should throw error for whitespace identifier', async () => {
      await expect(limiter.limit('   ')).rejects.toThrow(
        'Identifier cannot be empty'
      );
    });
  });

  describe('TTL and Reset Time', () => {
    test('should have correct TTL after first request', async () => {
      const result = await limiter.limit('user-ttl');

      expect(result.ttl).toBeGreaterThan(59);
      expect(result.ttl).toBeLessThanOrEqual(60);
    });

    test('should have decreasing TTL over time', async () => {
      const result1 = await limiter.limit('user-ttl-decrease');

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result2 = await limiter.limit('user-ttl-decrease');

      expect(result2.ttl).toBeLessThan(result1.ttl);
    });
  });

  describe('Window Expiration', () => {
    test('should reset counter after window expires', async () => {
      const shortLimiter = new RateLimiter({
        redis,
        limit: 5,
        window: 2,
        keyPrefix: 'short-test',
      });

      // Make requests up to limit
      for (let i = 0; i < 5; i++) {
        await shortLimiter.limit('user-expire');
      }

      // Should be blocked
      let result = await shortLimiter.limit('user-expire');
      expect(result.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 2100));

      // Should be allowed again
      result = await shortLimiter.limit('user-expire');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    }, 10000);
  });

  describe('Configuration Validation', () => {
    test('should throw error for invalid limit', () => {
      expect(() => {
        new RateLimiter({
          redis,
          limit: 0,
          window: 60,
          keyPrefix: 'test',
        });
      }).toThrow('Limit must be a positive number');
    });

    test('should throw error for negative limit', () => {
      expect(() => {
        new RateLimiter({
          redis,
          limit: -5,
          window: 60,
          keyPrefix: 'test',
        });
      }).toThrow('Limit must be a positive number');
    });

    test('should throw error for invalid window', () => {
      expect(() => {
        new RateLimiter({
          redis,
          limit: 10,
          window: 0,
          keyPrefix: 'test',
        });
      }).toThrow('Window must be a positive number');
    });

    test('should throw error for empty keyPrefix', () => {
      expect(() => {
        new RateLimiter({
          redis,
          limit: 10,
          window: 60,
          keyPrefix: '',
        });
      }).toThrow('Key prefix is required');
    });
  });

  describe('Edge Cases', () => {
    test('should handle exactly at limit', async () => {
      for (let i = 0; i < 10; i++) {
        await limiter.limit('user-exact');
      }

      const result = await limiter.limit('user-exact');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test('should handle special characters in identifier', async () => {
      const result = await limiter.limit('user@email.com');
      expect(result.allowed).toBe(true);
    });

    test('should handle very long identifiers', async () => {
      const longId = 'a'.repeat(200);
      const result = await limiter.limit(longId);
      expect(result.allowed).toBe(true);
    });
  });
});
