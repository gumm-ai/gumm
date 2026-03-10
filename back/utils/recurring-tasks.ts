/**
 * Recurring Tasks — Cron-based autonomous actions created by the LLM.
 *
 * Unlike one-shot reminders, these fire on a cron schedule and trigger
 * a full Brain chat completion (with tool access) so the LLM can
 * autonomously answer queries like "daily weather briefing".
 *
 * Uses `croner` for in-process scheduling. Persists to SQLite.
 * Delivers responses via Telegram or web EventBus.
 */
import { Cron } from 'croner';
import { eq } from 'drizzle-orm';
import { recurringTasks } from '../db/schema';
import { telegramSendMessage, getTelegramToken } from './telegram';
import {
  getBuiltinTools,
  executeBuiltinTool,
  type ChannelContext,
} from './builtin-tools';
import { getLLMConfig, callLLM } from './llm-provider';

/** Active cron jobs keyed by task ID */
const activeJobs = new Map<string, Cron>();

/**
 * Stop and clear all in-memory recurring task jobs.
 * Does NOT touch the DB — caller is responsible for that.
 */
export function clearAllRecurringJobs() {
  for (const [id, job] of activeJobs) {
    job.stop();
  }
  activeJobs.clear();
}

/**
 * Reload all recurring tasks with the current timezone.
 * Called when the user changes their timezone setting.
 */
export async function reloadAllRecurringJobs() {
  // Stop all existing jobs
  for (const [id, job] of activeJobs) {
    job.stop();
  }
  activeJobs.clear();

  // Restore with current timezone
  await restoreRecurringTasks();

  console.log(`[RecurringTasks] Reloaded all jobs with updated timezone`);
}

export interface CreateRecurringTaskOpts {
  name: string;
  prompt: string;
  cron: string;
  channel: 'telegram' | 'web';
  chatId?: number;
  conversationId?: string;
}

/**
 * Create a new recurring task. Persists to DB and starts a croner cron.
 */
export async function createRecurringTask(
  opts: CreateRecurringTaskOpts,
): Promise<{ id: string; nextRun: Date | null }> {
  const brain = useBrain();
  const timezone = (await brain.getConfig('brain.timezone')) || 'UTC';

  // Validate cron expression before saving
  let testJob: Cron;
  try {
    testJob = new Cron(opts.cron, { paused: true, timezone }, () => {});
  } catch (err: any) {
    throw new Error(`Invalid cron expression "${opts.cron}": ${err.message}`);
  }

  const nextRun = testJob.nextRun();
  testJob.stop();

  const id = crypto.randomUUID();
  const now = new Date();

  await useDrizzle()
    .insert(recurringTasks)
    .values({
      id,
      name: opts.name,
      prompt: opts.prompt,
      cron: opts.cron,
      channel: opts.channel,
      chatId: opts.chatId ?? null,
      conversationId: opts.conversationId ?? null,
      enabled: true,
      nextRunAt: nextRun,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    });

  await startCronJob(id, opts);

  console.log(
    `[RecurringTasks] Created: "${opts.name}" [${opts.cron}] → next: ${nextRun?.toISOString() || 'N/A'} (${opts.channel})`,
  );

  return { id, nextRun };
}

/**
 * Cancel/delete a recurring task.
 */
export async function cancelRecurringTask(id: string): Promise<boolean> {
  const job = activeJobs.get(id);
  if (job) {
    job.stop();
    activeJobs.delete(id);
  }

  await useDrizzle().delete(recurringTasks).where(eq(recurringTasks.id, id));

  console.log(`[RecurringTasks] Cancelled: ${id}`);
  return true;
}

/**
 * List all recurring tasks (active or disabled).
 */
export async function listRecurringTasks() {
  return useDrizzle().select().from(recurringTasks);
}

/**
 * Toggle a recurring task enabled/disabled.
 */
export async function toggleRecurringTask(
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const [row] = await useDrizzle()
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.id, id))
    .limit(1);

  if (!row) throw new Error(`Recurring task "${id}" not found`);

  if (enabled && !activeJobs.has(id)) {
    await startCronJob(id, {
      name: row.name,
      prompt: row.prompt,
      cron: row.cron,
      channel: row.channel as 'telegram' | 'web',
      chatId: row.chatId ?? undefined,
      conversationId: row.conversationId ?? undefined,
    });
  } else if (!enabled) {
    const job = activeJobs.get(id);
    if (job) {
      job.stop();
      activeJobs.delete(id);
    }
  }

  await useDrizzle()
    .update(recurringTasks)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(recurringTasks.id, id));

  console.log(
    `[RecurringTasks] ${enabled ? 'Enabled' : 'Disabled'}: "${row.name}"`,
  );
  return true;
}

