/**
 * Background Jobs — Multi-agent parallel task runner.
 *
 * Allows Gumm (or the user) to spawn multiple independent agentic loops
 * running concurrently. Each job gets its own conversation thread and
 * runs the full Brain pipeline (tools, modules, memory) without blocking
 * the main chat.
 *
 * Jobs are fire-and-forget: `runBackgroundJob()` returns immediately and
 * updates the DB + emits events as the job progresses.
 */
import { eq } from 'drizzle-orm';
import {
  backgroundJobs,
  conversations,
  messages as messagesTable,
} from '../db/schema';
import {
  getBuiltinTools,
  executeBuiltinTool,
  type ChannelContext,
} from './builtin-tools';
import { getLLMConfig, callLLM } from './llm-provider';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateBackgroundJobOpts {
  title: string;
  prompt: string;
  parentConversationId?: string;
  moduleIds?: string[];
}

export type BackgroundJobStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface BackgroundJob {
  id: string;
  title: string;
  prompt: string;
  status: BackgroundJobStatus;
  result: string | null;
  error: string | null;
  conversationId: string;
  parentConversationId: string | null;
  model: string | null;
  moduleIds: string[] | null;
  iterations: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Track running jobs so we can cancel them gracefully
const cancelFlags = new Map<string, boolean>();

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a new background job. Creates a dedicated conversation and
 * persists the job as 'pending'. Call `runBackgroundJob(id)` to start it.
 */
export async function createBackgroundJob(
  opts: CreateBackgroundJobOpts,
): Promise<string> {
  const id = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const now = new Date();

  // Create the dedicated conversation for this job
  await useDrizzle()
    .insert(conversations)
    .values({
      id: conversationId,
      title: `[Job] ${opts.title}`,
      createdAt: now,
      updatedAt: now,
    });

  await useDrizzle()
    .insert(backgroundJobs)
    .values({
      id,
      title: opts.title,
      prompt: opts.prompt,
      status: 'pending',
      conversationId,
      parentConversationId: opts.parentConversationId ?? null,
      moduleIds: opts.moduleIds?.length ? JSON.stringify(opts.moduleIds) : null,
      iterations: 0,
      createdAt: now,
      updatedAt: now,
    });

  return id;
}

/**
 * Start execution of a background job. Non-blocking — runs the agentic loop
 * in the background without awaiting. Multiple jobs can run in parallel.
 */
export function runBackgroundJob(jobId: string): void {
  // Fire-and-forget — errors are caught internally and written to DB
  executeJob(jobId).catch((err) => {
    console.error(
      `[BackgroundJob] Unexpected crash for job ${jobId}:`,
      err.message,
    );
  });
}

/**
 * Create and immediately start a background job.
 */
export async function spawnBackgroundJob(
  opts: CreateBackgroundJobOpts,
): Promise<string> {
  const id = await createBackgroundJob(opts);
  runBackgroundJob(id);
  return id;
}

/**
 * Signal a running job to cancel. The job will stop at the next iteration.
 */
export function cancelBackgroundJob(jobId: string): void {
  cancelFlags.set(jobId, true);
}

/**
 * Get a background job by ID.
 */
export async function getBackgroundJob(
  id: string,
): Promise<BackgroundJob | null> {
  const [row] = await useDrizzle()
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, id))
    .limit(1);
  return row ? parseJobRow(row) : null;
}

/**
 * List background jobs, optionally filtered by status.
 */
export async function listBackgroundJobs(
  status?: BackgroundJobStatus,
): Promise<BackgroundJob[]> {
  const drizzle = useDrizzle();
  const rows = status
    ? await drizzle
        .select()
        .from(backgroundJobs)
        .where(eq(backgroundJobs.status, status))
        .orderBy(backgroundJobs.createdAt)
    : await drizzle
        .select()
        .from(backgroundJobs)
        .orderBy(backgroundJobs.createdAt);

  return rows.map(parseJobRow);
}

function parseJobRow(row: any): BackgroundJob {
  return {
    ...row,
    moduleIds: row.moduleIds ? JSON.parse(row.moduleIds) : null,
  };
}

/**
 * Delete a background job and its conversation.
 */
export async function deleteBackgroundJob(id: string): Promise<void> {
  cancelFlags.set(id, true);

  const [job] = await useDrizzle()
    .select({ conversationId: backgroundJobs.conversationId })
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, id))
    .limit(1);

  await useDrizzle().delete(backgroundJobs).where(eq(backgroundJobs.id, id));

  // The conversation's messages are cascade-deleted with it
  if (job?.conversationId) {
    await useDrizzle()
      .delete(conversations)
      .where(eq(conversations.id, job.conversationId));
  }
}

// ── Internal — Agentic Loop ──────────────────────────────────────────────────

