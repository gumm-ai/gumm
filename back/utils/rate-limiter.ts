/**
 * Rate Limiter — Redis-based rate limiting for API protection.
 *
 * Uses Redis INCR + EXPIRE for sliding window rate limiting.
 * Falls back to in-memory limiting if Redis is unavailable.
 *
 * Configurable per-endpoint with different windows and limits.
 */
import { useRedis } from './redis';

const PREFIX = 'ratelimit:';

/** In-memory fallback store when Redis is unavailable */
const memoryStore = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/** Default configs for common endpoints */
export const RATE_LIMITS = {
  chat: { maxRequests: 30, windowSeconds: 60 }, // 30 req/min
  chatBurst: { maxRequests: 5, windowSeconds: 5 }, // 5 req/5s burst protection
  api: { maxRequests: 100, windowSeconds: 60 }, // 100 req/min for general API
  auth: { maxRequests: 10, windowSeconds: 300 }, // 10 attempts/5min for auth
} as const;

/**
 * Build a rate limit key from identifier and endpoint.
 */
function buildKey(identifier: string, endpoint: string): string {
  return `${PREFIX}${endpoint}:${identifier}`;
}

/**
 * Check and increment rate limit for an identifier.
 *
 * @param identifier Unique ID (user ID, IP, API key, etc.)
 * @param endpoint Endpoint name for scoped limits
 * @param config Rate limit configuration
 * @returns Rate limit result with remaining count
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const redis = await useRedis();

  if (redis) {
    return checkRedisRateLimit(redis, identifier, endpoint, config);
  }

  return checkMemoryRateLimit(identifier, endpoint, config);
}

/**
 * Redis-based rate limiting using INCR + EXPIRE.
 */
async function checkRedisRateLimit(
  redis: Awaited<ReturnType<typeof useRedis>>,
  identifier: string,
  endpoint: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = buildKey(identifier, endpoint);
  const now = Math.floor(Date.now() / 1000);

  try {
    // Atomic increment
    const count = await redis!.incr(key);

    // Set expiry only on first request in window
    if (count === 1) {
      await redis!.expire(key, config.windowSeconds);
    }

    // Get TTL for reset time
    const ttl = await redis!.ttl(key);
    const resetAt = now + (ttl > 0 ? ttl : config.windowSeconds);

    const remaining = Math.max(0, config.maxRequests - count);
    const allowed = count <= config.maxRequests;

    return {
      allowed,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : ttl,
    };
  } catch (err: any) {
    console.error('[RateLimiter] Redis error:', err.message);
    // Fall back to allow on error to avoid blocking legitimate traffic
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + config.windowSeconds,
    };
  }
}

/**
 * In-memory fallback rate limiting.
 * Less accurate but functional when Redis is unavailable.
 */
function checkMemoryRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig,
): RateLimitResult {
  const key = buildKey(identifier, endpoint);
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  let entry = memoryStore.get(key);

  // Reset if window expired
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, config.maxRequests - entry.count);
  const allowed = entry.count <= config.maxRequests;
  const resetAt = Math.floor(entry.resetAt / 1000);

  // Cleanup old entries periodically
  if (memoryStore.size > 10000) {
    cleanupMemoryStore();
  }

  return {
    allowed,
    remaining,
    resetAt,
    retryAfter: allowed ? undefined : Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Clean up expired entries from memory store.
 */
function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.resetAt <= now) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Reset rate limit for an identifier (useful for admin actions).
 */
export async function resetRateLimit(
  identifier: string,
  endpoint: string,
): Promise<void> {
  const key = buildKey(identifier, endpoint);

  const redis = await useRedis();
  if (redis) {
    await redis.del(key);
  }

  memoryStore.delete(key);
}

/**
 * Get current rate limit status without incrementing.
 */
export async function getRateLimitStatus(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig,
): Promise<{ count: number; resetAt: number }> {
  const key = buildKey(identifier, endpoint);
  const now = Math.floor(Date.now() / 1000);

  const redis = await useRedis();
  if (redis) {
    try {
      const count = parseInt((await redis.get(key)) || '0', 10);
      const ttl = await redis.ttl(key);
      return {
        count,
        resetAt: ttl > 0 ? now + ttl : now + config.windowSeconds,
      };
    } catch {
      return { count: 0, resetAt: now + config.windowSeconds };
    }
  }

  const entry = memoryStore.get(key);
  if (entry && entry.resetAt > Date.now()) {
    return { count: entry.count, resetAt: Math.floor(entry.resetAt / 1000) };
  }

  return { count: 0, resetAt: now + config.windowSeconds };
}

/**
 * H3 middleware helper to apply rate limiting to an event.
 * Sets appropriate headers and throws 429 if limit exceeded.
 */
export async function applyRateLimit(
  event: any,
  endpoint: string,
  config: RateLimitConfig,
  identifier?: string,
): Promise<void> {
  // Use session user, or fall back to IP
  const session = await getUserSession(event);
  const id =
    identifier ||
    (session?.user as any)?.name ||
    getRequestIP(event) ||
    'anonymous';

  const result = await checkRateLimit(id, endpoint, config);

  // Set rate limit headers
  setHeader(event, 'X-RateLimit-Limit', config.maxRequests);
  setHeader(event, 'X-RateLimit-Remaining', result.remaining);
  setHeader(event, 'X-RateLimit-Reset', result.resetAt);

  if (!result.allowed) {
    setHeader(event, 'Retry-After', result.retryAfter || config.windowSeconds);
    throw createError({
      statusCode: 429,
      message: `Rate limit exceeded. Try again in ${result.retryAfter || config.windowSeconds} seconds.`,
    });
  }
}
