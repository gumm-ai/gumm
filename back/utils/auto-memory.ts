/**
 * Automatic Memory Extraction — Smart memory that learns without being asked.
 *
 * Analyzes conversations in the background to automatically extract:
 * - Personal facts (identity, preferences, tastes, dislikes)
 * - Contextual patterns (routines, habits, recurring topics)
 * - Entity mentions (people, places, projects the user talks about)
 *
 * Uses Redis for:
 * - Memory strength tracking (facts mentioned multiple times get priority)
 * - Recent extractions cache (avoid duplicate processing)
 * - Fast pattern matching across conversations
 */
import { useRedis } from './redis';
import { getLLMConfig, callLLM } from './llm-provider';
import {
  savePersonalFact,
  getPersonalFacts,
  type PersonalFactCategory,
} from './personal-facts';
import { remember, recall } from './memory';
import { generateEmbedding } from './embedding';

// Redis key prefixes
const MEMORY_STRENGTH_KEY = 'gumm:memory:strength:';
const RECENT_EXTRACTIONS_KEY = 'gumm:memory:recent:';
const EXTRACTION_LOCK_KEY = 'gumm:memory:lock:';
const ENTITY_CACHE_KEY = 'gumm:memory:entities:';

// Configuration
const EXTRACTION_COOLDOWN_MS = 5000; // Don't re-extract for the same conversation within 5s
const MEMORY_STRENGTH_TTL = 60 * 60 * 24 * 30; // 30 days
const RECENT_EXTRACTION_TTL = 60 * 60; // 1 hour

/**
 * Extracted fact from conversation analysis.
 */
export interface ExtractedFact {
  category: PersonalFactCategory;
  key: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source_quote?: string;
}

/**
 * Memory strength entry in Redis.
 */
interface MemoryStrength {
  key: string;
  mentions: number;
  lastSeen: number;
  contexts: string[]; // Last 5 contexts where this was mentioned
}

/**
 * Check if we should skip extraction (rate limiting / deduplication).
 */
async function shouldExtract(conversationId: string): Promise<boolean> {
  const redis = await useRedis();
  if (!redis) return true; // No Redis = no rate limiting, proceed

  const lockKey = `${EXTRACTION_LOCK_KEY}${conversationId}`;

  try {
    // Try to set a lock with NX (only if not exists)
    const set = await redis.set(lockKey, Date.now().toString(), {
      NX: true,
      PX: EXTRACTION_COOLDOWN_MS,
    });
    return set !== null;
  } catch {
    return true; // On error, allow extraction
  }
}

/**
 * Track memory strength in Redis.
 * Called when a fact is detected - increases its "strength" score.
 */
async function trackMemoryStrength(
  key: string,
  context: string,
): Promise<number> {
  const redis = await useRedis();
  if (!redis) return 1;

  const redisKey = `${MEMORY_STRENGTH_KEY}${key}`;

  try {
    // Get current strength
    const existing = await redis.get(redisKey);
    let strength: MemoryStrength;

    if (existing) {
      strength = JSON.parse(existing);
      strength.mentions += 1;
      strength.lastSeen = Date.now();
      // Keep only last 5 contexts
      strength.contexts = [context, ...strength.contexts].slice(0, 5);
    } else {
      strength = {
        key,
        mentions: 1,
        lastSeen: Date.now(),
        contexts: [context],
      };
    }

    await redis.set(redisKey, JSON.stringify(strength), {
      EX: MEMORY_STRENGTH_TTL,
    });

    return strength.mentions;
  } catch {
    return 1;
  }
}

/**
 * Get memory strength score for a key.
 */
export async function getMemoryStrength(key: string): Promise<number> {
  const redis = await useRedis();
  if (!redis) return 0;

  try {
    const data = await redis.get(`${MEMORY_STRENGTH_KEY}${key}`);
    if (!data) return 0;
    const strength: MemoryStrength = JSON.parse(data);
    return strength.mentions;
  } catch {
    return 0;
  }
}

/**
 * Check if a fact already exists to avoid duplicates.
 */
