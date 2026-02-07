import { Request } from "express";

/**
 * Extract client IP address from Express request
 * Handles various proxy and load balancer scenarios
 *
 * Priority:
 * 1. X-Forwarded-For header (first IP if multiple)
 * 2. X-Real-IP header
 * 3. Socket remote address
 * 4. 'unknown' as fallback
 *
 * @param req - Express request object
 * @returns IP address string
 */
export function extractClientIp(req: Request): string {
  // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2)
  // We want the first one (the original client)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const firstIp = ips.split(",")[0].trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // X-Real-IP is set by some proxies (nginx)
  const realIp = req.headers["x-real-ip"];
  if (realIp && typeof realIp === "string") {
    return realIp.trim();
  }

  // Direct connection IP
  const socketIp = req.socket.remoteAddress;
  if (socketIp) {
    return socketIp;
  }

  // Fallback
  return "unknown";
}

/**
 * Normalize IP address for consistent key generation
 * Handles IPv6 to IPv4 mapping
 *
 * @param ip - IP address string
 * @returns Normalized IP address
 */
export function normalizeIp(ip: string): string {
  // Convert IPv6-mapped IPv4 address to IPv4
  // ::ffff:192.168.1.1 -> 192.168.1.1
  if (ip.startsWith("::ffff:")) {
    return ip.substring(7);
  }

  return ip;
}

/**
 * Extract and normalize client identifier from request
 *
 * @param req - Express request object
 * @returns Normalized IP address
 */
export function getDefaultIdentifier(req: Request): string {
  const ip = extractClientIp(req);
  return normalizeIp(ip);
}
