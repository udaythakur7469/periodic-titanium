# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-02-07

### Added
- Initial release of @periodic/titanium
- Core rate limiter with Redis-backed fixed-window algorithm
- Express middleware adapter with comprehensive configuration options
- Support for custom identifier extraction (user ID, API key, IP, etc.)
- Configurable fail strategies (fail-open / fail-closed)
- Standard HTTP rate limit headers (X-RateLimit-*)
- TypeScript-first implementation with full type safety
- Skip function for conditional rate limiting
- Utility methods for manual rate limit management (reset, getStatus)
- IP extraction and normalization utilities
- Custom logger support with console fallback
- Comprehensive documentation and examples
- Production-grade error handling and graceful degradation

### Design Decisions
- Chose fixed-window algorithm for simplicity and efficiency
- Implemented fail-open as default for high availability
- Extracted core logic from Express for framework independence
- Made Redis client management explicit (no auto-connection)
- Prioritized explicit configuration over magic behavior

### Known Limitations
- Only fixed-window algorithm supported (sliding window planned for v2.x)
- Potential for burst traffic at window boundaries
- No built-in distributed tracing or metrics (integrate with your APM)

[1.0.0]: https://github.com/udaythakur7469/periodic-titanium/releases/tag/v1.0.0

## [1.0.2] - 2025-03-15

### Added
- Full Redis Cloud support (AWS ElastiCache, Azure Cache, Upstash, etc.)
- Comprehensive Redis Cloud usage guide
- Environment variable support for Redis connection URLs

[1.0.2]: https://github.com/udaythakur7469/periodic-titanium/releases/tag/v1.0.2

+ ## [1.0.3] - 2026-04-04
+ 
+ ### Fixed
+ - **TypeScript compatibility:** Fixed `rateLimit()` return type to explicitly return `RequestHandler` from Express
+ - Resolved TypeScript error: "Type 'Promise<void>' is not assignable to type 'void | Promise<void>'"
+ - Updated internal middleware function signature to properly conform to Express `RequestHandler` type
+ - Fixed `return next()` statements to separate `next()` call and `return` on different lines for proper type conformance
+ - All middleware functions now have explicit type annotations for better IDE support and type safety
+ 
+ ### Technical Details
+ - Added `RequestHandler` import from 'express' package
+ - Changed `rateLimit()` function signature to include explicit `: RequestHandler` return type
+ - Updated internal middleware to avoid returning values from `next()` calls
+ - Ensured all error responses use separate `res.json()` and `return` statements
+ 
+ [1.0.3]: https://github.com/udaythakur7469/periodic-titanium/releases/tag/v1.0.3
