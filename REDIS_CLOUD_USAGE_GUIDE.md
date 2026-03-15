# 🌥️ Using @periodic/titanium with Redis Cloud

Complete guide for using this rate limiter with Redis Cloud (or any hosted Redis service).

## 🎯 Quick Start

### Step 1: Install Dependencies

```bash
npm install @periodic/titanium ioredis express
```

### Step 2: Get Your Redis Cloud Connection URL

**Format:**
```
redis://username:password@hostname:port
```

**Example:**
```
redis://default:abc123xyz@redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com:12345
```

**Where to find it:**
1. Log in to [Redis Cloud](https://redis.com/cloud/)
2. Go to your database
3. Find "Public endpoint" or "Connection details"
4. Copy the connection string

### Step 3: Use in Your App

```typescript
import express from 'express';
import Redis from 'ioredis';
import { rateLimit } from '@periodic/titanium';

const app = express();

// Connect to Redis Cloud (auto-connects, no need to call connect())
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Apply rate limiting
app.use('/api', rateLimit({
  redis,
  limit: 100,
  window: 3600, // 1 hour
  keyPrefix: 'api'
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Success!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

## 🔧 Configuration Options

### Option 1: Connection String (Recommended)

```typescript
import Redis from 'ioredis';

// Using connection string
const redis = new Redis('redis://default:yourpassword@redis-host.cloud.redislabs.com:12345');
```

### Option 2: Configuration Object

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: 'redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com',
  port: 12345,
  password: 'yourpassword',
  username: 'default', // Optional, default is 'default'
  db: 0,               // Optional, default is 0
  tls: {},             // Enable TLS/SSL if required by your provider
});
```

### Option 3: Environment Variables (Best Practice)

```typescript
// .env file
REDIS_URL=redis://default:yourpassword@redis-host.cloud.redislabs.com:12345

// app.ts
import Redis from 'ioredis';
import { rateLimit } from '@periodic/titanium';

const redis = new Redis(process.env.REDIS_URL);

app.use(rateLimit({
  redis,
  limit: 100,
  window: 3600,
  keyPrefix: 'api'
}));
```

---

## 🌐 Popular Redis Cloud Providers

### Redis Cloud (Redis Labs)

```typescript
const redis = new Redis({
  host: 'redis-xxxxx.c1.us-east-1-2.ec2.cloud.redislabs.com',
  port: 12345,
  password: 'your-password',
  tls: {}, // Required for Redis Cloud
});
```

### AWS ElastiCache

```typescript
const redis = new Redis({
  host: 'your-cluster.xxxxx.cache.amazonaws.com',
  port: 6379,
  // No password if using VPC security
  // Or with auth token:
  password: 'your-auth-token',
});
```

### Azure Cache for Redis

```typescript
const redis = new Redis({
  host: 'your-cache.redis.cache.windows.net',
  port: 6380, // Note: Azure uses 6380 with SSL
  password: 'your-access-key',
  tls: {}, // Required for Azure
});
```

### Upstash Redis

```typescript
const redis = new Redis({
  host: 'your-region.upstash.io',
  port: 6379,
  password: 'your-token',
  tls: {}, // Required for Upstash
});
```

### DigitalOcean Managed Redis

```typescript
const redis = new Redis({
  host: 'your-redis-do-user-xxxxx-0.db.ondigitalocean.com',
  port: 25061,
  password: 'your-password',
  tls: {}, // Required
});
```

---

## 🔐 Security Best Practices

### 1. Use Environment Variables

**Never hardcode credentials in your code!**

```typescript
// ❌ BAD - Hardcoded credentials
const redis = new Redis('redis://default:abc123@host:12345');

// ✅ GOOD - Environment variables
const redis = new Redis(process.env.REDIS_URL);
```

### 2. Create .env File

```bash
# .env
REDIS_URL=redis://default:yourpassword@redis-host.cloud.redislabs.com:12345
```

**Add to .gitignore:**
```bash
echo ".env" >> .gitignore
```

**Load in your app:**
```bash
npm install dotenv
```

```typescript
// app.ts
import 'dotenv/config';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
```

### 3. Use TLS/SSL

Most cloud providers require TLS:

```typescript
const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    // Optional: Add custom CA certificate if needed
    // ca: fs.readFileSync('/path/to/ca-cert.pem'),
  },
});
```

---

## 🚀 Production-Ready Example

```typescript
import express from 'express';
import Redis from 'ioredis';
import { rateLimit } from '@periodic/titanium';
import 'dotenv/config';

const app = express();

// Create Redis client with error handling
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
});

// Redis event handlers
redis.on('connect', () => console.log('Redis: Connecting...'));
redis.on('ready', () => console.log('✅ Redis: Connected and ready'));
redis.on('error', (err) => console.error('❌ Redis Error:', err.message));
redis.on('close', () => console.log('⚠️  Redis: Connection closed'));
redis.on('reconnecting', () => console.log('🔄 Redis: Reconnecting...'));

// Global API rate limit
app.use('/api', rateLimit({
  redis,
  limit: 1000,
  window: 3600, // 1 hour
  keyPrefix: 'global-api',
  failStrategy: 'open', // Allow requests if Redis is down
}));

// Strict rate limit for auth endpoints
app.post('/api/login', 
  rateLimit({
    redis,
    limit: 5,
    window: 300, // 5 minutes
    keyPrefix: 'login',
    failStrategy: 'closed', // Block if Redis is down (more secure)
    message: 'Too many login attempts. Try again in 5 minutes.',
  }),
  (req, res) => {
    // Your login logic
    res.json({ message: 'Login successful' });
  }
);

// User-specific rate limit
app.post('/api/posts',
  authMiddleware, // Your JWT middleware
  rateLimit({
    redis,
    limit: 10,
    window: 60,
    keyPrefix: 'create-post',
    identifier: (req) => req.user?.id?.toString() || null,
  }),
  (req, res) => {
    res.json({ message: 'Post created' });
  }
);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  await redis.quit();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;

// Only start server after Redis is ready
redis.on('ready', () => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
```

---

## 🔧 Advanced Configuration

### Connection Pooling

```typescript
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectionName: 'rate-limiter', // For debugging
});
```

### Retry Strategy

```typescript
const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => {
    if (times > 10) {
      // Stop retrying after 10 attempts
      console.error('Redis: Max retries reached');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    console.log(`Redis: Retry attempt ${times} in ${delay}ms`);
    return delay;
  },
});
```

### Custom Error Handling

```typescript
const redis = new Redis(process.env.REDIS_URL);

redis.on('error', (err) => {
  // Log to your monitoring service (Sentry, DataDog, etc.)
  console.error('Redis Error:', err);
  
  // Send alert if critical
  if (err.code === 'ECONNREFUSED') {
    // Alert your team
    console.error('CRITICAL: Redis connection refused!');
  }
});
```

---

## 🧪 Testing Locally vs Production

### Local Development (Docker Redis)

```typescript
// config/redis.ts
import Redis from 'ioredis';

export const createRedisClient = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    // Use local Redis
    return new Redis({
      host: 'localhost',
      port: 6379,
    });
  } else {
    // Use Redis Cloud
    return new Redis(process.env.REDIS_URL);
  }
};
```

### Environment-Specific Configuration

```bash
# .env.development
REDIS_URL=redis://localhost:6379

# .env.production
REDIS_URL=redis://default:prod-password@redis-prod.cloud.redislabs.com:12345

# .env.staging
REDIS_URL=redis://default:staging-password@redis-staging.cloud.redislabs.com:12345
```

---

## 🐛 Troubleshooting

### Error: "ECONNREFUSED"

**Problem:** Can't connect to Redis

**Solutions:**
1. Check Redis Cloud dashboard - is database running?
2. Verify connection URL is correct
3. Check firewall/security groups
4. Verify your IP is whitelisted in Redis Cloud

### Error: "NOAUTH Authentication required"

**Problem:** Missing or wrong password

**Solution:**
```typescript
// Make sure your URL includes authentication
const redis = new Redis('redis://default:yourpassword@host:port');
```

### Error: "Connection timeout"

**Problem:** Network/firewall blocking connection

**Solutions:**
1. Check Redis Cloud IP whitelist
2. Add your server IP to allowed list
3. Enable public endpoint in Redis Cloud
4. Check network/VPC configuration

### Error: "Read-only replica"

**Problem:** Connected to read-only replica

**Solution:**
```typescript
// Connect to primary/master endpoint, not replica
const redis = new Redis('redis://primary-endpoint:port');
```

---

## 📊 Monitoring

### Log Redis Events

```typescript
const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => {
  console.log('[Redis] Connecting to server');
});

redis.on('ready', () => {
  console.log('[Redis] Connection established and ready');
});

redis.on('error', (err) => {
  console.error('[Redis] Error:', err.message);
});

redis.on('close', () => {
  console.warn('[Redis] Connection closed');
});

redis.on('reconnecting', (delay) => {
  console.log(`[Redis] Reconnecting in ${delay}ms`);
});

redis.on('end', () => {
  console.log('[Redis] Connection ended');
});
```

### Health Check Endpoint

```typescript
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({
      status: 'healthy',
      redis: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      redis: 'disconnected',
      error: error.message,
    });
  }
});
```

---

## 💰 Cost Optimization

### Use Free Tier for Development

Most providers offer free tiers:
- **Redis Cloud**: 30MB free
- **Upstash**: 10,000 commands/day free
- **AWS ElastiCache**: Free tier available

### Production Recommendations

- **Small apps** (< 1K users): 100MB - 250MB
- **Medium apps** (1K - 10K users): 500MB - 1GB
- **Large apps** (10K+ users): 2GB+

**Rate limit data is small:**
- ~100 bytes per unique identifier
- 10,000 users = ~1MB of data

---

## ✅ Checklist for Production

- [ ] Redis Cloud account created
- [ ] Database provisioned
- [ ] Connection URL copied
- [ ] `.env` file created with `REDIS_URL`
- [ ] `.env` added to `.gitignore`
- [ ] TLS/SSL enabled (if required)
- [ ] IP whitelist configured (if needed)
- [ ] Error handlers added
- [ ] Graceful shutdown implemented
- [ ] Health check endpoint added
- [ ] Monitoring/logging set up
- [ ] Tested locally
- [ ] Tested in production

---

## 🔗 Resources

- **Redis Cloud**: https://redis.com/cloud/
- **IORedis Docs**: https://github.com/redis/ioredis
- **@periodic/titanium Docs**: https://github.com/udaythakur7469/periodic-titanium
- **AWS ElastiCache**: https://aws.amazon.com/elasticache/
- **Azure Redis**: https://azure.microsoft.com/en-us/services/cache/
- **Upstash**: https://upstash.com/

---

## 💬 Need Help?

- **GitHub Issues**: https://github.com/udaythakur7469/periodic-titanium/issues
- **Email**: udaythakurwork@gmail.com

---

**🎉 You're all set to use @periodic/titanium with Redis Cloud!**