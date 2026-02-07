/**
 * Test examples for @periodic/titanium
 *
 * This file shows how to test the rate limiter in your application.
 * Add these tests to your project's test suite.
 *
 * Note: Requires jest and @types/jest to be installed
 */

import { createClient, RedisClientType } from "redis";
import { RateLimiter } from "../src/core/limiter";
import express, { Express } from "express";
import request from "supertest";
import { rateLimit } from "../src/adapters/express";

describe("RateLimiter Core", () => {
  let redis: RedisClientType;
  let limiter: RateLimiter;

  beforeAll(async () => {
    redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear Redis before each test
    await redis.flushAll();

    limiter = new RateLimiter({
      redis,
      limit: 10,
      window: 60,
      keyPrefix: "test",
    });
  });

  describe("Basic Functionality", () => {
    test("should allow first request", async () => {
      const result = await limiter.limit("user-123");

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
      expect(result.remaining).toBe(9);
    });

    test("should decrement remaining on each request", async () => {
      await limiter.limit("user-123");
      const result = await limiter.limit("user-123");

      expect(result.remaining).toBe(8);
    });

    test("should block requests after limit exceeded", async () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await limiter.limit("user-123");
      }

      // 11th request should be blocked
      const result = await limiter.limit("user-123");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    test("should track different identifiers separately", async () => {
      await limiter.limit("user-123");
      const result = await limiter.limit("user-456");

      // user-456 should have full limit
      expect(result.remaining).toBe(9);
    });
  });

  describe("Reset Functionality", () => {
    test("should reset rate limit for identifier", async () => {
      // Make some requests
      await limiter.limit("user-123");
      await limiter.limit("user-123");

      // Reset
      const resetSuccess = await limiter.reset("user-123");
      expect(resetSuccess).toBe(true);

      // Should have full limit again
      const result = await limiter.limit("user-123");
      expect(result.remaining).toBe(9);
    });

    test("should return false when resetting non-existent identifier", async () => {
      const resetSuccess = await limiter.reset("non-existent");
      expect(resetSuccess).toBe(false);
    });
  });

  describe("Status Check", () => {
    test("should get current status", async () => {
      await limiter.limit("user-123");
      await limiter.limit("user-123");

      const status = await limiter.getStatus("user-123");

      expect(status).not.toBeNull();
      expect(status?.current).toBe(2);
      expect(status?.ttl).toBeGreaterThan(0);
      expect(status?.ttl).toBeLessThanOrEqual(60);
    });

    test("should return null for non-existent identifier", async () => {
      const status = await limiter.getStatus("non-existent");
      expect(status).toBeNull();
    });
  });

  describe("Error Handling", () => {
    test("should throw error for empty identifier", async () => {
      await expect(limiter.limit("")).rejects.toThrow(
        "Identifier cannot be empty",
      );
    });

    test("should throw error when Redis is disconnected", async () => {
      await redis.quit();

      await expect(limiter.limit("user-123")).rejects.toThrow(
        "Redis client is not available",
      );

      // Reconnect for other tests
      await redis.connect();
    });
  });

  describe("TTL and Reset Time", () => {
    test("should have correct TTL after first request", async () => {
      const result = await limiter.limit("user-123");

      expect(result.ttl).toBeGreaterThan(59);
      expect(result.ttl).toBeLessThanOrEqual(60);
    });

    test("should maintain reset time across requests", async () => {
      const result1 = await limiter.limit("user-123");

      // Wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result2 = await limiter.limit("user-123");

      // Reset should be same or close
      expect(Math.abs(result1.reset - result2.reset)).toBeLessThanOrEqual(1);
    });
  });
});

