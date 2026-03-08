/**
 * ContextWindow — Manages the LLM context size.
 *
 * Keeps messages within token budget by summarising old messages
 * and injecting relevant memories into the system prompt.
 */

/** Simple token estimation: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
): number {
  return messages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + 4, // 4 for role/format overhead
    0,
  );
}

export interface ContextWindowConfig {
  /** Max total tokens for the LLM context (default: 12000 for gpt-4o-mini) */
  maxTokens: number;
  /** Reserved tokens for the system prompt (default: 2000) */
  systemReserve: number;
  /** Number of recent messages to always keep (default: 10) */
  recentMessageCount: number;
}

const DEFAULT_CONFIG: ContextWindowConfig = {
  maxTokens: 12000,
  systemReserve: 2000,
  recentMessageCount: 10,
};

export class ContextWindow {
  private config: ContextWindowConfig;

  constructor(config?: Partial<ContextWindowConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build an optimised message array for the LLM.
   *
   * Strategy:
   *  1. System prompt always first
   *  2. If messages fit within budget → send all
   *  3. If not → summarise older messages, keep recent ones
   *
   * @param systemPrompt The full system prompt
   * @param messages     All conversation messages
   * @param memories     Relevant memory entries to inject
   */
  async buildContext(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    memories: Array<{ key: string; value: unknown }> = [],
  ): Promise<Array<{ role: string; content: string }>> {
    // Build enriched system prompt with memories
    let enrichedSystem = systemPrompt;

    if (memories.length > 0) {
      const memoryBlock = memories
        .map(
          (m) =>
            `- ${m.key}: ${typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}`,
        )
        .join('\n');
      enrichedSystem += `\n\n## Relevant memories\n${memoryBlock}`;
    }

    const systemTokens = estimateTokens(enrichedSystem);
    const budgetForMessages = this.config.maxTokens - systemTokens - 500; // 500 for response

    const result: Array<{ role: string; content: string }> = [
      { role: 'system', content: enrichedSystem },
    ];

    const totalTokens = estimateMessagesTokens(messages);

    if (totalTokens <= budgetForMessages) {
      // Everything fits
      result.push(...messages);
      return result;
    }

    // Need to truncate: keep the last N messages, summarise the rest
    const recentCount = Math.min(
      this.config.recentMessageCount,
      messages.length,
    );
    const oldMessages = messages.slice(0, -recentCount);
    const recentMessages = messages.slice(-recentCount);

    if (oldMessages.length > 0) {
      // Build a summary of older messages
      const summary = this.summariseLocally(oldMessages);
      result.push({
        role: 'system',
        content: `[Conversation summary] ${summary}`,
      });
    }

    result.push(...recentMessages);
    return result;
  }

  /**
   * Simple local summarisation (no LLM call — fast).
   * Extracts key user questions and assistant answers.
   */
  private summariseLocally(
    messages: Array<{ role: string; content: string }>,
  ): string {
    const points: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Keep first 100 chars of each user message
        points.push(`User asked: "${msg.content.slice(0, 100)}..."`);
      } else if (msg.role === 'assistant' && msg.content) {
        // Keep first 80 chars of each assistant response
        points.push(
          `Assistant replied about: "${msg.content.slice(0, 80)}..."`,
        );
      }
    }

    // Cap the summary to keep it small
    return points.slice(0, 10).join(' | ');
  }

  /**
   * Get token stats for debugging/UI.
   */
  getStats(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
  ) {
    return {
      systemTokens: estimateTokens(systemPrompt),
      messagesTokens: estimateMessagesTokens(messages),
      maxTokens: this.config.maxTokens,
      budget: this.config.maxTokens - estimateTokens(systemPrompt) - 500,
    };
  }
}