async function factExists(
  category: PersonalFactCategory,
  key: string,
): Promise<boolean> {
  const facts = await getPersonalFacts(category);
  return facts.some(
    (f) => f.key === key || f.key.toLowerCase() === key.toLowerCase(),
  );
}

/**
 * Store recent extraction to avoid re-processing.
 */
async function markAsExtracted(conversationId: string, hash: string) {
  const redis = await useRedis();
  if (!redis) return;

  try {
    await redis.set(`${RECENT_EXTRACTIONS_KEY}${conversationId}:${hash}`, '1', {
      EX: RECENT_EXTRACTION_TTL,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Check if this exact content was already processed.
 */
async function wasExtracted(
  conversationId: string,
  hash: string,
): Promise<boolean> {
  const redis = await useRedis();
  if (!redis) return false;

  try {
    const exists = await redis.exists(
      `${RECENT_EXTRACTIONS_KEY}${conversationId}:${hash}`,
    );
    return exists > 0;
  } catch {
    return false;
  }
}

/**
 * Simple hash for content deduplication.
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * The extraction prompt for the LLM.
 * Designed to be efficient and return structured JSON.
 */
const EXTRACTION_PROMPT = `You are a personal information extractor. Analyze the user's message and extract ANY personal facts about them.

IMPORTANT RULES:
1. Extract ONLY information about the USER (not about other people, unless it's the user's relationship to them)
2. Be PROACTIVE - extract even casually mentioned facts
3. Return EMPTY array if no extractable personal info is found
4. Use snake_case for keys
5. Confidence levels:
   - "high": Explicit statements ("I am...", "I like...", "My name is...")
   - "medium": Clear implications ("I always...", "I never...")
   - "low": Casual mentions that might be temporary

Categories:
- identity: name, age, birthday, gender, pronouns, nationality, location
- preferences: communication style, UI preferences, schedule preferences
- tastes: foods, music, movies, books, fashion, colors, activities they enjoy
- dislikes: things they hate, avoid, or find annoying
- health: allergies, diet, conditions, fitness level
- lifestyle: hobbies, routines, habits, sleep schedule
- relationships: family, pets, partner, friends (their relation TO the user)
- work: job, company, work schedule, projects
- goals: dreams, life objectives, bucket list, aspirations, what they want to achieve
- education: degrees, certifications, languages spoken, currently learning
- finances: budget style, financial goals, spending habits (only if explicitly mentioned)
- travel: countries visited, dream destinations, travel preferences (hotels vs Airbnb, etc.)
- other: anything that doesn't fit above but is personal

Return JSON array:
[{"category": "...", "key": "...", "value": "...", "confidence": "high|medium|low", "source_quote": "exact quote from message"}]

If nothing to extract, return: []`;

/**
 * Extract personal facts from a message using LLM.
 */
async function extractFactsFromMessage(
  message: string,
  apiKey: string,
  model: string,
): Promise<ExtractedFact[]> {
  try {
    const response = await callLLM(
      { provider: 'openrouter', model, apiKey },
      {
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: message },
        ],
      },
    );

    const content = response.choices?.[0]?.message?.content || '[]';

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes('```')) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      jsonStr = match ? match[1].trim() : content;
    }

    const facts = JSON.parse(jsonStr) as ExtractedFact[];
    return Array.isArray(facts) ? facts : [];
  } catch (error: any) {
    console.warn('[AutoMemory] Extraction failed:', error.message);
    return [];
  }
}

/**
 * Save extracted facts to the database.
 * Handles deduplication and strength tracking.
 */
