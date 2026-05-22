/**
 * Edge-compatible rate limiter for Next.js Middleware.
 * Uses in-memory storage only — no Prisma, no Redis, no Node.js APIs.
 * Middleware runs in Edge Runtime which has strict limitations.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, RateLimitEntry>();

/** Clean up expired entries periodically (every 60s max) */
let lastCleanup = 0;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of stores) {
    if (entry.resetAt < now) {
      stores.delete(key);
    }
  }
}

export interface EdgeRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Check if a key (e.g. IP) has exceeded the rate limit.
 * Zero external dependencies — safe for Edge Runtime.
 */
export function checkEdgeRateLimit(
  key: string,
  limit: number = 30,
  windowMs: number = 60_000
): EdgeRateLimitResult {
  cleanup();
  const now = Date.now();
  const entry = stores.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    const resetAt = now + windowMs;
    stores.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);

  return {
    allowed: entry.count <= limit,
    remaining,
    resetAt: entry.resetAt,
    limit,
  };
}

/**
 * Reset the rate limit for a key (e.g. after successful auth).
 */
export function resetEdgeRateLimit(key: string): void {
  stores.delete(key);
}