/**
 * Update a recurring task's name, prompt, and/or cron expression.
 */
export async function updateRecurringTask(
  id: string,
  updates: { name?: string; prompt?: string; cron?: string },
): Promise<void> {
  const [row] = await useDrizzle()
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.id, id))
    .limit(1);

  if (!row) throw new Error(`Recurring task "${id}" not found`);

  // Validate new cron if provided
  if (updates.cron) {
    let testJob: Cron;
    const brain = useBrain();
    const timezone = (await brain.getConfig('brain.timezone')) || 'UTC';
    try {
      testJob = new Cron(updates.cron, { paused: true, timezone }, () => {});
      testJob.stop();
    } catch (err: any) {
      throw new Error(
        `Invalid cron expression "${updates.cron}": ${err.message}`,
      );
    }
  }

  const set: Record<string, any> = { updatedAt: new Date() };
  if (updates.name !== undefined) set.name = updates.name;
  if (updates.prompt !== undefined) set.prompt = updates.prompt;
  if (updates.cron !== undefined) set.cron = updates.cron;

  await useDrizzle()
    .update(recurringTasks)
    .set(set)
    .where(eq(recurringTasks.id, id));

  // Restart cron job if cron changed and task is enabled
  if (updates.cron && row.enabled) {
    await startCronJob(id, {
      name: updates.name ?? row.name,
      prompt: updates.prompt ?? row.prompt,
      cron: updates.cron,
      channel: row.channel as 'telegram' | 'web',
      chatId: row.chatId ?? undefined,
      conversationId: row.conversationId ?? undefined,
    });

    // Persist next run time
    const job = activeJobs.get(id);
    const nextRun = job?.nextRun() ?? null;
    if (nextRun) {
      await useDrizzle()
        .update(recurringTasks)
        .set({ nextRunAt: nextRun })
        .where(eq(recurringTasks.id, id));
    }
  }

  console.log(`[RecurringTasks] Updated: "${updates.name ?? row.name}"`);
}

/**
 * Manually trigger a recurring task execution (outside its cron).
 */
export async function triggerRecurringTask(id: string): Promise<void> {
  const [row] = await useDrizzle()
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.id, id))
    .limit(1);

  if (!row) throw new Error(`Recurring task "${id}" not found`);

  console.log(`[RecurringTasks] Manual trigger: "${row.name}"`);
  await fireRecurringTask(id);
}

/**
 * Restore recurring tasks from DB on boot.
 */
export async function restoreRecurringTasks() {
  try {
    const rows = await useDrizzle()
      .select()
      .from(recurringTasks)
      .where(eq(recurringTasks.enabled, true));

    for (const row of rows) {
      await startCronJob(row.id, {
        name: row.name,
        prompt: row.prompt,
        cron: row.cron,
        channel: row.channel as 'telegram' | 'web',
        chatId: row.chatId ?? undefined,
        conversationId: row.conversationId ?? undefined,
      });
    }

    if (rows.length > 0) {
      console.log(`[RecurringTasks] Restored ${rows.length} recurring task(s)`);
    }
  } catch (err: any) {
    console.warn('[RecurringTasks] Could not restore tasks:', err.message);
  }
}

// ── Internal — Cron Management ──────────────────────────────────────────────

