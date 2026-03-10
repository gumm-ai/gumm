/**
 * Agent Tasks — CLI ↔ Telegram bridge.
 *
 * Manages tasks that are delegated to a connected CLI agent for local execution.
 * The CLI runs in "gumm up" daemon mode, picks up tasks via SSE, executes locally,
 * and sends results back. Results are then forwarded to the originating channel (Telegram/web).
 */
import { eq, and, inArray } from 'drizzle-orm';
import { agentTasks, backgroundJobs } from '../db/schema';

// Track consecutive failures per persistent job (reset on success)
const persistentJobFailures = new Map<string, number>();
const MAX_PERSISTENT_FAILURES = 5;
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
  /** Target a specific device (gumm up). null = any connected agent. */
  deviceId?: string;
  /** Link to a background job — completion will update the job status. */
  backgroundJobId?: string;
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

  await useDrizzle()
    .insert(agentTasks)
    .values({
      id,
      status: 'pending',
      prompt: opts.prompt,
      channel: opts.channel,
      chatId: opts.chatId,
      conversationId: opts.conversationId,
      deviceId: opts.deviceId ?? null,
      backgroundJobId: opts.backgroundJobId ?? null,
      createdAt: now,
      updatedAt: now,
    });

  // Notify connected CLI agents via EventBus
  const brain = useBrain();
  await brain.events.emit('agent', 'task.created', {
    taskId: id,
    prompt: opts.prompt,
    deviceId: opts.deviceId ?? null,
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

  // If this task is linked to a background job, update the job when all tasks complete
  if (task.backgroundJobId) {
    await reconcileBackgroundJobFromTasks(task.backgroundJobId);
  }
}

/**
 * Check all agent tasks linked to a background job and aggregate status.
 * When all tasks are terminal (done/failed), marks the background job as done/failed.
 * For persistent jobs, re-dispatches new tasks instead of completing.
 */
async function reconcileBackgroundJobFromTasks(jobId: string): Promise<void> {
  const linkedTasks = await useDrizzle()
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.backgroundJobId, jobId));

  if (!linkedTasks.length) return;

  const allDone = linkedTasks.every((t) =>
    ['done', 'failed', 'timeout'].includes(t.status),
  );
  if (!allDone) return;

  const anyFailed = linkedTasks.some((t) =>
    ['failed', 'timeout'].includes(t.status),
  );

  // Aggregate results from all device tasks
  const parts: string[] = [];
  for (const t of linkedTasks) {
    if (t.result) {
      const deviceLabel = t.deviceId ? `[${t.deviceId}]` : '[device]';
      parts.push(`${deviceLabel}\n${t.result}`);
    }
  }
  const aggregatedResult = parts.join('\n\n---\n\n') || null;

  // Check if this is a persistent job
  const [job] = await useDrizzle()
    .select()
    .from(backgroundJobs)
    .where(eq(backgroundJobs.id, jobId))
    .limit(1);

  if (!job) return;

  const isPersistent = !!job.persistent;

  // For persistent jobs: re-dispatch regardless of success/failure (up to MAX_PERSISTENT_FAILURES consecutive failures)
  if (isPersistent && job.status !== 'cancelled') {
    // Track consecutive failures
    const failureCount = anyFailed
      ? (persistentJobFailures.get(jobId) ?? 0) + 1
      : 0;

    if (anyFailed) {
      persistentJobFailures.set(jobId, failureCount);
    } else {
      persistentJobFailures.delete(jobId);
    }

    // Stop after too many consecutive failures
    if (failureCount >= MAX_PERSISTENT_FAILURES) {
      persistentJobFailures.delete(jobId);
      console.error(
        `[AgentTasks] Persistent job "${job.title}" (${jobId}) failed ${failureCount} consecutive times — stopping`,
      );
      // fall through to finalize
    } else {
      // Update result but keep status as 'running'
      await useDrizzle()
        .update(backgroundJobs)
        .set({
          result: aggregatedResult,
          updatedAt: new Date(),
        })
        .where(eq(backgroundJobs.id, jobId));

      const deviceIds: string[] = job.deviceIds
        ? JSON.parse(job.deviceIds as string)
        : [];

      // Longer delay after failure to avoid hammering a broken daemon
      const delay = anyFailed ? 120_000 : 60_000;

      console.log(
        `[AgentTasks] Persistent job "${job.title}" cycle ${anyFailed ? `FAILED (${failureCount}/${MAX_PERSISTENT_FAILURES})` : 'done'} — re-dispatching in ${delay / 1000}s`,
      );

      setTimeout(async () => {
        // Re-check that the job hasn't been cancelled while waiting
        const [fresh] = await useDrizzle()
          .select()
          .from(backgroundJobs)
          .where(eq(backgroundJobs.id, jobId))
          .limit(1);

        if (!fresh || fresh.status === 'cancelled') return;

        // Health-check prompt: prevent the agent from re-running setup from scratch,
        // which would create duplicate daemon processes or watchers.
        const continuationPrompt = anyFailed
          ? `[Persistent job — recovery after failure]\n\nOriginal task:\n${job.prompt}\n\nThe previous attempt failed. Last error context:\n${aggregatedResult ?? '(no output)'}\n\n⚠️ RECOVERY MODE — Do NOT recreate everything from scratch:\n1. Check if any daemon/watcher/process from the previous run is still alive (use pgrep, check PID file, or launchctl/systemctl status).\n2. If it IS running: report its status briefly and stop.\n3. If it has STOPPED: restart it ONLY using the original start command — do NOT create a new script or reinstall the service.\n4. Write any logs to /tmp/ only — NEVER write log files inside the monitored folder (this causes infinite loops).`
          : `[Persistent job — health check]\n\nOriginal task:\n${job.prompt}\n\nLast cycle result:\n${aggregatedResult ?? '(no output)'}\n\n⚠️ HEALTH CHECK MODE — Do NOT re-run setup from scratch:\n1. Check if any daemon/watcher/script from the previous run is still running (pgrep, PID file, launchctl/systemctl status).\n2. If it IS running: report its status briefly and do nothing else.\n3. If it has STOPPED or crashed: restart it ONLY using the same start command — do NOT recreate scripts or services.\n4. For non-daemon tasks: check if there is new work to do based on the original task and act accordingly.\n5. Write any logs to /tmp/ only — NEVER write log files inside the monitored folder.`;

        if (deviceIds.length) {
          for (const deviceId of deviceIds) {
            await createAgentTask({
              prompt: continuationPrompt,
              channel: 'web',
              deviceId,
              backgroundJobId: jobId,
            });
          }
        } else {
          await createAgentTask({
            prompt: continuationPrompt,
            channel: 'web',
            backgroundJobId: jobId,
          });
        }
      }, delay);

      return;
    }
  }

  // Non-persistent or too many consecutive failures: finalize the job
  const finalStatus = anyFailed ? 'failed' : 'done';

  const completedAt = new Date();
  await useDrizzle()
    .update(backgroundJobs)
    .set({
      status: finalStatus,
      result: aggregatedResult,
      error: anyFailed ? 'One or more device tasks failed.' : null,
      completedAt,
      updatedAt: completedAt,
    })
    .where(eq(backgroundJobs.id, jobId));

  const brain = useBrain();
  await brain.events.emit('jobs', `job.${finalStatus}`, {
    jobId,
    result: aggregatedResult,
    error: anyFailed ? 'One or more device tasks failed.' : null,
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
 * Get all pending tasks (for CLI to pick up), optionally filtered by device.
 * Returns tasks targeting this device AND untagged tasks (deviceId IS NULL).
 */
export async function getPendingAgentTasks(deviceId?: string) {
  const drizzle = useDrizzle();
  if (deviceId) {
    // Tasks for this specific device OR untagged tasks
    const allPending = await drizzle
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.status, 'pending'));
    return allPending.filter(
      (t) => t.deviceId === null || t.deviceId === deviceId,
    );
  }
  return drizzle
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, 'pending'));
}

