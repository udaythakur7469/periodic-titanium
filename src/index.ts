/**
 * @periodic/titanium
 *
 * Production-ready Redis-backed rate limiting middleware for Express
 * with TypeScript support, fail-safe design, and flexible configuration.
 *
 * @packageDocumentation
 */

// Export Express middleware
export { rateLimit, createRateLimiter } from "./adapters/express";

// Export core components for advanced usage
export { RateLimiter } from "./core/limiter";

// Export all types
export type {
  Algorithm,
  FailStrategy,
  Logger,
  RateLimitResult,
  RateLimiterConfig,
  ExpressRateLimitOptions,
  RateLimitInfo,
} from "./core/types";

// Export utilities
export { extractClientIp, normalizeIp, getDefaultIdentifier } from "./utils/ip";