async function saveExtractedFacts(
  facts: ExtractedFact[],
  conversationContext: string,
): Promise<{ saved: number; skipped: number; strengthened: number }> {
  let saved = 0;
  let skipped = 0;
  let strengthened = 0;

  for (const fact of facts) {
    // Skip low confidence facts unless they've been mentioned before
    if (fact.confidence === 'low') {
      const strength = await getMemoryStrength(`${fact.category}:${fact.key}`);
      if (strength < 2) {
        // Track it but don't save yet
        await trackMemoryStrength(
          `${fact.category}:${fact.key}`,
          conversationContext,
        );
        skipped++;
        continue;
      }
    }

    // Check for existing fact
    const exists = await factExists(fact.category, fact.key);

    if (exists) {
      // Strengthen existing memory
      const strength = await trackMemoryStrength(
        `${fact.category}:${fact.key}`,
        conversationContext,
      );
      strengthened++;
      console.log(
        `[AutoMemory] Strengthened: ${fact.category}/${fact.key} (mentions: ${strength})`,
      );
    } else {
      // Save new fact
      await savePersonalFact(fact.category, fact.key, fact.value, 'auto');
      await trackMemoryStrength(
        `${fact.category}:${fact.key}`,
        conversationContext,
      );
      saved++;
      console.log(
        `[AutoMemory] Saved: ${fact.category}/${fact.key} = "${fact.value}" (confidence: ${fact.confidence})`,
      );
    }
  }

  return { saved, skipped, strengthened };
}

/**
 * Main entry point: Analyze a conversation turn and extract memories.
 *
 * This runs in the background (fire-and-forget) after each user message.
 * It's designed to be fast and non-blocking.
 *
 * @param userMessage - The user's message content
 * @param conversationId - For rate limiting and deduplication
 * @param existingFacts - Optional: pre-loaded facts to avoid DB queries
 */
export async function analyzeAndExtractMemories(
  userMessage: string,
  conversationId: string,
  existingFacts?: Awaited<ReturnType<typeof getPersonalFacts>>,
): Promise<void> {
  // Skip very short messages
  if (userMessage.length < 10) return;

  // Check if auto-memory is enabled (defaults to true)
  const { useBrain } = await import('../core/brain');
  const brain = useBrain();
  await brain.ready();

  const enabled = await brain.getConfig('brain.autoMemory');
  if (enabled === 'false') {
    return; // Auto-memory disabled by user
  }

  // Rate limit per conversation
  const shouldProceed = await shouldExtract(conversationId);
  if (!shouldProceed) return;

  // Check if we already processed this content
  const contentHash = hashContent(userMessage);
  if (await wasExtracted(conversationId, contentHash)) return;

  const llmConfig = await getLLMConfigSafe(brain);
  if (!llmConfig) return;

  // Use a fast, cheap model for extraction
  // Prefer smaller models for speed/cost efficiency
  const extractionModel = await getExtractionModel(brain, llmConfig.model);

  // Extract facts
  const facts = await extractFactsFromMessage(
    userMessage,
    llmConfig.apiKey,
    extractionModel,
  );

  if (facts.length === 0) {
    await markAsExtracted(conversationId, contentHash);
    return;
  }

  // Save facts
  const result = await saveExtractedFacts(facts, userMessage);

  // Mark as processed
  await markAsExtracted(conversationId, contentHash);

  if (result.saved > 0 || result.strengthened > 0) {
    console.log(
      `[AutoMemory] Extraction complete: ${result.saved} new, ${result.strengthened} strengthened, ${result.skipped} skipped`,
    );
  }
}

/**
 * Get LLM config safely (returns null instead of throwing).
 */
async function getLLMConfigSafe(brain: any): Promise<{
  apiKey: string;
  model: string;
} | null> {
  try {
    const apiKey = await brain.getConfig('openrouter.apiKey');
    const model = await brain.getConfig('openrouter.model');

    if (!apiKey) return null;

    return {
      apiKey,
      model: model || 'openai/gpt-4o-mini',
    };
  } catch {
    return null;
  }
}

/**
 * Get the best model for extraction (prefer fast/cheap models).
 */
async function getExtractionModel(
  brain: any,
  defaultModel: string,
): Promise<string> {
  // Check if user configured a specific extraction model
  const extractionModel = await brain.getConfig('brain.extractionModel');
  if (extractionModel) return extractionModel;

  // For extraction, prefer fast/cheap models
  // Map expensive models to their cheaper equivalents
  const modelMap: Record<string, string> = {
    'anthropic/claude-3-opus': 'anthropic/claude-3-haiku',
    'anthropic/claude-3-sonnet': 'anthropic/claude-3-haiku',
    'openai/gpt-4-turbo': 'openai/gpt-4o-mini',
    'openai/gpt-4': 'openai/gpt-4o-mini',
    'openai/gpt-4o': 'openai/gpt-4o-mini',
    'google/gemini-pro': 'google/gemini-flash-1.5',
    'google/gemini-ultra': 'google/gemini-flash-1.5',
  };

  return modelMap[defaultModel] || defaultModel;
}