async function startCronJob(
  id: string,
  opts: Omit<CreateRecurringTaskOpts, 'channel'> & {
    channel: 'telegram' | 'web';
    chatId?: number;
    conversationId?: string;
  },
) {
  const existing = activeJobs.get(id);
  if (existing) {
    existing.stop();
    activeJobs.delete(id);
  }

  try {
    const brain = useBrain();
    const timezone = (await brain.getConfig('brain.timezone')) || 'UTC';

    const job = new Cron(opts.cron, { timezone }, async () => {
      await fireRecurringTask(id);
    });

    activeJobs.set(id, job);

    const nextRun = job.nextRun();
    const serverNow = new Date();
    console.log(
      `[RecurringTasks] Started "${opts.name}" [${opts.cron}] timezone=${timezone}`,
    );
    console.log(
      `[RecurringTasks] Server time: ${serverNow.toISOString()} (${serverNow.getTimezoneOffset()}min offset)`,
    );
    console.log(
      `[RecurringTasks] Next run: ${nextRun?.toISOString()} (raw) -> ${nextRun?.toLocaleString('en-CA', { timeZone: timezone })} (${timezone})`,
    );
  } catch (err: any) {
    console.error(
      `[RecurringTasks] Invalid cron "${opts.cron}" for "${opts.name}":`,
      err.message,
    );
  }
}

/**
 * Fire a recurring task: run a full autonomous chat completion and deliver.
 */
async function fireRecurringTask(id: string) {
  const [row] = await useDrizzle()
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.id, id))
    .limit(1);

  if (!row || !row.enabled) return;

  const now = new Date();
  let error: string | null = null;

  try {
    const brain = useBrain();
    await brain.ready();

    const llmConfig = await getLLMConfig(brain);

    const registry = useModuleRegistry();
    await registry.ready();
    const tools = [...getBuiltinTools(), ...registry.getAllTools()];

    // Build messages: system prompt + the task prompt as user message
    const llmMessages: any[] = await brain.prepareMessages([
      { role: 'user', content: row.prompt },
    ]);

    const channelCtx: ChannelContext = {
      channel: row.channel as 'telegram' | 'web',
      chatId: row.chatId ?? undefined,
      conversationId: row.conversationId ?? undefined,
    };

    // Agentic loop (same pattern as chat.post.ts / telegram/webhook.post.ts)
    const MAX_ITERATIONS = 10;
    let finalContent = '';

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await callLLM(llmConfig, {
        messages: llmMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
      });

      const choice = response?.choices?.[0];
      if (!choice) throw new Error('No response from LLM');

      const assistantMessage = choice.message;

      // If no tool calls → we have our final response
      if (!assistantMessage.tool_calls?.length) {
        finalContent = assistantMessage.content || '';
        break;
      }

      // Process tool calls
      llmMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

        console.log(
          `[RecurringTasks] Tool call for "${row.name}": ${toolName}`,
          toolArgs,
        );
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
      }
    }

    // Deliver the response
    if (finalContent) {
      await deliverResponse(row, finalContent);
    }

    // Emit event
    try {
      await brain.events.emit('brain', 'recurring_task.executed', {
        taskId: id,
        name: row.name,
        channel: row.channel,
      });
    } catch {
      // EventBus may not be ready
    }

    console.log(`[RecurringTasks] ✓ Executed: "${row.name}"`);
  } catch (err: any) {
    error = err.message;
    console.error(`[RecurringTasks] ✗ Failed: "${row.name}":`, err.message);
  }

  // Update run metadata
  try {
    const job = activeJobs.get(id);
    const nextRun = job?.nextRun() ?? null;

    await useDrizzle()
      .update(recurringTasks)
      .set({
        lastRunAt: now,
        nextRunAt: nextRun,
        runCount: (row.runCount ?? 0) + 1,
        lastError: error,
        updatedAt: now,
      })
      .where(eq(recurringTasks.id, id));
  } catch {
    // DB update failure is non-fatal
  }
}

/**
 * Deliver the autonomous response to the appropriate channel.
 */
async function deliverResponse(
  row: {
    channel: string;
    chatId: number | null;
    conversationId: string | null;
    name: string;
  },
  content: string,
) {
  if (row.channel === 'telegram' && row.chatId) {
    const token = await getTelegramToken();
    if (token) {
      // Split long messages for Telegram's 4096 char limit
      const chunks = splitMessage(content);
      for (const chunk of chunks) {
        await telegramSendMessage(token, row.chatId, chunk, '');
      }
    }
  }

  // Emit event for web clients (SSE)
  try {
    const brain = useBrain();
    await brain.events.emit('brain', 'recurring_task.message', {
      name: row.name,
      content,
      channel: row.channel,
      conversationId: row.conversationId,
    });
  } catch {
    // EventBus may not be ready
  }
}

function splitMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf('\n', maxLen);
    if (breakAt < maxLen / 2) breakAt = maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }
  return chunks;
}
