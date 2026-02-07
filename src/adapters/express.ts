import { Request, Response, NextFunction } from "express";
import { RateLimiter } from "../core/limiter";
import { ExpressRateLimitOptions, RateLimitInfo, Logger } from "../core/types";
import { getDefaultIdentifier } from "../utils/ip";

/**
 * Express rate limiting middleware factory
 *
 * Features:
 * - Framework-agnostic core with Express adapter
 * - Configurable identifier extraction (user ID, API key, IP, etc.)
 * - Fail-open or fail-closed strategies
 * - Standard HTTP rate limit headers
 * - Skip function for conditional rate limiting
 *
 * @param options - Express rate limit configuration
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { createClient } from 'redis';
 * import { rateLimit } from '@periodic/titanium';
 *
 * const redis = createClient();
 * await redis.connect();
 *
 * // Basic usage with IP-based rate limiting
 * app.use(rateLimit({
 *   redis,
 *   limit: 100,
 *   window: 60,
 *   keyPrefix: 'api'
 * }));
 *
 * // User-based rate limiting with JWT
 * app.post('/api/resource',
 *   authMiddleware,
 *   rateLimit({
 *     redis,
 *     limit: 10,
 *     window: 60,
 *     keyPrefix: 'create-resource',
 *     identifier: (req) => req.user?.id?.toString() || null
 *   }),
 *   handler
 * );
 * ```
 */
export function rateLimit(options: ExpressRateLimitOptions) {
  // Validate required options
  if (!options.redis) {
    throw new Error("Redis client is required");
  }

  if (!options.limit || options.limit <= 0) {
    throw new Error("Limit must be a positive number");
  }

  if (!options.window || options.window <= 0) {
    throw new Error("Window must be a positive number");
  }

  if (!options.keyPrefix || options.keyPrefix.trim() === "") {
    throw new Error("Key prefix is required");
  }

  // Extract options with defaults
  const {
    redis,
    limit,
    window,
    keyPrefix,
    algorithm = "fixed-window",
    identifier,
    message = "Too many requests. Please try again later.",
    skip,
    failStrategy = "open",
    standardHeaders = true,
    logger,
  } = options;

  // Create logger instance
  const log: Logger = {
    info: logger?.info || console.log,
    warn: logger?.warn || console.warn,
    error: logger?.error || console.error,
  };

  // Create core rate limiter
  const limiter = new RateLimiter({
    redis,
    limit,
    window,
    keyPrefix,
    algorithm,
    logger: log,
  });

  // Return Express middleware
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Check if rate limiting should be skipped
      if (skip && skip(req)) {
        return next();
      }

      // Extract identifier
      let clientIdentifier: string;
      if (identifier) {
        const customId = identifier(req);
        clientIdentifier = customId || getDefaultIdentifier(req);
      } else {
        clientIdentifier = getDefaultIdentifier(req);
      }

      // Attempt rate limiting
      let result;
      try {
        result = await limiter.limit(clientIdentifier);
      } catch (error) {
        // Redis error - apply fail strategy
        log.error?.("Rate limiter error:", error);

        if (failStrategy === "closed") {
          log.warn?.(
            "Redis unavailable with fail-closed strategy - blocking request",
          );
          res.status(503).json({
            error: "Service temporarily unavailable. Please try again later.",
          });
          return;
        }

        // Fail-open strategy
        log.warn?.(
          "Redis unavailable with fail-open strategy - allowing request",
        );
        return next();
      }

      // Set standard headers if enabled
      if (standardHeaders) {
        setRateLimitHeaders(res, {
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
          retryAfter: result.allowed ? undefined : result.ttl,
        });
      }

      // Check if request is allowed
      if (!result.allowed) {
        log.warn?.(
          `Rate limit exceeded for identifier: ${clientIdentifier} (${keyPrefix})`,
        );

        res.status(429).json({
          error: message,
          retryAfter: result.ttl,
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
        });
        return;
      }

      // Log warning when approaching limit (80% threshold)
      if (result.remaining < result.limit * 0.2) {
        log.info?.(
          `Rate limit warning for identifier: ${clientIdentifier} (${keyPrefix}) - ${result.remaining} remaining`,
        );
      }

      next();
    } catch (error) {
      // Unexpected error - apply fail strategy
      log.error?.("Unexpected rate limit middleware error:", error);

      if (failStrategy === "closed") {
        res.status(503).json({
          error: "Service temporarily unavailable. Please try again later.",
        });
        return;
      }

      // Fail-open
      log.warn?.("Allowing request due to unexpected error (fail-open mode)");
      next();
    }
  };
}

/**
 * Set standard rate limit headers on response
 */
function setRateLimitHeaders(res: Response, info: RateLimitInfo): void {
  res.setHeader("X-RateLimit-Limit", info.limit.toString());
  res.setHeader("X-RateLimit-Remaining", info.remaining.toString());
  res.setHeader("X-RateLimit-Reset", info.reset.toString());

  if (info.retryAfter !== undefined) {
    res.setHeader("Retry-After", info.retryAfter.toString());
  }
}

/**
 * Create a rate limiter instance for manual control
 * Useful for custom implementations or non-Express frameworks
 *
 * @param options - Rate limiter configuration
 * @returns RateLimiter instance
 *
 * @example
 * ```typescript
 * const limiter = createRateLimiter({
 *   redis,
 *   limit: 100,
 *   window: 60,
 *   keyPrefix: 'api'
 * });
 *
 * const result = await limiter.limit('user-123');
 * if (!result.allowed) {
 *   // Handle rate limit exceeded
 * }
 * ```
 */
export function createRateLimiter(
  options: Omit<
    ExpressRateLimitOptions,
    "identifier" | "skip" | "message" | "failStrategy" | "standardHeaders"
  >,
): RateLimiter {
  return new RateLimiter(options);
}
