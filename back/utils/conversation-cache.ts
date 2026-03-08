/**
 * Conversation Cache — Redis cache layer for conversation data.
 *
 * Caches frequently accessed conversations and messages to reduce
 * SQLite queries. Uses write-through caching (update cache on write).
 *
 * Falls back gracefully to SQLite when Redis is unavailable.
 */
import { useRedis } from './redis';
import { desc, eq } from 'drizzle-orm';
import { conversations, messages } from '../db/schema';

const CONV_PREFIX = 'conv:';
const CONV_LIST_KEY = 'conv:list';
const MSG_PREFIX = 'msg:';

/** Cache TTL in seconds */
const CONV_TTL = 60 * 30; // 30 minutes for individual conversations
const LIST_TTL = 60 * 5; // 5 minutes for conversation list

export interface CachedConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CachedMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: string;
  createdAt: string;
}

/**
 * Get conversation list from cache or database.
 * Caches the result for subsequent requests.
 */
export async function getConversationList(): Promise<CachedConversation[]> {
  const redis = await useRedis();

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(CONV_LIST_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err: any) {
      console.warn('[ConvCache] Failed to read list from cache:', err.message);
    }
  }

  // Fetch from database
  const rows = await useDrizzle()
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt));

  const result: CachedConversation[] = rows.map((r) => ({
    id: r.id,
    title: r.title || 'Untitled',
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  // Write to cache
  if (redis) {
    try {
      await redis.setEx(CONV_LIST_KEY, LIST_TTL, JSON.stringify(result));
    } catch (err: any) {
      console.warn('[ConvCache] Failed to cache list:', err.message);
    }
  }

  return result;
}

/**
 * Get a single conversation by ID from cache or database.
 */
export async function getConversation(
  id: string,
): Promise<CachedConversation | null> {
  const redis = await useRedis();
  const key = `${CONV_PREFIX}${id}`;

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err: any) {
      console.warn('[ConvCache] Failed to read conversation:', err.message);
    }
  }

  // Fetch from database
  const rows = await useDrizzle()
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const conv: CachedConversation = {
    id: row.id,
    title: row.title || 'Untitled',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  // Write to cache
  if (redis) {
    try {
      await redis.setEx(key, CONV_TTL, JSON.stringify(conv));
    } catch (err: any) {
      console.warn('[ConvCache] Failed to cache conversation:', err.message);
    }
  }

  return conv;
}

/**
 * Get messages for a conversation from cache or database.
 */
export async function getConversationMessages(
  conversationId: string,
): Promise<CachedMessage[]> {
  const redis = await useRedis();
  const key = `${MSG_PREFIX}${conversationId}`;

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err: any) {
      console.warn('[ConvCache] Failed to read messages:', err.message);
    }
  }

  // Fetch from database
  const rows = await useDrizzle()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const result: CachedMessage[] = rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    role: r.role,
    content: r.content,
    toolCallId: r.toolCallId || undefined,
    toolCalls: r.toolCalls || undefined,
    createdAt: r.createdAt.toISOString(),
  }));

  // Write to cache
  if (redis) {
    try {
      await redis.setEx(key, CONV_TTL, JSON.stringify(result));
    } catch (err: any) {
      console.warn('[ConvCache] Failed to cache messages:', err.message);
    }
  }

  return result;
}

/**
 * Invalidate conversation-related caches.
 * Called after writes to ensure consistency.
 */
export async function invalidateConversationCache(
  conversationId?: string,
): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  try {
    // Always invalidate the list
    await redis.del(CONV_LIST_KEY);

    // Invalidate specific conversation if provided
    if (conversationId) {
      await redis.del(`${CONV_PREFIX}${conversationId}`);
      await redis.del(`${MSG_PREFIX}${conversationId}`);
    }
  } catch (err: any) {
    console.warn('[ConvCache] Failed to invalidate cache:', err.message);
  }
}

/**
 * Update conversation in cache (write-through).
 * Call this after updating a conversation in the database.
 */
export async function updateConversationCache(
  conv: CachedConversation,
): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  try {
    const key = `${CONV_PREFIX}${conv.id}`;
    await redis.setEx(key, CONV_TTL, JSON.stringify(conv));
    // Invalidate list since order may have changed
    await redis.del(CONV_LIST_KEY);
  } catch (err: any) {
    console.warn('[ConvCache] Failed to update cache:', err.message);
  }
}

/**
 * Append a message to the cached messages for a conversation.
 * More efficient than full invalidation for active conversations.
 */
export async function appendMessageToCache(
  message: CachedMessage,
): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  const key = `${MSG_PREFIX}${message.conversationId}`;

  try {
    const cached = await redis.get(key);
    if (cached) {
      const messages: CachedMessage[] = JSON.parse(cached);
      messages.push(message);
      await redis.setEx(key, CONV_TTL, JSON.stringify(messages));
    }
    // If not cached, next read will populate it
  } catch (err: any) {
    console.warn('[ConvCache] Failed to append message:', err.message);
  }
}

/**
 * Clear all conversation caches (useful for fresh start).
 */
export async function clearAllConversationCaches(): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  try {
    // Find and delete all conversation-related keys
    const keys = await redis.keys(`${CONV_PREFIX}*`);
    const msgKeys = await redis.keys(`${MSG_PREFIX}*`);
    const allKeys = [...keys, ...msgKeys, CONV_LIST_KEY];

    if (allKeys.length > 0) {
      await redis.del(allKeys);
      console.log(`[ConvCache] Cleared ${allKeys.length} cached entries`);
    }
  } catch (err: any) {
    console.warn('[ConvCache] Failed to clear caches:', err.message);
  }
}
