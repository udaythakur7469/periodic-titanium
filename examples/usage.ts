/**
 * Example usage of @periodic/titanium
 *
 * This file demonstrates various ways to use the rate limiter
 * in your Express application.
 */

import express, { Request, Response, NextFunction } from "express";
import { createClient } from "redis";
import { rateLimit, createRateLimiter } from "@periodic/titanium";

const app = express();
app.use(express.json());

// ============================================================================
// SETUP: Create and connect Redis client
// ============================================================================

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Redis: Too many reconnection attempts");
        return new Error("Too many retries");
      }
      return Math.min(retries * 100, 3000);
    },
  },
});

redis.on("error", (err) => console.error("Redis Client Error:", err));
redis.on("connect", () => console.log("Redis: Connected"));

// Connect to Redis
(async () => {
  try {
    await redis.connect();
    console.log("Redis client connected successfully");
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    process.exit(1);
  }
})();

// ============================================================================
// EXAMPLE 1: Global rate limit for all API routes
// ============================================================================

app.use(
  "/api",
  rateLimit({
    redis,
    limit: 1000,
    window: 3600, // 1 hour
    keyPrefix: "global-api",
    message: "API rate limit exceeded. Please try again later.",
  }),
);

// ============================================================================
// EXAMPLE 2: IP-based rate limiting for authentication
// ============================================================================

app.post(
  "/api/login",
  rateLimit({
    redis,
    limit: 5,
    window: 300, // 5 minutes
    keyPrefix: "login",
    message: "Too many login attempts. Please try again in 5 minutes.",
  }),
  (req: Request, res: Response) => {
    // Your login logic here
    res.json({ message: "Login successful" });
  },
);

app.post(
  "/api/register",
  rateLimit({
    redis,
    limit: 3,
    window: 3600, // 1 hour
    keyPrefix: "register",
    message: "Registration limit reached. Please try again later.",
  }),
  (req: Request, res: Response) => {
    // Your registration logic here
    res.json({ message: "Registration successful" });
  },
);

// ============================================================================
// EXAMPLE 3: User-based rate limiting (requires auth middleware)
// ============================================================================

// Simple auth middleware (replace with your actual auth)
interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    isPremium?: boolean;
    role?: string;
  };
}

const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // Simplified JWT verification (use your actual implementation)
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Mock user (replace with actual JWT decode)
  req.user = {
    id: 123,
    email: "user@example.com",
    isPremium: false,
  };

  next();
};

// User-based rate limiting
app.post(
  "/api/posts",
  authMiddleware,
  rateLimit({
    redis,
    limit: 10,
    window: 60, // 1 minute
    keyPrefix: "create-post",
    identifier: (req) => {
      const authReq = req as AuthRequest;
      return authReq.user?.id.toString() || null;
    },
    message: "Post creation limit exceeded. Please wait before posting again.",
  }),
  (req: Request, res: Response) => {
    res.json({ message: "Post created successfully" });
  },
);

// ============================================================================
// EXAMPLE 4: API key-based rate limiting
// ============================================================================

app.get(
  "/api/data",
  rateLimit({
    redis,
    limit: 1000,
    window: 3600, // 1 hour
    keyPrefix: "api-key",
    identifier: (req) => {
      const apiKey = req.headers["x-api-key"] as string;
      return apiKey || null; // Falls back to IP if no API key
    },
  }),
  (req: Request, res: Response) => {
    res.json({ data: "Your data here" });
  },
);

// ============================================================================
// EXAMPLE 5: Tiered rate limits (free vs premium users)
// ============================================================================

app.get(
  "/api/premium-data",
  authMiddleware,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    const limiter = req.user?.isPremium
      ? rateLimit({
          redis,
          limit: 10000,
          window: 3600,
          keyPrefix: "premium-api",
          identifier: (req) => (req as AuthRequest).user?.id.toString() || null,
        })
      : rateLimit({
          redis,
          limit: 100,
          window: 3600,
          keyPrefix: "free-api",
          identifier: (req) => (req as AuthRequest).user?.id.toString() || null,
        });

    return limiter(req, res, next);
  },
  (req: Request, res: Response) => {
    res.json({ data: "Premium data" });
  },
);

