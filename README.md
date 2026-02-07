# 🛡️ Periodic Titanium

[![npm version](https://img.shields.io/npm/v/@periodic/titanium.svg)](https://www.npmjs.com/package/@periodic/titanium)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

Production-ready Redis-backed rate limiting middleware for Express with TypeScript support, fail-safe design, and flexible configuration.

## 🎯 Why Titanium?

Building a robust API requires protecting your endpoints from abuse, but most rate limiting solutions come with significant tradeoffs:

- **In-memory limiters** don't scale across multiple servers
- **Generic packages** force you into opinionated implementations
- **Complex solutions** add unnecessary overhead for simple use cases

**PERIODIC Titanium** provides the perfect middle ground:

✅ **Redis-backed** for distributed rate limiting across multiple instances  
✅ **Framework-agnostic core** with clean Express adapter  
✅ **TypeScript-first** with complete type safety  
✅ **Fail-safe design** that never breaks your application  
✅ **Zero dependencies** except Express and Redis (peer dependencies)  
✅ **Flexible configuration** for user-based, IP-based, or custom identification  
✅ **Production-tested** with atomic Redis operations to prevent race conditions

---

## 📦 Installation

```bash
npm install @periodic/titanium redis express
```

**Peer Dependencies:**
- `express` ^4.0.0 || ^5.0.0
- `redis` ^4.0.0

---

## 🚀 Quick Start

### Basic Usage (IP-based)

```typescript
import express from 'express';
import { createClient } from 'redis';
import { rateLimit } from '@periodic/titanium';

const app = express();

// Create and connect Redis client
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
await redis.connect();

// Apply rate limiting to all routes
app.use(rateLimit({
  redis,
  limit: 100,      // 100 requests
  window: 60,      // per 60 seconds
  keyPrefix: 'api' // Redis key prefix
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Success!' });
});

app.listen(3000);
```

### User-based Rate Limiting (JWT)

```typescript
import { rateLimit } from '@periodic/titanium';

// Rate limit based on authenticated user ID
app.post('/api/resource',
  authMiddleware, // Your JWT auth middleware
  rateLimit({
    redis,
    limit: 10,
    window: 60,
    keyPrefix: 'create-resource',
    // Extract user ID from JWT token
    identifier: (req) => req.user?.id?.toString() || null
  }),
  createResourceHandler
);
```

---

## 🎛️ Configuration Options

### Core Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `redis` | `RedisClientType` | ✅ Yes | - | Connected Redis client instance |
| `limit` | `number` | ✅ Yes | - | Maximum requests allowed in time window |
| `window` | `number` | ✅ Yes | - | Time window in seconds |
| `keyPrefix` | `string` | ✅ Yes | - | Redis key prefix (identifies rate limit type) |
| `algorithm` | `'fixed-window'` | No | `'fixed-window'` | Rate limiting algorithm |
| `logger` | `Logger` | No | `console` | Custom logger instance |

### Express-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identifier` | `(req) => string \| null` | IP-based | Custom function to extract client identifier |
| `message` | `string` | `'Too many requests...'` | Error message when limit exceeded |
| `skip` | `(req) => boolean` | - | Function to skip rate limiting conditionally |
| `failStrategy` | `'open' \| 'closed'` | `'open'` | Behavior when Redis is unavailable |
| `standardHeaders` | `boolean` | `true` | Include standard rate limit headers |

---

## 📚 Common Patterns

### 1. Different Limits per Route

```typescript
// Strict limit for authentication
app.post('/api/login', 
  rateLimit({ 
    redis,
    limit: 5, 
    window: 300, // 5 requests per 5 minutes
    keyPrefix: 'login',
    message: 'Too many login attempts. Try again in 5 minutes.'
  }), 
  loginHandler
);

// Moderate limit for API mutations
app.post('/api/posts', 
  authMiddleware,
  rateLimit({ 
    redis,
    limit: 20, 
    window: 60, // 20 requests per minute
    keyPrefix: 'create-post',
    identifier: (req) => req.user?.id?.toString() || null
  }), 
  createPostHandler
);

// Lenient limit for reads
app.get('/api/posts', 
  rateLimit({ 
    redis,
    limit: 100, 
    window: 60, // 100 requests per minute
    keyPrefix: 'list-posts'
  }), 
  listPostsHandler
);
```

### 2. API Key-based Rate Limiting

```typescript
app.use('/api', rateLimit({
  redis,
  limit: 1000,
  window: 3600, // 1000 requests per hour
  keyPrefix: 'api-key',
  identifier: (req) => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey || null; // Falls back to IP if no API key
  }
}));
```

### 3. Tiered Rate Limits (Free vs Premium)

```typescript
app.use('/api', authMiddleware, (req, res, next) => {
  const limiter = req.user?.isPremium
    ? rateLimit({ 
        redis, 
        limit: 10000, 
        window: 3600, 
        keyPrefix: 'premium' 
      })
    : rateLimit({ 
        redis, 
        limit: 100, 
        window: 3600, 
        keyPrefix: 'free' 
      });
  
  return limiter(req, res, next);
});
```

### 4. Skip Rate Limiting for Admins

```typescript
app.use('/api/admin', rateLimit({
  redis,
  limit: 100,
  window: 60,
  keyPrefix: 'admin',
  skip: (req) => req.user?.role === 'admin' // Admins bypass rate limit
}));
```

### 5. Cascading Rate Limits (Global + Route-specific)

```typescript
// Global safety net
app.use('/api', rateLimit({
  redis,
  limit: 1000,
  window: 3600,
  keyPrefix: 'global'
}));

// Stricter limit on expensive operations
app.post('/api/ai/generate', rateLimit({
  redis,
  limit: 3,
  window: 3600,
  keyPrefix: 'ai-generation'
}), generateHandler);
```

---

## 🔒 Fail Strategies

### Fail-Open (Default, Recommended)

When Redis is unavailable, **allow requests through**.

```typescript
rateLimit({
  redis,
  limit: 100,
  window: 60,
  keyPrefix: 'api',
  failStrategy: 'open' // Default
});
```

**Best for:** High-availability applications where downtime is unacceptable.

### Fail-Closed (Strict Security)

When Redis is unavailable, **block all requests**.

```typescript
rateLimit({
  redis,
  limit: 100,
  window: 60,
  keyPrefix: 'api',
  failStrategy: 'closed'
});
```

**Best for:** Security-critical endpoints where rate limiting must be enforced.

---

## 🏗️ Rate Limiting Algorithm

### Fixed Window (Current Implementation)

The package uses a **fixed window** algorithm:

- Time is divided into fixed windows (e.g., 0-60s, 60-120s, etc.)
- Each window has an independent counter
- Counter resets at window boundaries

**Implementation:**
```
SET key 0 EX window NX  // Initialize window if not exists
INCR key                // Increment counter atomically
```

**Characteristics:**
- ✅ Simple and efficient
- ✅ Predictable behavior
- ✅ Low memory usage (one key per identifier)
- ⚠️ Potential for bursts at window boundaries (e.g., 100 requests at 59s, 100 more at 61s)

**Why not sliding window?**
- Sliding window requires storing individual request timestamps (higher memory)
- Fixed window is sufficient for 99% of use cases
- Can be mitigated with shorter windows if needed

---

## 📊 Response Headers

When `standardHeaders: true` (default), the middleware adds these headers:

### Success Response
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded (429)
```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995200
Retry-After: 45

{
  "error": "Too many requests. Please try again later.",
  "retryAfter": 45,
  "limit": 100,
  "remaining": 0,
  "reset": 1640995200
}
```

---

## 🧪 Advanced Usage

### Manual Rate Limiting (Custom Frameworks)

```typescript
import { createRateLimiter } from '@periodic/titanium';

const limiter = createRateLimiter({
  redis,
  limit: 100,
  window: 60,
  keyPrefix: 'api'
});

// In your custom middleware/framework
async function customHandler(req, res) {
  const identifier = getUserId(req) || getIp(req);
  
  const result = await limiter.limit(identifier);
  
  if (!result.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: result.ttl
    });
  }
  
  // Process request...
}
```

### Utility Methods

```typescript
import { createRateLimiter } from '@periodic/titanium';

const limiter = createRateLimiter({ /* config */ });

// Check current status
const status = await limiter.getStatus('user-123');
console.log(status); 
// { current: 45, ttl: 30 } or null

// Reset rate limit (useful for testing or admin tools)
await limiter.reset('user-123');
```

---

## 🎨 Custom Logger Integration

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

app.use(rateLimit({
  redis,
  limit: 100,
  window: 60,
  keyPrefix: 'api',
  logger: {
    info: (...args) => logger.info(args.join(' ')),
    warn: (...args) => logger.warn(args.join(' ')),
    error: (...args) => logger.error(args.join(' '))
  }
}));
```

---

## 🔍 Monitoring & Debugging

### Log Levels

**INFO:** Rate limit checks and warnings (80% threshold)
```
Rate limit check: identifier=ratelimit:api:192.168.1.1, count=45/100, allowed=true
Rate limit warning for identifier: ratelimit:api:192.168.1.1 - 18 remaining
```

**WARN:** Rate limits exceeded, Redis failures
```
Rate limit exceeded for identifier: user-123 (create-post)
Redis unavailable with fail-open strategy - allowing request
```

**ERROR:** Unexpected errors
```
Rate limiter error: Error: Connection refused
```

### Recommended Metrics to Track

1. **Rate limit hits per endpoint** (counter)
2. **Redis availability** (gauge)
3. **95th percentile remaining requests** (histogram)
4. **Fail-open events** (counter)

---

## 🛠️ Production Recommendations

### Redis Configuration

```typescript
import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Max retries reached');
      return Math.min(retries * 100, 3000); // Exponential backoff
    }
  }
});

