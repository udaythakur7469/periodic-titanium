# 🚀 Quick Start Guide

This guide will help you get **@periodic/titanium** up and running in under 5 minutes.

## 📋 Prerequisites

- Node.js 14+ installed
- Redis server (local or remote)
- An Express application

## 1️⃣ Installation

```bash
npm install @periodic/titanium redis express
```

## 2️⃣ Start Redis

### Option A: Using Docker (Recommended)
```bash
docker run --name redis-ratelimit -p 6379:6379 -d redis:alpine
```

### Option B: Local Installation
```bash
# macOS
brew install redis
brew services start redis

# Linux (Ubuntu/Debian)
sudo apt-get install redis-server
sudo service redis-server start

# Windows
# Use WSL2 or Docker
```

## 3️⃣ Basic Integration

### Create `server.ts` or `server.js`

```typescript
import express from 'express';
import { createClient } from 'redis';
import { rateLimit } from '@periodic/titanium';

const app = express();

// 1. Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// 2. Connect to Redis
await redis.connect();

// 3. Apply rate limiting
app.use(rateLimit({
  redis,
  limit: 100,      // 100 requests
  window: 60,      // per 60 seconds
  keyPrefix: 'api' // identifier for this rate limit
}));

// 4. Your routes
app.get('/api/data', (req, res) => {
  res.json({ message: 'Success!' });
});

// 5. Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## 4️⃣ Test It

```bash
# Make requests
curl http://localhost:3000/api/data

# Check rate limit headers
curl -i http://localhost:3000/api/data

# Expected headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
# X-RateLimit-Reset: 1640995200
```

## 🎯 Common Use Cases

### Protect Login Endpoint

```typescript
app.post('/api/login',
  rateLimit({
    redis,
    limit: 5,
    window: 300, // 5 minutes
    keyPrefix: 'login',
    message: 'Too many login attempts. Try again in 5 minutes.'
  }),
  loginHandler
);
```

### User-Based Rate Limiting

```typescript
app.post('/api/posts',
  authMiddleware, // Your JWT middleware
  rateLimit({
    redis,
    limit: 10,
    window: 60,
    keyPrefix: 'create-post',
    // Use user ID from JWT
    identifier: (req) => req.user?.id?.toString() || null
  }),
  createPostHandler
);
```

### Different Limits for Free vs Premium

```typescript
app.get('/api/data',
  authMiddleware,
  (req, res, next) => {
    const limiter = req.user?.isPremium
      ? rateLimit({ redis, limit: 1000, window: 3600, keyPrefix: 'premium' })
      : rateLimit({ redis, limit: 100, window: 3600, keyPrefix: 'free' });
    
    return limiter(req, res, next);
  },
  dataHandler
);
```

## 🔧 Environment Variables

Create `.env` file:

```bash
# Redis connection
REDIS_URL=redis://localhost:6379

# Production example with auth
# REDIS_URL=redis://username:password@redis-host:6379

# Redis Cloud
# REDIS_URL=redis://default:password@redis-12345.cloud.redislabs.com:12345
```

## 🚀 Production Deployment

### 1. Enable Redis Persistence (Optional)

```bash
# Start Redis with persistence
docker run --name redis-ratelimit \
  -p 6379:6379 \
  -v redis-data:/data \
  -d redis:alpine redis-server --appendonly yes
```

### 2. Use Environment-Specific Configs

```typescript
const config = {
  development: {
    limit: 10000,  // Lenient for testing
    window: 60
  },
  production: {
    limit: 100,
    window: 60
  }
};

const env = process.env.NODE_ENV || 'development';
const rateLimitConfig = config[env];

app.use(rateLimit({
  redis,
  ...rateLimitConfig,
  keyPrefix: 'api'
}));
```

### 3. Handle Graceful Shutdown

```typescript
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing Redis...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing Redis...');
  await redis.quit();
  process.exit(0);
});
```

### 4. Monitor Redis Health

```typescript
redis.on('error', (err) => {
  console.error('Redis error:', err);
  // Send to your monitoring service (Sentry, DataDog, etc.)
});

redis.on('reconnecting', () => {
  console.warn('Redis reconnecting...');
});

redis.on('ready', () => {
  console.log('Redis ready');
});
```

## 🐛 Troubleshooting

### Issue: "Redis client is not available"

**Solution:** Ensure Redis is running and connected before applying middleware.

```typescript
// Wait for connection
await redis.connect();

// Verify connection
if (redis.isReady) {
  console.log('Redis connected successfully');
} else {
  throw new Error('Redis not ready');
}
```

### Issue: Rate limits not working

**Check:**
1. Redis is running: `redis-cli ping` should return `PONG`
2. Different `keyPrefix` values for different routes
3. Redis keys: `redis-cli KEYS "ratelimit:*"`

### Issue: Too many requests blocked

**Increase limits** or **shorten window**:

```typescript
rateLimit({
  redis,
  limit: 200,    // Increase from 100
  window: 60,
  keyPrefix: 'api'
})
```

### Issue: Production deployment fails

**Common causes:**
1. Redis URL not set in environment
2. Firewall blocking Redis port (6379)
3. Redis requires authentication (use `REDIS_URL` with password)

## 📊 Monitoring Setup

### Log Rate Limit Events

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'rate-limit.log' })
  ]
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

### Track Metrics

```typescript
let rateLimitHits = 0;

app.use((req, res, next) => {
  const originalSend = res.json;
  
  res.json = function(data) {
    if (res.statusCode === 429) {
      rateLimitHits++;
      console.log(`Rate limit hits: ${rateLimitHits}`);
    }
    return originalSend.call(this, data);
  };
  
  next();
});
```

## 🎓 Next Steps

1. **Read full documentation:** [README.md](./README.md)
2. **Check examples:** [examples/usage.ts](./examples/usage.ts)
3. **Customize for your needs:** Adjust limits, add custom identifiers
4. **Set up monitoring:** Track rate limit events in production
5. **Test under load:** Verify behavior with concurrent requests

## 💡 Pro Tips

✅ **Start conservative:** Begin with stricter limits, loosen as needed  
✅ **Use descriptive keyPrefix:** `login`, `api-create-post`, `premium-tier`  
✅ **Layer rate limits:** Global + route-specific  
✅ **Monitor Redis:** Set up alerts for connection failures  
✅ **Test locally:** Verify behavior before deploying  

## 🔗 Resources

- **GitHub:** https://github.com/udaythakur7469/periodic-titanium
- **npm:** https://www.npmjs.com/package/@periodic/titanium
- **Issues:** Report bugs and request features

---

**You're ready to go! 🎉**

If you run into issues, check the [troubleshooting section](#-troubleshooting) or open an issue on GitHub.