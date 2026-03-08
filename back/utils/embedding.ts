/**
 * Embedding utility — generates vector embeddings via OpenRouter.
 *
 * Used by the Redis vector layer to embed memories and queries
 * for similarity search.
 *
 * Uses a small, fast model (nomic-embed-text) to keep costs minimal.
 */

const EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const EMBEDDING_DIM = 768; // nomic-embed-text output dimension

/**
 * Generate an embedding vector for a given text.
 * Returns a float array of EMBEDDING_DIM dimensions, or null on failure.
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
): Promise<number[] | null> {
  try {
    const response = await $fetch<any>(
      'https://openrouter.ai/api/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://gumm.dev',
          'X-Title': 'Gumm',
        },
        body: {
          model: EMBEDDING_MODEL,
          input: text.slice(0, 8192), // Model context limit
        },
      },
    );

    const vector = response?.data?.[0]?.embedding;
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIM) {
      console.warn('[Embedding] Unexpected response shape');
      return null;
    }

    return vector;
  } catch (err: any) {
    console.error('[Embedding] Failed:', err.message);
    return null;
  }
}

/**
 * Get the expected embedding dimension.
 */
export function getEmbeddingDim(): number {
  return EMBEDDING_DIM;
}
