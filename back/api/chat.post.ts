/**
 * POST /api/chat
 *
 * Processes chat through the Brain pipeline:
 *  1. Context Window: build optimal prompt
 *  2. Memory: inject relevant memories
 *  3. Modules: inject tool definitions
 *  4. LLM call (OpenRouter or Mistral)
 *  5. Tool execution with ModuleContext
 *  6. Memory: persist learned facts
 *  7. Events: emit relevant events
 *  8. Loop or return response
 */
import { eq, and } from 'drizzle-orm';
import {
  conversations,
  messages as messagesTable,
  commands,
  commandModules,
} from '../db/schema';
import { lookupCache, cacheResponse } from '../utils/semantic-cache';
import { isRedisAvailable } from '../utils/redis';
import { applyRateLimit, RATE_LIMITS } from '../utils/rate-limiter';
import {
  getBuiltinTools,
  executeBuiltinTool,
  type ChannelContext,
} from '../utils/builtin-tools';
import { redactSecrets, applyGuardrail } from '../utils/secrets';
import {
  getLLMConfig,
  callLLM,
  getProviderDisplayName,
} from '../utils/llm-provider';
import { analyzeAndExtractMemories } from '../utils/auto-memory';

export default defineEventHandler(async (event) => {
  // Auth check
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  // Rate limiting — protect against abuse
  await applyRateLimit(event, 'chat', RATE_LIMITS.chat);
  await applyRateLimit(event, 'chatBurst', RATE_LIMITS.chatBurst);

  const body = await readBody<{
    messages: Array<{ role: string; content: string }>;
    conversationId?: string;
  }>(event);
  if (!body?.messages?.length) {
    throw createError({
      statusCode: 400,
      message: 'messages array is required',
    });
  }

  const brain = useBrain();
  await brain.ready();

  // Get LLM configuration (provider-agnostic)
  let llmConfig;
  try {
    llmConfig = await getLLMConfig(brain);
  } catch (err: any) {
    throw createError({
      statusCode: 500,
      message:
        err.message || 'LLM API key not configured. Set it in Brain settings.',
    });
  }

  const drizzle = useDrizzle();

  // ── Guardrail & secret redaction — BEFORE any DB persistence ─────────────
  // Sensitive data must never be written to the database or processed by
  // auto-memory. Run all checks and redaction first.

  const guardrailEnabled =
    (await brain.getConfig('guardrail.enabled')) !== 'false';
  const guardrailPattern =
    (await brain.getConfig('guardrail.pattern')) || '[[...]]';
  const autoDetectEnabled =
    (await brain.getConfig('guardrail.autoDetect')) !== 'false';

  const lastUserMsg = body.messages[body.messages.length - 1];

  // 1. Auto-detect sensitive data — block the request before any persistence
  if (
    lastUserMsg &&
    lastUserMsg.role === 'user' &&
    guardrailEnabled &&
    autoDetectEnabled
  ) {
    const guardrailResult = await applyGuardrail(lastUserMsg.content, {
      enabled: guardrailEnabled,
      pattern: guardrailPattern,
      autoDetect: autoDetectEnabled,
    });

    if (guardrailResult.blocked) {
      throw createError({
        statusCode: 400,
        message: `Guardrail blocked: Sensitive data detected in your message. The following types were found: ${guardrailResult.detectedTypes.join(', ')}. Please remove this sensitive information before sending. If you intentionally want to share a secret (like a password you want Gumm to remember), wrap it in ${guardrailPattern.replace('...', 'your_secret')} markers.`,
      });
    }
  }

  // 2. Strip user-marked secrets (e.g. [[password]]) from all user messages
  let secretSystemNote: string | null = null;
  const sanitizedMessages = body.messages.map((msg) => {
    if (msg.role !== 'user') return msg;
    const { cleanMessage, extractedSecrets } = redactSecrets(
      msg.content,
      guardrailPattern,
    );
    if (extractedSecrets.length > 0) {
      // Build a private note for the LLM — ephemeral, never persisted
      secretSystemNote = [
        '[SYSTEM — SECRET EXTRACTION]',
        `The user's message contained ${guardrailPattern}-protected values.`,
        'These sensitive values were stripped from the message and replaced with [REDACTED].',
        'Here are the extracted raw values (in order of appearance):',
        ...extractedSecrets.map((s, i) => `  ${i + 1}. ${s}`),
        '',
        'INSTRUCTIONS:',
        '- Use the save_secret tool to store each credential with the correct service, key, and value.',
        '- Determine the service name and key type (username, password, email, api_key, etc.) from context.',
        '- Set is_password=true for passwords, tokens, and highly sensitive secrets.',
        '- NEVER repeat the raw secret values in your response to the user.',
        '- Confirm to the user that their credentials have been securely saved locally.',
      ].join('\n');
    }
    return { ...msg, content: cleanMessage };
  });

  // Sanitized version of the last user message (secrets already stripped)
  const sanitizedLastUserMsg = sanitizedMessages[sanitizedMessages.length - 1];

  // ── Conversation persistence ──────────────────────────────────────────
  let conversationId = body.conversationId;

  if (!conversationId) {
    conversationId = crypto.randomUUID();
    const now = new Date();
    await drizzle.insert(conversations).values({
      id: conversationId,
      title: sanitizedLastUserMsg?.content?.slice(0, 80) || 'New conversation',
      createdAt: now,
      updatedAt: now,
    });
  }

  // Persist the sanitized message — secrets have already been stripped above
  if (sanitizedLastUserMsg) {
    await drizzle.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId,
      role: sanitizedLastUserMsg.role as
        | 'user'
        | 'assistant'
        | 'system'
        | 'tool',
      content: sanitizedLastUserMsg.content,
      createdAt: new Date(),
    });

    // ── Automatic memory extraction (non-blocking) ────────────────────────
    // Uses sanitized content — sensitive data has already been stripped
    if (sanitizedLastUserMsg.role === 'user') {
      analyzeAndExtractMemories(
        sanitizedLastUserMsg.content,
        conversationId,
      ).catch((err) =>
        console.warn('[AutoMemory] Background extraction failed:', err.message),
      );
    }
  }

  // ── Command expansion — expand /commands into full prompts ──────────────
  let commandLinkedModuleIds: string[] | null = null;
  const expandedMessages = await Promise.all(
    sanitizedMessages.map(async (msg) => {
      if (msg.role !== 'user') return msg;

      const content = msg.content.trim();
      if (!content.startsWith('/')) return msg;

      // Extract command name and arguments
      const spaceIndex = content.indexOf(' ');
      const cmdName =
        spaceIndex > 0
          ? content.slice(1, spaceIndex).toLowerCase()
          : content.slice(1).toLowerCase();
      const cmdArgs =
        spaceIndex > 0 ? content.slice(spaceIndex + 1).trim() : '';

      // Look up the command
      const [cmd] = await useDrizzle()
        .select()
        .from(commands)
        .where(and(eq(commands.name, cmdName), eq(commands.enabled, true)))
        .limit(1);

      if (!cmd) return msg; // Command not found, pass through as normal message

      // Check for linked modules (scoped tool usage)
      const links = await useDrizzle()
        .select({ moduleId: commandModules.moduleId })
        .from(commandModules)
        .where(eq(commandModules.commandId, cmd.id));
      if (links.length > 0) {
        commandLinkedModuleIds = links.map((l) => l.moduleId);
      }

      // Expand the command into a detailed prompt
      const expandedContent = `[Command: /${cmd.name}]\n\nCommand Description: ${cmd.description}\n\nUser Input: ${cmdArgs || '(no additional input)'}\n\nExecute this command according to its description.`;

      return { ...msg, content: expandedContent };
    }),
  );

  // ── Brain pipeline ────────────────────────────────────────────────────────
  const registry = useModuleRegistry();
  await registry.ready();
  // If command has linked modules, only use those modules' tools
  const moduleTools = commandLinkedModuleIds
    ? registry.getToolsForModules(commandLinkedModuleIds)
    : registry.getAllTools();
  const tools = [...getBuiltinTools(), ...moduleTools];

  // Build optimised messages via Brain (dynamic system prompt + memories + context window)
  const llmMessages: any[] = await brain.prepareMessages(expandedMessages);

  // Inject the secret extraction note right after the system prompt
  if (secretSystemNote) {
    // Insert after the system message (index 0) so the LLM sees it early
    const insertIdx = llmMessages[0]?.role === 'system' ? 1 : 0;
    llmMessages.splice(insertIdx, 0, {
      role: 'system',
      content: secretSystemNote,
    });
  }

  // ── Semantic Cache check ──────────────────────────────────────────────
  // Only for simple queries (no tool use expected)
  const lastUserContent =
    body.messages[body.messages.length - 1]?.content || '';
  if (isRedisAvailable() && tools.length === 0 && llmConfig.apiKey) {
    const cached = await lookupCache(
      lastUserContent,
      llmConfig.model,
      llmConfig.apiKey,
    );
    if (cached) {
      // Persist cached response
      await drizzle.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: cached.content,
        createdAt: new Date(),
      });
      await drizzle
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      return { content: cached.content, conversationId, cached: true };
    }
  }

  // Agentic loop: keep calling LLM until we get a text response
  const MAX_ITERATIONS = 10;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await callLLM(llmConfig, {
      messages: llmMessages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
    });

    const choice = response.choices?.[0];
    if (!choice) {
      throw createError({
        statusCode: 502,
        message: `No response from ${getProviderDisplayName(llmConfig.provider)}`,
      });
    }

    const assistantMessage = choice.message;

    // If no tool calls, persist & return the text response
    if (!assistantMessage.tool_calls?.length) {
      const content = assistantMessage.content || '';

      // Persist assistant response
      await drizzle.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content,
        createdAt: new Date(),
      });

      // Update conversation timestamp
      await drizzle
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      // Emit chat event (non-blocking)
      brain.events
        .emit('brain', 'chat.completed', {
          conversationId,
          messageCount: body.messages.length,
        })
        .catch(() => {});

      // Store in semantic cache (non-blocking)
      if (isRedisAvailable() && llmConfig.apiKey && content) {
        cacheResponse(
          lastUserContent,
          content,
          llmConfig.model,
          llmConfig.apiKey,
        ).catch(() => {});
      }

      return { content, conversationId };
    }

    // Process tool calls
    llmMessages.push(assistantMessage);

    const channelCtx: ChannelContext = {
      channel: 'web',
      conversationId,
    };

    let cliTaskDelegated = false;
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

      console.log(`[Chat] Executing tool: ${toolName}`, toolArgs);
      const builtinResult = await executeBuiltinTool(
        toolName,
        toolArgs,
        channelCtx,
      );
      const result =
        builtinResult ?? (await registry.executeTool(toolName, toolArgs));

      llmMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });

      // Persist tool call + result
      await drizzle.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: '',
        toolCalls: JSON.stringify([toolCall]),
        createdAt: new Date(),
      });
      await drizzle.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'tool',
        content: result,
        toolCallId: toolCall.id,
        createdAt: new Date(),
      });

      if (toolName === 'execute_on_cli') {
        cliTaskDelegated = true;
      }
    }

    // CLI task is async — break the loop, the result will be delivered by the CLI agent
    if (cliTaskDelegated) {
      const ackContent =
        assistantMessage.content ||
        'Task delegated to your PC. The result will arrive shortly.';
      await drizzle.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant',
        content: ackContent,
        createdAt: new Date(),
      });
      await drizzle
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
      return { content: ackContent, conversationId };
    }
  }

  return {
    content: 'Max tool iterations reached. Please try a simpler question.',
    conversationId,
  };
});