// ============================================================================
// EXAMPLE 6: Skip rate limiting for admin users
// ============================================================================

app.post(
  "/api/admin/action",
  authMiddleware,
  rateLimit({
    redis,
    limit: 100,
    window: 60,
    keyPrefix: "admin-action",
    skip: (req) => {
      const authReq = req as AuthRequest;
      return authReq.user?.role === "admin";
    },
  }),
  (req: Request, res: Response) => {
    res.json({ message: "Admin action completed" });
  },
);

// ============================================================================
// EXAMPLE 7: Expensive AI operations with strict limits
// ============================================================================

app.post(
  "/api/ai/generate",
  authMiddleware,
  rateLimit({
    redis,
    limit: 3,
    window: 3600, // 3 requests per hour
    keyPrefix: "ai-generation",
    identifier: (req) => (req as AuthRequest).user?.id.toString() || null,
    message: "AI generation limit reached. Please try again in an hour.",
  }),
  (req: Request, res: Response) => {
    // Expensive AI operation
    res.json({ result: "AI-generated content" });
  },
);

// ============================================================================
// EXAMPLE 8: Fail-closed strategy for critical endpoints
// ============================================================================

app.post(
  "/api/critical/payment",
  authMiddleware,
  rateLimit({
    redis,
    limit: 5,
    window: 60,
    keyPrefix: "payment",
    identifier: (req) => (req as AuthRequest).user?.id.toString() || null,
    failStrategy: "closed", // Block if Redis is down
    message: "Payment rate limit exceeded.",
  }),
  (req: Request, res: Response) => {
    res.json({ message: "Payment processed" });
  },
);

// ============================================================================
// EXAMPLE 9: Manual rate limiting with standalone limiter
// ============================================================================

const customLimiter = createRateLimiter({
  redis,
  limit: 50,
  window: 60,
  keyPrefix: "custom",
});

app.get("/api/custom", async (req: Request, res: Response) => {
  const identifier =
    (req.headers["x-user-id"] as string) || req.ip || "unknown";

  try {
    const result = await customLimiter.limit(identifier);

    // Set headers manually
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", result.reset);

    if (!result.allowed) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        retryAfter: result.ttl,
      });
    }

    res.json({ message: "Success" });
  } catch (error) {
    // Handle error (fail-open or fail-closed based on your preference)
    console.error("Rate limit error:", error);
    res.json({ message: "Success (rate limit check failed)" });
  }
});

// ============================================================================
// EXAMPLE 10: Admin endpoint to check/reset rate limits
// ============================================================================

app.get("/api/admin/rate-limit-status", authMiddleware, async (req, res) => {
  const userId = req.query.userId as string;
  const keyPrefix = req.query.keyPrefix as string;

  if (!userId || !keyPrefix) {
    return res.status(400).json({ error: "userId and keyPrefix required" });
  }

  const limiter = createRateLimiter({
    redis,
    limit: 100, // Doesn't matter for getStatus
    window: 60,
    keyPrefix,
  });

  try {
    const status = await limiter.getStatus(userId);

    if (!status) {
      return res.json({ message: "No rate limit data found" });
    }

    res.json({
      current: status.current,
      ttl: status.ttl,
      message: `${status.current} requests made, resets in ${status.ttl} seconds`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get rate limit status" });
  }
});

app.post("/api/admin/reset-rate-limit", authMiddleware, async (req, res) => {
  const { userId, keyPrefix } = req.body;

  if (!userId || !keyPrefix) {
    return res.status(400).json({ error: "userId and keyPrefix required" });
  }

  const limiter = createRateLimiter({
    redis,
    limit: 100, // Doesn't matter for reset
    window: 60,
    keyPrefix,
  });

  try {
    const success = await limiter.reset(userId);

    if (success) {
      res.json({ message: "Rate limit reset successfully" });
    } else {
      res.json({ message: "No rate limit data found to reset" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to reset rate limit" });
  }
});

// ============================================================================
// Start server
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing Redis connection...");
  await redis.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing Redis connection...");
  await redis.quit();
  process.exit(0);
});
