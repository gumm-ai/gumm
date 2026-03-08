/**
 * Redis client singleton for Gumm.
 *
 * Uses Redis Stack (RediSearch + RedisJSON) for:
 *  - Vector similarity search (memory)
 *  - Semantic cache (LLM responses)
 *
 * Falls back gracefully if Redis is unavailable — SQLite remains
 * the source of truth for all persistent data.
 */
import { createClient, type RedisClientType } from 'redis';

let _client: RedisClientType | null = null;
let _connecting = false;
let _available = false;

/**
 * Get or create the Redis client singleton.
 * Returns null if Redis is not configured or unreachable.
 */
export async function useRedis(): Promise<RedisClientType | null> {
  if (_client && _available) return _client;
  if (_connecting) {
    // Wait for the in-flight connection attempt
    await new Promise((r) => setTimeout(r, 200));
    return _available ? _client : null;
  }

  const url = process.env.REDIS_URL || useRuntimeConfig().redisUrl;
  if (!url) {
    console.warn('[Redis] No REDIS_URL configured — Redis features disabled.');
    return null;
  }

  _connecting = true;
  try {
    _client = createClient({ url }) as RedisClientType;

    _client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
      _available = false;
    });

    _client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    _client.on('ready', () => {
      _available = true;
    });

    await _client.connect();
    _available = true;
    console.log('[Redis] Connected to', url);
    return _client;
  } catch (err: any) {
    console.warn(
      '[Redis] Could not connect:',
      err.message,
      '— features disabled.',
    );
    _available = false;
    _connecting = false;
    return null;
  } finally {
    _connecting = false;
  }
}

/**
 * Check if Redis is currently available.
 */
export function isRedisAvailable(): boolean {
  return _available;
}