/**
 * Get all tasks, optionally filtered by status and/or device.
 * When deviceId is given, returns tasks targeting that device OR untagged tasks.
 */
export async function getAgentTasks(status?: string, deviceId?: string) {
  let rows: any[];
  if (status) {
    rows = await useDrizzle()
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.status, status as any));
  } else {
    rows = await useDrizzle().select().from(agentTasks);
  }

  if (deviceId) {
    rows = rows.filter((t) => t.deviceId === null || t.deviceId === deviceId);
  }

  return rows;
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

/**
 * Recover persistent device jobs that got stuck in 'running' state after a server restart.
 *
 * After a restart, the in-memory setTimeout for re-dispatch is gone. This function finds
 * all running persistent jobs with no active agent tasks and re-schedules their next cycle.
 * Called once on server startup.
 */
export async function recoverPersistentDeviceJobs(): Promise<void> {
  const allRunning = await useDrizzle()
    .select()
    .from(backgroundJobs)
    .where(
      and(
        eq(backgroundJobs.status, 'running'),
        eq(backgroundJobs.persistent, true),
      ),
    );

  const staleJobs = allRunning.filter((j) => j.deviceIds);
  if (!staleJobs.length) return;

  console.log(
    `[AgentTasks] Recovering ${staleJobs.length} persistent device job(s) after server restart`,
  );

  for (const job of staleJobs) {
    // Skip if there are already active tasks for this job
    const activeTasks = await useDrizzle()
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.backgroundJobId, job.id),
          inArray(agentTasks.status, ['pending', 'claimed', 'running']),
        ),
      );

    if (activeTasks.length > 0) {
      console.log(
        `[AgentTasks] Persistent job "${job.title}" (${job.id}) has ${activeTasks.length} active task(s) — skipping recovery`,
      );
      continue;
    }

    const deviceIds: string[] = job.deviceIds
      ? JSON.parse(job.deviceIds as string)
      : [];

    const recoveryPrompt = `[Persistent job — recovery after server restart]\n\nOriginal task:\n${job.prompt}\n\nThe server restarted and this persistent job needs to resume.\n\n⚠️ RECOVERY MODE — Do NOT recreate everything from scratch:\n1. Check if any daemon/watcher/process from this task is still running (pgrep, PID file, launchctl/systemctl status).\n2. If it IS running: report its status briefly and stop.\n3. If it has STOPPED: restart it ONLY using the original start command — do NOT recreate scripts or services from scratch.\n4. Write any logs to /tmp/ only — NEVER write log files inside the monitored folder (this causes infinite loops).`;

    // Delay 10s to let the server fully initialize before dispatching
    setTimeout(async () => {
      const [fresh] = await useDrizzle()
        .select()
        .from(backgroundJobs)
        .where(eq(backgroundJobs.id, job.id))
        .limit(1);

      if (!fresh || fresh.status === 'cancelled') return;

      if (deviceIds.length) {
        for (const deviceId of deviceIds) {
          await createAgentTask({
            prompt: recoveryPrompt,
            channel: 'web',
            deviceId,
            backgroundJobId: job.id,
          });
        }
      } else {
        await createAgentTask({
          prompt: recoveryPrompt,
          channel: 'web',
          backgroundJobId: job.id,
        });
      }
      console.log(
        `[AgentTasks] Recovered persistent job "${job.title}" (${job.id})`,
      );
    }, 10_000);
  }
}
