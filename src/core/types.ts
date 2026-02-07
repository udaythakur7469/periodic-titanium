import { RedisClientType } from "redis";
import { Request } from "express";

/**
 * Rate limiting algorithm types
 * Currently only fixed-window is implemented
 */
export type Algorithm = "fixed-window";

/**
 * Strategy for handling failures when Redis is unavailable
 * - 'open': Allow requests through (recommended for availability)
 * - 'closed': Block all requests (recommended for strict security)
 */
export type FailStrategy = "open" | "closed";

/**
 * Logger interface for optional logging
 * If not provided, console will be used as fallback
 */
export interface Logger {
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
}

/**
 * Result returned by the core rate limiter
 */
export interface RateLimitResult {
  /**
   * Whether the request should be allowed
   */
  allowed: boolean;

  /**
   * Maximum number of requests allowed in the window
   */
  limit: number;

  /**
   * Number of requests remaining in current window
   */
  remaining: number;

  /**
   * Timestamp (in seconds) when the rate limit resets
   */
  reset: number;

  /**
   * Time to live in seconds for the current window
   */
  ttl: number;
}

/**
 * Core rate limiter configuration
 */
export interface RateLimiterConfig {
  /**
   * Redis client instance (must be connected)
   */
  redis: RedisClientType;

  /**
   * Maximum number of requests allowed in the time window
   */
  limit: number;

  /**
   * Time window in seconds
   */
  window: number;

  /**
   * Prefix for Redis keys (useful for different route groups)
   */
  keyPrefix: string;

  /**
   * Rate limiting algorithm
   * @default 'fixed-window'
   */
  algorithm?: Algorithm;

  /**
   * Optional logger instance
   * If not provided, falls back to console
   */
  logger?: Logger;
}

/**
 * Express middleware configuration
 */
export interface ExpressRateLimitOptions extends RateLimiterConfig {
  /**
   * Custom function to extract identifier from request
   * If not provided, uses IP address from request
   *
   * @param req - Express request object
   * @returns Unique identifier for the client, or null to use IP
   *
   * @example
   * // Use user ID from JWT token
   * identifier: (req) => req.user?.id?.toString() || null
   *
   * @example
   * // Use API key from headers
   * identifier: (req) => req.headers['x-api-key'] as string || null
   */
  identifier?: (req: Request) => string | null;

  /**
   * Custom error message when rate limit is exceeded
   * @default 'Too many requests. Please try again later.'
   */
  message?: string;

  /**
   * Function to skip rate limiting for certain requests
   *
   * @param req - Express request object
   * @returns true to skip rate limiting, false to apply it
   *
   * @example
   * // Skip rate limiting for admin users
   * skip: (req) => req.user?.isAdmin === true
   *
   * @example
   * // Skip rate limiting for internal IPs
   * skip: (req) => req.ip?.startsWith('192.168.')
   */
  skip?: (req: Request) => boolean;

  /**
   * Strategy for handling Redis failures
   * - 'open': Allow requests when Redis is down (recommended)
   * - 'closed': Block requests when Redis is down
   * @default 'open'
   */
  failStrategy?: FailStrategy;

  /**
   * Whether to include standard rate limit headers in responses
   * - X-RateLimit-Limit
   * - X-RateLimit-Remaining
   * - X-RateLimit-Reset
   * - Retry-After (when limit exceeded)
   * @default true
   */
  standardHeaders?: boolean;
}

/**
 * Internal rate limit information for header setting
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}
