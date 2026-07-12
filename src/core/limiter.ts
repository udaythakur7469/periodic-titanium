import Redis from 'ioredis';
import { RateLimiterConfig, RateLimitResult, Logger, Algorithm } from './types';

/**
 * Core rate limiter implementation
 * Framework-agnostic, pure Redis-based rate limiting using IORedis
 */

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local pttl = redis.call('PTTL', KEYS[1])
if count == 1 or pttl == -1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return {count, pttl}
`;

export class RateLimiter {
  private redis: Redis;
  private requestLimit: number;
  private window: number;
  private keyPrefix: string;
  private algorithm: Algorithm;
  private logger: Logger;

  constructor(config: RateLimiterConfig) {
    this.validateConfig(config);

    this.redis = config.redis;
    this.requestLimit = config.limit;
    this.window = config.window;
    this.keyPrefix = config.keyPrefix;
    this.algorithm = config.algorithm || 'fixed-window';
    this.logger = this.createLogger(config.logger);
  }

  /**
   * Validate configuration options
   */
  private validateConfig(config: RateLimiterConfig): void {
    if (!config.redis) {
      throw new Error('Redis client is required');
    }

    if (!config.limit || config.limit <= 0) {
      throw new Error('Limit must be a positive number');
    }

    if (!config.window || config.window <= 0) {
      throw new Error('Window must be a positive number (in seconds)');
    }

    if (!config.keyPrefix || config.keyPrefix.trim() === '') {
      throw new Error('Key prefix is required');
    }
  }

  /**
   * Create logger with fallback to console
   */
  private createLogger(customLogger?: Logger): Logger {
    return {
      info: customLogger?.info || console.log,
      warn: customLogger?.warn || console.warn,
      error: customLogger?.error || console.error,
    };
  }

  /**
   * Build Redis key for the identifier
   */
  private buildKey(identifier: string): string {
    return `ratelimit:${this.keyPrefix}:${identifier}`;
  }

  /**
   * Check if Redis client is available
   */
  private isRedisAvailable(): boolean {
    return this.redis.status === 'ready';
  }

  /**
   * Attempt to consume a request for the given identifier
   * Returns rate limit information
   *
   * @param identifier - Unique identifier for the client (user ID, IP, API key, etc.)
   * @returns Promise resolving to rate limit result
   *
   * @throws Error if Redis operations fail (caller should handle)
   */
  async limit(identifier: string): Promise<RateLimitResult> {
    if (!identifier || identifier.trim() === '') {
      throw new Error('Identifier cannot be empty');
    }

    if (!this.isRedisAvailable()) {
      throw new Error('Redis client is not available');
    }

    const key = this.buildKey(identifier);

    if (this.algorithm === 'fixed-window') {
      return this.fixedWindowLimit(key);
    }

    throw new Error(`Unsupported algorithm: ${this.algorithm}`);
  }

  /**
   * Fixed window rate limiting implementation
   * Uses true fixed window semantics with SET NX EX
   */
  private async fixedWindowLimit(key: string): Promise<RateLimitResult> {
    const now = Date.now();

    // Single atomic round trip: INCR + PEXPIRE-if-needed happen inside
    // one Lua script on the Redis server, so there is no window between
    // commands where a partial failure can leave a TTL-less key.
    const [currentCount, pttl] = (await this.redis.eval(
      FIXED_WINDOW_SCRIPT,
      1,
      key,
      this.window * 1000
    )) as [number, number];

    const ttlSeconds = Math.ceil(pttl / 1000);
    const resetTime = now + pttl;
    const remaining = Math.max(0, this.requestLimit - currentCount);
    const allowed = currentCount <= this.requestLimit;

    this.logger.info?.(
      `Rate limit check: identifier=${key}, count=${currentCount}/${this.requestLimit}, allowed=${allowed}`
    );

    return {
      allowed,
      limit: this.requestLimit,
      remaining,
      reset: Math.ceil(resetTime / 1000),
      ttl: ttlSeconds > 0 ? ttlSeconds : this.window,
    };
  }

  /**
   * Reset rate limit for a specific identifier
   * Useful for testing or manual intervention
   *
   * @param identifier - Unique identifier to reset
   * @returns Promise resolving to true if key was deleted, false otherwise
   */
  async reset(identifier: string): Promise<boolean> {
    if (!identifier || identifier.trim() === '') {
      throw new Error('Identifier cannot be empty');
    }

    if (!this.isRedisAvailable()) {
      throw new Error('Redis client is not available');
    }

    const key = this.buildKey(identifier);
    const result = await this.redis.del(key);

    this.logger.info?.(`Rate limit reset for: ${key}`);

    return result > 0;
  }

  /**
   * Get current rate limit status for an identifier
   *
   * @param identifier - Unique identifier to check
   * @returns Promise resolving to current count and TTL, or null if no limit exists
   */
  async getStatus(
    identifier: string
  ): Promise<{ current: number; ttl: number } | null> {
    if (!identifier || identifier.trim() === '') {
      throw new Error('Identifier cannot be empty');
    }

    if (!this.isRedisAvailable()) {
      throw new Error('Redis client is not available');
    }

    const key = this.buildKey(identifier);

    // Use pipeline for atomic read
    // IORedis pipeline returns: [[error, result], [error, result]]
    const pipeline = this.redis.pipeline();
    pipeline.get(key);
    pipeline.ttl(key);

    const results = await pipeline.exec();

    if (!results) {
      return null;
    }

    // IORedis pipeline returns array of [error, result] tuples
    const [getResult, ttlResult] = results;
    const currentValue = getResult[1] as string | null;
    const ttl = (ttlResult[1] as number) ?? -2;

    if (!currentValue) {
      return null;
    }

    // Self-heal: a key that exists but has no TTL (ttl === -1) is the
    // corrupted state this whole fix is about. Force an expiry on it here
    // instead of quietly reporting "no limit" and leaving it stuck forever.
    if (ttl === -1) {
      await this.redis.expire(key, this.window);
      this.logger.warn?.(
        `Self-healed a TTL-less rate limit key: ${key} (forced expire in ${this.window}s)`
      );
      const current = parseInt(currentValue, 10);
      return { current, ttl: this.window };
    }

    if (ttl < 0) {
      return null;
    }

    const current = parseInt(currentValue, 10);

    return { current, ttl };
  }
}