/**
 * Cache entity mentions for pattern detection.
 * Tracks named entities (people, places, projects) the user mentions frequently.
 */
export async function cacheEntityMention(
  entity: string,
  entityType: 'person' | 'place' | 'project' | 'other',
  context: string,
): Promise<void> {
  const redis = await useRedis();
  if (!redis) return;

  try {
    const key = `${ENTITY_CACHE_KEY}${entityType}:${entity.toLowerCase()}`;
    const existing = await redis.get(key);

    let data: { mentions: number; contexts: string[]; lastSeen: number };

    if (existing) {
      data = JSON.parse(existing);
      data.mentions++;
      data.lastSeen = Date.now();
      data.contexts = [context, ...data.contexts].slice(0, 10);
    } else {
      data = {
        mentions: 1,
        lastSeen: Date.now(),
        contexts: [context],
      };
    }

    await redis.set(key, JSON.stringify(data), { EX: MEMORY_STRENGTH_TTL });
  } catch {
    // Non-critical
  }
}

/**
 * Get frequently mentioned entities.
 * Useful for building context about recurring topics.
 */
export async function getFrequentEntities(
  entityType?: 'person' | 'place' | 'project' | 'other',
  minMentions = 2,
): Promise<Array<{ entity: string; type: string; mentions: number }>> {
  const redis = await useRedis();
  if (!redis) return [];

  try {
    const pattern = entityType
      ? `${ENTITY_CACHE_KEY}${entityType}:*`
      : `${ENTITY_CACHE_KEY}*`;

    const entities: Array<{ entity: string; type: string; mentions: number }> =
      [];

    for await (const keys of redis.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      // Handle both single key string and array of keys
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        const keyStr = String(key);
        const data = await redis.get(keyStr);
        if (!data) continue;

        const parsed = JSON.parse(data as string);
        if (parsed.mentions >= minMentions) {
          // Extract entity name and type from key
          const parts = keyStr.replace(ENTITY_CACHE_KEY, '').split(':');
          if (parts.length >= 2) {
            entities.push({
              type: parts[0]!,
              entity: parts.slice(1).join(':'),
              mentions: parsed.mentions,
            });
          }
        }
      }
    }

    return entities.sort((a, b) => b.mentions - a.mentions);
  } catch {
    return [];
  }
}

/**
 * Get memory statistics from Redis.
 */
export async function getMemoryStats(): Promise<{
  totalStrengthEntries: number;
  topMemories: Array<{ key: string; mentions: number }>;
  recentExtractions: number;
}> {
  const redis = await useRedis();
  if (!redis) {
    return { totalStrengthEntries: 0, topMemories: [], recentExtractions: 0 };
  }

  try {
    const strengths: Array<{ key: string; mentions: number }> = [];
    let recentCount = 0;

    // Count strength entries
    for await (const keys of redis.scanIterator({
      MATCH: `${MEMORY_STRENGTH_KEY}*`,
      COUNT: 100,
    })) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const key of keyList) {
        const keyStr = String(key);
        const data = await redis.get(keyStr);
        if (data) {
          const parsed = JSON.parse(data as string);
          strengths.push({
            key: keyStr.replace(MEMORY_STRENGTH_KEY, ''),
            mentions: parsed.mentions,
          });
        }
      }
    }

    // Count recent extractions
    for await (const keys of redis.scanIterator({
      MATCH: `${RECENT_EXTRACTIONS_KEY}*`,
      COUNT: 100,
    })) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      recentCount += keyList.length;
    }

    return {
      totalStrengthEntries: strengths.length,
      topMemories: strengths
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 10),
      recentExtractions: recentCount,
    };
  } catch {
    return { totalStrengthEntries: 0, topMemories: [], recentExtractions: 0 };
  }
}