redis.on('error', (err) => console.error('Redis error:', err));
redis.on('reconnecting', () => console.log('Redis reconnecting...'));

await redis.connect();
```

### Rate Limit Guidelines

| Endpoint Type | Recommended Limit | Window | Reasoning |
|---------------|-------------------|--------|-----------|
| **Authentication** | 5-10 | 300s (5 min) | Prevent brute force |
| **Expensive AI/ML** | 3-5 | 3600s (1 hour) | High compute cost |
| **Write Operations** | 10-50 | 60s | Prevent spam |
| **Read Operations** | 100-1000 | 60s | Allow browsing |
| **Global API** | 1000-5000 | 3600s | Safety net |

### Environment Variables

```bash
# .env
REDIS_URL=redis://localhost:6379

# Production
REDIS_URL=redis://username:password@redis-host:6379

# Redis Cluster
REDIS_URL=redis://redis-cluster:6379
```

---

## ⚠️ Important Considerations

### Redis Persistence

Rate limiting **does not require** Redis persistence (RDB/AOF). If Redis restarts, rate limits reset—which is acceptable for most applications.

If you need guaranteed limits across restarts, enable Redis persistence:
```bash
redis-server --appendonly yes
```

### Horizontal Scaling

This package works seamlessly across multiple app instances because:
- All state is stored in Redis
- Redis operations are atomic (INCR, SET NX)
- No coordination between instances needed

### IPv6 Handling

The package automatically normalizes IPv6-mapped IPv4 addresses:
```
::ffff:192.168.1.1 → 192.168.1.1
```

---

## 🚫 Explicit Non-Goals

This package **intentionally does not** include:

❌ Sliding window log algorithm (use fixed window with shorter intervals instead)  
❌ Token bucket or leaky bucket algorithms (may be added in v2.x)  
❌ Built-in Redis clustering logic (use Redis Cluster directly)  
❌ Distributed tracing or metrics export (integrate with your APM)  
❌ Framework auto-detection (explicit configuration only)  
❌ In-memory fallback (defeats the purpose of distributed rate limiting)

If you need these features, consider:
- **express-rate-limit** for in-memory limiting
- **rate-limiter-flexible** for advanced algorithms
- Building a custom solution on top of the core `RateLimiter` class

---

## 🧩 Architecture

```
@periodic/titanium/
├── src/
│   ├── core/
│   │   ├── limiter.ts        # Framework-agnostic rate limiter
│   │   └── types.ts          # TypeScript interfaces
│   ├── adapters/
│   │   └── express.ts        # Express middleware adapter
│   ├── utils/
│   │   └── ip.ts             # IP extraction utilities
│   └── index.ts              # Public API exports
```

**Design Philosophy:**
- **Core** is pure TypeScript, no framework dependencies
- **Adapters** connect core to specific frameworks (Express, Fastify, etc.)
- **Utils** provide reusable helper functions

This allows you to:
- Use the core `RateLimiter` directly in non-Express apps
- Build custom adapters for other frameworks
- Test components independently

---

## 📖 API Reference

### `rateLimit(options)`

Creates Express middleware for rate limiting.

**Returns:** `(req, res, next) => Promise<void>`

### `createRateLimiter(options)`

Creates standalone rate limiter instance.

**Returns:** `RateLimiter`

### `RateLimiter` Methods

- `limit(identifier: string): Promise<RateLimitResult>`
- `reset(identifier: string): Promise<boolean>`
- `getStatus(identifier: string): Promise<{ current, ttl } | null>`

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)
- Built with production lessons from scaling APIs to millions of requests

---

## 📞 Support

- 🐛 **Issues:** [GitHub Issues](https://github.com/udaythakur7469/periodic-titanium/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/udaythakur7469/periodic-titanium/discussions)
- 📧 **Email:** udaythakurwork@gmail.com

---

**Built with ❤️ for production-grade Node.js applications**