/**
 * Brain — The central orchestrator of Gumm.
 *
 * Manages identity, memory, modules, events, and context window.
 * Singleton — use `useBrain()` anywhere in back/.
 */
import { eq, like } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brainConfig, memory } from '../db/schema';
import { EventBus } from './event-bus';
import { ContextWindow } from './context-window';
import { useBrainScheduler } from './scheduler';
import { restoreReminders } from '../utils/reminders';
import { restoreRecurringTasks } from '../utils/recurring-tasks';
import {
  remember as memRemember,
  recall as memRecall,
  recallAll as memRecallAll,
  forget as memForget,
} from '../utils/memory';
import {
  buildModuleStorage,
  type ModuleStorage,
} from '../utils/module-storage';
import { buildPersonalFactsBlock } from '../utils/personal-facts';
import { buildKnowledgeBlock } from '../utils/brain-knowledge';
import { searchMemoryByVector } from '../utils/vector-memory';
import { isRedisAvailable } from '../utils/redis';
import { ensureMigrations } from '../utils/db';

// ─── Brain Files ─────────────────────────────────────────────────────────────

/**
 * Resolve the brain/ directory. Works in dev (project root) and in
 * production Docker builds (files are copied into .output/).
 */
function brainDir(): string {
  // In dev: process.cwd() is the project root
  // In prod (Docker): the COPY . . puts brain/ at /app/brain/
  return resolve(process.cwd(), 'brain');
}

