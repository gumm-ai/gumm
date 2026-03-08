/**
 * EventBus — In-memory pub/sub + persistent event journal + Redis Pub/Sub.
 *
 * All emitted events are persisted in SQLite (via events.ts helper).
 * Modules and the Brain can subscribe to event patterns with wildcards.
 * SSE clients can subscribe for real-time streaming.
 *
 * When Redis is available, events are also published to Redis Pub/Sub
 * for distributed event handling across multiple instances.
 */
import { useRedis } from '../utils/redis';
import type { RedisClientType } from 'redis';

const REDIS_CHANNEL = 'gumm:events';

export type EventHandler = (event: {
  source: string;
  type: string;
  payload: unknown;
}) => void | Promise<void>;

export type SSEClient = (data: string) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private sseClients = new Set<SSEClient>();
  private redisSubscriber: RedisClientType | null = null;
  private redisPubSubInitialized = false;

  /**
   * Register an SSE client to receive all events.
   */
  addSSEClient(client: SSEClient) {
    this.sseClients.add(client);
    console.log(`[EventBus] SSE client added (total: ${this.sseClients.size})`);
  }

  /**
   * Remove an SSE client.
   */
  removeSSEClient(client: SSEClient) {
    this.sseClients.delete(client);
    console.log(
      `[EventBus] SSE client removed (total: ${this.sseClients.size})`,
    );
  }

  /**
   * Initialize Redis Pub/Sub for distributed events.
   * Call this once during app startup.
   */
  async initRedisPubSub(): Promise<void> {
    if (this.redisPubSubInitialized) return;

    const redis = await useRedis();
    if (!redis) {
      console.log('[EventBus] Redis not available — Pub/Sub disabled');
      return;
    }

    try {
      // Create a duplicate connection for subscribing (Redis requires separate connections)
      this.redisSubscriber = redis.duplicate() as RedisClientType;
      await this.redisSubscriber.connect();

      // Subscribe to the events channel
      await this.redisSubscriber.subscribe(REDIS_CHANNEL, (message) => {
        this.handleRedisMessage(message);
      });

      this.redisPubSubInitialized = true;
      console.log('[EventBus] Redis Pub/Sub initialized');
    } catch (err: any) {
      console.warn('[EventBus] Failed to init Redis Pub/Sub:', err.message);
    }
  }

  /**
   * Handle incoming message from Redis Pub/Sub.
   * Only processes events from other instances (skips local events).
   */
  private async handleRedisMessage(message: string): Promise<void> {
    try {
      const { source, type, payload, instanceId } = JSON.parse(message);

      // Skip events from this instance (already processed locally)
      if (instanceId === process.pid.toString()) return;

      // Notify SSE clients (for distributed streaming)
      const sseData = JSON.stringify({
        source,
        type,
        payload,
        timestamp: Date.now(),
      });
      for (const client of this.sseClients) {
        try {
          client(sseData);
        } catch {
          this.sseClients.delete(client);
        }
      }

      // Notify in-memory subscribers
      for (const [pattern, handlers] of this.handlers) {
        if (this.matches(type, pattern)) {
          for (const handler of handlers) {
            try {
              await handler({ source, type, payload });
            } catch (err: any) {
              console.error(
                `[EventBus] Redis handler error for "${pattern}":`,
                err.message,
              );
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[EventBus] Failed to parse Redis message:', err.message);
    }
  }

  /**
   * Emit an event — persists to DB, notifies subscribers, streams to SSE, and publishes to Redis.
   */
  async emit(source: string, type: string, payload?: unknown) {
    // Persist to SQLite
    await emitEvent(source, type, payload);

    // Publish to Redis Pub/Sub for distributed events
    await this.publishToRedis(source, type, payload);

    // Notify SSE clients
    const sseData = JSON.stringify({
      source,
      type,
      payload,
      timestamp: Date.now(),
    });
    if (source === 'agent') {
      console.log(
        `[EventBus] Dispatching to ${this.sseClients.size} SSE client(s): ${source}.${type}`,
      );
    }
    for (const client of this.sseClients) {
      try {
        client(sseData);
      } catch {
        this.sseClients.delete(client);
      }
    }

    // Notify in-memory subscribers
    for (const [pattern, handlers] of this.handlers) {
      if (this.matches(type, pattern)) {
        for (const handler of handlers) {
          try {
            await handler({ source, type, payload });
          } catch (err: any) {
            console.error(
              `[EventBus] Handler error for "${pattern}":`,
              err.message,
            );
          }
        }
      }
    }
  }

  /**
   * Subscribe to events matching a pattern.
   * Supports wildcards: "module.*", "*.error", "*"
   */
  on(pattern: string, handler: EventHandler) {
    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);
  }

  /**
   * Unsubscribe a specific handler from a pattern.
   */
  off(pattern: string, handler: EventHandler) {
    const set = this.handlers.get(pattern);
    if (set) {
      set.delete(handler);
      if (set.size === 0) this.handlers.delete(pattern);
    }
  }

  /**
   * Query persistent event history.
   */
  async getHistory(filter?: {
    source?: string;
    type?: string;
    limit?: number;
  }) {
    return getEvents(filter);
  }

  /**
   * Check if an event type matches a subscription pattern.
   * Supports: exact match, "prefix.*", "*.suffix", "*"
   */
  private matches(type: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === type) return true;

    // Convert wildcard pattern to regex
    const regexStr = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*');
    return new RegExp(`^${regexStr}$`).test(type);
  }

  /**
   * Publish an event to Redis Pub/Sub channel.
   */
  private async publishToRedis(
    source: string,
    type: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.redisPubSubInitialized) return;

    const redis = await useRedis();
    if (!redis) return;

    try {
      const message = JSON.stringify({
        source,
        type,
        payload,
        instanceId: process.pid.toString(),
        timestamp: Date.now(),
      });
      await redis.publish(REDIS_CHANNEL, message);
    } catch (err: any) {
      console.warn('[EventBus] Failed to publish to Redis:', err.message);
    }
  }

  /**
   * Remove all subscribers and close Redis connections.
   */
  async clear() {
    this.handlers.clear();

    if (this.redisSubscriber) {
      try {
        await this.redisSubscriber.unsubscribe(REDIS_CHANNEL);
        await this.redisSubscriber.quit();
        this.redisSubscriber = null;
        this.redisPubSubInitialized = false;
      } catch (err: any) {
        console.warn('[EventBus] Error closing Redis subscriber:', err.message);
      }
    }
  }
}
