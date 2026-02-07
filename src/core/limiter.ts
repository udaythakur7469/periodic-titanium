import { RedisClientType } from "redis";
import { RateLimiterConfig, RateLimitResult, Logger, Algorithm } from "./types";

/**
 * Core rate limiter implementation
 * Framework-agnostic, pure Redis-based rate limiting
 */
export class RateLimiter {
  private redis: RedisClientType;
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
    this.algorithm = config.algorithm || "fixed-window";
    this.logger = this.createLogger(config.logger);
  }

  /**
   * Validate configuration options
   */
  private validateConfig(config: RateLimiterConfig): void {
    if (!config.redis) {
      throw new Error("Redis client is required");
    }

    if (!config.limit || config.limit <= 0) {
      throw new Error("Limit must be a positive number");
    }

    if (!config.window || config.window <= 0) {
      throw new Error("Window must be a positive number (in seconds)");
    }

    if (!config.keyPrefix || config.keyPrefix.trim() === "") {
      throw new Error("Key prefix is required");
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
    return this.redis.isOpen && this.redis.isReady;
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
    if (!identifier || identifier.trim() === "") {
      throw new Error("Identifier cannot be empty");
    }

    if (!this.isRedisAvailable()) {
      throw new Error("Redis client is not available");
    }

    const key = this.buildKey(identifier);

    if (this.algorithm === "fixed-window") {
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

    // Try to initialize the window if it doesn't exist
    // SET key 0 EX window NX - Only set if key doesn't exist
    const initialized = await this.redis.set(key, "0", {
      EX: this.window,
      NX: true,
    });

    // Atomically increment the counter
    const currentCount = await this.redis.incr(key);

    // Get TTL to calculate reset time
    const ttl = await this.redis.ttl(key);

    // Calculate reset timestamp
    const resetTime = ttl > 0 ? now + ttl * 1000 : now + this.window * 1000;
    const remaining = Math.max(0, this.requestLimit - currentCount);
    const allowed = currentCount <= this.requestLimit;

    this.logger.info?.(
      `Rate limit check: identifier=${key}, count=${currentCount}/${this.requestLimit}, allowed=${allowed}`,
    );

    return {
      allowed,
      limit: this.requestLimit,
      remaining,
      reset: Math.ceil(resetTime / 1000),
      ttl: ttl > 0 ? ttl : this.window,
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
    if (!identifier || identifier.trim() === "") {
      throw new Error("Identifier cannot be empty");
    }

    if (!this.isRedisAvailable()) {
      throw new Error("Redis client is not available");
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
    identifier: string,
  ): Promise<{ current: number; ttl: number } | null> {
    if (!identifier || identifier.trim() === "") {
      throw new Error("Identifier cannot be empty");
    }

    if (!this.isRedisAvailable()) {
      throw new Error("Redis client is not available");
    }

    const key = this.buildKey(identifier);

    // Use pipeline for atomic read
    const pipeline = this.redis.multi();
    pipeline.get(key);
    pipeline.ttl(key);

    const results = await pipeline.exec();

    const currentValue = results?.[0] as string | null;
    const ttl = (results?.[1] as number) || -1;

    if (!currentValue || ttl < 0) {
      return null;
    }

    const current = parseInt(currentValue, 10);

    return { current, ttl };
  }
}