/** Read a markdown brain file. Returns its content stripped of the H1 title line. */
async function readBrainFile(filename: string): Promise<string | null> {
  try {
    const raw = await readFile(resolve(brainDir(), filename), 'utf-8');
    // Strip the leading "# Title\n" line so only the content is used
    return raw.replace(/^#\s+.*\n+/, '').trim() || null;
  } catch {
    return null;
  }
}

// ─── Hardcoded Fallbacks (used only when brain/ files are missing) ───────────

const FALLBACK_PERSONALITY = `Be genuinely helpful, not performatively helpful. Skip filler words — just help. \
Have opinions. Be resourceful before asking: read files, check context, search first. \
Concise when needed, thorough when it matters. Not a corporate drone, not a sycophant — just good.`;

const FALLBACK_RULES = `Private things stay private. Period.
Don't run destructive commands without asking.
When in doubt, ask before acting externally.
Be careful with external actions (emails, messages, anything public). Be bold with internal ones (reading, organizing, learning).
Use tools when they can help. Come back with answers, not questions.`;

const FALLBACK_GOALS = `Earn trust through competence. Be the assistant you'd actually want to talk to. \
Help users efficiently while respecting their data and privacy.`;

// ─── Personality Presets ─────────────────────────────────────────────────────

export type PersonalityMode = 'friendly' | 'professional' | 'casual' | 'custom';

export const PERSONALITY_PRESETS: Record<
  Exclude<PersonalityMode, 'custom'>,
  string
> = {
  friendly: `Be warm, approachable, and genuinely helpful. Use a casual, friendly tone — like a smart friend who's happy to help. \
Feel free to use light humor, show enthusiasm, and be expressive. Use "tu" if the user speaks French. \
Keep answers clear but don't be afraid of a little personality. Celebrate wins, empathize with struggles, and make the interaction feel human.`,

  professional: `Be precise, structured, and efficient. Maintain a formal, professional tone at all times. \
No humor, no filler, no emojis. Use "vous" if the user speaks French. \
Focus on delivering accurate, well-organized information. Prioritize clarity and brevity. \
Respond like a senior consultant: competent, direct, and respectful.`,

  casual: `Be genuinely helpful, not performatively helpful. Skip the "Great question!" and "I'd be happy to help!" — just help. \
Have opinions. You're allowed to disagree, prefer things, find stuff amusing or boring. \
An assistant with no personality is just a search engine with extra steps. \
Be resourceful before asking. Try to figure it out. Read the file. Check the context. Search for it. Then ask if you're stuck. \
Concise when needed, thorough when it matters. Not a corporate drone, not a sycophant — just good.`,
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Identity {
  name: string;
  personalityMode: PersonalityMode;
  personality: string;
  customPersonality: string;
  rules: string;
  goals: string;
}

export interface ModuleContext {
  memory: NamespacedMemory;
  storage: ModuleStorage;
  events: {
    emit(type: string, payload?: unknown): Promise<void>;
    on(
      pattern: string,
      handler: (event: {
        source: string;
        type: string;
        payload: unknown;
      }) => void | Promise<void>,
    ): void;
    off(
      pattern: string,
      handler: (event: {
        source: string;
        type: string;
        payload: unknown;
      }) => void | Promise<void>,
    ): void;
  };
  modules: {
    call(
      targetModuleId: string,
      toolName: string,
      args: Record<string, any>,
    ): Promise<string>;
    list(): Array<{ id: string; name: string; description: string }>;
  };
  brain: {
    recall(key: string): Promise<unknown | null>;
    getConfig(key: string): Promise<string | null>;
  };
  log: Logger;
}

export interface NamespacedMemory {
  remember(
    key: string,
    value: unknown,
    type?: 'fact' | 'preference' | 'context' | 'event',
  ): Promise<any>;
  recall(key: string): Promise<unknown | null>;
  recallAll(): Promise<any[]>;
  forget(key: string): Promise<void>;
}

export interface Logger {
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
}

// ─── Brain Class ────────────────────────────────────────────────────────────

class Brain {
  readonly events: EventBus;
  readonly context: ContextWindow;
  private _identity: Identity | null = null;
  private _initPromise: Promise<void> | null = null;

  constructor() {
    this.events = new EventBus();
    this.context = new ContextWindow();
  }

  /**
   * Access the BrainScheduler singleton (lazy init).
   */
  get scheduler() {
    return useBrainScheduler();
  }

  /**
   * Initialise: load identity from DB. Safe to call multiple times.
   */
  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit().catch((err) => {
      // Allow re-init on next call if this attempt failed
      this._initPromise = null;
      throw err;
    });
    return this._initPromise;
  }

  private async _doInit() {
    console.log('[Brain] Initializing...');

    // Ensure SQLite tables exist before any DB access
    await ensureMigrations();

    await this.loadIdentity();

    // Initialize the scheduler (restores persisted cron jobs)
    await useBrainScheduler().init();

    // Restore any pending one-shot reminders
    await restoreReminders();

    // Restore recurring cron tasks (LLM-created automations)
    await restoreRecurringTasks();

    // Initialize Redis Pub/Sub for distributed events
    await this.events.initRedisPubSub();

    console.log(`[Brain] Ready — identity: ${this._identity?.name || '???'}`);
  }

  async ready() {
    if (this._initPromise) await this._initPromise;
  }

  // ── Identity ────────────────────────────────────────────────────────────

  /**
   * Load identity: brain/ markdown files → DB overrides → hardcoded fallbacks.
   */
  private async loadIdentity() {
    // 1. Read brain/ markdown files
    const [filePersonality, fileRules, fileGoals] = await Promise.all([
      readBrainFile('personality.md'),
      readBrainFile('rules.md'),
      readBrainFile('goals.md'),
    ]);

    // 2. Read DB overrides (user may have changed values via the dashboard)
    try {
      const rows = await useDrizzle()
        .select()
        .from(brainConfig)
        .where(like(brainConfig.key, 'identity.%'));

      const map: Record<string, string> = {};
      for (const row of rows) {
        const shortKey = row.key.replace('identity.', '');
        try {
          map[shortKey] = JSON.parse(row.value);
        } catch {
          map[shortKey] = row.value;
        }
      }

      // Resolve personality mode
      const mode = (map.personalityMode as PersonalityMode) || 'casual';
      const customText =
        map.customPersonality ||
        map.personality ||
        filePersonality ||
        FALLBACK_PERSONALITY;
      const resolvedPersonality =
        mode === 'custom'
          ? customText
          : PERSONALITY_PRESETS[mode] || PERSONALITY_PRESETS.casual;

      // Priority: DB override > brain/ file > fallback
      this._identity = {
        name: map.name || 'Gumm',
        personalityMode: mode,
        personality: resolvedPersonality,
        customPersonality: customText,
        rules: map.rules || fileRules || FALLBACK_RULES,
        goals: map.goals || fileGoals || FALLBACK_GOALS,
      };
    } catch (err: any) {
      console.warn('[Brain] Could not load identity from DB:', err.message);
      this._identity = {
        name: 'Gumm',
        personalityMode: 'casual',
        personality: filePersonality || FALLBACK_PERSONALITY,
        customPersonality: filePersonality || FALLBACK_PERSONALITY,
        rules: fileRules || FALLBACK_RULES,
        goals: fileGoals || FALLBACK_GOALS,
      };
    }
  }

  get identity(): Identity {
    return (
      this._identity || {
        name: 'Gumm',
        personalityMode: 'casual' as PersonalityMode,
        personality: FALLBACK_PERSONALITY,
        customPersonality: FALLBACK_PERSONALITY,
        rules: FALLBACK_RULES,
        goals: FALLBACK_GOALS,
      }
    );
  }

  /**
   * Update a brain config key.
   */
  async setConfig(key: string, value: string) {
    const now = new Date();
    const jsonValue = JSON.stringify(value);

    const existing = await useDrizzle()
      .select()
      .from(brainConfig)
      .where(eq(brainConfig.key, key))
      .limit(1);

    if (existing.length > 0) {
      await useDrizzle()
        .update(brainConfig)
        .set({ value: jsonValue, updatedAt: now })
        .where(eq(brainConfig.key, key));
    } else {
      await useDrizzle()
        .insert(brainConfig)
        .values({ key, value: jsonValue, updatedAt: now });
    }

    // Refresh identity if it was an identity key
    if (key.startsWith('identity.')) {
      await this.loadIdentity();
    }
  }

  /**
   * Get a brain config value.
   * Supports `api.{connectionId}.{field}` keys to transparently read
   * from the centralized API connections registry.
   */
  async getConfig(key: string): Promise<string | null> {
    // Bridge: api.{connectionId}.{field} → api_connections table
    const apiMatch = key.match(/^api\.([^.]+)\.(.+)$/);
    if (apiMatch) {
      const [, connId, field] = apiMatch;
      const { apiConnections } = await import('../db/schema');
      const [conn] = await useDrizzle()
        .select()
        .from(apiConnections)
        .where(eq(apiConnections.id, connId))
        .limit(1);
      if (!conn) return null;
      try {
        const config = JSON.parse(conn.config);
        return config[field] ?? null;
      } catch {
        return null;
      }
    }

    const [row] = await useDrizzle()
      .select()
      .from(brainConfig)
      .where(eq(brainConfig.key, key))
      .limit(1);

    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  /**
   * Get all brain config entries.
   */
  async getAllConfig(): Promise<Record<string, string>> {
    const rows = await useDrizzle().select().from(brainConfig);
    const result: Record<string, string> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  }

  // ── System Prompt ───────────────────────────────────────────────────────

  /**
   * Build the dynamic system prompt from identity + modules + memories.
   */
  async buildSystemPrompt(conversationContext?: string): Promise<string> {
    const id = this.identity;
    const registry = useModuleRegistry();
    await registry.ready();
    const modules = registry.getAll().filter((m) => m.status === 'loaded');

    // Fetch the configured language and timezone
    const language = (await this.getConfig('brain.language')) || 'en';
    const timezone = (await this.getConfig('brain.timezone')) || 'UTC';

    const parts: string[] = [];

    // Identity block
    parts.push(`You are ${id.name}. ${id.personality}`);

    // Language instruction
    if (language !== 'en') {
      const langNames: Record<string, string> = {
        fr: 'French',
        es: 'Spanish',
        de: 'German',
        it: 'Italian',
        pt: 'Portuguese',
        nl: 'Dutch',
        ru: 'Russian',
        ja: 'Japanese',
        zh: 'Chinese',
        ko: 'Korean',
        ar: 'Arabic',
      };
      const langName = langNames[language] || language;
      parts.push(
        `\n## Language\nYou MUST always respond in ${langName}. All your messages, explanations, and tool outputs must be in ${langName}.`,
      );
    }

    // Timezone instruction
    const nowInTz = new Date().toLocaleString('en-US', {
      timeZone: timezone,
      dateStyle: 'full',
      timeStyle: 'short',
    });
    parts.push(
      `\n## Timezone\nThe user's timezone is ${timezone}. Current date/time: ${nowInTz}. All scheduling (cron expressions, reminders) is evaluated in this timezone.`,
    );

    if (id.rules) {
      parts.push(`\n## Rules\n${id.rules}`);
    }

    if (id.goals) {
      parts.push(`\n## Goals\n${id.goals}`);
    }

    // Capabilities block
    if (modules.length > 0) {
      const capList = modules
        .map(
          (m) =>
            `- ${m.manifest.name}: ${m.manifest.description || 'No description'}`,
        )
        .join('\n');
      parts.push(`\n## Available capabilities (modules)\n${capList}`);
    }

    // Personal facts about the owner (always injected)
    const personalBlock = await buildPersonalFactsBlock();
    if (personalBlock) {
      parts.push(`\n## What I know about my owner\n${personalBlock}`);
    }

    // Self-evolving knowledge base (auto-generated files)
    const knowledgeBlock = await buildKnowledgeBlock();
    if (knowledgeBlock) {
      parts.push(`\n## My accumulated knowledge\n${knowledgeBlock}`);
    }

    // Proactive personal fact extraction instructions
    parts.push(`\n## Personal information extraction
Personal information is AUTOMATICALLY extracted in the background by an AI system. You don't need to manually call \`personal_fact_save\` for every piece of information — it happens automatically.

However, you CAN still use \`personal_fact_save\` when:
1. The user EXPLICITLY asks you to remember something ("Remember that...", "N'oublie pas que...")
2. You detect HIGH-PRIORITY information that might be missed (like explicit corrections to existing facts)
3. Information from photos, documents, or voice messages that the auto-extractor can't see

The auto-extraction system handles:
- Identity: name, age, birthday, gender, pronouns, nationality, location
- Preferences: communication style, UI preferences, schedule preferences
- Tastes: foods, music, movies, books, fashion, colors, activities they enjoy
- Dislikes: things they hate, avoid, or find annoying
- Health: allergies, diet, conditions, fitness level
- Lifestyle: hobbies, routines, habits, sleep schedule
- Relationships: family, pets, partner, friends (their relation TO the user)
- Work: job, company, skills, work schedule, projects

Facts mentioned multiple times automatically get "strengthened" and prioritized.
When you save a fact manually, keep it natural — don't announce "I'm saving this to memory" unless asked.`);

    // Self-learning knowledge instructions
    parts.push(`\n## Self-evolving knowledge base
You have a persistent knowledge base that YOU can write to. Use the \`brain_save_knowledge\` tool PROACTIVELY to capture valuable information:

**When to save knowledge:**
- **Procedures learned**: When you figure out how to do something (deploy, configure, debug) → save to \`procedures\`
- **User corrections**: When the user corrects you on something → save to \`corrections\`
- **Insights & patterns**: When you notice patterns, preferences, or learn lessons → save to \`insights\`
- **Useful sources**: Documentation links, references, APIs discovered → save to \`sources\`
- **Project context**: Details about ongoing projects, codebases, architectures → save to \`projects\`

**Guidelines:**
- Check \`brain_list_knowledge\` before saving to avoid duplicates
- Update existing entries (use same slug) when information changes
- Delete outdated entries with \`brain_delete_knowledge\`
- Keep entries concise but complete — future you will thank present you
- Don't announce "I'm saving this to my knowledge" unless relevant to the conversation

This knowledge persists across all conversations and channels. It's your evolving brain.`);

    // Get guardrail settings for dynamic instructions
    const guardrailPattern =
      (await this.getConfig('guardrail.pattern')) || '[[...]]';
    const examplePattern = guardrailPattern.replace('...', 'value');

    // Secret vault instructions
    parts.push(`\n## Sensitive data & credential vault
Your owner can protect sensitive values by wrapping them in ${guardrailPattern.replace('...', 'markers')}. For example:
- "My Netflix password is ${examplePattern.replace('value', 'hunter2')}"
- "Username: ${examplePattern.replace('value', 'john@mail.com')} Password: ${examplePattern.replace('value', 's3cret!')}"

When this happens:
1. The raw values are stripped BEFORE reaching you and replaced with [REDACTED].
2. You receive a system note with the extracted values.
3. You MUST use the \`save_secret\` tool to store each credential with the correct service name, key, and value.
4. For passwords, tokens, and highly sensitive values: set is_password=true (they'll be hashed+salted).
5. For usernames, emails, and non-sensitive identifiers: set is_password=false.
6. NEVER repeat the raw secret values in your response — just confirm they've been saved securely.
7. You can also use \`list_secrets\` and \`get_secret\` to help the user manage their stored credentials.

**IMPORTANT: Data Guardrail Active**
The system automatically blocks messages containing sensitive data like credit card numbers, API keys, tokens, passwords, and private keys BEFORE they reach you. If a user accidentally sends such data without the ${guardrailPattern} markers, the message will be blocked with an error explaining what was detected.`);

    // Conversation context (summary of old messages)
    if (conversationContext) {
      parts.push(`\n## Previous context\n${conversationContext}`);
    }

    return parts.join('\n');
  }

  // ── Memory helpers ────────────────────────────────────────────────────

  /**
   * Search memory across all namespaces (brain privilege).
   */
  async searchMemory(query: string): Promise<any[]> {
    const rows = await useDrizzle()
      .select()
      .from(memory)
      .where(like(memory.value, `%${query}%`));

    return rows.map((row) => ({
      ...row,
      value: (() => {
        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      })(),
    }));
  }

  /**
   * Get relevant memories for a user query.
   * Uses Redis vector search when available, falls back to keyword matching.
   */
  async getRelevantMemories(
    query: string,
    limit = 5,
  ): Promise<Array<{ key: string; value: unknown }>> {
    // Try vector search first (Redis)
    if (isRedisAvailable()) {
      const apiKey = await this.getConfig('openrouter.apiKey');
      if (apiKey) {
        const vectorResults = await searchMemoryByVector(query, apiKey, limit);
        if (vectorResults.length > 0) {
          return vectorResults.map((r) => ({
            key: `[${r.namespace}] ${r.key}`,
            value: r.content,
          }));
        }
      }
    }

    // Fallback: keyword matching (no Redis or no results)
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (keywords.length === 0) return [];

    const allMemories = await useDrizzle().select().from(memory);

    const scored = allMemories.map((m) => {
      const searchable = `${m.key} ${m.value} ${m.namespace}`.toLowerCase();
      const score = keywords.filter((k) => searchable.includes(k)).length;
      return { ...m, score };
    });

    return scored
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((m) => ({
        key: `[${m.namespace}] ${m.key}`,
        value: (() => {
          try {
            return JSON.parse(m.value);
          } catch {
            return m.value;
          }
        })(),
      }));
  }

  // ── Module Context ──────────────────────────────────────────────────────

  /**
   * Build a ModuleContext for a specific module.
   * Scoped memory, event emitter, brain read access.
   */
  buildModuleContext(moduleId: string): ModuleContext {
    const brain = this;

    const namespacedMemory: NamespacedMemory = {
      async remember(key, value, type = 'fact') {
        return await memRemember(moduleId, key, value, type);
      },
      async recall(key) {
        return await memRecall(moduleId, key);
      },
      async recallAll() {
        return await memRecallAll(moduleId);
      },
      async forget(key) {
        return await memForget(moduleId, key);
      },
    };

    const eventEmitter = {
      async emit(type: string, payload?: unknown) {
        await brain.events.emit(moduleId, type, payload);
      },
      on(pattern: string, handler: any) {
        brain.events.on(pattern, handler);
        // Track subscription for cleanup on module unload
        const registry = useModuleRegistry();
        registry.registerModuleSubscription(moduleId, pattern, handler);
      },
      off(pattern: string, handler: any) {
        brain.events.off(pattern, handler);
      },
    };

    const modulesAccess = {
      async call(
        targetModuleId: string,
        toolName: string,
        args: Record<string, any>,
      ) {
        const registry = useModuleRegistry();
        return await registry.callModuleTool(
          moduleId,
          targetModuleId,
          toolName,
          args,
        );
      },
      list() {
        const registry = useModuleRegistry();
        return registry
          .getAll()
          .filter((m) => m.status === 'loaded' && m.manifest.id !== moduleId)
          .map((m) => ({
            id: m.manifest.id,
            name: m.manifest.name,
            description: m.manifest.description,
          }));
      },
    };

    const brainAccess = {
      async recall(key: string) {
        return await memRecall('brain', key);
      },
      async getConfig(key: string) {
        return await brain.getConfig(key);
      },
    };

    const logger: Logger = {
      info: (...args: any[]) => console.log(`[Module:${moduleId}]`, ...args),
      warn: (...args: any[]) => console.warn(`[Module:${moduleId}]`, ...args),
      error: (...args: any[]) => console.error(`[Module:${moduleId}]`, ...args),
    };

    return {
      memory: namespacedMemory,
      storage: buildModuleStorage(moduleId),
      events: eventEmitter,
      modules: modulesAccess,
      brain: brainAccess,
      log: logger,
    };
  }

  // ── Full process pipeline ─────────────────────────────────────────────

  /**
   * Process a chat request through the full Brain pipeline.
   *
   * 1. Build dynamic system prompt
   * 2. Inject relevant memories
   * 3. Manage context window
   * 4. Return the optimised messages array ready for LLM
   */
  async prepareMessages(
    userMessages: Array<{ role: string; content: string }>,
  ): Promise<Array<{ role: string; content: string }>> {
    await this.ready();

    // Get user's latest query for memory search
    const lastUserMsg = [...userMessages]
      .reverse()
      .find((m) => m.role === 'user');
    const query = lastUserMsg?.content || '';

    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt();

    // Find relevant memories
    const relevantMemories = await this.getRelevantMemories(query);

    // Use context window to optimise
    return this.context.buildContext(
      systemPrompt,
      userMessages,
      relevantMemories,
    );
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _brain: Brain | null = null;

export function useBrain(): Brain {
  if (!_brain) {
    _brain = new Brain();
    _brain.init().catch((err) => console.error('[Brain] Init failed:', err));
  }
  return _brain;
}
