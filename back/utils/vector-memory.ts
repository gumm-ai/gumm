/**
 * Redis Vector Memory — Vector-indexed memory layer using Redis Stack.
 *
 * Stores memory entries as Redis hashes with vector embeddings,
 * enabling semantic similarity search via RediSearch.
 *
 * Operates alongside SQLite (source of truth). Redis is the fast
 * semantic index — if unavailable, brain falls back to keyword search.
 */
import { useRedis } from './redis';
import { generateEmbedding, getEmbeddingDim } from './embedding';
import { SCHEMA_FIELD_TYPE, SCHEMA_VECTOR_FIELD_ALGORITHM } from 'redis';

const INDEX_NAME = 'idx:memory';
const PREFIX = 'memory:';

let _indexCreated = false;

/**
 * Ensure the RediSearch vector index exists.
 * Idempotent — safe to call multiple times.
 */
export async function ensureMemoryIndex(): Promise<boolean> {
  if (_indexCreated) return true;

  const redis = await useRedis();
  if (!redis) return false;

  try {
    // Check if index already exists
    await redis.ft.info(INDEX_NAME);
    _indexCreated = true;
    return true;
  } catch {
    // Index doesn't exist — create it
  }

  try {
    await redis.ft.create(
      INDEX_NAME,
      {
        namespace: { type: SCHEMA_FIELD_TYPE.TAG },
        key: { type: SCHEMA_FIELD_TYPE.TAG },
        type: { type: SCHEMA_FIELD_TYPE.TAG },
        content: { type: SCHEMA_FIELD_TYPE.TEXT },
        embedding: {
          type: SCHEMA_FIELD_TYPE.VECTOR,
          ALGORITHM: SCHEMA_VECTOR_FIELD_ALGORITHM.HNSW,
          TYPE: 'FLOAT32',
          DIM: getEmbeddingDim(),
          DISTANCE_METRIC: 'COSINE',
        },
      },
      {
        ON: 'HASH',
        PREFIX: PREFIX,
      },
    );

    _indexCreated = true;
    console.log('[VectorMemory] Created index', INDEX_NAME);
    return true;
  } catch (err: any) {
    console.error('[VectorMemory] Failed to create index:', err.message);
    return false;
  }
}

/**
 * Convert a float array to a Buffer for Redis VECTOR storage.
 */
function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

/**
 * Index a memory entry in Redis with its embedding vector.
 * Called after a memory is written to SQLite (dual-write).
 */
export async function indexMemory(
  namespace: string,
  key: string,
  value: unknown,
  type: string,
  apiKey: string,
): Promise<boolean> {
  const redis = await useRedis();
  if (!redis) return false;

  await ensureMemoryIndex();

  // Build searchable text from key + value
  const content =
    typeof value === 'string'
      ? `${key}: ${value}`
      : `${key}: ${JSON.stringify(value)}`;

  const vector = await generateEmbedding(content, apiKey);
  if (!vector) return false;

  const redisKey = `${PREFIX}${namespace}:${key}`;

  try {
    await redis.hSet(redisKey, {
      namespace,
      key,
      type,
      content,
      embedding: vectorToBuffer(vector),
    });
    return true;
  } catch (err: any) {
    console.error('[VectorMemory] Failed to index:', err.message);
    return false;
  }
}

/**
 * Remove a memory entry from the Redis vector index.
 */
export async function deindexMemory(
  namespace: string,
  key: string,
): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  const redisKey = `${PREFIX}${namespace}:${key}`;
  try {
    await redis.del(redisKey);
  } catch {
    // Non-critical — SQLite is the source of truth
  }
}

/**
 * Remove all memory entries for a namespace from Redis.
 */
export async function deindexNamespace(namespace: string): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  try {
    // Use scanIterator to find all keys matching this namespace
    for await (const key of redis.scanIterator({
      MATCH: `${PREFIX}${namespace}:*`,
      COUNT: 100,
    })) {
      await redis.del(key);
    }
  } catch {
    // Non-critical
  }
}

/**
 * Search memory by vector similarity.
 *
 * @param query     The natural language query
 * @param apiKey    OpenRouter API key (for embedding the query)
 * @param limit     Max results (default: 5)
 * @param namespace Optional namespace filter
 * @returns Ranked memory results with similarity scores
 */
export async function searchMemoryByVector(
  query: string,
  apiKey: string,
  limit = 5,
  namespace?: string,
): Promise<
  Array<{ namespace: string; key: string; content: string; score: number }>
> {
  const redis = await useRedis();
  if (!redis) return [];

  const indexReady = await ensureMemoryIndex();
  if (!indexReady) return [];

  const queryVector = await generateEmbedding(query, apiKey);
  if (!queryVector) return [];

  try {
    // Build filter: optional namespace restriction
    const filter = namespace
      ? `@namespace:{${namespace.replace(/[^a-zA-Z0-9_-]/g, '')}}`
      : '*';

    const results = await redis.ft.search(
      INDEX_NAME,
      `(${filter})=>[KNN ${limit} @embedding $BLOB AS score]`,
      {
        PARAMS: { BLOB: vectorToBuffer(queryVector) },
        SORTBY: { BY: 'score', DIRECTION: 'ASC' }, // cosine: lower = more similar
        RETURN: ['namespace', 'key', 'content', 'score'],
        LIMIT: { from: 0, size: limit },
        DIALECT: 2,
      },
    );

    return results.documents.map((doc) => ({
      namespace: doc.value.namespace as string,
      key: doc.value.key as string,
      content: doc.value.content as string,
      score: parseFloat(doc.value.score as string),
    }));
  } catch (err: any) {
    console.error('[VectorMemory] Search failed:', err.message);
    return [];
  }
}