async function executeJob(jobId: string): Promise<void> {
  const drizzle = useDrizzle();
  const brain = useBrain();

  // Fetch job from DB
  const [row] = await drizzle
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, jobId))
    .limit(1);

  if (!row) {
    console.warn(`[BackgroundJob] Job ${jobId} not found`);
    return;
  }

  if (row.status === 'cancelled') return;

  // Mark as running
  const startedAt = new Date();
  await drizzle
    .update(backgroundJobs)
    .set({ status: 'running', startedAt, updatedAt: new Date() })
    .where(eq(backgroundJobs.id, jobId));

  await emitJobEvent(jobId, 'job.running', { title: row.title });

  console.log(`[BackgroundJob] Starting: "${row.title}" (${jobId})`);

  let finalContent = '';
  let error: string | null = null;
  let iterations = 0;

  try {
    await brain.ready();

    const llmConfig = await getLLMConfig(brain);
    const registry = useModuleRegistry();
    await registry.ready();
    const jobModuleIds: string[] | null = row.moduleIds
      ? JSON.parse(row.moduleIds as string)
      : null;
    const moduleTools = jobModuleIds?.length
      ? registry.getToolsForModules(jobModuleIds)
      : registry.getAllTools();
    const tools = [...getBuiltinTools(), ...moduleTools];

    // Persist the initial user prompt into the job's conversation
    await drizzle.insert(messagesTable).values({
      id: crypto.randomUUID(),
      conversationId: row.conversationId,
      role: 'user',
      content: row.prompt,
      createdAt: new Date(),
    });

    // Build messages via brain (injects system prompt, memories, etc.)
    const llmMessages: any[] = await brain.prepareMessages([
      { role: 'user', content: row.prompt },
    ]);

    const channelCtx: ChannelContext = {
      channel: 'web',
      conversationId: row.conversationId,
    };

    // Full agentic loop — same pattern as chat.post.ts
    const MAX_ITERATIONS = 15;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      // Respect cancellation
      if (cancelFlags.get(jobId)) {
        error = 'Cancelled by user.';
        break;
      }

      const response = await callLLM(llmConfig, {
        messages: llmMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
      });

      iterations = i + 1;
      const choice = response?.choices?.[0];
      if (!choice) throw new Error('No response from LLM');

      const assistantMessage = choice.message;

      // No tool calls → final response
      if (!assistantMessage.tool_calls?.length) {
        finalContent = assistantMessage.content || '';

        // Persist the final assistant message
        await drizzle.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: row.conversationId,
          role: 'assistant',
          content: finalContent,
          createdAt: new Date(),
        });
        break;
      }

      // Persist assistant message with tool calls
      await drizzle.insert(messagesTable).values({
        id: crypto.randomUUID(),
        conversationId: row.conversationId,
        role: 'assistant',
        content: assistantMessage.content || '',
        toolCalls: JSON.stringify(assistantMessage.tool_calls),
        createdAt: new Date(),
      });

      llmMessages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

        console.log(`[BackgroundJob] Tool "${toolName}" in job "${row.title}"`);

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

        // Persist tool result
        await drizzle.insert(messagesTable).values({
          id: crypto.randomUUID(),
          conversationId: row.conversationId,
          role: 'tool',
          content: result,
          toolCallId: toolCall.id,
          createdAt: new Date(),
        });
      }
    }

    if (!finalContent && !error) {
      finalContent = 'Max tool iterations reached without a final response.';
    }
  } catch (err: any) {
    error = err.message || 'Unknown error';
    console.error(`[BackgroundJob] Failed: "${row.title}":`, error);
  }

  // Final status update
  const isCancelled = cancelFlags.get(jobId) && error === 'Cancelled by user.';
  const finalStatus: BackgroundJobStatus = isCancelled
    ? 'cancelled'
    : error
      ? 'failed'
      : 'done';

  const completedAt = new Date();
  await useDrizzle()
    .update(backgroundJobs)
    .set({
      status: finalStatus,
      result: finalContent || null,
      error: error || null,
      iterations,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(backgroundJobs.id, jobId));

  // Update conversation timestamp
  await useDrizzle()
    .update(conversations)
    .set({ updatedAt: completedAt })
    .where(eq(conversations.id, row.conversationId));

  cancelFlags.delete(jobId);

  await emitJobEvent(jobId, `job.${finalStatus}`, {
    title: row.title,
    result: finalContent,
    error,
  });

  console.log(
    `[BackgroundJob] ${finalStatus.toUpperCase()}: "${row.title}" (${iterations} iterations)`,
  );
}

/** Emit a job lifecycle event via the EventBus. */
async function emitJobEvent(
  jobId: string,
  type: string,
  payload: Record<string, any>,
): Promise<void> {
  try {
    const brain = useBrain();
    await brain.events.emit('jobs', type, { jobId, ...payload });
  } catch {
    // EventBus may not be ready — not critical
  }
}