describe("Express Middleware", () => {
  let app: Express;
  let redis: RedisClientType;

  beforeAll(async () => {
    redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushAll();

    app = express();
    app.use(express.json());
  });

  describe("Basic Rate Limiting", () => {
    test("should allow requests within limit", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 5,
          window: 60,
          keyPrefix: "test",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app).get("/test");

      expect(response.status).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBe("5");
      expect(response.headers["x-ratelimit-remaining"]).toBe("4");
    });

    test("should block requests after limit exceeded", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 3,
          window: 60,
          keyPrefix: "test",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      // Make 3 allowed requests
      for (let i = 0; i < 3; i++) {
        await request(app).get("/test");
      }

      // 4th request should be blocked
      const response = await request(app).get("/test");

      expect(response.status).toBe(429);
      expect(response.body.error).toContain("Too many requests");
      expect(response.headers["retry-after"]).toBeDefined();
    });
  });

  describe("Custom Identifier", () => {
    test("should use custom identifier function", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 5,
          window: 60,
          keyPrefix: "test",
          identifier: (req) => (req.headers["x-user-id"] as string) || null,
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      // First user
      await request(app).get("/test").set("x-user-id", "user-1");
      await request(app).get("/test").set("x-user-id", "user-1");

      // Second user should have separate limit
      const response = await request(app)
        .get("/test")
        .set("x-user-id", "user-2");

      expect(response.headers["x-ratelimit-remaining"]).toBe("4");
    });
  });

  describe("Skip Function", () => {
    test("should skip rate limiting when skip returns true", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 1,
          window: 60,
          keyPrefix: "test",
          skip: (req) => req.headers["x-admin"] === "true",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      // Admin requests should not be rate limited
      await request(app).get("/test").set("x-admin", "true");
      await request(app).get("/test").set("x-admin", "true");
      const response = await request(app).get("/test").set("x-admin", "true");

      expect(response.status).toBe(200);
    });

    test("should apply rate limiting when skip returns false", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 1,
          window: 60,
          keyPrefix: "test",
          skip: (req) => req.headers["x-admin"] === "true",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      // Non-admin requests should be rate limited
      await request(app).get("/test");
      const response = await request(app).get("/test");

      expect(response.status).toBe(429);
    });
  });

  describe("Fail Strategies", () => {
    test("should allow requests with fail-open when Redis fails", async () => {
      // Disconnect Redis to simulate failure
      await redis.quit();

      app.use(
        rateLimit({
          redis,
          limit: 1,
          window: 60,
          keyPrefix: "test",
          failStrategy: "open",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app).get("/test");

      expect(response.status).toBe(200);

      // Reconnect for other tests
      await redis.connect();
    });

    test("should block requests with fail-closed when Redis fails", async () => {
      // Disconnect Redis
      await redis.quit();

      app.use(
        rateLimit({
          redis,
          limit: 1,
          window: 60,
          keyPrefix: "test",
          failStrategy: "closed",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app).get("/test");

      expect(response.status).toBe(503);
      expect(response.body.error).toContain("temporarily unavailable");

      // Reconnect
      await redis.connect();
    });
  });

  describe("Custom Messages", () => {
    test("should return custom error message", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 1,
          window: 60,
          keyPrefix: "test",
          message: "Custom rate limit message",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      await request(app).get("/test");
      const response = await request(app).get("/test");

      expect(response.status).toBe(429);
      expect(response.body.error).toBe("Custom rate limit message");
    });
  });

  describe("Headers", () => {
    test("should include rate limit headers when enabled", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 10,
          window: 60,
          keyPrefix: "test",
          standardHeaders: true,
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app).get("/test");

      expect(response.headers["x-ratelimit-limit"]).toBeDefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
      expect(response.headers["x-ratelimit-reset"]).toBeDefined();
    });

    test("should not include headers when disabled", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 10,
          window: 60,
          keyPrefix: "test",
          standardHeaders: false,
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app).get("/test");

      expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
      expect(response.headers["x-ratelimit-remaining"]).toBeUndefined();
      expect(response.headers["x-ratelimit-reset"]).toBeUndefined();
    });

    test("should include Retry-After header when limit exceeded", async () => {
      app.use(
        rateLimit({
          redis,
          limit: 1,
          window: 60,
          keyPrefix: "test",
        }),
      );

      app.get("/test", (req, res) => res.json({ ok: true }));

      await request(app).get("/test");
      const response = await request(app).get("/test");

      expect(response.status).toBe(429);
      expect(response.headers["retry-after"]).toBeDefined();
      expect(parseInt(response.headers["retry-after"])).toBeGreaterThan(0);
    });
  });
});

describe("Configuration Validation", () => {
  let redis: RedisClientType;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  test("should throw error for invalid limit", () => {
    expect(() => {
      new RateLimiter({
        redis,
        limit: 0,
        window: 60,
        keyPrefix: "test",
      });
    }).toThrow("Limit must be a positive number");
  });

  test("should throw error for invalid window", () => {
    expect(() => {
      new RateLimiter({
        redis,
        limit: 10,
        window: -1,
        keyPrefix: "test",
      });
    }).toThrow("Window must be a positive number");
  });

  test("should throw error for empty keyPrefix", () => {
    expect(() => {
      new RateLimiter({
        redis,
        limit: 10,
        window: 60,
        keyPrefix: "",
      });
    }).toThrow("Key prefix is required");
  });
});
