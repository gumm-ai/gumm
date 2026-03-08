/**
 * Semantic Cache — Caches LLM responses keyed by semantic similarity.
 *
 * When a user asks a question similar to a previous one, returns
 * the cached response instead of calling OpenRouter again.
 *
 * Uses Redis Stack vector search with a tight similarity threshold.
 * Cache entries have a TTL to stay fresh.
 */
import { useRedis } from './redis';
import { generateEmbedding, getEmbeddingDim } from './embedding';
import { SCHEMA_FIELD_TYPE, SCHEMA_VECTOR_FIELD_ALGORITHM } from 'redis';

const INDEX_NAME = 'idx:semcache';
const PREFIX = 'semcache:';
const DEFAULT_TTL = 60 * 60 * 24; // 24 hours
const SIMILARITY_THRESHOLD = 0.12; // cosine distance — lower = more similar

let _indexCreated = false;

/**
 * Ensure the semantic cache index exists.
 */
async function ensureCacheIndex(): Promise<boolean> {
  if (_indexCreated) return true;

  const redis = await useRedis();
  if (!redis) return false;

  try {
    await redis.ft.info(INDEX_NAME);
    _indexCreated = true;
    return true;
  } catch {
    // Doesn't exist yet
  }

  try {
    await redis.ft.create(
      INDEX_NAME,
      {
        model: { type: SCHEMA_FIELD_TYPE.TAG },
        query: { type: SCHEMA_FIELD_TYPE.TEXT },
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
    console.log('[SemanticCache] Created index', INDEX_NAME);
    return true;
  } catch (err: any) {
    console.error('[SemanticCache] Failed to create index:', err.message);
    return false;
  }
}

function vectorToBuffer(vector: number[]): Buffer {
  return Buffer.from(new Float32Array(vector).buffer);
}

/**
 * Look up the semantic cache for a matching response.
 *
 * @returns The cached response string, or null if no close match found.
 */
export async function lookupCache(
  query: string,
  model: string,
  apiKey: string,
): Promise<{ content: string; similarity: number } | null> {
  const redis = await useRedis();
  if (!redis) return null;

  const indexReady = await ensureCacheIndex();
  if (!indexReady) return null;

  const queryVector = await generateEmbedding(query, apiKey);
  if (!queryVector) return null;

  try {
    const safeModel = model.replace(/[^a-zA-Z0-9_.-]/g, '');

    const results = await redis.ft.search(
      INDEX_NAME,
      `(@model:{${safeModel}})=>[KNN 1 @embedding $BLOB AS score]`,
      {
        PARAMS: { BLOB: vectorToBuffer(queryVector) },
        SORTBY: { BY: 'score', DIRECTION: 'ASC' },
        RETURN: ['query', 'score'],
        LIMIT: { from: 0, size: 1 },
        DIALECT: 2,
      },
    );

    if (results.documents.length === 0) return null;

    const topResult = results.documents[0]!;
    const score = parseFloat(topResult.value.score as string);

    // Only return if similarity is within threshold
    if (score > SIMILARITY_THRESHOLD) return null;

    // Fetch full cached response (stored separately to avoid index bloat)
    const responseKey = `${topResult.id}:response`;
    const content = await redis.get(responseKey);
    if (!content) return null;

    console.log(
      `[SemanticCache] HIT — score: ${score.toFixed(4)}, query: "${query.slice(0, 60)}..."`,
    );

    return { content, similarity: 1 - score };
  } catch (err: any) {
    console.error('[SemanticCache] Lookup failed:', err.message);
    return null;
  }
}

/**
 * Store a query→response pair in the semantic cache.
 */
export async function cacheResponse(
  query: string,
  response: string,
  model: string,
  apiKey: string,
  ttl = DEFAULT_TTL,
): Promise<boolean> {
  const redis = await useRedis();
  if (!redis) return false;

  const indexReady = await ensureCacheIndex();
  if (!indexReady) return false;

  const queryVector = await generateEmbedding(query, apiKey);
  if (!queryVector) return false;

  const id = `${PREFIX}${crypto.randomUUID()}`;

  try {
    // Store embedding + metadata as a hash (indexed)
    await redis.hSet(id, {
      model,
      query: query.slice(0, 500),
      embedding: vectorToBuffer(queryVector),
    });
    await redis.expire(id, ttl);

    // Store the full response separately (not indexed, can be large)
    const responseKey = `${id}:response`;
    await redis.set(responseKey, response, { EX: ttl });

    return true;
  } catch (err: any) {
    console.error('[SemanticCache] Store failed:', err.message);
    return false;
  }
}
