/**
 * Agent Tasks — CLI ↔ Telegram bridge.
 *
 * Manages tasks that are delegated to a connected CLI agent for local execution.
 * The CLI runs in "gumm up" daemon mode, picks up tasks via SSE, executes locally,
 * and sends results back. Results are then forwarded to the originating channel (Telegram/web).
 */
import { eq, and, inArray } from 'drizzle-orm';
import { agentTasks } from '../db/schema';
import {
  telegramSendMessage,
  telegramSendPhoto,
  telegramSendDocument,
  getTelegramToken,
} from './telegram';
import { storageGet } from './storage';

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface CreateAgentTaskOpts {
  prompt: string;
  channel: 'telegram' | 'web';
  chatId?: number;
  conversationId?: string;
}

/**
 * Create a new agent task for the CLI to execute.
 * Emits an SSE event so connected CLI agents are notified immediately.
 */
export async function createAgentTask(
  opts: CreateAgentTaskOpts,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();

  await useDrizzle().insert(agentTasks).values({
    id,
    status: 'pending',
    prompt: opts.prompt,
    channel: opts.channel,
    chatId: opts.chatId,
    conversationId: opts.conversationId,
    createdAt: now,
    updatedAt: now,
  });

  // Notify connected CLI agents via EventBus
  const brain = useBrain();
  await brain.events.emit('agent', 'task.created', {
    taskId: id,
    prompt: opts.prompt,
  });

  return id;
}

/**
 * Claim a pending task (CLI marks it as in-progress).
 */
export async function claimAgentTask(taskId: string): Promise<boolean> {
  const now = new Date();
  const result = await useDrizzle()
    .update(agentTasks)
    .set({ status: 'claimed', claimedAt: now, updatedAt: now })
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.status, 'pending')));

  return (result as any).changes > 0 || (result as any).rowsAffected > 0;
}

/**
 * Submit result for a task and deliver it to the originating channel.
 * If attachments (storageKeys) are provided and the channel is Telegram,
 * auto-send those files — this catches cases where the CLI agent uploaded
 * files but the LLM didn't call send_telegram_file.
 */
export async function completeAgentTask(
  taskId: string,
  result: string,
  success: boolean,
  attachments?: string[],
): Promise<void> {
  const now = new Date();
  const status = success ? 'done' : 'failed';

  await useDrizzle()
    .update(agentTasks)
    .set({ status, result, completedAt: now, updatedAt: now })
    .where(eq(agentTasks.id, taskId));

  // Fetch task to know where to deliver
  const [task] = await useDrizzle()
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId));

  if (!task) return;

  // Deliver result to originating channel
  if (task.channel === 'telegram' && task.chatId) {
    const token = await getTelegramToken();
    if (token) {
      const message = success
        ? `✅ CLI Agent result:\n\n${result}`
        : `❌ CLI Agent failed:\n\n${result}`;
      try {
        await telegramSendMessage(token, task.chatId, message, '');
      } catch (err: any) {
        console.error(
          `[AgentTasks] Failed to send result to Telegram chat ${task.chatId}:`,
          err.message,
        );
        // Retry once after a short delay
        try {
          await new Promise((r) => setTimeout(r, 1000));
          await telegramSendMessage(token, task.chatId, message, '');
        } catch (retryErr: any) {
          console.error(`[AgentTasks] Retry also failed:`, retryErr.message);
        }
      }

      // Auto-send uploaded attachments that weren't already sent by the CLI agent
      if (attachments?.length) {
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        for (const storageKey of attachments) {
          try {
            const fileData = await storageGet(storageKey);
            if (!fileData) {
              console.warn(
                `[AgentTasks] Attachment not found in storage: ${storageKey}`,
              );
              continue;
            }
            const filename = storageKey.split('/').pop() || 'file';
            const ext = filename.split('.').pop()?.toLowerCase() || '';
            if (imageExts.includes(ext)) {
              await telegramSendPhoto(token, task.chatId, fileData, filename);
            } else {
              await telegramSendDocument(
                token,
                task.chatId,
                fileData,
                filename,
              );
            }
          } catch (fileErr: any) {
            console.error(
              `[AgentTasks] Failed to send attachment ${storageKey}:`,
              fileErr.message,
            );
          }
        }
      }
    }
  }

  // Emit completion event
  const brain = useBrain();
  await brain.events.emit('agent', 'task.completed', {
    taskId,
    status,
    channel: task.channel,
  });
}

/**
 * Get a single agent task by ID.
 */
export async function getAgentTaskById(taskId: string) {
  const [task] = await useDrizzle()
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId));
  return task || null;
}

/**
 * Get all pending tasks (for CLI to pick up).
 */
export async function getPendingAgentTasks() {
  return useDrizzle()
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, 'pending'));
}

/**
 * Get all tasks, optionally filtered by status.
 */
export async function getAgentTasks(status?: string) {
  if (status) {
    return useDrizzle()
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.status, status as any));
  }
  return useDrizzle().select().from(agentTasks);
}

/**
 * Check if any CLI agent is connected (via SSE).
 */
export function isCliAgentConnected(): boolean {
  const brain = useBrain();
  // We check if there are SSE clients connected — a rough heuristic.
  // The CLI agent registers itself via a dedicated SSE stream.
  return (brain.events as any).sseClients?.size > 0;
}

/**
 * Timeout stale tasks (claimed but not completed within threshold).
 */
export async function timeoutStaleTasks(): Promise<number> {
  const cutoff = new Date(Date.now() - TASK_TIMEOUT_MS);
  const stale = await useDrizzle()
    .select()
    .from(agentTasks)
    .where(and(inArray(agentTasks.status, ['pending', 'claimed'])));

  let count = 0;
  for (const task of stale) {
    const taskAge = Date.now() - new Date(task.createdAt).getTime();
    if (taskAge > TASK_TIMEOUT_MS) {
      await useDrizzle()
        .update(agentTasks)
        .set({ status: 'timeout', updatedAt: new Date() })
        .where(eq(agentTasks.id, task.id));

      // Notify originator
      if (task.channel === 'telegram' && task.chatId) {
        const token = await getTelegramToken();
        if (token) {
          await telegramSendMessage(
            token,
            task.chatId,
            '⏰ CLI agent task timed out — the CLI may not be connected (`gumm up`).',
          );
        }
      }
      count++;
    }
  }
  return count;
}
